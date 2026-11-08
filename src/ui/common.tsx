import { useEffect, useState } from 'preact/hooks';
import { formatNumber, type DecimalSource } from '../core/index.ts';
import { LOOK } from '../shell/look.ts';

export interface ThumbOptions {
  /** Keep only the top part of the picture (0–1 of its height): 0.5 frames a person as a bust. */
  crop?: number;
  /** How much of the square the silhouette fills. */
  fill?: number;
}

/** Pixel sprites, or 3D renders when the old look is on (three.js loads only then). */
const thumbnail = (model: string, opts: ThumbOptions): Promise<string> =>
  LOOK === '3d' ? import('../scene/thumbnails.ts').then((m) => m.thumbnail(model, opts)) : import('../pixel/thumbs.ts').then((m) => m.thumbnail(model, opts));

/**
 * A short-scale number whose suffix ("Oc", "Qa") is set in the UI face:
 * rounded number fonts draw O and 0 alike, so "3Oc" would read as "30c".
 */
export function Num({ value }: { value: DecimalSource }) {
  const text = formatNumber(value);
  const m = /^(-?[\d.]+)([A-Za-z]+)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span class="sfx">{m[2]}</span>
    </>
  );
}

/** An amount of 自然之元: a small green orb and the number. */
export function Essence({ value, class: cls }: { value: DecimalSource; class?: string }) {
  return (
    <span class={`money-text ${cls ?? ''}`}>
      <span class="orb" aria-hidden="true" />
      <Num value={value} />
    </span>
  );
}

/** A labelled bar: HP in red, lifespan in white, construction in gold. */
export function Meter({ label, value, kind, text }: { label: string; value: number; kind: 'hp' | 'life' | 'build'; text?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div class="meter" data-kind={kind} role="meter" aria-label={label} aria-valuenow={Math.round(v * 100)}>
      <span class="meter-label">{label}</span>
      <span class="meter-track">
        <i style={{ transform: `scaleX(${Math.max(0.005, v)})` }} />
      </span>
      <span class="meter-val num">{text ?? `${Math.round(v * 100)}%`}</span>
    </div>
  );
}

/** A model rendered to a transparent picture. Sized by CSS. */
export function Thumb({ model, crop, fill, class: cls }: { model: string; class?: string } & ThumbOptions) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    thumbnail(model, { crop, fill })
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [model, crop, fill]);
  return <span class={`thumb ${cls ?? ''}`}>{src && <img src={src} alt="" draggable={false} data-pixel={LOOK === 'pixel' || undefined} />}</span>;
}

/** The scientist stands for the humans' research wherever it shows up. */
export const SCIENTIST = { model: 'scientist', crop: 0.42 } as const;

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="tab"
          aria-selected={o.value === value}
          class={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" class="close" aria-label="关闭" onClick={onClick}>
      <span aria-hidden="true">×</span>
    </button>
  );
}
