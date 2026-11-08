import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { CELLS, NODES, isOpen } from '../map/grid.ts';
import type { RunState } from '../state.ts';
import { rand, type Ctx } from './ctx.ts';
import type { World } from './world.ts';
import { NATURE } from './world.ts';
import type { Mods } from '../modifiers.ts';

const E = BALANCE.economy;

/** Nature's passive 自然之元 per second: every cell it holds breathes a little. */
export function natureIncome(world: World, mods: Mods): number {
  return world.held.nature * E.naturePerCell * mods.incomeMult;
}

/** The humans' income per second: ground, resource points, money-making buildings and pigs. */
export function humanIncome(run: RunState, world: World): number {
  let x = E.humanBase[run.era - 1]! + world.held.human * E.humanPerCell + world.nodesHeld(run, 'human') * E.humanPerNode;
  for (const b of run.buildings) {
    if (b.side !== 'human' || b.build < 1) continue;
    x += BUILDINGS[b.kind].income ?? 0;
  }
  for (const u of run.units) {
    if (u.kind === 'pig') x += E.pigIncome;
    else if (u.kind === 'plane') x += E.planeIncome;
  }
  const share = world.held.total ? world.held.nature / world.held.total : 0;
  const panic = 1 + E.panicWeight * Math.max(0, share - E.panicFrom);
  return x * panic * BALANCE.difficulty[run.difficulty].income;
}

/** Value of one bubble in this era. */
export function bubbleValue(run: RunState, mods: Mods): number {
  return Math.round(E.bubble.value[run.era - 1]! * mods.bubbleMult);
}

export function stepEconomy(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  const gain = natureIncome(world, mods) * dt;
  run.essence += gain;
  run.earned += gain;
  run.humanEssence += humanIncome(run, world) * dt;

  // Bubbles well up at the resource points nature holds.
  if (run.nodeTimers.length !== NODES.length) run.nodeTimers = NODES.map(() => rand(ctx) * 8);
  NODES.forEach((node, i) => {
    if (!isOpen(run.era, node.cell) || run.owner[node.cell] !== NATURE) return;
    run.nodeTimers[i] = run.nodeTimers[i]! - dt * mods.bubbleRate;
    if (run.nodeTimers[i]! > 0) return;
    const [lo, hi] = E.bubble.gap;
    run.nodeTimers[i] = lo + (hi - lo) * rand(ctx);
    if (run.bubbles.some((b) => b.node === i)) return;
    run.bubbles.push({ id: run.nextId++, node: i, value: bubbleValue(run, mods), left: E.bubble.life, claimed: 0 });
  });
  for (const b of run.bubbles) {
    b.left -= dt;
    if (b.claimed && !world.units.has(b.claimed)) b.claimed = 0;
  }
  if (run.bubbles.some((b) => b.left <= 0)) run.bubbles = run.bubbles.filter((b) => b.left > 0);
}

/** Pick a bubble up. Returns its value (0 if it is gone). */
export function collectBubble(ctx: Ctx, id: number, by: 'tap' | 'pollinator'): number {
  const { run } = ctx;
  const b = run.bubbles.find((x) => x.id === id);
  if (!b) return 0;
  run.bubbles = run.bubbles.filter((x) => x.id !== id);
  run.essence += b.value;
  run.earned += b.value;
  run.stats.bubbles++;
  const c = CELLS[NODES[b.node]!.cell]!;
  ctx.emit({ type: 'collected', value: b.value, by, x: c.x, z: c.z });
  return b.value;
}
