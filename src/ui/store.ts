import { signal, type Signal } from '@preact/signals';
import type { BuildingId, Difficulty, EraId, Game, RouteId } from '../core/index.ts';
import type { Settings } from '../data/storage.ts';

export type Tab = 'build' | 'skills' | 'meta';
export type ModalId = 'leaderboard' | 'settings' | 'setup' | 'result' | 'building' | 'unit' | 'kind' | 'humans' | null;
/** How far the shop is pulled out. On wide screens anything but 'closed' means open. */
export type Sheet = 'closed' | 'half' | 'full';
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  era?: EraId;
  tone?: 'good' | 'bad';
}

export interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  tone?: 'essence' | 'plain';
}

/** Bumped a few times per second; components read game state after subscribing to it. */
export const frame = signal(0);
export const tab = signal<Tab>('build');
export const modal = signal<ModalId>(null);
export const toasts = signal<Toast[]>([]);
export const floats = signal<FloatText[]>([]);
export const flash = signal(0);
export const sheet = signal<Sheet>('half');
/** The building or unit whose card is open, or the building kind being read about. */
export const detail = signal<number | null>(null);
export const detailKind = signal<BuildingId | null>(null);
/** The building kind being placed, or null. */
export const placing = signal<BuildingId | null>(null);
/** Waiting for a tap to plant the rally flag. */
export const rallying = signal(false);
/** The big title card shown when an era begins. */
export const eraCard = signal<{ era: EraId; id: number } | null>(null);

let cardId = 0;

export function showEra(era: EraId): void {
  const id = ++cardId;
  eraCard.value = { era, id };
  setTimeout(() => {
    if (eraCard.value?.id === id) eraCard.value = null;
  }, 4600);
}
/** The part of the screen the UI leaves for the map. */
export const viewInsets = signal<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });

let nextId = 1;

export function pushToast(t: Omit<Toast, 'id'>, ms = 3600): void {
  const id = nextId++;
  toasts.value = [...toasts.value.slice(-2), { ...t, id }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }, ms);
}

export function pushFloat(x: number, y: number, text: string, tone: FloatText['tone'] = 'essence'): void {
  const id = nextId++;
  const list = floats.value.length > 24 ? floats.value.slice(-24) : floats.value;
  floats.value = [...list, { id, x, y, text, tone }];
  setTimeout(() => {
    floats.value = floats.value.filter((f) => f.id !== id);
  }, 900);
}

/** Services the UI calls into. Set once by the shell before rendering. */
export interface AppContext {
  game: Game;
  settings: Signal<Settings>;
  updateSettings: (patch: Partial<Settings>) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetSave: () => void;
  startRun: (route: RouteId, difficulty: Difficulty) => boolean;
  /** Start placing a building kind (the map lights up where it can go). */
  startPlacing: (kind: BuildingId) => void;
  cancelPlacing: () => void;
  /** Place the current kind on the best free cell. */
  autoPlace: () => void;
  /** Toggle waiting for a tap to plant the rally flag. */
  toggleRally: () => void;
  clearRally: () => void;
  recenter: () => void;
  cameraMoved: () => boolean;
  lookAt: (x: number, z: number) => void;
  /** Highlight a building on the map (null clears). */
  select: (id: number | null) => void;
  leaderboard: import('../data/leaderboard.ts').Leaderboard;
  sfx: import('./sfx.ts').Sfx;
}

export let app: AppContext;

export function setApp(ctx: AppContext): void {
  app = ctx;
}
