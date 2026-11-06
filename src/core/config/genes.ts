import type { GeneUpgradeDef } from '../types.ts';

/** Permanent upgrades bought with genes. Genes are never consumed by the bonus itself. */
export const GENE_UPGRADES: readonly GeneUpgradeDef[] = [
  {
    id: 'muscle',
    name: '肌肉记忆',
    levels: [{ cost: 1, effects: [{ type: 'clickMult', x: 3 }] }],
  },
  {
    id: 'select',
    name: '自然选择',
    levels: [
      { cost: 3, effects: [{ type: 'globalMult', x: 2 }] },
      { cost: 40, effects: [{ type: 'globalMult', x: 2 }] },
      { cost: 400, effects: [{ type: 'globalMult', x: 2 }] },
      { cost: 4_000, effects: [{ type: 'globalMult', x: 2 }] },
    ],
  },
  {
    id: 'headstart',
    name: '先天优势',
    levels: [
      { cost: 2, effects: [{ type: 'startMoney', amount: 1e3 }] },
      { cost: 30, effects: [{ type: 'startMoney', amount: 1e7 }] },
      { cost: 300, effects: [{ type: 'startMoney', amount: 1e12 }] },
    ],
  },
  {
    id: 'queen',
    name: '女王血统',
    levels: [{ cost: 5, effects: [{ type: 'startQueens', n: 1 }, { type: 'breedMult', x: 2 }] }],
  },
  {
    id: 'auto1',
    name: '虫潮自治',
    levels: [{ cost: 6, effects: [{ type: 'autobuy', era: 1 }] }],
  },
  {
    id: 'auto2',
    name: '海洋自治',
    levels: [{ cost: 25, effects: [{ type: 'autobuy', era: 2 }] }],
    req: { gene: 'auto1', level: 1 },
  },
  {
    id: 'auto3',
    name: '兽群自治',
    levels: [{ cost: 120, effects: [{ type: 'autobuy', era: 3 }] }],
    req: { gene: 'auto2', level: 1 },
  },
  {
    id: 'auto4',
    name: '远古自治',
    levels: [{ cost: 600, effects: [{ type: 'autobuy', era: 4 }] }],
    req: { gene: 'auto3', level: 1 },
  },
  {
    id: 'moon',
    name: '潮汐记忆',
    levels: [{ cost: 12, effects: [{ type: 'tideAmp', add: 0.5 }] }],
  },
  {
    id: 'autosurge',
    name: '潮汐自律',
    levels: [{ cost: 35, effects: [{ type: 'autoSurge' }] }],
    req: { gene: 'moon', level: 1 },
  },
  {
    id: 'ticket',
    name: '内部价',
    levels: [{ cost: 50, effects: [{ type: 'ticketDiscount', x: 0.1 }] }],
  },
  {
    id: 'mutation',
    name: '基因突变',
    levels: [
      { cost: 20, effects: [{ type: 'genePower', add: 0.01 }] },
      { cost: 200, effects: [{ type: 'genePower', add: 0.01 }] },
      { cost: 2_000, effects: [{ type: 'genePower', add: 0.02 }] },
    ],
  },
  {
    id: 'memory',
    name: '时代记忆',
    levels: [
      { cost: 80, effects: [{ type: 'startEra', era: 2 }] },
      { cost: 800, effects: [{ type: 'startEra', era: 3 }] },
    ],
  },
];

export const GENE_BY_ID: Record<string, GeneUpgradeDef> = Object.fromEntries(GENE_UPGRADES.map((g) => [g.id, g]));
