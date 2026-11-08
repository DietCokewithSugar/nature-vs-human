import { signal } from '@preact/signals';
import {
  BALANCE,
  BUILDINGS,
  HERBIVORES,
  LEVEL_IDS,
  PREDATORS,
  UNITS,
  cellOwner,
  humanLevel,
  isMain,
  landCounts,
  mainOf,
  meadowGrass,
  motherIncome,
  natureFood,
  natureIncome,
  spawnInterval,
  towerDmg,
  unitAtk,
  unitEat,
  unitMaxHp,
  unitMeat,
  type LevelId,
  type NatureBuildingId,
  type NatureUnitId,
} from '../core/index.ts';
import { Bar, Essence, Pic, fmt } from './common.tsx';
import { COPY, FOOD_NAME } from './copy.ts';
import { app, flagMode, frame, modal, placing, pushToast, selectedBuilding, selectedCell, tab, toasts } from './store.ts';

// ── Top bar: the stage and the humans ───────────────────────────

export function TopBar() {
  frame.value;
  const run = app.game.run;
  const lodge = mainOf(run, 'human');
  const share = lodge ? lodge.hp / lodge.maxHp : 0;
  const lv = humanLevel(run);
  const next = Math.ceil(BALANCE.human.researchPeriod - (run.stageTime % BALANCE.human.researchPeriod));
  const people = run.units.filter((u) => u.side === 'human').length;
  const land = landCounts(run);
  const pn = Math.round((land.nature / Math.max(1, land.total)) * 100);
  const ph = Math.round((land.human / Math.max(1, land.total)) * 100);
  return (
    <header class="topbar">
      <div class="stage-badge">
        <b>{COPY.top.stage(run.stage)}</b>
        <small>
          {COPY.eras[run.era]} · {COPY.top.camp(run.stage)}
        </small>
      </div>
      <div class="foe">
        <Pic k="building/lodge" scale={1} class="foe-pic" />
        <div class="foe-text">
          <div class="foe-row">
            <span>{COPY.top.lodge}</span>
            <Bar value={share} tone="human" label={COPY.top.lodge} />
          </div>
          <small>
            {COPY.top.tools(lv)} · {COPY.top.nextTools(next)} · {COPY.top.people(people)}
          </small>
        </div>
      </div>
      <div class="land" title={COPY.top.landSplit(pn, ph)}>
        <span class="land-label">{COPY.top.land}</span>
        <span class="land-bar" role="meter" aria-label={COPY.top.landSplit(pn, ph)}>
          <i class="n" style={{ width: `${pn}%` }} />
          <i class="h" style={{ width: `${ph}%` }} />
        </span>
        <small class="num">{COPY.top.landSplit(pn, ph)}</small>
      </div>
      <div class="top-buttons">
        <button type="button" class="btn plain small" onClick={() => app.recenter()} title={COPY.top.recenter}>
          {COPY.top.recenter}
        </button>
        <Menu />
      </div>
    </header>
  );
}

function Menu() {
  const open = modal.value === null && menuOpen.value;
  return (
    <div class="menu">
      <button type="button" class="btn wood small" aria-expanded={open} onClick={() => (menuOpen.value = !menuOpen.value)}>
        ☰
      </button>
      {open && (
        <div class="menu-pop" onClick={() => (menuOpen.value = false)}>
          <button type="button" onClick={() => (modal.value = 'help')}>
            {COPY.menu.help}
          </button>
          <button type="button" onClick={() => (modal.value = 'leaderboard')}>
            {COPY.menu.leaderboard}
          </button>
          <button type="button" onClick={() => (modal.value = 'settings')}>
            {COPY.menu.settings}
          </button>
          <button type="button" class="danger" onClick={() => (modal.value = 'giveUp')}>
            {COPY.menu.giveUp}
          </button>
        </div>
      )}
    </div>
  );
}

const menuOpen = signal(false);

// ── The side panel ──────────────────────────────────────────────

