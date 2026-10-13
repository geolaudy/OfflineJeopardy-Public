import { useEffect, useRef, useState } from 'react';
import { downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Card, Field, cx } from '../../components/ui';
import { configureSound, sfx } from '../../lib/sound';
import { desktop } from '../../lib/desktop';

interface S {
  preferredAddress: string | null;
  trustLocalhost: boolean;
  publicLeaderboard: boolean;
  theme: string;
  boardTheme: string;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
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

function ThemePreview({ theme }: { theme: string }) {
  return (
    <div className="board-theme overflow-hidden rounded-xl p-2" data-theme={theme} aria-hidden>
      <div className="grid grid-cols-4 gap-1">
        {['HISTORY', 'SCIENCE', 'SPORTS', 'MUSIC'].map((c) => (
          <div key={c} className="b-cat p-1 text-center text-[9px] font-black">
            {c}
          </div>
        ))}
        {[200, 400].flatMap((v) =>
          [0, 1, 2, 3].map((i) =>
            i === 2 && v === 200 ? (
              <div key={`${v}${i}`} className="b-used" />
            ) : (
              <div key={`${v}${i}`} className="b-tile py-1 text-center text-sm font-black">
                {v}
              </div>
            ),
          ),
        )}
      </div>
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
    if (s.data) configureSound({ enabled: s.data.sound, volume: s.data.volume });
  }, [s.data]);
  if (!s.data) return <div className="p-6">{s.error ?? 'Loading…'}</div>;
  const v = s.data;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-3xl font-black">Settings</h1>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Game board look</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BOARD_THEMES.map(([id, label]) => (
            <button key={id} onClick={() => set({ boardTheme: id })} className={cx('rounded-xl border-2 p-1 text-left', v.boardTheme === id ? 'border-blue-700' : 'border-transparent')} aria-pressed={v.boardTheme === id}>
              <ThemePreview theme={id} />
              <div className="mt-1 px-1 text-sm font-semibold">{label}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">The TV updates right away.</p>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Sound & motion</h2>
        <Toggle label="Sound effects on the game board" checked={v.sound} onChange={(x) => set({ sound: x })} />
        <Field label={`Volume ${Math.round(v.volume * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={v.volume} onChange={(e) => s.setData({ ...v, volume: Number(e.target.value) })} onMouseUp={() => set({ volume: v.volume })} onTouchEnd={() => set({ volume: v.volume })} className="w-full" />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => sfx.buzz()}>
            Test buzz
          </Button>
          <Button variant="secondary" size="sm" onClick={() => sfx.correct()}>
            Test correct
          </Button>
          <Button variant="secondary" size="sm" onClick={() => sfx.dailyWager()}>
            Test Daily Wager
          </Button>
        </div>
        <Toggle label="Reduce motion on the game board" checked={v.reducedMotion} onChange={(x) => set({ reducedMotion: x })} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Privacy</h2>
        <Toggle label="Players can see the leaderboard" checked={v.publicLeaderboard} onChange={(x) => set({ publicLeaderboard: x })} hint="Players can always hide their own statistics from their profile." />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Backup & restore</h2>
        <p className="text-sm text-slate-600">A full backup (.zip) contains boards, players (PINs stay hashed), teams, statistics, history, profile pictures and clue media. Restoring accepts a full .zip backup or an older database-only .db backup.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => attempt(() => downloadFile('/api/admin/backup', `offlinejeopardy-backup-${new Date().toISOString().slice(0, 10)}.zip`))} data-testid="backup-full">
            ⬇ Download full backup
          </Button>
          <Button variant="ghost" onClick={() => attempt(() => downloadFile('/api/admin/backup?media=0', `offlinejeopardy-database-${new Date().toISOString().slice(0, 10)}.db`))}>
            Database only
          </Button>
          <Button variant="secondary" onClick={() => restoreRef.current?.click()}>
            ⬆ Restore from backup…
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
        {advanced ? '▾' : '▸'} Advanced
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
