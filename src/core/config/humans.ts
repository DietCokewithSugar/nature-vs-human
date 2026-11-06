import type { CreatureId, DomesticId, EraId, UnitClass } from '../types.ts';

/** What the humans field against a class, by the era they have reached. */
export const COUNTERMEASURES: Record<UnitClass, [string, string, string, string]> = {
  assassin: ['烟熏驱虫', '石灰撒地', '杀虫剂', '基因驱蚊'],
  swarm: ['篝火驱赶', '捕鼠夹', '毒饵', '无人机驱鸟'],
  hunter: ['陷阱坑', '弓箭队', '猎枪', '麻醉镖'],
  tank: ['长矛围猎', '城墙', '铁丝网', '电子围栏'],
  marine: ['鱼叉', '渔网', '防鲨网', '声呐驱离'],
};

export function countermeasureName(cls: UnitClass, era: EraId): string {
  return COUNTERMEASURES[cls][era - 1]!;
}

export interface DomesticDef {
  id: DomesticId;
  name: string;
  from: CreatureId;
  model: string;
}

export const DOMESTICS: Record<DomesticId, DomesticDef> = {
  dog: { id: 'dog', name: '狗', from: 'wolf', model: 'dog' },
  cat: { id: 'cat', name: '家猫', from: 'wildcat', model: 'cat' },
  pig: { id: 'pig', name: '家猪', from: 'boar', model: 'pig' },
};

/** Effects of a domesticated species on your side. Kept in one place for the UI to describe. */
export const DOMESTIC_EFFECTS = {
  /** Hunter class output while humans have dogs. */
  dogHunterMult: 0.75,
  /** Swarm class output while humans have cats. */
  catSwarmMult: 0.6,
  /** Global output while humans keep pigs (habitat loss). */
  pigGlobalMult: 0.9,
} as const;
