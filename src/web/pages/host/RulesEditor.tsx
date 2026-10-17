import { useEffect, useState } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { RULE_PRESETS, rulesFromPreset, type GameRules } from '../../../shared/game';
import { Button, Field, Modal, inputCls } from '../../components/ui';
import { EarlyBuzzFields } from './EarlyBuzzRule';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BUZZ_FAIRNESS_OPTIONS, type BuzzFairness } from '../../../shared/buzzTiming';

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

/** Edits the current game's rules (g + run), or a rules draft before the game exists (rules + onSave). */
export default function RulesEditor({
  open,
  onClose,
  g,
  run,
  rules,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  g?: GameView;
  run?: (a: HostAction) => Promise<{ ok: boolean }>;
  rules?: GameRules;
  onSave?: (r: GameRules) => Promise<boolean> | boolean;
}) {
  const source = rules ?? g!.rules;
  const [r, setR] = useState<GameRules>(source);
  const [advanced, setAdvanced] = useState(false);
  // Copy the rules when the dialog opens only — live updates must not wipe edits in progress.
  useEffect(() => {
    if (open) setR(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
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
              ['finalSeconds', 'Final Jeopardy! think time'],
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
        <Toggle label="Introduce the categories on the TV at the start of each round" hint="You can skip or replay the introduction any time." checked={r.categoryIntro} onChange={(v) => setR({ ...r, categoryIntro: v })} />
        <Field label="Player limit" hint="0 = no limit. Computer opponents don't count.">
          <input className={inputCls} inputMode="numeric" value={r.maxPlayers} onChange={(e) => setR({ ...r, maxPlayers: Math.min(200, Number(e.target.value.replace(/\D/g, '') || 0)) })} aria-label="Player limit" />
        </Field>
        <Field label="Unlock buzzers automatically when a clue opens" hint="Applies to the next clue that opens. Clues can also have their own setting in the board editor.">
          <select className={inputCls} value={r.autoUnlock} onChange={(e) => setR({ ...r, autoUnlock: e.target.value as GameRules['autoUnlock'] })} aria-label="Automatic buzzer unlock">
            <option value="off">Off — I unlock the buzzers</option>
            <option value="all">All clues</option>
            <option value="mediaOnly">Only picture / sound / video clues without text</option>
            <option value="perClue">Follow each clue's own setting</option>
          </select>
        </Field>
        <div className="rounded-xl bg-slate-50 p-3">
          <h3 className="mb-2 font-bold">Early buzzing</h3>
          <EarlyBuzzFields rules={r} onChange={setR} />
        </div>
        <button className="text-sm font-semibold text-blue-700" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? <ChevronDown size={16} className="mr-1 inline align-[-3px]" aria-hidden /> : <ChevronRight size={16} className="mr-1 inline align-[-3px]" aria-hidden />}
          {advanced ? 'Hide advanced rules' : 'Advanced rules'}
        </button>
        {advanced && (
          <div className="space-y-3">
            <Toggle
              label="Teammates may try again after a wrong answer"
              hint="Only for teams with individual buzzers. Default: one try per team per clue."
              checked={r.teamRetry === 'otherMembers'}
              onChange={(v) => setR({ ...r, teamRetry: v ? 'otherMembers' : 'none' })}
            />
            <Toggle label="Everyone plays Final Jeopardy! (even with zero or negative scores)" checked={r.finalAllowNonPositive} onChange={(v) => setR({ ...r, finalAllowNonPositive: v })} />
            {/* R6-22: how network delay is handled when deciding who buzzed first. */}
            <Field label="Who buzzed first" hint={BUZZ_FAIRNESS_OPTIONS[r.buzzFairness ?? 'standard'].description}>
              <select className={inputCls} value={r.buzzFairness ?? 'standard'} onChange={(e) => setR({ ...r, buzzFairness: e.target.value as BuzzFairness })} data-testid="rule-buzz-fairness">
                {(Object.keys(BUZZ_FAIRNESS_OPTIONS) as BuzzFairness[]).map((k) => (
                  <option key={k} value={k}>
                    {BUZZ_FAIRNESS_OPTIONS[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Button debounce" hint="ms (Joy-Con / keyboard)">
                <input className={inputCls} inputMode="numeric" value={r.buzzDebounceMs} onChange={(e) => setR({ ...r, buzzDebounceMs: Math.min(2000, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
              </Field>
              <Field label="Minimum Daily Double! wager">
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
              const ok = onSave ? await onSave(r) : (await run!({ type: 'updateRules', rules: r })).ok;
              if (ok) onClose();
            }}
          >
            Save rules
          </Button>
        </div>
      </div>
    </Modal>
  );
}
