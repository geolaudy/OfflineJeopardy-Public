// Host profile management: create, edit, picture, PIN reset, delete, statistics.
import { useRef, useState } from 'react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Avatar, Button, ColorPicker, Empty, Field, Modal, inputCls, toast } from '../../components/ui';
import { AvatarPicker, ProfileCreateForm } from '../../components/ProfileForm';
import { ProfileStats } from '../../components/StatsView';
import { useLive } from '../../lib/socket';
import { profileName } from '../../lib/view';

interface AdminProfile {
  id: string;
  name: string;
  nickname: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  locked: boolean;
  createdAt: number;
}

export default function Players() {
  const v = useLive((s) => s.profilesVersion);
  const list = useFetch(() => hostApi<AdminProfile[]>('GET', '/api/admin/profiles'), [v]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<AdminProfile | null>(null);
  const [stats, setStats] = useState<AdminProfile | null>(null);
  const [q, setQ] = useState('');
  const rows = (list.data ?? []).filter((p) => `${p.name} ${p.nickname}`.toLowerCase().includes(q.toLowerCase()));
  const dupNames = new Set((list.data ?? []).map((p) => p.name.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-3xl font-black">Players</h1>
        <input className={`${inputCls} max-w-xs`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        <Button onClick={() => setCreating(true)}>+ New player</Button>
      </div>
      <p className="text-sm text-slate-600">Players usually create their own profile by scanning the QR code. Every profile has a permanent ID, so renaming or changing pictures never affects their history.</p>
      {rows.length === 0 ? (
        <Empty title="No players yet">Create one here, or let players scan the QR code on the TV.</Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
              <Avatar profile={p} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{profileName(p)}</div>
                <div className="truncate text-xs text-slate-500">
                  {p.nickname ? p.name : ''}
                  {dupNames.has(p.name.toLowerCase()) ? ' · same name as another player' : ''}
                  {p.locked ? ' · 🔒 locked (wrong PINs)' : ''}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStats(p)}>
                Stats
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
            const r = await attempt(() => hostApi('POST', '/api/admin/profiles', p), 'Player created');
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
    </div>
  );
}

function StatsModal({ p, onClose }: { p: AdminProfile; onClose: () => void }) {
  const s = useFetch(() => hostApi<{ stats: unknown }>('GET', `/api/stats/profiles/${p.id}`), [p.id]);
  return (
    <Modal open onClose={onClose} title={`${profileName(p)} — statistics`} wide>
      {s.data ? <ProfileStats stats={s.data.stats} /> : <p>{s.error ?? 'Loading…'}</p>}
    </Modal>
  );
}

function EditProfile({ p, onClose }: { p: AdminProfile; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [nickname, setNickname] = useState(p.nickname);
  const [color, setColor] = useState(p.color);
  const [avatar, setAvatar] = useState(p.avatar);
  const [pin, setPin] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={`Edit ${profileName(p)}`} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar profile={{ ...p, color, avatar }} size={64} />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Upload picture
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.append('file', f);
              await attempt(() => hostApi('POST', `/api/admin/profiles/${p.id}/picture`, undefined, fd), 'Picture updated');
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          </Field>
          <Field label="Nickname">
            <input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
          </Field>
        </div>
        <Field label="Avatar">
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Button
          size="lg"
          onClick={async () => {
            const r = await attempt(() => hostApi('PATCH', `/api/admin/profiles/${p.id}`, { name: name.trim(), nickname: nickname.trim(), color, avatar }), 'Saved');
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
