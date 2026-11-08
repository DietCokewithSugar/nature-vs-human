import type { NavMode } from '../map/nav.ts';
import type { CreatureId, DomesticId, EraId, HumanUnitId, Side, TargetTag, UnitClass, UnitId, UnitTag } from '../types.ts';

/**
 * What a unit does when left alone.
 *  fighter   nature: goes for enemy units, buildings and ground at the front
 *  reclaim   humans: clear wild and neutral ground; only fight back
 *  hunt      humans: seek animals out
 *  guard     humans: hold the city's edge, shoot what comes near
 *  capture   humans: wear animals down and carry them off (feeds taming)
 *  heal      environmentalists: patch up animals; nobody attacks them
 *  ram       taxis: run animals over on human and neutral ground
 *  research  shamans and scholars: stay by the lab, speed research up
 *  collect   pollinators: pick up 自然之元 bubbles
 *  livestock pigs: graze on human ground, earn the humans 自然之元
 *  flyer     planes: cruise high over the city and earn the humans 自然之元; only birds reach them
 */
export type UnitRole = 'fighter' | 'reclaim' | 'hunt' | 'guard' | 'capture' | 'heal' | 'ram' | 'research' | 'collect' | 'livestock' | 'flyer';

/**
 * A daily habit: it starts around an hour of the day (each individual draws its own hour from a
 * normal distribution with this standard deviation) and lasts so many hours. For pollinators the
 * forage habit is their working shift; outside it they rest.
 */
export interface Habit {
  at: number;
  sd: number;
  hours: number;
}

/** Targets that count as a meal: attacking them is foraging, and it heals. */
export type Diet = 'humans' | 'animals' | 'wood' | 'fields';

export interface UnitDef {
  id: UnitId;
  side: Side;
  name: string;
  /** A deadpan job title. */
  title: string;
  era: EraId;
  cls?: UnitClass;
  role: UnitRole;
  nav: NavMode;
  hp: number;
  /** Damage per hit, and seconds between hits. */
  atk: number;
  rate: number;
  /** Reach in world units. */
  range: number;
  speed: number;
  /** Natural lifespan in game days. */
  life: number;
  /** Ground taken per second while working an enemy or neutral cell (of 100). */
  convert: number;
  /** Damage multiplier against buildings. */
  siege: number;
  /** What it is (most specific first). */
  tags: UnitTag[];
  /** Damage multipliers against what it hits: ants against wood, wolves against people, and so on. */
  vs?: Partial<Record<TargetTag, number>>;
  /** Attackers with these tags take this share of their own max HP each time they hit it. */
  thorns?: { tags: UnitTag[]; share: number };
  /** Hit by one of these, it is destroyed outright, and so is the attacker (a bird strike). */
  strike?: UnitTag[];
  diet?: Diet;
  forage: Habit;
  rest: Habit;
  /** How far it notices enemies. */
  aggro: number;
  /** Nobody attacks it. */
  ignored?: boolean;
  /** Tameable into this domestic animal. */
  tame?: DomesticId;
  /** Body radius in world units. */
  size: number;
  /** Heal per second given to animals nearby (environmentalists). */
  heal?: number;
}

type Row = Omit<UnitDef, 'side'>;

const h = (at: number, sd: number, hours: number): Habit => ({ at, sd, hours });

/**
 * Nature. Lifespans are real ones squeezed into game days (one day is four minutes):
 * insects live a day or two, big cats and wolves a week, elephants and sharks two or more.
 */
