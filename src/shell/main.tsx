import '@fontsource/zcool-kuaile/400.css';
import '@fontsource-variable/fredoka/wght.css';
import '@radix-ui/colors/olive.css';
import '@radix-ui/colors/olive-alpha.css';
import '@radix-ui/colors/grass.css';
import '@radix-ui/colors/amber.css';
import '@radix-ui/colors/tomato.css';
import '@radix-ui/colors/cyan.css';
import '@radix-ui/colors/lime.css';
import '@radix-ui/colors/brown.css';
import '@radix-ui/colors/orange.css';
import '@radix-ui/colors/sky.css';
import '@radix-ui/colors/gold.css';
import '@radix-ui/colors/bronze.css';
import '@radix-ui/colors/iris.css';
import '@radix-ui/colors/jade.css';
import '@radix-ui/colors/violet.css';
import '@radix-ui/colors/slate.css';
import '@radix-ui/colors/black-alpha.css';
import '@radix-ui/colors/white-alpha.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';

import { signal } from '@preact/signals';
import { render } from 'preact';
import {
  BUILDINGS,
  CLASSES,
  DISASTERS,
  DOMESTICS,
  Game,
  UNITS,
  exportSave,
  formatNumber,
  importSave,
  type BuildingId,
  type CoreEvent,
  type CreatureId,
  type Difficulty,
  type RouteId,
} from '../core/index.ts';
import { Leaderboard } from '../data/leaderboard.ts';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../data/storage.ts';
import type { CityScene } from '../scene/city.ts';
import { PixelScene } from '../pixel/scene.ts';
import { App } from '../ui/App.tsx';
import { COPY } from '../ui/copy.ts';
import { Sfx } from '../ui/sfx.ts';
import { detail, flash, frame, modal, placing, pushFloat, pushToast, rallying, setApp, showEra } from '../ui/store.ts';
import { LOOK } from './look.ts';
import { GameLoop } from './loop.ts';

const game = new Game(loadGame());
const settings = signal<Settings>(loadSettings());
const sfx = new Sfx();
sfx.muted = settings.value.muted;
const leaderboard = new Leaderboard(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
// The pixel map is the default; the old 3D scene (and three.js) loads only when asked for.
const scene: PixelScene | CityScene = LOOK === '3d' ? new (await import('../scene/city.ts')).CityScene(canvas) : new PixelScene(canvas);
scene.setQuality(settings.value.quality);

// ── Taps on the map ────────────────────────────────────────────

scene.onBubble = (id, x, y) => {
  const v = game.collect(id);
  if (v > 0) {
    sfx.click();
    pushFloat(x, y, `+${formatNumber(v)}`);
  }
};

scene.onBuilding = (id) => {
  detail.value = id;
  modal.value = 'building';
};

scene.onUnit = (id) => {
  detail.value = id;
  modal.value = 'unit';
};

scene.onCell = (cell) => {
  const kind = placing.value;
  if (!kind) return;
  const v = game.placeCheck(kind, cell);
  if (!v.ok) {
    sfx.deny();
    pushToast({ title: COPY.build.badSite[v.why] ?? COPY.build.noSite, tone: 'bad' }, 1800);
    return;
  }
  if (game.place(kind, cell)) {
    sfx.buy();
    stopPlacing();
  }
};

scene.onRally = (x, z) => {
  game.setRally(x, z);
  rallying.value = false;
  scene.setMode('normal');
  sfx.upgrade();
  pushToast({ title: COPY.toast.rallySet }, 1600);
};

function startPlacing(kind: BuildingId): void {
  rallying.value = false;
  placing.value = kind;
  scene.setMode('place', game.sites(kind));
}

function stopPlacing(): void {
  placing.value = null;
  scene.setMode('normal');
}

// ── The loop ───────────────────────────────────────────────────

/** Taming warnings fire once per species per run when the meter passes 70%. */
const warned = new Set<CreatureId>();

const loop = new GameLoop(game, () => {
  scene.sync(game);
  for (const [id, v] of Object.entries(game.run.taming) as [CreatureId, number][]) {
    if (v > 0.7 && !warned.has(id)) {
      warned.add(id);
      pushToast({ title: COPY.toast.taming(UNITS[id].name), tone: 'bad' });
      sfx.deny();
    }
  }
  // Keep the placement overlay honest as ground changes hands.
  if (placing.value) {
    const sites = game.sites(placing.value);
    if (!sites.size || game.buildingCost(placing.value) > game.run.essence) {
      if (!sites.size) pushToast({ title: COPY.build.noSite, tone: 'bad' }, 1800);
      stopPlacing();
    } else if (Math.random() < 0.1) scene.setMode('place', sites);
  }
});

function save(): void {
  saveGame(game.state);
}

function onEvent(e: CoreEvent): void {
  scene.event(e);
  switch (e.type) {
    case 'eraUnlocked': {
      showEra(e.era);
      sfx.era();
      if (placing.value) scene.setMode('place', game.sites(placing.value));
      save();
      break;
    }
    case 'countermeasure':
      pushToast({ ...COPY.toast.countermeasure(e.name, CLASSES[e.cm.cls].name), tone: 'bad' }, 5000);
      sfx.deny();
      break;
    case 'defected':
      pushToast({ ...COPY.toast.defected(UNITS[e.id].name, DOMESTICS[e.domestic].name), tone: 'bad' }, 5000);
      sfx.deny();
      save();
      break;
    case 'buildingDestroyed':
      if (e.side === 'nature') {
        pushToast({ ...COPY.toast.lostBuilding(BUILDINGS[e.kind].name), tone: 'bad' }, 3200);
        sfx.deny();
      } else {
        pushToast({ title: COPY.toast.razed(BUILDINGS[e.kind].name), tone: 'good' }, 2200);
      }
      if (detail.value === e.id && modal.value === 'building') modal.value = null;
      break;
    case 'buildingDone':
      if (e.side === 'nature') sfx.upgrade();
      break;
    case 'disasterWarning':
      sfx.deny();
      break;
    case 'disasterStarted': {
      const def = DISASTERS[e.id];
      pushToast(COPY.toast.disaster(def.name, COPY.disaster.boost(CLASSES[def.boost.cls].name, def.boost.x)), 5000);
      sfx.era();
      save();
      break;
    }
    case 'runEnded':
      sfx.evolve();
      stopPlacing();
      setTimeout(() => (modal.value = 'result'), e.result.won ? 2200 : 900);
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'runStarted':
      warned.clear();
      flash.value++;
      stopPlacing();
      scene.reset();
      save();
      showEra(1);
      setTimeout(() => pushToast(COPY.toast.welcome, 6000), 4200);
      break;
    case 'skillBought':
      sfx.upgrade();
      break;
    case 'strike':
      pushToast({ title: COPY.toast.strike(UNITS[e.bird].name), tone: 'good' }, 2400);
      break;
    case 'reset':
      scene.reset();
      break;
    default:
      break;
  }
}
game.on(onEvent);

function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  saveSettings(settings.value);
  sfx.muted = settings.value.muted;
  if (patch.quality) scene.setQuality(patch.quality);
}

