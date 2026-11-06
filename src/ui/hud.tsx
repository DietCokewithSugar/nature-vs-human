import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  BALANCE,
  CLASSES,
  CREATURE_BY_ID,
  CREATURES,
  TAMEABLE,
  bredPerSec,
  countermeasureName,
  formatDuration,
  tideLevel,
  tideMult,
  tideRising,
  type ActiveId,
  type EraId,
} from '../core/index.ts';
import { IconButton, Money, Num } from './common.tsx';
import { COPY, NEWS, eraName } from './copy.ts';
import {
  IconBolt,
  IconBomb,
  IconCrown,
  IconFlask,
  IconGear,
  IconHeart,
  IconMute,
  IconSound,
  IconTrophy,
  IconWave,
} from './icons.tsx';
import { app, focusEra, frame, modal } from './store.ts';

export function Counter() {
  frame.value;
  const g = app.game;
  return (
    <div class="counter">
      <div class="counter-money">
        <Money value={g.run.money} />
      </div>
      <div class="counter-income">
        +<Money value={g.income()} />
        <span class="unit">{COPY.perSecond}</span>
      </div>
    </div>
  );
}

export function EraBar() {
  frame.value;
  const era = app.game.run.era;
  if (era < 2) return null;
  const eras = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= era);
  return (
    <nav class="eras" aria-label="时代">
      {eras.map((e) => (
        <button type="button" class="era-chip" data-era={e} aria-pressed={focusEra.value === e} onClick={() => app.flyTo(e)}>
          {eraName(e)}
        </button>
      ))}
    </nav>
  );
}

export function Actions() {
  frame.value;
  const muted = app.settings.value.muted;
  return (
    <div class="actions">
      <IconButton label={COPY.leaderboard.title} onClick={() => (modal.value = 'leaderboard')}>
        <IconTrophy />
      </IconButton>
      <IconButton label={COPY.settings.sound} aria-pressed={!muted} onClick={() => app.updateSettings({ muted: !muted })}>
        {muted ? <IconMute /> : <IconSound />}
      </IconButton>
      <IconButton label={COPY.settings.title} onClick={() => (modal.value = 'settings')}>
        <IconGear />
      </IconButton>
    </div>
  );
}

