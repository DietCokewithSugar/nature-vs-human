/**
 * Headless balance simulation. Bots play whole runs with the real logic core and report
 * how the ground changes hands, when the humans reach each era, and how the run ends.
 *
 *   npm run sim
 */
import {
  BALANCE,
  BUILDINGS,
  Game,
  NATURE_BUILDINGS,
  SKILLS,
  UNITS,
  createState,
  skillStatus,
  type ActiveId,
  type Difficulty,
  type EraId,
  type GameState,
  type NatureBuildingId,
  type RouteId,
} from '../src/core/index.ts';

export interface BotProfile {
  name: string;
  /** Seconds between looks at the page (shopping, tapping the bubbles on screen). */
  checkEvery: number;
  /** Taps bubbles: every second while it plays ('always'), or only when it looks ('check'), or never. */
  taps: 'always' | 'check' | 'never';
  /** Uses active skills when ready. */
  actives: boolean;
}

export const PROFILES: BotProfile[] = [
  { name: 'engaged', checkEvery: 5, taps: 'always', actives: true },
  { name: 'casual', checkEvery: 45, taps: 'check', actives: true },
  { name: 'idle', checkEvery: 180, taps: 'never', actives: false },
];

export const PROFILE_NOTES: Record<string, string> = {
  engaged: '投入型：常驻页面，元泡泡一冒就点，每 5 秒看一眼商店，用主动技能',
  casual: '休闲型：每 45 秒看一次，看的时候点掉屏幕上的元泡泡，用主动技能',
  idle: '挂机型：每 3 分钟看一次，只买建筑、升级和技能，不点泡泡，不用主动技能',
};

export interface Sample {
  t: number;
  nature: number;
  human: number;
  research: number;
}

export interface RunSummary {
  profile: string;
  difficulty: Difficulty;
  won: boolean;
  time: number;
  /** Seconds at which the humans reached each era. */
  eras: Partial<Record<EraId, number>>;
  best: number;
  final: number;
  research: number;
  built: number;
  wrecked: number;
  razed: number;
  kills: number;
  lost: number;
  aged: number;
  captured: number;
  bubbles: number;
  defected: string[];
  countermeasures: { cls: string; at: number }[];
  points: number;
  samples: Sample[];
}

const SKILL_ORDER = [
  'ge_pollinate', 'as_swarm', 'hu_wild', 'ge_regen', 'ge_quiet', 'tk_hide', 'hu_pack', 'ge_bubbles', 'as_tunnel', 'ge_wild',
  'sw_breed', 'sw_plague', 'ge_spread', 'ge_burrows', 'hu_rescue', 'tk_rampage', 'ma_tide', 'ge_sabotage', 'as_resist',
  'hu_alpha', 'tk_armor', 'ge_flowers', 'ge_bats', 'sw_fertile', 'ma_surge', 'ma_deep', 'ge_long', 'tk_long', 'as_virus',
  'sw_cloud', 'ge_overgrow', 'ma_amp', 'hu_fang', 'tk_tusk', 'as_chain', 'hu_apex', 'ma_storm',
];

/** What the bot reaches for: a mix of cheap swarms and bigger hitters, pollinators once open. */
function shop(g: Game): boolean {
  const run = g.run;
  let acted = false;
  // Skills first while they are cheap relative to what is in hand.
  for (const id of SKILL_ORDER) {
    const s = SKILLS.find((x) => x.id === id);
    if (!s || skillStatus(run, g.mods, s) !== 'available') continue;
    if (s.cost <= run.essence * 0.6) acted = g.buySkill(id) || acted;
  }
  // Buildings while there is room.
  for (let guard = 0; guard < 6; guard++) {
    if (g.buildingCount() >= g.buildingCap()) break;
    const open = NATURE_BUILDINGS.filter((k) => g.kindOpen(k));
    const counts = new Map<string, number>();
    for (const b of run.buildings) if (b.side === 'nature') counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
    const pollinators = run.buildings.filter((b) => b.side === 'nature' && BUILDINGS[b.kind].spawns.some((s) => UNITS[s.unit].role === 'collect')).length;
    const wants = open
      .filter((k) => {
        const def = BUILDINGS[k];
        const pollinator = def.spawns.some((s) => UNITS[s.unit].role === 'collect');
        if (pollinator) return pollinators < 1 + run.era;
        return (counts.get(k) ?? 0) < 1 + run.era;
      })
      .sort((a, b) => BUILDINGS[b].cost - BUILDINGS[a].cost);
    let placed = false;
    for (const k of wants) {
      if (g.buildingCost(k) > run.essence) continue;
      const cell = g.autoSite(k as NatureBuildingId);
      if (cell >= 0 && g.place(k, cell)) {
        placed = true;
        acted = true;
        break;
      }
    }
    if (!placed) break;
  }
  // Upgrades with what is left.
  const mine = run.buildings.filter((b) => b.side === 'nature' && b.build >= 1);
  mine.sort((a, b) => (g.upgradeCost(a.id) ?? Infinity) - (g.upgradeCost(b.id) ?? Infinity));
  for (const b of mine) {
    const c = g.upgradeCost(b.id);
    if (c !== null && c <= run.essence * 0.7) acted = g.upgrade(b.id) || acted;
  }
  return acted;
}