setApp({
  game,
  settings,
  updateSettings,
  exportSave: () => exportSave(game.state),
  importSave: (text: string) => {
    try {
      saveGame(importSave(text));
      location.reload();
      return true;
    } catch {
      return false;
    }
  },
  resetSave: () => {
    loop.stop();
    clearGame();
    location.reload();
  },
  startRun: (route: RouteId, difficulty: Difficulty) => game.startRun(route, difficulty),
  startPlacing,
  cancelPlacing: stopPlacing,
  autoPlace: () => {
    const kind = placing.value;
    if (!kind) return;
    const cell = game.autoSite(kind);
    if (cell >= 0 && game.place(kind, cell)) {
      sfx.buy();
      stopPlacing();
    } else {
      sfx.deny();
      pushToast({ title: COPY.build.noSite, tone: 'bad' }, 1800);
    }
  },
  toggleRally: () => {
    stopPlacing();
    rallying.value = !rallying.value;
    scene.setMode(rallying.value ? 'rally' : 'normal');
  },
  clearRally: () => {
    game.clearRally();
    rallying.value = false;
    scene.setMode('normal');
  },
  recenter: () => scene.recenter(),
  cameraMoved: () => scene.cameraMoved,
  lookAt: (x, z) => scene.lookAt(x, z),
  select: (id) => scene.select(id),
  leaderboard,
  sfx,
});

render(<App onInsets={(i) => scene.setInsets(i)} />, document.getElementById('ui')!);

window.addEventListener('resize', () => scene.resize());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (placing.value || rallying.value)) {
    stopPlacing();
    rallying.value = false;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);

scene.sync(game);
if (game.run.result) modal.value = 'result';
else if (game.run.time < 1) {
  showEra(1);
  setTimeout(() => pushToast(COPY.toast.welcome, 6000), 4200);
}
loop.start();
setInterval(() => frame.value++, 125);
setInterval(() => {
  document.title = `${formatNumber(Math.floor(game.run.essence))} ${COPY.essence} · ${COPY.title}`;
}, 2000);
setInterval(save, 10_000);
setInterval(() => void leaderboard.submit(game.state), 30_000);
setTimeout(() => void leaderboard.submit(game.state, true), 4_000);

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
  (window as unknown as { __scene: typeof scene }).__scene = scene;
}
