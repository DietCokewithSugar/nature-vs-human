/**
 * A scripted nature player for balance runs (simulate.ts, report.ts). It plays the way the
 * design intends a sensible player to: feed the food chain first, keep a mixed army, level what
 * it fields, and let the army find its own way (no rally flags).
 */
import {
  BUILDINGS,
  Game,
  meadowGrass,
  LEVEL_IDS,
  TALENT_IDS,
  natureFood,
  type LevelId,
  type NatureBuildingId,
} from '../src/core/index.ts';

export type BotStyle = 'engaged' | 'casual' | 'idle' | 'naive';

/** How often each style looks at the game, in seconds. */
export const LOOK_EVERY: Record<BotStyle, number> = { engaged: 5, casual: 45, idle: 180, naive: 20 };

/** The army the bot aims for: nests per kind (as far as there is room to build). */
const PLAN: [NatureBuildingId, number][] = [
  ['anthill', 2],
  ['glade', 2],
  ['den', 2],
  ['valley', 1],
  ['ancient', 1],
  ['sabercave', 1],
  ['bearcave', 1],
  ['glade', 3],
  ['den', 3],
  ['valley', 2],
  ['anthill', 3],
  ['bearcave', 2],
  ['sabercave', 2],
  ['ancient', 2],
];

function count(game: Game, kind: NatureBuildingId): number {
  return game.run.buildings.filter((b) => b.kind === kind).length;
}

function tryBuild(game: Game, kind: NatureBuildingId): boolean {
  const cell = game.autoCell(kind);
  return cell !== null && game.build(cell, kind);
}

/** One look at the game: spend what's sensible, pick, or start the next run. */
export function botLook(game: Game, style: BotStyle): void {
  const run = game.run;
  if (run.phase === 'pick') {
    game.choosePick(run.offer[0]!);
    return;
  }
  if (run.phase === 'over') {
    for (let bought = true; bought; ) {
      bought = false;
      const ids = [...TALENT_IDS].sort((a, b) => game.talentCost(a) - game.talentCost(b));
      for (const id of ids) if (game.buyTalent(id)) bought = true;
    }
    game.startRun();
    return;
  }
  if (style === 'naive') {
    naiveLook(game);
    return;
  }
  for (let guard = 0; guard < 30; guard++) {
    const food = natureFood(run, game.mods);
    // Grass first: the food chain can't grow without it. Meadows still growing count too.
    const planned = count(game, 'meadow') * meadowGrass(run, game.mods);
    if (planned < food.grass.demand + 3 || planned < 3) {
      if (count(game, 'meadow') < 4 && run.essence >= game.buildCost('meadow')) {
        if (tryBuild(game, 'meadow')) continue;
      } else if (run.essence >= game.levelCost('meadow')) {
        if (game.levelUp('meadow')) continue;
      }
    }
    let built = false;
    for (const [kind, n] of PLAN) {
      if (count(game, kind) >= n) continue;
      if (run.essence >= game.buildCost(kind) && tryBuild(game, kind)) built = true;
      break;
    }
    if (built) continue;
    // Level the cheapest thing that's in play.
    const fielded = new Set<LevelId>(['mothertree', 'meadow']);
    for (const b of run.buildings) {
      const makes = BUILDINGS[b.kind].makes;
      if (makes) fielded.add(makes as LevelId);
      if (b.kind === 'ancient') fielded.add('ancient');
    }
    const options = LEVEL_IDS.filter((id) => fielded.has(id)).sort((a, b) => game.levelCost(a) - game.levelCost(b));
    const next = options[0];
    // Idle players spend everything; engaged ones keep a little for rebuilding.
    const reserve = style === 'engaged' ? 40 : 0;
    if (next && run.essence - reserve >= game.levelCost(next) && game.levelUp(next)) continue;
    break;
  }
}

/**
 * A first-time player who doesn't read: buys whatever catches the eye (a random affordable
 * building), sometimes levels something. Stage 1 must still be winnable this way.
 */
let seed = 1;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function naiveLook(game: Game): void {
  const run = game.run;
  const kinds: NatureBuildingId[] = ['meadow', 'anthill', 'glade', 'valley', 'den', 'sabercave', 'bearcave', 'ancient'];
  for (let i = 0; i < 4; i++) {
    const k = kinds[Math.floor(rnd() * kinds.length)]!;
    if (run.essence >= game.buildCost(k)) tryBuild(game, k);
  }
  if (rnd() < 0.5) {
    const id = LEVEL_IDS[Math.floor(rnd() * LEVEL_IDS.length)]!;
    if (run.essence >= game.levelCost(id)) game.levelUp(id);
  }
}
