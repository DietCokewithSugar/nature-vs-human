import type { NatureUnitId } from '../types.ts';

/**
 * The three-choose-one rewards after each stage. Effects stack additively per kind
 * (two cards of +30% are +60%) and last for the rest of the run.
 */
export type PickEffect =
  | { kind: 'unitHp'; unit: NatureUnitId; add: number }
  | { kind: 'unitAtk'; unit: NatureUnitId; add: number }
  | { kind: 'unitSpeed'; add: number }
  | { kind: 'spawnRate'; add: number }
  | { kind: 'grass'; add: number }
  | { kind: 'meatYield'; add: number }
  | { kind: 'predatorEat'; add: number }
  | { kind: 'bounty'; add: number }
  | { kind: 'buildingHp'; add: number }
  | { kind: 'income'; add: number }
  | { kind: 'packBonus'; add: number }
  | { kind: 'chargeMult'; add: number }
  | { kind: 'towerDmg'; add: number }
  | { kind: 'antBuilding'; add: number };

export interface PickDef {
  id: string;
  name: string;
  desc: string;
  /** Which group the card is drawn in (colour on the card). */
  group: 'species' | 'chain' | 'all';
  /** Species this card is about: offered more often when you keep that species. */
  about?: NatureUnitId;
  effect: PickEffect;
}

export const PICKS: readonly PickDef[] = [
  { id: 'soldierAnts', name: '兵蚁', desc: '蚂蚁血量 +50%', group: 'species', about: 'ant', effect: { kind: 'unitHp', unit: 'ant', add: 0.5 } },
  { id: 'demolition', name: '工蚁拆迁', desc: '蚂蚁拆建筑的伤害再 +1 倍', group: 'species', about: 'ant', effect: { kind: 'antBuilding', add: 1 } },
  { id: 'antlers', name: '鹿角冲锋', desc: '大角鹿冲锋伤害 +2 倍', group: 'species', about: 'elk', effect: { kind: 'chargeMult', add: 2 } },
  { id: 'elkHide', name: '冬毛', desc: '大角鹿血量 +40%', group: 'species', about: 'elk', effect: { kind: 'unitHp', unit: 'elk', add: 0.4 } },
  { id: 'woolly', name: '厚毛', desc: '猛犸血量 +40%', group: 'species', about: 'mammoth', effect: { kind: 'unitHp', unit: 'mammoth', add: 0.4 } },
  { id: 'tusks', name: '长牙', desc: '猛犸攻击 +35%', group: 'species', about: 'mammoth', effect: { kind: 'unitAtk', unit: 'mammoth', add: 0.35 } },
  { id: 'packTactics', name: '狼群战术', desc: '狼的群体加成翻倍', group: 'species', about: 'wolf', effect: { kind: 'packBonus', add: 1 } },
  { id: 'fangs', name: '利齿', desc: '狼攻击 +35%', group: 'species', about: 'wolf', effect: { kind: 'unitAtk', unit: 'wolf', add: 0.35 } },
  { id: 'sabers', name: '剑齿', desc: '剑齿虎攻击 +40%', group: 'species', about: 'sabertooth', effect: { kind: 'unitAtk', unit: 'sabertooth', add: 0.4 } },
  { id: 'saberHide', name: '斑纹皮', desc: '剑齿虎血量 +40%', group: 'species', about: 'sabertooth', effect: { kind: 'unitHp', unit: 'sabertooth', add: 0.4 } },
  { id: 'hibernate', name: '冬眠脂肪', desc: '洞熊血量 +50%', group: 'species', about: 'bear', effect: { kind: 'unitHp', unit: 'bear', add: 0.5 } },
  { id: 'paws', name: '熊掌', desc: '洞熊攻击 +40%', group: 'species', about: 'bear', effect: { kind: 'unitAtk', unit: 'bear', add: 0.4 } },
  { id: 'lushMeadows', name: '丰美草场', desc: '产草 +30%', group: 'chain', effect: { kind: 'grass', add: 0.3 } },
  { id: 'herds', name: '繁茂鹿群', desc: '食草动物产肉 +40%', group: 'chain', effect: { kind: 'meatYield', add: 0.4 } },
  { id: 'apex', name: '顶级掠食者', desc: '食肉动物吃得少 25%', group: 'chain', effect: { kind: 'predatorEat', add: 0.25 } },
  { id: 'humus', name: '腐殖', desc: '杀人、拆房给的生机 +50%', group: 'chain', effect: { kind: 'bounty', add: 0.5 } },
  { id: 'sap', name: '母树之泉', desc: '生机产出 +25%', group: 'chain', effect: { kind: 'income', add: 0.25 } },
  { id: 'migration', name: '迁徙', desc: '全体移速 +15%', group: 'all', effect: { kind: 'unitSpeed', add: 0.15 } },
  { id: 'breeding', name: '繁殖季', desc: '所有窝出兵快 20%', group: 'all', effect: { kind: 'spawnRate', add: 0.2 } },
  { id: 'deepRoots', name: '深根', desc: '所有建筑血量 +40%', group: 'all', effect: { kind: 'buildingHp', add: 0.4 } },
  { id: 'pinecones', name: '硬松果', desc: '母树和古树的伤害 +50%', group: 'all', effect: { kind: 'towerDmg', add: 0.5 } },
];

export const PICK_BY_ID: Record<string, PickDef> = Object.fromEntries(PICKS.map((p) => [p.id, p]));
