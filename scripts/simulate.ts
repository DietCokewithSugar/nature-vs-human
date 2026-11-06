/**
 * Headless balance simulation. Plays the real logic core with a greedy bot and
 * reports when each era opens, when the bot evolves and when the ending lands.
 *
 *   npm run sim                 # summary to stdout
 *   npm run sim -- --write      # also writes docs/balance-sim.json
 */
import { writeFileSync } from 'node:fs';
import {
  CREATURES,
  GENE_BY_ID,
  Game,
  creatureCost,
  genesFree,
  geneLevel,
  geneUnlocked,
  incomePerSec,
  computeMods,
  type CreatureId,
  type Decimal,
  type UpgradeDef,
} from '../src/core/index.ts';

export interface BotProfile {
  name: string;
  /** Clicks per second as a function of run time (s). */
  cps: (runTime: number) => number;
  /** Fraction of surges actually triggered by hand before 潮汐自律. */
  surgeUse: number;
  /** Evolve when the gene multiplier would grow by at least this factor. */
  evolveRatio: number;
  /** ...or by this smaller factor once the run has stalled for `stallSeconds`. */
  stallRatio: number;
  stallSeconds: number;
  /** Seconds between shopping sessions (a player who only checks in now and then). */
  checkEvery: number;
  /** Evolve once genes-per-hour of this run falls below this fraction of its peak. */
  ratePeak?: number;
}

export const PROFILES: BotProfile[] = [
  {
    name: 'engaged',
    cps: (t) => (t < 180 ? 6 : 1),
    surgeUse: 1,
    evolveRatio: 2.2,
    stallRatio: 1.4,
    stallSeconds: 900,
    checkEvery: 0,
    ratePeak: 0.85,
  },
  {
    name: 'casual',
    cps: (t) => (t < 120 ? 3 : 0.2),
    surgeUse: 0.3,
    evolveRatio: 3,
    stallRatio: 1.6,
    stallSeconds: 1800,
    checkEvery: 60,
  },
  {
    name: 'idle',
    cps: (t) => (t < 60 ? 3 : 0),
    surgeUse: 0.1,
    evolveRatio: 3,
    stallRatio: 2,
    stallSeconds: 3600,
    checkEvery: 300,
  },
];

const GENE_PRIORITY = [
  'muscle', 'select', 'headstart', 'auto1', 'queen', 'moon', 'auto2', 'autosurge', 'select',
  'mutation', 'ticket', 'headstart', 'memory', 'auto3', 'select', 'mutation', 'auto4', 'headstart',
  'memory', 'select', 'mutation',
];

interface Sample {
  t: number;
  lifetime: number;
  income: number;
  era: number;
  genes: number;
}

export interface SimResult {
  profile: string;
  eraFirst: Record<number, number | null>;
  evolutions: { t: number; runTime: number; gained: number; genes: number; era: number }[];
  endedAt: number | null;
  samples: Sample[];
  finalLifetimeLog10: number;
}

function log10(d: Decimal): number {
  return d.gt(0) ? d.log10() : 0;
}

function incomeWith(game: Game, apply: () => void, revert: () => void): number {
  apply();
  const mods = computeMods(game.state);
  const v = incomePerSec(game.state, mods).toNumber();
  revert();
  return v;
}

function creatureGain(game: Game, id: CreatureId, base: number): number {
  const c = game.state.creatures[id];
  return incomeWith(
    game,
    () => {
      c.bought += 1;
    },
    () => {
      c.bought -= 1;
    },
  ) - base;
}

function upgradeGain(game: Game, u: UpgradeDef, base: number): number {
  return incomeWith(
    game,
    () => {
      game.state.upgrades[u.id] = true;
    },
    () => {
      delete game.state.upgrades[u.id];
    },
  ) - base;
}

const PRIORITY_KINDS = new Set(['era', 'breeding', 'tide', 'ending']);

