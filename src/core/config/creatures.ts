import type { CreatureId, EraId } from '../types.ts';

export interface CreatureDef {
  id: CreatureId;
  era: EraId;
  name: string;
  /** Short job title shown next to the name. Part of the joke, not an explanation. */
  title: string;
  /** Model file under public/models (without extension). */
  model: string;
  baseCost: number;
  /** Damage per second per unit before multipliers. */
  baseProd: number;
}

/** Cost and output step between consecutive tiers. Payback grows by COST_STEP / PROD_STEP per tier. */
export const COST_STEP = 10;
export const PROD_STEP = 7.5;

type Row = Omit<CreatureDef, 'baseCost' | 'baseProd'>;

const ROWS: Row[] = [
  // 虫潮
  { id: 'ant', era: 1, name: '蚂蚁', title: '地基检测员', model: 'ant' },
  { id: 'grasshopper', era: 1, name: '蚱蜢', title: '草坪拆除队', model: 'grasshopper' },
  { id: 'wasp', era: 1, name: '胡蜂', title: '野餐终结者', model: 'wasp' },
  { id: 'beetle', era: 1, name: '锹甲', title: '家具品鉴师', model: 'beetle' },
  { id: 'mantis', era: 1, name: '螳螂', title: '专业挡车', model: 'mantis' },
  // 海啸
  { id: 'crab', era: 2, name: '螃蟹', title: '横行执法队', model: 'crab' },
  { id: 'jellyfish', era: 2, name: '水母', title: '海滩劝退师', model: 'jellyfish' },
  { id: 'eel', era: 2, name: '海鳗', title: '光缆质检员', model: 'eel' },
  { id: 'octopus', era: 2, name: '章鱼', title: '八线程开锁匠', model: 'octopus' },
  { id: 'shark', era: 2, name: '鲨鱼', title: '首席冲浪评委', model: 'shark' },
  // 兽群
  { id: 'rat', era: 3, name: '老鼠', title: '电线品鉴师', model: 'rat' },
  { id: 'pigeon', era: 3, name: '鸽子', title: '雕像涂装师', model: 'pigeon' },
  { id: 'fox', era: 3, name: '狐狸', title: '垃圾桶审计', model: 'fox' },
  { id: 'bear', era: 3, name: '熊', title: '便利店会员', model: 'bear' },
  { id: 'elephant', era: 3, name: '大象', title: '瓷器店顾问', model: 'elephant' },
  // 远古
  { id: 'raptor', era: 4, name: '迅猛龙', title: '旋转门测试员', model: 'raptor' },
  { id: 'pteranodon', era: 4, name: '翼龙', title: '空域管制员', model: 'pteranodon' },
  { id: 'triceratops', era: 4, name: '三角龙', title: '违停清理员', model: 'triceratops' },
  { id: 'brachiosaurus', era: 4, name: '腕龙', title: '高层观光客', model: 'brachiosaurus' },
  { id: 'trex', era: 4, name: '霸王龙', title: '首席灭绝官', model: 'trex' },
];

/** Round to two significant digits so prices read cleanly (1.4M, not 1.37M). */
function nice(x: number): number {
  if (x < 100) return Math.round(x * 10) / 10;
  const p = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

export const CREATURES: readonly CreatureDef[] = ROWS.map((row, i) => ({
  ...row,
  baseCost: nice(15 * COST_STEP ** i),
  baseProd: nice(0.15 * PROD_STEP ** i),
}));

export const CREATURE_BY_ID: Record<CreatureId, CreatureDef> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
) as Record<CreatureId, CreatureDef>;

export const CREATURE_IDS: readonly CreatureId[] = CREATURES.map((c) => c.id);

export function creaturesOfEra(era: EraId): CreatureDef[] {
  return CREATURES.filter((c) => c.era === era);
}
