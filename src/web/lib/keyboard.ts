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

/** Starts the tracker once (main.tsx). */
export function startKeyboardTracking() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return;
  started = true;
  const vv = window.visualViewport;
  const root = document.documentElement;
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
    if (next.open === prev.open && next.top === prev.top && next.height === prev.height) return;
    state = next;
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
    if (open && (!prev.open || prev.height !== next.height)) requestAnimationFrame(() => isTextField(document.activeElement) && revealField(document.activeElement));
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
    if (state.open && isTextField(e.target as Element)) setTimeout(() => state.open && isTextField(document.activeElement) && revealField(document.activeElement), 60);
  });
  measure();
}
