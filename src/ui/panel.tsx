import { useEffect, useState } from 'preact/hooks';
import {
  BALANCE,
  CREATURES,
  creatureCost,
  creatureCostN,
  creatureProd,
  genesFree,
  geneLevel,
  availableGenes,
  isCreatureVisible,
  lifetimeForGenes,
  milestonesReached,
  nextMilestone,
  type CreatureDef,
  type UpgradeDef,
} from '../core/index.ts';
import { Money, Num, Segmented, Thumb } from './common.tsx';
import { COPY } from './copy.ts';
import { describeEffects, describeGene } from './describe.ts';
import { IconDna } from './icons.tsx';
import { app, frame, tab, type Tab } from './store.ts';

export function Panel() {
  frame.value;
  const g = app.game;
  const upgradesReady = g
    .availableUpgrades()
    .filter((u) => u.kind !== 'era' && u.kind !== 'ending' && g.upgradeCost(u.id).lte(g.state.money)).length;
  const canEvolve = g.genesOnEvolve() >= 1;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'creatures', label: COPY.tabs.creatures },
    { value: 'upgrades', label: upgradesReady ? `${COPY.tabs.upgrades} ${upgradesReady}` : COPY.tabs.upgrades },
    { value: 'evolve', label: canEvolve ? `${COPY.tabs.evolve} ●` : COPY.tabs.evolve },
  ];
  return (
    <aside class="panel" aria-label="商店">
      <Segmented label="分类" value={tab.value} options={tabs} onChange={(v) => (tab.value = v)} />
      <div class="panel-body">
        {tab.value === 'creatures' && <CreatureList />}
        {tab.value === 'upgrades' && <UpgradeList />}
        {tab.value === 'evolve' && <EvolvePanel />}
      </div>
    </aside>
  );
}

// ── Creatures ───────────────────────────────────────────────────

function CreatureList() {
  frame.value;
  const g = app.game;
  const amount = app.settings.value.buyAmount;
  const visible = CREATURES.filter((c) => isCreatureVisible(g.state, c.id));
  const ups = g.availableUpgrades();
  const ticket = ups.find((u) => u.kind === 'era');
  const ending = ups.find((u) => u.kind === 'ending');
  return (
    <>
      <Segmented
        label="购买数量"
        value={String(amount)}
        options={['1', '10', '100', 'max'].map((v) => ({ value: v, label: COPY.buyAmounts[v]! }))}
        onChange={(v) => app.updateSettings({ buyAmount: v === 'max' ? 'max' : (Number(v) as 1 | 10 | 100) })}
      />
      {ending && <TicketCard def={ending} label={COPY.creatures.finalBill} />}
      {ticket && <TicketCard def={ticket} label={COPY.creatures.nextEra} />}
      <div class="list">
        {[...visible].reverse().map((c) => (
          <CreatureRow key={c.id} def={c} />
        ))}
      </div>
    </>
  );
}

