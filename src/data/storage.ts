import { createState, deserialize, serialize, type GameState } from '../core/index.ts';

const SAVE_KEY = 'human-bill/save';
const BACKUP_KEY = 'human-bill/save.bak';
const SETTINGS_KEY = 'human-bill/settings';
const PLAYER_KEY = 'human-bill/player';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Load the save, falling back to the previous good copy if the latest one is corrupt. */
export function loadGame(): GameState {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    const text = read(key);
    if (!text) continue;
    try {
      return deserialize(JSON.parse(text));
    } catch (err) {
      console.warn(`Ignoring unreadable save in ${key}`, err);
    }
  }
  return createState();
}

export function saveGame(state: GameState): boolean {
  const text = JSON.stringify(serialize(state));
  const previous = read(SAVE_KEY);
  if (previous) write(BACKUP_KEY, previous);
  return write(SAVE_KEY, text);
}

export function clearGame(): void {
  remove(SAVE_KEY);
  remove(BACKUP_KEY);
}

export interface Settings {
  muted: boolean;
  quality: 'high' | 'low';
}

export function defaultSettings(): Settings {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { muted: false, quality: coarse ? 'low' : 'high' };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  const text = read(SETTINGS_KEY);
  if (!text) return base;
  try {
    const raw = JSON.parse(text) as Partial<Settings>;
    return {
      muted: typeof raw.muted === 'boolean' ? raw.muted : base.muted,
      quality: raw.quality === 'low' || raw.quality === 'high' ? raw.quality : base.quality,
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, JSON.stringify(s));
}

export interface PlayerProfile {
  nickname: string;
}

export function loadPlayer(): PlayerProfile | null {
  const text = read(PLAYER_KEY);
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<PlayerProfile>;
    return typeof raw.nickname === 'string' && raw.nickname ? { nickname: raw.nickname } : null;
  } catch {
    return null;
  }
}

export function savePlayer(p: PlayerProfile): void {
  write(PLAYER_KEY, JSON.stringify(p));
}
