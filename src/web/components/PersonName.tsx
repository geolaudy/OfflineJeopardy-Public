// A player's name as games show it (R5-17.6): the lobby nickname prominently, the profile name
// subtly after it in parentheses — or just the profile name when there is no nickname.
import type { ProfilePublic } from '../../shared/views';
import { cx } from './ui';

export function PersonName({ p, nick, name, className, realClassName }: { p?: Pick<ProfilePublic, 'name' | 'nickname'> | null; nick?: string; name?: string; className?: string; realClassName?: string }) {
  const nickname = (nick ?? p?.nickname ?? '').trim();
  const real = (name ?? p?.name ?? '').trim() || 'Player';
  const shown = nickname || real;
  return (
    <span className={cx('min-w-0', className)} data-testid="person-name">
      <span className="truncate">{shown}</span>
      {nickname && nickname.toLowerCase() !== real.toLowerCase() && (
        <span className={cx('ml-1 truncate font-normal text-slate-500/80', realClassName)} data-testid="person-real-name">
          ({real})
        </span>
      )}
    </span>
  );
}

/** "Mon 14 Oct" style date for history cards. */
export function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
