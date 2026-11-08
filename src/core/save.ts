import { BUILDINGS } from './config/buildings.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import { UNITS } from './config/units.ts';
import { CELL_COUNT, NODES } from './map/grid.ts';
import { createMeta, createRun, emptyStats, SAVE_VERSION, type Building, type GameState, type MetaState, type RunState, type Unit } from './state.ts';
import { randomSeed } from './rng.ts';
import {
  CLASS_IDS,
  DIFFICULTIES,
  DISASTER_IDS,
  type ActiveId,
  type BuildingId,
  type CreatureId,
  type Difficulty,
  type DisasterId,
  type EraId,
  type RouteId,
  type UnitId,
  type UnitTask,
} from './types.ts';

type Json = Record<string, unknown>;

export function serialize(state: GameState, now = Date.now()): Json {
  return { version: state.version, savedAt: now, meta: state.meta, run: state.run };
}

// ── Migrations ─────────────────────────────────────────────────

type Migration = (raw: Json) => Json;

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 was the endless idle prototype: turn genes into meta points.
  1: (raw) => {
    const genes = num(raw.genes);
    return { version: 2, meta: { ...createMeta(), points: Math.min(60, Math.floor(Math.sqrt(genes) * 3)) }, run: null };
  },
  2: (raw) => raw,
  // v4 is the territory war. Meta progress carries over (points, perks, wins); the run starts afresh,
  // and fastest wins are cleared because the old runs were a different game.
  3: (raw) => {
    const meta = obj(raw.meta);
    return { version: 4, meta: { ...meta, fastest: {}, lifetime: 0 }, run: null };
  },
};

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

function clamp(v: unknown, lo: number, hi: number, fallback = lo): number {
  return Math.max(lo, Math.min(hi, num(v, fallback)));
}

function era(v: unknown): EraId {
  const n = num(v, 1);
  return (n >= 1 && n <= 4 ? Math.floor(n) : 1) as EraId;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function difficulty(v: unknown): Difficulty {
  return DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : 'normal';
}

const TASKS: readonly UnitTask[] = ['idle', 'move', 'fight', 'work', 'forage', 'rest', 'collect', 'heal', 'siege'];

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
  m.bestTerritory = clamp(raw.bestTerritory, 0, 1);
  m.lifetime = Math.max(0, num(raw.lifetime));
  m.runs = int(raw.runs);
  m.playTime = Math.max(0, num(raw.playTime));
  return m;
}

function parseUnit(raw: Json): Unit | null {
  const kind = raw.kind as UnitId;
  const def = UNITS[kind];
  if (!def) return null;
  const side = raw.side === 'nature' || raw.side === 'human' ? raw.side : def.side;
  const x = clamp(raw.x, -64, 64);
  const z = clamp(raw.z, -64, 64);
  return {
    id: int(raw.id),
    kind,
    side,
    x,
    z,
    dir: num(raw.dir),
    hp: clamp(raw.hp, 0.01, 1e6, def.hp),
    age: Math.max(0, num(raw.age)),
    life: clamp(raw.life, 1, 1e6, def.life * 240),
    home: int(raw.home),
    task: TASKS.includes(raw.task as UnitTask) ? (raw.task as UnitTask) : 'idle',
    target: Math.floor(num(raw.target, -1)),
    tx: clamp(raw.tx, -64, 64, x),
    tz: clamp(raw.tz, -64, 64, z),
    cd: num(raw.cd),
    calm: num(raw.calm, 99),
    think: 0,
    forageAt: clamp(raw.forageAt, 0, 24),
    restAt: clamp(raw.restAt, 0, 24),
    fedDay: Math.floor(num(raw.fedDay, -1)),
    restDay: Math.floor(num(raw.restDay, -1)),
    needLeft: clamp(raw.needLeft, 0, 1000),
    feeding: raw.feeding === true,
    hitAt: num(raw.hitAt, -99),
    dazed: false,
  };
}

function parseBuilding(raw: Json): Building | null {
  const kind = raw.kind as BuildingId;
  const def = BUILDINGS[kind];
  const cell = int(raw.cell, -1);
  if (!def || cell < 0 || cell >= CELL_COUNT) return null;
  return {
    id: int(raw.id),
    kind,
    side: def.side,
    cell,
    x: num(raw.x),
    z: num(raw.z),
    hp: clamp(raw.hp, 0.01, 1e6, def.hp),
    level: Math.max(1, Math.min(4, int(raw.level, 1))),
    build: clamp(raw.build, 0, 1, 1),
    timer: clamp(raw.timer, 0, 600),
    hitAt: num(raw.hitAt, -99),
  };
}

