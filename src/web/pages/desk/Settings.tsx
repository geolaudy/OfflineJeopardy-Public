import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Card, Field, cx, inputCls } from '../../components/ui';
import { configureSound } from '../../lib/sound';
import type { TvFx } from '../../../shared/tvFx';
import { PresentationSettings } from './PresentationSettings';
import { ShowSettingsOnTv } from '../host/ShowSettingsOnTv';
import { AiSettings } from './AiSettings';
import { desktop } from '../../lib/desktop';
import { Palette, ChevronRight, ChevronDown, Download, Upload } from 'lucide-react';

interface S {
  preferredAddress: string | null;
  trustLocalhost: boolean;
  publicLeaderboard: boolean;
  theme: string;
  boardTheme: string;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
  tvFx: TvFx;
  leaderboardThresholds: { games: number; answers: number };
}

export const BOARD_THEMES: [string, string][] = [
  ['classic', 'Classic Game Show'],
  ['modern', 'Modern Minimal'],
  ['dark', 'Dark Mode'],
  ['neon', 'Neon Arcade'],
  ['retro', 'Retro Television'],
  ['classroom', 'Classroom'],
  ['corporate', 'Corporate'],
  ['contrast', 'High Contrast'],
];

/** A whole number saved when the field is left (not on every keystroke). */
function NumberSetting({ value, min, max, unit, onCommit }: { value: number; min: number; max: number; unit: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  // A saved value arriving from the server must not overwrite what is being typed (it reset the
  // field when the host typed again right after a save, and the new number was then lost).
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  const commit = () => {
    editing.current = false;
    const n = Math.min(max, Math.max(min, Math.round(Number(text) || min)));
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <div className="flex items-center gap-2">
      <input className={cx(inputCls, 'w-24')} inputMode="numeric" value={text} onChange={(e) => {
          editing.current = true;
          setText(e.target.value.replace(/[^0-9]/g, ''));
        }} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={`Minimum ${unit}`} />
      <span className="text-sm text-slate-600">{unit}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function Settings() {
  const s = useFetch(() => hostApi<S>('GET', '/api/settings'), []);
  const diag = useFetch(() => hostApi<{ integrity: string; schemaVersion: number; dataDir: string; version: string }>('GET', '/api/admin/diagnostics'), []);
  const [advanced, setAdvanced] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const d = desktop();
  const set = async (patch: Partial<S>) => {
    const r = await attempt(() => hostApi<S>('PUT', '/api/settings', patch));
    if (r) s.setData(r);
  };
  useEffect(() => {
    if (s.data) configureSound({ enabled: s.data.sound, volume: s.data.volume, fx: s.data.tvFx });
  }, [s.data]);
  if (!s.data) return <div className="p-6">{s.error ?? 'Loading…'}</div>;
  const v = s.data;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-3xl font-black">Settings</h1>
        <ShowSettingsOnTv size="md" />
      </div>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Game board look</h2>
        <p className="text-slate-700">
          The TV uses{' '}
          <b>{v.boardTheme.startsWith('custom:') ? 'a custom theme' : (BOARD_THEMES.find(([id]) => id === v.boardTheme)?.[1] ?? 'Classic')}</b>.
        </p>
        <Link to="/host/themes" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">
          <Palette size={18} className="mr-2" aria-hidden /> Choose or customize the TV theme
        </Link>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Sound & motion</h2>
        <Toggle label="Sound effects on the game board" checked={v.sound} onChange={(x) => set({ sound: x })} />
        <Field label={`Volume ${Math.round(v.volume * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={v.volume} onChange={(e) => s.setData({ ...v, volume: Number(e.target.value) })} onMouseUp={() => set({ volume: v.volume })} onTouchEnd={() => set({ volume: v.volume })} className="w-full" />
        </Field>
        <Toggle label="Reduce motion on the game board" checked={v.reducedMotion} onChange={(x) => set({ reducedMotion: x })} />
      </Card>
      <Card className="space-y-3" data-testid="tv-presentation-settings">
        <h2 className="text-lg font-bold">TV presentation</h2>
        <PresentationSettings fx={v.tvFx} sound={{ enabled: v.sound, volume: v.volume }} onSave={(tvFx) => set({ tvFx })} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Computer opponents: AI answers (optional)</h2>
        <AiSettings />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Leaderboards & privacy</h2>
        <Toggle label="Players can see the leaderboard" checked={v.publicLeaderboard} onChange={(x) => set({ publicLeaderboard: x })} hint="Players can always hide their own statistics from their profile." />
        <div className="grid gap-3 sm:grid-cols-2" data-testid="leaderboard-thresholds">
          <Field label="Ranked by win % and average after" hint="Games played. Fewer games are listed as not ranked yet.">
            <NumberSetting value={v.leaderboardThresholds.games} min={1} max={100} unit="games" onCommit={(games) => set({ leaderboardThresholds: { ...v.leaderboardThresholds, games } })} />
          </Field>
          <Field label="Ranked by accuracy after" hint="Answers given (right or wrong).">
            <NumberSetting value={v.leaderboardThresholds.answers} min={1} max={500} unit="answers" onCommit={(answers) => set({ leaderboardThresholds: { ...v.leaderboardThresholds, answers } })} />
          </Field>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Backup & restore</h2>
        <p className="text-sm text-slate-600">A full backup (.zip) contains boards, players (PINs stay hashed), teams, statistics, history, profile pictures and clue media. Restoring accepts a full .zip backup or an older database-only .db backup.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => attempt(() => downloadFile('/api/admin/backup', `offlinejeopardy-backup-${new Date().toISOString().slice(0, 10)}.zip`))} data-testid="backup-full">
            <Download size={18} aria-hidden /> Download full backup
          </Button>
          <Button variant="ghost" onClick={() => attempt(() => downloadFile('/api/admin/backup?media=0', `offlinejeopardy-database-${new Date().toISOString().slice(0, 10)}.db`))}>
            Database only
          </Button>
          <Button variant="secondary" onClick={() => restoreRef.current?.click()}>
            <Upload size={18} aria-hidden /> Restore from backup…
          </Button>
          {d && (
            <Button variant="ghost" onClick={() => d.openDataFolder()}>
              Open data folder
            </Button>
          )}
          <input
            ref={restoreRef}
            type="file"
            accept=".zip,.db,application/zip,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !confirm('Restore this backup? Everything since the backup will be replaced (a safety copy of the current data is kept).')) return;
              const fd = new FormData();
              fd.append('file', f);
              const r = await attempt(() => hostApi<{ message: string }>('POST', '/api/admin/restore', undefined, fd));
              if (r) {
                if (d && confirm(`${r.message}\n\nRestart now?`)) void d.relaunch();
                else alert(r.message);
              }
            }}
          />
        </div>
      </Card>
      <button className="font-semibold text-blue-700" onClick={() => setAdvanced((a) => !a)}>
        {advanced ? <ChevronDown size={16} className="mr-1 inline align-[-3px]" aria-hidden /> : <ChevronRight size={16} className="mr-1 inline align-[-3px]" aria-hidden />}
          Advanced
      </button>
      {advanced && (
        <Card className="space-y-3">
          <Toggle
            label="This computer is always the host"
            hint="Browsers on the game computer itself get host access without the host code. Turn off on shared computers."
            checked={v.trustLocalhost}
            onChange={(x) => set({ trustLocalhost: x })}
          />
          <div className="text-sm text-slate-600">
            <p>Version {diag.data?.version} · database schema v{diag.data?.schemaVersion} · integrity check: {diag.data?.integrity}</p>
            <p className="font-mono break-all">Data folder: {diag.data?.dataDir}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
