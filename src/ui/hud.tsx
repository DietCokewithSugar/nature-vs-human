import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  BALANCE,
  CLASSES,
  CREATURE_BY_ID,
  CREATURES,
  TAMEABLE,
  bredPerSec,
  countermeasureName,
  formatDuration,
  formatNumber,
  tideLevel,
  tideMult,
  type ActiveId,
  type EraId,
} from '../core/index.ts';
import { Money, Num, SCIENTIST, Thumb } from './common.tsx';
import { COPY, NEWS, eraName } from './copy.ts';
import { app, focusEra, frame, modal, viewInsets } from './store.ts';

export function Counter() {
  frame.value;
  const g = app.game;
  return (
    <div class="counter">
      <span class="coin" aria-hidden="true" />
      <div class="counter-text">
        <div class="counter-money num">
          <Num value={g.run.money} />
        </div>
        <div class="counter-income num">
          +<Money value={g.income()} />
          {COPY.perSecond}
        </div>
      </div>
    </div>
  );
}

/** A landmark from each era's island. */
const ERA_MODEL: Record<EraId, { model: string; crop?: number }> = {
  1: { model: 'campfire' },
  2: { model: 'temple' },
  3: { model: 'lighthouse', crop: 0.7 },
  4: { model: 'office-tower', crop: 0.55 },
};

