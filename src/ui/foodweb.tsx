import {
  BALANCE,
  BUILDINGS,
  NATURE_UNIT_IDS,
  UNITS,
  famished,
  isFull,
  predatorsOf,
  trophicOf,
  type NatureUnitId,
  type RunState,
  type Trophic,
  type UnitId,
} from '../core/index.ts';
import { Modal, Pic } from './common.tsx';
import { COPY } from './copy.ts';
import { app, frame, modal } from './store.ts';

const F = COPY.food;

function names(ids: readonly UnitId[], joiner = '、'): string {
  return ids.map((id) => UNITS[id].name).join(joiner);
}

/** "吃鹿 · 天敌：狼、剑齿虎" for a species. */
export function chainText(id: UnitId): string {
  const prey = UNITS[id].prey ?? [];
  const by = predatorsOf(id);
  const eats = prey.length ? F.eats(names(prey)) : UNITS[id].diet === 'grass' ? F.grass : '';
  return [eats, by.length ? F.eatenBy(names(by)) : F.noEnemy].filter(Boolean).join(' · ');
}

/** A predator whose prey is nowhere: none alive and no nest making them. */
export function missingPrey(run: RunState, id: UnitId): NatureUnitId[] | null {
  const prey = UNITS[id].prey;
  if (!prey) return null;
  const have = (p: NatureUnitId) => run.units.some((u) => u.kind === p) || run.buildings.some((b) => b.side === 'nature' && BUILDINGS[b.kind].makes === p && !BUILDINGS[b.kind].main);
  return prey.some(have) ? null : prey;
}

/** The level of a species as a coloured chip. */
export function LevelChip({ id }: { id: UnitId }) {
  const level = trophicOf(id);
  if (!level) return null;
  return (
    <span class="trophic" data-level={level} title={F.levelHint[level]}>
      {F.level[level]}
    </span>
  );
}

/** One line for a card: the level, what it eats, who eats it, and a warning when its prey is missing. */
export function ChainLine({ id }: { id: UnitId }) {
  const run = app.game.run;
  const missing = missingPrey(run, id);
  return (
    <span class="chain-line">
      <LevelChip id={id} />
      <small>{chainText(id)}</small>
      {missing && (
        <span class="trophic" data-level="missing" title={F.noPreyHint(names(missing, F.or))}>
          {F.noPrey}
        </span>
      )}
    </span>
  );
}

const ORDER: Trophic[] = ['apex', 'middle', 'provider', 'grazer'];

/** The whole food web: every species by level, what it eats and who eats it, and how they're doing now. */
export function FoodWebModal() {
  frame.value;
  const run = app.game.run;
  const H = BALANCE.hunt;
  const rules = F.rules({
    appetite: H.appetite,
    flee: Math.round(H.flee * 100),
    heal: H.heal,
    fullFor: H.fullFor,
    fullAtk: Math.round((H.fullAtk - 1) * 100),
    hungryAfter: H.hungryAfter,
    hungryAtk: Math.round((1 - H.hungryAtk) * 100),
    starveAfter: H.starveAfter,
  });
  const species = ORDER.flatMap((level) => NATURE_UNIT_IDS.filter((id) => trophicOf(id) === level));
  return (
    <Modal title={F.title} onClose={() => (modal.value = null)} wide>
      <div class="web">
        {species.map((id) => {
          const def = UNITS[id];
          const mine = run.units.filter((u) => u.kind === id);
          const full = mine.filter((u) => isFull(run, u)).length;
          const hungry = mine.filter((u) => u.hungry || famished(run, u)).length;
          const prey = def.prey ?? [];
          const by = predatorsOf(id);
          const missing = missingPrey(run, id);
          return (
            <div class="web-row" data-level={trophicOf(id)}>
              <Pic k={`unit/${id}/walk0`} scale={2} class="web-pic" />
              <div class="web-text">
                <b>
                  {def.name} <LevelChip id={id} />
                  {missing && (
                    <span class="trophic" data-level="missing" title={F.noPreyHint(names(missing, F.or))}>
                      {F.noPrey}
                    </span>
                  )}
                </b>
                <span class="web-links">
                  <span class="web-eats">
                    {prey.length ? (
                      <>
                        吃
                        {prey.map((p) => (
                          <Pic k={`unit/${p}/walk0`} scale={1} alt={UNITS[p].name} />
                        ))}
                        {names(prey)}
                      </>
                    ) : (
                      <>
                        <Pic k="icon/grass" scale={1} />
                        {F.grass}
                      </>
                    )}
                  </span>
                  <span class="web-by" data-none={by.length === 0 || undefined}>
                    {by.length ? (
                      <>
                        {F.eatenBy('')}
                        {by.map((p) => (
                          <Pic k={`unit/${p}/walk0`} scale={1} alt={UNITS[p].name} />
                        ))}
                        {names(by)}
                      </>
                    ) : (
                      F.noEnemy
                    )}
                  </span>
                </span>
                <small class="muted num">
                  {F.field(mine.length)}
                  {prey.length > 0 && ` · ${F.full(full)} · ${F.hungry(hungry)}`}
                </small>
              </div>
            </div>
          );
        })}
      </div>
      <ol class="help">
        {rules.map((l) => (
          <li>{l}</li>
        ))}
      </ol>
    </Modal>
  );
}
