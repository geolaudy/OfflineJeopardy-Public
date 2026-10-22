// R17-15: Settings → Data & Storage → Game Data Location. Shows the folder in use and offers Change
// Location (Windows' folder picker on the game computer, or a typed path), Open Folder and Restore
// Default Location. A change is checked first, then *requested*: the data is copied and verified
// when OfflineJeopardy restarts (server/dataLocation.ts) — the current folder is never deleted.
import { useState } from 'react';
import { FolderInput, FolderOpen, RotateCcw, RefreshCw, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, cx, inputCls } from '../../components/ui';

interface MoveResult {
  ok: boolean;
  from: string;
  to: string;
  at: number;
  message: string;
  keptOld?: string;
}
export interface StorageInfo {
  dataDir: string;
  defaultDir: string | null;
  isDefault: boolean;
  portable: boolean;
  canChange: boolean;
  canPick: boolean;
  canOpen: boolean;
  canRestart: boolean;
  gameRunning: boolean;
  pendingMove: { from: string; to: string; mode: 'copy' | 'use'; requestedAt: number } | null;
  lastMove: MoveResult | null;
  previousDataDir: string | null;
  configuredDir: string | null;
  size: { bytes: number; files: number };
}
interface TargetCheck {
  ok: boolean;
  target: string;
  existingData: boolean;
  needBytes: number;
  freeBytes: number | null;
  error?: string;
  notes: string[];
}

