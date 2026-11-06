import { BALANCE } from './config/balance.ts';
import { effectiveGenes } from './economy.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import { GENE_BY_ID } from './config/genes.ts';
import { UPGRADE_BY_ID } from './config/upgrades.ts';
import type { GameState } from './state.ts';
import type { CreatureId, EraId, Effect, GeneEffect } from './types.ts';

/** Everything upgrades and genes change, flattened so hot paths read plain fields. */
export interface Mods {
  creatureMult: Record<CreatureId, number>;
  eraMult: Record<EraId, number>;
  globalMult: number;
  clickMult: number;
  clickPct: number;
  breeding: boolean;
  breedMult: number;
  tide: boolean;
  tideAmp: number;
  surgeDuration: number;
  surgeCooldown: number;
  autoSurge: boolean;
  autobuyUnlocked: Record<EraId, boolean>;
  startMoney: number;
  startQueens: number;
  ticketDiscount: number;
  genePower: number;
  startEra: EraId;
  /** 1 + effectiveGenes × genePower. */
  geneMult: number;
}

function baseMods(): Mods {
  return {
    creatureMult: Object.fromEntries(CREATURE_IDS.map((id) => [id, 1])) as Record<CreatureId, number>,
    eraMult: { 1: 1, 2: 1, 3: 1, 4: 1 },
    globalMult: 1,
    clickMult: 1,
    clickPct: 0,
    breeding: false,
    breedMult: 1,
    tide: false,
    tideAmp: BALANCE.tide.baseAmp,
    surgeDuration: BALANCE.tide.surgeDuration,
    surgeCooldown: BALANCE.tide.surgeCooldown,
    autoSurge: false,
    autobuyUnlocked: { 1: false, 2: false, 3: false, 4: false },
    startMoney: 0,
    startQueens: 0,
    ticketDiscount: 1,
    genePower: BALANCE.genes.power,
    startEra: 1,
    geneMult: 1,
  };
}

function applyEffect(m: Mods, e: Effect): void {
  switch (e.type) {
    case 'creatureMult':
      m.creatureMult[e.creature] *= e.x;
      break;
    case 'eraMult':
      m.eraMult[e.era] *= e.x;
      break;
    case 'globalMult':
      m.globalMult *= e.x;
      break;
    case 'clickMult':
      m.clickMult *= e.x;
      break;
    case 'clickPct':
      m.clickPct += e.add;
      break;
    case 'unlockBreeding':
      m.breeding = true;
      break;
    case 'breedMult':
      m.breedMult *= e.x;
      break;
    case 'unlockTide':
      m.tide = true;
      break;
    case 'tideAmp':
      m.tideAmp += e.add;
      break;
    case 'surgeDuration':
      m.surgeDuration += e.add;
      break;
    case 'surgeCooldownMult':
      m.surgeCooldown *= e.x;
      break;
    case 'unlockEra':
    case 'ending':
      // State transitions, handled when bought.
      break;
  }
}

function applyGeneEffect(m: Mods, e: GeneEffect): void {
  switch (e.type) {
    case 'clickMult':
      m.clickMult *= e.x;
      break;
    case 'startMoney':
      m.startMoney = Math.max(m.startMoney, e.amount);
      break;
    case 'autobuy':
      m.autobuyUnlocked[e.era] = true;
      break;
    case 'startQueens':
      m.startQueens += e.n;
      break;
    case 'breedMult':
      m.breedMult *= e.x;
      break;
    case 'tideAmp':
      m.tideAmp += e.add;
      break;
    case 'autoSurge':
      m.autoSurge = true;
      break;
    case 'ticketDiscount':
      m.ticketDiscount *= e.x;
      break;
    case 'genePower':
      m.genePower += e.add;
      break;
    case 'startEra':
      m.startEra = Math.max(m.startEra, e.era) as EraId;
      break;
    case 'globalMult':
      m.globalMult *= e.x;
      break;
  }
}

export function computeMods(state: GameState): Mods {
  const m = baseMods();
  for (const [id, level] of Object.entries(state.geneLevels)) {
    const def = GENE_BY_ID[id];
    if (!def) continue;
    for (let i = 0; i < level && i < def.levels.length; i++) {
      for (const e of def.levels[i]!.effects) applyGeneEffect(m, e);
    }
  }
  for (const id of Object.keys(state.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (!def) continue;
    for (const e of def.effects) applyEffect(m, e);
  }
  m.geneMult = 1 + effectiveGenes(state.genes) * m.genePower;
  return m;
}
