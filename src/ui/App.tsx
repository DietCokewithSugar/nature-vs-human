import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { BuildingCard, Panel, Toasts, TopBar } from './hud.tsx';
import { Modals } from './modals.tsx';
import type { Insets } from '../pixel/scene.ts';

/** Portrait or narrow screens put the panel under the map; landscape ones beside it. */
const SHEET_QUERY = '(orientation: portrait), (max-width: 620px)';

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

export function App({ onInsets }: { onInsets: (i: Insets) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const sheet = useMedia(SHEET_QUERY);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let last = '';
    const measure = () => {
      const top = el.querySelector('.topbar')?.getBoundingClientRect();
      const panel = el.querySelector('.panel')?.getBoundingClientRect();
      if (!top || !panel) return;
      const insets: Insets = sheet
        ? { top: top.bottom, right: 0, bottom: Math.max(0, window.innerHeight - panel.top), left: 0 }
        : { top: top.bottom, right: Math.max(0, window.innerWidth - panel.left), bottom: 0, left: 0 };
      const key = JSON.stringify(insets);
      if (key !== last) {
        last = key;
        onInsets(insets);
      }
    };
    const ro = new ResizeObserver(measure);
    el.querySelectorAll('.topbar, .panel').forEach((n) => ro.observe(n));
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sheet]);

  return (
    <div class="hud" ref={root} data-layout={sheet ? 'sheet' : 'side'}>
      <TopBar />
      <Panel />
      <BuildingCard />
      <Toasts />
      <Modals />
    </div>
  );
}
