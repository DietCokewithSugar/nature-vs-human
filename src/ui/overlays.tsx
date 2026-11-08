import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  BALANCE,
  BUILDINGS,
  CLASSES,
  DIFFICULTIES,
  DIFFICULTY_GATE,
  DIFFICULTY_NAMES,
  ROUTES,
  UNITS,
  birthInterval,
  difficultyUnlocked,
  formatDuration,
  formatNumber,
  maxAlive,
  metaMods,
  spawnPool,
  type BuildingDef,
  type Difficulty,
  type RouteId,
  type UnitId,
} from '../core/index.ts';
import credits from '../data/credits.json';
import { NICKNAME_MAX, type BoardKind, type BoardResult } from '../data/leaderboard.ts';
import { LOOKS } from '../scene/creatures.ts';
import { CloseButton, Essence, Meter, Segmented, Thumb } from './common.tsx';
import { COPY } from './copy.ts';
import { describeAura, describeEffects, describeMatchups, shortSeconds } from './describe.ts';
import { app, detail, detailKind, eraCard, flash, floats, frame, modal, pushToast, sheet, tab, toasts, viewInsets } from './store.ts';
import { ERA_MODEL } from './hud.tsx';
import { eraName } from './copy.ts';

export function Toasts() {
  const ins = viewInsets.value;
  const x = ins.left + (window.innerWidth - ins.left - ins.right) / 2;
  return (
    <div class="toasts" role="status" aria-live="polite" style={{ left: `${x}px` }}>
      {toasts.value.map((t) => (
        <div key={t.id} class="toast" data-era={t.era} data-tone={t.tone}>
          <div class="toast-title">{t.title}</div>
          {t.body && <div class="toast-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Floats() {
  return (
    <div class="floats" aria-hidden="true">
      {floats.value.map((f) => (
        <span key={f.id} class="float" data-tone={f.tone} style={{ left: `${f.x}px`, top: `${f.y}px` }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

/** A new era: its name across the middle of the screen, what changed, then it fades. */
export function EraCard() {
  const c = eraCard.value;
  if (!c) return null;
  const card = COPY.era.card[c.era];
  return (
    <div class="era-card" key={c.id} data-era={c.era} role="status" aria-live="assertive">
      <Thumb {...ERA_MODEL[c.era]} class="era-card-pic" />
      <div class="era-card-name">{COPY.era.full[c.era]}</div>
      <div class="era-card-line">{card.line}</div>
      <p class="era-card-body">{card.body}</p>
    </div>
  );
}

export function Flash() {
  const n = flash.value;
  if (!n) return null;
  return <div key={n} class="flash" aria-hidden="true" />;
}

function Modal({
  title,
  children,
  onClose,
  wide,
  kind,
}: {
  title: string;
  children: ComponentChildren;
  onClose?: () => void;
  wide?: boolean;
  kind?: string;
}) {
  const close = onClose ?? (() => (modal.value = null));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={`modal ${wide ? 'wide' : ''}`} data-kind={kind} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header class="modal-head">
          <h2>{title}</h2>
          <CloseButton onClick={close} />
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Modals() {
  switch (modal.value) {
    case 'leaderboard':
      return <LeaderboardModal />;
    case 'settings':
      return <SettingsModal />;
    case 'setup':
      return <SetupModal />;
    case 'result':
      return <ResultModal />;
    case 'building':
      return <BuildingModal />;
    case 'unit':
      return <UnitModal />;
    case 'kind':
      return <KindModal />;
    case 'humans':
      return <HumansModal />;
    default:
      return null;
  }
}

// ── New run ─────────────────────────────────────────────────────

function SetupModal() {
  const g = app.game;
  const m = metaMods(g.meta);
  const [route, setRoute] = useState<RouteId>(g.run.route);
  const [difficulty, setDifficulty] = useState<Difficulty>(difficultyUnlocked(g.meta, g.run.difficulty) ? g.run.difficulty : 'normal');
  const abandoning = g.running && g.run.time > 30;
  return (
    <Modal title={COPY.setup.title}>
      <div class="section-label">
        <span>{COPY.setup.route}</span>
      </div>
      <div class="card choices">
        {(Object.keys(ROUTES) as RouteId[]).map((id) => {
          const r = ROUTES[id];
          const open = m.routesUnlocked[id];
          return (
            <button
              type="button"
              key={id}
              class="choice"
              aria-pressed={route === id}
              disabled={!open}
              onClick={() => setRoute(id)}
            >
              <span class="name">{r.name}</span>
              <span class="effect">{open ? describeEffects(r.effects) || COPY.setup.balanced : COPY.setup.locked}</span>
            </button>
          );
        })}
      </div>
      <div class="section-label">
        <span>{COPY.setup.difficulty}</span>
      </div>
      <div class="card choices row3">
        {DIFFICULTIES.map((d) => {
          const open = difficultyUnlocked(g.meta, d);
          const gate = DIFFICULTY_GATE[d];
          return (
            <button type="button" key={d} class="choice" aria-pressed={difficulty === d} disabled={!open} onClick={() => setDifficulty(d)}>
              <span class="name">{DIFFICULTY_NAMES[d]}</span>
              <span class="effect">{open ? `×${({ normal: 1, hard: 1.6, brutal: 2.4 } as const)[d]} ${COPY.meta.points}` : gate ? COPY.setup.needWin(DIFFICULTY_NAMES[gate]) : ''}</span>
            </button>
          );
        })}
      </div>
      {abandoning && <p class="warn-line">{COPY.setup.abandon}</p>}
      <button
        type="button"
        class="btn solid wide"
        onClick={() => {
          if (app.startRun(route, difficulty)) modal.value = null;
        }}
      >
        {abandoning ? COPY.setup.abandonYes : COPY.setup.start}
      </button>
    </Modal>
  );
}

// ── Cards ───────────────────────────────────────────────────────

/** The model key for a unit's thumbnail. */
export function unitModel(id: UnitId): { model: string; crop?: number } {
  const look = LOOKS[id];
  return look.human ? { model: look.model, crop: 0.5 } : { model: look.model };
}

const hourText = (h: number) => {
  const hh = Math.floor(((h % 24) + 24) % 24);
  return `${String(hh).padStart(2, '0')}:${String(Math.floor((h - Math.floor(h)) * 6) * 10).padStart(2, '0')}`;
};

/** One unit kind in a few numbers: HP, attack, lifespan and its daily habits. */
function UnitRow({ id }: { id: UnitId }) {
  const def = UNITS[id];
  const g = app.game;
  return (
    <div class="unit-row" data-side={def.side}>
      <Thumb {...unitModel(id)} class="unit-pic" />
      <div class="unit-text">
        <div class="unit-name">
          {def.name}
          <small>{def.title}</small>
        </div>
        <div class="unit-stats num">
          <span>
            {COPY.unit.hp} {Math.round(g.unitMaxHp(id))}
          </span>
          {def.atk > 0 && (
            <span>
              {COPY.unit.atk} {formatNumber(Math.round((def.atk / def.rate) * 10) / 10)}
              {COPY.perSecond}
            </span>
          )}
          <span>
            {COPY.unit.life} {COPY.unit.days(def.life)}
          </span>
          <span>{COPY.unit.roles[def.role]}</span>
        </div>
        <div class="unit-habits">
          {def.role === 'collect' ? (
            <span>{COPY.unit.collect(hourText(def.forage.at), def.forage.hours)}</span>
          ) : (
            <>
              <span>
                {COPY.unit.forage} {COPY.unit.around(hourText(def.forage.at), def.forage.hours)}
              </span>
              <span>
                {COPY.unit.rest} {COPY.unit.around(hourText(def.rest.at), def.rest.hours)}
              </span>
            </>
          )}
          {def.diet && <span class="diet">{COPY.unit.diet[def.diet]}</span>}
        </div>
        {describeMatchups(def).length > 0 && (
          <div class="unit-vs">
            {describeMatchups(def).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuraList({ def }: { def: BuildingDef }) {
  const lines = describeAura(def);
  if (!lines.length) return null;
  return (
    <div class="card aura-list" data-side={def.side}>
      <div class="section-label">{COPY.aura.effect}</div>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function SpawnList({ def }: { def: BuildingDef }) {
  const g = app.game;
  const pool = spawnPool(g.run, def);
  const total = pool.reduce((a, p) => a + p.w, 0);
  const shown = def.spawns.filter((s) => !s.if || pool.some((p) => p.unit === s.unit));
  if (!shown.length) return null;
  return (
    <div class="card spawns">
      <div class="section-label">{COPY.build.makes}</div>
      {shown.map((s) => (
        <div key={s.unit} class="spawn">
          <UnitRow id={s.unit} />
          {shown.length > 1 && total > 0 && <span class="spawn-share num">{Math.round(((pool.find((p) => p.unit === s.unit)?.w ?? 0) / total) * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}

/** A building on the map: health, construction, level, what it makes; nature's can be upgraded. */
function BuildingModal() {
  frame.value;
  const g = app.game;
  const id = detail.value;
  const b = id !== null ? g.building(id) : undefined;
  useEffect(() => {
    app.select(id);
    return () => app.select(null);
  }, [id]);
  if (!b) return null;
  const def = BUILDINGS[b.kind];
  const max = g.buildingMaxHp(b);
  const cost = g.upgradeCost(b.id);
  const mine = b.side === 'nature';
  const interval = def.interval > 0 ? birthInterval(g.mods, b) : 0;
  return (
    <Modal title={def.name} kind="building">
      <div class="profile" data-side={b.side}>
        <Thumb model={def.model} class="profile-pic" />
        <div class="profile-text">
          <div class="profile-title">{mine ? def.desc : COPY.card.human}</div>
          <span class="cls-pill">
            {COPY.card.level(b.level)} · {COPY.card.material[def.material]}
          </span>
          <span class="pips big" aria-label={COPY.card.level(b.level)}>
            {[1, 2, 3, 4].map((l) => (
              <i key={l} data-on={l <= b.level || undefined} />
            ))}
          </span>
        </div>
      </div>
      <div class="card meters">
        <Meter label={COPY.card.hp} kind="hp" value={b.hp / max} text={`${Math.ceil(b.hp)}/${Math.round(max)}`} />
        {b.build < 1 && <Meter label={COPY.card.building} kind="build" value={b.build} />}
        <p class="fine">{COPY.card.noRepair}</p>
      </div>
      {def.interval > 0 && (
        <dl class="card stats">
          <div>
            <dt>{COPY.card.alive}</dt>
            <dd class="num">
              {g.alive(b.id)}/{maxAlive(b)}
            </dd>
          </div>
          <div>
            <dt>{COPY.card.next}</dt>
            <dd class="num">{b.build < 1 ? '—' : g.alive(b.id) >= maxAlive(b) ? COPY.card.full : formatDuration(Math.max(0, b.timer))}</dd>
          </div>
          <div>
            <dt>{COPY.card.interval}</dt>
            <dd class="num">{shortSeconds(interval)}</dd>
          </div>
        </dl>
      )}
      {def.income && <p class="ending-body">{COPY.card.income(String(def.income))}</p>}
      <AuraList def={def} />
      <SpawnList def={def} />
      <div class="btn-row wide">
        <button
          type="button"
          class="btn wide"
          onClick={() => {
            modal.value = null;
            app.lookAt(b.x, b.z);
          }}
        >
          {COPY.card.look}
        </button>
        {mine && (
          <button
            type="button"
            class="btn solid wide"
            disabled={cost === null || cost > g.run.essence || b.build < 1 || !g.running}
            title={COPY.card.upgradeGives}
            onClick={() => (g.upgrade(b.id) ? app.sfx.upgrade() : app.sfx.deny())}
          >
            {cost === null ? (
              COPY.card.maxed
            ) : (
              <>
                {COPY.card.upgrade} · <Essence value={cost} />
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** A unit on the map: its bars, what it is doing, its habits. */
function UnitModal() {
  frame.value;
  const g = app.game;
  const id = detail.value;
  const u = id !== null ? g.world.units.get(id) : undefined;
  if (!u) return null;
  const def = UNITS[u.kind];
  const max = g.unitMaxHp(u.kind);
  const days = (s: number) => Math.max(0, s / BALANCE.day);
  return (
    <Modal title={def.name} kind="unit">
      <div class="card meters">
        <Meter label={COPY.unit.hp} kind="hp" value={u.hp / max} text={`${Math.ceil(u.hp)}/${Math.round(max)}`} />
        <Meter label={COPY.unit.life} kind="life" value={1 - u.age / u.life} text={COPY.unit.days(Math.round(days(u.life - u.age) * 10) / 10)} />
        <p class="fine">
          {COPY.unit.side[u.side]} · {u.feeding ? COPY.unit.feeding : COPY.unit.task[u.task]}
          {def.cls ? ` · ${CLASSES[def.cls].name}` : ''}
        </p>
      </div>
      <div class="card spawns">
        <UnitRow id={u.kind} />
        <p class="fine">
          {COPY.unit.forage} {hourText(u.forageAt)} · {COPY.unit.rest} {hourText(u.restAt)}
        </p>
      </div>
    </Modal>
  );
}

/** A building kind from the shop: what it needs and what it makes. */
function KindModal() {
  frame.value;
  const kind = detailKind.value;
  if (!kind) return null;
  const def = BUILDINGS[kind];
  return (
    <Modal title={def.name} kind="building">
      <div class="profile" data-side={def.side}>
        <Thumb model={def.model} class="profile-pic" />
        <div class="profile-text">
          <div class="profile-title">{def.desc}</div>
          <span class="cls-pill">
            {def.near ? COPY.build.need[def.near] : COPY.card.material[def.material]} · {COPY.card.hp} {def.hp}
          </span>
        </div>
      </div>
      {def.interval > 0 && (
        <p class="ending-body">
          {COPY.build.every(shortSeconds(def.interval))} · {COPY.build.keeps(def.alive)} · {COPY.card.upgradeGives}
        </p>
      )}
      <AuraList def={def} />
      <SpawnList def={def} />
    </Modal>
  );
}

// ── The humans' side ────────────────────────────────────────────

/** What the humans have, where their 自然之元 comes from, and how their research is going. */
function HumansModal() {
  frame.value;
  const g = app.game;
  const h = g.humanReport();
  const run = g.run;
  const H = COPY.humans;
  const inc = h.income;
  const n = (v: number) => formatNumber(Math.round(v * 100) / 100);
  const r = h.research;
  const perMinute = ((r.rate * 60) * 100).toFixed(1).replace(/\.0$/, '');
  const minutes = Number.isFinite(r.eta) ? Math.max(1, Math.round(r.eta / 60)) : null;
  const sources: [string, number][] = [
    [H.base(eraName(run.era)), inc.base],
    [H.land(inc.cells), inc.land],
    [H.nodes(inc.nodeCount), inc.nodes],
    [H.buildingsIncome, inc.buildings],
    [H.animals, inc.animals],
  ];
  return (
    <Modal title={H.title} kind="humans">
      <dl class="card stats four">
        <div>
          <dt>{H.essence}</dt>
          <dd class="num">{formatNumber(Math.floor(h.essence))}</dd>
        </div>
        <div>
          <dt>{H.income}</dt>
          <dd class="num">+{n(inc.total)}</dd>
        </div>
        <div>
          <dt>{H.buildings}</dt>
          <dd class="num">
            {h.buildings}/{h.cap}
          </dd>
        </div>
        <div>
          <dt>{H.pop}</dt>
          <dd class="num">{h.pop}</dd>
        </div>
      </dl>
      <div class="card income-list">
        <div class="section-label">{H.sources}</div>
        <ul>
          {sources
            .filter(([, v]) => v > 0)
            .map(([label, v]) => (
              <li key={label}>
                <span>{label}</span>
                <b class="num">+{n(v)}</b>
              </li>
            ))}
          {inc.difficulty !== 1 && (
            <li>
              <span>{H.difficulty(inc.difficulty)}</span>
            </li>
          )}
          {inc.panic > 1.001 && (
            <li>
              <span>{H.panic(Math.round(inc.panic * 100) / 100)}</span>
            </li>
          )}
        </ul>
      </div>
      <div class="card income-list">
        <div class="section-label">{H.research}</div>
        <div class="era-steps big" aria-hidden="true">
          {([1, 2, 3, 4] as const).map((e) => (
            <span key={e} data-era={e} data-on={e === run.era || undefined} data-done={e < run.era || undefined}>
              {COPY.era.full[e]}
            </span>
          ))}
        </div>
        <ul>
          <li>
            <span>{H.rate(perMinute)}</span>
            <b>{minutes === null ? H.stalled : run.era < 4 ? H.eta(minutes, COPY.era.full[(run.era + 1) as 2 | 3 | 4]) : H.etaLast(minutes)}</b>
          </li>
          <li>
            <span>{H.drivers(r.labLevels, r.scholars)}</span>
          </li>
          <li>
            <span>{H.pressure((Math.round(r.pressure * 100) / 100).toString())}</span>
          </li>
          {r.rush && (
            <li class="warn">
              <span>{H.rush}</span>
            </li>
          )}
        </ul>
      </div>
      <p class="fine">{H.explain}</p>
    </Modal>
  );
}

// ── Run result ──────────────────────────────────────────────────

function ResultModal() {
  const g = app.game;
  const res = g.run.result;
  if (!res) return null;
  const close = () => (modal.value = null);
  return (
    <Modal title={res.won ? COPY.result.won : COPY.result.lost} onClose={close}>
      <p class="ending-body">{res.won ? COPY.result.wonBody : COPY.result.lostBody}</p>
      <dl class="card stats">
        <div>
          <dt>{COPY.result.time}</dt>
          <dd class="num">{formatDuration(res.time)}</dd>
        </div>
        <div>
          <dt>{COPY.result.territory}</dt>
          <dd class="num">{Math.round(res.best * 100)}%</dd>
        </div>
        <div>
          <dt>{COPY.result.points}</dt>
          <dd class="num">+{res.points}</dd>
        </div>
      </dl>
      <div class="btn-row wide">
        <button
          type="button"
          class="btn wide"
          onClick={() => {
            tab.value = 'meta';
            if (sheet.value === 'closed') sheet.value = 'half';
            close();
          }}
        >
          {COPY.tabs.meta}
        </button>
        <button type="button" class="btn solid wide" onClick={() => (modal.value = 'setup')}>
          {COPY.result.again}
        </button>
      </div>
    </Modal>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────

function LeaderboardModal() {
  const lb = app.leaderboard;
  const [kind, setKind] = useState<BoardKind>('territory');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(lb.online);
  const [name, setName] = useState(lb.nickname.value);

  useEffect(() => {
    if (!lb.online) return;
    let live = true;
    setLoading(true);
    void (async () => {
      await lb.submit(app.game.state, true);
      const res = await lb.fetch(kind, difficulty);
      if (!live) return;
      setData(res);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [kind, difficulty]);

  const show = (v: number) => <span class="num">{kind === 'fastest' ? formatDuration(v) : `${Math.round(v * 10) / 10}%`}</span>;

  const saveName = async () => {
    if (await lb.setNickname(name, app.game.state)) {
      setName(lb.nickname.value);
      pushToast({ title: COPY.toast.nicknameSaved });
      if (lb.online) setData(await lb.fetch(kind, difficulty));
    }
  };

  const rows = data?.top ?? [];
  const meOutside = data?.me && !rows.some((r) => r.me) ? data.me : null;

  return (
    <Modal title={COPY.leaderboard.title}>
      <Segmented
        label="榜单"
        value={kind}
        options={[
          { value: 'territory', label: COPY.leaderboard.territory },
          { value: 'fastest', label: COPY.leaderboard.fastest },
        ]}
        onChange={setKind}
      />
      {kind === 'fastest' && (
        <Segmented
          label="难度"
          value={difficulty}
          options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_NAMES[d] }))}
          onChange={setDifficulty}
        />
      )}
      <div class="card board">
        {!lb.online && <p class="empty">{COPY.leaderboard.offline}</p>}
        {lb.online && loading && <p class="empty">{COPY.leaderboard.loading}</p>}
        {lb.online && !loading && !data && <p class="empty">{COPY.leaderboard.offline}</p>}
        {lb.online && !loading && data && rows.length === 0 && <p class="empty">{COPY.leaderboard.empty}</p>}
        {rows.length > 0 && (
          <ol class="board-list">
            {rows.map((r) => (
              <li key={r.rank} class={r.me ? 'me' : ''} data-top={r.rank <= 3 ? r.rank : undefined}>
                <span class="rank num">{r.rank}</span>
                <span class="who">{r.nickname}</span>
                <span class="val">{show(r.value)}</span>
              </li>
            ))}
            {meOutside && (
              <li class="me gap">
                <span class="rank num">{meOutside.rank}</span>
                <span class="who">{meOutside.nickname}</span>
                <span class="val">{show(meOutside.value)}</span>
              </li>
            )}
          </ol>
        )}
      </div>
      <form
        class="card name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveName();
        }}
      >
        <label for="nickname">{COPY.leaderboard.nickname}</label>
        <input
          id="nickname"
          value={name}
          maxLength={NICKNAME_MAX}
          autoComplete="off"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn solid" disabled={!name.trim() || name === lb.nickname.value}>
          {COPY.leaderboard.save}
        </button>
      </form>
    </Modal>
  );
}

// ── Settings ────────────────────────────────────────────────────

function SettingsModal() {
  const s = app.settings.value;
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  if (showCredits) {
    return (
      <Modal title={COPY.settings.credits} onClose={() => setShowCredits(false)} wide>
        <div class="card credits">
          <h3>{COPY.settings.creditsModels}</h3>
          <p class="muted">
            <a href={credits.models.home} target="_blank" rel="noreferrer">
              {credits.models.author}
            </a>{' '}
            ·{' '}
            <a href={credits.models.licenseUrl} target="_blank" rel="noreferrer">
              {credits.models.license}
            </a>{' '}
            · {COPY.settings.creditsModelsNote}
          </p>
          <ul class="credit-list">
            {credits.models.items.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
          <h3>{COPY.settings.creditsOther}</h3>
          <ul class="credit-list plain">
            <li>ZCOOL KuaiLe · Fredoka — SIL OFL 1.1</li>
            <li>Radix Colors — MIT</li>
            <li>three.js · Preact · break_infinity.js · Supabase JS — MIT</li>
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={COPY.settings.title}>
      <div class="card settings">
        <div class="setting">
          <span>{COPY.settings.sound}</span>
          <Segmented
            label={COPY.settings.sound}
            value={s.muted ? 'off' : 'on'}
            options={[
              { value: 'on', label: COPY.settings.on },
              { value: 'off', label: COPY.settings.off },
            ]}
            onChange={(v) => app.updateSettings({ muted: v === 'off' })}
          />
        </div>
        <div class="setting">
          <span>{COPY.settings.quality}</span>
          <Segmented
            label={COPY.settings.quality}
            value={s.quality}
            options={[
              { value: 'high', label: COPY.settings.qualityHigh },
              { value: 'low', label: COPY.settings.qualityLow },
            ]}
            onChange={(v) => app.updateSettings({ quality: v })}
          />
        </div>
        <div class="setting">
          <span>{COPY.settings.save}</span>
          <div class="btn-row">
            <button
              type="button"
              class="btn"
              onClick={async () => {
                const code = app.exportSave();
                try {
                  await navigator.clipboard.writeText(code);
                } catch {
                  setText(code);
                  setImporting(true);
                }
                pushToast({ title: COPY.toast.exported });
              }}
            >
              {COPY.settings.export}
            </button>
            <button type="button" class="btn" onClick={() => setImporting((v) => !v)}>
              {COPY.settings.import}
            </button>
          </div>
        </div>
        {importing && (
          <div class="import">
            <textarea
              rows={3}
              placeholder={COPY.settings.importPlaceholder}
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
            <button
              type="button"
              class="btn solid"
              disabled={!text.trim()}
              onClick={() => {
                // A good save reloads the page; only a failure needs a message.
                if (!app.importSave(text)) pushToast({ title: COPY.toast.importFailed });
              }}
            >
              {COPY.settings.importConfirm}
            </button>
          </div>
        )}
      </div>
      <div class="card settings">
        <button type="button" class="btn link" onClick={() => (modal.value = 'setup')}>
          {COPY.settings.newRun}
        </button>
        <button type="button" class="btn link" onClick={() => setShowCredits(true)}>
          {COPY.settings.credits}
        </button>
        {!confirmReset ? (
          <button type="button" class="btn danger-soft" onClick={() => setConfirmReset(true)}>
            {COPY.settings.reset}
          </button>
        ) : (
          <div class="confirm">
            <span>{COPY.settings.resetConfirm}</span>
            <div class="btn-row">
              <button type="button" class="btn" onClick={() => setConfirmReset(false)}>
                {COPY.settings.cancel}
              </button>
              <button type="button" class="btn danger" onClick={() => app.resetSave()}>
                {COPY.settings.resetYes}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
