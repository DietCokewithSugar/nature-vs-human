import { useEffect, useState } from 'preact/hooks';
import {
  BALANCE,
  CREATURES,
  bredPerSec,
  canSurge,
  formatDuration,
  tideLevel,
  tideMult,
  type EraId,
} from '../core/index.ts';
import { IconButton, Money, Num } from './common.tsx';
import { COPY, NEWS, eraName } from './copy.ts';
import { IconCrown, IconGear, IconMute, IconSound, IconTrophy, IconWave } from './icons.tsx';
import { app, focusEra, frame, modal } from './store.ts';

export function Counter() {
  frame.value;
  const g = app.game;
  return (
    <div class="counter" aria-live="off">
      <div class="counter-money">
        <Money value={g.state.money} />
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
  const era = app.game.state.era;
  if (era < 2) return null;
  const eras = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= era);
  return (
    <nav class="eras" aria-label="时代">
      {eras.map((e) => (
        <button
          type="button"
          class="era-chip"
          data-era={e}
          aria-pressed={focusEra.value === e}
          onClick={() => app.flyTo(e)}
        >
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

export function Ticker() {
  const best = app.game.state.bestEra;
  const [i, setI] = useState(() => Math.floor(Math.random() * 100));
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 9000);
    return () => clearInterval(t);
  }, []);
  const pool = ([1, 2, 3, 4] as EraId[]).filter((e) => e <= best).flatMap((e) => NEWS[e]);
  // Bias towards the newest era.
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

export function Mechanics() {
  frame.value;
  const g = app.game;
  if (!g.mods.breeding && !g.mods.tide) return null;
  return (
    <div class="mechanics">
      {g.mods.breeding && <BreedingCard />}
      {g.mods.tide && g.state.era >= 2 && <TideCard />}
    </div>
  );
}

function BreedingCard() {
  frame.value;
  const g = app.game;
  const s = g.state;
  const cost = g.queenCost();
  const affordable = cost.lte(s.money);
  let bred = 0;
  for (const c of CREATURES) if (c.era === 1) bred += bredPerSec(s, g.mods, c.id);
  return (
    <div class="mech" data-era="1">
      <span class="mech-icon">
        <IconCrown />
      </span>
      <div class="mech-text">
        <div class="mech-name">
          {COPY.breeding.name} <span class="num">×{s.queens}</span>
        </div>
        <div class="mech-meta">
          {COPY.breeding.bred} +<Num value={bred} />
          {COPY.perSecond}
        </div>
      </div>
      <button
        type="button"
        class="mech-btn"
        disabled={!affordable}
        onClick={() => (g.buyQueen() ? app.sfx.buy() : app.sfx.deny())}
      >
        <span class="btn-label">{COPY.breeding.crown}</span>
        <Money value={cost} class="btn-sub" />
      </button>
    </div>
  );
}

function TideCard() {
  frame.value;
  const g = app.game;
  const t = g.state.tide;
  const surging = t.surgeLeft > 0;
  const ready = canSurge(t, g.mods);
  const level = surging ? 1 : tideLevel(t.clock, BALANCE.tide.period);
  const mult = tideMult(t, g.mods);
  const rising = Math.sin((2 * Math.PI * t.clock) / BALANCE.tide.period) > 0;
  let label: string = COPY.tide.surge;
  let sub = '';
  if (surging) {
    label = COPY.tide.surging;
    sub = formatDuration(t.surgeLeft);
  } else if (!ready) {
    sub = formatDuration(t.cooldownLeft);
  }
  return (
    <div class="mech" data-era="2" data-surge={surging || undefined}>
      <span class="tide-meter" aria-hidden="true">
        <i style={{ transform: `scaleY(${0.08 + level * 0.92})` }} />
      </span>
      <div class="mech-text">
        <div class="mech-name">
          {COPY.tide.name} <span class="num">×{mult.toFixed(1)}</span>
        </div>
        <div class="mech-meta">
          <IconWave class="inline-icon" />
          {surging ? COPY.tide.surging : rising ? COPY.tide.rising : COPY.tide.falling}
          {g.mods.autoSurge && <span class="pill">{COPY.tide.auto}</span>}
        </div>
      </div>
      <button
        type="button"
        class="mech-btn"
        disabled={!ready}
        onClick={() => (g.surge() ? app.sfx.surge() : app.sfx.deny())}
      >
        <span class="btn-label">{label}</span>
        {sub && <span class="btn-sub num">{sub}</span>}
      </button>
    </div>
  );
}

/** A pulsing ring over the city until the first tap. Shows what to do without saying it. */
export function TapHint() {
  frame.value;
  const s = app.game.state;
  if (s.clicks > 0 || s.creatures.ant.bought > 0) return null;
  return (
    <div class="tap-hint" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
