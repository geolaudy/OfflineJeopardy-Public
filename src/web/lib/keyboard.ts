// R16-4 … R16-6: one tracker for the on-screen keyboard, shared by every text field of the app.
//
// iOS Safari (and Chrome on Android) keep the layout viewport — what `position: fixed; inset: 0`
// fills — full height while the keyboard is open; only the visual viewport shrinks. A fixed shell
// (.app-screen) or dialog overlay therefore runs on under the keyboard, and a field near its bottom
// is hidden. Rounds 7 / 10 told "keyboard" from "no keyboard" by comparing the visual viewport with
// window.innerHeight — but WebKit reports innerHeight from the visible area, so on real iPhones /
// iPads the two could match with the keyboard open: the nickname sheet was not lifted and the
// document scroll reset (viewport.ts) undid Safari's own scroll to the field, which then sank under
// the keyboard (worse when the field started low, e.g. the lobby's Wi-Fi form with its column
// scrolled to the top).
//
// Here the keyboard counts as open while a text field has focus and the visual viewport is clearly
// shorter than the tallest it has been at this width (the baseline: not innerHeight). While it is
// open, <html data-keyboard="open"> and --vv-top / --vv-height (the visible area) let the app shell
// and the dialogs shrink to the part above the keyboard (styles.css), and the focused field — with
// its row, [data-keep-visible] — is scrolled into view inside its own scroll areas. The document
// itself is never scrolled for it. Pinch zoom (R15-30, K60) is not a keyboard: while zoomed nothing
// changes, so panning a zoomed page cannot move anything.

type KeyboardState = { open: boolean; top: number; height: number };

const CLOSED: KeyboardState = { open: false, top: 0, height: 0 };
/** How much shorter than the baseline the visible area must be: more than Safari's bars, less than any keyboard. */
const MIN_KEYBOARD = 120;

let state: KeyboardState = CLOSED;
const listeners = new Set<() => void>();
let started = false;

const TEXT_INPUTS = /^(text|search|email|url|tel|password|number|date|datetime-local|month|time|week)$/;

/** A field that brings up the on-screen keyboard. */
export function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUTS.test((el as HTMLInputElement).type || 'text');
}

export function keyboardState() {
  return state;
}

export function subscribeKeyboard(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function scrollable(el: HTMLElement) {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === 'auto' || oy === 'scroll';
}

/**
 * Brings `el` (or its row, [data-keep-visible]) into view inside its scroll areas and the visible
 * part of the screen, nearest edge first. Unlike scrollIntoView it never scrolls the document
 * (Safari measures that against the layout viewport, under the keyboard) — only the elements in
 * between, which the shell has already fitted above the keyboard.
 */
export function revealField(el: HTMLElement, margin = 12) {
  const target = el.closest<HTMLElement>('[data-keep-visible]') ?? el;
  const vv = window.visualViewport;
  const screenTop = vv && state.open ? vv.offsetTop : 0;
  const screenBottom = vv && state.open ? vv.offsetTop + vv.height : window.innerHeight;
  for (let p = target.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (!scrollable(p)) continue;
    const box = p.getBoundingClientRect();
    const top = Math.max(box.top, screenTop) + margin;
    const bottom = Math.min(box.bottom, screenBottom) - margin;
    const r = target.getBoundingClientRect();
    // A row taller than the room: its focused field matters most.
    const rr = r.height > bottom - top ? el.getBoundingClientRect() : r;
    if (rr.bottom > bottom) p.scrollTop += Math.min(rr.bottom - bottom, rr.top - top);
    else if (rr.top < top) p.scrollTop -= top - rr.top;
  }
}

// ---------- R17-5: the scroll guard ----------
//
// The owner's iPad (rc.3) still lost the lobby's Wi-Fi field: with the left column scrolled a little,
// tapping the field opened the keyboard, the column jumped back to its top and the field sat under
// the keyboard. Nothing in the app sets that column's scroll (no remount, no height-dependent
// layout); the jump comes from WebKit itself, which reveals a focused field in its scroll areas
// once the keyboard has finished opening — after the tracker's own reveal, and for a field inside a
// position: fixed shell with the wrong coordinates. A single reveal when the keyboard opens cannot
// win against a later scroll, so while a field has the keyboard:
//   - the scroll positions of its scroll areas are remembered when it gets focus (before anything
//     moves),
//   - a scroll of one of them that the user did not make (no finger drag, wheel or key in the last
//     moment) and that leaves the field out of sight is undone: the remembered position comes back
//     and the field is revealed from there, nearest edge first,
//   - when the keyboard closes, the scroll areas return to where they were before it opened —
//     unless the user scrolled them meanwhile.
// Pinch zoom (K60) still changes nothing.

type Session = { field: HTMLElement; saved: Map<HTMLElement, number>; userScrolled: boolean; fixes: number[]; keyboard: boolean; shell: HTMLElement | null };
let session: Session | null = null;
/** Scroll positions the app set itself (their scroll events are not "someone else's"). */
const ours = new Map<HTMLElement, number>();
let lastUserScroll = -Infinity;
let touching = false;

/** The elements that scroll (or could, once the shell shrinks) between `el` and the page. */
function scrollParents(el: HTMLElement) {
  const out: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') out.push(p);
  }
  return out;
}