/** The tug of war: your bill against the humans' research, with the countermeasure marks. */
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
      <div class="meter" data-kind="bill">
        <span class="meter-label">{COPY.run.bill}</span>
        <span class="meter-track">
          <i style={{ transform: `scaleX(${Math.max(0.005, bill)})` }} />
        </span>
        <span class="meter-value num">{Math.floor(bill * 100)}%</span>
      </div>
      <div class="meter" data-kind="research" data-level={level}>
        <span class="meter-label">
          <IconFlask class="inline-icon" />
          {COPY.run.research}
        </span>
        <span class="meter-track">
          <i style={{ transform: `scaleX(${Math.max(0.005, research)})` }} />
          {BALANCE.research.thresholds.map((t, i) => (
            <b key={t} class={i < run.countermeasures.length ? 'hit' : ''} style={{ left: `${t * 100}%` }} />
          ))}
        </span>
        <span class="meter-value num">{Math.floor(research * 100)}%</span>
      </div>
      {(run.countermeasures.length > 0 || taming.length > 0) && (
        <div class="chips">
          {run.countermeasures.map((cm, i) => (
            <span key={i} class="chip" data-cls={cm.cls}>
              {countermeasureName(cm.cls, cm.era)} · {CLASSES[cm.cls].name}
            </span>
          ))}
          {taming.map((id) => (
            <span key={id} class="chip warn" data-hot={(run.taming[id] ?? 0) > 0.7 || undefined}>
              {CREATURE_BY_ID[id].name} {COPY.run.taming} <span class="num">{Math.floor((run.taming[id] ?? 0) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Ticker() {
  const best = app.game.run.era;
  const [i, setI] = useState(() => Math.floor(Math.random() * 100));
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 9000);
    return () => clearInterval(t);
  }, []);
  const pool = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= best).flatMap((e) => NEWS[e]);
  const fresh = NEWS[best];
  const line = i % 3 === 0 ? pool[i % pool.length] : fresh[i % fresh.length];
  return (
    <div class="ticker" aria-live="polite">
      <span key={i} class="ticker-line">
        {line}
      </span>
    </div>
  );
}

const ACTIVE_ICONS: Record<ActiveId, (p: JSX.SVGAttributes<SVGSVGElement>) => JSX.Element> = {
  surge: IconWave,
  rescue: IconHeart,
  rampage: IconBolt,
  sabotage: IconBomb,
};

/** Era mechanics and active skills along the bottom-left. */
export function Dock() {
  frame.value;
  const g = app.game;
  if (!g.running) return null;
  const actives = (['rescue', 'rampage', 'sabotage'] as ActiveId[]).filter((id) => g.mods.actives[id]);
  if (!g.mods.breeding && !g.mods.tide && !actives.length) return null;
  return (
    <div class="mechanics">
      {g.mods.breeding && <BreedingCard />}
      {g.mods.tide && <TideCard />}
      {actives.map((id) => (
        <ActiveButton key={id} id={id} />
      ))}
    </div>
  );
}

function ActiveButton({ id }: { id: ActiveId }) {
  frame.value;
  const g = app.game;
  const cd = g.cooldown(id);
  const Icon = ACTIVE_ICONS[id];
  return (
    <button
      type="button"
      class="active-btn"
      data-active={id}
      disabled={cd > 0}
      onClick={() => (g.activate(id) ? app.sfx.surge() : app.sfx.deny())}
      title={COPY.actives[id]}
    >
      <span class="active-icon">
        <Icon />
      </span>
      <span class="btn-label">{COPY.actives[id]}</span>
      {cd > 0 && <span class="btn-sub num">{formatDuration(cd)}</span>}
    </button>
  );
}

function BreedingCard() {
  frame.value;
  const g = app.game;
  const run = g.run;
  const cost = g.nestCost();
  let bred = 0;
  for (const c of CREATURES) if (c.cls === 'swarm') bred += bredPerSec(run, g.mods, c.id);
  return (
    <div class="mech" data-cls="swarm">
      <span class="mech-icon">
        <IconCrown />
      </span>
      <div class="mech-text">
        <div class="mech-name">
          {COPY.breeding.name} <span class="num">×{run.nests}</span>
        </div>
        <div class="mech-meta">
          {COPY.breeding.bred} +<Num value={bred} />
          {COPY.perSecond}
        </div>
      </div>
      <button type="button" class="mech-btn" disabled={cost.gt(run.money)} onClick={() => (g.buyNest() ? app.sfx.buy() : app.sfx.deny())}>
        <span class="btn-label">{COPY.breeding.build}</span>
        <Money value={cost} class="btn-sub" />
      </button>
    </div>
  );
}

function TideCard() {
  frame.value;
  const g = app.game;
  const t = g.run.tide;
  const surging = t.surgeLeft > 0;
  const cd = g.cooldown('surge');
  const level = surging ? 1 : tideLevel(t.clock);
  return (
    <div class="mech" data-cls="marine" data-surge={surging || undefined}>
      <span class="tide-meter" aria-hidden="true">
        <i style={{ transform: `scaleY(${0.08 + level * 0.92})` }} />
      </span>
      <div class="mech-text">
        <div class="mech-name">
          {COPY.tide.name} <span class="num">×{tideMult(t, g.mods).toFixed(1)}</span>
        </div>
        <div class="mech-meta">
          <IconWave class="inline-icon" />
          {surging ? COPY.tide.surging : tideRising(t.clock) ? COPY.tide.rising : COPY.tide.falling}
        </div>
      </div>
      <button type="button" class="mech-btn" disabled={cd > 0} onClick={() => (g.activate('surge') ? app.sfx.surge() : app.sfx.deny())}>
        <span class="btn-label">{surging ? COPY.tide.surging : COPY.actives.surge}</span>
        {(surging || cd > 0) && <span class="btn-sub num">{formatDuration(surging ? t.surgeLeft : cd)}</span>}
      </button>
    </div>
  );
}

/** A pulsing ring over the city until the first tap. Shows what to do without saying it. */
export function TapHint() {
  frame.value;
  const run = app.game.run;
  if (run.clicks > 0 || run.creatures.ant.bought > 0 || run.money.gt(15) || app.game.meta.runs > 0) return null;
  return (
    <div class="tap-hint" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
