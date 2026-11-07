import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  BALANCE,
  BRANCHES,
  BRANCH_NAMES,
  CREATURES,
  DOMESTICS,
  META_UPGRADES,
  creatureCost,
  creatureCostN,
  creaturesOfEra,
  isCreatureVisible,
  meets,
  metaFree,
  metaLevel,
  milestonesReached,
  nextMilestone,
  skillStatus,
  skillsOfBranch,
  type Branch,
  type CreatureDef,
  type EraId,
  type MetaUpgradeDef,
  type SkillDef,
  type UpgradeDef,
} from '../core/index.ts';
import { Money, Num, Thumb } from './common.tsx';
import { COPY } from './copy.ts';
import { describeEffects, describeMeta, describeNeed } from './describe.ts';
import { app, detail, frame, modal, sheet, tab, type Tab } from './store.ts';

const AMOUNTS = [1, 10, 100, 'max'] as const;

export interface PanelProps {
  /** Pointer down on the header: the shell decides whether it becomes a drag. */
  onGrab?: (e: JSX.TargetedPointerEvent<HTMLDivElement>) => void;
  /** True right after a drag, so the click that ends it doesn't also toggle a tab. */
  justDragged?: () => boolean;
}

/** Tap a tab to open it; tap the open one again to put the shop away. */
export function openTab(v: Tab): void {
  if (tab.value !== v) {
    tab.value = v;
    if (sheet.value === 'closed') sheet.value = 'half';
  } else {
    sheet.value = sheet.value === 'closed' ? 'half' : 'closed';
  }
}

export function Panel({ onGrab, justDragged }: PanelProps) {
  frame.value;
  const g = app.game;
  const amount = app.settings.value.buyAmount;
  const tabs: { value: Tab; label: string; badge: number | 'dot' }[] = [
    { value: 'creatures', label: COPY.tabs.creatures, badge: 0 },
    { value: 'skills', label: COPY.tabs.skills, badge: g.running ? skillCount() + boostCount() : 0 },
    { value: 'meta', label: COPY.tabs.meta, badge: metaFree(g.meta) > 0 ? 'dot' : 0 },
  ];
  const cycle = () => {
    const next = AMOUNTS[(AMOUNTS.indexOf(amount) + 1) % AMOUNTS.length]!;
    app.updateSettings({ buyAmount: next });
  };
  return (
    <aside class="panel" aria-label="商店">
      <div class="panel-head" onPointerDown={onGrab}>
        <span class="grab" aria-hidden="true" />
        <div class="tabs" role="tablist" aria-label="分类">
          {tabs.map((t) => (
            <button
              type="button"
              role="tab"
              key={t.value}
              class="tab"
              aria-selected={tab.value === t.value}
              aria-expanded={tab.value === t.value ? sheet.value !== 'closed' : undefined}
              onClick={() => !justDragged?.() && openTab(t.value)}
            >
              {t.label}
              {t.badge === 'dot' && <span class="badge dot" aria-hidden="true" />}
              {typeof t.badge === 'number' && t.badge > 0 && <span class="badge num">{t.badge}</span>}
            </button>
          ))}
        </div>
        {tab.value === 'creatures' && (
          <button type="button" class="amount num" aria-label="购买数量" onClick={cycle}>
            {COPY.buyAmounts[String(amount)]}
          </button>
        )}
      </div>
      <div class="panel-body">
        {tab.value === 'creatures' && <CreatureGrid />}
        {tab.value === 'skills' && <SkillTree />}
        {tab.value === 'meta' && <MetaShop />}
      </div>
    </aside>
  );
}

function skillCount(): number {
  const g = app.game;
  let n = 0;
  for (const b of BRANCHES) {
    for (const s of skillsOfBranch(b)) {
      if (skillStatus(g.run, g.mods, s) === 'available' && g.skillCost(s.id).lte(g.run.money)) n++;
    }
  }
  return n;
}

function boostCount(): number {
  const g = app.game;
  return g.availableUpgrades().filter((u) => u.kind === 'creature' && g.upgradeCost(u.id).lte(g.run.money)).length;
}

// ── Creatures ───────────────────────────────────────────────────

function CreatureGrid() {
  frame.value;
  const g = app.game;
  const visible = CREATURES.filter((c) => isCreatureVisible(g.run, c.id));
  const ticket = g.availableUpgrades().find((u) => u.kind === 'era');
  return (
    <>
      {ticket && <TicketCard def={ticket} />}
      <div class="grid">
        {[...visible].reverse().map((c) => (
          <CreatureTile key={c.id} def={c} />
        ))}
      </div>
    </>
  );
}

