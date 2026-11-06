import { CREATURE_BY_ID, formatMoney, type Effect, type GeneEffect } from '../core/index.ts';
import { COPY, eraName } from './copy.ts';

const E = COPY.effects;

function x(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One short line per effect, e.g. "蚂蚁 ×2". */
export function describeEffect(e: Effect): string | null {
  switch (e.type) {
    case 'creatureMult':
      return E.creatureMult(CREATURE_BY_ID[e.creature].name, x(e.x));
    case 'eraMult':
      return E.eraMult(eraName(e.era), x(e.x));
    case 'globalMult':
      return E.globalMult(x(e.x));
    case 'clickMult':
      return E.clickMult(x(e.x));
    case 'clickPct':
      return E.clickPct(Math.round(e.add * 100));
    case 'unlockBreeding':
      return E.unlockBreeding;
    case 'breedMult':
      return E.breedMult(x(e.x));
    case 'unlockTide':
      return E.unlockTide;
    case 'tideAmp':
      return E.tideAmp(Math.round(e.add * 100));
    case 'surgeDuration':
      return E.surgeDuration(e.add);
    case 'surgeCooldownMult':
      return E.surgeCooldownMult(Math.round((1 - e.x) * 100));
    case 'unlockEra':
    case 'ending':
      return null;
  }
}

export function describeGene(e: GeneEffect): string {
  switch (e.type) {
    case 'clickMult':
      return E.clickMult(x(e.x));
    case 'startMoney':
      return E.startMoney(formatMoney(e.amount));
    case 'autobuy':
      return E.autobuy(eraName(e.era));
    case 'startQueens':
      return E.startQueens(e.n);
    case 'breedMult':
      return E.breedMult(x(e.x));
    case 'tideAmp':
      return E.tideAmp(Math.round(e.add * 100));
    case 'autoSurge':
      return E.autoSurge;
    case 'ticketDiscount':
      return E.ticketDiscount(Math.round((1 - e.x) * 100));
    case 'genePower':
      return E.genePower(Math.round(e.add * 100));
    case 'startEra':
      return E.startEra(eraName(e.era));
    case 'globalMult':
      return E.globalMult(x(e.x));
  }
}

export function describeEffects(effects: Effect[]): string {
  return effects
    .map(describeEffect)
    .filter((s): s is string => !!s)
    .join(' · ');
}