/** Is the field (with its row) out of sight: outside a scroll area or the visible part of the screen? */
export function fieldHidden(el: HTMLElement) {
  const vv = window.visualViewport;
  const screenTop = vv && state.open ? vv.offsetTop : 0;
  const screenBottom = vv && state.open ? vv.offsetTop + vv.height : window.innerHeight;
  const r = el.getBoundingClientRect();
  if (r.top < screenTop - 1 || r.bottom > screenBottom + 1) return true;
  return scrollParents(el).some((p) => {
    const b = p.getBoundingClientRect();
    return r.top < b.top - 1 || r.bottom > b.bottom + 1;
  });
}

function setScroll(p: HTMLElement, top: number) {
  p.scrollTop = top;
  ours.set(p, p.scrollTop);
}

function reveal(el: HTMLElement) {
  revealField(el);
  for (const p of scrollParents(el)) ours.set(p, p.scrollTop);
}

function begin(field: HTMLElement) {
  if (session?.field === field) return;
  // Moving to the next field keeps the positions from before the keyboard opened.
  const saved = session?.saved ?? new Map<HTMLElement, number>();
  for (const p of scrollParents(field)) if (!saved.has(p)) saved.set(p, p.scrollTop);
  // The app shell fitted above the keyboard (styles.css [data-kb-shell]): the one around the field —
  // not for a dialog (it lifts itself) or a lifted screen ([data-kb-lift]). It stays marked until the
  // keyboard has closed, not just until the field loses focus: a tap on Submit blurs the field first,
  // and a shell growing back mid-tap moved the button away from the finger (the tap missed).
  const shell = field.closest<HTMLElement>('[data-kb-lift]') ? null : field.closest<HTMLElement>('.app-screen');
  if (session?.shell && session.shell !== shell) delete session.shell.dataset.kbShell;
  if (shell) shell.dataset.kbShell = '';
  session = { field, saved, userScrolled: session?.userScrolled ?? false, fixes: [], keyboard: (session?.keyboard ?? false) || state.open, shell };
  debugLog('focus', describe(field));
}

function end() {
  const s = session;
  session = null;
  if (!s) return;
  if (s.shell) delete s.shell.dataset.kbShell;
  debugLog('keyboard closed', s.userScrolled ? 'user scrolled: kept' : 'restored');
  // Back to where the user left the page, once the shell has its full height again (only after an
  // on-screen keyboard: a field focused with a mouse or Tab on a computer changes nothing).
  if (s.keyboard && !s.userScrolled) requestAnimationFrame(() => s.saved.forEach((top, p) => p.isConnected && setScroll(p, top)));
}

