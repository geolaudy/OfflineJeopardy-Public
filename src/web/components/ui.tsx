import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { avatarEmoji, PLAYER_COLORS, readableOn, contrastRatio } from '../lib/avatars';
import type { ProfilePublic } from '../../shared/views';
import { tokens } from '../lib/api';
import { ArrowLeft, Heart, Menu, type LucideIcon } from 'lucide-react';

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

/** Shared page title row for dashboard pages: title (and optional subtitle) left, actions top-right. */
export function PageTitleBar({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-[1_1_16rem]">
        <h1 className="text-3xl font-black">{title}</h1>
        {subtitle ? <p className="mt-1 text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string; 'data-testid'?: string }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)} {...rest}>
      {children}
    </div>
  );
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

export function Avatar({ profile, size = 40, className, ring = true }: { profile?: Pick<ProfilePublic, 'name' | 'color' | 'avatar' | 'pictureUrl'> | null; size?: number; className?: string; ring?: boolean }) {
  const color = profile?.color ?? '#64748b';
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, background: color, boxShadow: ring ? `0 0 0 ${Math.max(2, size / 16)}px ${color}` : undefined }}
      aria-hidden
    >
      {profile?.pictureUrl ? (
        <img src={profile.pictureUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        // Centred in the circle (R4-12): a full-size flex box, so the glyph's own side bearings and
        // line box do not push it off-centre.
        <span className="flex h-full w-full items-center justify-center" style={{ fontSize: size * 0.58, lineHeight: 1, paddingTop: size * 0.03 }}>
          {avatarEmoji(profile?.avatar)}
        </span>
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

/** Keeps the latest callback without re-running effects when a parent passes a new inline function. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** Locks page scrolling behind overlays (prevents the background jumping on iOS). */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/**
 * R10-4: the part of the screen not covered by the on-screen keyboard. iOS Safari (and Chrome on
 * Android, which resizes only the visual viewport) leave a `fixed inset-0` overlay full height when
 * the keyboard opens, so a bottom sheet would sit under the keyboard. While `active`, returns the
 * visual viewport's top and height when it is smaller than the window (keyboard open), else null.
 */
export function useKeyboardViewport(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return setBox(null);
    const read = () => {
      const covered = window.innerHeight - vv.height > 80; // a keyboard, not a browser bar
      setBox((b) => (!covered ? null : b && b.top === vv.offsetTop && b.height === vv.height ? b : { top: vv.offsetTop, height: vv.height }));
    };
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, [active]);
  return box;
}

/** R10-4: keeps a focused field inside `ref` visible (after the keyboard has finished opening). */
function useKeepFocusVisible(ref: RefObject<HTMLElement | null>, active: boolean, dep: unknown) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const show = () => {
      const el = document.activeElement;
      // A field's own row (marked data-keep-visible) comes into view with it — e.g. its Save button.
      if (el instanceof HTMLElement && root.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) (el.closest('[data-keep-visible]') ?? el).scrollIntoView({ block: 'nearest' });
    };
    const t = window.setTimeout(show, 60);
    const onFocus = () => window.setTimeout(show, 300);
    root.addEventListener('focusin', onFocus);
    return () => {
      window.clearTimeout(t);
      root.removeEventListener('focusin', onFocus);
    };
  }, [ref, active, dep]);
}

