// A player's name as games show it (R5-17.6, R7-3): the lobby nickname as the main name with the
// profile name underneath — smaller, gray, same family — or just the profile name when there is
// no nickname. Long names wrap instead of being cut off.
import type { ProfilePublic } from '../../shared/views';
import { cx } from './ui';

export function PersonName({ p, nick, name, className, realClassName }: { p?: Pick<ProfilePublic, 'name' | 'nickname'> | null; nick?: string; name?: string; className?: string; realClassName?: string }) {
  const nickname = (nick ?? p?.nickname ?? '').trim();
  const real = (name ?? p?.name ?? '').trim() || 'Player';
  const shown = nickname || real;
  return (
    <span className={cx('flex min-w-0 flex-col', className)} data-testid="person-name">
      <span className="[overflow-wrap:anywhere]">{shown}</span>
      {nickname && nickname.toLowerCase() !== real.toLowerCase() && (
        <span className={cx(realClassName ?? 'text-[0.8em]', 'leading-tight font-normal text-slate-500 [overflow-wrap:anywhere]')} data-testid="person-real-name">
          {real}
        </span>
      )}
    </span>
  );
}

/** "Mon 14 Oct" style date for history cards. */
export function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
