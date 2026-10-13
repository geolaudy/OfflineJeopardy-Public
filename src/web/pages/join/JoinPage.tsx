// Smartphone player portal: the single public QR code lands here.
// Select a profile + PIN, or create one; then the signed-in portal with URL routes (so the
// browser Back button works), a consistent header and a navigation drawer.
import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, meApi, tokens } from '../../lib/api';
import { connect, disconnect, useLive } from '../../lib/socket';
import { useFetch, useProfiles } from '../../lib/hooks';
import { Avatar, Drawer, Modal, PageHeader, PinPad, cx, toast, type NavItem } from '../../components/ui';
import { ProfileCreateForm } from '../../components/ProfileForm';
import { profileName } from '../../lib/view';
import type { ProfilePublic } from '../../../shared/views';
import PlayTab from './PlayTab';
import ProfileTab from './ProfileTab';
import { ProfileStats } from '../../components/StatsView';

const Leaderboard = lazy(() => import('./Leaderboard'));
const PlayersList = lazy(() => import('./Players').then((m) => ({ default: m.PlayersList })));
const PlayerPage = lazy(() => import('./Players').then((m) => ({ default: m.PlayerPage })));
const HistoryPage = lazy(() => import('./HistoryPages').then((m) => ({ default: m.HistoryPage })));
const GameDetailPage = lazy(() => import('./HistoryPages').then((m) => ({ default: m.GameDetailPage })));

export interface Me extends ProfilePublic {
  preferredBuzzer: string;
  preferredButton: string;
  preferredSide: string;
  preferredKey: string | null;
  statsPrivate: boolean;
  updatedAt: number;
}

export const JOIN_NAV: NavItem[] = [
  { to: '/join', label: 'Current game', icon: '🔔', end: true, testId: 'nav-play' },
  { to: '/join/profile', label: 'My profile', icon: '🙂', testId: 'nav-profile' },
  { to: '/join/stats', label: 'My statistics', icon: '📊', testId: 'nav-stats' },
  { to: '/join/history', label: 'Game history', icon: '🕘', testId: 'nav-history' },
  { to: '/join/leaderboard', label: 'Leaderboard', icon: '🏆', testId: 'nav-leaderboard' },
  { to: '/join/players', label: 'Players', icon: '👥', testId: 'nav-players' },
  { to: '/join/settings', label: 'Settings', icon: '⚙️', testId: 'nav-settings' },
];

