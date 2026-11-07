import { D, ZERO, type Decimal } from './bignum.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import { UPGRADE_BY_ID } from './config/upgrades.ts';
import { createMeta, createRun, SAVE_VERSION, type GameState, type MetaState, type RunState } from './state.ts';
import { randomSeed } from './rng.ts';
import {
  CLASS_IDS,
  DIFFICULTIES,
  DISASTER_IDS,
  type ActiveId,
  type CreatureId,
  type Difficulty,
  type DisasterId,
  type EraId,
  type RouteId,
} from './types.ts';

type Json = Record<string, unknown>;

// ── Serialise ──────────────────────────────────────────────────

function decimals<T extends object>(obj: T): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v && typeof v === 'object' && 'mantissa' in v ? String(v) : v;
  return out;
}

export function serialize(state: GameState, now = Date.now()): Json {
  return {
    version: state.version,
    savedAt: now,
    meta: decimals(state.meta),
    run: decimals(state.run),
  };
}

// ── Migrations ─────────────────────────────────────────────────

type Migration = (raw: Json) => Json;

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 was the endless idle prototype. Keep lifetime damage and turn genes into meta points.
  1: (raw) => {
    const genes = num(raw.genes);
    return {
      version: 2,
      meta: { ...createMetaJson(), lifetime: raw.lifetimeEarned ?? '0', points: Math.min(60, Math.floor(Math.sqrt(genes) * 3)) },
      run: null,
    };
  },
  // v3 added lairs, raids and disasters. parseRun fills their defaults.
  2: (raw) => raw,
};

function createMetaJson(): Json {
  return decimals(createMeta());
}

function migrate(raw: Json): Json {
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

// ── Parse (untrusted input) ────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function int(v: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(num(v, fallback)));
}

function unit(v: unknown): number {
  return Math.max(0, Math.min(1, num(v)));
}

function dec(v: unknown): Decimal {
  if (typeof v !== 'string' && typeof v !== 'number') return ZERO;
  const d = D(v);
  return Number.isFinite(d.mantissa) && Number.isFinite(d.exponent) && d.gte(0) ? d : ZERO;
}