export function EraTokens() {
  frame.value;
  const era = app.game.run.era;
  if (era < 2) return null;
  const eras = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= era);
  return (
    <nav class="eras" aria-label="时代">
      {eras.map((e) => (
        <button
          type="button"
          key={e}
          class="era"
          data-era={e}
          aria-pressed={focusEra.value === e}
          aria-label={eraName(e)}
          title={eraName(e)}
          onClick={() => app.flyTo(e)}
        >
          <Thumb {...ERA_MODEL[e]} />
        </button>
      ))}
    </nav>
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
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={!muted}
            onClick={() => app.updateSettings({ muted: !muted })}
          >
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

/** The tug of war: your bill against the humans' research, plus the species they are taming. */
export function RunBar() {
  frame.value;
  const g = app.game;
  const run = g.run;
  const bill = g.billProgress();
  const research = run.research;
  const level = research < 0.4 ? 'calm' : research < 0.75 ? 'alert' : 'danger';
  const taming = TAMEABLE.filter((id) => (run.taming[id] ?? 0) > 0.01 && run.defected[id] === undefined);
  return (
    <div class="runbar">
      <div class="bars">
        <div class="bar" data-kind="bill" role="meter" aria-label={COPY.run.bill} aria-valuenow={Math.floor(bill * 100)}>
          <span class="bar-cap coin" aria-hidden="true" />
          <span class="bar-track">
            <i style={{ transform: `scaleX(${Math.max(0.01, bill)})` }} />
          </span>
          <span class="bar-val num">{Math.floor(bill * 100)}%</span>
        </div>
        <div
          class="bar"
          data-kind="research"
          data-level={level}
          role="meter"
          aria-label={COPY.run.research}
          aria-valuenow={Math.floor(research * 100)}
        >
          <span class="bar-cap">
            <Thumb {...SCIENTIST} />
          </span>
          <span class="bar-track">
            <i style={{ transform: `scaleX(${Math.max(0.01, research)})` }} />
            {BALANCE.research.thresholds.map((t, i) => {
              const cm = run.countermeasures[i];
              return (
                <b
                  key={t}
                  data-cls={cm?.cls}
                  title={cm ? `${countermeasureName(cm.cls, cm.era)} · ${CLASSES[cm.cls].name}` : undefined}
                  style={{ left: `${t * 100}%` }}
                />
              );
            })}
          </span>
          <span class="bar-val num">{Math.floor(research * 100)}%</span>
        </div>
      </div>
      {taming.length > 0 && (
        <div class="tames">
          {taming.map((id) => {
            const v = run.taming[id] ?? 0;
            const label = `${CREATURE_BY_ID[id].name} ${COPY.run.taming} ${Math.floor(v * 100)}%`;
            return (
              <span key={id} class="tame" data-hot={v > 0.7 || undefined} style={{ '--p': v }} title={label} aria-label={label}>
                <Thumb model={CREATURE_BY_ID[id].model} fill={0.82} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Skills ──────────────────────────────────────────────────────

const ACTIVE_LOOK: Record<Exclude<ActiveId, 'surge'>, { model: string; crop?: number }> = {
  rescue: { model: 'wolf' },
  rampage: { model: 'mammoth' },
  sabotage: SCIENTIST,
};

interface SkillProps {
  kind: string;
  label: string;
  look: { model: string; crop?: number };
  /** Seconds until ready, and the full cooldown, for the sweep. */
  cd?: number;
  cdTotal?: number;
  /** Seconds left on an effect that is running right now. */
  live?: number;
  disabled?: boolean;
  badge?: ComponentChildren;
  tag?: ComponentChildren;
  face?: ComponentChildren;
  onClick: () => void;
}

function Skill({ kind, label, look, cd = 0, cdTotal = 1, live = 0, disabled, badge, tag, face, onClick }: SkillProps) {
  const cooling = cd > 0 && live <= 0;
  return (
    <button
      type="button"
      class="skill"
      data-skill={kind}
      data-live={live > 0 || undefined}
      data-ready={(!disabled && !cooling && live <= 0) || undefined}
      disabled={disabled || cooling || live > 0}
      aria-label={label}
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
      {tag !== undefined && <span class="skill-tag num">{tag}</span>}
    </button>
  );
}

/** Era mechanics and active skills: round buttons, one row, never stacked on each other. */
export function SkillDock() {
  frame.value;
  const g = app.game;
  if (!g.running) return null;
  const actives = (['rescue', 'rampage', 'sabotage'] as const).filter((id) => g.mods.actives[id]);
  if (!g.mods.breeding && !g.mods.tide && !actives.length) return null;
  const fire = (id: ActiveId) => (g.activate(id) ? app.sfx.surge() : app.sfx.deny());
  return (
    <div class="skills">
      {g.mods.breeding && <Nest />}
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

function Nest() {
  frame.value;
  const g = app.game;
  const run = g.run;
  const cost = g.nestCost();
  let bred = 0;
  for (const c of CREATURES) if (c.cls === 'swarm') bred += bredPerSec(run, g.mods, c.id);
  return (
    <Skill
      kind="nest"
      label={`${COPY.breeding.name} ×${run.nests} · ${COPY.breeding.bred} +${formatNumber(bred)}${COPY.perSecond}`}
      look={{ model: 'rat' }}
      disabled={cost.gt(run.money)}
      badge={`×${run.nests}`}
      tag={<Money value={cost} />}
      onClick={() => (g.buyNest() ? app.sfx.buy() : app.sfx.deny())}
    />
  );
}

function Surge() {
  frame.value;
  const g = app.game;
  const t = g.run.tide;
  const surging = t.surgeLeft > 0;
  const level = surging ? 1 : tideLevel(t.clock);
  return (
    <Skill
      kind="surge"
      label={`${COPY.actives.surge} · ${COPY.tide.name} ×${tideMult(t, g.mods).toFixed(1)}`}
      look={{ model: 'shark' }}
      cd={g.cooldown('surge')}
      cdTotal={g.mods.surgeCooldown}
      live={t.surgeLeft}
      badge={`×${tideMult(t, g.mods).toFixed(1)}`}
      face={<i class="water" style={{ transform: `scaleY(${0.12 + level * 0.88})` }} />}
      onClick={() => (g.activate('surge') ? app.sfx.surge() : app.sfx.deny())}
    />
  );
}

// ── Ambient ─────────────────────────────────────────────────────

/** The middle of the part of the screen the city gets. */
function sceneCenter(): { x: number; y: number } {
  const ins = viewInsets.value;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: ins.left + (w - ins.left - ins.right) / 2, y: ins.top + Math.max(1, h - ins.top - ins.bottom) / 2 };
}

/** Now and then a headline pops up over the city, then goes away. */
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
      if (modal.value === null && app.game.running) setLine({ id: n, text: pool[n % pool.length]! });
      timer = setTimeout(() => {
        setLine(null);
        timer = setTimeout(show, 24000 + Math.random() * 20000);
      }, 6500);
    };
    timer = setTimeout(show, 14000);
    return () => clearTimeout(timer);
  }, []);
  if (!line) return null;
  return (
    <div class="bubble" key={line.id} aria-live="polite" style={{ left: `${sceneCenter().x}px` }}>
      {line.text}
    </div>
  );
}

/** A pulsing ring over the city until the first tap. Shows what to do without saying it. */
export function TapHint() {
  frame.value;
  const run = app.game.run;
  if (run.clicks > 0 || run.creatures.ant.bought > 0 || run.money.gt(15) || app.game.meta.runs > 0) return null;
  const c = sceneCenter();
  return (
    <div class="tap-hint" aria-hidden="true" style={{ left: `${c.x}px`, top: `${c.y}px` }}>
      <span />
      <span />
    </div>
  );
}
