import { useEffect, useState } from 'react';
import { Clock, Dices, Users } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { MAX_ENTRIES, RULE_PRESETS, rulesFromPreset, type GameRules } from '../../../shared/game';
import { Button, Field, Modal, TabBar, cx, inputCls, type TabItem } from '../../components/ui';
import { EarlyBuzzFields } from './EarlyBuzzRule';
import { BUZZ_FAIRNESS_OPTIONS, type BuzzFairness } from '../../../shared/buzzTiming';

function Toggle({ label, hint, checked, onChange, testId }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-blue-700" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="min-w-0">
        <span className="block leading-snug font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** A short number on one line with its label (R17-14: compact rules). */
function NumberRow({ label, hint, value, onChange, unit, max }: { label: string; hint?: string; value: number; onChange: (n: number) => void; unit?: string; max: number }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <input className={cx(inputCls.replace('w-full ', ''), 'w-24 shrink-0')} inputMode="numeric" value={value} onChange={(e) => onChange(Math.min(max, Number(e.target.value.replace(/\D/g, '') || 0)))} aria-label={label} />
      {unit && <span className="w-6 shrink-0 text-sm text-slate-500">{unit}</span>}
    </label>
  );
}

export type RulesSection = 'timing' | 'clues' | 'players';
/** R17-14: the rules in three groups — tabs in the dialog, three columns in Settings → Gameplay. */
export const RULES_SECTIONS: TabItem<RulesSection>[] = [
  { id: 'timing', label: 'Timers & scoring', icon: Clock },
  { id: 'clues', label: 'Clues & wagers', icon: Dices },
  { id: 'players', label: 'Players & buzzing', icon: Users },
];

/** The rule controls of one group (no Save — the dialog or the Settings tab saves). Compact
 *  (R17-14): plain toggles, the four timers in one row, short numbers inline — so each group fits an
 *  iPad screen without scrolling. Every rule of the old long dialog is here. */
