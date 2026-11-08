import type {
  BuildingId,
  BuildingTag,
  DomesticId,
  EraId,
  HumanBuildingId,
  NatureBuildingId,
  Side,
  SiteNeed,
  UnitId,
  UnitTag,
} from '../types.ts';

export interface SpawnEntry {
  unit: UnitId;
  /** Relative weight in the draw. */
  w: number;
  /** Only once the humans have tamed this animal. */
  if?: DomesticId;
}

/** Wood burns and gets eaten (ants, termites); the rest only breaks. */
export type Material = 'wild' | 'wood' | 'stone' | 'brick' | 'steel';

/**
 * A building that works on what is around it instead of (or as well as) making units.
 * Everything scales a little with the building's level.
 */
export interface Aura {
  /** Reach in world units (a cell is 4). */
  radius: number;
  /** Whose units (or buildings, for `wear`) it touches, and optionally only these kinds. */
  side: Side;
  tags?: UnitTag[];
  /** Speed multiplier while inside. */
  slow?: number;
  /** Attack multiplier while inside (below 1 hinders, above 1 helps). */
  atk?: number;
  /** Damage per second while inside. */
  dps?: number;
  /** Share of max HP healed per second while inside. */
  regen?: number;
  /** Draws them in, like moths to a lamp: they drop what they were doing and circle it. */
  lure?: boolean;
  /** Damage per second to that side's buildings in reach (roots cracking concrete). */
  wear?: number;
  /** Reach multiplier at night (fire and lamps show further). */
  night?: number;
  /** Only works at night (electric light). */
  nightOnly?: boolean;
}

export interface BuildingDef {
  id: BuildingId;
  side: Side;
  name: string;
  era: EraId;
  /** Scene model and its size in world units (longest side, or height). */
  model: string;
  size: number;
  by?: 'height';
  hp: number;
  /** Price in 自然之元; each further one of the same kind costs more. */
  cost: number;
  /** Seconds between births at level 1 (0: makes no units). */
  interval: number;
  spawns: SpawnEntry[];
  /** Living units it keeps at level 1. */
  alive: number;
  near?: SiteNeed;
  material: Material;
  /** The humans' research. */
  lab?: boolean;
  /** 自然之元 per second for its owner. */
  income?: number;
  /** Humans: what it is rebuilt as when the city enters the next era. */
  next?: HumanBuildingId;
  /** Nature: opened by a skill rather than by era. */
  skill?: boolean;
  /** Its units are born in the nearest water. */
  water?: boolean;
  /** Extra tags beyond the material: glass towers, farms, dams. */
  tags?: BuildingTag[];
  /** Attackers with these tags take this share of their own max HP each hit (birds on glass). */
  thorns?: { tags: UnitTag[]; share: number };
  /** Buffs and debuffs for whatever is near it. */
  aura?: Aura;
  /** Built across a river: only on fresh water touching its owner's ground. */
  onWater?: boolean;
  /** Enemy units with these tags cannot pass its cell while it stands (the dam). */
  blocks?: UnitTag[];
  /** A short line for the shop. */
  desc: string;
}

type Row = Omit<BuildingDef, 'side'>;

const one = (unit: UnitId): SpawnEntry[] => [{ unit, w: 1 }];

