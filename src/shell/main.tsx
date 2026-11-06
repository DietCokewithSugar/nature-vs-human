import '@fontsource/zcool-kuaile/400.css';
import '@fontsource-variable/fredoka/wght.css';
import '@radix-ui/colors/olive.css';
import '@radix-ui/colors/olive-alpha.css';
import '@radix-ui/colors/grass.css';
import '@radix-ui/colors/amber.css';
import '@radix-ui/colors/tomato.css';
import '@radix-ui/colors/cyan.css';
import '@radix-ui/colors/cyan-alpha.css';
import '@radix-ui/colors/lime.css';
import '@radix-ui/colors/brown.css';
import '@radix-ui/colors/sky.css';
import '@radix-ui/colors/black-alpha.css';
import '@radix-ui/colors/white-alpha.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';

import { signal } from '@preact/signals';
import { render } from 'preact';
import {
  CREATURES,
  Game,
  exportSave,
  formatMoney,
  importSave,
  tideLevel,
  type CoreEvent,
  type CreatureId,
  type EraId,
} from '../core/index.ts';
import { Leaderboard } from '../data/leaderboard.ts';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../data/storage.ts';
import { CityScene, type SceneView } from '../scene/city.ts';
import { App } from '../ui/App.tsx';
import { COPY, NEWS_EVOLVED } from '../ui/copy.ts';
import { Sfx } from '../ui/sfx.ts';
import { flash, focusEra, frame, modal, pushFloat, pushToast, setApp } from '../ui/store.ts';
import { GameLoop } from './loop.ts';

const game = new Game(loadGame());
const settings = signal<Settings>(loadSettings());
const sfx = new Sfx();
sfx.muted = settings.value.muted;
const leaderboard = new Leaderboard(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new CityScene(canvas);
scene.setQuality(settings.value.quality);

scene.onTap = ({ x, y }) => {
  const gain = game.click();
  sfx.click();
  pushFloat(x, y, `+${formatMoney(gain)}`);
};

function sceneView(): SceneView {
  const s = game.state;
  const amounts = {} as Record<CreatureId, number>;
  let bred = 0;
  for (const c of CREATURES) {
    const cs = s.creatures[c.id];
    amounts[c.id] = cs.bought + cs.bred;
    if (c.era === 1) bred += cs.bred;
  }
  const income = game.income();
  return {
    era: s.era,
    amounts,
    queens: game.mods.breeding ? s.queens : 0,
    bredInsects: bred,
    tide: game.mods.tide,
    tideLevel: tideLevel(s.tide.clock),
    surge: game.mods.tide && s.tide.surgeLeft > 0,
    intensity: income.gt(0) ? income.log10() : 0,
  };
}

const loop = new GameLoop(game, () => {
  scene.sync(sceneView());
  if (focusEra.value !== scene.focusedEra) focusEra.value = scene.focusedEra;
});

function save(): void {
  saveGame(game.state);
}

function onEvent(e: CoreEvent): void {
  switch (e.type) {
    case 'eraUnlocked':
      if (e.era >= 2) {
        const t = COPY.toast.era[e.era];
        if (t) pushToast({ ...t, era: e.era }, 5000);
        sfx.era();
      }
      save();
      break;
    case 'evolved':
      sfx.evolve();
      flash.value++;
      scene.rebuildAll();
      scene.flyTo(game.state.era);
      focusEra.value = game.state.era;
      pushToast({ title: COPY.toast.evolved(String(e.gained)), body: NEWS_EVOLVED[e.evolutions % NEWS_EVOLVED.length] }, 5000);
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'ending':
      sfx.evolve();
      scene.setForest(true);
      setTimeout(() => (modal.value = 'ending'), 1800);
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'upgradeBought':
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
      const state = importSave(text);
      saveGame(state);
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
  onEndingClosed: () => {
    scene.setForest(false);
    pushToast({ title: COPY.toast.rebuilt });
  },
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
loop.start();
setInterval(() => frame.value++, 125);
setInterval(() => {
  document.title = `${formatMoney(game.state.money)} · ${COPY.title}`;
}, 2000);
setInterval(save, 10_000);
setInterval(() => void leaderboard.submit(game.state), 30_000);
setTimeout(() => void leaderboard.submit(game.state, true), 4_000);

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game; __scene: CityScene }).__game = game;
  (window as unknown as { __scene: CityScene }).__scene = scene;
}
