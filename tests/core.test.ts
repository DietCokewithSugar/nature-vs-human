import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  CREATURES,
  D,
  Game,
  UPGRADES,
  createState,
  creatureCost,
  creatureCostN,
  deserialize,
  effectiveGenes,
  exportSave,
  formatDuration,
  formatNumber,
  genesForLifetime,
  importSave,
  maxAffordable,
  serialize,
  tideLevel,
} from '../src/core/index.ts';

describe('economy formulas', () => {
  it('cost grows by 1.15 per owned unit', () => {
    expect(creatureCost('ant', 0).toNumber()).toBeCloseTo(15);
    expect(creatureCost('ant', 10).toNumber()).toBeCloseTo(15 * 1.15 ** 10, 6);
  });

  it('bulk cost equals the sum of single costs', () => {
    let sum = 0;
    for (let i = 7; i < 17; i++) sum += creatureCost('wasp', i).toNumber();
    expect(creatureCostN('wasp', 7, 10).toNumber()).toBeCloseTo(sum, 3);
  });

  it('max affordable never overspends and is tight', () => {
    for (const money of [14, 15, 100, 12345, 9.87e9]) {
      const n = maxAffordable('ant', 3, D(money));
      expect(creatureCostN('ant', 3, n).lte(money)).toBe(true);
      expect(creatureCostN('ant', 3, n + 1).gt(money)).toBe(true);
    }
  });

  it('gene bonus is linear up to the softcap and slower after it', () => {
    const cap = BALANCE.genes.softcap;
    expect(effectiveGenes(cap / 2)).toBe(cap / 2);
    expect(effectiveGenes(cap * 4)).toBeCloseTo(cap * 2);
  });

  it('genes follow the cube root of lifetime damage', () => {
    expect(genesForLifetime(D(BALANCE.genes.base))).toBe(1);
    expect(genesForLifetime(D(BALANCE.genes.base * 8))).toBe(2);
    expect(genesForLifetime(D(BALANCE.genes.base * 999))).toBe(9);
    expect(genesForLifetime(D(0))).toBe(0);
  });

  it('creature tiers are strictly more expensive and productive', () => {
    for (let i = 1; i < CREATURES.length; i++) {
      expect(CREATURES[i]!.baseCost).toBeGreaterThan(CREATURES[i - 1]!.baseCost);
      expect(CREATURES[i]!.baseProd).toBeGreaterThan(CREATURES[i - 1]!.baseProd);
    }
  });

  it('upgrade ids are unique', () => {
    const ids = new Set(UPGRADES.map((u) => u.id));
    expect(ids.size).toBe(UPGRADES.length);
  });
});