export function Panel() {
  frame.value;
  const run = app.game.run;
  const inc = natureIncome(run, app.game.mods);
  return (
    <aside class="panel">
      <div class="purse">
        <Essence v={run.essence} />
        <small class="num">
          +{fmt(inc.total)}
          {COPY.perSecond}
        </small>
      </div>
      <FoodChain />
      <FlagRow />
      <nav class="tabs" role="tablist">
        {(['build', 'evolve'] as const).map((t) => (
          <button type="button" role="tab" aria-selected={tab.value === t} class={tab.value === t ? 'on' : ''} onClick={() => (tab.value = t)}>
            {COPY.tabs[t]}
          </button>
        ))}
      </nav>
      <div class="panel-body">{tab.value === 'build' ? <BuildList /> : <EvolveList />}</div>
    </aside>
  );
}

/** Rally flags: how many are out, plant one, pull them all. */
function FlagRow() {
  const run = app.game.run;
  const on = flagMode.value;
  return (
    <section class="flags" title={COPY.flags.hint}>
      <Pic k="flag/0" scale={1} />
      <span class="flags-label">
        {COPY.flags.title} <b class="num">{COPY.flags.count(run.flags.length, BALANCE.flags.max)}</b>
      </span>
      <button
        type="button"
        class={`btn ${on ? 'gold' : 'plain'} small`}
        aria-pressed={on}
        onClick={() => {
          flagMode.value = !on;
          placing.value = null;
          if (!on) pushToast({ title: COPY.flags.placing }, 2400);
        }}
      >
        {COPY.flags.place}
      </button>
      {run.flags.length > 0 && (
        <button type="button" class="btn plain small" onClick={() => app.game.clearFlags()}>
          {COPY.flags.clear}
        </button>
      )}
    </section>
  );
}

/** The food chain as a three-step pyramid: who eats what, and how full each layer is. */
function FoodChain() {
  const game = app.game;
  const run = game.run;
  const food = natureFood(run, game.mods);
  const count = (ids: readonly NatureUnitId[]) => ids.map((id) => ({ id, n: run.units.filter((u) => u.kind === id).length }));
  const meadows = run.buildings.filter((b) => b.kind === 'meadow').length;
  const row = (label: string, units: { id: NatureUnitId; n: number }[], line: { supply: number; demand: number }, diet: 'grass' | 'meat') => {
    const hungry = run.units.some((u) => u.hungry && UNITS[u.kind].diet === diet);
    const full = line.supply > 0 && line.demand / line.supply > 0.95;
    return (
      <div class="chain-row" data-diet={diet} data-hungry={hungry || undefined}>
        <span class="chain-label">{label}</span>
        <span class="chain-units">
          {units.map((u) => (
            <span class="chain-unit" data-none={u.n === 0 || undefined} title={UNITS[u.id].name}>
              <Pic k={`unit/${u.id}/walk0`} scale={1} />
              <b class="num">{u.n}</b>
            </span>
          ))}
        </span>
        <span class="chain-meter">
          <Bar value={line.supply > 0 ? line.demand / line.supply : 0} tone={diet} />
          <small class="num">
            <Pic k={`icon/${diet}`} scale={1} />
            {fmt(line.demand)}/{fmt(line.supply)}
            {hungry ? ` ${COPY.chain.hungry}` : full ? ` ${COPY.chain.full}` : ''}
          </small>
        </span>
      </div>
    );
  };
  return (
    <section class="chain" title={COPY.chain.help}>
      {row(COPY.chain.predators, count(PREDATORS), food.meat, 'meat')}
      {row(COPY.chain.herbivores, count(HERBIVORES), food.grass, 'grass')}
      <div class="chain-row plants">
        <span class="chain-label">{COPY.chain.plants}</span>
        <span class="chain-units">
          <span class="chain-unit" data-none={meadows === 0 || undefined}>
            <Pic k="building/meadow" scale={1} />
            <b class="num">{meadows}</b>
          </span>
        </span>
        <small class="chain-note">{COPY.chain.help}</small>
      </div>
    </section>
  );
}