const NATURE: Row[] = [
  // 冰河
  { id: 'anthill', name: '蚁穴', era: 1, model: 'lair-anthill', size: 4.2, hp: 240, cost: 40, interval: 7, spawns: one('ant'), alive: 6, material: 'wild', desc: '便宜，蚂蚁啃木头特别快' },
  { id: 'den', name: '狼窝', era: 1, model: 'lair-den', size: 4.8, hp: 320, cost: 110, interval: 18, spawns: one('wolf'), alive: 3, near: 'forest', material: 'wild', desc: '要挨着森林；狼夜里出来咬人' },
  { id: 'cave', name: '剑齿虎岩洞', era: 1, model: 'lair-cave', size: 5.4, hp: 400, cost: 190, interval: 26, spawns: one('sabertooth'), alive: 2, near: 'lava', material: 'wild', desc: '要挨着火山' },
  { id: 'bearcave', name: '熊洞', era: 1, model: 'lair-cave-big', size: 6, hp: 480, cost: 260, interval: 32, spawns: one('cavebear'), alive: 2, near: 'forest', material: 'wild', desc: '要挨着森林；熊皮糙肉厚' },
  { id: 'glacier', name: '冰川谷', era: 1, model: 'lair-glacier', size: 6.4, hp: 580, cost: 380, interval: 42, spawns: one('mammoth'), alive: 2, material: 'wild', desc: '猛犸专拆房子' },
  // 古代
  { id: 'flowers', name: '花丛', era: 2, model: 'lair-flowers', size: 5, hp: 160, cost: 150, interval: 6, spawns: one('locust'), alive: 7, material: 'wild', desc: '蝗虫啃农田最快' },
  { id: 'burrow', name: '鼠洞', era: 2, model: 'lair-burrow', size: 4, hp: 150, cost: 170, interval: 6, spawns: one('rat'), alive: 7, material: 'wild', desc: '老鼠又多又快' },
  { id: 'thicket', name: '灌木丛', era: 2, model: 'lair-thicket', size: 5, hp: 220, cost: 230, interval: 18, spawns: one('wildcat'), alive: 3, near: 'forest', material: 'wild', desc: '要挨着森林；野猫专抓人类的家畜' },
  { id: 'wallow', name: '泥潭', era: 2, model: 'lair-wallow', size: 5, hp: 300, cost: 300, interval: 26, spawns: one('boar'), alive: 2, near: 'water', material: 'wild', desc: '要挨着水；野猪拱农田' },
  { id: 'reeds', name: '芦苇河湾', era: 2, model: 'lair-reeds', size: 5, hp: 320, cost: 360, interval: 30, spawns: one('crocodile'), alive: 2, near: 'water', water: true, material: 'wild', desc: '要挨着水；鳄鱼在岸边伏击' },
  // 工业
  { id: 'pond', name: '死水塘', era: 3, model: 'lair-pond', size: 5.5, hp: 160, cost: 380, interval: 5, spawns: one('mosquito'), alive: 8, near: 'water', material: 'wild', desc: '要挨着水；蚊子夜里叮人' },
  { id: 'nesttree', name: '鸟巢树', era: 3, model: 'lair-nest-tree', size: 5.5, hp: 240, cost: 420, interval: 8, spawns: one('pigeon'), alive: 6, near: 'forest', material: 'wild', desc: '要挨着森林；鸽子专糊建筑' },
  { id: 'reef', name: '礁石', era: 3, model: 'lair-reef', size: 5.5, hp: 380, cost: 520, interval: 24, spawns: one('octopus'), alive: 3, near: 'sea', water: true, material: 'wild', desc: '要贴着海；章鱼拆港口' },
  { id: 'deepreef', name: '深礁', era: 3, model: 'lair-reef-deep', size: 6.5, hp: 480, cost: 760, interval: 40, spawns: one('shark'), alive: 2, near: 'sea', water: true, material: 'wild', desc: '要贴着海；鲨鱼掀翻渔船' },
  { id: 'prairie', name: '草原', era: 3, model: 'lair-prairie', size: 6.5, hp: 500, cost: 680, interval: 36, spawns: one('bison'), alive: 2, material: 'wild', desc: '野牛成群冲撞' },
  // 现代
  { id: 'termitemound', name: '白蚁丘', era: 4, model: 'lair-termite-mound', size: 5, hp: 260, cost: 600, interval: 6, spawns: one('termite'), alive: 8, near: 'sand', material: 'wild', desc: '要挨着沙地；白蚁蛀空木头' },
  { id: 'deadtree', name: '枯树鸦巢', era: 4, model: 'lair-dead-tree', size: 5.5, hp: 260, cost: 640, interval: 9, spawns: one('crow'), alive: 6, material: 'wild', desc: '乌鸦满城飞' },
  { id: 'jungle', name: '密林', era: 4, model: 'lair-jungle', size: 6, hp: 420, cost: 900, interval: 30, spawns: one('tiger'), alive: 3, near: 'forest', material: 'wild', desc: '要挨着森林；老虎吃人' },
  { id: 'bigwallow', name: '大泥潭', era: 4, model: 'lair-wallow-big', size: 6.5, hp: 520, cost: 1000, interval: 38, spawns: one('rhino'), alive: 2, near: 'water', material: 'wild', desc: '要挨着水；犀牛顶翻车辆' },
  { id: 'baobab', name: '猴面包树', era: 4, model: 'lair-baobab', size: 7, hp: 640, cost: 1200, interval: 46, spawns: one('elephant'), alive: 2, near: 'sand', material: 'wild', desc: '要挨着沙地；大象推倒高楼' },
  // 授粉者（技能树解锁）
  { id: 'hive', name: '蜂巢', era: 1, model: 'hive', size: 3.6, hp: 120, cost: 160, interval: 12, spawns: one('bee'), alive: 4, material: 'wild', skill: true, desc: '蜜蜂白天自动收集自然之元' },
  { id: 'meadow', name: '花海', era: 2, model: 'meadow', size: 5, hp: 120, cost: 260, interval: 14, spawns: one('butterfly'), alive: 4, material: 'wild', skill: true, desc: '蝴蝶白天自动收集，更多更快' },
  { id: 'batcave', name: '蝙蝠洞', era: 2, model: 'bat-cave', size: 5, hp: 220, cost: 340, interval: 18, spawns: one('bat'), alive: 4, near: 'lava', material: 'wild', skill: true, desc: '要挨着火山；蝙蝠夜里收集' },
  // 效果建筑：不产兵
  { id: 'oldtree', name: '古树', era: 1, model: 'tree-oak', size: 9, by: 'height', hp: 260, cost: 120, interval: 0, spawns: [], alive: 0, material: 'wild', aura: { radius: 9, side: 'nature', regen: 0.03 }, desc: '周围的动物回血快' },
  { id: 'howlrock', name: '狼嚎岩', era: 2, model: 'howl-rock', size: 4.6, hp: 420, cost: 220, interval: 0, spawns: [], alive: 0, material: 'wild', aura: { radius: 10, side: 'nature', tags: ['beast'], atk: 1.3, night: 1.4 }, desc: '周围的野兽攻击 +30%，夜里喊得更远' },
  { id: 'thorns', name: '荆棘丛', era: 2, model: 'thorns', size: 5, hp: 300, cost: 180, interval: 0, spawns: [], alive: 0, material: 'wild', aura: { radius: 6, side: 'human', slow: 0.5, dps: 3 }, desc: '人类经过会减速、被扎伤' },
  { id: 'marsh', name: '毒沼', era: 3, model: 'marsh', size: 6, hp: 320, cost: 380, interval: 0, spawns: [], alive: 0, near: 'water', material: 'wild', aura: { radius: 8, side: 'human', atk: 0.7, dps: 2 }, desc: '要挨着水；周围的人类攻击 −30%、慢慢掉血' },
  { id: 'vinewall', name: '疯长藤墙', era: 4, model: 'vine-wall', size: 6, hp: 600, cost: 700, interval: 0, spawns: [], alive: 0, material: 'wild', aura: { radius: 9, side: 'human', wear: 5 }, desc: '藤蔓撑裂周围的人类建筑' },
];

