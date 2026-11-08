import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  BRANCHES,
  BRANCH_NAMES,
  BUILDINGS,
  META_UPGRADES,
  NATURE_BUILDINGS,
  SKILLS,
  meets,
  metaFree,
  metaLevel,
  skillStatus,
  skillsOfBranch,
  type Branch,
  type BuildingDef,
  type MetaUpgradeDef,
  type NatureBuildingId,
  type SkillDef,
} from '../core/index.ts';
import { Essence, Num, Thumb } from './common.tsx';
import { COPY, eraName } from './copy.ts';
import { describeEffects, describeMeta, describeNeed } from './describe.ts';
import { app, detailKind, frame, modal, placing, sheet, tab, type Tab } from './store.ts';

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
  const tabs: { value: Tab; label: string; badge: number | 'dot' }[] = [
    { value: 'build', label: COPY.tabs.build, badge: 0 },
    { value: 'skills', label: COPY.tabs.skills, badge: g.running ? skillCount() : 0 },
    { value: 'meta', label: COPY.tabs.meta, badge: metaFree(g.meta) > 0 ? 'dot' : 0 },
  ];
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
      </div>
      <div class="panel-body">
        {tab.value === 'build' && <BuildShop />}
        {tab.value === 'skills' && <SkillTree />}
        {tab.value === 'meta' && <MetaShop />}
      </div>
    </aside>
  );
}

function skillCount(): number {
  const g = app.game;
  return SKILLS.filter((s) => skillStatus(g.run, g.mods, s) === 'available' && s.cost <= g.run.essence).length;
}

/** Buildings in use out of the slots the ground allows. */
function Slots() {
  frame.value;
  const g = app.game;
  const n = g.buildingCount();
  const cap = g.buildingCap();
  return (
    <div class="slots" data-full={n >= cap || undefined}>
      <b class="num">{COPY.build.slots(n, cap)}</b>
      <span>{n >= cap ? COPY.build.full : COPY.build.slotsHint}</span>
    </div>
  );
}

// ── Buildings ───────────────────────────────────────────────────

/** Is a nature building shown in the shop, and if not open yet, why. */
function shopState(id: NatureBuildingId): 'open' | 'era' | 'skill' | 'defected' | 'hidden' {
  const g = app.game;
  const def = BUILDINGS[id];
  if (g.kindOpen(id)) return 'open';
  if (def.spawns.every((s) => g.run.defected[s.unit as never] !== undefined)) return 'defected';
  if (def.skill) return g.mods.unlocked[id] ? 'era' : 'skill';
  if (def.era === g.run.era + 1) return 'era';
  return 'hidden';
}

function BuildShop() {
  frame.value;
  const list = NATURE_BUILDINGS.map((id) => ({ id, state: shopState(id) })).filter((x) => x.state !== 'hidden');
  const open = list.filter((x) => x.state === 'open');
  const later = list.filter((x) => x.state !== 'open');
  return (
    <>
      <Slots />
      <div class="grid">
        {open.map(({ id }) => (
          <BuildTile key={id} def={BUILDINGS[id]} />
        ))}
      </div>
      {later.length > 0 && (
        <div class="grid later">
          {later.map(({ id, state }) => (
            <BuildTile key={id} def={BUILDINGS[id]} locked={state as 'era' | 'skill' | 'defected'} />
          ))}
        </div>
      )}
    </>
  );
}

function BuildTile({ def, locked }: { def: BuildingDef; locked?: 'era' | 'skill' | 'defected' }) {
  frame.value;
  const g = app.game;
  const cost = g.buildingCost(def.id);
  const owned = g.run.buildings.filter((b) => b.side === 'nature' && b.kind === def.id).length;
  const full = g.buildingCount() >= g.buildingCap();
  const poor = cost > g.run.essence;
  const active = placing.value === def.id;
  const info = () => {
    detailKind.value = def.id;
    modal.value = 'kind';
  };
  const buy = () => {
    if (active) return app.cancelPlacing();
    if (locked || full || poor) return app.sfx.deny();
    app.startPlacing(def.id);
  };
  return (
    <div class="tile build-tile" data-era={def.era} data-locked={locked || undefined} data-active={active || undefined}>
      <button type="button" class="tile-pic" aria-label={`${def.name}：${def.desc}`} onClick={info}>
        <Thumb model={def.model} />
        {owned > 0 && (
          <span class="tile-count num">
            <Num value={owned} />
          </span>
        )}
        {def.near && <span class="tile-need">{COPY.build.need[def.near]}</span>}
        {(def.aura || def.blocks) && <span class="tile-effect">{COPY.aura.effect}</span>}
        <span class="tile-makes" aria-hidden="true">
          {def.spawns
            .filter((s) => !s.if)
            .map((s) => (
              <Thumb key={s.unit} model={s.unit} fill={0.85} />
            ))}
        </span>
      </button>
      <div class="tile-name">{def.name}</div>
      {locked ? (
        <div class="tile-lock">
          {locked === 'skill' ? COPY.build.skillLocked : locked === 'defected' ? COPY.build.defected : COPY.build.eraLocked(eraName(def.era))}
        </div>
      ) : (
        <button type="button" class="buy chunk" data-active={active || undefined} disabled={!g.running || (!active && (full || poor))} onClick={buy}>
          {active ? COPY.build.cancel : <Essence value={cost} />}
        </button>
      )}
    </div>
  );
}

// ── Skills ──────────────────────────────────────────────────────

function SkillTree() {
  frame.value;
  const [branch, setBranch] = useState<Branch>('general');
  const g = app.game;
  const count = (b: Branch) => skillsOfBranch(b).filter((s) => skillStatus(g.run, g.mods, s) === 'available' && s.cost <= g.run.essence).length;
  const order: Branch[] = ['general', ...BRANCHES.filter((b) => b !== 'general')];
  return (
    <>
      <div class="branches" role="tablist" aria-label="技能分支">
        {order.map((b) => {
          const n = count(b);
          return (
            <button type="button" role="tab" key={b} class="branch" data-cls={b} aria-selected={branch === b} onClick={() => setBranch(b)}>
              {BRANCH_NAMES[b]}
              {n > 0 && <span class="badge num">{n}</span>}
            </button>
          );
        })}
      </div>
      <BranchNodes branch={branch} />
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
  const affordable = status === 'available' && def.cost <= g.run.essence && g.running;
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
          <Essence value={def.cost} />
        </span>
      )}
      {status === 'locked' && need && <span class="need">{describeNeed(need)}</span>}
      {status === 'forkLocked' && <span class="need">{COPY.skills.forkLocked}</span>}
    </button>
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

