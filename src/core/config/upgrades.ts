import type { CreatureId, UpgradeDef } from '../types.ts';
import { CREATURE_BY_ID } from './creatures.ts';

/** Price an upgrade relative to a creature's base cost, so retuning creatures moves upgrades with them. */
function at(id: CreatureId, mult: number): number {
  return CREATURE_BY_ID[id].baseCost * mult;
}

/** Two upgrades per creature: [name at owned ≥ 10, name at owned ≥ 50]. */
const CREATURE_UPGRADE_NAMES: Record<CreatureId, [string, string]> = {
  ant: ['加班许可证', '蚁穴学区房'],
  grasshopper: ['后腿深蹲', '蚱蜢团购'],
  wasp: ['毒针镀金', '野餐日历订阅'],
  beetle: ['大颚抛光', '拆装说明书'],
  mantis: ['螳臂进修', '车道承包'],
  crab: ['横行许可证', '钳子年卡'],
  jellyfish: ['透明伪装', '海滩包场'],
  eel: ['5G 口味', '海底装修队'],
  octopus: ['八爪多开', '集装箱万能钥匙'],
  shark: ['背鳍定制', '冲浪板回收计划'],
  rat: ['磨牙套餐', '下水道快速路'],
  pigeon: ['精准投放', '广场舞联盟'],
  fox: ['夜班补贴', '垃圾分类专家'],
  bear: ['取消冬眠', '蜂蜜无限续杯'],
  elephant: ['鼻子水枪', '瓷器店团购'],
  raptor: ['门把手研究', '群聊协同'],
  pteranodon: ['航线插队', '空中加油'],
  triceratops: ['三角形思维', '停车费拒付'],
  brachiosaurus: ['颈椎保养', '顶层观景台'],
  trex: ['短手臂健身', '董事会席位'],
};

export const CREATURE_UPGRADE_TIERS = [
  { owned: 10, costMult: 25, x: 2 },
  { owned: 50, costMult: 6_000, x: 3 },
] as const;

function creatureUpgrades(): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (const [id, names] of Object.entries(CREATURE_UPGRADE_NAMES) as [CreatureId, [string, string]][]) {
    const def = CREATURE_BY_ID[id];
    CREATURE_UPGRADE_TIERS.forEach((tier, i) => {
      out.push({
        id: `c_${id}_${i + 1}`,
        name: names[i] ?? '',
        kind: 'creature',
        era: def.era,
        cost: def.baseCost * tier.costMult,
        effects: [{ type: 'creatureMult', creature: id, x: tier.x }],
        req: [{ type: 'owned', creature: id, n: tier.owned }],
      });
    });
  }
  return out;
}

