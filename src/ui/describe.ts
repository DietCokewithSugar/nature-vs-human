import {
  CLASSES,
  CREATURE_BY_ID,
  ROUTES,
  SKILL_BY_ID,
  formatMoney,
  type Effect,
  type MetaEffect,
  type Requirement,
} from '../core/index.ts';
import { COPY, eraName } from './copy.ts';

const E = COPY.effects;
const x = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 100);

/** One short line per effect, e.g. "刺客 ×2". */
export function describeEffect(e: Effect): string | null {
  switch (e.type) {
    case 'creatureMult':
      return E.creatureMult(CREATURE_BY_ID[e.creature].name, x(e.x));
    case 'classMult':
      return E.classMult(CLASSES[e.cls].name, x(e.x));
    case 'globalMult':
      return E.globalMult(x(e.x));
    case 'classResist':
      return E.classResist(CLASSES[e.cls].name, pct(e.add));
    case 'clickMult':
      return E.clickMult(x(e.x));
    case 'clickPct':
      return E.clickPct(pct(e.add));
    case 'researchMult':
      return E.researchMult(pct(e.x - 1));
    case 'domesticationMult':
      return E.domesticationMult(pct(1 - e.x));
    case 'unlockBreeding':
      return E.unlockBreeding;
    case 'breedMult':
      return E.breedMult(x(e.x));
    case 'unlockTide':
      return E.unlockTide;
    case 'tideAmp':
      return E.tideAmp(pct(e.add));
    case 'surgeDuration':
      return E.surgeDuration(e.add);
    case 'surgeCooldownMult':
      return E.surgeCooldownMult(pct(1 - e.x));
    case 'unlockActive':
      return E.unlockActive(COPY.actives[e.id]);
    case 'convert':
      return E.convert(CREATURE_BY_ID[e.from].name, CREATURE_BY_ID[e.to].name);
    case 'unlockEra':
      return null;
  }
}

export function describeEffects(effects: Effect[]): string {
  return effects
    .map(describeEffect)
    .filter((s): s is string => !!s)
    .join(' · ');
}

export function describeMeta(e: MetaEffect): string {
  switch (e.type) {
    case 'globalMult':
      return E.globalMult(x(e.x));
    case 'researchMult':
      return E.researchMult(pct(e.x - 1));
    case 'domesticationMult':
      return E.domesticationMult(pct(1 - e.x));
    case 'startMoney':
      return E.startMoney(formatMoney(e.amount));
    case 'unlockFork':
      return E.unlockFork;
    case 'unlockRoute':
      return E.unlockRoute(ROUTES[e.route].name);
  }
}

/** The first unmet requirement, in a few words. */
export function describeNeed(r: Requirement): string {
  const N = COPY.skills.need;
  switch (r.type) {
    case 'era':
      return N.era(eraName(r.era));
    case 'owned':
      return N.owned(CREATURE_BY_ID[r.creature].name, r.n);
    case 'skill':
      return N.skill(SKILL_BY_ID[r.id]?.name ?? '');
    case 'fork':
      return N.fork;
    case 'runEarned':
      return N.earned;
    case 'upgrade':
    case 'notDefected':
      return '';
  }
}
