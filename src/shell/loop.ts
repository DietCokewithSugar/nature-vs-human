import type { Game } from '../core/index.ts';

const TICK_MS = 50;

/**
 * Drives the logic core at a fixed 20 Hz while the page is open.
 * Uses wall-clock deltas, so a throttled background tab catches up on its next tick:
 * an open page counts as online. A closed page earns nothing (no offline income).
 */
export class GameLoop {
  private last = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.tick();
  };

  private readonly game: Game;
  private readonly afterTick: (dt: number) => void;

  constructor(game: Game, afterTick: (dt: number) => void = () => {}) {
    this.game = game;
    this.afterTick = afterTick;
  }

  start(): void {
    if (this.timer) return;
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** Restart the clock without crediting the gap (after loading or importing a save). */
  resync(): void {
    this.last = Date.now();
  }

  tick(): void {
    const now = Date.now();
    const delta = now - this.last;
    this.last = now;
    // The clock went backwards (manual change, NTP correction): skip this tick.
    if (delta <= 0) return;
    const dt = delta / 1000;
    this.game.advance(dt);
    this.afterTick(dt);
  }
}
