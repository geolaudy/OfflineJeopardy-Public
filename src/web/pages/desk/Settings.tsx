import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Field, TabBar, cx, inputCls, type TabItem } from '../../components/ui';
import { configureSound } from '../../lib/sound';
import type { TvFx } from '../../../shared/tvFx';
import { PresentationSettings } from './PresentationSettings';
import { ShowSettingsOnTv } from '../host/ShowSettingsOnTv';
import { AiSettings } from './AiSettings';
import { desktop } from '../../lib/desktop';
import { Palette, ChevronRight, Download, Upload, Gamepad2, Users, Tv, Volume2, Wifi, HardDrive, Wrench } from 'lucide-react';
import { act, useLive } from '../../lib/socket';
import type { GameRules } from '../../../shared/game';
import { RULES_SECTIONS, RulesFields } from '../host/RulesEditor';
import { NetworkInfo, type Info } from './Connect';
import { DataStorage } from './DataStorage';
import { keyboardDebugEnabled, setKeyboardDebug } from '../../lib/keyboard';

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

type TabId = 'gameplay' | 'players' | 'display' | 'sound' | 'network' | 'data' | 'advanced';
/** R17-14: the host's settings in tabs, each meant to fit an iPad in landscape without scrolling. */
const TABS: TabItem<TabId>[] = [
  { id: 'gameplay', label: 'Gameplay', icon: Gamepad2 },
  { id: 'players', label: 'Players & Bots', icon: Users },
  { id: 'display', label: 'TV & Display', icon: Tv },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'network', label: 'Network', icon: Wifi },
  { id: 'data', label: 'Data & Storage', icon: HardDrive },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

