import type { Difficulty, Effect, MetaUpgradeDef, RouteId } from '../types.ts';

/** Permanent upgrades bought with points earned at the end of every run. */
export const META_UPGRADES: readonly MetaUpgradeDef[] = [
  {
    id: 'route_plague',
    name: '路线：瘟疫',
    kind: 'route',
    levels: [{ cost: 30, effects: [{ type: 'unlockRoute', route: 'plague' }] }],
  },
  {
    id: 'fork_assassin',
    name: '分支：精神污染',
    kind: 'fork',
    levels: [{ cost: 15, effects: [{ type: 'unlockFork', group: 'assassin' }] }],
  },
  {
    id: 'fork_tank',
    name: '分支：践踏',
    kind: 'fork',
    levels: [{ cost: 15, effects: [{ type: 'unlockFork', group: 'tank' }] }],
  },
  {
    id: 'perk_growth',
    name: '天性：多产',
    kind: 'perk',
    levels: [10, 25, 50].map((cost) => ({ cost, effects: [{ type: 'globalMult' as const, x: 1.15 }] })),
  },
  {
    id: 'perk_quiet',
    name: '天性：低调',
    kind: 'perk',
    levels: [10, 25, 50].map((cost) => ({ cost, effects: [{ type: 'researchMult' as const, x: 0.94 }] })),
  },
  {
    id: 'perk_wild',
    name: '天性：野性',
    kind: 'perk',
    levels: [15, 35].map((cost) => ({ cost, effects: [{ type: 'domesticationMult' as const, x: 0.85 }] })),
  },
  {
    id: 'perk_savings',
    name: '天性：囤粮',
    kind: 'perk',
    levels: [
      { cost: 8, effects: [{ type: 'startMoney', amount: 500 }] },
      { cost: 30, effects: [{ type: 'startMoney', amount: 20_000 }] },
    ],
  },
];

export const META_BY_ID: Record<string, MetaUpgradeDef> = Object.fromEntries(META_UPGRADES.map((m) => [m.id, m]));

export interface RouteDef {
  id: RouteId;
  name: string;
  /** Applied for the whole run. */
  effects: Effect[];
  /** Skills owned from the start (counts as picking that side of a fork). */
  freeSkills: string[];
}

export const ROUTES: Record<RouteId, RouteDef> = {
  beasts: { id: 'beasts', name: '百兽', effects: [], freeSkills: [] },
  plague: {
    id: 'plague',
    name: '瘟疫',
    effects: [
      { type: 'classMult', cls: 'assassin', x: 1.5 },
      { type: 'classMult', cls: 'swarm', x: 1.5 },
      { type: 'classMult', cls: 'tank', x: 0.6 },
      { type: 'researchMult', x: 1.1 },
    ],
    freeSkills: ['as_virus'],
  },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { normal: '普通', hard: '困难', brutal: '残酷' };

/** Which win unlocks each difficulty. */
export const DIFFICULTY_GATE: Record<Difficulty, Difficulty | null> = { normal: null, hard: 'normal', brutal: 'hard' };
