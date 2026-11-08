import '../styles/palette.css';
import '../styles/frames.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/game.css';

import { signal } from '@preact/signals';
import { render } from 'preact';
import { BUILDINGS, Game, PADS, UNITS, exportSave, formatNumber, importSave, padUser, type CoreEvent, type NatureBuildingId } from '../core/index.ts';
import { Leaderboard } from '../data/leaderboard.ts';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../data/storage.ts';
import { Scene, type MapTarget } from '../pixel/scene.ts';
import { App } from '../ui/App.tsx';
import { COPY } from '../ui/copy.ts';
import { Sfx } from '../ui/sfx.ts';
import { frame, modal, placing, pushToast, selectedBuilding, selectedPad, setApp, tab } from '../ui/store.ts';
import { GameLoop } from './loop.ts';

const game = new Game(loadGame());
const settings = signal<Settings>(loadSettings());
const sfx = new Sfx();
sfx.muted = settings.value.muted;
const leaderboard = new Leaderboard(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new Scene(canvas);

function save(): void {
  saveGame(game.state);
}

/** Build a kind on a pad, or wherever suits it best. */
function build(kind: NatureBuildingId, pad: number | null): boolean {
  const target = pad ?? game.autoPad(kind);
  if (target === null) {
    sfx.deny();
    pushToast({ title: COPY.build.noPad, tone: 'bad' }, 1600);
    return false;
  }
  const v = game.buildCheck(target, kind);
  if (!v.ok) {
    sfx.deny();
    pushToast({ title: COPY.build.problem[v.why], tone: 'bad' }, 1600);
    return false;
  }
  game.build(target, kind);
  sfx.buy();
  placing.value = null;
  selectedPad.value = null;
  return true;
}

scene.onTap = (t: MapTarget) => {
  switch (t.type) {
    case 'pad': {
      selectedBuilding.value = null;
      if (placing.value) {
        build(placing.value, t.pad);
        return;
      }
      if (padUser(game.run, t.pad) !== 'nature') {
        sfx.deny();
        pushToast({ title: COPY.build.problem.ground, tone: 'bad' }, 1600);
        return;
      }
      sfx.click();
      selectedPad.value = selectedPad.value === t.pad ? null : t.pad;
      tab.value = 'build';
      return;
    }
    case 'building':
      sfx.click();
      selectedPad.value = null;
      selectedBuilding.value = selectedBuilding.value === t.id ? null : t.id;
      return;
    case 'unit': {
      const u = game.run.units.find((x) => x.id === t.id);
      if (u) pushToast({ title: UNITS[u.kind].name, body: UNITS[u.kind].role }, 1600);
      return;
    }
    default:
      selectedPad.value = null;
      selectedBuilding.value = null;
  }
};

const loop = new GameLoop(game, () => {
  scene.sync(game);
  scene.setBuildable(game.run.phase === 'battle' ? game.openPads() : [], placing.value !== null);
  scene.selectPad(selectedPad.value);
  scene.select(selectedBuilding.value);
  if (selectedPad.value !== null && padUser(game.run, selectedPad.value) !== 'nature') selectedPad.value = null;
});

const STARVE_NAME = { grass: COPY.chain.herbivores + '动物', meat: COPY.chain.predators + '动物', food: '' } as const;

game.on((e: CoreEvent) => {
  scene.event(e);
  switch (e.type) {
    case 'stageStarted':
      scene.reset();
      pushToast(COPY.toast.stage(e.stage, COPY.top.camp(e.stage)), 3800);
      sfx.era();
      save();
      break;
    case 'research':
      pushToast({ ...COPY.toast.research(e.level), tone: 'bad' }, 3000);
      break;
    case 'starving':
      if (e.side === 'nature') {
        pushToast({ title: COPY.toast.starving(STARVE_NAME[e.diet]).title, body: COPY.chain.help, tone: 'bad' }, 4000);
        sfx.deny();
      }
      break;
    case 'destroyed':
      if (e.side === 'nature' && BUILDINGS[e.kind].main !== true) {
        pushToast({ ...COPY.toast.lost(BUILDINGS[e.kind].name), tone: 'bad' }, 2600);
        sfx.deny();
      }
      if (selectedBuilding.value === e.id) selectedBuilding.value = null;
      break;
    case 'stageWon':
      pushToast({ ...COPY.toast.won(e.stage), tone: 'good' }, 2400);
      sfx.evolve();
      placing.value = null;
      selectedPad.value = null;
      void leaderboard.submit(game.state, true);
      break;
    case 'runEnded':
      sfx.deny();
      placing.value = null;
      selectedPad.value = null;
      selectedBuilding.value = null;
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'runStarted':
      scene.reset();
      save();
      break;
    case 'built':
      if (e.side === 'nature') sfx.upgrade();
      break;
    default:
      break;
  }
});

function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  saveSettings(settings.value);
  sfx.muted = settings.value.muted;
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
  build,
  recenter: () => scene.recenter(),
  buildingScreen: (id) => scene.buildingScreen(id),
  leaderboard,
  sfx,
});

render(<App onInsets={(i) => scene.setInsets(i)} />, document.getElementById('ui')!);

window.addEventListener('resize', () => scene.resize());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    placing.value = null;
    selectedPad.value = null;
    selectedBuilding.value = null;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);

scene.sync(game);
// First visit: explain the game once.
try {
  if (!localStorage.getItem('human-bill/seen-help')) {
    modal.value = 'help';
    localStorage.setItem('human-bill/seen-help', '1');
  }
} catch {
  /* storage unavailable */
}
loop.start();
setInterval(() => frame.value++, 125);
setInterval(() => {
  document.title = `${formatNumber(Math.floor(game.run.essence))} ${COPY.essence} · ${COPY.title}`;
}, 2000);
setInterval(save, 10_000);
setInterval(() => void leaderboard.submit(game.state), 30_000);

if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__scene = scene;
  w.__pads = PADS;
}
