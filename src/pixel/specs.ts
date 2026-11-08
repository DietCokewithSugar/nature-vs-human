import { BUILDINGS, UNITS, VOLCANOES, type BuildingId, type UnitId } from '../core/index.ts';

/**
 * What gets baked into the sprite atlas, and at what size. This is the art spec in code form:
 * one map cell is 16 px, units are drawn a little larger than life so they read on a phone,
 * and every sprite shares the same camera, palette and outline (docs/art-style.md).
 */

/** Map scale: one map cell (4 world units) is 16 px. */
export const TILE = 16;
export const PX_PER_UNIT = TILE / 4;

/** Camera elevation above the horizon, degrees. Units are seen nearly side-on, scenery from higher. */
export const UNIT_ELEVATION = 28;
export const HUMAN_ELEVATION = 14;
export const SCENERY_ELEVATION = 40;

export type AnimKind = 'clip' | 'rig' | 'wings' | 'still';

export interface SpriteSpec {
  key: string;
  /** Model key for assets.ts (a GLB, a kitbashed variant or a procedural model). */
  model: string;
  /** Size in px of the model's measured side (`by`). */
  px: number;
  by: 'length' | 'height';
  elevation: number;
  /** Turn the model before rendering, radians (units face right: +x). */
  yaw: number;
  anim: AnimKind;
  /** Clip names to try for moving / resting (skinned models). */
  move?: string[];
  rest?: string[];
  /** Tint towards this colour (humans in different trades share a body). */
  tint?: string;
  tintAmount?: number;
  /** Height cap in px (tall buildings are scaled down to it). */
  maxH?: number;
}

/** Sprite size of each unit: length for animals and vehicles, height for people. */
const UNIT_PX: Record<UnitId, number> = {
  ant: 10, wolf: 17, sabertooth: 19, cavebear: 20, mammoth: 28,
  locust: 10, rat: 11, wildcat: 14, boar: 16, crocodile: 22,
  mosquito: 10, pigeon: 12, octopus: 16, shark: 24, bison: 22,
  termite: 10, crow: 13, tiger: 21, rhino: 24, elephant: 30,
  bee: 9, butterfly: 10, bat: 12,
  gatherer: 19, hunter: 19, shaman: 19, farmer: 19, archer: 19, scholar: 19, worker: 19, rifleman: 19,
  researcher: 19, environmentalist: 19, fisher: 22, officeWorker: 19, taxi: 19, animalControl: 19, plane: 44,
  dog: 13, cat: 11, pig: 14,
};

/** Unit bodies, mirrored from scene/creatures.ts so the pixel build does not load the 3D views. */
const UNIT_BODY: Record<UnitId, { model: string; human?: boolean; move?: string[]; rest?: string[]; tint?: string; wings?: boolean }> = {
  // Small insects are tinted brighter than life so they stand off the ground.
  ant: { model: 'ant', tint: '#e83b3b' }, wolf: { model: 'wolf' }, sabertooth: { model: 'sabertooth' }, cavebear: { model: 'cavebear' }, mammoth: { model: 'mammoth' },
  locust: { model: 'locust', tint: '#d5e04b' }, rat: { model: 'rat' }, wildcat: { model: 'wildcat' }, boar: { model: 'boar' }, crocodile: { model: 'crocodile', move: ['Walk'] },
  mosquito: { model: 'mosquito', move: ['Fly'], rest: ['Idle'] }, pigeon: { model: 'pigeon' }, octopus: { model: 'octopus', move: ['Swim'] },
  shark: { model: 'shark', move: ['Swim'] }, bison: { model: 'bison' },
  termite: { model: 'termite', tint: '#fbb954' }, crow: { model: 'crow', move: ['Fly'], rest: ['Fly'] }, tiger: { model: 'tiger' }, rhino: { model: 'rhino' }, elephant: { model: 'elephant' },
  bee: { model: 'bee', move: ['Fly'], rest: ['Idle'], wings: true }, butterfly: { model: 'butterfly', wings: true }, bat: { model: 'bat', wings: true },
  gatherer: { model: 'hunter-1', human: true },
  hunter: { model: 'hunter-1', human: true, tint: '#f57d4a' },
  shaman: { model: 'hunter-1', human: true, tint: '#905ea9' },
  farmer: { model: 'hunter-2', human: true, tint: '#fbb954' },
  archer: { model: 'hunter-2', human: true },
  scholar: { model: 'hunter-2', human: true, tint: '#f9c22b' },
  worker: { model: 'hunter-3', human: true, tint: '#f79617' },
  rifleman: { model: 'hunter-3', human: true },
  researcher: { model: 'scientist', human: true },
  environmentalist: { model: 'scientist', human: true, tint: '#1ebc73' },
  fisher: { model: 'fishing-boat' },
  officeWorker: { model: 'hunter-4', human: true },
  taxi: { model: 'taxi' },
  animalControl: { model: 'hunter-4', human: true, tint: '#4d9be6' },
  plane: { model: 'airliner' },
  dog: { model: 'dog' }, cat: { model: 'cat' }, pig: { model: 'pig' },
};