function CreatureRow({ def }: { def: CreatureDef }) {
  frame.value;
  const g = app.game;
  const s = g.state;
  const c = s.creatures[def.id];
  const pref = app.settings.value.buyAmount;
  const n = pref === 'max' ? Math.max(1, g.buyCount(def.id, 'max')) : pref;
  const cost = n === 1 ? creatureCost(def.id, c.bought) : creatureCostN(def.id, c.bought, n);
  const affordable = cost.lte(s.money);
  const next = nextMilestone(c.bought);
  const reached = milestonesReached(c.bought);
  const prev = reached > 0 ? BALANCE.milestones[reached - 1]! : 0;
  const progress = next ? (c.bought - prev) / (next - prev) : 1;
  const prod = creatureProd(s, g.mods, def.id);
  const fresh = c.bought === 0;
  return (
    <div class="row creature" data-era={def.era} data-fresh={fresh || undefined}>
      <Thumb model={def.model} />
      <div class="row-main">
        <div class="row-title">
          <span class="name">{def.name}</span>
          <span class="role">{def.title}</span>
        </div>
        <div class="row-meta">
          <span class="num count">
            <Num value={c.bought} />
          </span>
          {c.bred >= 1 && (
            <span class="num bred">
              +<Num value={c.bred} />
            </span>
          )}
          {!fresh && (
            <span class="num prod">
              <Money value={prod} />
              {COPY.perSecond}
            </span>
          )}
        </div>
        <div class="milestone" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, progress))})` }} />
        </div>
      </div>
      <button
        type="button"
        class="buy"
        disabled={!affordable}
        onClick={() => (g.buyCreature(def.id, pref) > 0 ? app.sfx.buy() : app.sfx.deny())}
      >
        <Money value={cost} />
        {n > 1 && (
          <span class="buy-n num">
            ×<Num value={n} />
          </span>
        )}
      </button>
    </div>
  );
}

function TicketCard({ def, label }: { def: UpgradeDef; label: string }) {
  frame.value;
  const g = app.game;
  const cost = g.upgradeCost(def.id);
  const era = def.effects.find((e) => e.type === 'unlockEra');
  const eraId = era && era.type === 'unlockEra' ? era.era : def.era;
  return (
    <div class="ticket" data-era={eraId}>
      <div class="ticket-text">
        <div class="ticket-label">{label}</div>
        <div class="ticket-name">{def.name}</div>
      </div>
      <button
        type="button"
        class="buy solid"
        disabled={cost.gt(g.state.money)}
        onClick={() => (g.buyUpgrade(def.id) ? undefined : app.sfx.deny())}
      >
        <Money value={cost} />
      </button>
    </div>
  );
}

// ── Upgrades ────────────────────────────────────────────────────

function UpgradeList() {
  frame.value;
  const g = app.game;
  const list = g
    .availableUpgrades()
    .filter((u) => u.kind !== 'era' && u.kind !== 'ending')
    .map((u) => ({ u, cost: g.upgradeCost(u.id) }))
    .sort((a, b) => (a.cost.lt(b.cost) ? -1 : 1));
  if (!list.length) return <p class="empty">{COPY.upgrades.empty}</p>;
  return (
    <div class="list">
      {list.map(({ u, cost }) => {
        const affordable = cost.lte(g.state.money);
        return (
          <button
            type="button"
            key={u.id}
            class="row upgrade"
            data-era={u.era}
            disabled={!affordable}
            onClick={() => (g.buyUpgrade(u.id) ? app.sfx.upgrade() : app.sfx.deny())}
          >
            <span class="kind-dot" aria-hidden="true" />
            <span class="row-main">
              <span class="name">{u.name}</span>
              <span class="effect">{describeEffects(u.effects)}</span>
            </span>
            <span class="price">
              <Money value={cost} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Evolution ───────────────────────────────────────────────────

function EvolvePanel() {
  frame.value;
  const g = app.game;
  const s = g.state;
  const gain = g.genesOnEvolve();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const bonus = Math.round((g.mods.geneMult - 1) * 100);
  const need = lifetimeForGenes(s.genes + 1).sub(s.lifetimeEarned);
  const free = genesFree(s);

  const onEvolve = () => {
    if (gain < 1) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    g.evolve();
  };

  return (
    <>
      <div class="gene-card">
        <div class="gene-stats">
          <div class="gene-count">
            <IconDna class="gene-icon" />
            <span class="num">
              <Num value={s.genes} />
            </span>
            <span class="unit">{COPY.evolve.genes}</span>
          </div>
          <div class="gene-bonus num">
            +<Num value={bonus} />% {COPY.evolve.bonus}
          </div>
        </div>
        <button type="button" class="evolve-btn" data-armed={armed || undefined} disabled={gain < 1} onClick={onEvolve}>
          <span class="btn-label">{armed ? COPY.evolve.confirm : COPY.evolve.action}</span>
          <span class="btn-sub num">
            {gain >= 1 ? (
              <>
                +<Num value={gain} /> {COPY.evolve.genes}
              </>
            ) : (
              <>
                {COPY.evolve.needMore} <Money value={need} />
              </>
            )}
          </span>
        </button>
      </div>
      <div class="section-label">
        <span>{COPY.evolve.shop}</span>
        <span class="num">
          <Num value={free} /> {COPY.evolve.genes}
        </span>
      </div>
      <div class="list">
        {availableGenes(s).map((def) => {
          const level = geneLevel(s, def.id);
          const next = def.levels[level];
          const shown = next ?? def.levels[def.levels.length - 1]!;
          const max = def.levels.length;
          return (
            <button
              type="button"
              key={def.id}
              class="row upgrade gene"
              disabled={!next || next.cost > free}
              onClick={() => (g.buyGene(def.id) ? app.sfx.upgrade() : app.sfx.deny())}
            >
              <span class="kind-dot" aria-hidden="true" />
              <span class="row-main">
                <span class="name">
                  {def.name}
                  {max > 1 && <span class="level num">{COPY.evolve.level(level, max)}</span>}
                </span>
                <span class="effect">{shown.effects.map(describeGene).join(' · ')}</span>
              </span>
              <span class="price num">
                {next ? (
                  <>
                    <Num value={next.cost} /> {COPY.evolve.genes}
                  </>
                ) : (
                  COPY.evolve.maxed
                )}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