const NATURE: Row[] = [
  // 冰河
  { id: 'ant', name: '蚂蚁', title: '地基检测员', era: 1, cls: 'assassin', role: 'fighter', nav: 'land', hp: 18, atk: 2.6, rate: 0.8, range: 1.2, speed: 2.4, life: 1.5, convert: 3, siege: 0.8, diet: 'wood', tags: ['insect'], vs: { wood: 3, human: 0.35, hunter: 0.3 }, forage: h(10, 3, 3), rest: h(1, 3, 4), aggro: 6, size: 0.5 },
  { id: 'wolf', name: '狼', title: '部落夜班', era: 1, cls: 'hunter', role: 'fighter', nav: 'land', hp: 75, atk: 9, rate: 1, range: 1.6, speed: 3.8, life: 6, convert: 1, siege: 0.5, diet: 'humans', tags: ['beast'], vs: { human: 1.6, hunter: 0.5, vehicle: 0.3 }, forage: h(22, 3, 3), rest: h(12, 3, 6), aggro: 9, tame: 'dog', size: 1 },
  { id: 'sabertooth', name: '剑齿虎', title: '牙医噩梦', era: 1, cls: 'hunter', role: 'fighter', nav: 'land', hp: 95, atk: 14, rate: 1.2, range: 1.8, speed: 3.3, life: 5, convert: 0.8, siege: 0.6, diet: 'humans', tags: ['beast'], vs: { human: 1.4, hunter: 0.7 }, forage: h(20, 3, 3), rest: h(12, 3, 7), aggro: 9, size: 1.2 },
  { id: 'cavebear', name: '洞熊', title: '山洞原房东', era: 1, cls: 'tank', role: 'fighter', nav: 'land', hp: 190, atk: 13, rate: 1.4, range: 1.8, speed: 2.1, life: 8, convert: 1.2, siege: 1.6, tags: ['beast'], vs: { hunter: 0.8, wood: 1.5 }, forage: h(9, 3, 4), rest: h(0, 3, 9), aggro: 7, size: 1.5 },
  { id: 'mammoth', name: '猛犸象', title: '冰河拆迁办', era: 1, cls: 'tank', role: 'fighter', nav: 'land', hp: 320, atk: 18, rate: 1.8, range: 2.4, speed: 1.7, life: 12, convert: 1.5, siege: 2.5, tags: ['beast'], vs: { stone: 1.4, brick: 1.3 }, thorns: { tags: ['vehicle'], share: 0.15 }, forage: h(11, 4, 5), rest: h(2, 2, 4), aggro: 7, size: 2.4 },
  // 古代
  { id: 'locust', name: '蝗虫', title: '粮仓清算组', era: 2, cls: 'swarm', role: 'fighter', nav: 'land', hp: 8, atk: 1.4, rate: 0.6, range: 1, speed: 3.2, life: 1, convert: 3, siege: 0.3, diet: 'fields', tags: ['insect'], vs: { field: 3, human: 0.3 }, forage: h(12, 2, 3), rest: h(0, 2, 6), aggro: 5, size: 0.5 },
  { id: 'rat', name: '老鼠', title: '瘟疫快递员', era: 2, cls: 'swarm', role: 'fighter', nav: 'land', hp: 11, atk: 1.6, rate: 0.7, range: 1, speed: 3, life: 2, convert: 2, siege: 1, diet: 'fields', tags: ['rodent', 'beast'], vs: { field: 2, wood: 1.5, human: 0.6 }, forage: h(1, 3, 3), rest: h(13, 3, 6), aggro: 5, size: 0.5 },
  { id: 'wildcat', name: '野猫', title: '不签合同', era: 2, cls: 'hunter', role: 'fighter', nav: 'land', hp: 42, atk: 7, rate: 0.9, range: 1.4, speed: 3.4, life: 5, convert: 0.8, siege: 0.4, diet: 'animals', tags: ['beast'], vs: { domestic: 1.6, hunter: 0.6 }, forage: h(21, 3, 2), rest: h(11, 3, 7), aggro: 8, tame: 'cat', size: 0.8 },
  { id: 'boar', name: '野猪', title: '田地翻新工', era: 2, cls: 'tank', role: 'fighter', nav: 'land', hp: 115, atk: 10, rate: 1.2, range: 1.6, speed: 2.5, life: 6, convert: 2.5, siege: 1.2, diet: 'fields', tags: ['beast'], vs: { field: 2, hunter: 0.7 }, forage: h(18, 3, 4), rest: h(6, 3, 6), aggro: 7, tame: 'pig', size: 1.2 },
  { id: 'crocodile', name: '鳄鱼', title: '护城河物业', era: 2, cls: 'marine', role: 'fighter', nav: 'water', hp: 150, atk: 16, rate: 1.5, range: 3.4, speed: 1.8, life: 14, convert: 1.2, siege: 0.8, diet: 'humans', tags: ['aquatic', 'beast'], vs: { boat: 1.8, human: 1.3 }, forage: h(19, 4, 2), rest: h(13, 3, 8), aggro: 8, size: 1.6 },
  // 工业
  { id: 'mosquito', name: '蚊子', title: '夜间收费员', era: 3, cls: 'assassin', role: 'fighter', nav: 'air', hp: 5, atk: 1.2, rate: 0.5, range: 1, speed: 4.6, life: 0.6, convert: 0.5, siege: 0.1, diet: 'humans', tags: ['insect'], vs: { human: 1.6, vehicle: 0, plane: 0 }, forage: h(20, 2, 2), rest: h(12, 3, 6), aggro: 8, size: 0.4 },
  { id: 'pigeon', name: '鸽子', title: '雕像涂装师', era: 3, cls: 'swarm', role: 'fighter', nav: 'air', hp: 11, atk: 1.2, rate: 1, range: 1.2, speed: 3, life: 4, convert: 1.5, siege: 1.4, tags: ['bird'], vs: { stone: 1.6, brick: 1.4 }, forage: h(9, 2, 3), rest: h(21, 1.5, 8), aggro: 5, size: 0.5 },
  { id: 'octopus', name: '章鱼', title: '八线程开锁匠', era: 3, cls: 'marine', role: 'fighter', nav: 'sea', hp: 65, atk: 9, rate: 1, range: 3.4, speed: 2, life: 2, convert: 1.2, siege: 1.5, tags: ['aquatic'], vs: { steel: 1.5, boat: 1.5 }, forage: h(22, 3, 3), rest: h(10, 3, 6), aggro: 8, size: 1.2 },
  { id: 'shark', name: '鲨鱼', title: '首席冲浪评委', era: 3, cls: 'marine', role: 'fighter', nav: 'sea', hp: 170, atk: 24, rate: 1.4, range: 3.6, speed: 3.6, life: 20, convert: 0.6, siege: 1, diet: 'humans', tags: ['aquatic'], vs: { boat: 2.2, human: 1.4 }, forage: h(18, 5, 3), rest: h(4, 4, 4), aggro: 10, size: 2 },
  { id: 'bison', name: '野牛', title: '铁路拦截员', era: 3, cls: 'tank', role: 'fighter', nav: 'land', hp: 230, atk: 15, rate: 1.6, range: 2.2, speed: 2.6, life: 10, convert: 2, siege: 2, tags: ['beast'], vs: { steel: 1.3, vehicle: 1.5 }, thorns: { tags: ['vehicle'], share: 0.15 }, forage: h(10, 4, 5), rest: h(23, 2, 6), aggro: 7, size: 1.8 },
  // 现代
  { id: 'termite', name: '白蚁', title: '木结构审计', era: 4, cls: 'assassin', role: 'fighter', nav: 'land', hp: 11, atk: 2.6, rate: 0.7, range: 1.2, speed: 2.2, life: 2, convert: 3.5, siege: 1, diet: 'wood', tags: ['insect'], vs: { wood: 4, human: 0.3, hunter: 0.25 }, forage: h(14, 6, 4), rest: h(2, 4, 4), aggro: 5, size: 0.5 },
  { id: 'crow', name: '乌鸦', title: '垃圾分类监督', era: 4, cls: 'swarm', role: 'fighter', nav: 'air', hp: 17, atk: 2.2, rate: 1, range: 1.2, speed: 4, life: 7, convert: 1, siege: 1, tags: ['bird'], vs: { field: 1.5, steel: 0.7 }, forage: h(8, 2, 3), rest: h(20, 1.5, 9), aggro: 6, size: 0.6 },
  { id: 'tiger', name: '老虎', title: '首席恐吓官', era: 4, cls: 'hunter', role: 'fighter', nav: 'land', hp: 160, atk: 21, rate: 1.1, range: 1.8, speed: 3.6, life: 8, convert: 1, siege: 0.6, diet: 'humans', tags: ['beast'], vs: { human: 1.5, hunter: 0.8, vehicle: 0.6 }, forage: h(21, 3, 3), rest: h(13, 3, 8), aggro: 10, size: 1.6 },
  { id: 'rhino', name: '犀牛', title: '违停清理员', era: 4, cls: 'tank', role: 'fighter', nav: 'land', hp: 270, atk: 19, rate: 1.5, range: 2.2, speed: 3, life: 10, convert: 1.5, siege: 2.5, tags: ['beast'], vs: { vehicle: 2.5, steel: 1.2 }, thorns: { tags: ['vehicle'], share: 0.25 }, forage: h(17, 3, 4), rest: h(11, 3, 6), aggro: 7, size: 2 },
  { id: 'elephant', name: '大象', title: '瓷器店顾问', era: 4, cls: 'tank', role: 'fighter', nav: 'land', hp: 420, atk: 23, rate: 2, range: 2.6, speed: 1.8, life: 15, convert: 2, siege: 3, tags: ['beast'], vs: { glass: 1.5, steel: 1.3, vehicle: 1.8 }, thorns: { tags: ['vehicle'], share: 0.25 }, forage: h(12, 6, 7), rest: h(2, 2, 4), aggro: 7, size: 2.6 },
  // 授粉者：白天的蜜蜂和蝴蝶，夜里的蝙蝠
  { id: 'bee', name: '蜜蜂', title: '花粉快递', era: 1, role: 'collect', nav: 'air', hp: 6, atk: 0, rate: 1, range: 0.8, speed: 4, life: 1.2, convert: 0, siege: 0, tags: ['insect'], forage: h(7, 1, 11), rest: h(0, 0, 0), aggro: 0, size: 0.4 },
  { id: 'butterfly', name: '蝴蝶', title: '花海巡视员', era: 2, role: 'collect', nav: 'air', hp: 4, atk: 0, rate: 1, range: 0.8, speed: 3.2, life: 0.8, convert: 0, siege: 0, tags: ['insect'], forage: h(8, 1, 10), rest: h(0, 0, 0), aggro: 0, size: 0.4 },
  { id: 'bat', name: '蝙蝠', title: '夜班收银', era: 2, role: 'collect', nav: 'air', hp: 9, atk: 0, rate: 1, range: 0.8, speed: 4.5, life: 5, convert: 0, siege: 0, tags: ['flyer'], forage: h(19, 1, 10), rest: h(0, 0, 0), aggro: 0, size: 0.5 },
];

