import type { Diet, HumanUnitId, NatureUnitId, ProjectileKind, Side, Tag, UnitId } from '../types.ts';

/** Special rules a unit may have on top of its counters. */
export type Special =
  /** Elk: the first hit after a few quiet seconds lands ×charge. */
  | 'charge'
  /** Wolves: +pack for each other wolf close by, up to packMax. */
  | 'pack'
  /** Sabertooth: ×execute against targets under half health. */
  | 'execute'
  /** Cave bear: ranged hits on it are weaker. */
  | 'thick'
  /** Mammoth: each hit also lands on everything close to the target. */
  | 'stomp'
  /** Gatherer: stops at the front to claim ground and gather supplies instead of marching on. */
  | 'gather';

export interface UnitDef {
  id: UnitId;
  side: Side;
  name: string;
  /** One line for the card: what it is for. */
  role: string;
  diet: Diet;
  /** Food eaten per second while alive. */
  eat: number;
  /** Herbivores: meat per second they feed the predators while alive. */
  meat: number;
  hp: number;
  /** Damage per hit and seconds between hits. */
  atk: number;
  interval: number;
  /** Reach in px past both bodies (melee is a few px; ranged units throw). */
  range: number;
  speed: number;
  /** Body radius in px: spacing, and how close attackers stand. */
  r: number;
  tags: Tag[];
  /** Damage multipliers by the target's tag. */
  bonus: Partial<Record<Tag, number>>;
  /** Control pushed per second on the cell it stands on (a cell flips at ±50 of ±100). */
  claim: number;
  /** How far it sees through the fog, in cells. */
  sight: number;
  projectile?: ProjectileKind;
  /** Area hits: radius in px and the share of damage dealt to everything else inside it. */
  splash?: { radius: number; share: number };
  special?: Special;
  /** 生机 nature gets for killing it (human units). */
  bounty: number;
}

/** Wolf pack bonus per nearby wolf, the cap, and how near counts. */
export const PACK = { per: 0.1, max: 0.5, radius: 40 };
export const CHARGE = { mult: 3, quiet: 3 };
export const EXECUTE = { mult: 2, below: 0.5 };
export const THICK = { rangedTaken: 0.6 };

const nature = (u: Omit<UnitDef, 'side' | 'bounty'>): UnitDef => ({ ...u, side: 'nature', bounty: 0 });
const human = (u: Omit<UnitDef, 'side' | 'meat'>): UnitDef => ({ ...u, side: 'human', meat: 0 });

export const UNITS: Record<UnitId, UnitDef> = {
  ant: nature({
    id: 'ant',
    name: '蚂蚁',
    role: '群体 · 拆建筑',
    diet: 'grass',
    eat: 0.3,
    meat: 0.08,
    hp: 22,
    atk: 4,
    interval: 0.8,
    range: 2,
    speed: 22,
    r: 4,
    tags: ['swarm'],
    bonus: { building: 2 },
    claim: 10,
    sight: 2.5,
  }),
  elk: nature({
    id: 'elk',
    name: '大角鹿',
    role: '前排 · 产肉最多',
    diet: 'grass',
    eat: 1,
    meat: 0.5,
    hp: 95,
    atk: 8,
    interval: 1,
    range: 3,
    speed: 26,
    r: 8,
    tags: ['big'],
    bonus: {},
    claim: 8,
    sight: 3.5,
    special: 'charge',
  }),
  mammoth: nature({
    id: 'mammoth',
    name: '猛犸',
    role: '重坦 · 攻城',
    diet: 'grass',
    eat: 3,
    meat: 1.2,
    hp: 380,
    atk: 22,
    interval: 1.6,
    range: 4,
    speed: 13,
    r: 13,
    tags: ['big'],
    bonus: { building: 2 },
    claim: 16,
    sight: 3,
    splash: { radius: 16, share: 0.5 },
    special: 'stomp',
  }),
  wolf: nature({
    id: 'wolf',
    name: '狼',
    role: '快 · 狼越多越凶',
    diet: 'meat',
    eat: 0.6,
    meat: 0,
    hp: 70,
    atk: 9,
    interval: 0.8,
    range: 3,
    speed: 30,
    r: 7,
    tags: ['beast'],
    bonus: { ranged: 1.5 },
    claim: 6,
    sight: 4,
    special: 'pack',
  }),
  sabertooth: nature({
    id: 'sabertooth',
    name: '剑齿虎',
    role: '刺客 · 收割残血',
    diet: 'meat',
    eat: 1,
    meat: 0,
    hp: 95,
    atk: 20,
    interval: 1.2,
    range: 3,
    speed: 27,
    r: 8,
    tags: ['beast'],
    bonus: {},
    claim: 6,
    sight: 3.5,
    special: 'execute',
  }),
  bear: nature({
    id: 'bear',
    name: '洞熊',
    role: '肉盾 · 不怕远程',
    diet: 'meat',
    eat: 1.4,
    meat: 0,
    hp: 260,
    atk: 14,
    interval: 1.2,
    range: 3,
    speed: 18,
    r: 10,
    tags: ['beast'],
    bonus: {},
    claim: 8,
    sight: 3,
    special: 'thick',
  }),

  gatherer: human({
    id: 'gatherer',
    name: '采集者',
    role: '推地 · 捡物资',
    diet: 'food',
    eat: 0.5,
    hp: 45,
    atk: 4,
    interval: 1,
    range: 3,
    speed: 20,
    r: 5,
    tags: ['person'],
    bonus: {},
    claim: 12,
    sight: 3,
    special: 'gather',
    bounty: 3,
  }),
  spearman: human({
    id: 'spearman',
    name: '长矛手',
    role: '近战 · 克猛兽',
    diet: 'food',
    eat: 1,
    hp: 90,
    atk: 10,
    interval: 1,
    range: 6,
    speed: 20,
    r: 5,
    tags: ['person'],
    bonus: { beast: 1.75 },
    claim: 5,
    sight: 3,
    bounty: 5,
  }),
  javelin: human({
    id: 'javelin',
    name: '投矛手',
    role: '远程 · 克大型动物',
    diet: 'food',
    eat: 1,
    hp: 55,
    atk: 12,
    interval: 1.6,
    range: 70,
    speed: 20,
    r: 5,
    tags: ['person', 'ranged'],
    bonus: { big: 1.5 },
    claim: 5,
    sight: 3,
    projectile: 'javelin',
    bounty: 5,
  }),
  torch: human({
    id: 'torch',
    name: '火把手',
    role: '范围火焰 · 克虫群',
    diet: 'food',
    eat: 1,
    hp: 70,
    atk: 7,
    interval: 1.2,
    range: 18,
    speed: 19,
    r: 5,
    tags: ['person'],
    bonus: { swarm: 2.5 },
    claim: 5,
    sight: 3,
    projectile: 'fire',
    splash: { radius: 18, share: 1 },
    bounty: 6,
  }),
};

export const HERBIVORES: readonly NatureUnitId[] = ['ant', 'elk', 'mammoth'];
export const PREDATORS: readonly NatureUnitId[] = ['wolf', 'sabertooth', 'bear'];
export const SOLDIERS: readonly HumanUnitId[] = ['spearman', 'javelin', 'torch'];

/** The damage multiplier an attacker gets against a target with these tags (the best match). */
export function counterMult(attacker: UnitDef, targetTags: readonly Tag[]): number {
  let m: number | null = null;
  for (const t of targetTags) {
    const b = attacker.bonus[t];
    if (b !== undefined && (m === null || b > m)) m = b;
  }
  return m ?? 1;
}