const HUMANS: Row[] = [
  // 冰河
  { id: 'tent', name: '草帐篷', era: 1, model: 'teepee', size: 5.2, hp: 160, cost: 70, interval: 22, spawns: one('gatherer'), alive: 2, material: 'wood', next: 'townhouse', desc: '原始人开荒' },
  { id: 'dugout', name: '岩洞', era: 1, model: 'dugout', size: 4.6, hp: 320, cost: 110, interval: 26, spawns: [{ unit: 'gatherer', w: 1 }, { unit: 'hunter', w: 1 }], alive: 3, material: 'stone', next: 'stonehouse', desc: '原始人和猎人' },
  { id: 'lodge', name: '猎人棚', era: 1, model: 'lean-to', size: 4.4, hp: 150, cost: 120, interval: 26, spawns: [{ unit: 'hunter', w: 3 }, { unit: 'dog', w: 2, if: 'dog' }], alive: 2, material: 'wood', next: 'gatehouse', desc: '猎人专打动物' },
  { id: 'shrine', name: '萨满帐篷', era: 1, model: 'teepee-lab', size: 7.4, hp: 260, cost: 180, interval: 45, spawns: one('shaman'), alive: 1, material: 'wood', lab: true, next: 'temple', desc: '人类的研究所' },
  // 古代
  { id: 'townhouse', name: '泥瓦房', era: 2, model: 'townhouse', size: 7.5, hp: 300, cost: 160, interval: 22, spawns: [{ unit: 'farmer', w: 4 }, { unit: 'cat', w: 1, if: 'cat' }], alive: 3, material: 'brick', next: 'tenement', desc: '农夫开垦稻田' },
  { id: 'stonehouse', name: '石屋子', tags: ['field'], era: 2, model: 'storehouse', size: 5.5, hp: 380, cost: 170, interval: 24, spawns: [{ unit: 'farmer', w: 2 }, { unit: 'archer', w: 1 }], alive: 3, material: 'stone', next: 'factory', desc: '农夫和弓箭手' },
  { id: 'farmhouse', name: '木屋', tags: ['field'], era: 2, model: 'farmhouse', size: 7, hp: 220, cost: 150, interval: 24, spawns: [{ unit: 'farmer', w: 3 }, { unit: 'pig', w: 2, if: 'pig' }], alive: 3, material: 'wood', next: 'silo', desc: '农夫；有家猪后也养猪' },
  { id: 'gatehouse', name: '城门箭楼', era: 2, model: 'gatehouse', size: 7, hp: 520, cost: 240, interval: 28, spawns: [{ unit: 'archer', w: 3 }, { unit: 'dog', w: 1, if: 'dog' }], alive: 3, material: 'stone', next: 'gunshop', desc: '弓箭手远程射动物' },
  { id: 'temple', name: '神庙', era: 2, model: 'temple', size: 9.5, hp: 480, cost: 300, interval: 40, spawns: one('scholar'), alive: 2, material: 'stone', lab: true, next: 'lab', desc: '人类的研究所' },
  // 工业
  { id: 'tenement', name: '公寓楼', era: 3, model: 'tenement', size: 8, hp: 420, cost: 280, interval: 20, spawns: [{ unit: 'worker', w: 4 }, { unit: 'cat', w: 1, if: 'cat' }], alive: 4, material: 'brick', next: 'tower', desc: '工人铺路' },
  { id: 'factory', name: '工厂', era: 3, model: 'boiler-hall', size: 7, hp: 520, cost: 320, interval: 20, spawns: one('worker'), alive: 4, material: 'steel', income: 0.4, next: 'garage', desc: '工人；也给人类挣自然之元' },
  { id: 'silo', name: '农场粮仓', tags: ['field'], era: 3, model: 'silo', size: 7, by: 'height', hp: 400, cost: 260, interval: 22, spawns: [{ unit: 'farmer', w: 3 }, { unit: 'pig', w: 2, if: 'pig' }], alive: 3, material: 'steel', income: 0.3, next: 'mall', desc: '农夫和家猪' },
  { id: 'gunshop', name: '猎具行', era: 3, model: 'warehouse', size: 10, hp: 380, cost: 360, interval: 26, spawns: [{ unit: 'rifleman', w: 3 }, { unit: 'dog', w: 1, if: 'dog' }], alive: 3, material: 'brick', next: 'animalcontrol', desc: '猎枪手射程远' },
  { id: 'lab', name: '实验室', era: 3, model: 'loft', size: 10, hp: 460, cost: 440, interval: 34, spawns: [{ unit: 'researcher', w: 85 }, { unit: 'environmentalist', w: 15 }], alive: 3, material: 'brick', lab: true, next: 'labtower', desc: '研究员捕获动物；偶尔出环保工作者' },
  { id: 'harbor', name: '港口', era: 3, model: 'yard-crane', size: 5, hp: 480, cost: 400, interval: 30, spawns: one('fisher'), alive: 2, near: 'sea', water: true, material: 'steel', income: 0.3, desc: '要贴着海；渔船捕捞水里的动物' },
  { id: 'mine', name: '矿井', era: 3, model: 'mine-head', size: 6, hp: 520, cost: 380, interval: 30, spawns: one('worker'), alive: 3, near: 'lava', material: 'stone', income: 0.6, next: 'geothermal', desc: '要挨着火山；挣自然之元' },
  // 现代
  { id: 'tower', name: '摩天大楼', tags: ['glass'], thorns: { tags: ['bird'], share: 0.3 }, era: 4, model: 'office-tower', size: 7.5, hp: 700, cost: 520, interval: 18, spawns: [{ unit: 'officeWorker', w: 7 }, { unit: 'taxi', w: 3 }], alive: 5, material: 'steel', desc: '上班族和出租车司机；玻璃幕墙会反伤啄它的鸟' },
  { id: 'garage', name: '停车楼', era: 4, model: 'parking-garage', size: 9, hp: 600, cost: 480, interval: 22, spawns: one('taxi'), alive: 3, material: 'steel', desc: '出租车开车撞动物' },
  { id: 'mall', name: '购物中心', tags: ['glass'], thorns: { tags: ['bird'], share: 0.3 }, era: 4, model: 'department-store', size: 9, hp: 560, cost: 460, interval: 20, spawns: [{ unit: 'officeWorker', w: 4 }, { unit: 'pig', w: 1, if: 'pig' }], alive: 4, material: 'steel', income: 0.6, desc: '上班族；挣自然之元' },
  { id: 'animalcontrol', name: '动物管理局', era: 4, model: 'corner-tenement', size: 8.5, hp: 560, cost: 540, interval: 26, spawns: [{ unit: 'animalControl', w: 4 }, { unit: 'dog', w: 1, if: 'dog' }], alive: 3, material: 'brick', desc: '动物管理员用麻醉镖抓动物' },
  { id: 'labtower', name: '研究所', tags: ['glass'], thorns: { tags: ['bird'], share: 0.3 }, era: 4, model: 'slab', size: 14, hp: 720, cost: 700, interval: 30, spawns: [{ unit: 'researcher', w: 85 }, { unit: 'environmentalist', w: 15 }], alive: 3, material: 'steel', lab: true, desc: '研究最快；也出环保工作者' },
  { id: 'geothermal', name: '地热站', era: 4, model: 'geothermal', size: 7, hp: 600, cost: 560, interval: 34, spawns: one('worker'), alive: 2, near: 'lava', material: 'steel', income: 1.2, desc: '要挨着火山；挣很多自然之元' },
  { id: 'bank', name: '银行', era: 4, model: 'bank', size: 10, hp: 640, cost: 600, interval: 0, spawns: [], alive: 0, material: 'stone', income: 1.6, desc: '只挣自然之元' },
  // 效果建筑：不产兵
  { id: 'campfire', name: '篝火', era: 1, model: 'campfire', size: 2.8, hp: 120, cost: 90, interval: 0, spawns: [], alive: 0, material: 'wood', next: 'lamp', aura: { radius: 7, side: 'nature', atk: 0.75, night: 1.5 }, desc: '动物怕火：周围的动物攻击 −25%，夜里照得更远' },
  { id: 'scarecrow', name: '稻草人', era: 2, model: 'scarecrow', size: 3.4, by: 'height', hp: 140, cost: 110, interval: 0, spawns: [], alive: 0, material: 'wood', next: 'zapper', aura: { radius: 7, side: 'nature', tags: ['bird', 'insect'], slow: 0.6, atk: 0.7 }, desc: '吓唬鸟和虫：减速、攻击 −30%' },
  { id: 'dam', name: '大石坝', era: 2, model: 'dam', size: 4.4, hp: 900, cost: 260, interval: 0, spawns: [], alive: 0, material: 'stone', tags: ['dam'], onWater: true, blocks: ['aquatic'], desc: '建在河上：自然的水生动物过不去，除非把坝拆了' },
  { id: 'lamp', name: '电灯', era: 3, model: 'street-lamp', size: 5, by: 'height', hp: 160, cost: 160, interval: 0, spawns: [], alive: 0, material: 'steel', aura: { radius: 10, side: 'nature', tags: ['insect', 'bird'], slow: 0.55, lure: true, nightOnly: true }, desc: '通电以后：夜里把虫和鸟迷得绕灯打转，还会变慢' },
  { id: 'zapper', name: '捕虫灯', era: 3, model: 'zapper', size: 3.6, by: 'height', hp: 140, cost: 200, interval: 0, spawns: [], alive: 0, material: 'steel', aura: { radius: 6, side: 'nature', tags: ['insect'], dps: 6, lure: true, night: 1.6 }, desc: '昆虫靠近就被电：持续掉血，夜里吸得更远' },
  { id: 'wire', name: '铁丝网', era: 3, model: 'fence', size: 4.2, hp: 260, cost: 150, interval: 0, spawns: [], alive: 0, material: 'steel', aura: { radius: 5, side: 'nature', tags: ['beast'], slow: 0.5, dps: 2 }, desc: '地上的野兽经过会减速、被划伤' },
  { id: 'airport', name: '机场', era: 4, model: 'airliner', size: 10, hp: 800, cost: 650, interval: 40, spawns: one('plane'), alive: 2, material: 'steel', income: 0.6, desc: '飞机满天飞，给人类挣自然之元；鸟撞上去两败俱伤' },
];

