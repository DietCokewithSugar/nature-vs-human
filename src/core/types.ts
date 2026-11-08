export type EraId = 1 | 2 | 3 | 4;
export const ERA_IDS: readonly EraId[] = [1, 2, 3, 4];

/** The two camps. The player is nature; the humans are run by the core. */
export type Side = 'nature' | 'human';
/** Who holds a cell. Volcanoes and water are never held. */
export type Owner = Side | 'neutral';

/** Fighting classes of the nature side: skill branches, countermeasures and disasters key on them. */
export type UnitClass = 'assassin' | 'swarm' | 'hunter' | 'tank' | 'marine';
export const CLASS_IDS: readonly UnitClass[] = ['assassin', 'swarm', 'hunter', 'tank', 'marine'];

/** Every nature species, pollinators included. */
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
  | 'elephant'
  | 'bee'
  | 'butterfly'
  | 'bat';

/** Animals humans can tame from your side. */
export type DomesticId = 'dog' | 'cat' | 'pig';

export type HumanUnitId =
  | 'gatherer'
  | 'hunter'
  | 'shaman'
  | 'farmer'
  | 'archer'
  | 'scholar'
  | 'worker'
  | 'rifleman'
  | 'researcher'
  | 'environmentalist'
  | 'fisher'
  | 'officeWorker'
  | 'taxi'
  | 'animalControl'
  | 'plane';

export type UnitId = CreatureId | DomesticId | HumanUnitId;

export type NatureBuildingId =
  | 'anthill'
  | 'den'
  | 'cave'
  | 'bearcave'
  | 'glacier'
  | 'flowers'
  | 'burrow'
  | 'thicket'
  | 'wallow'
  | 'reeds'
  | 'pond'
  | 'nesttree'
  | 'reef'
  | 'deepreef'
  | 'prairie'
  | 'termitemound'
  | 'deadtree'
  | 'jungle'
  | 'bigwallow'
  | 'baobab'
  | 'hive'
  | 'meadow'
  | 'batcave'
  // 效果建筑：不产兵，给周围加减益
  | 'oldtree'
  | 'howlrock'
  | 'thorns'
  | 'marsh'
  | 'vinewall';

export type HumanBuildingId =
  | 'tent'
  | 'dugout'
  | 'lodge'
  | 'shrine'
  | 'townhouse'
  | 'stonehouse'
  | 'farmhouse'
  | 'gatehouse'
  | 'temple'
  | 'tenement'
  | 'factory'
  | 'silo'
  | 'gunshop'
  | 'lab'
  | 'harbor'
  | 'mine'
  | 'tower'
  | 'garage'
  | 'mall'
  | 'animalcontrol'
  | 'labtower'
  | 'geothermal'
  | 'bank'
  // 效果建筑
  | 'campfire'
  | 'scarecrow'
  | 'dam'
  | 'lamp'
  | 'zapper'
  | 'wire'
  | 'airport';

export type BuildingId = NatureBuildingId | HumanBuildingId;

/**
 * What a unit is, for who hits it how hard and which auras touch it. A unit lists its tags
 * most specific first (a hunter is ['hunter', 'human']): the first one an attacker has a
 * multiplier for is the one that counts.
 */
export type UnitTag = 'insect' | 'bird' | 'flyer' | 'rodent' | 'beast' | 'aquatic' | 'hunter' | 'human' | 'vehicle' | 'boat' | 'plane' | 'domestic';

/** What a building is, for the same purpose: its material, plus glass towers and farms. */
export type BuildingTag = 'wild' | 'wood' | 'stone' | 'brick' | 'steel' | 'glass' | 'field' | 'dam';

export type TargetTag = UnitTag | BuildingTag;

/** What a site must be near. Sea is the open water in the west and south; water is any water. */
export type ResourceKind = 'forest' | 'water' | 'sand' | 'lava';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['forest', 'water', 'sand', 'lava'];
export type SiteNeed = ResourceKind | 'sea';

export type ActiveId = 'surge' | 'rescue' | 'rampage' | 'sabotage';

export type Difficulty = 'normal' | 'hard' | 'brutal';
export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard', 'brutal'];

export type RouteId = 'beasts' | 'plague';

/** Regions disasters strike. */
export type ZoneId = 'plains' | 'volcano' | 'coast';

export type DisasterId = 'tsunami' | 'tornado' | 'volcano';
export const DISASTER_IDS: readonly DisasterId[] = ['tsunami', 'tornado', 'volcano'];

/** What a unit is doing right now; shown above its head when it is a need. */
export type UnitTask = 'idle' | 'move' | 'fight' | 'work' | 'forage' | 'rest' | 'collect' | 'heal' | 'siege';

export type Effect =
  /** Attack of one class or of every nature unit. */
  | { type: 'classAtk'; cls: UnitClass; x: number }
  | { type: 'globalAtk'; x: number }
  | { type: 'classHp'; cls: UnitClass; x: number }
  | { type: 'globalHp'; x: number }
  /** Lifespan: the only way to make a species live longer. */
  | { type: 'classLife'; cls: UnitClass; x: number }
  | { type: 'globalLife'; x: number }
  | { type: 'classResist'; cls: UnitClass; add: number }
  /** How fast nature units turn enemy ground. */
  | { type: 'convertMult'; x: number }
  /** How fast nature buildings produce. */
  | { type: 'productionMult'; x: number }
  | { type: 'regenMult'; x: number }
  /** Value of a 自然之元 bubble. */
  | { type: 'bubbleMult'; x: number }
  /** How often bubbles appear. */
  | { type: 'bubbleRate'; x: number }
  /** Passive income per nature cell. */
  | { type: 'incomeMult'; x: number }
  | { type: 'researchMult'; x: number }
  | { type: 'domesticationMult'; x: number }
  | { type: 'unlockTide' }
  | { type: 'tideAmp'; add: number }
  | { type: 'surgeDuration'; add: number }
  | { type: 'surgeCooldownMult'; x: number }
  | { type: 'unlockActive'; id: ActiveId }
  /** Unlock a building that is not open by era alone (pollinators). */
  | { type: 'unlockBuilding'; id: NatureBuildingId }
  /** A building may be put on enemy ground (the anthill under the city). */
  | { type: 'enemyGround'; id: NatureBuildingId }
  /** Extra building slots. */
  | { type: 'capAdd'; add: number }
  /** Building on neutral ground goes this much faster. */
  | { type: 'wildBuildMult'; x: number }
  /** Nature cells creep into neighbouring neutral ground on their own. */
  | { type: 'spread'; rate: number }
  /** Turn one species' units and homes into another's. */
  | { type: 'convert'; from: CreatureId; to: CreatureId; building: NatureBuildingId; into: NatureBuildingId }
  /** Batch size of swarm homes. */
  | { type: 'swarmBatch'; add: number };

export type Requirement =
  | { type: 'era'; era: EraId }
  | { type: 'skill'; id: string }
  /** Either side of a fork has been picked. */
  | { type: 'fork'; group: string }
  /** Own at least n buildings that make this species. */
  | { type: 'homes'; creature: CreatureId; n: number }
  | { type: 'notDefected'; creature: CreatureId };

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
  | { type: 'productionMult'; x: number }
  | { type: 'globalLife'; x: number }
  | { type: 'researchMult'; x: number }
  | { type: 'domesticationMult'; x: number }
  | { type: 'startEssence'; amount: number }
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
