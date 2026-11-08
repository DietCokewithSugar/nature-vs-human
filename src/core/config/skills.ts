import type { Branch, SkillDef } from '../types.ts';

/**
 * In-run skill tree, bought with 自然之元. One line per class plus a general line
 * (pollinators, stealth, territory). Lifespans only ever grow through this tree.
 * Fork pairs are exclusive within a run; side B starts locked and is unlocked with meta points.
 */
export const SKILLS: readonly SkillDef[] = [
  // ── 刺客 ─────────────────────────────────────────────────────
  {
    id: 'as_swarm',
    branch: 'assassin',
    name: '成群结队',
    cost: 120,
    effects: [{ type: 'classAtk', cls: 'assassin', x: 1.5 }],
    req: [{ type: 'homes', creature: 'ant', n: 2 }],
  },
  {
    id: 'as_tunnel',
    branch: 'assassin',
    name: '地下通道',
    cost: 280,
    effects: [{ type: 'enemyGround', id: 'anthill' }],
    req: [{ type: 'skill', id: 'as_swarm' }],
  },
  {
    id: 'as_resist',
    branch: 'assassin',
    name: '抗药性',
    cost: 420,
    effects: [
      { type: 'classResist', cls: 'assassin', add: 0.4 },
      { type: 'classLife', cls: 'assassin', x: 1.3 },
    ],
    req: [{ type: 'skill', id: 'as_swarm' }, { type: 'era', era: 2 }],
  },
  {
    id: 'as_virus',
    branch: 'assassin',
    name: '携带病毒',
    cost: 900,
    effects: [
      { type: 'globalAtk', x: 1.25 },
      { type: 'researchMult', x: 1.1 },
    ],
    req: [{ type: 'skill', id: 'as_resist' }, { type: 'era', era: 3 }],
    fork: { group: 'assassin', side: 'A' },
  },
  {
    id: 'as_panic',
    branch: 'assassin',
    name: '精神污染',
    cost: 900,
    effects: [
      { type: 'classAtk', cls: 'assassin', x: 1.5 },
      { type: 'researchMult', x: 0.85 },
    ],
    req: [{ type: 'skill', id: 'as_resist' }, { type: 'era', era: 3 }],
    fork: { group: 'assassin', side: 'B' },
  },
  {
    id: 'as_chain',
    branch: 'assassin',
    name: '传播链',
    cost: 1800,
    effects: [
      { type: 'classAtk', cls: 'assassin', x: 2 },
      { type: 'convertMult', x: 1.3 },
    ],
    req: [{ type: 'fork', group: 'assassin' }, { type: 'era', era: 4 }],
  },

  // ── 群体 ─────────────────────────────────────────────────────
  {
    id: 'sw_breed',
    branch: 'swarm',
    name: '繁殖巢',
    cost: 320,
    effects: [{ type: 'swarmBatch', add: 1 }],
    req: [{ type: 'era', era: 2 }],
  },
  {
    id: 'sw_plague',
    branch: 'swarm',
    name: '鼠疫',
    cost: 480,
    effects: [
      { type: 'classAtk', cls: 'swarm', x: 1.5 },
      { type: 'researchMult', x: 0.9 },
    ],
    req: [{ type: 'homes', creature: 'rat', n: 1 }],
  },
  {
    id: 'sw_fertile',
    branch: 'swarm',
    name: '多子多福',
    cost: 600,
    effects: [{ type: 'classLife', cls: 'swarm', x: 1.4 }],
    req: [{ type: 'skill', id: 'sw_breed' }],
  },
  {
    id: 'sw_cloud',
    branch: 'swarm',
    name: '遮天蔽日',
    cost: 1400,
    effects: [
      { type: 'classAtk', cls: 'swarm', x: 2 },
      { type: 'convertMult', x: 1.2 },
    ],
    req: [{ type: 'skill', id: 'sw_fertile' }, { type: 'era', era: 3 }],
  },

  // ── 猎手 ─────────────────────────────────────────────────────
  {
    id: 'hu_wild',
    branch: 'hunter',
    name: '野性难驯',
    cost: 150,
    effects: [{ type: 'domesticationMult', x: 0.6 }],
    req: [{ type: 'homes', creature: 'wolf', n: 1 }],
  },
  {
    id: 'hu_rescue',
    branch: 'hunter',
    name: '解救',
    cost: 260,
    effects: [{ type: 'unlockActive', id: 'rescue' }],
    req: [{ type: 'skill', id: 'hu_wild' }],
  },
  {
    id: 'hu_pack',
    branch: 'hunter',
    name: '狼群战术',
    cost: 360,
    effects: [
      { type: 'classAtk', cls: 'hunter', x: 1.5 },
      { type: 'classHp', cls: 'hunter', x: 1.2 },
    ],
    req: [{ type: 'homes', creature: 'wolf', n: 2 }],
  },
  {
    id: 'hu_alpha',
    branch: 'hunter',
    name: '头狼',
    cost: 520,
    effects: [{ type: 'classLife', cls: 'hunter', x: 1.4 }],
    req: [{ type: 'skill', id: 'hu_pack' }, { type: 'era', era: 2 }],
  },
  {
    id: 'hu_fang',
    branch: 'hunter',
    name: '趋同进化·虎',
    cost: 1200,
    effects: [{ type: 'convert', from: 'sabertooth', to: 'tiger', building: 'cave', into: 'jungle' }],
    req: [{ type: 'era', era: 4 }, { type: 'homes', creature: 'sabertooth', n: 1 }],
  },
  {
    id: 'hu_apex',
    branch: 'hunter',
    name: '顶级掠食者',
    cost: 1600,
    effects: [{ type: 'classAtk', cls: 'hunter', x: 2 }],
    req: [{ type: 'skill', id: 'hu_alpha' }, { type: 'era', era: 4 }],
  },

  // ── 重坦 ─────────────────────────────────────────────────────
  {
    id: 'tk_hide',
    branch: 'tank',
    name: '厚皮',
    cost: 300,
    effects: [{ type: 'classHp', cls: 'tank', x: 1.4 }],
    req: [{ type: 'homes', creature: 'cavebear', n: 1 }],
  },
  {
    id: 'tk_rampage',
    branch: 'tank',
    name: '暴走',
    cost: 420,
    effects: [{ type: 'unlockActive', id: 'rampage' }],
    req: [{ type: 'skill', id: 'tk_hide' }],
  },
  {
    id: 'tk_armor',
    branch: 'tank',
    name: '重甲',
    cost: 700,
    effects: [
      { type: 'classResist', cls: 'tank', add: 0.3 },
      { type: 'classHp', cls: 'tank', x: 1.3 },
    ],
    req: [{ type: 'skill', id: 'tk_hide' }, { type: 'era', era: 2 }],
    fork: { group: 'tank', side: 'A' },
  },
  {
    id: 'tk_stomp',
    branch: 'tank',
    name: '践踏',
    cost: 700,
    effects: [
      { type: 'classAtk', cls: 'tank', x: 2 },
      { type: 'classResist', cls: 'tank', add: -0.2 },
    ],
    req: [{ type: 'skill', id: 'tk_hide' }, { type: 'era', era: 2 }],
    fork: { group: 'tank', side: 'B' },
  },
  {
    id: 'tk_long',
    branch: 'tank',
    name: '长寿巨兽',
    cost: 900,
    effects: [{ type: 'classLife', cls: 'tank', x: 1.4 }],
    req: [{ type: 'fork', group: 'tank' }, { type: 'era', era: 3 }],
  },
  {
    id: 'tk_tusk',
    branch: 'tank',
    name: '趋同进化·象',
    cost: 1400,
    effects: [{ type: 'convert', from: 'mammoth', to: 'elephant', building: 'glacier', into: 'baobab' }],
    req: [{ type: 'era', era: 4 }, { type: 'homes', creature: 'mammoth', n: 1 }],
  },

  // ── 水军 ─────────────────────────────────────────────────────
  {
    id: 'ma_tide',
    branch: 'marine',
    name: '潮汐',
    cost: 360,
    effects: [{ type: 'unlockTide' }],
    req: [{ type: 'homes', creature: 'crocodile', n: 1 }],
  },
  {
    id: 'ma_surge',
    branch: 'marine',
    name: '大潮',
    cost: 520,
    effects: [{ type: 'unlockActive', id: 'surge' }],
    req: [{ type: 'skill', id: 'ma_tide' }],
  },
  {
    id: 'ma_deep',
    branch: 'marine',
    name: '深海',
    cost: 800,
    effects: [
      { type: 'classHp', cls: 'marine', x: 1.5 },
      { type: 'classLife', cls: 'marine', x: 1.3 },
    ],
    req: [{ type: 'skill', id: 'ma_tide' }, { type: 'era', era: 3 }],
  },
  {
    id: 'ma_amp',
    branch: 'marine',
    name: '潮汐力',
    cost: 900,
    effects: [{ type: 'tideAmp', add: 0.5 }],
    req: [{ type: 'skill', id: 'ma_surge' }, { type: 'era', era: 3 }],
  },
  {
    id: 'ma_storm',
    branch: 'marine',
    name: '风暴潮',
    cost: 1500,
    effects: [
      { type: 'classAtk', cls: 'marine', x: 2 },
      { type: 'surgeDuration', add: 15 },
    ],
    req: [{ type: 'skill', id: 'ma_amp' }, { type: 'era', era: 4 }],
  },

  // ── 通用：授粉、隐匿、领地 ───────────────────────────────────
  {
    id: 'ge_pollinate',
    branch: 'general',
    name: '授粉',
    cost: 120,
    effects: [{ type: 'unlockBuilding', id: 'hive' }],
    req: [],
  },
  {
    id: 'ge_bubbles',
    branch: 'general',
    name: '涌泉',
    cost: 220,
    effects: [
      { type: 'bubbleRate', x: 1.4 },
      { type: 'bubbleMult', x: 1.2 },
    ],
    req: [{ type: 'skill', id: 'ge_pollinate' }],
  },
  {
    id: 'ge_quiet',
    branch: 'general',
    name: '隐匿',
    cost: 220,
    effects: [{ type: 'researchMult', x: 0.8 }],
    req: [],
  },
  {
    id: 'ge_sabotage',
    branch: 'general',
    name: '捣毁实验室',
    cost: 380,
    effects: [{ type: 'unlockActive', id: 'sabotage' }],
    req: [{ type: 'skill', id: 'ge_quiet' }],
  },
  {
    id: 'ge_regen',
    branch: 'general',
    name: '自愈',
    cost: 260,
    effects: [{ type: 'regenMult', x: 1.6 }],
    req: [],
  },
  {
    id: 'ge_wild',
    branch: 'general',
    name: '野地筑巢',
    cost: 300,
    effects: [{ type: 'wildBuildMult', x: 2.5 }],
    req: [],
  },
  {
    id: 'ge_flowers',
    branch: 'general',
    name: '花海',
    cost: 380,
    effects: [
      { type: 'unlockBuilding', id: 'meadow' },
      { type: 'bubbleMult', x: 1.25 },
    ],
    req: [{ type: 'skill', id: 'ge_pollinate' }, { type: 'era', era: 2 }],
  },
  {
    id: 'ge_bats',
    branch: 'general',
    name: '夜行授粉',
    cost: 420,
    effects: [{ type: 'unlockBuilding', id: 'batcave' }],
    req: [{ type: 'skill', id: 'ge_pollinate' }, { type: 'era', era: 2 }],
  },
  {
    id: 'ge_spread',
    branch: 'general',
    name: '蔓生',
    cost: 520,
    effects: [{ type: 'spread', rate: 0.7 }],
    req: [{ type: 'era', era: 2 }],
  },
  {
    id: 'ge_burrows',
    branch: 'general',
    name: '狡兔三窟',
    cost: 600,
    effects: [{ type: 'capAdd', add: 3 }],
    req: [{ type: 'era', era: 2 }],
  },
  {
    id: 'ge_long',
    branch: 'general',
    name: '长寿',
    cost: 900,
    effects: [{ type: 'globalLife', x: 1.25 }],
    req: [{ type: 'era', era: 3 }],
  },
  {
    id: 'ge_overgrow',
    branch: 'general',
    name: '野蛮生长',
    cost: 1300,
    effects: [
      { type: 'convertMult', x: 1.4 },
      { type: 'incomeMult', x: 1.5 },
    ],
    req: [{ type: 'skill', id: 'ge_spread' }, { type: 'era', era: 3 }],
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const BRANCH_NAMES: Record<Branch, string> = {
  assassin: '刺客',
  swarm: '群体',
  hunter: '猎手',
  tank: '重坦',
  marine: '水军',
  general: '通用',
};

export function skillsOfBranch(branch: Branch): SkillDef[] {
  return SKILLS.filter((s) => s.branch === branch);
}