export function RulesFields({ r, setR, section }: { r: GameRules; setR: (r: GameRules) => void; section: RulesSection }) {
  const t = r.timers;
  const setT = (k: keyof GameRules['timers'], v: number | boolean) => setR({ ...r, timers: { ...t, [k]: v } });
  if (section === 'timing')
    return (
      <div className="space-y-2.5">
        <Field label="Preset" hint={RULE_PRESETS[r.preset]?.description}>
          <select className={inputCls} value={r.preset} onChange={(e) => setR(rulesFromPreset(e.target.value))} aria-label="Preset">
            {Object.entries(RULE_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle label="Timers start automatically" checked={t.autoStart} onChange={(v) => setT('autoStart', v)} />
        <div role="group" aria-label="Timers (seconds, 0 = off)">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ['buzzSeconds', 'Buzz-in', 'Buzz-in time'],
                ['answerSeconds', 'Answer', 'Answer time'],
                ['wagerSeconds', 'Wager', 'Wager time'],
                ['finalSeconds', 'Final', 'Final think time'],
              ] as const
            ).map(([k, short, label]) => (
              <label key={k} className="block min-w-0">
                <span className="mb-1 block truncate text-sm font-semibold text-slate-700">{short}</span>
                <input className={cx(inputCls, 'px-2 text-center')} inputMode="numeric" value={t[k]} onChange={(e) => setT(k, Math.min(600, Number(e.target.value.replace(/\D/g, '') || 0)))} aria-label={label} />
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-slate-500">Seconds, 0 = off. The Daily Double! answer time starts when you press Start Timer.</span>
        </div>
        <Toggle label="Wrong answers lose points" checked={r.incorrectDeducts} onChange={(v) => setR({ ...r, incorrectDeducts: v })} />
        <Toggle label="Re-open buzzers after a wrong answer" checked={r.autoReopenAfterIncorrect} onChange={(v) => setR({ ...r, autoReopenAfterIncorrect: v })} />
      </div>
    );
  if (section === 'clues')
    return (
      <div className="space-y-2.5">
        <Toggle label="Introduce the categories each round" checked={r.categoryIntro} onChange={(v) => setR({ ...r, categoryIntro: v })} />
        <Field label="Unlock buzzers automatically" hint="From the next clue; a clue can have its own setting.">
          <select className={inputCls} value={r.autoUnlock} onChange={(e) => setR({ ...r, autoUnlock: e.target.value as GameRules['autoUnlock'] })} aria-label="Automatic buzzer unlock">
            <option value="off">Off — I unlock the buzzers</option>
            <option value="all">All clues</option>
            <option value="mediaOnly">Only picture / sound / video clues without text</option>
            <option value="perClue">Follow each clue&apos;s own setting</option>
          </select>
        </Field>
        {/* R17-2: who types a Daily Double! wager (decided when the clue opens). */}
        <Field label="Daily Double! wager entry" hint={(r.dailyWagerEntry ?? 'host') === 'host' ? 'You type it in the band; computer players wager by themselves.' : 'You unlock it, the player sends it from their phone.'}>
          <select className={inputCls} value={r.dailyWagerEntry ?? 'host'} onChange={(e) => setR({ ...r, dailyWagerEntry: e.target.value as GameRules['dailyWagerEntry'] })} data-testid="rule-dd-entry">
            <option value="host">Host enters the wager (default)</option>
            <option value="player">Player enters the wager on their device</option>
          </select>
        </Field>
        <NumberRow label="Minimum Daily Double! wager" value={r.dailyWagerMin} max={100000} onChange={(n) => setR({ ...r, dailyWagerMin: n })} />
        <Toggle label="Everyone plays Final Jeopardy!" hint="Even with zero or negative scores." checked={r.finalAllowNonPositive} onChange={(v) => setR({ ...r, finalAllowNonPositive: v })} />
        {/* R11-9: who ends Final Jeopardy! answering. */}
        <Field label="Final Jeopardy! answers close">
          <select className={inputCls} value={r.finalClose ?? 'host'} onChange={(e) => setR({ ...r, finalClose: e.target.value as GameRules['finalClose'] })} data-testid="rule-final-close">
            <option value="host">When I close them (default)</option>
            <option value="timer">Automatically when the think time ends</option>
          </select>
        </Field>
        {/* R19-1: submissions are final unless this is on (you can always correct one). */}
        <Toggle
          label="Allow Final Jeopardy! submission changes"
          hint="Players may change a submitted wager or answer while that step is open. Off: what they submit is final (you can still correct it)."
          checked={r.finalChanges === true}
          onChange={(v) => setR({ ...r, finalChanges: v })}
          testId="rule-final-changes"
        />
      </div>
    );
  return (
    <div className="space-y-2.5">
      <Toggle label="Players join without approval" checked={r.allowSelfJoin} onChange={(v) => setR({ ...r, allowSelfJoin: v })} />
      <NumberRow label="Player limit" hint={`0 = the most (${MAX_ENTRIES}); bots take seats too.`} value={r.maxPlayers} max={MAX_ENTRIES} onChange={(n) => setR({ ...r, maxPlayers: n })} />
      <div role="group" aria-label="Early buzzing">
        <span className="mb-1 block text-sm font-semibold text-slate-700">Buzzing before you unlock</span>
        <EarlyBuzzFields rules={r} onChange={setR} dense />
      </div>
      <Toggle label="Teammates may retry after a wrong answer" hint="Teams with individual buzzers." checked={r.teamRetry === 'otherMembers'} onChange={(v) => setR({ ...r, teamRetry: v ? 'otherMembers' : 'none' })} />
      {/* R6-22: how network delay is handled when deciding who buzzed first. */}
      <Field label="Who buzzed first">
        <select className={inputCls} value={r.buzzFairness ?? 'standard'} onChange={(e) => setR({ ...r, buzzFairness: e.target.value as BuzzFairness })} data-testid="rule-buzz-fairness" title={BUZZ_FAIRNESS_OPTIONS[r.buzzFairness ?? 'standard'].description}>
          {(Object.keys(BUZZ_FAIRNESS_OPTIONS) as BuzzFairness[]).map((k) => (
            <option key={k} value={k}>
              {BUZZ_FAIRNESS_OPTIONS[k].label}
            </option>
          ))}
        </select>
      </Field>
      <NumberRow label="Button debounce" hint="Joy-Con / keyboard." unit="ms" value={r.buzzDebounceMs} max={2000} onChange={(n) => setR({ ...r, buzzDebounceMs: n })} />
    </div>
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
  const [tab, setTab] = useState<RulesSection>('timing');
  // Copy the rules when the dialog opens only — live updates must not wipe edits in progress.
  useEffect(() => {
    if (open) setR(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Rules & timers" wide>
      {/* R17-14: three tabs instead of one long scrolling list (and no hidden "Advanced rules"). */}
      <div className="space-y-4">
        {/* R19-6: the tabs (and Save / Cancel) stay in place when a tab's fields need the dialog to
            scroll — the dialog sizes to its content, so they stick to its edges instead. */}
        <TabBar tabs={RULES_SECTIONS} value={tab} onChange={setTab} label="Rule groups" testId="rules-tab" className="sticky top-0 z-10 -mt-2 bg-white" />
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          <RulesFields r={r} setR={setR} section={tab} />
        </div>
        <div className="sticky bottom-0 z-10 flex justify-end gap-2 bg-white py-2">
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
