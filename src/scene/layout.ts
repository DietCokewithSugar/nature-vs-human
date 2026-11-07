export interface Placement {
  model: string;
  x: number;
  z: number;
  /** Rotation around Y in quarter turns. */
  rot?: number;
  /** Target size in world units (longest horizontal side unless `by` is height). */
  size: number;
  by?: 'length' | 'height';
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type GroundColor =
  | 'snow'
  | 'tundra'
  | 'ice'
  | 'earth'
  | 'stone'
  | 'lawn'
  | 'cobble'
  | 'brick'
  | 'road'
  | 'sidewalk'
  | 'asphalt'
  | 'plaza'
  | 'pier'
  | 'earthDark'
  | 'field'
  | 'fieldDark'
  | 'gravel'
  | 'rail';

/** Footprint of a placement, inflated by `pad`, for keeping walkers out of buildings. */
export function footprint(p: Placement, dims: { w: number; d: number }, pad = 0): Rect {
  const quarter = ((p.rot ?? 0) % 2 + 2) % 2 === 1;
  const w = (quarter ? dims.d : dims.w) / 2 + pad;
  const d = (quarter ? dims.w : dims.d) / 2 + pad;
  return { x0: p.x - w, x1: p.x + w, z0: p.z - d, z1: p.z + d };
}

export function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}
