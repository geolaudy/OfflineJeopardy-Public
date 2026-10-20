// R14-29: a player in the lobby, managed by the host — the lobby nickname (the name used for this
// game everywhere: TV, phones, score cards, Final), and the player's profile (view, edit). Guests
// have no profile: only their nickname. Team moves (team games) are added by the caller.
import { useState, type ReactNode } from 'react';
import type { GameView } from '../../../shared/views';
import { act } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt } from '../../lib/hooks';
import { Avatar, Button, Modal, inputCls, toast } from '../../components/ui';
import { profileName } from '../../lib/view';
import { BarChart3, Pencil } from 'lucide-react';
import { EditProfile, StatsModal, type AdminProfile } from '../desk/Players';

export function LobbyPlayerSheet({ g, profileId, title, onClose, children }: { g: GameView; profileId: string; title?: string; onClose: () => void; children?: ReactNode }) {
  const p = g.profiles[profileId];
  // The game view carries the lobby nickname in `nickname` (projection), never the profile's own.
  const [nick, setNick] = useState(p?.nickname ?? '');
  const [view, setView] = useState<'sheet' | 'stats' | 'edit'>('sheet');
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  if (!p) return null;
  const guest = !!p.guest;
  const canNick = g.phase === 'lobby' || g.phase === 'ended';
  const saveNick = async (value: string) => {
    const r = await act({ type: 'setNickname', profileId, nickname: value.trim() });
    if (!r.ok) return toast(r.error ?? 'Could not change the nickname', 'error');
    toast(value.trim() ? 'Nickname changed' : 'Nickname removed', 'success');
    onClose();
  };
  const openEdit = async () => {
    const list = await attempt(() => hostApi<AdminProfile[]>('GET', '/api/admin/profiles'));
    const found = list?.find((x) => x.id === profileId);
    if (!found) return;
    setAdmin(found);
    setView('edit');
  };
  if (view === 'stats') return <StatsModal p={{ ...p, nickname: '' }} onClose={onClose} />;
  if (view === 'edit' && admin) return <EditProfile p={admin} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title={title ?? profileName(p)}>
      <div className="space-y-4" data-testid="lobby-player-sheet">
        <div className="flex items-center gap-3">
          <Avatar profile={p} size={52} />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{profileName(p)}</p>
            <p className="truncate text-sm text-slate-500">{guest ? 'Guest (no profile)' : p.nickname?.trim() ? `Profile: ${p.name}` : 'Profile name'}</p>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNick(nick);
          }}
        >
          <label className="block text-sm font-semibold text-slate-700">
            Nickname for this game
            <input className={inputCls} value={nick} onChange={(e) => setNick(e.target.value)} maxLength={30} placeholder={guest ? 'Nickname' : p.name} disabled={!canNick} aria-label="Nickname for this game" data-testid="lobby-nickname-input" />
          </label>
          <p className="text-sm text-slate-500">{canNick ? 'Shown on the TV, the phones and the score cards during this game. The profile name stays as it is.' : 'Nicknames can be changed in the lobby.'}</p>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!canNick || nick.trim() === (p.nickname ?? '').trim() || (guest && !nick.trim())} data-testid="lobby-nickname-save">
              Save nickname
            </Button>
            {!guest && !!p.nickname?.trim() && (
              <Button type="button" variant="ghost" disabled={!canNick} onClick={() => void saveNick('')}>
                Use the profile name
              </Button>
            )}
          </div>
        </form>
        {!guest && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setView('stats')} data-testid="lobby-view-profile">
              <BarChart3 size={18} aria-hidden /> View profile
            </Button>
            <Button variant="secondary" onClick={() => void openEdit()} data-testid="lobby-edit-profile">
              <Pencil size={18} aria-hidden /> Edit profile
            </Button>
          </div>
        )}
        {children}
      </div>
    </Modal>
  );
}
