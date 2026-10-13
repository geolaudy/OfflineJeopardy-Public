// Saved teams (stable ids) for reuse across games, with team statistics.
import { useState } from 'react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch, useProfiles, type TeamRecord } from '../../lib/hooks';
import { Avatar, Button, ColorPicker, Empty, Field, Modal, PageTitleBar, inputCls, cx } from '../../components/ui';
import { AvatarPicker } from '../../components/ProfileForm';
import { TeamStatsView } from '../../components/StatsView';
import { TEAM_AVATARS, avatarEmoji } from '../../lib/avatars';
import { TEAM_COLORS } from '../../../shared/game';
import { profileName } from '../../lib/view';
import { Plus } from 'lucide-react';

export default function Teams() {
  const [archived, setArchived] = useState(false);
  const teams = useFetch(() => hostApi<TeamRecord[]>('GET', `/api/teams${archived ? '?archived=1' : ''}`), [archived]);
  const profiles = useProfiles();
  const [edit, setEdit] = useState<Partial<TeamRecord> | null>(null);
  const [stats, setStats] = useState<TeamRecord | null>(null);
  const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageTitleBar
        title="Teams"
        subtitle="Saved teams can be added to any team game. Each team picks its own buzzer mode. Changing a team later never rewrites past games."
        actions={
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-blue-700" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
            </label>
            <Button onClick={() => setEdit({})}>
              <Plus size={18} aria-hidden /> New team
            </Button>
          </>
        }
      />
      {!teams.data?.length ? (
        <Empty title="No saved teams">Create teams here or during game setup on the host controller.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {teams.data.map((t) => (
            <li key={t.id} className={cx('rounded-2xl bg-white p-4 shadow-sm', t.archived && 'opacity-60')}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: t.color }}>
                  {avatarEmoji(t.avatar)}
                </span>
                <div className="flex-1">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.buzzerMode === 'shared' ? 'One shared buzzer' : 'Each player buzzes'}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setStats(t)}>
                  Stats
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEdit(t)}>
                  Edit
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.memberIds.map((m) => (
                  <span key={m} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-2 pl-0.5 text-sm">
                    <Avatar profile={byId.get(m)} size={20} /> {profileName(byId.get(m))}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <TeamForm
          team={edit}
          onClose={() => {
            setEdit(null);
            void teams.reload();
          }}
        />
      )}
      {stats && <TeamStatsModal t={stats} onClose={() => setStats(null)} />}
    </div>
  );
}

function TeamStatsModal({ t, onClose }: { t: TeamRecord; onClose: () => void }) {
  const s = useFetch(() => hostApi<{ stats: unknown }>('GET', `/api/stats/teams/${t.id}`), [t.id]);
  return (
    <Modal open onClose={onClose} title={`${t.name} — statistics`} wide>
      {s.data ? <TeamStatsView stats={s.data.stats} /> : <p>{s.error ?? 'Loading…'}</p>}
    </Modal>
  );
}

function TeamForm({ team, onClose }: { team: Partial<TeamRecord>; onClose: () => void }) {
  const profiles = useProfiles();
  const [name, setName] = useState(team.name ?? '');
  const [color, setColor] = useState(team.color ?? TEAM_COLORS[0]);
  const [avatar, setAvatar] = useState(team.avatar ?? 'shield');
  const [mode, setMode] = useState<'individual' | 'shared'>(team.buzzerMode ?? 'individual');
  const [members, setMembers] = useState<string[]>(team.memberIds ?? []);
  const save = async () => {
    const body = { name: name.trim(), color, avatar, buzzerMode: mode, memberIds: members, archived: team.archived ?? false };
    const r = await attempt(() => (team.id ? hostApi('PUT', `/api/teams/${team.id}`, body) : hostApi('POST', '/api/teams', body)), 'Team saved');
    if (r) onClose();
  };
  return (
    <Modal open onClose={onClose} title={team.id ? 'Edit team' : 'New team'} wide>
      <div className="space-y-4">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Logo" group>
          <AvatarPicker value={avatar} onChange={setAvatar} list={TEAM_AVATARS.slice(0, 20)} />
        </Field>
        <Field label="Color" group>
          <ColorPicker value={color} onChange={setColor} colors={TEAM_COLORS} />
        </Field>
        <Field label="Buzzer mode" group>
          <div className="grid grid-cols-2 gap-2">
            {(['individual', 'shared'] as const).map((m) => (
              <Button key={m} variant={mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>
                {m === 'individual' ? 'Each player buzzes' : 'One shared buzzer'}
              </Button>
            ))}
          </div>
        </Field>
        <Field label={`Players (${members.length})`} group>
          <div className="grid max-h-56 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
            {(profiles.data ?? []).map((p) => (
              <label key={p.id} className={cx('flex min-h-11 items-center gap-2 rounded-lg border px-2', members.includes(p.id) ? 'border-blue-600 bg-blue-50' : 'border-slate-200')}>
                <input type="checkbox" checked={members.includes(p.id)} onChange={(e) => setMembers(e.target.checked ? [...members, p.id] : members.filter((m) => m !== p.id))} />
                <Avatar profile={p} size={22} />
                <span className="truncate text-sm">{profileName(p)}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-between">
          {team.id ? (
            <Button
              variant="ghost"
              className="text-red-700"
              onClick={async () => {
                if (!confirm('Delete this team? Teams with game history are archived instead.')) return;
                if (await attempt(() => hostApi('DELETE', `/api/teams/${team.id}`))) onClose();
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button size="lg" onClick={save} disabled={!name.trim()}>
            Save team
          </Button>
        </div>
      </div>
    </Modal>
  );
}
