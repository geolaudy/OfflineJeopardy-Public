// Countdown bar. The bar itself is driven by one Web Animation (transform: scaleX) per timer
// state change, so React only re-renders when the displayed whole second changes.
// R6-12: no label (the countdown speaks for itself) and nothing at zero — an expired timer leaves
// the TV instead of standing at 0; what happens next is the server's (or the host's) decision.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { timerRemaining, type TimerState } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import { cx } from '../../components/ui';

function readout(t: TimerState) {
  const rem = timerRemaining(t, serverNow());
  return { secs: Math.ceil(rem / 1000), low: t.durationMs > 0 && rem < t.durationMs * 0.25 };
}

export function TimerBar({ timer }: { timer: TimerState | null }) {
  if (!timer || timer.expired) return null;
  return <Countdown timer={timer} />;
}

function Countdown({ timer }: { timer: TimerState }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => readout(timer));

  // Whole-second readout: polled cheaply; state only changes when the shown value changes.
  useEffect(() => {
    const update = () =>
      setView((v) => {
        const n = readout(timer);
        return n.secs === v.secs && n.low === v.low ? v : n;
      });
    update();
    if (!timer.running) return;
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [timer]);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const rem = timerRemaining(timer, serverNow());
    const frac = timer.durationMs > 0 ? Math.min(1, rem / timer.durationMs) : 0;
    if (typeof el.animate !== 'function') {
      el.style.transform = `scaleX(${frac})`;
      return;
    }
    // WAAPI (not a CSS transition) so the board's reduce-motion rule cannot snap the bar to empty.
    const a =
      timer.running && rem > 0
        ? el.animate([{ transform: `scaleX(${frac})` }, { transform: 'scaleX(0)' }], { duration: rem, easing: 'linear', fill: 'forwards' })
        : el.animate([{ transform: `scaleX(${frac})` }, { transform: `scaleX(${frac})` }], { duration: 1, fill: 'forwards' });
    return () => a.cancel();
  }, [timer.startedAt, timer.running, timer.remainingMs, timer.durationMs, timer.expired]);

  // Reached zero locally: gone at once, before the server's expiry arrives.
  if (view.secs <= 0) return null;
  return (
    <div className={cx('bt-timer', view.low && 'is-low')} role="timer" aria-label={`${view.secs} seconds left`} data-testid="tv-timer" data-kind={timer.kind}>
      <div className="bt-timer-track">
        <div ref={barRef} className="bt-timer-fill" />
      </div>
      <span className="bt-timer-secs">{view.secs}</span>
    </div>
  );
}
