// Early-buzz rule editor. Used in the Rules dialog and as a quick control in the live clue panel,
// so the host can change it mid-game; changes apply from the next buzz (never retroactively).
import { useEffect, useState } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { EARLY_BUZZ_OPTIONS, type EarlyBuzzPenalty, type GameRules } from '../../../shared/game';
import { Button, Field, Modal, cx, inputCls } from '../../components/ui';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

export function earlyRuleSummary(r: GameRules) {
  switch (r.earlyBuzzPenalty) {
    case 'lockout':
      return `Short lockout (${(r.earlyBuzzLockoutMs / 1000).toFixed(2).replace(/0$/, '')} s)`;
    case 'clue':
      return 'Out for this clue';
    case 'points':
      return `Lose ${r.earlyBuzzPoints} points`;
    default:
      return 'No penalty';
  }
}

export function EarlyBuzzFields({ rules, onChange }: { rules: GameRules; onChange: (r: GameRules) => void }) {
  const set = (patch: Partial<GameRules>) => onChange({ ...rules, ...patch });
  const secs = rules.earlyBuzzLockoutMs / 1000;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        What happens when someone presses their buzzer <b>before you open the buzzers</b>? Works the same for Joy-Cons, phones and keyboards. Changes apply from the next buzz.
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Early buzz penalty">
        {(Object.keys(EARLY_BUZZ_OPTIONS) as EarlyBuzzPenalty[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={rules.earlyBuzzPenalty === k}
            onClick={() => set({ earlyBuzzPenalty: k })}
            className={cx('min-h-16 rounded-xl border-2 px-3 py-2 text-left', rules.earlyBuzzPenalty === k ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}
          >
            <span className="block font-semibold">{EARLY_BUZZ_OPTIONS[k].label}</span>
            <span className="block text-xs text-slate-500">{EARLY_BUZZ_OPTIONS[k].description}</span>
          </button>
        ))}
      </div>
      {(rules.earlyBuzzPenalty === 'lockout' || rules.earlyBuzzPenalty === 'points') && (
        <Field label="Lockout length" hint="How long an early buzzer stays blocked (0.1 – 5 seconds).">
          <div className="flex flex-wrap gap-2">
            {[0.25, 0.5, 1, 2].map((v) => (
              <Button key={v} size="sm" variant={secs === v ? 'primary' : 'secondary'} onClick={() => set({ earlyBuzzLockoutMs: v * 1000 })}>
                {v} s
              </Button>
            ))}
            <input
              className={cx(inputCls, 'w-24')}
              inputMode="decimal"
              aria-label="Lockout seconds"
              value={secs}
              onChange={(e) => {
                const n = Number(e.target.value.replace(',', '.'));
                if (Number.isFinite(n)) set({ earlyBuzzLockoutMs: Math.round(Math.min(5, Math.max(0.1, n)) * 1000) });
              }}
            />
          </div>
        </Field>
      )}
      {rules.earlyBuzzPenalty === 'points' && (
        <Field label="Points lost" hint="Charged once per player per clue. In team games the team loses the points.">
          <div className="flex flex-wrap gap-2">
            {[50, 100, 200].map((v) => (
              <Button key={v} size="sm" variant={rules.earlyBuzzPoints === v ? 'primary' : 'secondary'} onClick={() => set({ earlyBuzzPoints: v })}>
                {v}
              </Button>
            ))}
            <input
              className={cx(inputCls, 'w-24')}
              inputMode="numeric"
              aria-label="Penalty points"
              value={rules.earlyBuzzPoints}
              onChange={(e) => set({ earlyBuzzPoints: Math.min(100000, Number(e.target.value.replace(/\D/g, '') || 0)) })}
            />
          </div>
        </Field>
      )}
    </div>
  );
}

/** Compact chip in the clue panel: shows the current rule; tap to change it during the game. */
export function EarlyBuzzQuick({ g, run }: { g: GameView; run: Run }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<GameRules>(g.rules);
  useEffect(() => {
    if (open) setR(g.rules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 active:bg-slate-200" data-testid="early-rule-chip">
        ⏱ Early buzz: {earlyRuleSummary(g.rules)} ▾
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Early buzz rule">
        <div className="space-y-4">
          <EarlyBuzzFields rules={r} onChange={setR} />
          <Button
            size="lg"
            className="w-full"
            onClick={async () => {
              if ((await run({ type: 'updateRules', rules: r })).ok) setOpen(false);
            }}
            data-testid="save-early-rule"
          >
            Use this rule from now on
          </Button>
        </div>
      </Modal>
    </>
  );
}