/**
 * Humans. Early people are tough and short-lived; modern ones live long and break easily.
 * Some work through the night in every era; fewer and fewer as the city modernises.
 */
const HUMANS: Row[] = [
  // 冰河
  { id: 'gatherer', name: '原始人', title: '采集开荒', era: 1, role: 'reclaim', nav: 'land', hp: 70, atk: 3.5, rate: 1.3, range: 1.6, speed: 2.6, life: 3.5, convert: 2, siege: 0.6, tags: ['human'], vs: { insect: 0.5 }, forage: h(15, 6, 3), rest: h(22, 3, 7), aggro: 5, size: 0.8 },
  { id: 'hunter', name: '原始猎人', title: '长矛手', era: 1, role: 'hunt', nav: 'land', hp: 85, atk: 8, rate: 1.3, range: 2.4, speed: 3, life: 3.5, convert: 0.6, siege: 0.8, diet: 'animals', tags: ['hunter', 'human'], vs: { beast: 1.5, insect: 0.3, bird: 0.6 }, forage: h(9, 6, 4), rest: h(22, 3, 7), aggro: 9, size: 0.8 },
  { id: 'shaman', name: '萨满', title: '观天象', era: 1, role: 'research', nav: 'land', hp: 70, atk: 3, rate: 1.4, range: 1.4, speed: 2.2, life: 4, convert: 0, siege: 1, tags: ['human'], forage: h(12, 3, 2), rest: h(23, 2, 8), aggro: 4, size: 0.8 },
  // 古代
  { id: 'farmer', name: '农夫', title: '开垦稻田', era: 2, role: 'reclaim', nav: 'land', hp: 65, atk: 4, rate: 1.2, range: 1.6, speed: 2.4, life: 4.5, convert: 3.5, siege: 1, tags: ['human'], vs: { insect: 0.6, rodent: 1.4 }, forage: h(12, 1.5, 2), rest: h(21, 1.5, 9), aggro: 5, size: 0.8 },
  { id: 'archer', name: '弓箭手', title: '城门守卫', era: 2, role: 'guard', nav: 'land', hp: 75, atk: 9, rate: 1.4, range: 7, speed: 2.8, life: 4.5, convert: 0.4, siege: 1, tags: ['hunter', 'human'], vs: { bird: 1.6, beast: 1.2, insect: 0.4 }, forage: h(13, 2, 2), rest: h(0, 2, 7), aggro: 10, size: 0.8 },
  { id: 'scholar', name: '学者', title: '博物志作者', era: 2, role: 'research', nav: 'land', hp: 50, atk: 2, rate: 1.4, range: 1.4, speed: 2.2, life: 5, convert: 0, siege: 1, tags: ['human'], forage: h(13, 2, 2), rest: h(23, 2, 8), aggro: 4, size: 0.8 },
  // 工业
  { id: 'worker', name: '工人', title: '铺路架桥', era: 3, role: 'reclaim', nav: 'land', hp: 55, atk: 5, rate: 1.1, range: 1.6, speed: 2.6, life: 6, convert: 4, siege: 1, tags: ['human'], vs: { insect: 0.6 }, forage: h(12, 1, 1), rest: h(22, 2, 8), aggro: 5, size: 0.8 },
  { id: 'rifleman', name: '猎枪手', title: '周末打猎', era: 3, role: 'hunt', nav: 'land', hp: 65, atk: 16, rate: 1.6, range: 9, speed: 3, life: 6, convert: 0.4, siege: 1, diet: 'animals', tags: ['hunter', 'human'], vs: { beast: 1.5, bird: 1.2, insect: 0.2 }, forage: h(8, 4, 3), rest: h(22, 2, 8), aggro: 13, size: 0.8 },
  { id: 'researcher', name: '研究员', title: '捕获取样', era: 3, role: 'capture', nav: 'land', hp: 40, atk: 3, rate: 1.2, range: 6, speed: 2.6, life: 7, convert: 0, siege: 1, tags: ['human'], forage: h(12, 1, 1), rest: h(22, 2, 9), aggro: 12, size: 0.8 },
  { id: 'environmentalist', name: '环保工作者', title: '替动物说话', era: 3, role: 'heal', nav: 'land', hp: 45, atk: 0, rate: 1, range: 4, speed: 2.8, life: 7, convert: 0, siege: 0, tags: ['human'], forage: h(12, 2, 1), rest: h(22, 2, 8), aggro: 14, ignored: true, heal: 5, size: 0.8 },
  { id: 'fisher', name: '渔船', title: '远洋捕捞', era: 3, role: 'hunt', nav: 'water', hp: 140, atk: 12, rate: 1.5, range: 6, speed: 2.6, life: 6, convert: 0, siege: 1, diet: 'animals', tags: ['boat', 'vehicle'], vs: { aquatic: 1.8 }, forage: h(5, 3, 4), rest: h(20, 2, 8), aggro: 12, size: 2 },
  // 现代
  { id: 'officeWorker', name: '上班族', title: '朝九晚六', era: 4, role: 'reclaim', nav: 'land', hp: 35, atk: 2, rate: 1.2, range: 1.4, speed: 2.6, life: 9, convert: 3, siege: 1, tags: ['human'], vs: { insect: 0.5 }, forage: h(12.5, 0.6, 1), rest: h(23, 1, 8), aggro: 4, size: 0.8 },
  { id: 'taxi', name: '出租车司机', title: '不认路', era: 4, role: 'ram', nav: 'land', hp: 140, atk: 34, rate: 2.5, range: 1.8, speed: 7, life: 9, convert: 0, siege: 1, tags: ['vehicle', 'human'], vs: { insect: 0.2, bird: 0.5 }, forage: h(12, 3, 1), rest: h(3, 3, 5), aggro: 16, size: 1.6 },
  { id: 'animalControl', name: '动物管理员', title: '麻醉镖', era: 4, role: 'capture', nav: 'land', hp: 70, atk: 4, rate: 1.3, range: 8, speed: 3, life: 8, convert: 0.4, siege: 1, tags: ['hunter', 'human'], vs: { beast: 1.3, insect: 0.5 }, forage: h(12, 1, 1), rest: h(22, 1.5, 9), aggro: 14, size: 0.8 },
  { id: 'plane', name: '飞机', title: '航班延误中', era: 4, role: 'flyer', nav: 'air', hp: 260, atk: 0, rate: 1, range: 1, speed: 6, life: 12, convert: 0, siege: 0, tags: ['plane', 'vehicle'], strike: ['bird'], forage: h(12, 1, 0), rest: h(2, 2, 4), aggro: 0, size: 3 },
  // 驯化的动物
  { id: 'dog', name: '狗', title: '人类最好的朋友', era: 1, role: 'hunt', nav: 'land', hp: 60, atk: 8, rate: 1, range: 1.5, speed: 3.8, life: 5, convert: 0.4, siege: 0.5, diet: 'animals', tags: ['domestic', 'beast'], vs: { beast: 1.3, insect: 0.4 }, forage: h(18, 3, 2), rest: h(13, 4, 6), aggro: 11, size: 0.9 },
  { id: 'cat', name: '家猫', title: '抓老鼠', era: 2, role: 'hunt', nav: 'land', hp: 30, atk: 6, rate: 0.9, range: 1.3, speed: 3.2, life: 6, convert: 0, siege: 0.4, diet: 'animals', tags: ['domestic', 'beast'], vs: { rodent: 2.5, insect: 1.5, bird: 1.5, beast: 0.5 }, forage: h(22, 3, 3), rest: h(12, 4, 8), aggro: 9, size: 0.7 },
  { id: 'pig', name: '家猪', title: '圈养经济', era: 2, role: 'livestock', nav: 'land', hp: 90, atk: 0, rate: 1, range: 1, speed: 1.4, life: 5, convert: 1, siege: 0, tags: ['domestic', 'beast'], forage: h(10, 3, 5), rest: h(22, 3, 8), aggro: 0, size: 1 },
];

export const UNITS: Record<UnitId, UnitDef> = Object.fromEntries([
  ...NATURE.map((r) => [r.id, { ...r, side: 'nature' as const }]),
  ...HUMANS.map((r) => [r.id, { ...r, side: 'human' as const }]),
]) as Record<UnitId, UnitDef>;

export const CREATURE_IDS: readonly CreatureId[] = NATURE.map((r) => r.id as CreatureId);
export const HUMAN_UNIT_IDS: readonly HumanUnitId[] = HUMANS.filter((r) => !['dog', 'cat', 'pig'].includes(r.id)).map((r) => r.id as HumanUnitId);
export const DOMESTIC_IDS: readonly DomesticId[] = ['dog', 'cat', 'pig'];

/** Nature species that fight (pollinators excluded). */
export const FIGHTERS: readonly CreatureId[] = CREATURE_IDS.filter((id) => UNITS[id].cls !== undefined);

/** Species the humans can tame, and what they become. */
export const TAMEABLE: readonly CreatureId[] = CREATURE_IDS.filter((id) => UNITS[id].tame !== undefined);

export function isAnimal(id: UnitId): boolean {
  return UNITS[id].side === 'nature' || id === 'dog' || id === 'cat' || id === 'pig';
}
