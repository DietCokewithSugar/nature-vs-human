export type EraId = 1 | 2 | 3 | 4;
export const ERA_IDS: readonly EraId[] = [1, 2, 3, 4];

export type UnitClass = 'assassin' | 'swarm' | 'hunter' | 'tank' | 'marine';
export const CLASS_IDS: readonly UnitClass[] = ['assassin', 'swarm', 'hunter', 'tank', 'marine'];

export type CreatureId =
  | 'ant'
  | 'wolf'
  | 'sabertooth'
  | 'cavebear'
  | 'mammoth'
  | 'locust'
  | 'rat'
  | 'wildcat'
  | 'boar'
  | 'crocodile'
  | 'mosquito'
  | 'pigeon'
  | 'octopus'
  | 'shark'
  | 'bison'
  | 'termite'
  | 'crow'
  | 'tiger'
  | 'rhino'
  | 'elephant';

/** Animals humans can tame from your side. */
export type DomesticId = 'dog' | 'cat' | 'pig';

export type ActiveId = 'surge' | 'rescue' | 'rampage' | 'sabotage';

export type Difficulty = 'normal' | 'hard' | 'brutal';
export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard', 'brutal'];

export type RouteId = 'beasts' | 'plague';

/** Regions of the nature side. Each lair sits in one; each disaster strikes one. */
export type ZoneId = 'forest' | 'plains' | 'volcano' | 'coast';
export const ZONE_IDS: readonly ZoneId[] = ['forest', 'plains', 'volcano', 'coast'];

export type DisasterId = 'tsunami' | 'tornado' | 'volcano';
export const DISASTER_IDS: readonly DisasterId[] = ['tsunami', 'tornado', 'volcano'];

export type Effect =
  | { type: 'creatureMult'; creature: CreatureId; x: number }
  | { type: 'classMult'; cls: UnitClass; x: number }
  | { type: 'globalMult'; x: number }
  | { type: 'classResist'; cls: UnitClass; add: number }
  | { type: 'clickMult'; x: number }
  | { type: 'clickPct'; add: number }
  | { type: 'researchMult'; x: number }
  | { type: 'domesticationMult'; x: number }
  | { type: 'unlockBreeding' }
  | { type: 'breedMult'; x: number }
  | { type: 'unlockTide' }
  | { type: 'tideAmp'; add: number }
  | { type: 'surgeDuration'; add: number }
  | { type: 'surgeCooldownMult'; x: number }
  | { type: 'unlockActive'; id: ActiveId }
  | { type: 'convert'; from: CreatureId; to: CreatureId }
  | { type: 'unlockEra'; era: EraId }
  /** Wrecked lairs grow back this much faster (time multiplier). */
  | { type: 'lairRegrowMult'; x: number }
  /** Output lost while a lair is wrecked, as a multiplier on the base loss. */
  | { type: 'lairLossMult'; x: number };

export type Requirement =
  | { type: 'owned'; creature: CreatureId; n: number }
  | { type: 'era'; era: EraId }
  | { type: 'skill'; id: string }
  /** Either side of a fork has been picked. */
  | { type: 'fork'; group: string }
  | { type: 'upgrade'; id: string }
  | { type: 'runEarned'; log10: number }
  | { type: 'notDefected'; creature: CreatureId };

/** One-off purchases inside a run: per-creature boosts and era tickets. */
export interface UpgradeDef {
  id: string;
  name: string;
  kind: 'creature' | 'era';
  era: EraId;
  cost: number;
  effects: Effect[];
  req: Requirement[];
}

export type Branch = UnitClass | 'general';
export const BRANCHES: readonly Branch[] = ['assassin', 'swarm', 'hunter', 'tank', 'marine', 'general'];

/** A node in the in-run skill tree. */
export interface SkillDef {
  id: string;
  branch: Branch;
  name: string;
  cost: number;
  effects: Effect[];
  req: Requirement[];
  /** Mutually exclusive pair: picking one side locks the other for this run. */
  fork?: { group: string; side: 'A' | 'B' };
}

export type MetaEffect =
  | { type: 'globalMult'; x: number }
  | { type: 'researchMult'; x: number }
  | { type: 'domesticationMult'; x: number }
  | { type: 'startMoney'; amount: number }
  | { type: 'unlockFork'; group: string }
  | { type: 'unlockRoute'; route: RouteId };

export interface MetaLevel {
  cost: number;
  effects: MetaEffect[];
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  kind: 'route' | 'fork' | 'perk';
  levels: MetaLevel[];
}
