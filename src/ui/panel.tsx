import { useState } from 'preact/hooks';
import {
  BALANCE,
  BRANCHES,
  BRANCH_NAMES,
  CLASSES,
  CREATURES,
  DOMESTICS,
  META_UPGRADES,
  creatureCost,
  creatureCostN,
  creatureProd,
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
  type MetaUpgradeDef,
  type SkillDef,
  type UpgradeDef,
} from '../core/index.ts';
import { Money, Num, Segmented, Thumb } from './common.tsx';
import { COPY } from './copy.ts';
import { describeEffects, describeMeta, describeNeed } from './describe.ts';
import { IconCheck, IconDna, IconLock } from './icons.tsx';
import { app, frame, modal, tab, type Tab } from './store.ts';

export function Panel() {
  frame.value;
  const g = app.game;
  const run = g.run;
  const affordableSkills =
    g.running &&
    (skillCount() +
      g.availableUpgrades().filter((u) => u.kind === 'creature' && g.upgradeCost(u.id).lte(run.money)).length);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'creatures', label: COPY.tabs.creatures },
    { value: 'skills', label: affordableSkills ? `${COPY.tabs.skills} ${affordableSkills}` : COPY.tabs.skills },
    { value: 'meta', label: metaFree(g.meta) > 0 ? `${COPY.tabs.meta} ●` : COPY.tabs.meta },
  ];
  return (
    <aside class="panel" aria-label="商店">
      <Segmented label="分类" value={tab.value} options={tabs} onChange={(v) => (tab.value = v)} />
      <div class="panel-body">
        {tab.value === 'creatures' && <CreatureList />}
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

// ── Creatures ───────────────────────────────────────────────────

function CreatureList() {
  frame.value;
  const g = app.game;
  const amount = app.settings.value.buyAmount;
  const visible = CREATURES.filter((c) => isCreatureVisible(g.run, c.id));
  const ticket = g.availableUpgrades().find((u) => u.kind === 'era');
  return (
    <>
      <Segmented
        label="购买数量"
        value={String(amount)}
        options={['1', '10', '100', 'max'].map((v) => ({ value: v, label: COPY.buyAmounts[v]! }))}
        onChange={(v) => app.updateSettings({ buyAmount: v === 'max' ? 'max' : (Number(v) as 1 | 10 | 100) })}
      />
      {ticket && <TicketCard def={ticket} />}
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
  const run = g.run;
  const defected = run.defected[def.id];
  if (defected !== undefined) {
    const to = DOMESTICS[def.tame!].name;
    return (
      <div class="row creature" data-cls={def.cls} data-defected>
        <Thumb model={DOMESTICS[def.tame!].model} />
        <div class="row-main">
          <div class="row-title">
            <span class="name">{def.name}</span>
            <span class="role">{COPY.creatures.defected(to)}</span>
          </div>
          <div class="row-meta">
            <span class="num count">
              <Num value={defected} />
            </span>
          </div>
        </div>
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
  return (
    <div class="row creature" data-cls={def.cls} data-fresh={fresh || undefined}>
      <Thumb model={def.model} />
      <div class="row-main">
        <div class="row-title">
          <span class="name">{def.name}</span>
          <span class="cls-badge">{CLASSES[def.cls].name}</span>
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
              <Money value={creatureProd(run, g.mods, def.id)} />
              {COPY.perSecond}
            </span>
          )}
        </div>
        <div class="milestone" data-taming={taming > 0.01 || undefined} aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, taming > 0.01 ? taming : progress))})` }} />
        </div>
      </div>
      <button
        type="button"
        class="buy"
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

function TicketCard({ def }: { def: UpgradeDef }) {
  frame.value;
  const g = app.game;
  const cost = g.upgradeCost(def.id);
  const era = def.effects.find((e) => e.type === 'unlockEra');
  const eraId = era && era.type === 'unlockEra' ? era.era : def.era;
  return (
    <div class="ticket" data-era={eraId}>
      <div class="ticket-text">
        <div class="ticket-label">{COPY.creatures.nextEra}</div>
        <div class="ticket-name">{def.name}</div>
      </div>
      <button type="button" class="buy solid" disabled={cost.gt(g.run.money)} onClick={() => g.buyUpgrade(def.id) || app.sfx.deny()}>
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
      ? g.availableUpgrades().filter((u) => u.kind === 'creature' && g.upgradeCost(u.id).lte(g.run.money)).length
      : skillsOfBranch(b).filter((s) => skillStatus(g.run, g.mods, s) === 'available' && g.skillCost(s.id).lte(g.run.money)).length;
  return (
    <>
      <div class="branch-chips" role="tablist" aria-label="技能分支">
        {tabs.map((b) => {
          const n = count(b);
          return (
            <button
              type="button"
              role="tab"
              key={b}
              class="branch-chip"
              data-cls={b}
              aria-selected={branch === b}
              onClick={() => setBranch(b)}
            >
              {b === 'boosts' ? COPY.skills.boosts : BRANCH_NAMES[b]}
              {n > 0 && <span class="dot num">{n}</span>}
            </button>
          );
        })}
      </div>
      {branch === 'boosts' ? <Boosts /> : <BranchNodes branch={branch} />}
    </>
  );
}

function BranchNodes({ branch }: { branch: Branch }) {
  const nodes = skillsOfBranch(branch);
  const rows: SkillDef[][] = [];
  for (const s of nodes) {
    const last = rows[rows.length - 1];
    if (s.fork && last && last[0]?.fork?.group === s.fork.group) last.push(s);
    else rows.push([s]);
  }
  return (
    <div class="tree">
      {rows.map((row) =>
        row.length > 1 ? (
          <div class="fork" key={row[0]!.id}>
            <span class="fork-label">{COPY.skills.fork}</span>
            <div class="fork-pair">
              {row.map((s) => (
                <SkillNode key={s.id} def={s} />
              ))}
            </div>
          </div>
        ) : (
          <SkillNode key={row[0]!.id} def={row[0]!} />
        ),
      )}
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
      data-cls={def.branch}
      data-status={status}
      disabled={!affordable}
      onClick={() => (g.buySkill(def.id) ? app.sfx.upgrade() : app.sfx.deny())}
    >
      <span class="node-main">
        <span class="name">{def.name}</span>
        <span class="effect">{describeEffects(def.effects)}</span>
      </span>
      <span class="node-side">
        {status === 'owned' && <IconCheck class="node-icon" />}
        {status === 'available' && (
          <span class="price">
            <Money value={cost} />
          </span>
        )}
        {status === 'locked' && (
          <span class="need">
            <IconLock class="inline-icon" />
            {need ? describeNeed(need) : ''}
          </span>
        )}
        {status === 'forkLocked' && (
          <span class="need">
            <IconLock class="inline-icon" />
            {COPY.skills.forkLocked}
          </span>
        )}
        {status === 'forkClosed' && <span class="need">{COPY.skills.forkClosed}</span>}
      </span>
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
    <div class="tree">
      {list.map(({ u, cost }) => {
        const cls = CREATURES.find((c) => u.effects.some((e) => e.type === 'creatureMult' && e.creature === c.id))?.cls;
        return (
          <button
            type="button"
            key={u.id}
            class="node"
            data-cls={cls}
            data-status="available"
            disabled={!g.running || cost.gt(g.run.money)}
            onClick={() => (g.buyUpgrade(u.id) ? app.sfx.upgrade() : app.sfx.deny())}
          >
            <span class="node-main">
              <span class="name">{u.name}</span>
              <span class="effect">{describeEffects(u.effects)}</span>
            </span>
            <span class="node-side">
              <span class="price">
                <Money value={cost} />
              </span>
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
      <div class="gene-card">
        <div class="gene-stats">
          <div class="gene-count">
            <IconDna class="gene-icon" />
            <span class="num">
              <Num value={free} />
            </span>
            <span class="unit">{COPY.meta.points}</span>
          </div>
        </div>
        <button type="button" class="evolve-btn" onClick={() => (modal.value = 'setup')}>
          <span class="btn-label">{COPY.setup.title}</span>
        </button>
      </div>
      {groups.map(({ kind, title }) => (
        <section key={kind} class="meta-group">
          <div class="section-label">
            <span>{title}</span>
          </div>
          <div class="tree">
            {META_UPGRADES.filter((m) => m.kind === kind).map((def) => {
              const level = metaLevel(g.meta, def.id);
              const next = def.levels[level];
              const shown = next ?? def.levels[def.levels.length - 1]!;
              const max = def.levels.length;
              return (
                <button
                  type="button"
                  key={def.id}
                  class="node"
                  data-cls="meta"
                  data-status={next ? 'available' : 'owned'}
                  disabled={!next || next.cost > free}
                  onClick={() => (g.buyMeta(def.id) ? app.sfx.upgrade() : app.sfx.deny())}
                >
                  <span class="node-main">
                    <span class="name">
                      {def.name}
                      {max > 1 && <span class="level num">{COPY.meta.level(level, max)}</span>}
                    </span>
                    <span class="effect">{shown.effects.map(describeMeta).join(' · ')}</span>
                  </span>
                  <span class="node-side">
                    {next ? (
                      <span class="price num">
                        <Num value={next.cost} /> {COPY.meta.points}
                      </span>
                    ) : (
                      <IconCheck class="node-icon" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
