import {
  BUILDINGS,
  CLASSES,
  type BuildingDef,
  type UnitDef,
  ROUTES,
  SKILL_BY_ID,
  UNITS,
  formatNumber,
  type Effect,
  type MetaEffect,
  type Requirement,
} from '../core/index.ts';
import { COPY, eraName } from './copy.ts';

const E = COPY.effects;
const x = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 100);

/** One short line per effect, e.g. "刺客攻击 ×2". */
export function describeEffect(e: Effect): string {
  switch (e.type) {
    case 'classAtk':
      return E.classAtk(CLASSES[e.cls].name, x(e.x));
    case 'globalAtk':
      return E.globalAtk(x(e.x));
    case 'classHp':
      return E.classHp(CLASSES[e.cls].name, x(e.x));
    case 'globalHp':
      return E.globalHp(x(e.x));
    case 'classLife':
      return E.classLife(CLASSES[e.cls].name, x(e.x));
    case 'globalLife':
      return E.globalLife(x(e.x));
    case 'classResist':
      return E.classResist(CLASSES[e.cls].name, pct(e.add));
    case 'convertMult':
      return E.convertMult(x(e.x));
    case 'productionMult':
      return E.productionMult(x(e.x));
    case 'regenMult':
      return E.regenMult(x(e.x));
    case 'bubbleMult':
      return E.bubbleMult(x(e.x));
    case 'bubbleRate':
      return E.bubbleRate(x(e.x));
    case 'incomeMult':
      return E.incomeMult(x(e.x));
    case 'researchMult':
      return E.researchMult(pct(e.x - 1));
    case 'domesticationMult':
      return E.domesticationMult(pct(1 - e.x));
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
    case 'unlockBuilding':
      return E.unlockBuilding(BUILDINGS[e.id].name);
    case 'enemyGround':
      return E.enemyGround(BUILDINGS[e.id].name);
    case 'capAdd':
      return E.capAdd(e.add);
    case 'wildBuildMult':
      return E.wildBuildMult(x(e.x));
    case 'spread':
      return E.spread;
    case 'convert':
      return E.convert(UNITS[e.from].name, UNITS[e.to].name);
    case 'swarmBatch':
      return E.swarmBatch(e.add);
  }
}

export function describeEffects(effects: Effect[]): string {
  return effects.map(describeEffect).join(' · ');
}

export function describeMeta(e: MetaEffect): string {
  switch (e.type) {
    case 'productionMult':
      return E.productionMult(x(e.x));
    case 'globalLife':
      return E.globalLife(x(e.x));
    case 'researchMult':
      return E.researchMult(pct(e.x - 1));
    case 'domesticationMult':
      return E.domesticationMult(pct(1 - e.x));
    case 'startEssence':
      return E.startEssence(formatNumber(e.amount));
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
    case 'homes':
      return N.homes(UNITS[r.creature].name, r.n);
    case 'skill':
      return N.skill(SKILL_BY_ID[r.id]?.name ?? '');
    case 'fork':
      return N.fork;
    case 'notDefected':
      return '';
  }
}

/** "12 秒" or "1.5 分" for intervals in the building shop. */
export function shortSeconds(s: number): string {
  if (s < 90) return `${Math.round(s)} 秒`;
  return `${(s / 60).toFixed(1).replace(/\.0$/, '')} 分`;
}

const tagName = (t: string) => COPY.tags[t] ?? t;
const tagList = (tags: readonly string[]) => tags.map(tagName).join('、');

/** What an effect building does, a line per effect. */
export function describeAura(def: BuildingDef): string[] {
  const A = COPY.aura;
  const out: string[] = [];
  if (def.blocks) out.push(A.blocks(tagList(def.blocks)));
  const a = def.aura;
  if (!a) return out;
  const side = a.side === 'nature' ? COPY.run.nature : COPY.run.human;
  out.push(`${A.radius((a.radius / 4).toFixed(1).replace(/\.0$/, ''))} · ${A.whose(side, a.tags ? tagList(a.tags) : A.all)}`);
  if (a.slow) out.push(A.slow(pct(1 - a.slow)));
  if (a.atk && a.atk < 1) out.push(A.atkDown(pct(1 - a.atk)));
  if (a.atk && a.atk > 1) out.push(A.atkUp(pct(a.atk - 1)));
  if (a.dps) out.push(A.dps(a.dps));
  if (a.regen) out.push(A.regen(Math.round(a.regen * 1000) / 10));
  if (a.lure) out.push(A.lure);
  if (a.wear) out.push(A.wear(a.wear));
  if (a.nightOnly) out.push(A.nightOnly);
  else if (a.night) out.push(A.night(a.night));
  return out;
}

/** A unit's matchups: who it is good and bad against, plus thorns and strikes. */
export function describeMatchups(def: UnitDef): string[] {
  const M = COPY.matchup;
  const out = Object.entries(def.vs ?? {}).map(([t, x]) => M.vs(tagName(t), x as number));
  if (def.thorns) out.push(M.thorns(tagList(def.thorns.tags), pct(def.thorns.share)));
  if (def.strike) out.push(M.strike(tagList(def.strike)));
  return out;
}
