// Countdown bar. The bar itself is driven by one Web Animation (transform: scaleX) per timer
// state change, so React only re-renders when the displayed whole second changes.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { timerRemaining, type TimerState } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import { TIMER_LABELS } from '../../lib/view';
import { cx } from '../../components/ui';

function readout(t: TimerState) {
  const rem = timerRemaining(t, serverNow());
  return { secs: Math.ceil(rem / 1000), low: t.durationMs > 0 && rem < t.durationMs * 0.25 };
}

export function TimerBar({ timer }: { timer: TimerState | null }) {
  if (!timer) return null;
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

  return (
    <div
      className={cx('bt-timer', view.low && 'is-low', timer.expired && 'is-expired')}
      role="timer"
      aria-label={timer.expired ? 'Time is up' : `${view.secs} seconds left`}
    >
      <span className="bt-timer-label">{TIMER_LABELS[timer.kind]}</span>
      <div className="bt-timer-track">
        <div ref={barRef} className="bt-timer-fill" />
      </div>
      <span className="bt-timer-secs">{timer.expired ? 'Time!' : view.secs}</span>
    </div>
  );
}
