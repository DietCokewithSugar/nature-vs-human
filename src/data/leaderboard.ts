import { signal } from '@preact/signals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../core/index.ts';
import { loadPlayer, savePlayer } from './storage.ts';

export type BoardKind = 'lifetime' | 'speedrun';

export interface LeaderEntry {
  rank: number;
  nickname: string;
  /** log10 of lifetime damage, or seconds to reach the dinosaur era. */
  value: number;
  me: boolean;
}

export interface BoardResult {
  top: LeaderEntry[];
  me: LeaderEntry | null;
}

const ADJ = ['记仇的', '爱加班的', '不交物业费的', '在逃的', '睡不醒的', '社恐的', '暴躁的', '背房贷的', '刚进化的', '会算账的', '路过的', '很有礼貌的'];
const WHO = ['蚂蚁', '蚱蜢', '胡蜂', '螳螂', '螃蟹', '水母', '章鱼', '鸽子', '狐狸', '大象', '迅猛龙', '霸王龙'];

export function randomNickname(): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
  return `${pick(ADJ)}${pick(WHO)}#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

export const NICKNAME_MAX = 20;

export function cleanNickname(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NICKNAME_MAX);
}

/**
 * Leaderboard backed by Supabase (anonymous auth + RPCs, see supabase/migrations).
 * Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY it runs offline and the game still works.
 */
export class Leaderboard {
  readonly nickname = signal('');
  readonly status = signal<'offline' | 'idle' | 'busy'>('offline');
  private client: SupabaseClient | null = null;
  private config: { url: string; key: string } | null = null;
  private loading: Promise<SupabaseClient | null> | null = null;
  private sessionReady: Promise<boolean> | null = null;
  private lastSent = { log10: -1, at: 0, dino: null as number | null, era: 0 };

  constructor(url?: string, anonKey?: string) {
    const player = loadPlayer() ?? { nickname: randomNickname() };
    savePlayer(player);
    this.nickname.value = player.nickname;
    if (url && anonKey) {
      this.config = { url, key: anonKey };
      this.status.value = 'idle';
    }
  }

  get online(): boolean {
    return this.config !== null;
  }

  /** The SDK is loaded on demand, so an offline build never downloads it. */
  private getClient(): Promise<SupabaseClient | null> {
    if (!this.config) return Promise.resolve(null);
    if (!this.loading) {
      const { url, key } = this.config;
      this.loading = import('@supabase/supabase-js')
        .then(({ createClient }) => {
          this.client = createClient(url, key, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'human-bill/auth' },
          });
          return this.client;
        })
        .catch((err) => {
          console.warn('Supabase SDK failed to load', err);
          this.loading = null;
          return null;
        });
    }
    return this.loading;
  }

  private ensureSession(): Promise<boolean> {
    if (!this.config) return Promise.resolve(false);
    if (!this.sessionReady) {
      this.sessionReady = (async () => {
        const client = await this.getClient();
        if (!client) throw new Error('Supabase unavailable');
        const { data } = await client.auth.getSession();
        if (data.session) return true;
        const { error } = await client.auth.signInAnonymously();
        if (error) throw error;
        return true;
      })().catch((err) => {
        console.warn('Leaderboard sign-in failed', err);
        this.sessionReady = null;
        return false;
      });
    }
    return this.sessionReady;
  }

  /** Push progress. Cheap to call often: it skips when nothing meaningful changed. */
  async submit(state: GameState, force = false): Promise<void> {
    if (!this.config) return;
    const log10 = state.lifetimeEarned.gt(0) ? state.lifetimeEarned.log10() : 0;
    const now = Date.now();
    const changed =
      log10 - this.lastSent.log10 > 0.005 || state.dinoAt !== this.lastSent.dino || state.bestEra !== this.lastSent.era;
    if (!force && (!changed || now - this.lastSent.at < 60_000)) return;
    if (!(await this.ensureSession()) || !this.client) return;
    const { error } = await this.client.rpc('submit_score', {
      p_nickname: this.nickname.value,
      p_lifetime_log10: log10,
      p_play_time_s: Math.floor(state.playTime),
      p_dino_time_s: state.dinoAt === null ? null : Math.floor(state.dinoAt),
      p_best_era: state.bestEra,
      p_evolutions: state.evolutions,
      p_ended: state.endedAt !== null,
    });
    if (error) {
      console.warn('Score submit rejected', error.message);
      return;
    }
    this.lastSent = { log10, at: now, dino: state.dinoAt, era: state.bestEra };
  }

  async setNickname(name: string, state: GameState): Promise<boolean> {
    const clean = cleanNickname(name);
    if (!clean) return false;
    this.nickname.value = clean;
    savePlayer({ nickname: clean });
    await this.submit(state, true);
    return true;
  }

  async fetch(kind: BoardKind, limit = 50): Promise<BoardResult | null> {
    if (!(await this.ensureSession()) || !this.client) return null;
    this.status.value = 'busy';
    try {
      const fn = kind === 'lifetime' ? 'leaderboard_lifetime' : 'leaderboard_speedrun';
      const { data, error } = await this.client.rpc(fn, { p_limit: limit });
      if (error) throw error;
      const rows = (data ?? []) as { rank: number; nickname: string; value: number; is_me: boolean }[];
      const entries: LeaderEntry[] = rows.map((r) => ({
        rank: Number(r.rank),
        nickname: r.nickname,
        value: Number(r.value),
        me: r.is_me,
      }));
      const top = entries.filter((e) => e.rank <= limit);
      const me = entries.find((e) => e.me) ?? null;
      return { top, me };
    } catch (err) {
      console.warn('Leaderboard fetch failed', err);
      return null;
    } finally {
      this.status.value = 'idle';
    }
  }
}
