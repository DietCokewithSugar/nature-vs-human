import { useEffect, useState } from 'preact/hooks';
import { PICK_BY_ID, TALENTS, TALENT_IDS, formatNumber, type PickDef } from '../core/index.ts';
import type { BoardResult } from '../data/leaderboard.ts';
import { Modal, Pic } from './common.tsx';
import { COPY } from './copy.ts';
import { app, frame, modal } from './store.ts';

/** Whatever is open: the pick and the end of a run come from the game; the rest from the menu. */
export function Modals() {
  frame.value;
  const phase = app.game.run.phase;
  if (phase === 'pick') return <PickModal />;
  if (phase === 'over') return <OverModal />;
  switch (modal.value) {
    case 'help':
      return <HelpModal />;
    case 'settings':
      return <SettingsModal />;
    case 'leaderboard':
      return <BoardModal />;
    case 'giveUp':
      return <GiveUpModal />;
    default:
      return null;
  }
}

const PICK_ICON: Record<PickDef['group'], string> = { species: 'icon/atk', chain: 'icon/grass', all: 'icon/level' };

function PickModal() {
  const game = app.game;
  const run = game.run;
  return (
    <div class="scrim">
      <div class="modal pick" role="dialog" aria-label={COPY.pick.title(run.stage)}>
        <header>
          <h2>{COPY.pick.title(run.stage)}</h2>
        </header>
        <p class="sub">{COPY.pick.sub}</p>
        <div class="pick-cards">
          {run.offer.map((id) => {
            const p = PICK_BY_ID[id];
            if (!p) return null;
            const pic = p.about ? `unit/${p.about}/walk0` : PICK_ICON[p.group];
            return (
              <button
                type="button"
                class="pick-card"
                data-group={p.group}
                onClick={() => {
                  game.choosePick(id);
                  app.sfx.evolve();
                }}
              >
                <small class="pick-group">{COPY.pick.groups[p.group]}</small>
                <Pic k={pic} scale={p.about ? 2 : 4} class="pick-pic" />
                <b>{p.name}</b>
                <span>{p.desc}</span>
              </button>
            );
          })}
        </div>
        {run.rerolls > 0 && (
          <button
            type="button"
            class="btn plain"
            onClick={() => {
              game.reroll();
              app.sfx.click();
            }}
          >
            {COPY.pick.reroll(run.rerolls)}
          </button>
        )}
      </div>
    </div>
  );
}