export const BUILDINGS: Record<BuildingId, BuildingDef> = Object.fromEntries([
  ...NATURE.map((r) => [r.id, { ...r, side: 'nature' as const }]),
  ...HUMANS.map((r) => [r.id, { ...r, side: 'human' as const }]),
]) as Record<BuildingId, BuildingDef>;

export const NATURE_BUILDINGS: readonly NatureBuildingId[] = NATURE.map((r) => r.id as NatureBuildingId);
export const HUMAN_BUILDINGS: readonly HumanBuildingId[] = HUMANS.map((r) => r.id as HumanBuildingId);

/** What each level does: faster births, more living units, a tougher shell, bigger batches. */
export const LEVELS = {
  max: 4,
  speed: [1, 1.35, 1.75, 2.2],
  alive: [1, 1.5, 2, 2.5],
  hp: [1, 1.25, 1.5, 1.8],
  batch: [1, 1, 2, 2],
  /** Upgrade price from level n to n + 1, as a share of the building's price. */
  price: [0.9, 1.5, 2.3],
} as const;

/** Everything a building counts as when something hits it: its extra tags, then its material. */
export function buildingTags(def: BuildingDef): BuildingTag[] {
  return [...(def.tags ?? []), def.material];
}

/** A building that works by its aura or by blocking, not by making units. */
export function isEffect(def: BuildingDef): boolean {
  return !!def.aura || !!def.blocks;
}

/** Buildings that make a given species. */
export function homesOf(unit: UnitId): BuildingId[] {
  return (Object.values(BUILDINGS) as BuildingDef[]).filter((b) => b.spawns.some((s) => s.unit === unit)).map((b) => b.id);
}