const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function DataStorage() {
  const info = useFetch(() => hostApi<StorageInfo>('GET', '/api/admin/storage'), []);
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [check, setCheck] = useState<TargetCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const v = info.data;
  if (!v) return <p className="text-slate-500">{info.error ?? 'Loading…'}</p>;

  const checkPath = async (p: string) => {
    const r = await attempt(() => hostApi<TargetCheck>('POST', '/api/admin/storage/check', { path: p }));
    if (r) setCheck(r);
  };
  const change = async () => {
    setCheck(null);
    if (!v.canPick) {
      setTyping(true);
      return;
    }
    setBusy(true);
    try {
      const r = await attempt(() => hostApi<{ path: string | null }>('POST', '/api/admin/storage/pick'));
      if (r?.path) await checkPath(r.path);
    } finally {
      setBusy(false);
    }
  };
  const request = async (body: { path?: string; toDefault?: boolean; mode?: 'copy' | 'use' }) => {
    const r = await attempt(() => hostApi<StorageInfo>('POST', '/api/admin/storage/move', body));
    if (r) {
      info.setData(r);
      setCheck(null);
      setTyping(false);
      setTyped('');
    }
  };
  const restart = async () => {
    let force = false;
    if (v.gameRunning) {
      if (!confirm('A game is in progress. It is saved and can be resumed after the restart.\n\nRestart OfflineJeopardy now?')) return;
      force = true;
    }
    const r = await attempt(() => hostApi('POST', '/api/admin/restart', { force }));
    if (r) setRestarting(true);
  };

  return (
    <div className="space-y-4" data-testid="data-location">
      <div>
        <p className="oj-section-label">Game data location</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="min-w-0 font-mono text-base font-semibold break-all text-slate-900" data-testid="data-dir">
            {v.dataDir}
          </p>
          <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', v.isDefault ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-800')}>{v.isDefault ? 'Default' : 'Chosen folder'}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Players, boards, game history, statistics, settings, pictures and sounds — {fmtBytes(v.size.bytes)} in {v.size.files.toLocaleString()} files.
          {v.portable && v.isDefault ? ' (Portable: beside the .exe.)' : ''}
        </p>
      </div>

      {v.configuredDir && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-300" role="status">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden /> This start uses the folder above because the chosen folder <b className="font-mono break-all">{v.configuredDir}</b> was not available. It is tried again at the next start.
        </p>
      )}

      {v.pendingMove ? (
        <div className="space-y-3 rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200" data-testid="data-pending">
          <p className="text-sm text-blue-950">
            {v.pendingMove.mode === 'use' ? 'At the next start OfflineJeopardy uses the game data in ' : 'At the next start your game data is copied to '}
            <b className="font-mono break-all">{v.pendingMove.to}</b>
            {v.pendingMove.mode === 'use' ? '.' : ', checked, and used from there. The current folder stays as it is.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {v.canRestart ? (
              <Button onClick={restart} disabled={restarting} data-testid="data-restart">
                <RefreshCw size={18} aria-hidden /> {restarting ? 'Restarting…' : 'Restart now'}
              </Button>
            ) : (
              <span className="self-center text-sm text-slate-600">Restart OfflineJeopardy on the game computer to finish.</span>
            )}
            <Button variant="ghost" onClick={() => attempt(() => hostApi<StorageInfo>('POST', '/api/admin/storage/cancel')).then((r) => r && info.setData(r))} data-testid="data-cancel">
              <X size={18} aria-hidden /> Cancel the move
            </Button>
          </div>
          {restarting && <p className="text-sm text-slate-600">OfflineJeopardy is restarting — this page reconnects by itself.</p>}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={change} busy={busy} disabled={!v.canChange} data-testid="data-change">
            <FolderInput size={18} aria-hidden /> Change Location…
          </Button>
          <Button variant="ghost" onClick={() => attempt(() => hostApi('POST', '/api/admin/storage/open'))} disabled={!v.canOpen} data-testid="data-open">
            <FolderOpen size={18} aria-hidden /> Open Folder
          </Button>
          {v.canChange && v.canPick && !typing && (
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-blue-700" onClick={() => (setCheck(null), setTyping(true))} data-testid="data-type">
              or type a path
            </button>
          )}
          {!v.isDefault && v.defaultDir && (
            <Button variant="ghost" onClick={() => checkPath(v.defaultDir!)} data-testid="data-default">
              <RotateCcw size={18} aria-hidden /> Restore Default Location
            </Button>
          )}
        </div>
      )}
      {busy && <p className="text-sm text-slate-600" role="status">A folder window is open on the game computer — choose the folder there.</p>}
      {!v.canChange && <p className="text-xs text-slate-500">The location can be changed in the Windows app.</p>}
      {v.canChange && !v.canOpen && !v.pendingMove && <p className="text-xs text-slate-500">Open Folder works in the Windows app (on the game computer).</p>}

      {typing && !v.pendingMove && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) void checkPath(typed.trim());
          }}
        >
          <input className={cx(inputCls, 'min-w-0 flex-1 font-mono')} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="D:\Games\OfflineJeopardy" aria-label="New folder path" spellCheck={false} autoComplete="off" data-testid="data-path" />
          <Button type="submit" variant="secondary" disabled={!typed.trim()} data-testid="data-check">
            Check folder
          </Button>
        </form>
      )}

      {check && !v.pendingMove && (
        <div className={cx('space-y-3 rounded-xl p-3 ring-1', check.ok ? 'bg-white ring-slate-300' : 'bg-red-50 ring-red-300')} data-testid="data-check-result">
          {check.ok ? (
            <>
              <p className="text-sm">
                {samePathish(check.target, v.defaultDir) ? 'Back to the default folder: ' : 'New folder: '}
                <b className="font-mono break-all">{check.target}</b>
              </p>
              <p className="text-xs text-slate-600">
                {check.existingData ? 'It already has OfflineJeopardy game data.' : `Needs ${fmtBytes(check.needBytes)}`}
                {check.freeBytes != null ? ` · ${fmtBytes(check.freeBytes)} free` : ''}
                {check.notes.filter((n) => !/already has/.test(n)).map((n) => ` · ${n}`)}
              </p>
              <p className="text-xs text-slate-600">The move happens when OfflineJeopardy restarts (you choose when). Your current folder is kept — nothing is deleted.</p>
              <div className="flex flex-wrap gap-2">
                {check.existingData ? (
                  <>
                    <Button onClick={() => request({ path: check.target, mode: 'use' })} data-testid="data-use">
                      Use the game data there
                    </Button>
                    <Button variant="secondary" onClick={() => request({ path: check.target, mode: 'copy' })} data-testid="data-replace">
                      Copy my data there (the older data is kept aside)
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => request({ path: check.target, mode: 'copy' })} data-testid="data-move">
                    Move my game data there
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setCheck(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <p className="flex gap-2 text-sm font-semibold text-red-800" role="alert">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden /> {check.error}
            </p>
          )}
        </div>
      )}

      {!v.pendingMove && v.lastMove && (
        <p className={cx('flex gap-2 rounded-xl p-3 text-sm ring-1', v.lastMove.ok ? 'bg-green-50 text-green-900 ring-green-300' : 'bg-red-50 text-red-900 ring-red-300')} data-testid="data-last-move">
          {v.lastMove.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />}
          <span>
            {v.lastMove.message} <span className="text-xs opacity-70">({new Date(v.lastMove.at).toLocaleString()})</span>
          </span>
        </p>
      )}
    </div>
  );
}

function samePathish(a: string, b: string | null) {
  return !!b && a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
}
