// R12-13: the Wi-Fi players should join, shown on the TV next to the join QR. The network name is
// read from Windows when the game runs over Wi-Fi; the password only when the host asks to show it
// (Windows may keep it protected — then the host types it). Off by default; the password stays
// hidden on the TV until the host reveals it. Nothing here is saved: it ends with the lobby.
// R14-5: when Windows keeps the password for administrators, the host can approve one elevated
// read (Windows' permission prompt on the game computer); a Mobile Hotspot run by this computer is
// found too.
import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Wifi } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { Button, cx, inputCls, toast } from '../../components/ui';

interface WifiView {
  detected: { ssid: string; adapter: string; kind: 'wifi' | 'hotspot' } | null;
  canElevate?: boolean;
  reason: 'unsupported' | 'ethernet' | 'not-connected' | null;
  show: boolean;
  showPassword: boolean;
  manualSsid: string;
  hasManualPassword: boolean;
  autoPassword: 'unknown' | 'open' | 'known';
  passwordStatus?: 'not-available' | 'declined';
  shared: { ssid: string; password: boolean } | null;
}

const REASONS: Record<NonNullable<WifiView['reason']>, string> = {
  unsupported: 'The network name can be read on Windows only — type it below.',
  ethernet: 'This computer hosts the game over a cable (Ethernet), so its Wi-Fi name is not used — type the Wi-Fi players should join.',
  'not-connected': 'This computer is not connected to a Wi-Fi network — type the Wi-Fi players should join.',
};

export function WifiShare() {
  const [v, setV] = useState<WifiView | null>(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    hostApi<WifiView>('GET', '/api/host/wifi').then(
      (r) => {
        setV(r);
        setSsid(r.manualSsid);
      },
      () => setV(null),
    );
  }, []);
  const update = async (patch: Partial<Pick<WifiView, 'show' | 'showPassword' | 'manualSsid'>> & { manualPassword?: string }) => {
    const before = v;
    // The switches move at once; the server's answer then replaces the whole view.
    setV((x) => x && { ...x, ...(patch.show !== undefined ? { show: patch.show } : {}), ...(patch.showPassword !== undefined ? { showPassword: patch.showPassword } : {}) });
    setBusy(true);
    try {
      const r = await hostApi<WifiView>('PUT', '/api/host/wifi', patch);
      setV(r);
      setUnavailable(r.passwordStatus === 'not-available');
      setReveal(null);
    } catch (e) {
      setV(before);
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const elevate = async () => {
    setBusy(true);
    try {
      const r = await hostApi<WifiView>('POST', '/api/host/wifi/elevate');
      setV(r);
      setDeclined(r.passwordStatus === 'declined');
      setUnavailable(r.passwordStatus === 'not-available');
      if (!r.passwordStatus) toast('Password read from Windows', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!v) return null;
  const name = v.manualSsid || v.detected?.ssid || '';
  const needsTyping = !v.detected && !v.manualSsid;
  return (
    <div className="space-y-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5" data-testid="wifi-share">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={v.show} disabled={busy} onChange={(e) => update({ show: e.target.checked })} data-testid="wifi-show" />
        <span className="text-sm">
          <Wifi size={15} className="mr-1 inline align-[-2px]" aria-hidden />
          <b>Show Wi-Fi information</b> on the TV next to the QR code
        </span>
      </label>
      {/* R13-10: what was found (or why nothing was) only matters once the host shares the Wi-Fi. */}
      {(v.show || v.detected) && (
      <p className="text-sm text-slate-600" data-testid="wifi-detected">
        {v.detected ? (
          <>
            Wi-Fi network: <b>{v.detected.ssid}</b> <span className="text-slate-500">{v.detected.kind === 'hotspot' ? "(this computer's Mobile Hotspot)" : '(found on this computer)'}</span>
          </>
        ) : (
          v.reason && REASONS[v.reason]
        )}
      </p>
      )}
      {/* R13-10: the typing form opens by itself only when it is needed (shown on the TV, nothing found). */}
      <details open={(v.show && needsTyping) || !!v.manualSsid || v.hasManualPassword} className="text-sm">
        <summary className="min-h-9 cursor-pointer content-center font-semibold text-blue-700">{v.detected ? 'Use another network name or password' : 'Network name and password'}</summary>
        <form
          className="mt-1 grid grid-cols-[1fr_1fr_auto] gap-1.5"
          // R16-5: the name, the password and Save come into view together above the keyboard.
          data-keep-visible
          onSubmit={(e) => {
            e.preventDefault();
            void update({ manualSsid: ssid, ...(password ? { manualPassword: password } : {}) }).then(() => setPassword(''));
          }}
        >
          <input className={inputCls} value={ssid} maxLength={32} onChange={(e) => setSsid(e.target.value)} placeholder="Wi-Fi name" aria-label="Wi-Fi name" autoComplete="off" data-testid="wifi-ssid" />
          <input className={inputCls} type="password" value={password} maxLength={63} onChange={(e) => setPassword(e.target.value)} placeholder={v.hasManualPassword ? 'Password (saved for this lobby)' : 'Password'} aria-label="Wi-Fi password" autoComplete="off" data-testid="wifi-password" />
          <Button type="submit" variant="secondary" disabled={busy} data-testid="wifi-save">
            Save
          </Button>
        </form>
        {(v.manualSsid || v.hasManualPassword) && (
          <Button size="sm" variant="ghost" className="mt-1" disabled={busy} onClick={() => update({ manualSsid: '', manualPassword: '' }).then(() => setSsid(''))}>
            Clear typed details
          </Button>
        )}
      </details>
      {v.show && name && (
        <div className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={v.showPassword} disabled={busy} onChange={(e) => update({ showPassword: e.target.checked })} data-testid="wifi-show-password" />
            <span className="text-sm">
              <b>Show the password</b> on the TV (everyone in the room can read it)
            </span>
          </label>
          {v.showPassword && v.shared && !v.shared.password && (
            <p className={cx('rounded-lg px-3 py-2 text-sm', v.autoPassword === 'open' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900')} data-testid="wifi-password-status">
              {v.autoPassword === 'open'
                ? 'This network has no password.'
                : declined
                  ? 'The Windows permission prompt was cancelled. Try again, or type the password above.'
                  : unavailable || v.autoPassword === 'unknown'
                    ? v.canElevate
                      ? 'Windows keeps this saved password for administrators. Read it with administrator approval, or type it above.'
                      : 'Windows did not hand out the saved password (an enterprise network, or no saved password). Type it above to show it.'
                    : 'No password to show yet — type it above.'}
            </p>
          )}
          {v.showPassword && v.canElevate && v.shared && !v.shared.password && v.autoPassword !== 'open' && (
            <div className="space-y-1">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void elevate()} data-testid="wifi-elevate">
                <ShieldCheck size={16} aria-hidden /> Read it with administrator approval
              </Button>
              <p className="text-xs text-slate-500">A Windows permission prompt opens on the game computer — approve it there. Only this one read runs with administrator rights; the password stays in memory for this lobby and is never saved or logged.</p>
            </div>
          )}
          {v.shared?.password && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              Password on the TV: <span className="font-mono" data-testid="wifi-password-shown">{reveal ?? '••••••••'}</span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-200"
                aria-label={reveal ? 'Hide the password' : 'Show the password here'}
                onClick={async () => setReveal(reveal ? null : (await hostApi<{ password: string }>('POST', '/api/host/wifi/reveal')).password)}
                data-testid="wifi-reveal"
              >
                {reveal ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
