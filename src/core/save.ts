import { D, ZERO } from './bignum.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import { createState, SAVE_VERSION, type GameState } from './state.ts';
import type { EraId } from './types.ts';

/** JSON-safe snapshot. Decimals are stored as strings. */
export interface SaveData extends Omit<GameState, 'money' | 'runEarned' | 'lifetimeEarned' | 'bestRunLog10'> {
  money: string;
  runEarned: string;
  lifetimeEarned: string;
  bestRunLog10: number | null;
  savedAt: number;
}

export function serialize(state: GameState, now = Date.now()): SaveData {
  return {
    ...state,
    money: state.money.toString(),
    runEarned: state.runEarned.toString(),
    lifetimeEarned: state.lifetimeEarned.toString(),
    bestRunLog10: Number.isFinite(state.bestRunLog10) ? state.bestRunLog10 : null,
    savedAt: now,
  };
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {};

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let data = raw;
  let v = typeof data.version === 'number' ? data.version : 1;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from save version ${v}`);
    data = step(data);
    v++;
    data.version = v;
  }
  return data;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function dec(v: unknown) {
  if (typeof v !== 'string' && typeof v !== 'number') return ZERO;
  const d = D(v);
  return Number.isFinite(d.mantissa) && Number.isFinite(d.exponent) && d.gte(0) ? d : ZERO;
}

function era(v: unknown): EraId {
  const n = num(v, 1);
  return (n >= 1 && n <= 4 ? Math.floor(n) : 1) as EraId;
}

/** Parse untrusted save data into a valid state. Unknown fields are dropped, missing ones defaulted. */
export function deserialize(input: unknown): GameState {
  if (!input || typeof input !== 'object') throw new Error('Save is not an object');
  const raw = migrate({ ...(input as Record<string, unknown>) });
  if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) {
    throw new Error('Save comes from a newer version');
  }
  const s = createState();
  s.money = dec(raw.money);
  s.runEarned = dec(raw.runEarned);
  s.lifetimeEarned = dec(raw.lifetimeEarned);

  const creatures = (raw.creatures ?? {}) as Record<string, { bought?: unknown; bred?: unknown }>;
  for (const id of CREATURE_IDS) {
    const c = creatures[id];
    s.creatures[id] = { bought: Math.max(0, Math.floor(num(c?.bought))), bred: Math.max(0, num(c?.bred)) };
  }
  const upgrades = (raw.upgrades ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(upgrades)) if (v === true) s.upgrades[k] = true;
  const genes = (raw.geneLevels ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(genes)) s.geneLevels[k] = Math.max(0, Math.floor(num(v)));

  const tide = (raw.tide ?? {}) as Record<string, unknown>;
  s.tide = { clock: num(tide.clock), surgeLeft: num(tide.surgeLeft), cooldownLeft: num(tide.cooldownLeft) };

  const auto = (raw.autobuy ?? {}) as Record<string, unknown>;
  for (const e of [1, 2, 3, 4] as EraId[]) s.autobuy[e] = auto[e] !== false;

  s.queens = Math.max(0, Math.floor(num(raw.queens)));
  s.era = era(raw.era);
  s.bestEra = era(raw.bestEra);
  s.genes = Math.max(0, Math.floor(num(raw.genes)));
  s.genesSpent = Math.max(0, Math.floor(num(raw.genesSpent)));
  s.evolutions = Math.max(0, Math.floor(num(raw.evolutions)));
  s.clicks = Math.max(0, Math.floor(num(raw.clicks)));
  s.playTime = Math.max(0, num(raw.playTime));
  s.runTime = Math.max(0, num(raw.runTime));
  s.dinoAt = typeof raw.dinoAt === 'number' ? raw.dinoAt : null;
  s.endedAt = typeof raw.endedAt === 'number' ? raw.endedAt : null;
  s.bestRunLog10 = typeof raw.bestRunLog10 === 'number' ? raw.bestRunLog10 : Number.NEGATIVE_INFINITY;
  return s;
}

const EXPORT_PREFIX = 'HB1:';

/** Portable save string for export/import. */
export function exportSave(state: GameState): string {
  const json = JSON.stringify(serialize(state));
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return EXPORT_PREFIX + btoa(bin);
}

export function importSave(text: string): GameState {
  const trimmed = text.trim();
  if (!trimmed.startsWith(EXPORT_PREFIX)) throw new Error('Not a save string');
  const bin = atob(trimmed.slice(EXPORT_PREFIX.length));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
}