function CreatureTile({ def }: { def: CreatureDef }) {
  frame.value;
  const g = app.game;
  const run = g.run;
  const defected = run.defected[def.id];
  const open = () => {
    detail.value = def.id;
    modal.value = 'creature';
  };
  if (defected !== undefined) {
    const to = DOMESTICS[def.tame!];
    return (
      <div class="tile" data-cls={def.cls} data-defected>
        <button type="button" class="tile-pic" aria-label={COPY.creatures.defected(to.name)} onClick={open}>
          <Thumb model={to.model} />
          <span class="tile-count num">
            <Num value={defected} />
          </span>
        </button>
        <div class="tile-name">{def.name}</div>
        <span class="stamp" aria-hidden="true">
          {COPY.creatures.stamp}
        </span>
      </div>
    );
  }
  const c = run.creatures[def.id];
  const pref = app.settings.value.buyAmount;
  const n = pref === 'max' ? Math.max(1, g.buyCount(def.id, 'max')) : pref;
  const cost = n === 1 ? creatureCost(def.id, c.bought) : creatureCostN(def.id, c.bought, n);
  const next = nextMilestone(c.bought);
  const reached = milestonesReached(c.bought);
  const prev = reached > 0 ? BALANCE.milestones[reached - 1]! : 0;
  const progress = next ? (c.bought - prev) / (next - prev) : 1;
  const fresh = c.bought + c.bred === 0;
  const taming = run.taming[def.id] ?? 0;
  const tamingShown = taming > 0.01;
  return (
    <div class="tile" data-cls={def.cls} data-fresh={fresh || undefined} data-hot={taming > 0.7 || undefined}>
      <button type="button" class="tile-pic" aria-label={def.name} onClick={open}>
        <Thumb model={def.model} />
        {c.bought > 0 && (
          <span class="tile-count num">
            <Num value={c.bought} />
          </span>
        )}
        {c.bred >= 1 && (
          <span class="tile-bred num">
            +<Num value={c.bred} />
          </span>
        )}
      </button>
      <div class="tile-name">{def.name}</div>
      <span class="tile-bar" data-taming={tamingShown || undefined} aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.max(0.03, Math.min(1, tamingShown ? taming : progress))})` }} />
      </span>
      <button
        type="button"
        class="buy chunk"
        disabled={!g.running || cost.gt(run.money)}
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

/** The next era: its name, a peek at what lives there, and the price. */
function TicketCard({ def }: { def: UpgradeDef }) {
  frame.value;
  const g = app.game;
  const cost = g.upgradeCost(def.id);
  const era = def.effects.find((e) => e.type === 'unlockEra');
  const eraId = (era && era.type === 'unlockEra' ? era.era : def.era) as EraId;
  return (
    <div class="ticket" data-era={eraId}>
      <div class="ticket-text">
        <div class="ticket-name">{def.name}</div>
        <div class="ticket-peek" aria-hidden="true">
          {creaturesOfEra(eraId).map((c) => (
            <Thumb key={c.id} model={c.model} />
          ))}
        </div>
      </div>
      <button type="button" class="buy chunk" disabled={cost.gt(g.run.money)} onClick={() => g.buyUpgrade(def.id) || app.sfx.deny()}>
        <Money value={cost} />
      </button>
    </div>
  );
}

// ── Skills ──────────────────────────────────────────────────────

type BranchTab = Branch | 'boosts';

function SkillTree() {
  frame.value;
  const [branch, setBranch] = useState<BranchTab>('assassin');
  const g = app.game;
  const tabs: BranchTab[] = [...BRANCHES, 'boosts'];
  const count = (b: BranchTab) =>
    b === 'boosts'
      ? boostCount()
      : skillsOfBranch(b).filter((s) => skillStatus(g.run, g.mods, s) === 'available' && g.skillCost(s.id).lte(g.run.money)).length;
  return (
    <>
      <div class="branches" role="tablist" aria-label="技能分支">
        {tabs.map((b) => {
          const n = count(b);
          return (
            <button
              type="button"
              role="tab"
              key={b}
              class="branch"
              data-cls={b}
              aria-selected={branch === b}
              onClick={() => setBranch(b)}
            >
              {b === 'boosts' ? COPY.skills.boosts : BRANCH_NAMES[b]}
              {n > 0 && <span class="badge num">{n}</span>}
            </button>
          );
        })}
      </div>
      {branch === 'boosts' ? <Boosts /> : <BranchNodes branch={branch} />}
    </>
  );
}

function BranchNodes({ branch }: { branch: Branch }) {
  const g = app.game;
  const nodes = skillsOfBranch(branch);
  const rows: SkillDef[][] = [];
  for (const s of nodes) {
    const last = rows[rows.length - 1];
    if (s.fork && last && last[0]?.fork?.group === s.fork.group) last.push(s);
    else rows.push([s]);
  }
  return (
    <div class="tree" data-cls={branch}>
      {rows.map((row) => {
        const done = row.some((s) => skillStatus(g.run, g.mods, s) === 'owned');
        return row.length > 1 ? (
          <div class="step fork" key={row[0]!.id} data-done={done || undefined}>
            {row.map((s) => (
              <SkillNode key={s.id} def={s} />
            ))}
            <span class="fork-or" aria-hidden="true">
              {COPY.skills.or}
            </span>
          </div>
        ) : (
          <div class="step" key={row[0]!.id} data-done={done || undefined}>
            <SkillNode def={row[0]!} />
          </div>
        );
      })}
    </div>
  );
}

function SkillNode({ def }: { def: SkillDef }) {
  frame.value;
  const g = app.game;
  const status = skillStatus(g.run, g.mods, def);
  const cost = g.skillCost(def.id);
  const affordable = status === 'available' && cost.lte(g.run.money) && g.running;
  const need = status === 'locked' ? def.req.find((r) => !meets(g.run, r)) : undefined;
  return (
    <button
      type="button"
      class="node"
      data-status={status}
      data-afford={affordable || undefined}
      disabled={!affordable}
      onClick={() => (g.buySkill(def.id) ? app.sfx.upgrade() : app.sfx.deny())}
    >
      <span class="node-main">
        <span class="node-name">{def.name}</span>
        <span class="effect">{describeEffects(def.effects)}</span>
      </span>
      {status === 'available' && (
        <span class="price num">
          <Money value={cost} />
        </span>
      )}
      {status === 'locked' && need && <span class="need">{describeNeed(need)}</span>}
      {status === 'forkLocked' && <span class="need">{COPY.skills.forkLocked}</span>}
    </button>
  );
}

function Boosts() {
  frame.value;
  const g = app.game;
  const list = g
    .availableUpgrades()
    .filter((u) => u.kind === 'creature')
    .map((u) => ({ u, cost: g.upgradeCost(u.id) }))
    .sort((a, b) => (a.cost.lt(b.cost) ? -1 : 1));
  if (!list.length) return <p class="empty">{COPY.skills.empty}</p>;
  return (
    <div class="boosts">
      {list.map(({ u, cost }) => {
        const creature = CREATURES.find((c) => u.effects.some((e) => e.type === 'creatureMult' && e.creature === c.id));
        const affordable = g.running && cost.lte(g.run.money);
        return (
          <button
            type="button"
            key={u.id}
            class="node boost"
            data-cls={creature?.cls}
            data-status="available"
            data-afford={affordable || undefined}
            disabled={!affordable}
            onClick={() => (g.buyUpgrade(u.id) ? app.sfx.upgrade() : app.sfx.deny())}
          >
            {creature && <Thumb model={creature.model} class="node-pic" />}
            <span class="node-main">
              <span class="node-name">{u.name}</span>
              <span class="effect">{describeEffects(u.effects)}</span>
            </span>
            <span class="price num">
              <Money value={cost} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Meta ────────────────────────────────────────────────────────

function MetaShop() {
  frame.value;
  const g = app.game;
  const free = metaFree(g.meta);
  const groups: { kind: MetaUpgradeDef['kind']; title: string }[] = [
    { kind: 'route', title: COPY.meta.routes },
    { kind: 'fork', title: COPY.meta.forks },
    { kind: 'perk', title: COPY.meta.perks },
  ];
  return (
    <>
      <div class="gene">
        <span class="gem" aria-hidden="true" />
        <span class="gene-count num" aria-label={`${free} ${COPY.meta.points}`}>
          <Num value={free} />
        </span>
        <button type="button" class="chunk go" onClick={() => (modal.value = 'setup')}>
          {COPY.setup.title}
        </button>
      </div>
      {groups.map(({ kind, title }) => (
        <section key={kind} class="meta-group">
          <h3 class="section-label">{title}</h3>
          <div class="boosts">
            {META_UPGRADES.filter((m) => m.kind === kind).map((def) => {
              const level = metaLevel(g.meta, def.id);
              const next = def.levels[level];
              const shown = next ?? def.levels[def.levels.length - 1]!;
              const max = def.levels.length;
              const affordable = !!next && next.cost <= free;
              // Routes and forks are named by what they unlock; the section says what kind it is.
              const effect = shown.effects
                .filter((e) => e.type !== 'unlockRoute' && e.type !== 'unlockFork')
                .map(describeMeta)
                .join(' · ');
              return (
                <button
                  type="button"
                  key={def.id}
                  class="node"
                  data-cls="meta"
                  data-status={next ? 'available' : 'owned'}
                  data-afford={affordable || undefined}
                  disabled={!affordable}
                  onClick={() => (g.buyMeta(def.id) ? app.sfx.upgrade() : app.sfx.deny())}
                >
                  <span class="node-main">
                    <span class="node-name">
                      {def.name}
                      {max > 1 && (
                        <span class="pips" aria-label={COPY.meta.level(level, max)}>
                          {def.levels.map((_, i) => (
                            <i key={i} data-on={i < level || undefined} />
                          ))}
                        </span>
                      )}
                    </span>
                    {effect && <span class="effect">{effect}</span>}
                  </span>
                  {next && (
                    <span class="price num">
                      <span class="gem small" aria-hidden="true" />
                      <Num value={next.cost} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
