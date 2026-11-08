import type { BuildingId, HumanBuildingId, NatureBuildingId, ProjectileKind, Side, UnitId } from '../types.ts';

export interface TowerDef {
  dmg: number;
  interval: number;
  range: number;
  projectile: ProjectileKind;
}

export interface BuildingDef {
  id: BuildingId;
  side: Side;
  name: string;
  /** One line for the card. */
  role: string;
  hp: number;
  /** Price of the first one; each further one of the kind costs ×costGrowth more. */
  cost: number;
  costGrowth: number;
  /** Seconds to build on a pad. */
  buildTime: number;
  /** Spawners: the unit and seconds between births. */
  makes?: UnitId;
  interval?: number;
  /** Producers, per second: nature's grass, the humans' food, and income (生机 / 物资). */
  grass?: number;
  food?: number;
  income?: number;
  tower?: TowerDef;
  /** The main building: losing it loses the stage (humans) or the run (nature). */
  main?: boolean;
  /** 生机 nature gets for razing it. */
  bounty: number;
}

const b = (d: Omit<BuildingDef, 'costGrowth' | 'bounty'> & Partial<Pick<BuildingDef, 'costGrowth' | 'bounty'>>): BuildingDef => ({
  costGrowth: 1.25,
  bounty: 0,
  ...d,
});

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  mothertree: b({
    id: 'mothertree',
    side: 'nature',
    name: '母树',
    role: '主基地 · 产生机',
    hp: 3600,
    cost: 0,
    buildTime: 0,
    income: 3,
    tower: { dmg: 16, interval: 1.1, range: 76, projectile: 'cone' },
    main: true,
  }),
  meadow: b({ id: 'meadow', side: 'nature', name: '草场', role: '产草 · 养食草动物', hp: 220, cost: 50, buildTime: 6, grass: 3 }),
  ancient: b({
    id: 'ancient',
    side: 'nature',
    name: '古树',
    role: '防御 · 朝人扔松果',
    hp: 620,
    cost: 120,
    buildTime: 10,
    tower: { dmg: 12, interval: 1.3, range: 70, projectile: 'cone' },
  }),
  anthill: b({ id: 'anthill', side: 'nature', name: '蚁丘', role: '出蚂蚁', hp: 240, cost: 40, buildTime: 6, makes: 'ant', interval: 3.5 }),
  glade: b({ id: 'glade', side: 'nature', name: '鹿林', role: '出大角鹿', hp: 300, cost: 80, buildTime: 8, makes: 'elk', interval: 9 }),
  valley: b({ id: 'valley', side: 'nature', name: '猛犸冰谷', role: '出猛犸', hp: 520, cost: 220, buildTime: 14, makes: 'mammoth', interval: 22 }),
  den: b({ id: 'den', side: 'nature', name: '狼穴', role: '出狼', hp: 320, cost: 100, buildTime: 9, makes: 'wolf', interval: 8 }),
  sabercave: b({ id: 'sabercave', side: 'nature', name: '剑齿虎岩洞', role: '出剑齿虎', hp: 380, cost: 160, buildTime: 11, makes: 'sabertooth', interval: 13 }),
  bearcave: b({ id: 'bearcave', side: 'nature', name: '熊洞', role: '出洞熊', hp: 460, cost: 200, buildTime: 12, makes: 'bear', interval: 16 }),

  lodge: b({
    id: 'lodge',
    side: 'human',
    name: '部落大帐',
    role: '主基地 · 出采集者',
    hp: 3600,
    cost: 0,
    buildTime: 0,
    makes: 'gatherer',
    interval: 12,
    food: 3,
    income: 1.5,
    tower: { dmg: 12, interval: 1.3, range: 66, projectile: 'spear' },
    main: true,
    bounty: 0,
  }),
  rack: b({ id: 'rack', side: 'human', name: '晾肉架', role: '产食物', hp: 220, cost: 60, buildTime: 7, food: 4, bounty: 25 }),
  spearcamp: b({ id: 'spearcamp', side: 'human', name: '长矛营地', role: '出长矛手', hp: 340, cost: 90, buildTime: 9, makes: 'spearman', interval: 10, bounty: 40 }),
  javelincamp: b({ id: 'javelincamp', side: 'human', name: '投矛营地', role: '出投矛手', hp: 320, cost: 110, buildTime: 10, makes: 'javelin', interval: 12, bounty: 45 }),
  firepit: b({ id: 'firepit', side: 'human', name: '火塘', role: '出火把手', hp: 320, cost: 120, buildTime: 10, makes: 'torch', interval: 14, bounty: 45 }),
  tower: b({
    id: 'tower',
    side: 'human',
    name: '瞭望塔',
    role: '防御 · 朝动物扔矛',
    hp: 480,
    cost: 120,
    buildTime: 10,
    tower: { dmg: 14, interval: 1.5, range: 74, projectile: 'spear' },
    bounty: 40,
  }),
};

export const NATURE_BUILDABLE: readonly NatureBuildingId[] = ['meadow', 'ancient', 'anthill', 'glade', 'valley', 'den', 'sabercave', 'bearcave'];
export const HUMAN_BUILDABLE: readonly HumanBuildingId[] = ['rack', 'spearcamp', 'javelincamp', 'firepit', 'tower'];

/** The building that makes a unit (nature: one per species). */
export function nestOf(unit: UnitId): BuildingId | null {
  for (const def of Object.values(BUILDINGS)) if (def.makes === unit && !def.main) return def.id;
  return null;
}
