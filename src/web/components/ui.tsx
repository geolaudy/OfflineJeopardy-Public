import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { create } from 'zustand';
import { avatarEmoji, PLAYER_COLORS, readableOn, contrastRatio } from '../lib/avatars';
import type { ProfilePublic } from '../../shared/views';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
  success: 'bg-green-700 text-white hover:bg-green-800 active:bg-green-900',
  warning: 'bg-amber-500 text-black hover:bg-amber-400',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; busy?: boolean }) {
  const sizes = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-base', lg: 'min-h-14 px-5 text-lg', xl: 'min-h-20 px-6 text-2xl' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTS[variant],
        sizes[size],
        className,
      )}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

/** Button that guards against accidental double submissions while an async action runs. */
export function ActionButton({ onAction, ...rest }: Omit<Parameters<typeof Button>[0], 'onClick'> & { onAction: () => Promise<unknown> | unknown }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...rest}
      busy={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await onAction();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
}

let fieldSeq = 0;
/** Labelled form field. Use `group` when the field holds several controls (button groups, pickers):
 *  a <label> would otherwise name only its first control. */
export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  const [id] = useState(() => `field-${++fieldSeq}`);
  if (group)
    return (
      <div role="group" aria-labelledby={id}>
        <span id={id} className="mb-1 block text-sm font-semibold text-slate-700">
          {label}
        </span>
        {children}
        {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      </div>
    );
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200';

export function Avatar({ profile, size = 40, className }: { profile?: Pick<ProfilePublic, 'name' | 'color' | 'avatar' | 'pictureUrl'> | null; size?: number; className?: string }) {
  const color = profile?.color ?? '#64748b';
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 0 ${Math.max(2, size / 16)}px ${color}` }}
      aria-hidden
    >
      {profile?.pictureUrl ? (
        <img src={profile.pictureUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span style={{ fontSize: size * 0.58, lineHeight: 1 }}>{avatarEmoji(profile?.avatar)}</span>
      )}
    </span>
  );
}

export function ColorPicker({ value, onChange, colors = PLAYER_COLORS }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  const lowContrast = contrastRatio(value, '#ffffff') < 3 && contrastRatio(value, '#000000') < 3;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c.toLowerCase() === value.toLowerCase()}
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            className={cx('h-11 w-11 rounded-full border-4 transition', c.toLowerCase() === value.toLowerCase() ? 'border-slate-900 scale-110' : 'border-white')}
            style={{ background: c, boxShadow: '0 0 0 1px #cbd5e1' }}
          />
        ))}
        <label className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-slate-400 text-xs font-bold text-slate-600" title="Custom color">
          +
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom color" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="rounded-lg px-3 py-1 font-semibold" style={{ background: value, color: readableOn(value) }}>
          Preview
        </span>
        {lowContrast ? <span className="text-amber-700">This color is hard to read — try a darker one.</span> : null}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,button,select,textarea')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- toasts ----------
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = toastId++;
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), kind === 'error' ? 5000 : 2500);
}
export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-lg',
            t.kind === 'error' ? 'bg-red-700 text-white' : t.kind === 'success' ? 'bg-green-700 text-white' : 'bg-slate-900 text-white',
          )}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- PIN pad ----------
export function PinPad({ onComplete, busy, label = 'Enter PIN', error }: { onComplete: (pin: string) => void; busy?: boolean; label?: string; error?: string | null }) {
  const [pin, setPin] = useState('');
  useEffect(() => {
    if (error) setPin('');
  }, [error]);
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    if (next.length === 4) {
      // Clear immediately so a quick retry after a wrong PIN starts from an empty pad.
      setPin('');
      onComplete(next);
    } else setPin(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="mx-auto w-full max-w-xs">
      <p className="mb-3 text-center font-semibold text-slate-700">{label}</p>
      <div className="mb-3 flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`} data-testid="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-4 w-4 rounded-full border-2 border-slate-700', i < pin.length && 'bg-slate-700')} />
        ))}
      </div>
      <p className="mb-2 min-h-5 text-center text-sm font-semibold text-red-700" role="alert">
        {error ?? ''}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-2xl bg-slate-100 text-2xl font-bold active:bg-slate-300" aria-label={d}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} className="h-16 rounded-2xl bg-slate-100 text-2xl font-bold active:bg-slate-300" aria-label="0">
          0
        </button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-2xl text-lg font-semibold text-slate-600 active:bg-slate-200" aria-label="Delete">
          ⌫
        </button>
      </div>
    </div>
  );
}

export function QrImage({ target, className }: { target: 'join' | 'host' | 'board'; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/qr?target=${target}`)
        .then((r) => r.text())
        .then((t) => alive && setSvg(t))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000); // IP address may change (Wi-Fi switch)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [target]);
  return <div className={cx('aspect-square bg-white [&>svg]:h-full [&>svg]:w-full', className)} role="img" aria-label={`QR code for ${target} page`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center text-slate-600">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function ConnectionBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    open: ['bg-green-600', 'Connected'],
    connecting: ['bg-amber-500', 'Connecting…'],
    reconnecting: ['bg-amber-500', 'Reconnecting…'],
    unauthorized: ['bg-red-600', 'Not signed in'],
  };
  const [c, t] = map[status] ?? map.connecting;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium" role="status">
      <span className={cx('h-2.5 w-2.5 rounded-full', c)} />
      {t}
    </span>
  );
}

export function fmtScore(n: number) {
  return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString();
}

export function pct(n: number | null | undefined) {
  return n == null ? '—' : `${Math.round(n * 1000) / 10}%`;
}
