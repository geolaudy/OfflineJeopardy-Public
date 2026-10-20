// Host profile management: create, edit, picture, PIN reset, delete, statistics.
import { useState } from 'react';
import { usePresent } from '../host/AppShell';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Avatar, Button, ColorPicker, Empty, Field, Modal, PageTitleBar, inputCls, toast } from '../../components/ui';
import { ProfileCreateForm, ProfilePicturePicker } from '../../components/ProfileForm';
import { ProfileStats } from '../../components/StatsView';
import { present as sendPresent, useLive } from '../../lib/socket';
import { profileName } from '../../lib/view';
import { Lock, Monitor, Plus, Swords } from 'lucide-react';
import HeadToHead, { type CompareData } from '../../components/HeadToHead';

export interface AdminProfile {
  id: string;
  name: string;
  nickname: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  uploadedPictureUrl?: string | null;
  locked: boolean;
  createdAt: number;
}

export default function Players() {
  const v = useLive((s) => s.profilesVersion);
  const list = useFetch(() => hostApi<AdminProfile[]>('GET', '/api/admin/profiles'), [v]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<AdminProfile | null>(null);
  const [stats, setStatsState] = useState<AdminProfile | null>(null);
  const { show } = usePresent();
  // Opening a player's statistics presents their public card on the TV (respects "keep my stats private").
  const setStats = (p: AdminProfile | null) => {
    setStatsState(p);
    show(p ? { page: 'player', profileId: p.id } : { page: 'players' });
  };
  const [q, setQ] = useState('');
  const [comparing, setComparing] = useState<AdminProfile | null>(null);
  const rows = (list.data ?? []).filter((p) => `${p.name} ${p.nickname}`.toLowerCase().includes(q.toLowerCase()));
  const dupNames = new Set((list.data ?? []).map((p) => p.name.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageTitleBar
        title="Players"
        subtitle="Players usually create their own profile by scanning the QR code. Renaming or changing pictures never affects their history."
        actions={
          <>
            <input className={`${inputCls} w-48`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
            <Button onClick={() => setCreating(true)}>
              <Plus size={18} aria-hidden /> New player
            </Button>
          </>
        }
      />
      {rows.length === 0 ? (
        <Empty title="No players yet">Create one here, or let players scan the QR code on the TV.</Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
              <Avatar profile={p} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{p.name}</div>
                <div className="truncate text-xs text-slate-500">
                  {dupNames.has(p.name.toLowerCase()) ? 'Same name as another player' : ''}
                  {p.locked ? (
                  <>
                    {dupNames.has(p.name.toLowerCase()) ? ' · ' : ''}
                    <Lock size={12} className="inline align-[-1px]" aria-hidden /> locked (wrong PINs)
                  </>
                ) : null}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStats(p)}>
                Stats
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setComparing(p)} aria-label={'Compare ' + profileName(p)} data-testid="compare-player">
                <Swords size={16} aria-hidden />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New player" wide>
        <ProfileCreateForm
          busy={busy}
          onSubmit={async (p) => {
            setBusy(true);
            const { picture, ...fields } = p;
            const r = await attempt(() => hostApi<{ id: string }>('POST', '/api/admin/profiles', fields), 'Player created');
            if (r && picture) {
              const fd = new FormData();
              fd.append('file', picture, picture.name || 'photo.jpg');
              await attempt(() => hostApi('POST', `/api/admin/profiles/${r.id}/picture`, undefined, fd));
            }
            setBusy(false);
            if (r) {
              setCreating(false);
              void list.reload();
            }
          }}
        />
      </Modal>
      {edit && (
        <EditProfile
          p={edit}
          onClose={() => {
            setEdit(null);
            void list.reload();
          }}
        />
      )}
      {stats && <StatsModal p={stats} onClose={() => setStats(null)} />}
      {comparing && <CompareModal first={comparing} players={list.data ?? []} onClose={() => setComparing(null)} />}
    </div>
  );
}

export function StatsModal({ p, onClose }: { p: Pick<AdminProfile, 'id' | 'name' | 'nickname' | 'color' | 'avatar' | 'pictureUrl'>; onClose: () => void }) {
  const s = useFetch(() => hostApi<{ stats: unknown }>('GET', `/api/stats/profiles/${p.id}`), [p.id]);
  return (
    <Modal open onClose={onClose} title={`${profileName(p)} — statistics`} wide>
      {s.data ? <ProfileStats stats={s.data.stats} /> : <p>{s.error ?? 'Loading…'}</p>}
    </Modal>
  );
}

/** The host's profile editor (Players page and, R14-29, a lobby card). R14-28: no nickname field —
 *  a nickname set here never reached the game (the lobby nickname is the one used in a game); a
 *  saved profile nickname is kept as it is (it is no longer sent from here). */
export function EditProfile({ p, onClose }: { p: AdminProfile; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [color, setColor] = useState(p.color);
  const [avatar, setAvatar] = useState(p.avatar);
  const [pin, setPin] = useState('');
  const [upload, setUpload] = useState<string | null>(p.uploadedPictureUrl ?? p.pictureUrl ?? null);
  const [usePicture, setUsePicture] = useState(!!p.pictureUrl);
  return (
    <Modal open onClose={onClose} title={`Edit ${profileName(p)}`} wide>
      <div className="space-y-4">
        <ProfilePicturePicker
          name={name}
          color={color}
          avatar={avatar}
          uploadUrl={upload}
          usePicture={!!upload && usePicture}
          onAvatar={(id) => {
            setAvatar(id);
            setUsePicture(false);
          }}
          onUsePicture={() => setUsePicture(true)}
          onPickFile={async (f) => {
            const fd = new FormData();
            fd.append('file', f, f.name || 'photo.jpg');
            const r = await attempt(() => hostApi<{ pictureUrl: string | null }>('POST', `/api/admin/profiles/${p.id}/picture`, undefined, fd), 'Picture updated');
            if (r) {
              setUpload(r.pictureUrl);
              setUsePicture(true);
            }
          }}
        />
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Preferred Color" group hint="Used in a game whenever nobody else has it.">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Button
          size="lg"
          onClick={async () => {
            const r = await attempt(() => hostApi('PATCH', `/api/admin/profiles/${p.id}`, { name: name.trim(), color, avatar, ...(upload ? { usePicture } : {}) }), 'Saved');
            if (r) onClose();
          }}
          disabled={!name.trim()}
        >
          Save
        </Button>
        <div className="rounded-xl bg-slate-50 p-3">
          <h3 className="font-bold">Reset PIN</h3>
          <p className="text-sm text-slate-600">For players who forgot their PIN. This also unlocks the profile and signs it out on all devices.</p>
          <div className="mt-2 flex gap-2">
            <input className={`${inputCls} max-w-40`} type="password" inputMode="numeric" placeholder="New PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="New PIN" />
            <Button
              variant="secondary"
              disabled={pin.length !== 4}
              onClick={async () => {
                const r = await attempt(() => hostApi('POST', `/api/admin/profiles/${p.id}/reset-pin`, { pin }), 'PIN reset');
                if (r) setPin('');
              }}
            >
              Reset PIN
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          className="text-red-700"
          onClick={async () => {
            if (!confirm(`Delete ${profileName(p)}? Their past results stay in history as "Deleted player".`)) return;
            const r = await attempt(() => hostApi('DELETE', `/api/admin/profiles/${p.id}`));
            if (r) {
              toast('Profile deleted', 'success');
              onClose();
            }
          }}
        >
          Delete profile
        </Button>
      </div>
    </Modal>
  );
}

/** Head to head between two players (T10). The host can compare anyone. */
function CompareModal({ first, players, onClose }: { first: AdminProfile; players: AdminProfile[]; onClose: () => void }) {
  const others = players.filter((p) => p.id !== first.id);
  const [other, setOther] = useState(others[0]?.id ?? '');
  const d = useFetch(() => (other ? hostApi<CompareData>('GET', '/api/stats/compare?a=' + first.id + '&b=' + other) : Promise.resolve(null)), [first.id, other]);
  const lobbyOpen = useLive((s) => !!s.lobby?.open);
  const phase = useLive((s) => s.game?.phase);
  const tvOk = lobbyOpen && phase !== 'board' && phase !== 'clue' && phase !== 'final';
  return (
    <Modal open onClose={onClose} title={`Compare ${profileName(first)}`} wide>
      <div className="space-y-4">
        <Field label="With">
          <select className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} aria-label="Compare with">
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {profileName(p)}
              </option>
            ))}
          </select>
        </Field>
        {!others.length ? <p className="text-slate-500">Add another player to compare.</p> : d.error ? <p className="text-slate-600">{d.error}</p> : d.data ? <HeadToHead d={d.data} /> : <p className="text-slate-500">Loading…</p>}
        {other && d.data && (
          <Button
            variant="secondary"
            disabled={!tvOk}
            onClick={() => {
              sendPresent({ page: 'compare', profileId: first.id, otherId: other });
              toast('Head to head is on the TV');
            }}
            data-testid="compare-show-tv"
          >
            <Monitor size={18} aria-hidden /> Show on TV
          </Button>
        )}
        {other && d.data && !tvOk && <p className="text-xs text-slate-500">Open a lobby to show this on the TV (during play the TV shows the game).</p>}
      </div>
    </Modal>
  );
}
