import type { CreatureId, EraId, UpgradeDef } from '../types.ts';
import { CREATURE_BY_ID, creaturesOfEra } from './creatures.ts';

/** Price relative to a creature's base cost, so retuning creatures moves everything with them. */
export function at(id: CreatureId, mult: number): number {
  return CREATURE_BY_ID[id].baseCost * mult;
}

/** Two boosts per creature: [at owned ≥ 10, at owned ≥ 40]. */
const NAMES: Record<CreatureId, [string, string]> = {
  ant: ['加班许可证', '蚁穴学区房'],
  wolf: ['嚎叫排练', '狼群群聊'],
  sabertooth: ['牙齿美白', '冰河限定款'],
  cavebear: ['取消冬眠', '山洞二房东'],
  mammoth: ['长毛护理', '冰原拆迁令'],
  locust: ['蝗虫团购', '遮天蔽日'],
  rat: ['磨牙套餐', '下水道快速路'],
  wildcat: ['夜视升级', '九条命保险'],
  boar: ['獠牙抛光', '拱地专利'],
  crocodile: ['眼泪表演课', '护城河承包'],
  mosquito: ['口器延长', '夜班补贴'],
  pigeon: ['精准投放', '广场舞联盟'],
  octopus: ['八爪多开', '集装箱万能钥匙'],
  shark: ['背鳍定制', '冲浪板回收计划'],
  bison: ['铁轨踩踏', '草原回归'],
  termite: ['承重墙品鉴', '木地板自助餐'],
  crow: ['闪亮物件收藏', '垃圾袋拆封术'],
  tiger: ['条纹迷彩', '山大王执照'],
  rhino: ['鼻角打磨', '推土机模式'],
  elephant: ['鼻子水枪', '瓷器店团购'],
};

export const CREATURE_UPGRADE_TIERS = [
  { owned: 10, costMult: 25, x: 2 },
  { owned: 40, costMult: 2_500, x: 3 },
] as const;

function creatureUpgrades(): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (const [id, names] of Object.entries(NAMES) as [CreatureId, [string, string]][]) {
    const def = CREATURE_BY_ID[id];
    CREATURE_UPGRADE_TIERS.forEach((tier, i) => {
      out.push({
        id: `c_${id}_${i + 1}`,
        name: names[i]!,
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

const TICKET_NAMES: Record<2 | 3 | 4, string> = { 2: '冰川消融', 3: '蒸汽轰鸣', 4: '霓虹亮起' };

/** Era tickets: priced like the first creature of the next era, unlocked by owning the last of this one. */
function tickets(): UpgradeDef[] {
  return ([2, 3, 4] as const).map((era) => {
    const prev = creaturesOfEra((era - 1) as EraId);
    const next = creaturesOfEra(era)[0]!;
    return {
      id: `era_${era}`,
      name: TICKET_NAMES[era],
      kind: 'era',
      era: (era - 1) as EraId,
      cost: next.baseCost * 0.4,
      effects: [{ type: 'unlockEra', era }],
      req: [{ type: 'owned', creature: prev[prev.length - 1]!.id, n: 1 }],
    } satisfies UpgradeDef;
  });
}

export const UPGRADES: readonly UpgradeDef[] = [...tickets(), ...creatureUpgrades()];
export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
