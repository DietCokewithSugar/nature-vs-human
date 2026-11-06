import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { D, formatDuration, formatNumber } from '../core/index.ts';
import credits from '../data/credits.json';
import { NICKNAME_MAX, type BoardKind, type BoardResult } from '../data/leaderboard.ts';
import { IconButton, Money, Segmented } from './common.tsx';
import { COPY } from './copy.ts';
import { IconClose } from './icons.tsx';
import { app, flash, floats, modal, pushToast, toasts } from './store.ts';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class="toast" data-era={t.era}>
          <div class="toast-title">{t.title}</div>
          {t.body && <div class="toast-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Floats() {
  return (
    <div class="floats" aria-hidden="true">
      {floats.value.map((f) => (
        <span key={f.id} class="float" style={{ left: `${f.x}px`, top: `${f.y}px` }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

export function Flash() {
  const n = flash.value;
  if (!n) return null;
  return <div key={n} class="flash" aria-hidden="true" />;
}

function Modal({ title, children, onClose, wide }: { title: string; children: ComponentChildren; onClose?: () => void; wide?: boolean }) {
  const close = onClose ?? (() => (modal.value = null));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header class="modal-head">
          <h2>{title}</h2>
          <IconButton label="关闭" class="icon-btn ghost" onClick={close}>
            <IconClose />
          </IconButton>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Modals() {
  switch (modal.value) {
    case 'leaderboard':
      return <LeaderboardModal />;
    case 'settings':
      return <SettingsModal />;
    case 'ending':
      return <EndingModal />;
    default:
      return null;
  }
}

// ── Leaderboard ─────────────────────────────────────────────────

function LeaderboardModal() {
  const lb = app.leaderboard;
  const [kind, setKind] = useState<BoardKind>('lifetime');
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(lb.online);
  const [name, setName] = useState(lb.nickname.value);

  useEffect(() => {
    if (!lb.online) return;
    let live = true;
    setLoading(true);
    void (async () => {
      await lb.submit(app.game.state, true);
      const res = await lb.fetch(kind);
      if (!live) return;
      setData(res);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [kind]);

  const show = (v: number) =>
    kind === 'lifetime' ? <Money value={D(10).pow(v)} /> : <span class="num">{formatDuration(v)}</span>;

  const saveName = async () => {
    const ok = await lb.setNickname(name, app.game.state);
    if (ok) {
      setName(lb.nickname.value);
      pushToast({ title: COPY.toast.nicknameSaved });
      if (lb.online) setData(await lb.fetch(kind));
    }
  };

  const rows = data?.top ?? [];
  const meOutside = data?.me && !rows.some((r) => r.me) ? data.me : null;

  return (
    <Modal title={COPY.leaderboard.title}>
      <Segmented
        label="榜单"
        value={kind}
        options={[
          { value: 'lifetime', label: COPY.leaderboard.lifetime },
          { value: 'speedrun', label: COPY.leaderboard.speedrun },
        ]}
        onChange={setKind}
      />
      <div class="card board">
        {!lb.online && <p class="empty">{COPY.leaderboard.offline}</p>}
        {lb.online && loading && <p class="empty">{COPY.leaderboard.loading}</p>}
        {lb.online && !loading && !data && <p class="empty">{COPY.leaderboard.offline}</p>}
        {lb.online && !loading && data && rows.length === 0 && <p class="empty">{COPY.leaderboard.empty}</p>}
        {rows.length > 0 && (
          <ol class="board-list">
            {rows.map((r) => (
              <li key={r.rank} class={r.me ? 'me' : ''} data-top={r.rank <= 3 ? r.rank : undefined}>
                <span class="rank num">{r.rank}</span>
                <span class="who">{r.nickname}</span>
                <span class="val">{show(r.value)}</span>
              </li>
            ))}
            {meOutside && (
              <li class="me gap">
                <span class="rank num">{meOutside.rank}</span>
                <span class="who">{meOutside.nickname}</span>
                <span class="val">{show(meOutside.value)}</span>
              </li>
            )}
          </ol>
        )}
      </div>
      <form
        class="card name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveName();
        }}
      >
        <label for="nickname">{COPY.leaderboard.nickname}</label>
        <input
          id="nickname"
          value={name}
          maxLength={NICKNAME_MAX}
          autoComplete="off"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn solid" disabled={!name.trim() || name === lb.nickname.value}>
          {COPY.leaderboard.save}
        </button>
      </form>
    </Modal>
  );
}

// ── Settings ────────────────────────────────────────────────────

function SettingsModal() {
  const s = app.settings.value;
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  if (showCredits) {
    return (
      <Modal title={COPY.settings.credits} onClose={() => setShowCredits(false)} wide>
        <div class="card credits">
          <h3>{COPY.settings.creditsModels}</h3>
          <p class="muted">
            <a href={credits.models.home} target="_blank" rel="noreferrer">
              {credits.models.author}
            </a>{' '}
            ·{' '}
            <a href={credits.models.licenseUrl} target="_blank" rel="noreferrer">
              {credits.models.license}
            </a>{' '}
            · 已压缩
          </p>
          <ul class="credit-list">
            {credits.models.items.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
          <h3>{COPY.settings.creditsOther}</h3>
          <ul class="credit-list plain">
            <li>ZCOOL KuaiLe · Fredoka — SIL OFL 1.1</li>
            <li>Radix Colors — MIT</li>
            <li>three.js · Preact · break_infinity.js · Supabase JS — MIT</li>
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={COPY.settings.title}>
      <div class="card settings">
        <div class="setting">
          <span>{COPY.settings.sound}</span>
          <Segmented
            label={COPY.settings.sound}
            value={s.muted ? 'off' : 'on'}
            options={[
              { value: 'on', label: COPY.settings.on },
              { value: 'off', label: COPY.settings.off },
            ]}
            onChange={(v) => app.updateSettings({ muted: v === 'off' })}
          />
        </div>
        <div class="setting">
          <span>{COPY.settings.quality}</span>
          <Segmented
            label={COPY.settings.quality}
            value={s.quality}
            options={[
              { value: 'high', label: COPY.settings.qualityHigh },
              { value: 'low', label: COPY.settings.qualityLow },
            ]}
            onChange={(v) => app.updateSettings({ quality: v })}
          />
        </div>
        <div class="setting">
          <span>{COPY.settings.save}</span>
          <div class="btn-row">
            <button
              type="button"
              class="btn"
              onClick={async () => {
                const code = app.exportSave();
                try {
                  await navigator.clipboard.writeText(code);
                } catch {
                  setText(code);
                  setImporting(true);
                }
                pushToast({ title: COPY.toast.exported });
              }}
            >
              {COPY.settings.export}
            </button>
            <button type="button" class="btn" onClick={() => setImporting((v) => !v)}>
              {COPY.settings.import}
            </button>
          </div>
        </div>
        {importing && (
          <div class="import">
            <textarea
              rows={3}
              placeholder={COPY.settings.importPlaceholder}
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
            <button
              type="button"
              class="btn solid"
              disabled={!text.trim()}
              onClick={() => {
                // A good save reloads the page; only a failure needs a message.
                if (!app.importSave(text)) pushToast({ title: COPY.toast.importFailed });
              }}
            >
              {COPY.settings.importConfirm}
            </button>
          </div>
        )}
      </div>
      <div class="card settings">
        <button type="button" class="btn link" onClick={() => setShowCredits(true)}>
          {COPY.settings.credits}
        </button>
        {!confirmReset ? (
          <button type="button" class="btn danger-soft" onClick={() => setConfirmReset(true)}>
            {COPY.settings.reset}
          </button>
        ) : (
          <div class="confirm">
            <span>{COPY.settings.resetConfirm}</span>
            <div class="btn-row">
              <button type="button" class="btn" onClick={() => setConfirmReset(false)}>
                {COPY.settings.cancel}
              </button>
              <button
                type="button"
                class="btn danger"
                onClick={() => app.resetSave()}
              >
                {COPY.settings.resetYes}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Ending ──────────────────────────────────────────────────────

function EndingModal() {
  const s = app.game.state;
  const close = () => {
    modal.value = null;
    app.onEndingClosed();
  };
  return (
    <Modal title={COPY.ending.title} onClose={close}>
      <p class="ending-body">{COPY.ending.body}</p>
      <dl class="card stats">
        <div>
          <dt>{COPY.ending.time}</dt>
          <dd class="num">{formatDuration(s.endedAt ?? s.playTime)}</dd>
        </div>
        <div>
          <dt>{COPY.ending.lifetime}</dt>
          <dd>
            <Money value={s.lifetimeEarned} />
          </dd>
        </div>
        <div>
          <dt>{COPY.ending.evolutions}</dt>
          <dd class="num">{formatNumber(s.evolutions)}</dd>
        </div>
      </dl>
      <button type="button" class="btn solid wide" onClick={close}>
        {COPY.ending.continue}
      </button>
    </Modal>
  );
}
