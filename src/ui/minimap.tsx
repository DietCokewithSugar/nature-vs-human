import { useEffect, useRef } from 'preact/hooks';
import { BUILDINGS, CELL, GRID, eraBounds, mapOf, type Game } from '../core/index.ts';
import { C } from '../pixel/palette.ts';
import { COPY } from './copy.ts';
import { app, frame, mapRect } from './store.ts';

/** Size of the minimap on screen, CSS px. */
const SIZE = 168;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TERRAIN_RGB = [C.sage, C.pine, C.tan, C.skin, C.mist, C.sky, C.blue, C.night].map(rgb);
const NATURE = rgb(C.mint);
const HUMAN = rgb(C.vermilion);
const INK = rgb(C.ink);

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * The minimap, StarCraft style: the open part of the map, black where nature hasn't looked,
 * dimmed where it can't see now; who holds what; buildings, units, flags and the camera.
 * Click or drag on it to move the camera.
 */
export function Minimap() {
  frame.value;
  const ref = useRef<HTMLCanvasElement>(null);
  const r = mapRect.value;
  useEffect(() => {
    const c = ref.current;
    if (c) draw(c, app.game);
  });
  const pick = (e: PointerEvent) => {
    const c = ref.current;
    if (!c) return;
    const b = c.getBoundingClientRect();
    const [lo, hi] = eraBounds(app.game.run.era);
    const n = hi - lo + 1;
    const fx = (e.clientX - b.left) / b.width;
    const fy = (e.clientY - b.top) / b.height;
    app.centerOn((lo + fx * n) * CELL, (lo + fy * n) * CELL);
  };
  if (r.w < 360 || r.h < 300) return null;
  return (
    <div class="minimap" style={{ left: `${r.x + 10}px`, top: `${r.y + r.h - SIZE - 24}px` }}>
      <canvas
        ref={ref}
        width={SIZE * 2}
        height={SIZE * 2}
        aria-label={COPY.minimap.label}
        title={COPY.minimap.label}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) pick(e);
        }}
      />
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, game: Game): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const run = game.run;
  const map = mapOf(run);
  const [lo, hi] = eraBounds(run.era);
  const n = hi - lo + 1;
  const img = g.createImageData(n, n);
  const d = img.data;
  const vis = game.visible;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (lo + y) * GRID + lo + x;
      let col: [number, number, number];
      if (!run.explored[i]) col = INK;
      else {
        col = TERRAIN_RGB[map.terrain[i]!]!;
        const c = run.control[i]!;
        if (c >= 50) col = mix(col, NATURE, 0.55);
        else if (c <= -50) col = mix(col, HUMAN, 0.5);
        if (!vis[i]) col = mix(col, INK, 0.45);
      }
      const k = (y * n + x) * 4;
      d[k] = col[0];
      d[k + 1] = col[1];
      d[k + 2] = col[2];
      d[k + 3] = 255;
    }
  }
  // Scale the cells up crisply.
  const tmp = scratch(n);
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, n, n, 0, 0, canvas.width, canvas.height);
  const k = canvas.width / (n * CELL);
  const ox = lo * CELL;
  const toX = (x: number) => (x - ox) * k;
  for (const b of run.buildings) {
    const own = b.side === 'nature';
    if (!own && !b.seen) continue;
    const s = BUILDINGS[b.kind].main ? 7 : 4;
    g.fillStyle = C.ink;
    g.fillRect(toX(b.x) - s / 2 - 1, toX(b.y - CELL / 2) - s / 2 - 1, s + 2, s + 2);
    g.fillStyle = own ? C.foam : C.salmon;
    g.fillRect(toX(b.x) - s / 2, toX(b.y - CELL / 2) - s / 2, s, s);
  }
  for (const u of run.units) {
    if (u.side === 'human') {
      const c = Math.floor(u.y / CELL) * GRID + Math.floor(u.x / CELL);
      if (!vis[c]) continue;
    }
    g.fillStyle = u.side === 'nature' ? C.mint : C.red;
    g.fillRect(toX(u.x) - 1.5, toX(u.y) - 1.5, 3, 3);
  }
  for (const f of run.flags) {
    g.fillStyle = C.gold;
    g.fillRect(toX(f.x) - 1, toX(f.y) - 8, 2, 9);
    g.fillRect(toX(f.x), toX(f.y) - 8, 5, 4);
  }
  const v = app.viewRect();
  g.strokeStyle = C.white;
  g.lineWidth = 2;
  g.strokeRect(toX(v.x0), toX(v.y0), (v.x1 - v.x0) * k, (v.y1 - v.y0) * k);
}

let tmpCanvas: HTMLCanvasElement | null = null;
function scratch(n: number): HTMLCanvasElement {
  if (!tmpCanvas) tmpCanvas = document.createElement('canvas');
  if (tmpCanvas.width !== n) {
    tmpCanvas.width = n;
    tmpCanvas.height = n;
  }
  return tmpCanvas;
}
