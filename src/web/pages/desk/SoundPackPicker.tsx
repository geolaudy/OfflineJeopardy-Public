// Sound pack choice (R4-1): Jeopardy!/Buzzinga (default), Classic, Arcade, Soft as four clear
// options with a Preview each; Custom and Muted stay available below. The Buzzinga pack plays the
// owner's own files — this panel shows which ones are installed and lets the host add more.
import { useEffect, useRef, useState } from 'react';
import { Check, FolderOpen, Music, Play, Trash2, VolumeX } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { configureSound, playCue, unlockAudio } from '../../lib/sound';
import { Button, cx, toast } from '../../components/ui';
import { CUE_LABELS, SOUND_CUES, type PackFiles, type SoundCue, type SoundPack, type TvFx } from '../../../shared/tvFx';

interface PackInfo {
  files: { name: string; cue: SoundCue | null; source: 'installed' | 'bundled'; url: string | null; bytes: number }[];
  cues: PackFiles;
  rules: { cue: SoundCue; example: string }[];
}

const MAIN: { id: SoundPack; title: string; sub: string }[] = [
  { id: 'buzzinga', title: 'Jeopardy!/Buzzinga', sub: 'Your game-show sound files' },
  { id: 'classic', title: 'Classic', sub: 'Bright tones' },
  { id: 'arcade', title: 'Arcade', sub: 'Retro beeps' },
  { id: 'soft', title: 'Soft', sub: 'Gentle chimes' },
];
const PREVIEW: SoundCue[] = ['buzz', 'correct'];

export function SoundPackPicker({ fx, sound, onPick }: { fx: TvFx; sound: { enabled: boolean; volume: number }; onPick: (p: SoundPack) => void }) {
  const info = useFetch(() => hostApi<PackInfo>('GET', '/api/soundpacks'), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const have = info.data?.cues ?? {};
  const count = Object.keys(have).length;
  // Test buttons on this page play the installed files too.
  useEffect(() => {
    if (info.data) configureSound({ packFiles: info.data.cues });
  }, [info.data]);

  const preview = (p: SoundPack) => {
    unlockAudio();
    configureSound({ enabled: true, volume: sound.volume || 0.7, fx: { ...fx, soundPack: p }, packFiles: have });
    PREVIEW.forEach((cue, i) => setTimeout(() => playCue(cue, { force: true, pack: p }), i * 1300));
    // Back to the saved choice for later Test buttons.
    setTimeout(() => configureSound({ enabled: sound.enabled, volume: sound.volume, fx, packFiles: have }), PREVIEW.length * 1300 + 200);
  };

  const install = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f, f.name);
    setBusy(true);
    const r = await attempt(() => hostApi<PackInfo & { installed: string[]; rejected: { name: string; reason: string }[] }>('POST', '/api/soundpacks/buzzinga', undefined, fd));
    setBusy(false);
    if (!r) return;
    if (r.installed.length) toast(`${r.installed.length} sound file${r.installed.length === 1 ? '' : 's'} added`, 'success');
    for (const x of r.rejected) toast(`${x.name}: ${x.reason}`, 'error');
    void info.reload();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Sound pack">
        {MAIN.map((p) => {
          const on = fx.soundPack === p.id;
          return (
            <div key={p.id} className={cx('flex flex-col rounded-xl border-2 p-3', on ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white')}>
              <button role="radio" aria-checked={on} onClick={() => onPick(p.id)} className="flex min-h-11 flex-1 items-start gap-2 text-left" data-testid={`fx-pack-${p.id}`}>
                <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300')} aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold leading-tight">
                    {p.title}
                    {p.id === 'buzzinga' && <span className="ml-1 font-semibold text-slate-500">(Default)</span>}
                  </span>
                  <span className="block text-xs text-slate-500">{p.id === 'buzzinga' ? (count ? `${count} of ${SOUND_CUES.length} sounds installed` : 'No sound files installed yet') : p.sub}</span>
                </span>
              </button>
              <Button size="sm" variant="ghost" className="mt-1 self-start" onClick={() => preview(p.id)} aria-label={`Preview ${p.title}`}>
                <Play size={14} aria-hidden /> Preview
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Button size="sm" variant={fx.soundPack === 'custom' ? 'secondary' : 'ghost'} aria-pressed={fx.soundPack === 'custom'} onClick={() => onPick('custom')} data-testid="fx-pack-custom">
          <Music size={14} aria-hidden /> Custom (one file per sound)
        </Button>
        <Button size="sm" variant={fx.soundPack === 'off' ? 'secondary' : 'ghost'} aria-pressed={fx.soundPack === 'off'} onClick={() => onPick('off')} data-testid="fx-pack-off">
          <VolumeX size={14} aria-hidden /> Muted
        </Button>
      </div>

      {fx.soundPack === 'buzzinga' && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="buzzinga-files">
          <p className="text-sm text-slate-600">
            This pack plays sound files that you provide; they stay on this computer and are not part of the public download. Each file is recognised by its name (for example <code>board_fill.mp3</code>, <code>buzzed_in.mp3</code>, <code>final_jeopardy_think.mp3</code>). Sounds without a file use the Classic tone.
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {SOUND_CUES.map((cue) => {
              const f = info.data?.files.find((x) => x.cue === cue && x.url === have[cue]);
              return (
                <li key={cue} className="flex min-h-9 items-center gap-2 rounded-lg bg-slate-50 px-2">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', f ? 'bg-green-600' : 'bg-slate-300')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{CUE_LABELS[cue]}</b> <span className="text-slate-500">{f ? `— ${f.name}${f.source === 'bundled' ? ' (built in)' : ''}` : '— Classic tone'}</span>
                  </span>
                  {f?.source === 'installed' && (
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
                      aria-label={`Remove ${f.name}`}
                      onClick={async () => {
                        if (await attempt(() => hostApi('DELETE', `/api/soundpacks/buzzinga/${encodeURIComponent(f.name)}`))) void info.reload();
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="buzzinga-add">
              <FolderOpen size={16} aria-hidden /> {busy ? 'Adding…' : 'Add sound files'}
            </Button>
            <span className="text-xs text-slate-500">MP3, WAV, OGG or M4A, up to 8 MB each. Only use recordings you are allowed to use.</span>
          </div>
          <input ref={fileRef} type="file" multiple accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" className="hidden" onChange={(e) => (void install(e.target.files), (e.target.value = ''))} data-testid="buzzinga-input" />
        </div>
      )}
    </div>
  );
}
