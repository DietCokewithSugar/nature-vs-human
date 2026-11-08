/** The two camps. The player is nature; the humans are run by the core. */
export type Side = 'nature' | 'human';
/** Who holds a stretch of lane. */
export type Owner = Side | 'neutral';

/** Top, middle and bottom lane. */
export type Lane = 0 | 1 | 2;
export const LANES: readonly Lane[] = [0, 1, 2];

export type NatureUnitId = 'ant' | 'elk' | 'mammoth' | 'wolf' | 'sabertooth' | 'bear';
export type HumanUnitId = 'gatherer' | 'spearman' | 'javelin' | 'torch';
export type UnitId = NatureUnitId | HumanUnitId;

export const NATURE_UNIT_IDS: readonly NatureUnitId[] = ['ant', 'elk', 'mammoth', 'wolf', 'sabertooth', 'bear'];
export const HUMAN_UNIT_IDS: readonly HumanUnitId[] = ['gatherer', 'spearman', 'javelin', 'torch'];

export type NatureBuildingId =
  | 'mothertree'
  | 'meadow'
  | 'ancient'
  | 'anthill'
  | 'glade'
  | 'valley'
  | 'den'
  | 'sabercave'
  | 'bearcave';
export type HumanBuildingId = 'lodge' | 'rack' | 'spearcamp' | 'javelincamp' | 'firepit' | 'tower';
export type BuildingId = NatureBuildingId | HumanBuildingId;

export const NATURE_BUILDING_IDS: readonly NatureBuildingId[] = [
  'mothertree',
  'meadow',
  'ancient',
  'anthill',
  'glade',
  'valley',
  'den',
  'sabercave',
  'bearcave',
];
export const HUMAN_BUILDING_IDS: readonly HumanBuildingId[] = ['lodge', 'rack', 'spearcamp', 'javelincamp', 'firepit', 'tower'];

/** What a unit eats. Humans all eat food; nature's herbivores eat grass and predators eat meat. */
export type Diet = 'grass' | 'meat' | 'food';

/**
 * Counter tags. A unit's bonus lists tags it hits harder; buildings are always 'building'.
 * swarm = ants; big = elk and mammoths; beast = the predators; ranged = javelin throwers.
 */
export type Tag = 'swarm' | 'big' | 'beast' | 'person' | 'ranged' | 'building';

export type ProjectileKind = 'spear' | 'javelin' | 'cone' | 'fire';

/** Things the nature player can level: each species, the meadows (grass yield) and the mother tree (income). */
export type LevelId = NatureUnitId | 'meadow' | 'mothertree' | 'ancient';
export const LEVEL_IDS: readonly LevelId[] = ['mothertree', 'meadow', 'ancient', ...NATURE_UNIT_IDS];

export type Phase = 'battle' | 'pick' | 'over';