const GROUPS: { key: keyof typeof COPY.build.groups; kinds: NatureBuildingId[] }[] = [
  { key: 'chain', kinds: ['meadow'] },
  { key: 'herbivores', kinds: ['anthill', 'glade', 'valley'] },
  { key: 'predators', kinds: ['den', 'sabercave', 'bearcave'] },
  { key: 'defense', kinds: ['ancient'] },
];

/** Building kinds in hotkey order (1 … 8). */
export const HOTKEYS: NatureBuildingId[] = GROUPS.flatMap((g) => g.kinds);

function BuildList() {
  const game = app.game;
  const run = game.run;
  const cell = selectedCell.value;
  const cellOk = cell !== null && cellOwner(run, cell) === 'nature';
  const holding = placing.value;
  return (
    <div class="build">
      <p class="hint">{holding ? COPY.build.placing(BUILDINGS[holding].name) : cellOk ? COPY.build.onCell : COPY.build.pickPad}</p>
      {holding && (
        <div class="row gap">
          <button type="button" class="btn green small" onClick={() => app.build(holding, null)}>
            {COPY.build.auto}
          </button>
          <button type="button" class="btn plain small" onClick={() => (placing.value = null)}>
            {COPY.build.cancel}
          </button>
        </div>
      )}
      {GROUPS.map((g) => (
        <>
          <h3>{COPY.build.groups[g.key]}</h3>
          <div class="cards">
            {g.kinds.map((k) => (
              <BuildCard kind={k} cell={cellOk ? cell : null} />
            ))}
          </div>
        </>
      ))}
      <p class="hint keys">{COPY.keys}</p>
    </div>
  );
}

function buildInfo(kind: NatureBuildingId): string {
  const game = app.game;
  const def = BUILDINGS[kind];
  if (kind === 'meadow') return COPY.build.grass(fmt(meadowGrass(game.run, game.mods)));
  if (def.makes) {
    const u = def.makes as NatureUnitId;
    const ud = UNITS[u];
    const parts = [COPY.build.every(Math.round(spawnInterval(kind, game.mods) * 10) / 10), COPY.build.eats(FOOD_NAME[ud.diet], fmt(unitEat(u, game.mods), 2))];
    if (ud.meat > 0) parts.push(COPY.build.feeds(fmt(unitMeat(u, game.mods), 2)));
    return parts.join(' · ');
  }
  return def.role;
}

function BuildCard({ kind, cell }: { kind: NatureBuildingId; cell: number | null }) {
  const game = app.game;
  const def = BUILDINGS[kind];
  const cost = game.buildCost(kind);
  const afford = game.run.essence >= cost;
  const on = placing.value === kind;
  const go = () => {
    if (!afford) {
      app.sfx.deny();
      pushToast({ title: COPY.build.problem.money, tone: 'bad' }, 1400);
      return;
    }
    if (cell !== null) {
      app.build(kind, cell);
      return;
    }
    placing.value = on ? null : kind;
    flagMode.value = false;
    selectedBuilding.value = null;
  };
  const key = HOTKEYS.indexOf(kind) + 1;
  return (
    <button type="button" class={`bcard ${on ? 'on' : ''}`} data-afford={afford || undefined} onClick={go} title={`${def.name}（${key}）`}>
      <kbd class="hotkey">{key}</kbd>
      <Pic k={`building/${kind}`} scale={1} class="bcard-pic" />
      <span class="bcard-text">
        <b>{def.name}</b>
        <small>{def.makes ? COPY.build.makes(UNITS[def.makes].name) : def.role}</small>
        <small class="muted">{buildInfo(kind)}</small>
      </span>
      <span class="price">
        <Essence v={cost} />
      </span>
    </button>
  );
}

function levelPic(id: LevelId): string {
  if (id === 'mothertree' || id === 'meadow' || id === 'ancient') return `building/${id}`;
  return `unit/${id}/walk0`;
}

