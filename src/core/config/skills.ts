import type { Branch, SkillDef } from '../types.ts';
import { at } from './upgrades.ts';

/**
 * In-run skill tree, bought with damage. One line per class plus a general line.
 * Fork pairs are exclusive within a run; side B starts locked and is unlocked with meta points.
 */
export const SKILLS: readonly SkillDef[] = [
  // ── 刺客 ─────────────────────────────────────────────────────
  {
    id: 'as_swarm',
    branch: 'assassin',
    name: '成群结队',
    cost: at('ant', 40),
    effects: [{ type: 'classMult', cls: 'assassin', x: 2 }],
    req: [{ type: 'owned', creature: 'ant', n: 10 }],
  },
  {
    id: 'as_resist',
    branch: 'assassin',
    name: '抗药性',
    cost: at('locust', 4),
    effects: [{ type: 'classResist', cls: 'assassin', add: 0.4 }],
    req: [{ type: 'skill', id: 'as_swarm' }, { type: 'era', era: 2 }],
  },
  {
    id: 'as_virus',
    branch: 'assassin',
    name: '携带病毒',
    cost: at('mosquito', 6),
    effects: [
      { type: 'globalMult', x: 1.5 },
      { type: 'researchMult', x: 1.15 },
    ],
    req: [{ type: 'skill', id: 'as_resist' }, { type: 'owned', creature: 'mosquito', n: 1 }],
    fork: { group: 'assassin', side: 'A' },
  },
  {
    id: 'as_panic',
    branch: 'assassin',
    name: '精神污染',
    cost: at('mosquito', 6),
    effects: [
      { type: 'classMult', cls: 'assassin', x: 1.5 },
      { type: 'researchMult', x: 0.85 },
    ],
    req: [{ type: 'skill', id: 'as_resist' }, { type: 'owned', creature: 'mosquito', n: 1 }],
    fork: { group: 'assassin', side: 'B' },
  },
  {
    id: 'as_chain',
    branch: 'assassin',
    name: '传播链',
    cost: at('termite', 4),
    effects: [{ type: 'classMult', cls: 'assassin', x: 3 }],
    req: [{ type: 'fork', group: 'assassin' }, { type: 'era', era: 4 }],
  },

  // ── 群体 ─────────────────────────────────────────────────────
  {
    id: 'sw_nest',
    branch: 'swarm',
    name: '繁殖巢',
    cost: at('locust', 3),
    effects: [{ type: 'unlockBreeding' }],
    req: [{ type: 'owned', creature: 'locust', n: 5 }],
  },
  {
    id: 'sw_fertile',
    branch: 'swarm',
    name: '多产',
    cost: at('rat', 8),
    effects: [{ type: 'breedMult', x: 2 }],
    req: [{ type: 'skill', id: 'sw_nest' }, { type: 'owned', creature: 'rat', n: 5 }],
  },
  {
    id: 'sw_plague',
    branch: 'swarm',
    name: '鼠疫',
    cost: at('rat', 40),
    effects: [
      { type: 'classMult', cls: 'swarm', x: 1.5 },
      { type: 'researchMult', x: 0.9 },
    ],
    req: [{ type: 'owned', creature: 'rat', n: 15 }],
  },
  {
    id: 'sw_cloud',
    branch: 'swarm',
    name: '遮天蔽日',
    cost: at('pigeon', 8),
    effects: [{ type: 'classMult', cls: 'swarm', x: 3 }],
    req: [{ type: 'skill', id: 'sw_fertile' }, { type: 'era', era: 3 }],
  },

  // ── 猎手 ─────────────────────────────────────────────────────
  {
    id: 'hu_wild',
    branch: 'hunter',
    name: '野性难驯',
    cost: at('wolf', 3),
    effects: [{ type: 'domesticationMult', x: 0.6 }],
    req: [{ type: 'owned', creature: 'wolf', n: 1 }],
  },
  {
    id: 'hu_rescue',
    branch: 'hunter',
    name: '解救',
    cost: at('wolf', 15),
    effects: [{ type: 'unlockActive', id: 'rescue' }],
    req: [{ type: 'skill', id: 'hu_wild' }],
  },
  {
    id: 'hu_pack',
    branch: 'hunter',
    name: '狼群战术',
    cost: at('sabertooth', 20),
    effects: [{ type: 'classMult', cls: 'hunter', x: 2 }],
    req: [{ type: 'owned', creature: 'wolf', n: 10 }],
  },
  {
    id: 'hu_king',
    branch: 'hunter',
    name: '百兽之王',
    cost: at('mosquito', 30),
    effects: [
      { type: 'classMult', cls: 'hunter', x: 3 },
      { type: 'classResist', cls: 'hunter', add: 0.2 },
    ],
    req: [{ type: 'skill', id: 'hu_pack' }, { type: 'era', era: 3 }],
  },
  {
    id: 'hu_tiger',
    branch: 'hunter',
    name: '趋同进化：剑齿虎 → 老虎',
    cost: at('tiger', 2),
    effects: [{ type: 'convert', from: 'sabertooth', to: 'tiger' }],
    req: [{ type: 'era', era: 4 }, { type: 'owned', creature: 'sabertooth', n: 1 }],
  },

  // ── 重坦 ─────────────────────────────────────────────────────
  {
    id: 'tk_hide',
    branch: 'tank',
    name: '厚皮',
    cost: at('cavebear', 8),
    effects: [
      { type: 'classMult', cls: 'tank', x: 1.5 },
      { type: 'classResist', cls: 'tank', add: 0.15 },
    ],
    req: [{ type: 'owned', creature: 'cavebear', n: 5 }],
  },
  {
    id: 'tk_armor',
    branch: 'tank',
    name: '重甲',
    cost: at('boar', 10),
    effects: [
      { type: 'classMult', cls: 'tank', x: 1.5 },
      { type: 'classResist', cls: 'tank', add: 0.3 },
    ],
    req: [{ type: 'skill', id: 'tk_hide' }, { type: 'era', era: 2 }],
    fork: { group: 'tank', side: 'A' },
  },
  {
    id: 'tk_stomp',
    branch: 'tank',
    name: '践踏',
    cost: at('boar', 10),
    effects: [
      { type: 'classMult', cls: 'tank', x: 3 },
      { type: 'classResist', cls: 'tank', add: -0.2 },
    ],
    req: [{ type: 'skill', id: 'tk_hide' }, { type: 'era', era: 2 }],
    fork: { group: 'tank', side: 'B' },
  },
  {
    id: 'tk_rampage',
    branch: 'tank',
    name: '暴走',
    cost: at('bison', 3),
    effects: [{ type: 'unlockActive', id: 'rampage' }],
    req: [{ type: 'fork', group: 'tank' }, { type: 'era', era: 3 }],
  },
  {
    id: 'tk_elephant',
    branch: 'tank',
    name: '趋同进化：猛犸 → 大象',
    cost: at('elephant', 2),
    effects: [{ type: 'convert', from: 'mammoth', to: 'elephant' }],
    req: [{ type: 'era', era: 4 }, { type: 'owned', creature: 'mammoth', n: 1 }],
  },

  // ── 水军 ─────────────────────────────────────────────────────
  {
    id: 'ma_moon',
    branch: 'marine',
    name: '月亮签约',
    cost: at('crocodile', 2),
    effects: [{ type: 'unlockTide' }, { type: 'unlockActive', id: 'surge' }],
    req: [{ type: 'owned', creature: 'crocodile', n: 1 }],
  },
  {
    id: 'ma_forecast',
    branch: 'marine',
    name: '大潮预报',
    cost: at('octopus', 4),
    effects: [{ type: 'surgeDuration', add: 15 }],
    req: [{ type: 'skill', id: 'ma_moon' }, { type: 'owned', creature: 'octopus', n: 1 }],
  },
  {
    id: 'ma_gravity',
    branch: 'marine',
    name: '引力调校',
    cost: at('shark', 8),
    effects: [{ type: 'tideAmp', add: 0.5 }],
    req: [{ type: 'skill', id: 'ma_forecast' }],
  },
  {
    id: 'ma_shift',
    branch: 'marine',
    name: '潮汐倒班',
    cost: at('crow', 6),
    effects: [{ type: 'surgeCooldownMult', x: 0.6 }],
    req: [{ type: 'skill', id: 'ma_gravity' }, { type: 'era', era: 4 }],
  },

  // ── 通用 ─────────────────────────────────────────────────────
  {
    id: 'ge_finger',
    branch: 'general',
    name: '手指热身',
    cost: 100,
    effects: [{ type: 'clickMult', x: 2 }],
    req: [{ type: 'runEarned', log10: 1.5 }],
  },
  {
    id: 'ge_bite',
    branch: 'general',
    name: '精准叮咬',
    cost: 4_000,
    effects: [{ type: 'clickPct', add: 0.01 }],
    req: [{ type: 'runEarned', log10: 3 }],
  },
  {
    id: 'ge_night',
    branch: 'general',
    name: '夜行',
    cost: at('cavebear', 3),
    effects: [{ type: 'researchMult', x: 0.9 }],
    req: [{ type: 'runEarned', log10: 4 }],
  },
  {
    id: 'ge_rain',
    branch: 'general',
    name: '雨季来了',
    cost: at('mammoth', 3),
    effects: [{ type: 'globalMult', x: 1.5 }],
    req: [{ type: 'owned', creature: 'mammoth', n: 1 }],
  },
  {
    id: 'ge_disguise',
    branch: 'general',
    name: '伪装',
    cost: at('rat', 10),
    effects: [{ type: 'researchMult', x: 0.85 }],
    req: [{ type: 'skill', id: 'ge_night' }, { type: 'era', era: 2 }],
  },
  {
    id: 'ge_sabotage',
    branch: 'general',
    name: '捣毁实验室',
    cost: at('wildcat', 10),
    effects: [{ type: 'unlockActive', id: 'sabotage' }],
    req: [{ type: 'era', era: 2 }],
  },
  {
    id: 'ge_sea',
    branch: 'general',
    name: '海平面上升',
    cost: at('octopus', 10),
    effects: [{ type: 'globalMult', x: 2 }],
    req: [{ type: 'era', era: 3 }],
  },
  {
    id: 'ge_strength',
    branch: 'general',
    name: '大力出奇迹',
    cost: at('pigeon', 10),
    effects: [{ type: 'clickPct', add: 0.02 }],
    req: [{ type: 'era', era: 3 }],
  },
  {
    id: 'ge_insurance',
    branch: 'general',
    name: '保险拒赔',
    cost: at('crow', 10),
    effects: [{ type: 'globalMult', x: 2 }],
    req: [{ type: 'era', era: 4 }],
  },
  {
    id: 'ge_wipe',
    branch: 'general',
    name: '数据删除',
    cost: at('tiger', 10),
    effects: [{ type: 'researchMult', x: 0.85 }],
    req: [{ type: 'skill', id: 'ge_disguise' }, { type: 'era', era: 4 }],
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillsOfBranch(branch: Branch): SkillDef[] {
  return SKILLS.filter((s) => s.branch === branch);
}

export const BRANCH_NAMES: Record<Branch, string> = {
  assassin: '刺客',
  swarm: '群体',
  hunter: '猎手',
  tank: '重坦',
  marine: '水军',
  general: '通用',
};