const HANDMADE: UpgradeDef[] = [
  // ── Era tickets ─────────────────────────────────────────────
  {
    id: 'era_2',
    name: '唤醒大海',
    kind: 'era',
    era: 1,
    cost: at('crab', 1),
    effects: [{ type: 'unlockEra', era: 2 }],
    req: [{ type: 'owned', creature: 'mantis', n: 1 }],
  },
  {
    id: 'era_3',
    name: '打开动物园',
    kind: 'era',
    era: 2,
    cost: at('rat', 1),
    effects: [{ type: 'unlockEra', era: 3 }],
    req: [{ type: 'owned', creature: 'shark', n: 1 }],
  },
  {
    id: 'era_4',
    name: '解冻琥珀',
    kind: 'era',
    era: 3,
    cost: at('elephant', 2),
    effects: [{ type: 'unlockEra', era: 4 }],
    req: [{ type: 'owned', creature: 'elephant', n: 1 }],
  },

  // ── Clicks ──────────────────────────────────────────────────
  {
    id: 'click_1',
    name: '手指热身',
    kind: 'click',
    era: 1,
    cost: 100,
    effects: [{ type: 'clickMult', x: 2 }],
    req: [{ type: 'runEarned', log10: 1.5 }],
  },
  {
    id: 'click_2',
    name: '精准叮咬',
    kind: 'click',
    era: 1,
    cost: 5_000,
    effects: [{ type: 'clickPct', add: 0.01 }],
    req: [{ type: 'runEarned', log10: 3 }],
  },
  {
    id: 'click_3',
    name: '连环叮咬',
    kind: 'click',
    era: 2,
    cost: at('crab', 20),
    effects: [{ type: 'clickPct', add: 0.01 }],
    req: [{ type: 'era', era: 2 }],
  },
  {
    id: 'click_4',
    name: '大力出奇迹',
    kind: 'click',
    era: 3,
    cost: at('rat', 20),
    effects: [{ type: 'clickPct', add: 0.02 }],
    req: [{ type: 'era', era: 3 }],
  },
  {
    id: 'click_5',
    name: '一指禅',
    kind: 'click',
    era: 4,
    cost: at('raptor', 20),
    effects: [{ type: 'clickPct', add: 0.03 }],
    req: [{ type: 'era', era: 4 }],
  },

  // ── Breeding (虫潮 mechanic) ───────────────────────────────
  {
    id: 'breed_unlock',
    name: '蚁后登基',
    kind: 'breeding',
    era: 1,
    cost: 1_500,
    effects: [{ type: 'unlockBreeding' }],
    req: [{ type: 'owned', creature: 'ant', n: 10 }],
  },
  {
    id: 'breed_2',
    name: '蜂王浆',
    kind: 'breeding',
    era: 1,
    cost: at('beetle', 3),
    effects: [{ type: 'breedMult', x: 1.5 }],
    req: [{ type: 'upgrade', id: 'breed_unlock' }, { type: 'owned', creature: 'beetle', n: 5 }],
  },
  {
    id: 'breed_3',
    name: '育儿补贴',
    kind: 'breeding',
    era: 2,
    cost: at('eel', 1),
    effects: [{ type: 'breedMult', x: 1.5 }],
    req: [{ type: 'upgrade', id: 'breed_2' }, { type: 'era', era: 2 }],
  },
  {
    id: 'breed_4',
    name: '集体宿舍',
    kind: 'breeding',
    era: 3,
    cost: at('pigeon', 1),
    effects: [{ type: 'breedMult', x: 2 }],
    req: [{ type: 'upgrade', id: 'breed_3' }, { type: 'era', era: 3 }],
  },

  // ── Tide (海啸 mechanic) ───────────────────────────────────
  {
    id: 'tide_unlock',
    name: '月亮签约',
    kind: 'tide',
    era: 2,
    cost: at('crab', 2),
    effects: [{ type: 'unlockTide' }],
    req: [{ type: 'owned', creature: 'crab', n: 1 }],
  },
  {
    id: 'tide_2',
    name: '大潮预报',
    kind: 'tide',
    era: 2,
    cost: at('jellyfish', 8),
    effects: [{ type: 'surgeDuration', add: 15 }],
    req: [{ type: 'upgrade', id: 'tide_unlock' }, { type: 'owned', creature: 'eel', n: 1 }],
  },
  {
    id: 'tide_3',
    name: '引力调校',
    kind: 'tide',
    era: 2,
    cost: at('octopus', 10),
    effects: [{ type: 'tideAmp', add: 0.5 }],
    req: [{ type: 'upgrade', id: 'tide_unlock' }, { type: 'owned', creature: 'octopus', n: 10 }],
  },
  {
    id: 'tide_4',
    name: '潮汐倒班',
    kind: 'tide',
    era: 3,
    cost: at('rat', 50),
    effects: [{ type: 'surgeCooldownMult', x: 0.6 }],
    req: [{ type: 'upgrade', id: 'tide_unlock' }, { type: 'era', era: 3 }],
  },

  // ── Era-wide and global multipliers ────────────────────────
  {
    id: 'g_1a',
    name: '虫群意识',
    kind: 'global',
    era: 1,
    cost: at('mantis', 1),
    effects: [{ type: 'eraMult', era: 1, x: 2 }],
    req: [{ type: 'owned', creature: 'mantis', n: 1 }],
  },
  {
    id: 'g_1b',
    name: '雨季来了',
    kind: 'global',
    era: 1,
    cost: at('mantis', 15),
    effects: [{ type: 'globalMult', x: 1.5 }],
    req: [{ type: 'owned', creature: 'mantis', n: 10 }],
  },
  {
    id: 'g_2a',
    name: '厄尔尼诺',
    kind: 'global',
    era: 2,
    cost: at('eel', 4),
    effects: [{ type: 'eraMult', era: 2, x: 2 }],
    req: [{ type: 'owned', creature: 'eel', n: 10 }],
  },
  {
    id: 'g_2b',
    name: '海平面上升',
    kind: 'global',
    era: 2,
    cost: at('shark', 12),
    effects: [{ type: 'globalMult', x: 1.5 }],
    req: [{ type: 'owned', creature: 'shark', n: 10 }],
  },
  {
    id: 'g_3a',
    name: '迁徙季',
    kind: 'global',
    era: 3,
    cost: at('fox', 12),
    effects: [{ type: 'eraMult', era: 3, x: 2 }],
    req: [{ type: 'owned', creature: 'fox', n: 10 }],
  },
  {
    id: 'g_3b',
    name: '保险拒赔',
    kind: 'global',
    era: 3,
    cost: at('elephant', 12),
    effects: [{ type: 'globalMult', x: 2 }],
    req: [{ type: 'owned', creature: 'elephant', n: 10 }],
  },
  {
    id: 'g_4a',
    name: '火山季',
    kind: 'global',
    era: 4,
    cost: at('triceratops', 12),
    effects: [{ type: 'eraMult', era: 4, x: 2 }],
    req: [{ type: 'owned', creature: 'triceratops', n: 10 }],
  },
  {
    id: 'g_4b',
    name: '陨石预警',
    kind: 'global',
    era: 4,
    cost: at('trex', 12),
    effects: [{ type: 'globalMult', x: 2 }],
    req: [{ type: 'owned', creature: 'trex', n: 10 }],
  },

  // ── Ending ─────────────────────────────────────────────────
  {
    id: 'ending',
    name: '人类账单结清',
    kind: 'ending',
    era: 4,
    cost: at('trex', 3e7),
    effects: [{ type: 'ending' }],
    req: [{ type: 'owned', creature: 'trex', n: 25 }, { type: 'notEnded' }],
  },
];

export const UPGRADES: readonly UpgradeDef[] = [...HANDMADE, ...creatureUpgrades()];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