function parseRun(raw: Json): RunState {
  const route: RouteId = raw.route === 'plague' && ROUTES.plague ? 'plague' : 'beasts';
  const r = createRun(route, difficulty(raw.difficulty), typeof raw.rng === 'number' ? raw.rng >>> 0 : randomSeed());
  r.essence = Math.max(0, num(raw.essence));
  r.earned = Math.max(0, num(raw.earned));
  r.humanEssence = Math.max(0, num(raw.humanEssence));
  for (const [k, v] of Object.entries(obj(raw.skills))) if (v === true && SKILL_BY_ID[k]) r.skills[k] = true;
  r.era = era(raw.era);
  r.research = clamp(raw.research, 0, 4);
  for (const c of list(raw.countermeasures).slice(0, 8)) {
    const cm = obj(c);
    if (CLASS_IDS.includes(cm.cls as never)) r.countermeasures.push({ cls: cm.cls as (typeof CLASS_IDS)[number], era: era(cm.era), at: Math.max(0, num(cm.at)) });
  }
  for (const [k, v] of Object.entries(obj(raw.taming))) if (UNITS[k as UnitId]?.tame) r.taming[k as CreatureId] = clamp(v, 0, 1);
  for (const [k, v] of Object.entries(obj(raw.defected))) if (UNITS[k as UnitId]?.tame) r.defected[k as CreatureId] = int(v);
  for (const [k, v] of Object.entries(obj(raw.cooldowns))) {
    if (['surge', 'rescue', 'rampage', 'sabotage'].includes(k)) r.cooldowns[k as ActiveId] = clamp(v, 0, 600);
  }
  r.rampageLeft = clamp(raw.rampageLeft, 0, 60);
  const tide = obj(raw.tide);
  r.tide = { clock: Math.max(0, num(tide.clock)), surgeLeft: clamp(tide.surgeLeft, 0, 120) };
  const dis = raw.disaster ? obj(raw.disaster) : null;
  if (dis && DISASTER_IDS.includes(dis.id as DisasterId) && (dis.phase === 'warning' || dis.phase === 'active')) {
    r.disaster = { id: dis.id as DisasterId, phase: dis.phase, left: clamp(dis.left, 0, 600) };
  }
  r.nextDisaster = clamp(raw.nextDisaster, 0, 3600, r.nextDisaster);
  r.lastDisaster = DISASTER_IDS.includes(raw.lastDisaster as DisasterId) ? (raw.lastDisaster as DisasterId) : null;
  const control = list(raw.control);
  const owner = list(raw.owner);
  if (control.length === CELL_COUNT && owner.length === CELL_COUNT) {
    r.control = control.map((v) => clamp(v, -100, 100));
    r.owner = owner.map((v) => (v === 1 || v === 2 ? v : 0));
    const worked = list(raw.worked);
    r.worked = r.control.map((_, k) => Math.max(0, num(worked[k], 99)));
  }
  r.units = list(raw.units).map((u) => parseUnit(obj(u))).filter((u): u is Unit => u !== null).slice(0, 400);
  r.buildings = list(raw.buildings).map((b) => parseBuilding(obj(b))).filter((b): b is Building => b !== null);
  // One building per cell.
  const seen = new Set<number>();
  r.buildings = r.buildings.filter((b) => (seen.has(b.cell) ? false : (seen.add(b.cell), true)));
  r.bubbles = list(raw.bubbles)
    .map((x) => obj(x))
    .filter((b) => int(b.node, -1) >= 0 && int(b.node, -1) < NODES.length)
    .map((b) => ({ id: int(b.id), node: int(b.node), value: clamp(b.value, 0, 1e4), left: clamp(b.left, 0, 60), claimed: 0 }));
  const timers = list(raw.nodeTimers);
  r.nodeTimers = NODES.map((_, i) => clamp(timers[i], 0, 120, 5));
  let maxId = 0;
  for (const e of [...r.units, ...r.buildings, ...r.bubbles]) maxId = Math.max(maxId, e.id);
  r.nextId = Math.max(int(raw.nextId, 1), maxId + 1);
  const rally = raw.rally ? obj(raw.rally) : null;
  r.rally = rally ? { x: clamp(rally.x, -64, 64), z: clamp(rally.z, -64, 64) } : null;
  r.best = clamp(raw.best, 0, 1);
  const st = obj(raw.stats);
  r.stats = emptyStats();
  for (const k of Object.keys(r.stats) as (keyof typeof r.stats)[]) r.stats[k] = int(st[k]);
  r.clicks = int(raw.clicks);
  r.time = Math.max(0, num(raw.time));
  const res = raw.result ? obj(raw.result) : null;
  r.result = res
    ? { won: res.won === true, time: Math.max(0, num(res.time)), points: int(res.points), territory: clamp(res.territory, 0, 1), best: clamp(res.best, 0, 1) }
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

const EXPORT_PREFIX = 'HB4:';

export function exportSave(state: GameState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(serialize(state)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return EXPORT_PREFIX + btoa(bin);
}

export function importSave(text: string): GameState {
  const trimmed = text.trim();
  const m = /^HB[1-4]:/.exec(trimmed);
  if (!m) throw new Error('Not a save string');
  const bin = atob(trimmed.slice(m[0].length));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
}