function useActives(g: Game): void {
  for (const id of ['rampage', 'rescue', 'sabotage', 'surge'] as ActiveId[]) {
    if (g.cooldown(id) > 0 || !g.mods.actives[id]) continue;
    if (id === 'rescue' && !Object.values(g.run.taming).some((v) => (v ?? 0) > 0.3)) continue;
    g.activate(id);
  }
}

export interface BotOptions {
  difficulty?: Difficulty;
  route?: RouteId;
  meta?: Record<string, number>;
  seed?: number;
  /** Stop after this many seconds. */
  limit?: number;
  step?: number;
}

export function runBot(profile: BotProfile, opts: BotOptions = {}): RunSummary {
  const difficulty = opts.difficulty ?? 'normal';
  const state: GameState = createState();
  state.meta.levels = { ...(opts.meta ?? {}) };
  state.meta.wins = { normal: 9, hard: 9, brutal: 0 };
  const g = new Game(state);
  g.startRun(opts.route ?? 'beasts', difficulty, opts.seed ?? 20261108);
  const eras: Partial<Record<EraId, number>> = { 1: 0 };
  g.on((e) => {
    if (e.type === 'eraUnlocked') eras[e.era] = g.run.time;
  });
  const limit = opts.limit ?? 120 * 60;
  const step = opts.step ?? 0.2;
  const samples: Sample[] = [];
  let nextCheck = 0;
  let nextSample = 0;
  while (g.running && g.run.time < limit) {
    g.advance(1, step);
    const t = g.run.time;
    if (profile.taps === 'always') for (const b of [...g.run.bubbles]) g.collect(b.id);
    if (t >= nextCheck) {
      nextCheck = t + profile.checkEvery;
      if (profile.taps === 'check') for (const b of [...g.run.bubbles]) g.collect(b.id);
      shop(g);
      if (profile.actives) useActives(g);
    }
    if (t >= nextSample) {
      nextSample = t + 30;
      const s = g.shares();
      samples.push({ t, nature: s.nature, human: s.human, research: g.run.research });
    }
  }
  const run = g.run;
  const s = g.shares();
  return {
    profile: profile.name,
    difficulty,
    won: run.result?.won ?? false,
    time: run.time,
    eras,
    best: run.best,
    final: s.nature,
    research: run.research,
    built: run.stats.built,
    wrecked: run.stats.wrecked,
    razed: run.stats.razed,
    kills: run.stats.kills,
    lost: run.stats.lost,
    aged: run.stats.aged,
    captured: run.stats.captured,
    bubbles: run.stats.bubbles,
    defected: Object.keys(run.defected),
    countermeasures: run.countermeasures.map((c) => ({ cls: c.cls, at: c.at })),
    points: run.result?.points ?? 0,
    samples,
  };
}

const m = (s: number) => `${Math.round(s / 60)}m`;

export function describe(r: RunSummary): string {
  const eras = ([2, 3, 4] as EraId[]).map((e) => (r.eras[e] !== undefined ? m(r.eras[e]!) : '—')).join('/');
  return `${r.profile.padEnd(8)} ${r.difficulty.padEnd(6)} ${r.won ? 'WIN ' : 'LOSE'} ${m(r.time).padStart(4)}  eras ${eras.padEnd(12)} best ${(r.best * 100).toFixed(0)}% end ${(r.final * 100).toFixed(0)}% research ${r.research.toFixed(2)} built ${r.built} wrecked ${r.wrecked} razed ${r.razed} kills ${r.kills} lost ${r.lost} aged ${r.aged} captured ${r.captured} bubbles ${r.bubbles} defected ${r.defected.join(',') || '-'}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // npm run sim -- [profile|all] [difficulty,…] [seeds]
  const which = process.argv[2];
  const diffs = (process.argv[3]?.split(',') ?? ['normal']) as Difficulty[];
  const seeds = Number(process.argv[4] ?? 1);
  const t0 = Date.now();
  for (const d of diffs) {
    for (const p of PROFILES) {
      if (which && which !== 'all' && which !== p.name) continue;
      const runs: RunSummary[] = [];
      for (let i = 0; i < seeds; i++) {
        const r = runBot(p, { difficulty: d, seed: 20261108 + i * 7919 });
        runs.push(r);
        if (seeds <= 3) console.log(describe(r));
      }
      if (seeds > 1) {
        const wins = runs.filter((r) => r.won);
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
        console.log(
          `${p.name.padEnd(8)} ${d.padEnd(6)} wins ${wins.length}/${runs.length}  win time ${m(avg(wins.map((r) => r.time)))}  loss time ${m(avg(runs.filter((r) => !r.won).map((r) => r.time)))}  best ${(avg(runs.map((r) => r.best)) * 100).toFixed(0)}%  era4 at ${m(avg(runs.filter((r) => r.eras[4] !== undefined).map((r) => r.eras[4]!)))}`,
        );
      }
    }
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s, day ${BALANCE.day} s)`);
}