describe('game loop', () => {
  it('clicking earns money and buying spends it', () => {
    const g = new Game();
    for (let i = 0; i < 15; i++) g.click();
    expect(g.state.money.toNumber()).toBe(15);
    expect(g.buyCreature('ant', 1)).toBe(1);
    expect(g.state.money.toNumber()).toBeCloseTo(0);
    g.advance(10);
    const ant = CREATURES[0]!.baseProd;
    expect(g.state.money.toNumber()).toBeCloseTo(10 * ant, 5);
    expect(g.state.lifetimeEarned.toNumber()).toBeCloseTo(15 + 10 * ant, 5);
  });

  it('one long advance matches many short ones', () => {
    const a = new Game();
    const b = new Game();
    for (const g of [a, b]) {
      g.state.money = D(1e9);
      g.buyCreature('ant', 50);
      g.buyCreature('wasp', 20);
      g.buyUpgrade('breed_unlock');
      g.state.queens = 3;
      g.refreshMods();
    }
    a.advance(3600);
    for (let i = 0; i < 3600 * 20; i++) b.advance(0.05);
    const ra = a.state.money.toNumber();
    const rb = b.state.money.toNumber();
    expect(Math.abs(ra - rb) / rb).toBeLessThan(1e-6);
    expect(a.state.creatures.ant.bred).toBeCloseTo(b.state.creatures.ant.bred, 3);
  });

  it('tide integral matches fine-grained sampling', () => {
    const a = new Game();
    const b = new Game();
    for (const g of [a, b]) {
      g.state.era = 2;
      g.state.money = D(1e8);
      g.buyCreature('crab', 5);
      g.buyUpgrade('tide_unlock');
    }
    a.advance(437);
    for (let i = 0; i < 437 * 50; i++) b.advance(0.02);
    expect(a.state.money.div(b.state.money).toNumber()).toBeCloseTo(1, 6);
    expect(tideLevel(0)).toBeCloseTo(0);
    expect(tideLevel(BALANCE.tide.period / 2)).toBeCloseTo(1);
  });

  it('surge boosts ocean output and then cools down', () => {
    const g = new Game();
    g.state.era = 2;
    g.state.money = D(1e8);
    g.buyCreature('crab', 1);
    g.buyUpgrade('tide_unlock');
    const before = g.income().toNumber();
    expect(g.surge()).toBe(true);
    expect(g.income().toNumber()).toBeGreaterThan(before * 3);
    expect(g.surge()).toBe(false);
    g.advance(BALANCE.tide.surgeCooldown + 1);
    expect(g.surge()).toBe(true);
  });

  it('era tickets unlock the next era and record the dino time', () => {
    const g = new Game();
    g.state.money = D('1e30');
    g.state.creatures.mantis.bought = 1;
    expect(g.buyUpgrade('era_2')).toBe(true);
    expect(g.state.era).toBe(2);
    g.state.creatures.shark.bought = 1;
    g.buyUpgrade('era_3');
    g.state.creatures.elephant.bought = 1;
    g.state.playTime = 1234;
    g.buyUpgrade('era_4');
    expect(g.state.era).toBe(4);
    expect(g.state.dinoAt).toBe(1234);
    expect(g.state.bestEra).toBe(4);
  });

  it('evolution resets the run and keeps genes', () => {
    const g = new Game();
    g.state.money = D(1e20);
    g.state.lifetimeEarned = D(BALANCE.genes.base * 1000);
    g.state.runEarned = D(1e20);
    g.buyCreature('ant', 10);
    const gain = g.genesOnEvolve();
    expect(gain).toBe(10);
    expect(g.evolve()).toBe(true);
    expect(g.state.genes).toBe(10);
    expect(g.state.creatures.ant.bought).toBe(0);
    expect(g.state.money.toNumber()).toBe(0);
    expect(g.state.evolutions).toBe(1);
    expect(g.mods.geneMult).toBeCloseTo(1 + 10 * BALANCE.genes.power);
    expect(g.evolve()).toBe(false);
  });

  it('gene shop spends genes and applies on next run', () => {
    const g = new Game();
    g.state.genes = 100;
    expect(g.buyGene('headstart')).toBe(true);
    expect(g.buyGene('headstart')).toBe(true);
    expect(g.state.genesSpent).toBe(32);
    g.state.lifetimeEarned = D(BALANCE.genes.base * 200 ** 3);
    g.evolve();
    expect(g.state.money.toNumber()).toBe(1e7);
  });

  it('autobuy spends money on the unlocked era', () => {
    const g = new Game();
    g.state.genes = 10;
    g.buyGene('auto1');
    g.state.money = D(1e6);
    g.advance(0.05);
    const owned = CREATURES.filter((c) => c.era === 1).reduce((n, c) => n + g.state.creatures[c.id].bought, 0);
    expect(owned).toBeGreaterThan(10);
    expect(g.state.creatures.crab.bought).toBe(0);
  });
});

describe('save', () => {
  it('round-trips through JSON and export strings', () => {
    const g = new Game();
    g.state.money = D('1.5e123');
    g.state.lifetimeEarned = D('2e130');
    g.state.creatures.trex.bought = 3;
    g.state.upgrades['era_2'] = true;
    g.state.geneLevels['select'] = 2;
    const json = JSON.parse(JSON.stringify(serialize(g.state)));
    const back = deserialize(json);
    expect(back.money.eq(g.state.money)).toBe(true);
    expect(back.creatures.trex.bought).toBe(3);
    expect(back.upgrades['era_2']).toBe(true);
    expect(back.geneLevels['select']).toBe(2);
    const again = importSave(exportSave(g.state));
    expect(again.lifetimeEarned.eq(g.state.lifetimeEarned)).toBe(true);
  });

  it('sanitises hostile input', () => {
    const s = deserialize({ money: 'NaN', creatures: { ant: { bought: -5 } }, era: 99, genes: 'lots' });
    expect(s.money.toNumber()).toBe(0);
    expect(s.creatures.ant.bought).toBe(0);
    expect(s.era).toBe(1);
    expect(s.genes).toBe(0);
    expect(() => importSave('garbage')).toThrow();
    expect(createState().version).toBe(1);
  });
});

describe('format', () => {
  it('uses short-scale English suffixes', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(12_345)).toBe('12.3K');
    expect(formatNumber(123_456)).toBe('123K');
    expect(formatNumber(1e6)).toBe('1M');
    expect(formatNumber(4.5e15)).toBe('4.5Qa');
    expect(formatNumber(D('1.234e105'))).toBe('1.23e105');
    expect(formatNumber(2.5)).toBe('2.5');
  });

  it('formats durations', () => {
    expect(formatDuration(9)).toBe('9 秒');
    expect(formatDuration(309)).toBe('5:09');
    expect(formatDuration(3909)).toBe('1:05:09');
  });
});
