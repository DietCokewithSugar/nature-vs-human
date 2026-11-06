import type { CreatureId, DomesticId, EraId, UnitClass } from '../types.ts';
import { BALANCE } from './balance.ts';
import { CLASSES } from './classes.ts';

export interface CreatureDef {
  id: CreatureId;
  era: EraId;
  cls: UnitClass;
  name: string;
  /** Short job title next to the name. Part of the joke, not an explanation. */
  title: string;
  /** Model key resolved by the scene (may be a kitbashed variant). */
  model: string;
  baseCost: number;
  /** Damage per second per unit before multipliers (class attack included). */
  baseProd: number;
  /** Humans can tame this species into the given domestic animal. */
  tame?: DomesticId;
  /** Ancient megafauna fall behind as eras advance. */
  ancient?: boolean;
}

type Row = Omit<CreatureDef, 'baseCost' | 'baseProd'>;

const ROWS: Row[] = [
  // 冰河
  { id: 'ant', era: 1, cls: 'assassin', name: '蚂蚁', title: '地基检测员', model: 'ant' },
  { id: 'wolf', era: 1, cls: 'hunter', name: '狼', title: '部落夜班', model: 'wolf', tame: 'dog' },
  { id: 'sabertooth', era: 1, cls: 'hunter', name: '剑齿虎', title: '牙医噩梦', model: 'sabertooth', ancient: true },
  { id: 'cavebear', era: 1, cls: 'tank', name: '洞熊', title: '山洞原房东', model: 'cavebear', ancient: true },
  { id: 'mammoth', era: 1, cls: 'tank', name: '猛犸象', title: '冰河拆迁办', model: 'mammoth', ancient: true },
  // 古代
  { id: 'locust', era: 2, cls: 'swarm', name: '蝗虫', title: '粮仓清算组', model: 'locust' },
  { id: 'rat', era: 2, cls: 'swarm', name: '老鼠', title: '瘟疫快递员', model: 'rat' },
  { id: 'wildcat', era: 2, cls: 'hunter', name: '野猫', title: '不签合同', model: 'wildcat', tame: 'cat' },
  { id: 'boar', era: 2, cls: 'tank', name: '野猪', title: '田地翻新工', model: 'boar', tame: 'pig' },
  { id: 'crocodile', era: 2, cls: 'marine', name: '鳄鱼', title: '护城河物业', model: 'crocodile' },
  // 工业
  { id: 'mosquito', era: 3, cls: 'assassin', name: '蚊子', title: '夜间收费员', model: 'mosquito' },
  { id: 'pigeon', era: 3, cls: 'swarm', name: '鸽子', title: '雕像涂装师', model: 'pigeon' },
  { id: 'octopus', era: 3, cls: 'marine', name: '章鱼', title: '八线程开锁匠', model: 'octopus' },
  { id: 'shark', era: 3, cls: 'marine', name: '鲨鱼', title: '首席冲浪评委', model: 'shark' },
  { id: 'bison', era: 3, cls: 'tank', name: '野牛', title: '铁路拦截员', model: 'bison' },
  // 现代
  { id: 'termite', era: 4, cls: 'assassin', name: '白蚁', title: '木结构审计', model: 'termite' },
  { id: 'crow', era: 4, cls: 'swarm', name: '乌鸦', title: '垃圾分类监督', model: 'crow' },
  { id: 'tiger', era: 4, cls: 'hunter', name: '老虎', title: '首席恐吓官', model: 'tiger' },
  { id: 'rhino', era: 4, cls: 'tank', name: '犀牛', title: '违停清理员', model: 'rhino' },
  { id: 'elephant', era: 4, cls: 'tank', name: '大象', title: '瓷器店顾问', model: 'elephant' },
];

/** Round to two significant digits so prices read cleanly (1.4M, not 1.37M). */
function nice(x: number): number {
  if (x < 100) return Math.round(x * 10) / 10;
  const p = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

const T = BALANCE.tiers;

export const CREATURES: readonly CreatureDef[] = ROWS.map((row, i) => ({
  ...row,
  baseCost: nice(T.costBase * T.costStep ** i),
  baseProd: nice(T.prodBase * T.prodStep ** i * CLASSES[row.cls].atk),
}));

export const CREATURE_BY_ID: Record<CreatureId, CreatureDef> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
) as Record<CreatureId, CreatureDef>;

export const CREATURE_IDS: readonly CreatureId[] = CREATURES.map((c) => c.id);

export function creaturesOfEra(era: EraId): CreatureDef[] {
  return CREATURES.filter((c) => c.era === era);
}

export function creaturesOfClass(cls: UnitClass): CreatureDef[] {
  return CREATURES.filter((c) => c.cls === cls);
}
