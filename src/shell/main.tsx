import '../styles/palette.css';
import '../styles/frames.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/game.css';

import { signal } from '@preact/signals';
import { render } from 'preact';
import { BUILDINGS, CELL, Game, UNITS, cellOwner, cxOf, cyOf, exportSave, formatNumber, importSave, isFull, trophicOf, type CoreEvent, type NatureBuildingId } from '../core/index.ts';
import { Leaderboard } from '../data/leaderboard.ts';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../data/storage.ts';
import { Scene, type MapTarget } from '../pixel/scene.ts';
import { App } from '../ui/App.tsx';
import { COPY } from '../ui/copy.ts';
import { chainText } from '../ui/foodweb.tsx';
import { HOTKEYS } from '../ui/hud.tsx';
import { Sfx } from '../ui/sfx.ts';
import { flagMode, frame, modal, placing, pushToast, selectedBuilding, selectedCell, setApp, tab } from '../ui/store.ts';
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

/** Build a kind on a cell, or wherever suits it best. */
function build(kind: NatureBuildingId, cell: number | null): boolean {
  const target = cell ?? game.autoCell(kind);
  if (target === null) {
    sfx.deny();
    pushToast({ title: COPY.build.noPad, tone: 'bad' }, 1800);
    return false;
  }
  const v = game.buildCheck(target, kind);
  if (!v.ok) {
    sfx.deny();
    pushToast({ title: COPY.build.problem[v.why], tone: 'bad' }, 1800);
    return false;
  }
  game.build(target, kind);
  sfx.buy();
  placing.value = null;
  selectedCell.value = null;
  return true;
}

function plantFlag(x: number, y: number): void {
  if (game.placeFlag(x, y)) {
    sfx.click();
    pushToast({ title: COPY.flags.placed, body: COPY.flags.hint }, 2400);
  } else {
    sfx.deny();
    pushToast({ title: COPY.flags.bad, tone: 'bad' }, 1600);
  }
  flagMode.value = false;
}

scene.onTap = (t: MapTarget) => {
  if (flagMode.value && t.type !== 'flag') {
    const cell = t.type === 'cell' ? t.cell : null;
    if (cell !== null) plantFlag(cxOf(cell) * CELL + CELL / 2, cyOf(cell) * CELL + CELL / 2);
    else flagMode.value = false;
    return;
  }
  switch (t.type) {
    case 'cell': {
      selectedBuilding.value = null;
      if (placing.value) {
        build(placing.value, t.cell);
        return;
      }
      if (cellOwner(game.run, t.cell) !== 'nature') {
        selectedCell.value = null;
        return;
      }
      sfx.click();
      selectedCell.value = selectedCell.value === t.cell ? null : t.cell;
      tab.value = 'build';
      return;
    }
    case 'flag':
      if (game.removeFlag(t.id)) {
        sfx.click();
        pushToast({ title: COPY.flags.removed }, 1400);
      }
      return;
    case 'building':
      sfx.click();
      selectedCell.value = null;
      selectedBuilding.value = selectedBuilding.value === t.id ? null : t.id;
      return;
    case 'unit': {
      const u = game.run.units.find((x) => x.id === t.id);
      if (!u) return;
      const level = trophicOf(u.kind);
      const belly = u.side === 'nature' ? (u.hungry ? COPY.food.hungryNow : isFull(game.run, u) ? COPY.food.fullNow : '') : '';
      const body = [UNITS[u.kind].role, level ? `${COPY.food.level[level]} · ${chainText(u.kind)}` : '', belly].filter(Boolean).join('\n');
      pushToast({ title: UNITS[u.kind].name, body }, 2600);
      return;
    }
    default:
      selectedCell.value = null;
      selectedBuilding.value = null;
  }
};

// Right click, as in an RTS: cancel what you're holding, otherwise send the army there (a flag).
scene.onRightTap = (x: number, y: number) => {
  if (placing.value || flagMode.value) {
    placing.value = null;
    flagMode.value = false;
    return;
  }
  plantFlag(x, y);
};

let buildableAt = -1;
let buildable: number[] = [];
const loop = new GameLoop(game, () => {
  scene.sync(game);
  // The build highlight only matters while placing; it's worked out a couple of times a second.
  if (placing.value && game.run.time - buildableAt > 0.5) {
    buildable = game.openCells();
    buildableAt = game.run.time;
  } else if (!placing.value) buildableAt = -1;
  scene.setBuildable(placing.value ? buildable : [], placing.value);
  scene.selectCell(selectedCell.value);
  scene.select(selectedBuilding.value);
  if (selectedCell.value !== null && cellOwner(game.run, selectedCell.value) !== 'nature') selectedCell.value = null;
});

const noPreyAt = new Map<string, number>();

const STARVE_NAME = { grass: COPY.chain.herbivores + '动物', meat: COPY.chain.predators + '动物', food: '' } as const;

game.on((e: CoreEvent) => {
  scene.event(e);
  switch (e.type) {
    case 'stageStarted':
      scene.reset();
      pushToast(COPY.toast.stage(e.stage, COPY.eras[e.era]!, e.opened), 4200);
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
    case 'noPrey': {
      // Once in a while per species: it's a nudge, not an alarm.
      const now = Date.now();
      if ((noPreyAt.get(e.kind) ?? 0) > now) break;
      noPreyAt.set(e.kind, now + 45_000);
      const prey = (UNITS[e.kind].prey ?? []).map((p) => UNITS[p].name).join(COPY.food.or);
      pushToast({ ...COPY.toast.noPrey(UNITS[e.kind].name, prey), tone: 'bad' }, 4000);
      break;
    }
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
      selectedCell.value = null;
      void leaderboard.submit(game.state, true);
      break;
    case 'runEnded':
      sfx.deny();
      placing.value = null;
      selectedCell.value = null;
      selectedBuilding.value = null;
      save();
      void leaderboard.submit(game.state, true);
      break;
    case 'runStarted':
      scene.reset();
      scene.home();
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
  recenter: () => scene.home(),
  viewRect: () => scene.viewRect(),
  centerOn: (x, y) => scene.centerOn(x, y),
  buildingScreen: (id) => scene.buildingScreen(id),
  leaderboard,
  sfx,
});

render(<App onInsets={(i) => scene.setInsets(i)} />, document.getElementById('ui')!);

window.addEventListener('resize', () => scene.resize());
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  if (e.key === 'Escape') {
    placing.value = null;
    flagMode.value = false;
    selectedCell.value = null;
    selectedBuilding.value = null;
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || modal.value !== null || game.run.phase !== 'battle') return;
  if (e.key === ' ' || e.key.toLowerCase() === 'h') {
    e.preventDefault();
    scene.home();
    return;
  }
  if (e.key.toLowerCase() === 'f') {
    flagMode.value = !flagMode.value;
    placing.value = null;
    return;
  }
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= HOTKEYS.length) {
    const kind = HOTKEYS[n - 1]!;
    if (selectedCell.value !== null) build(kind, selectedCell.value);
    else {
      placing.value = placing.value === kind ? null : kind;
      flagMode.value = false;
      tab.value = 'build';
    }
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
}