export function simulate(profile: BotProfile, maxHours = 30): SimResult {
  const game = new Game();
  const s = game.state;
  const result: SimResult = {
    profile: profile.name,
    eraFirst: { 1: 0, 2: null, 3: null, 4: null },
    evolutions: [],
    endedAt: null,
    samples: [],
    finalLifetimeLog10: 0,
  };
  game.on((e) => {
    if (e.type === 'eraUnlocked' && e.first) result.eraFirst[e.era] = s.playTime;
    if (e.type === 'ending') result.endedAt = s.playTime;
  });

  let lastPurchase = 0;
  let nextSample = 0;
  let surgeToggle = 0;
  let nextCheck = 0;
  let peakRate = 0;
  const limit = maxHours * 3600;

  while (s.playTime < limit) {
    const step = s.runTime < 900 ? 1 : 4;

    // Clicks
    const clicks = profile.cps(s.runTime) * step;
    if (clicks > 0) {
      const v = game.clickValue();
      s.money = s.money.add(v.mul(clicks));
      s.runEarned = s.runEarned.add(v.mul(clicks));
      s.lifetimeEarned = s.lifetimeEarned.add(v.mul(clicks));
      s.clicks += clicks;
    }

    // Surges by hand
    if (game.mods.tide && !game.mods.autoSurge && s.tide.cooldownLeft <= 0 && s.tide.surgeLeft <= 0) {
      surgeToggle += profile.surgeUse;
      if (surgeToggle >= 1) {
        surgeToggle -= 1;
        game.surge();
      } else {
        s.tide.cooldownLeft = game.mods.surgeCooldown; // a missed window
      }
    }

    // Purchases
    const shopping = s.runTime < 600 || s.playTime >= nextCheck;
    if (shopping) nextCheck = s.playTime + profile.checkEvery;
    for (let guard = 0; shopping && guard < 200; guard++) {
      const income = Math.max(game.income().toNumber(), 1e-9);
      const money = s.money.toNumber();
      const ups = game.availableUpgrades();

      const urgent = ups.find((u) => PRIORITY_KINDS.has(u.kind) && game.upgradeCost(u.id).lte(s.money));
      if (urgent) {
        game.buyUpgrade(urgent.id);
        lastPurchase = s.playTime;
        continue;
      }
      if (game.mods.breeding && game.queenCost().lte(s.money.mul(0.02))) {
        game.buyQueen();
        continue;
      }

      let best: { cost: number; act: () => void; score: number } | null = null;
      const consider = (cost: number, gain: number, act: () => void) => {
        if (!(gain > 0)) return;
        const score = Math.max(0, (cost - money) / income) + cost / gain;
        if (!best || score < best.score) best = { cost, act, score };
      };
      for (const c of CREATURES) {
        if (c.era > s.era) continue;
        const cost = creatureCost(c.id, s.creatures[c.id].bought).toNumber();
        consider(cost, creatureGain(game, c.id, income), () => game.buyCreature(c.id, 1));
      }
      for (const u of ups) {
        if (PRIORITY_KINDS.has(u.kind)) continue;
        const cost = game.upgradeCost(u.id).toNumber();
        const gain = u.kind === 'click' ? income * 0.02 : upgradeGain(game, u, income);
        consider(cost, gain, () => game.buyUpgrade(u.id));
      }
      const pick = best as { cost: number; act: () => void; score: number } | null;
      if (!pick || pick.cost > money) break;
      pick.act();
      lastPurchase = s.playTime;
    }

    game.advance(step);

    // Evolution
    const gain = game.genesOnEvolve();
    if (gain >= 1 && s.runTime > 600) {
      const power = game.mods.genePower;
      const ratio = (1 + (s.genes + gain) * power) / (1 + s.genes * power);
      const stalled = s.playTime - lastPurchase > profile.stallSeconds;
      const rate = gain / s.runTime;
      peakRate = Math.max(peakRate, rate);
      const byRate = profile.ratePeak !== undefined && ratio >= 1.3 && rate < peakRate * profile.ratePeak;
      const byRatio = profile.ratePeak === undefined && ratio >= profile.evolveRatio;
      if (byRate || byRatio || (stalled && ratio >= profile.stallRatio)) {
        peakRate = 0;
        const era = s.era;
        const runTime = s.runTime;
        game.evolve();
        result.evolutions.push({ t: s.playTime, runTime, gained: gain, genes: s.genes, era });
        for (let pass = 0; pass < 40; pass++) {
          const id = GENE_PRIORITY.find((g) => {
            const def = GENE_BY_ID[g];
            if (!def || !geneUnlocked(s, def)) return false;
            const next = def.levels[geneLevel(s, g)];
            return !!next && next.cost <= genesFree(s);
          });
          if (!id) break;
          game.buyGene(id);
        }
        lastPurchase = s.playTime;
      }
    }

    if (s.playTime >= nextSample) {
      result.samples.push({
        t: s.playTime,
        lifetime: log10(s.lifetimeEarned),
        income: log10(game.income()),
        era: s.era,
        genes: s.genes,
      });
      nextSample += 120;
    }
    if (result.endedAt !== null && s.playTime > result.endedAt + 600) break;
  }
  result.finalLifetimeLog10 = log10(s.lifetimeEarned);
  return result;
}

function h(t: number | null): string {
  if (t === null) return '—';
  const hours = t / 3600;
  return hours < 1 ? `${Math.round(t / 60)} 分钟` : `${hours.toFixed(1)} 小时`;
}

function main() {
  const write = process.argv.includes('--write');
  const results = PROFILES.map((p) => simulate(p));
  for (const r of results) {
    console.log(`\n=== ${r.profile} ===`);
    console.log(
      `海啸 ${h(r.eraFirst[2] ?? null)} | 兽群 ${h(r.eraFirst[3] ?? null)} | 远古 ${h(r.eraFirst[4] ?? null)} | 结局 ${h(r.endedAt)}`,
    );
    for (const e of r.evolutions) {
      console.log(
        `  进化 @${h(e.t)}  本轮 ${h(e.runTime)}  时代 ${e.era}  +${e.gained} 基因 → ${e.genes}`,
      );
    }
    console.log(`  累计破坏 1e${r.finalLifetimeLog10.toFixed(1)}`);
  }
  if (write) {
    writeFileSync(new URL('../docs/balance-sim.json', import.meta.url), JSON.stringify(results, null, 1));
    console.log('\nwrote docs/balance-sim.json');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
