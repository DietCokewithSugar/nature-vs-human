import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatNumber, type DecimalSource } from '../core/index.ts';
import { thumbnail } from '../scene/thumbnails.ts';

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

/** "$1.23M" with an optically raised, slightly smaller dollar sign. */
export function Money({ value, class: cls }: { value: DecimalSource; class?: string }) {
  return (
    <span class={`money-text ${cls ?? ''}`}>
      <span class="cur">$</span>
      <Num value={value} />
    </span>
  );
}

export function Thumb({ model, size = 40 }: { model: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    thumbnail(model)
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [model]);
  return (
    <span class="thumb" style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} draggable={false} />}
    </span>
  );
}

export function IconButton(
  props: JSX.HTMLAttributes<HTMLButtonElement> & { label: string; children: ComponentChildren },
) {
  const { label, children, ...rest } = props;
  return (
    <button type="button" class="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

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
