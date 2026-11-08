import type { ComponentChildren } from 'preact';
import { formatNumber } from '../core/index.ts';
import { atlasReady, frameUrl } from '../pixel/atlas.ts';

/** A frame from the sprite atlas as a crisp image. */
export function Pic({ k, scale = 2, class: cls, alt = '' }: { k: string; scale?: number; class?: string; alt?: string }) {
  atlasReady.value;
  const src = frameUrl(k, scale);
  return <span class={`pic ${cls ?? ''}`}>{src && <img src={src} alt={alt} draggable={false} />}</span>;
}

export function Num({ v }: { v: number }) {
  return <span class="num">{formatNumber(Math.floor(v))}</span>;
}

/** 生机 with its icon. */
export function Essence({ v }: { v: number }) {
  return (
    <span class="essence">
      <Pic k="icon/essence" />
      <Num v={v} />
    </span>
  );
}

/** A small pixel meter. */
export function Bar({ value, tone, label }: { value: number; tone: 'nature' | 'human' | 'grass' | 'meat' | 'gold'; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span class="bar" data-tone={tone} role="meter" aria-label={label} aria-valuenow={Math.round(v * 100)}>
      <i style={{ width: `${v * 100}%` }} />
    </span>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ComponentChildren; onClose?: () => void; wide?: boolean }) {
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          {onClose && (
            <button type="button" class="close" aria-label="关闭" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function fmt(n: number, digits = 1): string {
  if (Math.abs(n) >= 100) return formatNumber(Math.round(n));
  const p = Math.pow(10, digits);
  return String(Math.round(n * p) / p);
}
