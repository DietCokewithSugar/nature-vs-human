import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  BALANCE,
  BUILDINGS,
  CLASSES,
  DISASTERS,
  TAMEABLE,
  UNITS,
  countermeasureName,
  dayOf,
  formatDuration,
  formatNumber,
  hourOf,
  tideLevel,
  tideMult,
  type ActiveId,
  type EraId,
} from '../core/index.ts';
import { Essence, Thumb } from './common.tsx';
import { COPY, NEWS, eraName } from './copy.ts';
import { app, frame, modal, placing, rallying, viewInsets } from './store.ts';

// ── The sky: sun and moon across the very top ───────────────────

/**
 * The day as a strip: night blue at both ends, dawn and dusk orange, noon sky blue.
 * The sun (or the moon) rides along it at the current hour.
 */
export function SkyBar() {
  frame.value;
  const t = app.game.run.time;
  const h = hourOf(t);
  const night = h < 5.5 || h >= 19;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60 / 10) * 10;
  return (
    <div class="skybar" role="timer" aria-label={`${COPY.sky.day(dayOf(t) + 1)} ${COPY.sky.clock(hh, mm)}`}>
      <div class="sky-track">
        <span class="sky-body" data-night={night || undefined} style={{ left: `${(h / 24) * 100}%` }} aria-hidden="true" />
      </div>
      <span class="sky-label num">
        {COPY.sky.day(dayOf(t) + 1)} · {COPY.sky.clock(hh, mm)}
      </span>
    </div>
  );
}

// ── 自然之元 ─────────────────────────────────────────────────────

export function Counter() {
  frame.value;
  const g = app.game;
  return (
    <div class="counter">
      <span class="coin" aria-hidden="true" />
      <div class="counter-text">
        <div class="counter-money num" aria-label={COPY.essence}>
          {formatNumber(Math.floor(g.run.essence))}
        </div>
        <div class="counter-income num">
          +{formatNumber(Math.round(g.income() * 10) / 10)}
          {COPY.perSecond}
        </div>
      </div>
    </div>
  );
}

/** A landmark from each era, used for the "back to the whole map" button. */
const ERA_MODEL: Record<EraId, { model: string; crop?: number }> = {
  1: { model: 'teepee' },
  2: { model: 'temple' },
  3: { model: 'loft', crop: 0.7 },
  4: { model: 'office-tower', crop: 0.55 },
};

export function MapButton() {
  frame.value;
  if (!app.cameraMoved()) return null;
  const era = app.game.run.era;
  return (
    <nav class="eras" aria-label={COPY.map.recenter}>
      <button type="button" class="era" data-era={era} aria-label={COPY.map.recenter} title={COPY.map.recenter} onClick={() => app.recenter()}>
        <Thumb {...ERA_MODEL[era]} />
      </button>
    </nav>
  );
}

/** A disaster on its way or raging: what it is, how long, who profits. */
export function DisasterBanner() {
  frame.value;
  const d = app.game.run.disaster;
  if (!d) return null;
  const def = DISASTERS[d.id];
  const s = Math.ceil(d.left);
  return (
    <div class="alert" data-phase={d.phase} data-disaster={d.id} role="status">
      <b>{d.phase === 'warning' ? COPY.disaster.warning(def.name, s) : COPY.disaster.active(def.name, s)}</b>
      <span>{COPY.disaster.boost(CLASSES[def.boost.cls].name, def.boost.x)}</span>
    </div>
  );
}

/** One menu for everything that isn't the game itself. */
export function Menu() {
  frame.value;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const muted = app.settings.value.muted;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const go = (m: 'leaderboard' | 'settings') => {
    setOpen(false);
    modal.value = m;
  };
  return (
    <div class="menu" ref={ref}>
      <button type="button" class="menu-btn" aria-label="菜单" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <i />
        <i />
        <i />
      </button>
      {open && (
        <div class="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => go('leaderboard')}>
            {COPY.leaderboard.title}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!muted} onClick={() => app.updateSettings({ muted: !muted })}>
            {COPY.settings.sound}
            <span class="switch" data-on={!muted || undefined} aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" onClick={() => go('settings')}>
            {COPY.settings.title}
          </button>
        </div>
      )}
    </div>
  );
}

// ── The tug of war ──────────────────────────────────────────────

/**
 * Who holds the ground, nature from the left and the humans from the right with neutral ground
 * between; the win line at 65%. Below it, the humans' research: four stages, one per era.
 */
