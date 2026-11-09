import { TALENT_IDS, TALENTS } from './config/talents.ts';
import { CELLS } from './map/grid.ts';
import { createMeta, createState, SAVE_VERSION, type GameState, type MetaState, type RunState } from './state.ts';

type Json = Record<string, unknown>;

export function serialize(state: GameState, now = Date.now()): Json {
  return { version: state.version, savedAt: now, meta: state.meta, run: state.run };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function parseMeta(raw: unknown): MetaState {
  const r = obj(raw);
  const meta = createMeta();
  meta.genes = Math.max(0, Math.floor(num(r.genes)));
  meta.runs = Math.max(0, Math.floor(num(r.runs)));
  meta.bestStage = Math.max(0, Math.floor(num(r.bestStage)));
  meta.lifetimeGenes = Math.max(0, Math.floor(num(r.lifetimeGenes)));
  meta.playTime = Math.max(0, num(r.playTime));
  const t = obj(r.talents);
  for (const id of TALENT_IDS) meta.talents[id] = Math.max(0, Math.min(TALENTS[id].max, Math.floor(num(t[id]))));
  return meta;
}

/** A run is only trusted as a whole: same version, the arrays and records it needs. Anything off starts afresh. */
function parseRun(raw: unknown): RunState | null {
  const r = obj(raw);
  const arrays = ['units', 'buildings', 'projectiles', 'control', 'explored', 'flags', 'picks', 'offer'];
  if (!arrays.every((k) => Array.isArray(r[k]))) return null;
  if ((r.control as unknown[]).length !== CELLS || (r.explored as unknown[]).length !== CELLS) return null;
  if (typeof r.phase !== 'string' || !['battle', 'pick', 'over'].includes(r.phase)) return null;
  if (!r.levels || typeof r.levels !== 'object' || !r.human || typeof r.human !== 'object') return null;
  for (const k of ['stage', 'time', 'stageTime', 'essence', 'nextId', 'rng', 'mapSeed', 'era']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) return null;
  // Saves from before predators hunted: everyone has just eaten.
  for (const raw of r.units as unknown[]) {
    const u = obj(raw);
    u.fedAt = num(u.fedAt, r.time as number);
    u.fullUntil = num(u.fullUntil);
    u.hunt = num(u.hunt);
    u.huntUntil = num(u.huntUntil);
  }
  const stats = obj(r.stats);
  stats.eaten = num(stats.eaten);
  r.stats = stats;
  return r as unknown as RunState;
}

/**
 * Load a save. Version 6 is the open map with fog of war: older saves (the three-lane game and
 * before) were a different game and are not carried over; their talents and genes go with them.
 */
export function deserialize(raw: unknown): GameState {
  const data = obj(raw);
  const fresh = createState();
  if (num(data.version) !== SAVE_VERSION) return fresh;
  const meta = parseMeta(data.meta);
  const run = parseRun(data.run);
  return { version: SAVE_VERSION, meta, run: run ?? fresh.run };
}

export function exportSave(state: GameState): string {
  const json = JSON.stringify(serialize(state));
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(text: string): GameState {
  const json = decodeURIComponent(escape(atob(text.trim())));
  const data = JSON.parse(json) as unknown;
  if (num(obj(data).version) !== SAVE_VERSION) throw new Error('Unsupported save version');
  return deserialize(data);
}
