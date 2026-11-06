import { useEffect, useRef } from 'preact/hooks';
import { Actions, Counter, Dock, EraBar, RunBar, TapHint, Ticker } from './hud.tsx';
import { Flash, Floats, Modals, Toasts } from './overlays.tsx';
import { Panel } from './panel.tsx';

export interface AppProps {
  /** Reports how much of the viewport the UI covers so the camera frames the rest. */
  onInsets: (insets: { top: number; right: number; bottom: number; left: number }) => void;
}

export function App({ onInsets }: AppProps) {
  const hud = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = hud.current;
    if (!root) return;
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const panel = root.querySelector('.panel')?.getBoundingClientRect();
      const top = root.querySelector('.topbar')?.getBoundingClientRect();
      const mech = root.querySelector('.mechanics')?.getBoundingClientRect();
      if (!panel) return;
      const sheet = panel.width > w * 0.7;
      if (sheet) {
        const coverTop = Math.min(panel.top, mech && mech.height ? mech.top : panel.top);
        onInsets({ top: top?.bottom ?? 0, right: 0, bottom: h - coverTop, left: 0 });
      } else {
        onInsets({ top: 0, right: w - panel.left, bottom: 0, left: 0 });
      }
    };
    const ro = new ResizeObserver(measure);
    root.querySelectorAll('.panel, .topbar, .mechanics').forEach((el) => ro.observe(el));
    ro.observe(root);
    window.addEventListener('resize', measure);
    measure();
    const t = setInterval(measure, 1500);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <div class="hud" ref={hud}>
        <header class="topbar">
          <div class="topbar-left">
            <Counter />
            <EraBar />
          </div>
          <RunBar />
          <Actions />
        </header>
        <div class="dock">
          <Dock />
          <Ticker />
        </div>
        <Panel />
        <TapHint />
      </div>
      <Floats />
      <Toasts />
      <Flash />
      <Modals />
    </>
  );
}