/** Page titles; detail pages (with a parent) get a back arrow instead of the menu button. */
const PAGES: { path: string; title: string; parent?: string }[] = [
  { path: '/join', title: 'Current game' },
  { path: '/join/profile', title: 'My profile' },
  { path: '/join/stats', title: 'My statistics' },
  { path: '/join/history', title: 'Game history' },
  { path: '/join/history/:gameId', title: 'Game details', parent: '/join/history' },
  { path: '/join/leaderboard', title: 'Leaderboard' },
  { path: '/join/players', title: 'Players' },
  { path: '/join/players/:id', title: 'Player', parent: '/join/players' },
  { path: '/join/settings', title: 'Settings' },
];

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

  if (checking) return <div className="app-screen flex items-center justify-center text-slate-500">Loading…</div>;
  return (
    <div className="app-screen flex flex-col bg-slate-50">
      {me ? <Portal me={me} setMe={setMe} signOut={signOut} /> : <SignIn onSignedIn={setMe} />}
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
    <>
      <PageHeader title="OfflineJeopardy" subtitle="Player sign-in" />
      <main className="scroll-area min-h-0 flex-1">
        <div className="mx-auto max-w-xl pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <h2 className="mt-2 text-center text-3xl font-black">Welcome! 👋</h2>
          <p className="mb-4 text-center text-slate-600">Who's playing?</p>
          {(profiles.data?.length ?? 0) > 8 && (
            <input className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base" placeholder="Find your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find your name" />
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
        </div>
      </main>

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
    </>
  );
}

function Portal({ me, setMe, signOut }: { me: Me; setMe: (m: Me) => void; signOut: (forget: boolean) => void }) {
  const [menu, setMenu] = useState(false);
  const status = useLive((s) => s.status);
  const phase = useLive((s) => s.game?.phase);
  const inGame = useLive((s) => !!s.me?.competitorId);
  const location = useLocation();
  const navigate = useNavigate();
  const page = PAGES.find((p) => matchPath(p.path, location.pathname)) ?? PAGES[0];
  const onPlay = page.path === '/join';
  // A live clue while the player is reading stats: offer a one-tap way back to the buzzer.
  const live = inGame && (phase === 'clue' || phase === 'final') && !onPlay;

  useEffect(() => setMenu(false), [location.pathname]);

  const back = () => {
    // In-app history exists → real browser back; deep link → go to the parent page.
    if (location.key !== 'default' && window.history.length > 1) navigate(-1);
    else navigate(page.parent ?? '/join');
  };

  return (
    <>
      <PageHeader
        title={page.title}
        subtitle={status === 'open' ? profileName(me) : 'Reconnecting…'}
        onMenu={page.parent ? undefined : () => setMenu(true)}
        onBack={page.parent ? back : undefined}
        right={
          live ? (
            <NavLink to="/join" className="mr-1 flex min-h-11 items-center rounded-full bg-red-600 px-4 text-sm font-bold text-white" data-testid="back-to-buzzer">
              🔔 Buzzer
            </NavLink>
          ) : (
            <NavLink to="/join/profile" aria-label="My profile" className="mr-1 flex h-11 w-11 items-center justify-center rounded-full">
              <Avatar profile={me} size={34} />
            </NavLink>
          )
        }
      />
      <span className="sr-only" data-testid="me-name">
        {profileName(me)}
      </span>
      <main className="scroll-area min-h-0 flex-1" id="portal-main">
        <div className={cx('mx-auto pt-4 pb-[max(env(safe-area-inset-bottom),24px)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]', page.path.startsWith('/join/leaderboard') ? 'max-w-2xl' : 'max-w-xl')}>
          <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
            <Routes>
              <Route index element={<PlayTab me={me} />} />
              <Route path="profile" element={<ProfileTab me={me} setMe={setMe} signOut={signOut} view="profile" />} />
              <Route path="settings" element={<ProfileTab me={me} setMe={setMe} signOut={signOut} view="settings" />} />
              <Route path="stats" element={<MyStats />} />
              <Route path="history" element={<HistoryPage me={me} />} />
              <Route path="history/:gameId" element={<GameDetailPage me={me} />} />
              <Route path="leaderboard" element={<Leaderboard me={me} />} />
              <Route path="players" element={<PlayersList me={me} />} />
              <Route path="players/:id" element={<PlayerPage me={me} />} />
              <Route path="*" element={<Navigate to="/join" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <Drawer
        open={menu}
        onClose={() => setMenu(false)}
        title={
          <div className="flex items-center gap-3">
            <Avatar profile={me} size={40} />
            <div className="min-w-0">
              <div className="truncate font-bold">{profileName(me)}</div>
              <div className="text-xs text-slate-500">{status === 'open' ? 'Connected' : 'Reconnecting…'}</div>
            </div>
          </div>
        }
      >
        <ul className="space-y-1">
          {JOIN_NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                data-testid={n.testId}
                className={({ isActive }) => cx('flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold', isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100')}
              >
                <span aria-hidden className="w-6 text-center text-xl">
                  {n.icon}
                </span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-slate-100 pt-2">
          <button onClick={() => signOut(false)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-slate-600 hover:bg-slate-50" data-testid="drawer-sign-out">
            <span aria-hidden className="w-6 text-center text-xl">
              ↩
            </span>
            Sign out
          </button>
        </div>
      </Drawer>
    </>
  );
}

function MyStats() {
  const s = useFetch(() => meApi<unknown>('GET', '/api/me/stats'), []);
  if (!s.data) return <p className="text-slate-500">{s.error ?? 'Loading…'}</p>;
  return <ProfileStats stats={s.data} />;
}
