/** Permanent upgrades bought with genes between runs. */
export type TalentId = 'soil' | 'roots' | 'claws' | 'hides' | 'bloom' | 'choice';

export interface TalentDef {
  id: TalentId;
  name: string;
  /** What one level gives, as shown on the card. */
  desc: (level: number) => string;
  max: number;
  /** Gene price of the next level: base × growth^level. */
  base: number;
  growth: number;
  /** Per level. */
  per: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const TALENTS: Record<TalentId, TalentDef> = {
  soil: { id: 'soil', name: '沃土', desc: (l) => `开局生机 +${l * 80}`, max: 20, base: 4, growth: 1.45, per: 80 },
  roots: { id: 'roots', name: '根系', desc: (l) => `母树血量 +${pct(l * 0.15)}`, max: 20, base: 5, growth: 1.5, per: 0.15 },
  claws: { id: 'claws', name: '利爪', desc: (l) => `全体攻击 +${pct(l * 0.08)}`, max: 30, base: 6, growth: 1.5, per: 0.08 },
  hides: { id: 'hides', name: '皮毛', desc: (l) => `全体血量 +${pct(l * 0.08)}`, max: 30, base: 6, growth: 1.5, per: 0.08 },
  bloom: { id: 'bloom', name: '繁茂', desc: (l) => `产草 +${pct(l * 0.1)}`, max: 20, base: 5, growth: 1.5, per: 0.1 },
  choice: { id: 'choice', name: '天择', desc: (l) => `每关三选一可以换一批：${l} 次`, max: 3, base: 15, growth: 2.5, per: 1 },
};

export const TALENT_IDS = Object.keys(TALENTS) as TalentId[];

export function talentCost(id: TalentId, level: number): number {
  const t = TALENTS[id];
  return Math.ceil(t.base * Math.pow(t.growth, level));
}
