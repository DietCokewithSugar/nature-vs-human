import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Counter, DisasterBanner, MapButton, Menu, NewsBubble, RaidMarker, RunBar, SkillDock, TapHint } from './hud.tsx';
import { Flash, Floats, Modals, Toasts } from './overlays.tsx';
import { Panel } from './panel.tsx';
import { sheet, viewInsets, type Insets, type Sheet } from './store.ts';

export interface AppProps {
  /** Reports how much of the viewport the UI covers so the camera frames the rest. */
  onInsets: (insets: Insets) => void;
}

/** Narrow or portrait screens get the shop as a bottom sheet; wide ones as a side panel. */
const SHEET_QUERY = '(max-width: 860px), (orientation: portrait) and (max-width: 1100px)';

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

type Heights = Record<Sheet, number>;

export function App({ onInsets }: AppProps) {
  const hud = useRef<HTMLDivElement>(null);
  const mobile = useMedia(SHEET_QUERY);
  const [heights, setHeights] = useState<Heights>({ closed: 70, half: 360, full: 600 });
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const drag = useRef<{ id: number; y0: number; h0: number; h: number; t: number; v: number; on: boolean } | null>(null);
  const dragEnd = useRef(0);

  useLayoutEffect(() => {
    const root = hud.current;
    if (!root) return;
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const panel = root.querySelector('.panel');
      const top = root.querySelector('.topbar')?.getBoundingClientRect();
      if (!panel || !top) return;
      document.documentElement.style.setProperty('--top-h', `${Math.round(top.bottom)}px`);
      const p = panel.getBoundingClientRect();
      let insets: Insets;
      if (mobile) {
        const head = panel.querySelector('.panel-head')!.getBoundingClientRect().height;
        const cs = getComputedStyle(panel);
        const closed = Math.round(head + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth));
        const full = Math.max(closed + 120, Math.round(h - top.bottom - 10));
        const half = Math.min(full, Math.max(closed + 200, Math.round(h * 0.44)));
        const cur = heightsRef.current;
        if (cur.closed !== closed || cur.half !== half || cur.full !== full) setHeights({ closed, half, full });
        const dock = root.querySelector('.skills')?.getBoundingClientRect();
        const cover = Math.min(p.top, dock && dock.height ? dock.top : p.top);
        insets = { top: top.bottom, right: 0, bottom: Math.max(0, h - cover), left: 0 };
      } else {
        const open = p.height > h * 0.5;
        insets = { top: 0, right: open ? w - p.left : 0, bottom: 0, left: 0 };
      }
      const prev = viewInsets.value;
      if (prev.top !== insets.top || prev.right !== insets.right || prev.bottom !== insets.bottom || prev.left !== insets.left) {
        viewInsets.value = insets;
        onInsets(insets);
      }
    };
    const ro = new ResizeObserver(measure);
    root.querySelectorAll('.panel, .topbar').forEach((el) => ro.observe(el));
    ro.observe(root);
    window.addEventListener('resize', measure);
    measure();
    const t = setInterval(measure, 1000);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      clearInterval(t);
    };
  }, [mobile]);

  /** Drag the sheet's header up or down; it snaps to closed, half or full on release. */
  const onGrab = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!mobile || e.button !== 0) return;
    const head = e.currentTarget;
    const start = heightsRef.current[sheet.value];
    drag.current = { id: e.pointerId, y0: e.clientY, h0: start, h: start, t: performance.now(), v: 0, on: false };
    const root = hud.current!;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      const dy = ev.clientY - d.y0;
      if (!d.on) {
        if (Math.abs(dy) < 6) return;
        d.on = true;
        try {
          head.setPointerCapture(d.id);
        } catch {
          /* pointer already gone */
        }
        root.dataset.dragging = '';
      }
      const H = heightsRef.current;
      const h = Math.min(H.full, Math.max(H.closed, d.h0 - dy));
      const now = performance.now();
      d.v = ((h - d.h) / Math.max(1, now - d.t)) * 0.6 + d.v * 0.4;
      d.h = h;
      d.t = now;
      root.style.setProperty('--sheet-h', `${h}px`);
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current = null;
      if (!d.on) return;
      delete root.dataset.dragging;
      dragEnd.current = performance.now();
      const H = heightsRef.current;
      // Fling: aim where the sheet would be ~180 ms from now.
      const aim = d.h + d.v * 180;
      const snap = (Object.keys(H) as Sheet[]).reduce((a, b) => (Math.abs(H[b] - aim) < Math.abs(H[a] - aim) ? b : a));
      root.style.setProperty('--sheet-h', `${H[snap]}px`);
      sheet.value = snap;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const state = sheet.value;
  return (
    <>
      <div class="hud" ref={hud} data-layout={mobile ? 'sheet' : 'side'} data-sheet={state} style={{ '--sheet-h': mobile ? `${heights[state]}px` : '' }}>
        <header class="topbar">
          <Counter />
          <RunBar />
          <Menu />
        </header>
        <MapButton />
        <DisasterBanner />
        <SkillDock />
        <Panel onGrab={onGrab} justDragged={() => performance.now() - dragEnd.current < 250} />
        <NewsBubble />
        <TapHint />
      </div>
      <RaidMarker />
      <Floats />
      <Toasts />
      <Flash />
      <Modals />
    </>
  );
}