export function RunBar() {
  frame.value;
  const g = app.game;
  const run = g.run;
  const s = g.shares();
  const win = BALANCE.territory.winShare;
  const stage = Math.min(3, Math.floor(run.research));
  const within = run.research >= 4 ? 1 : run.research - stage;
  const level = within < 0.4 ? 'calm' : within < 0.75 ? 'alert' : 'danger';
  const rush = s.nature >= win && run.era < 4;
  const taming = TAMEABLE.filter((id) => (run.taming[id] ?? 0) > 0.01 && run.defected[id] === undefined);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div class="runbar">
      <div class="bars">
        <div
          class="bar"
          data-kind="territory"
          role="meter"
          aria-label={`${COPY.run.territory}：${COPY.run.nature} ${pct(s.nature)}，${COPY.run.human} ${pct(s.human)}`}
          aria-valuenow={Math.round(s.nature * 100)}
        >
          <span class="bar-cap leaf" aria-hidden="true" />
          <span class="bar-track tug">
            <i class="tug-nature" style={{ width: pct(s.nature) }} />
            <i class="tug-human" style={{ width: pct(s.human) }} />
            <b class="tug-goal" style={{ left: pct(win) }} title={run.era === 4 ? COPY.run.goalNow : COPY.run.goal} />
          </span>
          <span class="bar-val num">{pct(s.nature)}</span>
        </div>
        <div class="bar" data-kind="research" data-level={level} role="meter" aria-label={COPY.run.research} aria-valuenow={Math.floor(run.research * 25)}>
          <span class="bar-cap">
            <Thumb model="scientist" crop={0.42} />
          </span>
          <span class="bar-track">
            <i style={{ transform: `scaleX(${Math.max(0.01, run.research / 4)})` }} />
            {[1, 2, 3].map((e) => (
              <s key={e} class="era-mark" style={{ left: `${e * 25}%` }} />
            ))}
            {run.countermeasures.map((cm, i) => (
              <b key={i} data-cls={cm.cls} title={`${countermeasureName(cm.cls, cm.era)} · ${CLASSES[cm.cls].name}`} style={{ left: `${(i + 0.5) * 25}%` }} />
            ))}
          </span>
          <span class="bar-val num" data-era={run.era}>
            {eraName(run.era)}
          </span>
        </div>
        <div class="bar-note">{rush ? COPY.run.rush : run.era === 4 ? COPY.run.goalNow : COPY.run.goal}</div>
      </div>
      {taming.length > 0 && (
        <div class="tames">
          {taming.map((id) => {
            const v = run.taming[id] ?? 0;
            const label = `${UNITS[id].name} ${COPY.run.taming} ${Math.floor(v * 100)}%`;
            return (
              <span key={id} class="tame" data-hot={v > 0.7 || undefined} style={{ '--p': v }} title={label} aria-label={label}>
                <Thumb model={id} fill={0.82} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Skills and the rally flag ───────────────────────────────────

const ACTIVE_LOOK: Record<Exclude<ActiveId, 'surge'>, { model: string; crop?: number }> = {
  rescue: { model: 'wolf' },
  rampage: { model: 'mammoth' },
  sabotage: { model: 'scientist', crop: 0.42 },
};

interface SkillProps {
  kind: string;
  label: string;
  look: { model: string; crop?: number };
  cd?: number;
  cdTotal?: number;
  live?: number;
  disabled?: boolean;
  pressed?: boolean;
  badge?: ComponentChildren;
  face?: ComponentChildren;
  onClick: () => void;
}

function Skill({ kind, label, look, cd = 0, cdTotal = 1, live = 0, disabled, pressed, badge, face, onClick }: SkillProps) {
  const cooling = cd > 0 && live <= 0;
  return (
    <button
      type="button"
      class="skill"
      data-skill={kind}
      data-live={live > 0 || pressed || undefined}
      data-ready={(!disabled && !cooling && live <= 0) || undefined}
      disabled={disabled || cooling || live > 0}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      <span class="skill-face">
        {face}
        <Thumb {...look} fill={0.8} />
      </span>
      {cooling && (
        <span class="skill-cd" style={{ '--p': Math.min(1, cd / cdTotal) }}>
          <b class="num">{formatDuration(cd)}</b>
        </span>
      )}
      {live > 0 && (
        <span class="skill-cd live">
          <b class="num">{Math.ceil(live)}</b>
        </span>
      )}
      {badge !== undefined && <span class="skill-badge num">{badge}</span>}
    </button>
  );
}

/** Active skills, the tide and the rally flag: round buttons in one row. */
export function SkillDock() {
  frame.value;
  const g = app.game;
  if (!g.running) return null;
  const actives = (['rescue', 'rampage', 'sabotage'] as const).filter((id) => g.mods.actives[id]);
  const fire = (id: ActiveId) => (g.activate(id) ? app.sfx.surge() : app.sfx.deny());
  const flag = !!g.run.rally;
  return (
    <div class="skills">
      <Skill
        kind="rally"
        label={rallying.value ? COPY.rally.hint : flag ? COPY.rally.clear : COPY.rally.set}
        look={{ model: 'flag' }}
        pressed={rallying.value || flag}
        onClick={() => (flag && !rallying.value ? app.clearRally() : app.toggleRally())}
      />
      {g.mods.tide && <Surge />}
      {actives.map((id) => (
        <Skill
          key={id}
          kind={id}
          label={COPY.actives[id]}
          look={ACTIVE_LOOK[id]}
          cd={g.cooldown(id)}
          cdTotal={BALANCE.actives[id].cooldown}
          live={id === 'rampage' ? g.run.rampageLeft : 0}
          onClick={() => fire(id)}
        />
      ))}
    </div>
  );
}

function Surge() {
  frame.value;
  const g = app.game;
  const t = g.run.tide;
  const level = t.surgeLeft > 0 ? 1 : tideLevel(t.clock);
  return (
    <Skill
      kind="surge"
      label={`${COPY.actives.surge} · ${COPY.tide.name} ×${tideMult(t, g.mods).toFixed(1)}`}
      look={{ model: 'shark' }}
      cd={g.cooldown('surge')}
      cdTotal={g.mods.surgeCooldown}
      live={t.surgeLeft}
      disabled={!g.mods.actives.surge}
      badge={`×${tideMult(t, g.mods).toFixed(1)}`}
      face={<i class="water" style={{ transform: `scaleY(${0.12 + level * 0.88})` }} />}
      onClick={() => (g.activate('surge') ? app.sfx.surge() : app.sfx.deny())}
    />
  );
}

// ── Placing a building ──────────────────────────────────────────

export function PlacementBar() {
  frame.value;
  const kind = placing.value;
  if (!kind && !rallying.value) return null;
  if (rallying.value) {
    return (
      <div class="placebar" role="status">
        <b>{COPY.rally.hint}</b>
        <div class="placebar-actions">
          <button type="button" class="chunk" data-tone="plain" onClick={() => app.toggleRally()}>
            {COPY.build.cancel}
          </button>
        </div>
      </div>
    );
  }
  const def = BUILDINGS[kind!];
  const enemy = app.game.mods.enemyGround[kind as never];
  return (
    <div class="placebar" role="status">
      <b>
        {COPY.build.placing(def.name)} · <Essence value={app.game.buildingCost(kind!)} />
      </b>
      <span class="placebar-key">
        <i data-tone="own" />
        {COPY.build.hintOwn}
      </span>
      <span class="placebar-key">
        <i data-tone="wild" />
        {COPY.build.hintWild}
      </span>
      {enemy && (
        <span class="placebar-key">
          <i data-tone="enemy" />
          {COPY.build.hintEnemy}
        </span>
      )}
      <div class="placebar-actions">
        <button type="button" class="chunk" onClick={() => app.autoPlace()}>
          {COPY.build.auto}
        </button>
        <button type="button" class="chunk" data-tone="plain" onClick={() => app.cancelPlacing()}>
          {COPY.build.cancel}
        </button>
      </div>
    </div>
  );
}

// ── Ambient ─────────────────────────────────────────────────────

function sceneCenter(): { x: number; y: number } {
  const ins = viewInsets.value;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: ins.left + (w - ins.left - ins.right) / 2, y: ins.top + Math.max(1, h - ins.top - ins.bottom) / 2 };
}

/** Now and then a headline pops up over the map, then goes away. */
export function NewsBubble() {
  const [line, setLine] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    let n = Math.floor(Math.random() * 100);
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      const era = app.game.run.era;
      const seen = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= era).flatMap((e) => NEWS[e]);
      const pool = n % 3 === 0 ? seen : NEWS[era];
      n++;
      if (modal.value === null && app.game.running && !placing.value) setLine({ id: n, text: pool[n % pool.length]! });
      timer = setTimeout(() => {
        setLine(null);
        timer = setTimeout(show, 26000 + Math.random() * 20000);
      }, 6500);
    };
    timer = setTimeout(show, 20000);
    return () => clearTimeout(timer);
  }, []);
  if (!line) return null;
  return (
    <div class="bubble" key={line.id} aria-live="polite" style={{ left: `${sceneCenter().x}px` }}>
      {line.text}
    </div>
  );
}
