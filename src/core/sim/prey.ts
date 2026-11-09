import { BALANCE } from '../config/balance.ts';
import { UNITS } from '../config/units.ts';
import type { RunState, Unit } from '../state.ts';
import type { Ctx } from './ctx.ts';

/**
 * Nature's food chain, animal by animal: predators eat nature's own smaller animals (who eats
 * whom is `prey` in units.ts; the numbers are BALANCE.hunt). On top of the grass → herbivores →
 * meat flow that caps how many of each layer nature can keep, this is what makes the low layers
 * worth keeping round the high ones: a predator heals and gets stronger by eating, and goes
 * hungry when there is nothing of its prey about.
 */

/** Wants a meal: long since the last one, or hurt and done digesting. */
export function wantsMeal(run: RunState, u: Unit): boolean {
  if (!UNITS[u.kind].prey) return false;
  const H = BALANCE.hunt;
  const since = run.time - u.fedAt;
  return since >= H.appetite || (u.hp < u.maxHp * H.hurt && since >= H.digest);
}

/** Badly hurt: it leaves a fight to go and eat (if there is prey about). */
export function fleeing(u: Unit): boolean {
  return UNITS[u.kind].prey !== undefined && u.hp < u.maxHp * BALANCE.hunt.flee;
}

/** Hungry for want of prey (the other kind of hunger, its layer running out of food, is the economy's). */
export function famished(run: RunState, u: Unit): boolean {
  return UNITS[u.kind].prey !== undefined && run.time - u.fedAt > BALANCE.hunt.hungryAfter;
}

export function isFull(run: RunState, u: Unit): boolean {
  return run.time < u.fullUntil;
}

/** Attack multiplier from the belly: hungry animals hit softer, full predators harder. */
export function mealMult(run: RunState, u: Unit): number {
  if (u.side !== 'nature') return 1;
  if (u.hungry) return BALANCE.hunt.hungryAtk;
  return isFull(run, u) ? BALANCE.hunt.fullAtk : 1;
}

/**
 * The prey this predator would go for: one of its prey species within reach that isn't fighting
 * and that no other predator is already after. Nearer is better and the wounded much better.
 */
export function findPrey(ctx: Ctx, u: Unit, taken: ReadonlySet<number>): Unit | null {
  const kinds = UNITS[u.kind].prey;
  if (!kinds) return null;
  const reach = BALANCE.hunt.reach;
  let best: Unit | null = null;
  let bestS = Infinity;
  for (const v of ctx.run.units) {
    if (v === u || v.side !== u.side || v.hp <= 0 || v.target !== 0 || !(kinds as readonly string[]).includes(v.kind) || taken.has(v.id)) continue;
    const dx = v.x - u.x;
    if (dx > reach || dx < -reach) continue;
    const d = Math.hypot(dx, v.y - u.y);
    if (d > reach) continue;
    const s = d * (0.3 + 0.7 * (v.hp / v.maxHp));
    if (s < bestS) {
      best = v;
      bestS = s;
    }
  }
  return best;
}

/** The kill: the prey dies, the predator heals and is full. */
export function eat(ctx: Ctx, u: Unit, prey: Unit): void {
  const run = ctx.run;
  const H = BALANCE.hunt;
  const heal = Math.max(0, Math.min(u.maxHp - u.hp, prey.maxHp * H.heal));
  u.hp += heal;
  u.fedAt = run.time;
  u.fullUntil = run.time + H.fullFor;
  u.hunt = 0;
  u.huntUntil = 0;
  u.struckAt = run.time;
  u.face = prey.x >= u.x ? 1 : -1;
  prey.hp = 0;
  ctx.eaten.add(prey.id);
  ctx.emit({ type: 'eaten', id: u.id, kind: u.kind, prey: prey.kind, x: prey.x, y: prey.y, heal });
}
