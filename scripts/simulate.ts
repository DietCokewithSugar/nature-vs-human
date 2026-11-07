/**
 * Headless balance simulation. A bot plays whole runs with the real logic core
 * and reports when eras open, when the humans strike back, and how the run ends.
 *
 *   npm run sim
 */
import {
  BALANCE,
  CREATURES,
  Game,
  SKILLS,
  computeMods,
  createState,
  creatureCost,
  incomePerSec,
  skillStatus,
  type ActiveId,
  type Difficulty,
  type GameState,
  type RouteId,
} from '../src/core/index.ts';

export interface BotProfile {
  name: string;
  /** Clicks per second as a function of run time (s). */
  cps: (t: number) => number;
  /** Seconds between shopping sessions. */
  checkEvery: number;
  /** Uses active skills when ready. */
  actives: boolean;
  /** Buys anti-research and anti-taming skills when it can. */
  defends: boolean;
  /** Drives off raids: 'always' every second, 'check' only when it looks at the page. */
  repels: 'always' | 'check';
}

export const PROFILES: BotProfile[] = [
  { name: 'engaged', cps: (t) => (t < 120 ? 6 : 1), checkEvery: 0, actives: true, defends: true, repels: 'always' },
  { name: 'casual', cps: (t) => (t < 90 ? 3 : 0.3), checkEvery: 45, actives: true, defends: true, repels: 'check' },
  { name: 'idle', cps: (t) => (t < 60 ? 3 : 0), checkEvery: 180, actives: false, defends: false, repels: 'check' },
];

export interface RunLog {
  profile: string;
  difficulty: Difficulty;
  won: boolean;
  time: number;
  eras: Record<number, number | null>;
  countermeasures: { t: number; cls: string }[];
  defected: { t: number; id: string }[];
  raids: { landed: number; repelled: number };
  disasters: { t: number; id: string }[];
  research: number;
  progress: number;
  points: number;
  samples: { t: number; earned: number; research: number }[];
}

const DEFENSIVE = new Set([
  'ge_night',
  'ge_disguise',
  'ge_wipe',
  'hu_wild',
  'hu_rescue',
  'ge_sabotage',
  'ge_burrows',
  'as_resist',
  'tk_hide',
]);

function incomeWith(game: Game, apply: () => void, revert: () => void): number {
  apply();
  const v = incomePerSec(game.state.run, computeMods(game.state)).toNumber();
  revert();
  return v;
}

/** Fixed weather per run so reports are reproducible. */
export const SEED = 20261107;

