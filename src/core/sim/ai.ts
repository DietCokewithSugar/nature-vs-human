import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { CELL, GRID, cellAt, idx } from '../map/grid.ts';
import type { RunState } from '../state.ts';
import type { HumanBuildingId } from '../types.ts';
import { addBuilding, canPlace, mainOf, rand, type Ctx } from './ctx.ts';
import { humanFood } from './economy.ts';

/** The buildings the humans start each stage with round the capital, besides the capital itself. */
export function humanOpening(stage: number): HumanBuildingId[] {
  const list: HumanBuildingId[] = ['rack'];
  if (stage >= 2) list.push('spearcamp', 'javelincamp');
  if (stage >= 3) list.push('tower', 'spearcamp');
  if (stage >= 4) list.push('firepit', 'rack');
  if (stage >= 5) list.push('tower', 'tower');
  if (stage >= 6) list.push('javelincamp', 'firepit');
  return list;
}

export function humanCost(run: RunState, kind: HumanBuildingId): number {
  const def = BUILDINGS[kind];
  const n = run.buildings.filter((b) => b.side === 'human' && b.kind === kind).length;
  return Math.ceil(def.cost * Math.pow(def.costGrowth, n));
}

/** The free human-held cell nearest a map point where this kind fits, within `maxR` cells. */
export function humanSpot(run: RunState, kind: HumanBuildingId, x: number, y: number, maxR = 14): number | null {
  const cx0 = Math.floor(x / CELL);
  const cy0 = Math.floor(y / CELL);
  const cands: [number, number][] = [];
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const cx = cx0 + dx;
      const cy = cy0 + dy;
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
      const d = dx * dx + dy * dy;
      if (d > maxR * maxR) continue;
      cands.push([idx(cx, cy), d]);
    }
  }
  cands.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [c] of cands) if (canPlace(run, 'human', kind, c)) return c;
  return null;
}

/** Where nature presses the humans: weight and centre of nature's units on or near human ground. */
function pressure(run: RunState): { weight: number; x: number; y: number } {
  const capital = mainOf(run, 'human');
  let w = 0;
  let sx = 0;
  let sy = 0;
  for (const u of run.units) {
    if (u.side !== 'nature') continue;
    const c = cellAt(u.x, u.y);
    const onHuman = c >= 0 && run.control[c]! < 0;
    const nearCapital = capital ? Math.hypot(u.x - capital.x, u.y - capital.y) < 10 * CELL : false;
    if (!onHuman && !nearCapital) continue;
    w += u.hp;
    sx += u.x * u.hp;
    sy += u.y * u.hp;
  }
  return w > 0 ? { weight: w, x: sx / w, y: sy / w } : { weight: 0, x: 0, y: 0 };
}

/** Which of the humans' camps answers what nature is fielding. */
function counterNeed(run: RunState): Record<'spearcamp' | 'javelincamp' | 'firepit', number> {
  const need = { spearcamp: 0, javelincamp: 0, firepit: 0 };
  for (const u of run.units) {
    if (u.side !== 'nature') continue;
    const tags = UNITS[u.kind].tags;
    const w = u.maxHp;
    if (tags.includes('swarm')) need.firepit += w;
    if (tags.includes('beast')) need.spearcamp += w;
    if (tags.includes('big')) need.javelincamp += w;
  }
  return need;
}

/**
 * The humans think every few seconds: feed the city, answer pressure with watchtowers, answer
 * nature's army with the camp that counters it. They build round the capital, and now and then
 * out towards nature.
 */
export function stepHumans(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const h = run.human;
  if (run.wonAt !== null) return;
  h.think -= dt;
  if (h.think > 0) return;
  h.think = BALANCE.human.think * (0.8 + rand(ctx) * 0.4);
  const capital = mainOf(run, 'human');
  if (!capital) return;
  const tree = mainOf(run, 'nature');

  const count = (k: HumanBuildingId) => run.buildings.filter((b) => b.side === 'human' && b.kind === k).length;
  const tryBuild = (kind: HumanBuildingId, x: number, y: number): boolean => {
    const cost = humanCost(run, kind);
    if (h.supplies < cost) return false;
    const cell = humanSpot(run, kind, x, y) ?? humanSpot(run, kind, capital.x, capital.y, 20);
    if (cell === null) return false;
    h.supplies -= cost;
    const b = addBuilding(ctx, kind, cell, false);
    ctx.emit({ type: 'placed', id: b.id, kind, side: 'human', cell, x: b.x, y: b.y });
    return true;
  };

  // 1. Food: keep a margin for the next few births.
  const food = humanFood(run);
  if (food.supply - food.demand < 2.5 && count('rack') < BALANCE.human.racks + run.stage) {
    if (tryBuild('rack', capital.x, capital.y)) return;
    if (h.supplies < humanCost(run, 'rack')) return;
  }

  // 2. Watchtowers where nature presses hardest.
  const p = pressure(run);
  if (p.weight > 250 + 60 * run.stage && count('tower') < 2 + run.stage) {
    if (tryBuild('tower', p.x, p.y)) return;
  }

  // 3. The camp that counters nature's army.
  const need = counterNeed(run);
  const camps = ['spearcamp', 'javelincamp', 'firepit'] as const;
  let pick: (typeof camps)[number] = 'spearcamp';
  let bestScore = -Infinity;
  for (const k of camps) {
    const score = need[k] / 400 - count(k) + rand(ctx) * 0.6;
    if (score > bestScore) {
      bestScore = score;
      pick = k;
    }
  }
  // The city grows with the stage: a small camp can't field a big army.
  const armyCamps = run.buildings.filter((b) => b.side === 'human' && BUILDINGS[b.kind].makes && !BUILDINGS[b.kind].main).length;
  if (armyCamps >= BALANCE.human.campsBase + BALANCE.human.campsPerStage * run.stage) return;
  // Now and then out towards the trouble (or towards nature); otherwise round the capital.
  if (rand(ctx) < 0.35) {
    const tx = p.weight > 0 ? p.x : tree ? capital.x + (tree.x - capital.x) * 0.35 : capital.x;
    const ty = p.weight > 0 ? p.y : tree ? capital.y + (tree.y - capital.y) * 0.35 : capital.y;
    if (tryBuild(pick, tx, ty)) return;
  }
  tryBuild(pick, capital.x, capital.y);
}