function onScroll(e: Event) {
  const t = e.target;
  if (!session || !(t instanceof HTMLElement) || !t.contains(session.field)) return;
  if (ours.get(t) === t.scrollTop) return;
  const user = touching || performance.now() - lastUserScroll < 1200;
  debugLog(user ? 'scroll (user)' : 'scroll (not the user)', `${describe(t)} → ${Math.round(t.scrollTop)}`);
  if (user) {
    session.userScrolled = true;
    return;
  }
  const s = session;
  requestAnimationFrame(() => {
    if (session !== s || !state.open || !isTextField(document.activeElement) || (window.visualViewport?.scale ?? 1) > 1.01) return;
    if (!fieldHidden(s.field)) return;
    // Never fight endlessly: at most 6 corrections a second.
    const now = performance.now();
    s.fixes = s.fixes.filter((x) => now - x < 1000);
    if (s.fixes.length >= 6) return;
    s.fixes.push(now);
    const before = s.saved.get(t);
    if (before != null) setScroll(t, before);
    reveal(s.field);
    debugLog('guard', `${describe(t)} back to ${Math.round(t.scrollTop)}`);
  });
}

// ---------- R17-3: lifting a screen that must keep its size ----------
//
// The host's live screen ([data-kb-lift]: header, TV picture, band, score cards) is planned to the
// pixel; shrinking it to the area above the keyboard would resize the TV picture while the host types
// a Daily Double! wager in the band. Instead it keeps its size and moves up just enough for the field
// (with its row) to clear the keyboard — never so far that the field passes the top of the screen.

let lifted: HTMLElement | null = null;

function applyLift() {
  const el = document.activeElement;
  const box = state.open && isTextField(el) ? el.closest<HTMLElement>('[data-kb-lift]') : null;
  if (lifted && lifted !== box) {
    lifted.style.transform = '';
    delete lifted.dataset.kbLifted;
    lifted = null;
  }
  if (!box || !isTextField(el)) return;
  const vv = window.visualViewport!;
  const current = lifted === box ? Number(box.dataset.kbLifted || 0) : 0;
  const r = (el.closest<HTMLElement>('[data-keep-visible]') ?? el).getBoundingClientRect();
  const top = r.top + current;
  const bottom = r.bottom + current;
  const need = Math.round(Math.max(0, Math.min(bottom + 12 - (vv.offsetTop + vv.height), top - 12 - vv.offsetTop)));
  if (need === current && lifted === box) return;
  box.style.transform = need ? `translateY(${-need}px)` : '';
  box.dataset.kbLifted = String(need);
  lifted = box;
  debugLog('lift', `${describe(box)} ${need}px`);
}

// ---------- R17-5: diagnostics (Settings → Advanced, or ?kbdebug=1) ----------

const DEBUG_KEY = 'oj.kbdebug';
let debugEl: HTMLElement | null = null;
const debugLines: string[] = [];

function describe(el: Element) {
  const id = el.getAttribute('data-testid') ?? el.id;
  return id ? `${el.tagName.toLowerCase()}[${id}]` : `${el.tagName.toLowerCase()}.${(el.className && typeof el.className === 'string' ? el.className : '').split(' ').slice(0, 2).join('.')}`;
}

export function keyboardDebugEnabled() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setKeyboardDebug(on: boolean) {
  try {
    if (on) localStorage.setItem(DEBUG_KEY, '1');
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* private mode */
  }
  if (!on) {
    debugEl?.remove();
    debugEl = null;
  } else debugLog('diagnostics on', '');
}

function debugLog(what: string, detail: string) {
  if (!debugEl && !keyboardDebugEnabled()) return;
  const vv = window.visualViewport;
  const line = `${(performance.now() / 1000).toFixed(2)} ${what} ${detail} | vv ${Math.round(vv?.height ?? 0)}@${Math.round(vv?.offsetTop ?? 0)} ×${(vv?.scale ?? 1).toFixed(2)} ih ${window.innerHeight} kb ${state.open ? state.height : '-'}`;
  debugLines.push(line);
  if (debugLines.length > 14) debugLines.shift();
  if (!debugEl) {
    debugEl = document.createElement('pre');
    debugEl.setAttribute('data-testid', 'kb-debug');
    debugEl.style.cssText =
      'position:fixed;left:4px;top:calc(env(safe-area-inset-top) + 4px);z-index:2147483647;max-width:calc(100vw - 8px);margin:0;padding:4px 6px;border-radius:6px;background:rgb(0 0 0 / 0.72);color:#bef264;font:10px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(debugEl);
  }
  debugEl.textContent = debugLines.join('\n');
}

