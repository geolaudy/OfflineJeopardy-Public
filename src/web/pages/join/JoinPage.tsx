// Smartphone player portal: the single public QR code lands here.
// Select a profile + PIN, or create one; then dashboard, buzzer, stats, history, profile editing.
import { useEffect, useState } from 'react';
import { api, ApiError, meApi, tokens } from '../../lib/api';
import { connect, disconnect, useLive } from '../../lib/socket';
import { useFetch, useProfiles } from '../../lib/hooks';
import { Avatar, Modal, PinPad, cx, toast } from '../../components/ui';
import { ProfileCreateForm } from '../../components/ProfileForm';
import { profileName } from '../../lib/view';
import type { ProfilePublic } from '../../../shared/views';
import PlayTab from './PlayTab';
import ProfileTab from './ProfileTab';
import { HistoryList, ProfileStats } from '../../components/StatsView';

export interface Me extends ProfilePublic {
  preferredBuzzer: string;
  preferredButton: string;
  preferredSide: string;
  preferredKey: string | null;
  statsPrivate: boolean;
  updatedAt: number;
}

export default function JoinPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const profilesVersion = useLive((s) => s.profilesVersion);

  const loadMe = async () => {
    if (!tokens.profile) {
      setMe(null);
      return;
    }
    try {
      setMe(await meApi<Me>('GET', '/api/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        tokens.profile = null;
        setMe(null);
      }
    }
  };

  useEffect(() => {
    loadMe().finally(() => setChecking(false));
  }, []);

  // Re-fetch my profile when any profile changes (e.g. edited from another device or by the host)
  useEffect(() => {
    if (me) void loadMe();
  }, [profilesVersion]);

  useEffect(() => {
    connect('player', () => tokens.profile);
    return () => disconnect();
  }, [me?.id]);

  const signOut = async (forget: boolean) => {
    await meApi('POST', forget ? '/api/me/logout-all' : '/api/me/logout').catch(() => {});
    tokens.profile = null;
    setMe(null);
  };

  if (checking) return <div className="flex h-full items-center justify-center text-slate-500">Loading…</div>;
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col bg-slate-50">
      {me ? <Dashboard me={me} setMe={setMe} signOut={signOut} /> : <SignIn onSignedIn={setMe} />}
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (m: Me) => void }) {
  const profiles = useProfiles();
  const [picked, setPicked] = useState<ProfilePublic | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const list = (profiles.data ?? []).filter((p) => profileName(p).toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()));

  const login = async (pin: string) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; profile: Me }>('POST', `/api/profiles/${picked.id}/login`, { pin });
      tokens.profile = r.token;
      onSignedIn(r.profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col p-4">
      <h1 className="mt-2 text-center text-3xl font-black">Welcome! 👋</h1>
      <p className="mb-4 text-center text-slate-600">Who's playing?</p>
      {(profiles.data?.length ?? 0) > 8 && (
        <input className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Find your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find your name" />
      )}
      <div className="grid grid-cols-3 gap-3">
        {list.map((p) => (
          <button key={p.id} onClick={() => setPicked(p)} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-3 shadow-sm active:bg-slate-100" data-testid="profile-tile">
            <Avatar profile={p} size={56} />
            <span className="w-full truncate text-center text-sm font-semibold">{profileName(p)}</span>
          </button>
        ))}
        <button onClick={() => setCreating(true)} className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-3 text-slate-600" data-testid="new-profile">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-3xl">+</span>
          <span className="text-sm font-semibold">I'm new</span>
        </button>
      </div>
      {profiles.error && <p className="mt-4 text-center text-red-700">{profiles.error}</p>}

      <Modal
        open={!!picked}
        onClose={() => {
          setPicked(null);
          setError(null);
        }}
        title={picked ? `Hi ${profileName(picked)}!` : ''}
      >
        {picked && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <Avatar profile={picked} size={72} />
            </div>
            <PinPad onComplete={login} busy={busy} error={error} label="Enter your 4-digit PIN" />
            <p className="text-center text-xs text-slate-500">Forgot your PIN? Ask the host to reset it.</p>
          </div>
        )}
      </Modal>
      <Modal open={creating} onClose={() => setCreating(false)} title="Create your profile">
        <ProfileCreateForm
          busy={busy}
          onSubmit={async (p) => {
            setBusy(true);
            try {
              const r = await api<{ token: string; profile: Me }>('POST', '/api/profiles', p);
              tokens.profile = r.token;
              onSignedIn(r.profile);
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Modal>
    </div>
  );
}

type Tab = 'play' | 'stats' | 'history' | 'profile';

function Dashboard({ me, setMe, signOut }: { me: Me; setMe: (m: Me) => void; signOut: (forget: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('play');
  const status = useLive((s) => s.status);
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Avatar profile={me} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold" data-testid="me-name">
            {profileName(me)}
          </div>
          <div className="text-xs text-slate-500">{status === 'open' ? 'Connected' : 'Reconnecting…'}</div>
        </div>
      </header>
      <main className="flex-1 p-4 pb-24">
        {tab === 'play' && <PlayTab me={me} />}
        {tab === 'stats' && <MyStats />}
        {tab === 'history' && <MyHistory me={me} />}
        {tab === 'profile' && <ProfileTab me={me} setMe={setMe} signOut={signOut} />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]" role="tablist">
        {(
          [
            ['play', '🔔', 'Play'],
            ['stats', '📊', 'Stats'],
            ['history', '🕘', 'History'],
            ['profile', '🙂', 'Profile'],
          ] as const
        ).map(([k, icon, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('flex min-h-16 flex-1 flex-col items-center justify-center text-xs font-semibold', tab === k ? 'text-blue-700' : 'text-slate-500')}>
            <span className="text-xl">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

function MyStats() {
  const s = useFetch(() => meApi<unknown>('GET', '/api/me/stats'), []);
  if (!s.data) return <p className="text-slate-500">{s.error ?? 'Loading…'}</p>;
  return <ProfileStats stats={s.data} />;
}

function MyHistory({ me }: { me: Me }) {
  const h = useFetch(() => meApi<unknown[]>('GET', '/api/me/history'), []);
  if (!h.data) return <p className="text-slate-500">{h.error ?? 'Loading…'}</p>;
  return <HistoryList rows={h.data} as="profile" highlightProfile={me.id} />;
}

