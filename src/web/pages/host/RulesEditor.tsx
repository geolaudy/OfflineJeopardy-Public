import { useEffect, useState } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { RULE_PRESETS, rulesFromPreset, type GameRules } from '../../../shared/game';
import { Button, Field, Modal, inputCls } from '../../components/ui';

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function RulesEditor({ open, onClose, g, run }: { open: boolean; onClose: () => void; g: GameView; run: (a: HostAction) => Promise<{ ok: boolean }> }) {
  const [r, setR] = useState<GameRules>(g.rules);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (open) setR(g.rules);
  }, [open, g.rules]);
  const t = r.timers;
  const setT = (k: keyof GameRules['timers'], v: number | boolean) => setR({ ...r, timers: { ...t, [k]: v } });
  return (
    <Modal open={open} onClose={onClose} title="Rules & timers" wide>
      <div className="space-y-4">
        <Field label="Preset" hint={RULE_PRESETS[r.preset]?.description}>
          <select className={inputCls} value={r.preset} onChange={(e) => setR(rulesFromPreset(e.target.value))}>
            {Object.entries(RULE_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle label="Timers start automatically" checked={t.autoStart} onChange={(v) => setT('autoStart', v)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['buzzSeconds', 'Buzz-in time'],
              ['answerSeconds', 'Answer time'],
              ['wagerSeconds', 'Wager time'],
              ['finalSeconds', 'Final time'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} hint="seconds, 0 = off">
              <input className={inputCls} inputMode="numeric" value={t[k]} onChange={(e) => setT(k, Math.min(600, Number(e.target.value.replace(/\D/g, '') || 0)))} />
            </Field>
          ))}
        </div>
        <Toggle label="Wrong answers lose points" checked={r.incorrectDeducts} onChange={(v) => setR({ ...r, incorrectDeducts: v })} />
        <Toggle label="Re-open buzzers after a wrong answer" checked={r.autoReopenAfterIncorrect} onChange={(v) => setR({ ...r, autoReopenAfterIncorrect: v })} />
        <Toggle label="Players can join from their phones without approval" checked={r.allowSelfJoin} onChange={(v) => setR({ ...r, allowSelfJoin: v })} />
        <button className="text-sm font-semibold text-blue-700" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? '▾ Hide advanced rules' : '▸ Advanced rules'}
        </button>
        {advanced && (
          <div className="space-y-3">
            <Toggle
              label="Teammates may try again after a wrong answer"
              hint="Only for teams with individual buzzers. Default: one try per team per clue."
              checked={r.teamRetry === 'otherMembers'}
              onChange={(v) => setR({ ...r, teamRetry: v ? 'otherMembers' : 'none' })}
            />
            <Toggle label="Everyone plays the Final (even with zero or negative scores)" checked={r.finalAllowNonPositive} onChange={(v) => setR({ ...r, finalAllowNonPositive: v })} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Early-buzz lockout" hint="ms penalty for buzzing before unlock (0 = none)">
                <input className={inputCls} inputMode="numeric" value={r.earlyBuzzLockoutMs} onChange={(e) => setR({ ...r, earlyBuzzLockoutMs: Math.min(5000, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
              </Field>
              <Field label="Button debounce" hint="ms (Joy-Con / keyboard)">
                <input className={inputCls} inputMode="numeric" value={r.buzzDebounceMs} onChange={(e) => setR({ ...r, buzzDebounceMs: Math.min(2000, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
              </Field>
              <Field label="Minimum Daily Wager">
                <input className={inputCls} inputMode="numeric" value={r.dailyWagerMin} onChange={(e) => setR({ ...r, dailyWagerMin: Number(e.target.value.replace(/\D/g, '') || 0) })} />
              </Field>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if ((await run({ type: 'updateRules', rules: r })).ok) onClose();
            }}
          >
            Save rules
          </Button>
        </div>
      </div>
    </Modal>
  );
}
