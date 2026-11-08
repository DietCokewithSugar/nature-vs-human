import { Graphics, Sprite, Texture } from 'pixi.js';
import { CELL, CELLS, ERA_COUNT, GRID, eraBounds } from '../core/index.ts';
import { C, numOf } from './palette.ts';

/**
 * The fog of war, StarCraft style: black where nature has never looked, a dark veil over ground
 * it has seen but can't see now, clear where it can see. One texel per cell, smoothed by linear
 * filtering so the edge of sight is soft. The closed rings of later eras are black too, with a
 * dashed border marking where the next era opens.
 */
const SEEN_ALPHA = 150;

export class Fog {
  readonly sprite: Sprite;
  readonly border = new Graphics();
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private texture: Texture;
  private era = -1;
  private last = new Uint8Array(CELLS).fill(255);

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID;
    this.canvas.height = GRID;
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(GRID, GRID);
    const ink = numOf(C.ink);
    for (let i = 0; i < CELLS; i++) {
      this.img.data[i * 4] = (ink >> 16) & 255;
      this.img.data[i * 4 + 1] = (ink >> 8) & 255;
      this.img.data[i * 4 + 2] = ink & 255;
      this.img.data[i * 4 + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(CELL);
  }

  update(explored: number[], visible: Uint8Array, ring: Uint8Array, era: number): void {
    const d = this.img.data;
    let changed = false;
    for (let i = 0; i < CELLS; i++) {
      const a = ring[i]! > era || !explored[i] ? 255 : visible[i] ? 0 : SEEN_ALPHA;
      if (a === this.last[i]) continue;
      this.last[i] = a;
      d[i * 4 + 3] = a;
      changed = true;
    }
    if (changed) {
      this.g.putImageData(this.img, 0, 0);
      this.texture.source.update();
    }
    if (era !== this.era) {
      this.era = era;
      this.drawBorder();
    }
  }

  /** A dashed gold line round the open square: the next era opens beyond it. */
  private drawBorder(): void {
    const g = this.border;
    g.clear();
    if (this.era >= ERA_COUNT - 1) return;
    const [a, b] = eraBounds(this.era);
    const x0 = a * CELL;
    const x1 = (b + 1) * CELL;
    const col = numOf(C.gold);
    const dash = (xa: number, ya: number, xb: number, yb: number) => {
      const len = Math.hypot(xb - xa, yb - ya);
      for (let t = 0; t < len; t += 12) {
        const e = Math.min(len, t + 6);
        g.moveTo(xa + ((xb - xa) * t) / len, ya + ((yb - ya) * t) / len).lineTo(xa + ((xb - xa) * e) / len, ya + ((yb - ya) * e) / len);
      }
    };
    dash(x0, x0, x1, x0);
    dash(x1, x0, x1, x1);
    dash(x1, x1, x0, x1);
    dash(x0, x1, x0, x0);
    g.stroke({ color: col, width: 2, alpha: 0.7 });
  }
}
