import { signal, type Signal } from '@preact/signals';
import type { Game, NatureBuildingId } from '../core/index.ts';
import type { Settings } from '../data/storage.ts';

export type Tab = 'build' | 'evolve';
export type ModalId = 'help' | 'settings' | 'leaderboard' | 'giveUp' | null;

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: 'good' | 'bad';
}

/** Bumped a few times per second; components read game state after subscribing to it. */
export const frame = signal(0);
export const tab = signal<Tab>('build');
export const modal = signal<ModalId>(null);
export const toasts = signal<Toast[]>([]);
/** The cell picked on the map (the build list then builds there). */
export const selectedCell = signal<number | null>(null);
/** A building kind picked first: the next cell clicked gets it. */
export const placing = signal<NatureBuildingId | null>(null);
/** The next left click plants a rally flag. */
export const flagMode = signal(false);
/** The screen rect the map is shown in, CSS px (the UI's panels take the rest). */
export const mapRect = signal({ x: 0, y: 0, w: 0, h: 0 });
/** The building whose card is open. */
export const selectedBuilding = signal<number | null>(null);

let nextId = 1;

const recent = new Map<string, number>();

export function pushToast(t: Omit<Toast, 'id'>, ms = 3200): void {
  // The same message twice within a few seconds is noise.
  const now = Date.now();
  if ((recent.get(t.title) ?? 0) > now) return;
  recent.set(t.title, now + Math.min(ms, 4000));
  const id = nextId++;
  toasts.value = [...toasts.value.slice(-2), { ...t, id }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }, ms);
}

/** Services the UI calls into. Set once by the shell before rendering. */
export interface AppContext {
  game: Game;
  settings: Signal<Settings>;
  updateSettings: (patch: Partial<Settings>) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetSave: () => void;
  /** Build a kind on a cell, or on the best cell for it when cell is null. */
  build: (kind: NatureBuildingId, cell: number | null) => boolean;
  /** Back to the mother tree. */
  recenter: () => void;
  /** The camera: what part of the map is on screen (map px), and moving it. */
  viewRect: () => { x0: number; y0: number; x1: number; y1: number };
  centerOn: (x: number, y: number) => void;
  /** Where a building is on screen, for pop-overs. */
  buildingScreen: (id: number) => { x: number; y: number; top: number } | null;
  leaderboard: import('../data/leaderboard.ts').Leaderboard;
  sfx: import('./sfx.ts').Sfx;
}

export let app: AppContext;

export function setApp(ctx: AppContext): void {
  app = ctx;
}