function era(v: unknown): EraId {
  const n = num(v, 1);
  return (n >= 1 && n <= 4 ? Math.floor(n) : 1) as EraId;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function difficulty(v: unknown): Difficulty {
  return DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : 'normal';
}

function parseMeta(raw: Json): MetaState {
  const m = createMeta();
  m.points = int(raw.points);
  m.spent = Math.min(m.points, int(raw.spent));
  for (const [k, v] of Object.entries(obj(raw.levels))) {
    const def = META_BY_ID[k];
    if (def) m.levels[k] = Math.min(def.levels.length, int(v));
  }
  const wins = obj(raw.wins);
  const fastest = obj(raw.fastest);
  for (const d of DIFFICULTIES) {
    m.wins[d] = int(wins[d]);
    m.fastest[d] = typeof fastest[d] === 'number' && (fastest[d] as number) > 0 ? (fastest[d] as number) : null;
  }
  m.lifetime = dec(raw.lifetime);
  m.bestRunLog10 = Math.max(0, num(raw.bestRunLog10));
  m.runs = int(raw.runs);
  m.playTime = Math.max(0, num(raw.playTime));
  return m;
}

function parseRun(raw: Json): RunState {
  const route: RouteId = raw.route === 'plague' && ROUTES.plague ? 'plague' : 'beasts';
  const r = createRun(route, difficulty(raw.difficulty));
  r.money = dec(raw.money);
  r.earned = dec(raw.earned);
  const creatures = obj(raw.creatures);
  for (const id of CREATURE_IDS) {
    const c = obj(creatures[id]);
    r.creatures[id] = { bought: int(c.bought), bred: Math.max(0, num(c.bred)) };
  }
  for (const [k, v] of Object.entries(obj(raw.upgrades))) if (v === true && UPGRADE_BY_ID[k]) r.upgrades[k] = true;
  for (const [k, v] of Object.entries(obj(raw.skills))) if (v === true && SKILL_BY_ID[k]) r.skills[k] = true;
  r.nests = int(raw.nests);
  const tide = obj(raw.tide);
  r.tide = { clock: Math.max(0, num(tide.clock)), surgeLeft: Math.max(0, num(tide.surgeLeft)) };
  r.era = era(raw.era);
  r.research = unit(raw.research);
  if (Array.isArray(raw.countermeasures)) {
    for (const c of raw.countermeasures.slice(0, 8)) {
      const cm = obj(c);
      if (CLASS_IDS.includes(cm.cls as never)) {
        r.countermeasures.push({ cls: cm.cls as (typeof CLASS_IDS)[number], era: era(cm.era), at: Math.max(0, num(cm.at)) });
      }
    }
  }
  for (const [k, v] of Object.entries(obj(raw.taming))) {
    if (CREATURE_IDS.includes(k as CreatureId)) r.taming[k as CreatureId] = unit(v);
  }
  for (const [k, v] of Object.entries(obj(raw.defected))) {
    if (CREATURE_IDS.includes(k as CreatureId)) r.defected[k as CreatureId] = int(v);
  }
  for (const [k, v] of Object.entries(obj(raw.cooldowns))) {
    if (['surge', 'rescue', 'rampage', 'sabotage'].includes(k)) r.cooldowns[k as ActiveId] = Math.max(0, num(v));
  }
  r.rampageLeft = Math.max(0, num(raw.rampageLeft));
  const cap = (v: unknown, max: number) => Math.max(0, Math.min(max, num(v)));
  for (const [k, v] of Object.entries(obj(raw.lairs))) {
    const left = cap(v, 3600);
    if (CREATURE_IDS.includes(k as CreatureId) && left > 0) r.lairs[k as CreatureId] = left;
  }
  r.raidMeter = unit(raw.raidMeter);
  const raid = raw.raid ? obj(raw.raid) : null;
  if (raid && CREATURE_IDS.includes(raid.target as CreatureId)) {
    const total = Math.max(1, cap(raid.total, 600));
    r.raid = { target: raid.target as CreatureId, total, left: Math.min(total, cap(raid.left, 600)) };
  }
  const dis = raw.disaster ? obj(raw.disaster) : null;
  if (dis && DISASTER_IDS.includes(dis.id as DisasterId) && (dis.phase === 'warning' || dis.phase === 'active')) {
    const wrecked = Array.isArray(dis.wrecked) ? dis.wrecked.filter((x) => CREATURE_IDS.includes(x as CreatureId)) : [];
    r.disaster = { id: dis.id as DisasterId, phase: dis.phase, left: cap(dis.left, 600), wrecked: wrecked as CreatureId[] };
  }
  if (typeof raw.nextDisaster === 'number') r.nextDisaster = cap(raw.nextDisaster, 3600);
  r.lastDisaster = DISASTER_IDS.includes(raw.lastDisaster as DisasterId) ? (raw.lastDisaster as DisasterId) : null;
  r.rng = typeof raw.rng === 'number' && Number.isFinite(raw.rng) ? raw.rng >>> 0 : randomSeed();
  r.clicks = int(raw.clicks);
  r.time = Math.max(0, num(raw.time));
  const res = raw.result ? obj(raw.result) : null;
  r.result = res
    ? { won: res.won === true, time: Math.max(0, num(res.time)), points: int(res.points), earnedLog10: Math.max(0, num(res.earnedLog10)) }
    : null;
  return r;
}

/** Parse untrusted save data into a valid state. Unknown fields are dropped, missing ones defaulted. */
export function deserialize(input: unknown): GameState {
  if (!input || typeof input !== 'object') throw new Error('Save is not an object');
  const raw = migrate({ ...(input as Json) });
  if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) throw new Error('Save comes from a newer version');
  return {
    version: SAVE_VERSION,
    meta: parseMeta(obj(raw.meta)),
    run: raw.run ? parseRun(obj(raw.run)) : createRun(),
  };
}

const EXPORT_PREFIX = 'HB2:';

export function exportSave(state: GameState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(serialize(state)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return EXPORT_PREFIX + btoa(bin);
}

export function importSave(text: string): GameState {
  const trimmed = text.trim();
  const prefix = trimmed.startsWith('HB2:') ? 'HB2:' : trimmed.startsWith('HB1:') ? 'HB1:' : null;
  if (!prefix) throw new Error('Not a save string');
  const bin = atob(trimmed.slice(prefix.length));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
}
