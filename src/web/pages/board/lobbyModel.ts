// What the TV lobby (full screen and compact panel) shows, normalised from the server's public
// roster (preferred) or, until that arrives, from the public game projection. Only public data:
// names, colours, avatars, team names and a device *type* — never ids or addresses.
import type { GameView } from '../../../shared/views';
import type { PublicLobby, PublicRoster } from '../../../shared/presentation';
import { profileName } from '../../lib/view';

export interface LobbyPerson {
  /** Stable React / shared-layout key (derived from team and name; never shown). */
  key: string;
  name: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  /** Device type ("Phone", "Joy-Con (L)", …) or '' when unknown / shared with the team. */
  device: string;
  ready: boolean;
  bot: boolean;
}

export interface LobbyTeam {
  key: string;
  name: string;
  color: string;
  avatar: string;
  members: LobbyPerson[];
  /** Shared team buzzer (null when every member has their own). */
  shared: { device: string; ready: boolean } | null;
}

export interface LobbyModel {
  /** No game yet: the host is still choosing the board and settings. */
  preparing: boolean;
  kicker: string;
  title: string;
  boardTitle: string | null;
  mode: 'solo' | 'team' | null;
  count: number;
  max: number;
  people: LobbyPerson[];
  teams: LobbyTeam[] | null;
  ready: number;
  buzzers: number;
  waiting: string[];
  practice: boolean;
  hostConnected: boolean;
}

const sharedRow = (r: { name: string; team: string | null }) => !!r.team && r.name === `${r.team} (team)`;

/** Keys that stay the same for the same person (duplicate names get a counter). */
function keyer() {
  const seen = new Map<string, number>();
  return (team: string | null, name: string) => {
    const base = `${team ?? ''}|${name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}|${n}` : base;
  };
}

export function buildLobbyModel(g: GameView | null, lobby: PublicLobby | null, roster: PublicRoster | null | undefined): LobbyModel {
  const lobbyName = lobby?.open ? lobby.name : '';
  const hostConnected = !!lobby?.hostConnected;
  if (!g) {
    return {
      preparing: true,
      kicker: 'Getting ready',
      title: lobbyName || 'Game night',
      boardTitle: null,
      mode: null,
      count: 0,
      max: 0,
      people: [],
      teams: null,
      ready: 0,
      buzzers: 0,
      waiting: [],
      practice: false,
      hostConnected,
    };
  }
  const key = keyer();
  const mode = roster?.mode ?? g.mode;
  const title = roster?.title ?? g.title;
  const base = {
    preparing: false,
    kicker: lobbyName || 'Lobby',
    title,
    boardTitle: roster?.boardTitle && roster.boardTitle !== title ? roster.boardTitle : null,
    mode,
    max: roster?.max ?? g.rules.maxPlayers,
    practice: roster?.practice ?? g.practice,
    hostConnected,
  };

  // Team names / colours / members from the game projection (public); device readiness from the roster.
  const gameTeams = g.competitors.filter((c) => c.kind === 'team');
  const online = new Set(g.online ?? []);

  if (roster) {
    const rows = roster.rows;
    const personFrom = (r: (typeof rows)[number]): LobbyPerson => ({
      key: key(r.team, r.name),
      name: r.name,
      color: r.color,
      avatar: r.avatar,
      pictureUrl: r.pictureUrl,
      device: r.device,
      ready: r.ready,
      bot: r.device === 'Computer',
    });
    let teams: LobbyTeam[] | null = null;
    let people: LobbyPerson[];
    if (mode === 'team') {
      teams = [];
      const names = new Set<string>();
      for (const c of gameTeams) {
        names.add(c.name);
        const shared = rows.find((r) => sharedRow(r) && r.team === c.name);
        const members = shared
          ? c.memberIds.map((m) => {
              const p = g.profiles[m];
              const name = profileName(p);
              return { key: key(c.name, name), name, color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null, device: '', ready: shared.ready, bot: false };
            })
          : rows.filter((r) => r.team === c.name && !sharedRow(r)).map(personFrom);
        teams.push({ key: `team|${c.name}`, name: c.name, color: c.color, avatar: c.avatar ?? 'shield', members, shared: shared ? { device: shared.device, ready: shared.ready } : null });
      }
      // Rows for teams the projection does not know yet (should not happen; keeps names visible).
      for (const r of rows) {
        if (!r.team || names.has(r.team)) continue;
        names.add(r.team);
        const shared = rows.find((x) => sharedRow(x) && x.team === r.team);
        teams.push({
          key: `team|${r.team}`,
          name: r.team,
          color: r.teamColor ?? r.color,
          avatar: 'shield',
          members: rows.filter((x) => x.team === r.team && !sharedRow(x)).map(personFrom),
          shared: shared ? { device: shared.device, ready: shared.ready } : null,
        });
      }
      people = teams.flatMap((t) => t.members);
    } else {
      people = rows.filter((r) => !sharedRow(r)).map(personFrom);
    }
    return { ...base, count: roster.count, people, teams, ready: roster.ready, buzzers: rows.length, waiting: roster.waiting };
  }

  // Fallback: the public game projection (before the first roster arrives).
  const people: LobbyPerson[] = [];
  let teams: LobbyTeam[] | null = null;
  if (mode === 'team') {
    teams = gameTeams.map((c) => {
      const members = c.memberIds.map((m) => {
        const p = g.profiles[m];
        const name = profileName(p);
        return { key: key(c.name, name), name, color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null, device: '', ready: online.has(m), bot: false };
      });
      people.push(...members);
      return { key: `team|${c.name}`, name: c.name, color: c.color, avatar: c.avatar ?? 'shield', members, shared: null };
    });
  } else {
    for (const c of g.competitors) {
      if (c.bot) {
        people.push({ key: key(null, c.name), name: c.name, color: c.color, avatar: 'robot', pictureUrl: null, device: 'Computer', ready: true, bot: true });
        continue;
      }
      const p = c.profileId ? g.profiles[c.profileId] : undefined;
      const name = profileName(p);
      people.push({ key: key(null, name), name, color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null, device: '', ready: !!c.profileId && online.has(c.profileId), bot: false });
    }
  }
  const humans = new Set([...g.competitors.filter((c) => !c.bot).flatMap((c) => c.memberIds), ...g.unassigned.map((u) => u.profileId)]);
  return {
    ...base,
    count: humans.size,
    people,
    teams,
    ready: people.filter((p) => p.ready).length,
    buzzers: people.length,
    waiting: g.unassigned.filter((u) => !u.pending).map((u) => profileName(g.profiles[u.profileId])),
  };
}

export const modeLabel = (m: 'solo' | 'team' | null) => (m === 'team' ? 'Teams' : m === 'solo' ? 'Individuals' : '');

export function countLabel(m: LobbyModel) {
  const noun = m.count === 1 ? 'player' : 'players';
  return m.max > 0 ? `${m.count} / ${m.max} ${m.max === 1 ? 'player' : 'players'}` : `${m.count} ${noun}`;
}