function levelEffect(id: LevelId): string {
  const game = app.game;
  const run = game.run;
  if (id === 'mothertree') {
    const tree = mainOf(run, 'nature');
    return COPY.evolve.effect.mothertree(fmt(motherIncome(run, game.mods)), fmt(tree?.maxHp ?? 0, 0));
  }
  if (id === 'meadow') return COPY.evolve.effect.meadow(fmt(meadowGrass(run, game.mods)));
  if (id === 'ancient') return COPY.evolve.effect.ancient(fmt(towerDmg('ancient', run, game.mods)));
  return COPY.evolve.effect.unit(fmt(unitMaxHp(id, run, game.mods), 0), fmt(unitAtk(id, run, game.mods)));
}

function EvolveList() {
  const game = app.game;
  return (
    <div class="evolve">
      <p class="hint">{COPY.evolve.hint}</p>
      <div class="cards">
        {LEVEL_IDS.map((id) => {
          const cost = game.levelCost(id);
          const afford = game.run.essence >= cost;
          return (
            <div class="bcard" data-afford={afford || undefined}>
              <Pic k={levelPic(id)} scale={1} class="bcard-pic" />
              <span class="bcard-text">
                <b>
                  {COPY.evolve.names[id]} <span class="lv">{COPY.evolve.level(game.run.levels[id])}</span>
                </b>
                <small class="muted">{levelEffect(id)}</small>
              </span>
              <button
                type="button"
                class={`btn ${afford ? 'gold' : 'grey'} small`}
                onClick={() => {
                  if (game.levelUp(id)) app.sfx.upgrade();
                  else app.sfx.deny();
                }}
              >
                {COPY.evolve.up}
                <Essence v={cost} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── A building's card, pinned over it on the map ────────────────

export function BuildingCard() {
  frame.value;
  const id = selectedBuilding.value;
  if (id === null) return null;
  const game = app.game;
  const b = game.run.buildings.find((x) => x.id === id);
  const at = app.buildingScreen(id);
  if (!b || !at) return null;
  const def = BUILDINGS[b.kind];
  const main = isMain(b);
  const left = Math.max(8, Math.min(window.innerWidth - 228, at.x - 110));
  const top = Math.max(8, at.top - 8);
  return (
    <div class="bpop" style={{ left: `${left}px`, top: `${top}px` }} data-side={b.side}>
      <header>
        <b>{def.name}</b>
        <button type="button" class="close" aria-label="关闭" onClick={() => (selectedBuilding.value = null)}>
          ×
        </button>
      </header>
      <div class="foe-row">
        <span>{b.progress < 1 ? COPY.building.building : COPY.building.hp}</span>
        <Bar value={b.progress < 1 ? b.progress : b.hp / b.maxHp} tone={b.progress < 1 ? 'gold' : b.side} />
        <small class="num">
          {Math.ceil(b.hp)}/{Math.ceil(b.maxHp)}
        </small>
      </div>
      <p>
        {main ? (b.side === 'nature' ? COPY.building.main : COPY.building.lodgeMain) : def.makes ? `${COPY.build.makes(UNITS[def.makes].name)} · ${b.side === 'nature' ? COPY.building.march(game.run.flags.length) : ''}` : def.role}
      </p>
      {b.blocked && b.side === 'nature' && <p class="warn">{COPY.building.blocked[b.blocked]}</p>}
      {b.side === 'human' && !main && <p class="muted">{COPY.building.humanSide}</p>}
      {b.side === 'nature' && !main && (
        <button
          type="button"
          class="btn red small"
          onClick={() => {
            game.demolish(b.id);
            selectedBuilding.value = null;
            app.sfx.click();
          }}
        >
          {COPY.building.demolish}
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" data-tone={t.tone} key={t.id}>
          <b>{t.title}</b>
          {t.body && <small>{t.body}</small>}
        </div>
      ))}
    </div>
  );
}