export default function Settings() {
  const s = useFetch(() => hostApi<S>('GET', '/api/settings'), []);
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'gameplay';
  const setTab = (t: TabId) => setParams(t === 'gameplay' ? {} : { tab: t }, { replace: true });
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
    <div className="mx-auto max-w-6xl space-y-3 p-4 lg:px-6 lg:py-4" data-testid="settings">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-black lg:text-3xl">Settings</h1>
        <ShowSettingsOnTv size="md" />
      </div>
      <TabBar tabs={TABS} value={tab} onChange={setTab} label="Settings" testId="settings-tab" />
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid={`settings-panel-${tab}`}>
        {tab === 'gameplay' && <GameplayTab />}
        {tab === 'players' && (
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[2fr_3fr]">
            <section className="space-y-3">
              <p className="oj-section-label">Leaderboards & privacy</p>
              <Toggle label="Players can see the leaderboard" checked={v.publicLeaderboard} onChange={(x) => set({ publicLeaderboard: x })} hint="Players can always hide their own statistics from their profile." />
              <div className="grid gap-3 sm:grid-cols-2" data-testid="leaderboard-thresholds">
                <Field label="Ranked by win % and average after" hint="Games played. Fewer games are listed as not ranked yet.">
                  <NumberSetting value={v.leaderboardThresholds.games} min={1} max={100} unit="games" onCommit={(games) => set({ leaderboardThresholds: { ...v.leaderboardThresholds, games } })} />
                </Field>
                <Field label="Ranked by accuracy after" hint="Answers given (right or wrong).">
                  <NumberSetting value={v.leaderboardThresholds.answers} min={1} max={500} unit="answers" onCommit={(answers) => set({ leaderboardThresholds: { ...v.leaderboardThresholds, answers } })} />
                </Field>
              </div>
              <p className="text-sm text-slate-600">
                Profiles, teams and controllers:{' '}
                <Link className="font-semibold text-blue-700" to="/host/players">
                  Players
                </Link>{' '}
                ·{' '}
                <Link className="font-semibold text-blue-700" to="/host/teams">
                  Teams
                </Link>{' '}
                ·{' '}
                <Link className="font-semibold text-blue-700" to="/host/buzzers">
                  Buzzers
                </Link>
              </p>
            </section>
            <section className="space-y-3">
              <p className="oj-section-label">Computer opponents: AI answers (optional)</p>
              <AiSettings />
            </section>
          </div>
        )}
        {tab === 'display' && (
          <div className="space-y-5" data-testid="tv-presentation-settings">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-slate-700">
                The TV uses <b>{v.boardTheme.startsWith('custom:') ? 'a custom theme' : (BOARD_THEMES.find(([id]) => id === v.boardTheme)?.[1] ?? 'Classic')}</b>.
              </p>
              <Link to="/host/themes" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">
                <Palette size={18} className="mr-2" aria-hidden /> Choose or customize the TV theme
              </Link>
            </div>
            <PresentationSettings
              part="display"
              fx={v.tvFx}
              sound={{ enabled: v.sound, volume: v.volume }}
              onSave={(tvFx) => set({ tvFx })}
              extra={<Toggle label="Reduce motion on the game board" hint="Fades instead of zooms and swipes (older TV computers)." checked={v.reducedMotion} onChange={(x) => set({ reducedMotion: x })} />}
            />
          </div>
        )}
        {tab === 'sound' && (
          <div className="space-y-4">
            <div className="grid items-center gap-x-8 gap-y-2 sm:grid-cols-2">
              <Toggle label="Sound effects on the game board" checked={v.sound} onChange={(x) => set({ sound: x })} />
              <Field label={`Volume ${Math.round(v.volume * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={v.volume} onChange={(e) => s.setData({ ...v, volume: Number(e.target.value) })} onMouseUp={() => set({ volume: v.volume })} onTouchEnd={() => set({ volume: v.volume })} className="w-full" />
              </Field>
            </div>
            <SoundViews fx={v.tvFx} sound={{ enabled: v.sound, volume: v.volume }} onSave={(tvFx) => set({ tvFx })} />
          </div>
        )}
        {tab === 'network' && <NetworkTab trustLocalhost={v.trustLocalhost} onTrust={(x) => set({ trustLocalhost: x })} />}
        {tab === 'data' && (
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[3fr_2fr]">
            <DataStorage />
            <BackupRestore />
          </div>
        )}
        {tab === 'advanced' && <AdvancedTab />}
      </div>
    </div>
  );
}

/** R17-14: the rules of the game that is open (lobby or game in progress) — the same controls as the
 *  Rules & timers dialog, in three columns; changes apply when saved. */
function GameplayTab() {
  const g = useLive((x) => x.game);
  const [draft, setDraft] = useState<GameRules | null>(null);
  const gid = g?.id;
  useEffect(() => setDraft(null), [gid]);
  if (!g)
    return (
      <div className="space-y-2 text-slate-700" data-testid="settings-no-game">
        <p className="font-semibold">Game rules belong to each game.</p>
        <p className="text-sm">Open a lobby (Home) to set its rules here — timers, scoring, Daily Double! wagers, the Final, joining and buzzing. A new game starts from the Classic preset, with the host typing Daily Double! wagers.</p>
      </div>
    );
  const r = draft ?? g.rules;
  const dirty = !!draft;
  return (
    <div className="space-y-4" data-testid="settings-rules">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-600">
          Rules for <b className="text-slate-900">{g.title}</b>
          {g.phase === 'lobby' ? ' (lobby)' : ' — changes apply from the next clue'}.
        </p>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(null)}>
          Undo changes
        </Button>
        <Button
          disabled={!dirty}
          onClick={async () => {
            const res = await act({ type: 'updateRules', rules: r });
            if (res.ok) setDraft(null);
          }}
          data-testid="settings-rules-save"
        >
          Save rules
        </Button>
      </div>
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
        {RULES_SECTIONS.map((sec) => (
          <section key={sec.id} className="min-w-0">
            <p className="oj-section-label">{sec.label}</p>
            <RulesFields r={r} setR={setDraft} section={sec.id} />
          </section>
        ))}
      </div>
    </div>
  );
}

/** R17-14: the sound pack and the single sounds as two views of the Sound tab (a small segmented
 *  control), so each fits the screen. */
function SoundViews(props: { fx: TvFx; sound: { enabled: boolean; volume: number }; onSave: (fx: TvFx) => Promise<void> }) {
  const [view, setView] = useState<'soundPack' | 'soundCues'>('soundPack');
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Sound settings">
        {(
          [
            ['soundPack', 'Sound pack'],
            ['soundCues', 'Each sound'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)} className={cx('min-h-10 rounded-lg px-4 text-sm font-semibold', view === k ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')} data-testid={`sound-view-${k}`}>
            {label}
          </button>
        ))}
      </div>
      <PresentationSettings part={view} {...props} />
    </div>
  );
}

function NetworkTab({ trustLocalhost, onTrust }: { trustLocalhost: boolean; onTrust: (v: boolean) => void }) {
  const info = useFetch(() => api<Info>('GET', '/api/info'), []);
  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[3fr_2fr]">
      <section className="space-y-3">
        <p className="oj-section-label">Local network</p>
        <NetworkInfo info={info.data ?? null} onChange={() => void info.reload()} />
      </section>
      <section className="space-y-3">
        <p className="oj-section-label">Host access</p>
        <Toggle label="This computer is always the host" hint="Browsers on the game computer itself get host access without the host code. Turn off on shared computers." checked={trustLocalhost} onChange={onTrust} />
        <p className="text-sm text-slate-600">The Wi-Fi name and password shown on the TV are set in each lobby (left column, Wi-Fi). No internet is needed — only the local network.</p>
      </section>
    </div>
  );
}

function BackupRestore() {
  const restoreRef = useRef<HTMLInputElement>(null);
  const d = desktop();
  return (
    <section className="space-y-3">
      <p className="oj-section-label">Backup & restore</p>
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
    </section>
  );
}

function AdvancedTab() {
  const diag = useFetch(() => hostApi<{ integrity: string; schemaVersion: number; dataDir: string; version: string }>('GET', '/api/admin/diagnostics'), []);
  // R7-31: developer tools exist only when the server runs with them on (never in a release).
  const dev = useFetch(() => api<{ devTools?: boolean }>('GET', '/api/info'), []).data?.devTools;
  const [kb, setKb] = useState(keyboardDebugEnabled);
  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
      <section className="space-y-2 text-sm text-slate-600">
        <p className="oj-section-label">About this installation</p>
        <p>
          Version <b className="text-slate-900">{diag.data?.version}</b> · database schema v{diag.data?.schemaVersion} · integrity check: {diag.data?.integrity}
        </p>
        <p className="font-mono break-all">Data folder: {diag.data?.dataDir}</p>
        {dev && (
          <Link to="/host/dev" className="inline-flex min-h-11 items-center font-semibold text-blue-700" data-testid="devtools-link">
            Developer tools <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </section>
      <section className="space-y-2">
        <p className="oj-section-label">Troubleshooting (this device)</p>
        {/* R17-5: what the on-screen keyboard and the scroll areas do, for a report from the real iPad. */}
        <Toggle
          label="Show keyboard diagnostics on this device"
          hint="A small log in the corner while typing (screen size, keyboard, scrolling). Turn it on only if a field disappears under the keyboard, and send a screenshot."
          checked={kb}
          onChange={(x) => {
            setKeyboardDebug(x);
            setKb(x);
          }}
        />
      </section>
    </div>
  );
}
