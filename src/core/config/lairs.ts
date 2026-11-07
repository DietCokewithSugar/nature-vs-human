import type { CreatureId, ZoneId } from '../types.ts';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** How far the zone is from the human city. Raids take this much longer to arrive. */
  distance: number;
}

/**
 * The nature side of the map. The forest pocket sits in the city's hollow, so raids reach it fast;
 * the volcano and the coast are behind the river and the sea.
 */
export const ZONES: Record<ZoneId, ZoneDef> = {
  forest: { id: 'forest', name: '森林', distance: 1 },
  plains: { id: 'plains', name: '平原', distance: 1.4 },
  volcano: { id: 'volcano', name: '火山', distance: 1.8 },
  coast: { id: 'coast', name: '海岸', distance: 1.8 },
};

export interface LairDef {
  creature: CreatureId;
  /** What the home is called, e.g. 狼窝. */
  name: string;
  zone: ZoneId;
}

/** Every species has one home on the map. Units spawn there; humans come to wreck it. */
export const LAIRS: Record<CreatureId, LairDef> = {
  ant: { creature: 'ant', name: '蚁丘', zone: 'forest' },
  wolf: { creature: 'wolf', name: '狼窝', zone: 'forest' },
  sabertooth: { creature: 'sabertooth', name: '岩洞', zone: 'volcano' },
  cavebear: { creature: 'cavebear', name: '熊洞', zone: 'volcano' },
  mammoth: { creature: 'mammoth', name: '冰川谷', zone: 'volcano' },
  locust: { creature: 'locust', name: '花丛', zone: 'plains' },
  rat: { creature: 'rat', name: '鼠洞', zone: 'forest' },
  wildcat: { creature: 'wildcat', name: '灌木丛', zone: 'forest' },
  boar: { creature: 'boar', name: '泥潭', zone: 'plains' },
  crocodile: { creature: 'crocodile', name: '芦苇河湾', zone: 'coast' },
  mosquito: { creature: 'mosquito', name: '死水塘', zone: 'coast' },
  pigeon: { creature: 'pigeon', name: '鸟巢树', zone: 'forest' },
  octopus: { creature: 'octopus', name: '礁石', zone: 'coast' },
  shark: { creature: 'shark', name: '深礁', zone: 'coast' },
  bison: { creature: 'bison', name: '草原', zone: 'plains' },
  termite: { creature: 'termite', name: '白蚁丘', zone: 'plains' },
  crow: { creature: 'crow', name: '枯树鸦巢', zone: 'volcano' },
  tiger: { creature: 'tiger', name: '密林', zone: 'forest' },
  rhino: { creature: 'rhino', name: '大泥潭', zone: 'plains' },
  elephant: { creature: 'elephant', name: '猴面包树', zone: 'plains' },
};