export function Modal({ open, onClose, title, children, wide, vars }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; vars?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useLatest(onClose);
  useScrollLock(open);
  const kb = useKeyboardViewport(open);
  useKeepFocusVisible(ref, open, kb?.height);
  // Runs only when the dialog opens — NOT on every re-render. (It used to depend on the inline
  // onClose, so every live state update re-focused the first input and popped the iPad keyboard.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus],input,select,textarea,button:not([aria-label="Close"])');
    // On touch devices focus the dialog itself so the on-screen keyboard doesn't jump up uninvited.
    if (isTouch() && first && /^(INPUT|TEXTAREA|SELECT)$/.test(first.tagName)) ref.current?.focus();
    else (first ?? ref.current)?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  if (!open) return null;
  // Rendered at the end of the page (R10-6): a dialog opened from inside the game preview is never
  // confined to it or stacked under its controls. `vars` carries theme variables along.
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      // R10-4: with the keyboard open the overlay covers only the visible part of the screen, so
      // the sheet (and its Save / Cancel) sits right above the keyboard.
      style={{ ...vars, paddingTop: 'max(env(safe-area-inset-top), 12px)', ...(kb ? { top: kb.top, bottom: 'auto', height: kb.height } : {}) }}
      data-keyboard={kb ? 'open' : undefined}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Height is bounded by the *visible* viewport (dvh) so the title and close button can never
          end up above the top of the screen on iPhone Safari; the body scrolls inside. */}
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('safe-x flex max-h-[calc(100dvh-max(env(safe-area-inset-top),12px))] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}
        style={kb ? { maxHeight: `calc(${kb.height}px - max(env(safe-area-inset-top), 12px))` } : undefined}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only (for index routes). */
  end?: boolean;
  testId?: string;
}

/** Slide-in navigation drawer used by the phone portal, the host controller and the narrow desktop. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useLatest(onClose);
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('a,button')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 bg-slate-900/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <nav
        ref={ref}
        aria-label="Main menu"
        className="drawer-panel safe-top safe-bottom flex h-full w-[min(20rem,85vw)] flex-col bg-white shadow-2xl"
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100" aria-label="Close menu">
            ×
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 p-2">{children}</div>
      </nav>
    </div>
  );
}

/** Consistent top bar: back arrow (sub-pages) or menu button, page title, optional right slot. */
export function PageHeader({ title, subtitle, onBack, onMenu, right, testId }: { title: ReactNode; subtitle?: ReactNode; onBack?: () => void; onMenu?: () => void; right?: ReactNode; testId?: string }) {
  return (
    <header className="safe-top safe-x z-20 shrink-0 border-b border-slate-200 bg-white">
      <div className="flex min-h-14 items-center gap-1 px-2">
        {onBack ? (
          <button onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-700 hover:bg-slate-100 active:bg-slate-200" aria-label="Back" data-testid="nav-back">
            <ArrowLeft size={22} aria-hidden />
          </button>
        ) : onMenu ? (
          <button onClick={onMenu} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-700 hover:bg-slate-100 active:bg-slate-200" aria-label="Open menu" data-testid="nav-menu">
            <Menu size={22} aria-hidden />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-lg leading-tight font-bold" data-testid={testId ?? 'page-title'}>
            {title}
          </h1>
          {subtitle ? <div className="truncate text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {right}
      </div>
    </header>
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

export function QrImage({ target, className, refreshKey }: { target: 'join' | 'host' | 'board' | 'hostPair'; className?: string; refreshKey?: unknown }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () =>
      // The host pairing QR contains the temporary lobby code, so it needs the host session.
      fetch(`/api/qr?target=${target}`, { headers: target === 'hostPair' && tokens.host ? { authorization: `Bearer ${tokens.host}` } : {} })
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => alive && setSvg(t))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000); // IP address may change (Wi-Fi switch)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [target, refreshKey]);
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

/** Survival mode: lives left as hearts (a number for long lives lists). */
export function Lives({ lives, max, size = 14, className }: { lives: number; max: number; size?: number; className?: string }) {
  const label = lives > 0 ? `${lives} of ${max} ${max === 1 ? 'life' : 'lives'} left` : 'Out of lives';
  return (
    <span className={cx('inline-flex items-center gap-[0.15em] text-rose-500', className)} role="img" aria-label={label} title={label} data-testid="lives" data-lives={lives}>
      {max > 6 ? (
        <>
          <Heart size={size} className="fill-current" aria-hidden />
          <span className="font-bold tabular-nums">
            {lives}/{max}
          </span>
        </>
      ) : (
        Array.from({ length: max }).map((_, i) => <Heart key={i} size={size} className={i < lives ? 'fill-current' : 'opacity-35'} aria-hidden />)
      )}
    </span>
  );
}