function OverModal() {
  const game = app.game;
  const run = game.run;
  const meta = game.state.meta;
  const r = run.result;
  if (!r) return null;
  return (
    <div class="scrim">
      <div class="modal wide over" role="dialog" aria-label={r.cause === 'fell' ? COPY.over.fell : COPY.over.returned}>
        <header>
          <h2>{r.cause === 'fell' ? COPY.over.fell : COPY.over.returned}</h2>
        </header>
        <div class="over-sum">
          <span>{COPY.over.reached(r.stage)}</span>
          <span>{COPY.over.cleared(r.cleared)}</span>
          <b class="genes">
            <Pic k="icon/gene" /> {COPY.over.genes(r.genes)}
          </b>
          <small class="muted">{COPY.over.stats(run.stats.kills, run.stats.losses + run.stats.starved, run.stats.razed)}</small>
        </div>
        <h3>
          {COPY.over.talents} · {COPY.over.bank(meta.genes)}
        </h3>
        <div class="talents">
          {TALENT_IDS.map((id) => {
            const t = TALENTS[id];
            const lv = meta.talents[id];
            const max = lv >= t.max;
            const cost = game.talentCost(id);
            const afford = !max && meta.genes >= cost;
            return (
              <div class="talent">
                <b>
                  {t.name} <span class="lv">Lv{lv}</span>
                </b>
                <small>{t.desc(lv + (max ? 0 : 1))}</small>
                <button
                  type="button"
                  class={`btn ${afford ? 'gold' : 'grey'} small`}
                  disabled={max}
                  onClick={() => {
                    if (game.buyTalent(id)) app.sfx.upgrade();
                    else app.sfx.deny();
                  }}
                >
                  {max ? COPY.over.max : (
                    <>
                      <Pic k="icon/gene" scale={1} /> {cost}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          class="btn green big"
          onClick={() => {
            game.startRun();
            app.sfx.era();
          }}
        >
          {COPY.over.again}
        </button>
      </div>
    </div>
  );
}

function HelpModal() {
  return (
    <Modal title={COPY.help.title} onClose={() => (modal.value = null)}>
      <ol class="help">
        {COPY.help.lines.map((l) => (
          <li>{l}</li>
        ))}
      </ol>
      <button type="button" class="btn green big" onClick={() => (modal.value = null)}>
        {COPY.help.ok}
      </button>
    </Modal>
  );
}

function GiveUpModal() {
  const genes = app.game.genesNow();
  return (
    <Modal title={COPY.menu.giveUp} onClose={() => (modal.value = null)}>
      <p>{COPY.menu.giveUpConfirm(genes)}</p>
      <div class="row gap">
        <button
          type="button"
          class="btn red"
          onClick={() => {
            app.game.endRun('returned');
            modal.value = null;
          }}
        >
          {COPY.menu.yes}
        </button>
        <button type="button" class="btn plain" onClick={() => (modal.value = null)}>
          {COPY.menu.no}
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal() {
  const s = app.settings.value;
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title={COPY.settings.title} onClose={() => (modal.value = null)}>
      <div class="row between">
        <span>{COPY.settings.sound}</span>
        <div class="seg">
          <button type="button" class={!s.muted ? 'on' : ''} onClick={() => app.updateSettings({ muted: false })}>
            {COPY.settings.on}
          </button>
          <button type="button" class={s.muted ? 'on' : ''} onClick={() => app.updateSettings({ muted: true })}>
            {COPY.settings.off}
          </button>
        </div>
      </div>
      <h3>{COPY.settings.save}</h3>
      <textarea rows={3} value={text} placeholder={COPY.settings.importHint} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="row gap">
        <button
          type="button"
          class="btn plain small"
          onClick={() => {
            setText(app.exportSave());
            setNote(COPY.settings.exportHint);
          }}
        >
          {COPY.settings.export}
        </button>
        <button type="button" class="btn plain small" onClick={() => setNote(app.importSave(text) ? COPY.settings.imported : COPY.settings.importFailed)}>
          {COPY.settings.import}
        </button>
        <button type="button" class="btn red small" onClick={() => confirm(COPY.settings.resetConfirm) && app.resetSave()}>
          {COPY.settings.reset}
        </button>
      </div>
      {note && <p class="muted">{note}</p>}
      <h3>{COPY.settings.credits}</h3>
      <p class="muted">{COPY.settings.creditsBody}</p>
    </Modal>
  );
}

function BoardModal() {
  const lb = app.leaderboard;
  const [res, setRes] = useState<BoardResult | null>(null);
  const [name, setName] = useState(lb.nickname.value);
  useEffect(() => {
    void lb.fetch().then(setRes);
  }, []);
  return (
    <Modal title={COPY.board.title} onClose={() => (modal.value = null)}>
      {!lb.online ? (
        <p class="muted">{COPY.board.offline}</p>
      ) : (
        <>
          <div class="row gap">
            <input value={name} maxLength={20} aria-label={COPY.board.nickname} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <button type="button" class="btn plain small" onClick={() => void lb.setNickname(name, app.game.state).then(() => lb.fetch().then(setRes))}>
              {COPY.board.save}
            </button>
          </div>
          <h3>{COPY.board.best}</h3>
          {res && res.top.length === 0 && <p class="muted">{COPY.board.empty}</p>}
          <ol class="board">
            {res?.top.map((e) => (
              <li data-me={e.me || undefined}>
                <span class="num">{e.rank}</span>
                <span>{e.nickname}</span>
                <span class="num">{COPY.board.stage(e.value)}</span>
              </li>
            ))}
            {res?.me && !res.top.some((e) => e.me) && (
              <li data-me>
                <span class="num">{formatNumber(res.me.rank)}</span>
                <span>{res.me.nickname}</span>
                <span class="num">{COPY.board.stage(res.me.value)}</span>
              </li>
            )}
          </ol>
        </>
      )}
    </Modal>
  );
}
