// Settings for the TV presentation (R2-22/23/24): board intro, buzzers-open indicator, sound cues.
// Changes apply to the TV immediately (the server nudges it to reload public settings).
import { useEffect, useRef, useState } from 'react';
import { Music, Play, Trash2, Upload } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt } from '../../lib/hooks';
import { configureSound, playCue, unlockAudio } from '../../lib/sound';
import { Button, Field, cx, inputCls, toast } from '../../components/ui';
import { CUE_LABELS, INTRO_SPEEDS, SOUND_CUES, UNLOCK_STYLES, type SoundCue, type TvFx, type UnlockStyle } from '../../../shared/tvFx';
import { SoundPackPicker } from './SoundPackPicker';

function Segmented<K extends string>({ value, options, onChange, label }: { value: K; options: Record<K, string>; onChange: (k: K) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={label}>
      {(Object.keys(options) as K[]).map((k) => (
        <button key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cx('min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold', value === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

function Check({ label, hint, checked, onChange, testid }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testid?: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Miniature TV with the chosen indicator, so the host sees the style before using it. */
function IndicatorPreview({ fx, style }: { fx: TvFx['unlock']; style: UnlockStyle }) {
  const c = fx.color || '#ffcc00'; // theme accent (classic board)
  const o = { subtle: 0.45, medium: 0.75, strong: 1 }[fx.intensity];
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-[#0a14d8]" aria-hidden>
      <div className="absolute inset-x-[18%] top-[30%] h-[10%] rounded bg-white/70" />
      <div className="absolute inset-x-[25%] top-[48%] h-[10%] rounded bg-white/50" />
      <div className="absolute inset-0" style={{ opacity: o }}>
        {style === 'edges' && (
          <>
            <span className="absolute inset-y-[8%] left-0 w-[3px]" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            <span className="absolute inset-y-[8%] right-0 w-[3px]" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
          </>
        )}
        {style === 'top' && <span className="absolute inset-x-0 top-0 h-[22%]" style={{ borderTop: `3px solid ${c}`, background: `linear-gradient(to bottom, ${c}66, transparent)` }} />}
        {style === 'bottom' && <span className="absolute inset-x-0 bottom-0 h-[22%]" style={{ borderBottom: `3px solid ${c}`, background: `linear-gradient(to top, ${c}66, transparent)` }} />}
        {style === 'pulse' && <span className="absolute inset-0" style={{ border: `2px solid ${c}`, boxShadow: `inset 0 0 18px 4px ${c}66` }} />}
        {style === 'dot' && <span className="absolute top-[8%] right-[5%] h-[12%] w-[7%] rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />}
      </div>
    </div>
  );
}

/** Per-sound volume (relative to the main volume); saved when the slider is let go. */
function CueVolume({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(Math.round(value * 100));
  useEffect(() => setV(Math.round(value * 100)), [value]);
  const commit = () => v !== Math.round(value * 100) && onCommit(v / 100);
  return (
    <label className={cx('flex items-center gap-1.5 text-xs text-slate-500', disabled && 'opacity-40')}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-20 accent-blue-700"
        aria-label={`Volume: ${label}`}
      />
      <span className="w-9 text-right tabular-nums">{v}%</span>
    </label>
  );
}

export function PresentationSettings({ fx: saved, sound, onSave }: { fx: TvFx; sound: { enabled: boolean; volume: number }; onSave: (fx: TvFx) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadCue, setUploadCue] = useState<SoundCue | null>(null);
  // Optimistic: the page shows each change at once; saves go out one after another so quick
  // successive changes never overwrite each other.
  const [fx, setFx] = useState(saved);
  const latest = useRef(saved);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current === 0) {
      latest.current = saved;
      setFx(saved);
    }
  }, [saved]);
  const commit = (next: TvFx) => {
    latest.current = next;
    setFx(next);
    pending.current++;
    chain.current = chain.current.then(() => onSave(next)).finally(() => void pending.current--);
    return chain.current;
  };
  const save = (patch: Partial<TvFx>) => commit({ ...latest.current, ...patch });
  const setUnlock = (patch: Partial<TvFx['unlock']>) => save({ unlock: { ...latest.current.unlock, ...patch } });
  const test = (cue: SoundCue) => {
    unlockAudio();
    configureSound({ enabled: sound.enabled, volume: sound.volume, fx });
    playCue(cue, { force: true });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="fx-intro">
        <h3 id="fx-intro" className="font-bold">
          Board intro
        </h3>
        <Check
          label="Play the classic board intro at the start of each round"
          hint="The board's screens light up in a checker pattern before the round title and categories. Skip or replay it from the host's intro controls. Introducing the categories is a game rule (Rules & timers)."
          checked={fx.boardIntro}
          onChange={(v) => save({ boardIntro: v })}
          testid="fx-board-intro"
        />
        <Field label="Intro speed" hint="Also sets the pace of automatic category introductions." group>
          <Segmented label="Intro speed" value={fx.introSpeed} options={INTRO_SPEEDS} onChange={(k) => save({ introSpeed: k })} />
        </Field>
      </section>

      <section className="space-y-3" aria-labelledby="fx-unlock">
        <h3 id="fx-unlock" className="font-bold">
          When the buzzers open
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Indicator style">
          {(Object.keys(UNLOCK_STYLES) as UnlockStyle[]).map((k) => (
            <button key={k} role="radio" aria-checked={fx.unlock.style === k} onClick={() => setUnlock({ style: k })} className={cx('rounded-xl border-2 p-2 text-left', fx.unlock.style === k ? 'border-blue-700 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')} data-testid={`fx-style-${k}`}>
              <IndicatorPreview fx={fx.unlock} style={k} />
              <span className="mt-1 block text-sm font-semibold">{UNLOCK_STYLES[k]}</span>
            </button>
          ))}
        </div>
        {fx.unlock.style !== 'none' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Colour" group>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={fx.unlock.color ? 'ghost' : 'secondary'} onClick={() => setUnlock({ color: '' })} aria-pressed={!fx.unlock.color}>
                  Theme colour (mustard)
                </Button>
                <input type="color" value={fx.unlock.color || '#ffcc00'} onChange={(e) => setUnlock({ color: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-slate-300" aria-label="Indicator colour" />
              </div>
            </Field>
            <Field label="Intensity" group>
              <Segmented label="Intensity" value={fx.unlock.intensity} options={{ subtle: 'Subtle', medium: 'Medium', strong: 'Strong' }} onChange={(k) => setUnlock({ intensity: k })} />
            </Field>
            <Field label={`Full strength for ${(fx.unlock.durationMs / 1000).toFixed(1)} s`}>
              <input type="range" min={300} max={5000} step={100} value={fx.unlock.durationMs} onChange={(e) => setUnlock({ durationMs: Number(e.target.value) })} className="w-full" aria-label="Indicator duration" />
            </Field>
            <div>
              <Check label="Stay visible while the buzzers are open" hint="Off: it fades away after the time above." checked={fx.unlock.persist} onChange={(v) => setUnlock({ persist: v })} />
              <Check label={'Show the "Buzzers open" label'} checked={fx.unlock.label} onChange={(v) => setUnlock({ label: v })} />
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">The indicator never covers the clue. A sound can play too — see "Buzzers open" below.</p>
      </section>

      <section className="space-y-3" aria-labelledby="fx-sounds">
        <h3 id="fx-sounds" className="font-bold">
          Sounds
        </h3>
        <SoundPackPicker fx={fx} sound={sound} onPick={(p) => save({ soundPack: p })} />
        {fx.soundPack !== 'off' && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {SOUND_CUES.map((cue) => {
              const file = fx.customSounds[cue];
              return (
                <li key={cue} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <label className="flex min-h-10 flex-1 items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 accent-blue-700" checked={fx.cues[cue]} onChange={(e) => save({ cues: { ...latest.current.cues, [cue]: e.target.checked } })} data-testid={`fx-cue-${cue}`} />
                    <span className="font-medium">{CUE_LABELS[cue]}</span>
                    {fx.soundPack === 'custom' && file && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                        <Music size={12} aria-hidden /> own file
                      </span>
                    )}
                  </label>
                  <CueVolume
                    label={CUE_LABELS[cue]}
                    value={fx.volumes?.[cue] ?? 1}
                    disabled={!fx.cues[cue]}
                    onCommit={(v) => save({ volumes: { ...(latest.current.volumes ?? {}), [cue]: v } })}
                  />
                  {fx.soundPack === 'custom' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => (setUploadCue(cue), fileRef.current?.click())} aria-label={`Choose a sound file for ${CUE_LABELS[cue]}`}>
                        <Upload size={16} aria-hidden />
                      </Button>
                      {file && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove the sound file for ${CUE_LABELS[cue]}`}
                          onClick={async () => {
                            const r = await attempt(() => hostApi<TvFx>('DELETE', `/api/sounds/${cue}`));
                            if (r) await save({ customSounds: r.customSounds });
                          }}
                        >
                          <Trash2 size={16} aria-hidden />
                        </Button>
                      )}
                    </>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => test(cue)} aria-label={`Test ${CUE_LABELS[cue]}`}>
                    <Play size={14} aria-hidden /> Test
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f || !uploadCue) return;
            const fd = new FormData();
            fd.append('file', f);
            const r = await attempt(() => hostApi<TvFx>('POST', `/api/sounds/${uploadCue}`, undefined, fd));
            if (r) {
              await save({ customSounds: r.customSounds });
              toast(`Sound for "${CUE_LABELS[uploadCue]}" saved`, 'success');
            }
          }}
        />
        <p className="text-xs text-slate-500">Only use sound files you made yourself or have permission to use. Files stay on this computer (max 2 MB each) and are included in full backups.</p>
      </section>
    </div>
  );
}
