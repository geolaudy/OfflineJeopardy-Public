// iOS Safari scrolls the *document* to show a focused text field above the on-screen keyboard,
// even when the document cannot scroll, and sometimes leaves it scrolled after the keyboard closes —
// the whole app shell then sits too high or too low (R7-19). The app shells scroll inside
// themselves, so on pages with a shell (.app-screen) the document is put back at the top once the
// keyboard has gone.
export function keepDocumentUnscrolled() {
  if (typeof window === 'undefined') return;
  const reset = () => {
    if (!document.querySelector('.app-screen')) return;
    const vv = window.visualViewport;
    const keyboardOpen = !!vv && vv.height < window.innerHeight - 80;
    if (!keyboardOpen && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  };
  let t: ReturnType<typeof setTimeout> | null = null;
  const later = () => {
    if (t) clearTimeout(t);
    t = setTimeout(reset, 120);
  };
  document.addEventListener('focusout', later);
  window.visualViewport?.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.addEventListener('scroll', later, { passive: true });
}