export function simulate(
  profile: BotProfile,
  difficulty: Difficulty = 'normal',
  route: RouteId = 'beasts',
  state?: GameState,
  seed: number = SEED,
): RunLog {
  const base = state ?? createState();
  // Simulate every difficulty without having to win the earlier ones first.
  base.meta.wins = { normal: 1, hard: 1, brutal: 1 };
  const game = new Game(base);
  if (!game.startRun(route, difficulty, seed)) throw new Error(`cannot start ${route}/${difficulty}`);
  const log: RunLog = {
    profile: profile.name,
    difficulty,
    won: false,
    time: 0,
    eras: { 1: 0, 2: null, 3: null, 4: null },
    countermeasures: [],
    defected: [],
    raids: { landed: 0, repelled: 0 },
    disasters: [],
    research: 0,
    progress: 0,
    points: 0,
    samples: [],
  };
  game.on((e) => {
    const t = game.run.time;
    if (e.type === 'eraUnlocked') log.eras[e.era] = t;
    if (e.type === 'countermeasure') log.countermeasures.push({ t, cls: e.cm.cls });
    if (e.type === 'defected') log.defected.push({ t, id: e.id });
    if (e.type === 'raidLanded') log.raids.landed++;
    if (e.type === 'raidRepelled') log.raids.repelled++;
    if (e.type === 'disasterStarted') log.disasters.push({ t, id: e.id });
  });

  let nextCheck = 0;
  let nextSample = 0;
  const run = () => game.run;

  while (game.running && run().time < 4 * 3600) {
    const step = 1;
    const r = run();
    const clicks = profile.cps(r.time) * step;
    for (let i = 0; i < Math.min(clicks, 6); i++) game.click();

    if (profile.actives) for (const id of ['surge', 'rescue', 'rampage', 'sabotage'] as ActiveId[]) {
      if (id === 'rescue' && Object.values(r.taming).every((v) => (v ?? 0) < 0.3)) continue;
      game.activate(id);
    }

    if (profile.repels === 'always' || r.time >= nextCheck) game.repel();

    if (r.time >= nextCheck) {
      nextCheck = r.time + profile.checkEvery;
      for (let guard = 0; guard < 300; guard++) {
        const income = Math.max(game.income().toNumber(), 1e-9);
        const money = r.money.toNumber();
        // Era tickets first.
        const ticket = game.availableUpgrades().find((u) => u.kind === 'era' && game.upgradeCost(u.id).toNumber() <= money);
        if (ticket) {
          game.buyUpgrade(ticket.id);
          continue;
        }
        // Defensive and mechanic skills when cheap enough.
        const mods = game.mods;
        const urgent = SKILLS.find((s) => {
          if (skillStatus(r, mods, s) !== 'available' || s.fork?.side === 'B') return false;
          const cost = game.skillCost(s.id).toNumber();
          const mechanic = s.effects.some((e) => ['unlockBreeding', 'unlockTide', 'unlockActive', 'convert'].includes(e.type));
          const defensive = profile.defends && DEFENSIVE.has(s.id);
          return (mechanic || defensive) && cost <= money * 0.6;
        });
        if (urgent) {
          game.buySkill(urgent.id);
          continue;
        }
        if (game.mods.breeding && game.nestCost().toNumber() <= money * 0.05) {
          game.buyNest();
          continue;
        }
        let best: { cost: number; act: () => void; score: number } | null = null;
        const consider = (cost: number, gain: number, act: () => void) => {
          if (!(gain > 0)) return;
          const score = Math.max(0, (cost - money) / income) + cost / gain;
          if (!best || score < best.score) best = { cost, act, score };
        };
        for (const c of CREATURES) {
          if (c.era > r.era || r.defected[c.id] !== undefined) continue;
          const cost = creatureCost(c.id, r.creatures[c.id].bought).toNumber();
          const cs = r.creatures[c.id];
          consider(cost, incomeWith(game, () => cs.bought++, () => cs.bought--) - income, () => game.buyCreature(c.id, 1));
        }
        for (const u of game.availableUpgrades()) {
          if (u.kind === 'era') continue;
          consider(u.cost, incomeWith(game, () => (r.upgrades[u.id] = true), () => delete r.upgrades[u.id]) - income, () =>
            game.buyUpgrade(u.id),
          );
        }
        for (const s of SKILLS) {
          if (skillStatus(r, mods, s) !== 'available' || s.fork?.side === 'B') continue;
          const gain = s.effects.some((e) => e.type === 'clickPct' || e.type === 'clickMult')
            ? income * 0.03
            : incomeWith(game, () => (r.skills[s.id] = true), () => delete r.skills[s.id]) - income;
          consider(s.cost, gain, () => game.buySkill(s.id));
        }
        const pick = best as { cost: number; act: () => void } | null;
        if (!pick || pick.cost > money) break;
        pick.act();
      }
    }

    game.advance(step);
    if (r.time >= nextSample) {
      log.samples.push({ t: r.time, earned: r.earned.gt(0) ? r.earned.log10() : 0, research: r.research });
      nextSample += 30;
    }
  }
  const r = run();
  log.won = r.result?.won ?? false;
  log.time = r.time;
  log.research = r.research;
  log.progress = game.billProgress();
  log.points = r.result?.points ?? 0;
  return log;
}

function m(t: number | null): string {
  return t === null ? '—' : `${(t / 60).toFixed(1)}m`;
}

function main() {
  const diffs = (process.argv.find((a) => a.startsWith('--diff='))?.slice(7).split(',') ?? ['normal']) as Difficulty[];
  for (const d of diffs) {
    for (const p of PROFILES) {
      const r = simulate(p, d);
      console.log(
        `${d.padEnd(6)} ${p.name.padEnd(8)} ${r.won ? 'WIN ' : 'LOSE'} ${m(r.time).padStart(6)} | 古代 ${m(r.eras[2] ?? null)} 工业 ${m(r.eras[3] ?? null)} 现代 ${m(r.eras[4] ?? null)} | 研究 ${(r.research * 100).toFixed(0)}% 账单 ${(r.progress * 100).toFixed(0)}% | 反制 ${r.countermeasures.map((c) => `${c.cls}@${m(c.t)}`).join(' ')} | 跳反 ${r.defected.map((x) => `${x.id}@${m(x.t)}`).join(' ') || '无'} | 端老窝 ${r.raids.landed}/${r.raids.landed + r.raids.repelled} | 灾难 ${r.disasters.map((x) => `${x.id}@${m(x.t)}`).join(' ')} | +${r.points}点`,
      );
    }
  }
  void BALANCE;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
