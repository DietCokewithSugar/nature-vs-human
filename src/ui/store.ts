import { signal, type Signal } from '@preact/signals';
import type { CreatureId, Difficulty, EraId, Game, RouteId } from '../core/index.ts';
import type { Settings } from '../data/storage.ts';

export type Tab = 'creatures' | 'skills' | 'meta';
export type ModalId = 'leaderboard' | 'settings' | 'setup' | 'result' | 'creature' | null;
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
}

export interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
}

/** Bumped a few times per second; components read game state after subscribing to it. */
export const frame = signal(0);
export const tab = signal<Tab>('creatures');
export const modal = signal<ModalId>(null);
export const toasts = signal<Toast[]>([]);
export const floats = signal<FloatText[]>([]);
export const focusEra = signal<EraId>(1);
export const flash = signal(0);
export const sheet = signal<Sheet>('half');
/** The creature whose card is open. */
export const detail = signal<CreatureId | null>(null);
/** The part of the screen the UI leaves for the city. */
export const viewInsets = signal<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });

let nextId = 1;

export function pushToast(t: Omit<Toast, 'id'>, ms = 3600): void {
  const id = nextId++;
  toasts.value = [...toasts.value.slice(-2), { ...t, id }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }, ms);
}

export function pushFloat(x: number, y: number, text: string): void {
  const id = nextId++;
  const list = floats.value.length > 24 ? floats.value.slice(-24) : floats.value;
  floats.value = [...list, { id, x, y, text }];
  setTimeout(() => {
    floats.value = floats.value.filter((f) => f.id !== id);
  }, 900);
}

/** Services the UI calls into. Set once by the shell before rendering. */
export interface AppContext {
  game: Game;
  settings: Signal<Settings>;
  updateSettings: (patch: Partial<Settings>) => void;
  flyTo: (era: EraId) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetSave: () => void;
  startRun: (route: RouteId, difficulty: Difficulty) => boolean;
  /** Drive off the raid party. */
  repel: () => void;
  /** Where the raid party is on screen, or null. */
  raidScreen: () => { x: number; y: number; onScreen: boolean } | null;
  recenter: () => void;
  cameraMoved: () => boolean;
  lookAtLair: (id: CreatureId) => void;
  leaderboard: import('../data/leaderboard.ts').Leaderboard;
  sfx: import('./sfx.ts').Sfx;
}

export let app: AppContext;

export function setApp(ctx: AppContext): void {
  app = ctx;
}