/** Starts the tracker once (main.tsx). */
export function startKeyboardTracking() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return;
  started = true;
  const vv = window.visualViewport;
  const root = document.documentElement;
  try {
    if (new URLSearchParams(location.search).get('kbdebug') === '1') localStorage.setItem(DEBUG_KEY, '1');
  } catch {
    /* private mode */
  }
  // Who scrolls: a finger dragging (and its momentum), a wheel or keys are the user; anything else
  // while a field has the keyboard is the browser or a re-layout (the guard above).
  document.addEventListener('touchstart', () => (touching = true), { passive: true, capture: true });
  document.addEventListener('touchmove', () => (lastUserScroll = performance.now()), { passive: true, capture: true });
  const lift = () => {
    touching = false;
  };
  document.addEventListener('touchend', lift, { passive: true, capture: true });
  document.addEventListener('touchcancel', lift, { passive: true, capture: true });
  document.addEventListener('wheel', () => (lastUserScroll = performance.now()), { passive: true, capture: true });
  document.addEventListener('keydown', (e) => /^(Arrow|Page|Home|End| )/.test(e.key) && !isTextField(e.target as Element) && (lastUserScroll = performance.now()), { capture: true });
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  // The tallest visible area seen at each width (portrait / landscape, a resized window) while no
  // text field had focus: Safari's toolbars may change it a little, a keyboard a lot.
  const baselines = new Map<number, number>();
  let frame = 0;

  const measure = () => {
    frame = 0;
    if (vv.scale > 1.01) return; // pinch zoom (K60): leave everything as it is
    const width = Math.round(vv.width);
    // Still open after the field lost focus while the keyboard is on its way down (tapping Save in a
    // sheet must not drop the sheet under the closing keyboard mid-tap).
    const typing = isTextField(document.activeElement) || state.open;
    const base = typing ? Math.max(baselines.get(width) ?? 0, vv.height) : vv.height;
    baselines.set(width, base);
    const open = typing && base - vv.height > MIN_KEYBOARD;
    const next: KeyboardState = open ? { open, top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : CLOSED;
    const prev = state;
    // R17-5: a field without the keyboard (the keyboard closed, or never opened) ends the guard.
    if (session && !open && !isTextField(document.activeElement)) end();
    if (next.open === prev.open && next.top === prev.top && next.height === prev.height) return;
    debugLog(open ? 'keyboard' : 'no keyboard', open ? `${next.height}@${next.top}` : '');
    state = next;
    if (open && session) session.keyboard = true;
    if (open) {
      root.dataset.keyboard = 'open';
      root.style.setProperty('--vv-top', `${next.top}px`);
      root.style.setProperty('--vv-height', `${next.height}px`);
    } else {
      delete root.dataset.keyboard;
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    }
    for (const fn of listeners) fn();
    // After the shell has been fitted above the keyboard, bring the field into view inside it (not
    // when Safari merely moves the visible area: the user may be scrolling the page themselves).
    if (open && (!prev.open || prev.height !== next.height)) requestAnimationFrame(() => isTextField(document.activeElement) && reveal(document.activeElement));
    applyLift();
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  vv.addEventListener('resize', later);
  vv.addEventListener('scroll', later);
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  document.addEventListener('focusout', () => setTimeout(later, 0));
  // Moving from one field to the next keeps the keyboard up: bring the new one into view too.
  document.addEventListener('focusin', (e) => {
    later();
    if (isTextField(e.target as Element) && (window.visualViewport?.scale ?? 1) <= 1.01) begin(e.target as HTMLElement);
    if (state.open && isTextField(e.target as Element))
      setTimeout(() => {
        if (state.open && isTextField(document.activeElement)) reveal(document.activeElement);
        applyLift();
      }, 60);
  });
  measure();
}
