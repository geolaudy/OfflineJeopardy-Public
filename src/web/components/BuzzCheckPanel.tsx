// Buzzer check (Z11): everyone presses once; the host sees who registered, in which order, and
// how quick each phone's connection is. Presses during a check never reach the game.
import { useEffect, useState } from 'react';
import { Gamepad2, Keyboard, Play, Smartphone, Square, Wifi } from 'lucide-react';
import { buzzCheck, useLive } from '../lib/socket';
import { QUALITY_LABEL, rttQuality, type Quality } from '../../shared/buzzCheck';
import type { InputKind } from '../../shared/game';
import { Button, Card, cx } from './ui';

const KIND_ICON: Record<InputKind, typeof Smartphone> = {
  phone: Smartphone,
  joycon: Gamepad2,
  gamepad: Gamepad2,
  keyboard: Keyboard,
  host: Smartphone,
  bot: Smartphone,
};
const QUALITY_CLS: Record<Quality, string> = {
  good: 'bg-green-100 text-green-800',
  ok: 'bg-amber-100 text-amber-900',
  poor: 'bg-red-100 text-red-800',
  unknown: 'bg-slate-100 text-slate-600',
};

function Delay({ ms }: { ms: number | null }) {
  const q = rttQuality(ms);
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', QUALITY_CLS[q])} title="Round trip from the phone to the game computer">
      <Wifi size={12} aria-hidden />
      {ms == null ? QUALITY_LABEL[q] : `${Math.round(ms)} ms · ${QUALITY_LABEL[q]}`}
    </span>
  );
}

export default function BuzzCheckPanel() {
  const data = useLive((s) => s.buzzCheck);
  const status = useLive((s) => s.status);
  const [, tick] = useState(0);
  const view = data?.view ?? null;
  // Keep the connection list fresh while this panel is open; count down during a check.
  useEffect(() => {
    if (status !== 'open') return;
    buzzCheck('refresh');
    const t = setInterval(() => (view?.active ? tick((x) => x + 1) : buzzCheck('refresh')), view?.active ? 500 : 5000);
    return () => clearInterval(t);
  }, [status, view?.active]);

  const left = view?.active ? Math.max(0, Math.ceil((view.endsAt - Date.now()) / 1000)) : 0;
  const phones = data?.connections ?? [];
  const slow = phones.filter((p) => p.quality === 'poor');

  return (
    <Card className="space-y-2 p-3" data-testid="buzz-check">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 className="text-lg leading-tight font-bold">Buzzer check</h2>
          {!view && <p className="text-sm leading-snug text-slate-600">Everyone presses their buzzer once; it doesn't count in the game.</p>}
        </div>
        {view?.active ? (
          <Button variant="secondary" onClick={() => buzzCheck('stop')} data-testid="buzz-check-stop">
            <Square size={16} aria-hidden /> Stop ({left}s)
          </Button>
        ) : (
          <Button onClick={() => buzzCheck('start')} data-testid="buzz-check-start">
            <Play size={16} aria-hidden /> {view ? 'Check again' : 'Start check'}
          </Button>
        )}
      </div>

      {/* R13-12: who has not pressed is what the check is for — it stays in view; the order and
          timings fold away once the check ends, and the phones share the row, so 15 controllers
          fit the Buzzers tab. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-1.5">
        {view && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {(view.waiting.length > 0 || !view.presses.length) && <h3 className="text-sm font-semibold text-slate-500">{view.active ? 'Not pressed yet' : 'Did not press'}</h3>}
              {view.waiting.length ? (
                <ul className="flex flex-wrap gap-1" data-testid="buzz-check-waiting">
                  {view.waiting.map((w) => {
                    const Icon = KIND_ICON[w.kind];
                    return (
                      <li key={w.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm">
                        <Icon size={14} aria-hidden /> {w.name}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm font-semibold text-green-700">{view.presses.length ? 'Everyone pressed ✓' : '—'}</p>
              )}
            </div>
            <details className="group min-w-0 open:basis-full" open={view.active || undefined} data-testid="buzz-check-order">
              <summary className="cursor-pointer text-sm font-semibold text-slate-500 select-none">
                {view.active ? 'Pressed' : 'Order'} ({view.presses.length})
              </summary>
              {view.presses.length ? (
                <ol className="mt-1 flex flex-wrap gap-1" data-testid="buzz-check-presses">
                  {view.presses.map((p) => {
                    const Icon = KIND_ICON[p.kind];
                    return (
                      <li key={p.key} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-0.5 text-sm">
                        <span className="font-black tabular-nums text-slate-400">{p.order}</span>
                        <Icon size={14} className="shrink-0 text-blue-700" aria-label={p.label} />
                        <span className="max-w-[10rem] truncate font-semibold">{p.name}</span>
                        <span className="text-xs text-slate-500 tabular-nums">{p.order === 1 ? 'first' : `+${p.afterMs} ms`}</span>
                        {p.kind === 'phone' && <Delay ms={p.rttMs} />}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-1 text-sm text-slate-500">{view.active ? 'waiting for the first press…' : 'nobody pressed'}</p>
              )}
            </details>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-sm font-semibold text-slate-500">Phones connected ({phones.length})</h3>
          {phones.length ? (
            <ul className="flex flex-wrap gap-2" data-testid="connections">
              {phones.map((p) => (
                <li key={p.name} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1 text-sm">
                  <Smartphone size={14} aria-hidden /> {p.name} <Delay ms={p.rttMs} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">none</p>
          )}
        </div>
      </div>
      {slow.length > 0 && (
        <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900">
          {slow.map((s) => s.name).join(', ')} {slow.length === 1 ? 'has' : 'have'} a slow connection. Moving closer to the Wi-Fi router, or using a Joy-Con, keeps buzzing fair.
        </p>
      )}
    </Card>
  );
}