export function isHumanFigure(id: UnitId): boolean {
  return !!UNIT_BODY[id].human;
}

/** Scenery: trees, rocks, flowers, street furniture. Size in world units (height or length). */
export const DECOR_SIZE: Record<string, [number, 'length' | 'height']> = {
  'tree-oak': [5.6, 'height'],
  'tree-broadleaf': [5.4, 'height'],
  'tree-birch': [6, 'height'],
  'tree-pine': [6.4, 'height'],
  spruce: [6.8, 'height'],
  bush: [2.4, 'length'],
  fern: [1.6, 'length'],
  boulders: [2.2, 'length'],
  'grass-tuft': [1.3, 'height'],
  wildflowers: [1.5, 'length'],
  vines: [2.8, 'length'],
  stump: [1.2, 'length'],
  'tree-street': [3.2, 'length'],
  'street-lamp': [4.6, 'height'],
  sakura: [4, 'length'],
};

/** Buildings are a bit smaller than in 3D so neighbours do not swallow each other. */
const BUILDING_SCALE = 0.8;

/** Some models face sideways; turn them so their front faces the viewer. */
const BUILDING_YAW: Partial<Record<string, number>> = {};

export function unitKey(id: UnitId): string {
  return `unit/${id}`;
}

export function buildingKey(id: BuildingId): string {
  return `building/${id}`;
}

export function decorKey(model: string): string {
  return `decor/${model}`;
}

export function allSpecs(): SpriteSpec[] {
  const out: SpriteSpec[] = [];
  for (const id of Object.keys(UNITS) as UnitId[]) {
    const body = UNIT_BODY[id];
    out.push({
      key: unitKey(id),
      model: body.model,
      px: UNIT_PX[id],
      by: body.human ? 'height' : 'length',
      // People are seen from lower down, so faces show under hats and hair.
      elevation: body.human ? HUMAN_ELEVATION : UNIT_ELEVATION,
      // Facing right, turned a little towards the viewer (people more, so faces show).
      yaw: Math.PI / 2 - (body.human ? 0.85 : 0.22),
      anim: body.human ? 'rig' : body.wings ? 'wings' : 'clip',
      move: body.move,
      rest: body.rest,
      tint: body.tint,
      tintAmount: body.human ? 0.35 : 0.6,
    });
  }
  const seen = new Set<string>();
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const def = BUILDINGS[id];
    out.push({
      key: buildingKey(id),
      model: def.model,
      px: Math.round(def.size * PX_PER_UNIT * BUILDING_SCALE),
      by: def.by ?? 'length',
      elevation: SCENERY_ELEVATION,
      yaw: BUILDING_YAW[def.model] ?? 0,
      anim: 'still',
      maxH: 46,
    });
    seen.add(def.model);
  }
  for (const [model, [size, by]] of Object.entries(DECOR_SIZE)) {
    out.push({ key: decorKey(model), model, px: Math.round(size * PX_PER_UNIT), by, elevation: SCENERY_ELEVATION, yaw: 0, anim: 'still' });
  }
  VOLCANOES.forEach((v, i) => {
    out.push({ key: `volcano/${i}`, model: 'volcano', px: Math.round(v.size * PX_PER_UNIT), by: 'length', elevation: SCENERY_ELEVATION, yaw: 0, anim: 'still' });
  });
  out.push({ key: 'flag', model: 'flag', px: 16, by: 'height', elevation: SCENERY_ELEVATION, yaw: 0.4, anim: 'still' });
  return out;
}

/** The sprite that stands for a model key or unit id in UI thumbnails. */
export function spriteForModel(model: string): string | null {
  if (model in UNITS) return unitKey(model as UnitId);
  if (model === 'flag' || model.startsWith('volcano')) return model === 'flag' ? 'flag' : 'volcano/0';
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) if (BUILDINGS[id].model === model) return buildingKey(id);
  for (const id of Object.keys(UNIT_BODY) as UnitId[]) if (UNIT_BODY[id].model === model) return unitKey(id);
  if (model in DECOR_SIZE) return decorKey(model);
  return null;
}
