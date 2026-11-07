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
import '@radix-ui/colors/black-alpha.css';
import '@radix-ui/colors/white-alpha.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';

import { signal } from '@preact/signals';
import { render } from 'preact';
import {
  CLASSES,
  CREATURES,
  CREATURE_BY_ID,
  DISASTERS,
  DOMESTICS,
  Game,
  LAIRS,
  BALANCE,
  exportSave,
  formatMoney,
  importSave,
  tideLevel,
  type CoreEvent,
  type CreatureId,
  type Difficulty,
  type EraId,
  type RouteId,
} from '../core/index.ts';
import { Leaderboard } from '../data/leaderboard.ts';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../data/storage.ts';
import { CityScene, type SceneView } from '../scene/city.ts';
import { App } from '../ui/App.tsx';
import { COPY } from '../ui/copy.ts';
import { Sfx } from '../ui/sfx.ts';
import { detail, flash, focusEra, frame, modal, pushFloat, pushToast, setApp } from '../ui/store.ts';
import { GameLoop } from './loop.ts';

const game = new Game(loadGame());
const settings = signal<Settings>(loadSettings());
const sfx = new Sfx();
sfx.muted = settings.value.muted;
const leaderboard = new Leaderboard(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new CityScene(canvas);
scene.setQuality(settings.value.quality);

function repel(x?: number, y?: number): void {
  if (!game.repel()) return;
  sfx.upgrade();
  const at = x !== undefined && y !== undefined ? { x, y } : scene.raidScreen();
  if (at) pushFloat(at.x, at.y, COPY.toast.repelled);
}

scene.onTap = ({ x, y, raid, lair }) => {
  if (!game.running) return;
  if (raid) {
    repel(x, y);
    return;
  }
  const gain = game.click();
  sfx.click();
  pushFloat(x, y, `+${formatMoney(gain)}`);
  // Tapping a lair also opens its species' card.
  if (lair && CREATURE_BY_ID[lair].era <= game.run.era) {
    detail.value = lair;
    modal.value = 'creature';
  }
};

function sceneView(): SceneView {
  const run = game.run;
  const amounts = {} as Record<CreatureId, number>;
  for (const c of CREATURES) amounts[c.id] = run.creatures[c.id].bought + run.creatures[c.id].bred;
  const income = game.income();
  return {
    era: run.era,
    amounts,
    defected: run.defected,
    taming: run.taming,
    research: run.research,
    tide: game.mods.tide,
    tideLevel: tideLevel(run.tide.clock),
    surge: game.mods.tide && run.tide.surgeLeft > 0,
    rampage: run.rampageLeft > 0,
    intensity: income.gt(0) ? income.log10() : 0,
    outcome: run.result ? (run.result.won ? 'won' : 'lost') : 'running',
    lairs: run.lairs,
    raid: run.raid,
    disaster: run.disaster,
    creep: game.billProgress(),
  };
}

/** Taming warnings fire once per species per run when the meter passes 70%. */
const warned = new Set<CreatureId>();

const loop = new GameLoop(game, () => {
  scene.sync(sceneView());
  if (focusEra.value !== scene.focusedEra) focusEra.value = scene.focusedEra;
  for (const [id, v] of Object.entries(game.run.taming) as [CreatureId, number][]) {
    if (v > 0.7 && !warned.has(id)) {
      warned.add(id);
      pushToast({ title: COPY.toast.taming(CREATURE_BY_ID[id].name) });
      sfx.deny();
    }
  }
});

function save(): void {
  saveGame(game.state);
}

function onEvent(e: CoreEvent): void {
  switch (e.type) {
    case 'eraUnlocked': {
      const t = COPY.toast.era[e.era];
      if (t) pushToast({ ...t, era: e.era }, 5000);
      sfx.era();
      save();
      break;
    }
    case 'countermeasure':
      pushToast(COPY.toast.countermeasure(e.name, CLASSES[e.cm.cls].name), 5000);
      scene.pulse('countermeasure');
      sfx.deny();
      break;
    case 'defected':
      pushToast(COPY.toast.defected(CREATURE_BY_ID[e.id].name, DOMESTICS[e.domestic].name), 5000);
      scene.defect(e.id);
      sfx.deny();
      save();
      break;
    case 'active':
      if (e.id === 'sabotage' || e.id === 'rescue' || e.id === 'rampage') scene.pulse(e.id);
      break;
    case 'raidStarted':
      pushToast(COPY.toast.raid(LAIRS[e.target].name), 4000);
      sfx.deny();
      break;
    case 'raidLanded':
      pushToast(
        COPY.toast.raidLanded(LAIRS[e.target].name, CREATURE_BY_ID[e.target].name, Math.round(BALANCE.lairs.loss * game.mods.lairLossMult * 100)),
        4500,
      );
      sfx.deny();
      break;
    case 'disasterWarning':
      sfx.deny();
      break;
    case 'disasterStarted': {
      const def = DISASTERS[e.id];
      pushToast(COPY.toast.disaster(def.name, `${CLASSES[def.boost.cls].name} ×${def.boost.x}`, Math.round(e.research * 1000) / 10), 5000);
      sfx.era();
      save();
      break;
    }
    case 'runEnded':
      sfx.evolve();
      if (e.result.won) scene.setForest(true);
      setTimeout(() => (modal.value = 'result'), e.result.won ? 2200 : 900);
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'runStarted':
      warned.clear();
      flash.value++;
      scene.reset();
      scene.flyTo(1);
      focusEra.value = 1;
      save();
      break;
    case 'upgradeBought':
    case 'skillBought':
      sfx.upgrade();
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
  flyTo: (era: EraId) => {
    scene.flyTo(era);
    focusEra.value = era;
  },
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
  repel: () => repel(),
  raidScreen: () => scene.raidScreen(),
  recenter: () => scene.recenter(),
  cameraMoved: () => scene.cameraMoved,
  lookAtLair: (id) => scene.lookAtLair(id),
  leaderboard,
  sfx,
});

render(<App onInsets={(i) => scene.setInsets(i)} />, document.getElementById('ui')!);

window.addEventListener('resize', () => scene.resize());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);

scene.sync(sceneView());
if (game.run.result) modal.value = 'result';
loop.start();
setInterval(() => frame.value++, 125);
setInterval(() => {
  document.title = `${formatMoney(game.run.money)} · ${COPY.title}`;
}, 2000);
setInterval(save, 10_000);
setInterval(() => void leaderboard.submit(game.state), 30_000);
setTimeout(() => void leaderboard.submit(game.state, true), 4_000);

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game; __scene: CityScene }).__game = game;
  (window as unknown as { __scene: CityScene }).__scene = scene;
}
