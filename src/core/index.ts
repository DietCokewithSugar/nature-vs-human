export * from './bignum.ts';
export * from './types.ts';
export * from './state.ts';
export * from './format.ts';
export * from './save.ts';
export { Game, type CoreEvent, type BuildProblem, type BuildVerdict } from './game.ts';
export type { DeathCause } from './sim/events.ts';
export { nextRandom, randomSeed } from './rng.ts';
export * from './map/layout.ts';
export { BALANCE } from './config/balance.ts';
export { UNITS, HERBIVORES, PREDATORS, SOLDIERS, PACK, CHARGE, EXECUTE, THICK, counterMult, type UnitDef, type Special } from './config/units.ts';
export { BUILDINGS, NATURE_BUILDABLE, HUMAN_BUILDABLE, nestOf, type BuildingDef, type TowerDef } from './config/buildings.ts';
export { PICKS, PICK_BY_ID, type PickDef, type PickEffect } from './config/picks.ts';
export { TALENTS, TALENT_IDS, talentCost, type TalentDef, type TalentId } from './config/talents.ts';
export {
  computeMods,
  levelMult,
  humanLevel,
  unitMaxHp,
  unitAtk,
  unitEat,
  unitMeat,
  unitSpeed,
  spawnInterval,
  meadowGrass,
  motherIncome,
  levelCost,
  towerDmg,
  type Mods,
} from './sim/stats.ts';
export { natureFood, humanFood, natureIncome, humanIncome, held, type FoodLine, type FoodSummary, type IncomeParts } from './sim/economy.ts';
export { ownerOf, segOwner, padUser, buildingOnPad, mainOf } from './sim/ctx.ts';
export { humanCost } from './sim/ai.ts';
