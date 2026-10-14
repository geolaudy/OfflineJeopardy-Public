// What the TV lobby (full screen and compact panel) shows, normalised from the server's public
// roster (preferred) or, until that arrives, from the public game projection. Only public data:
// names, colours, avatars, team names and a device *type* — never ids or addresses.
import type { GameView } from '../../../shared/views';
import type { PersonSummary, PublicLobby, PublicRoster } from '../../../shared/presentation';
import { profileName } from '../../lib/view';
import { BOT_LEVELS } from '../../../shared/game';

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
  /** Computer opponent difficulty ("Easy", "Hard"…). */
  level?: string;
  /** Past games (players only; absent for computer opponents). */
  summary?: PersonSummary;
  /** Won the previous match in this lobby. */
  crown?: boolean;
  /** Most wins among the players here. */
  leader?: boolean;
}

export interface LobbyTeam {
  key: string;
  name: string;
  color: string;
  avatar: string;
  members: LobbyPerson[];
  /** Shared team buzzer (null when every member has their own). */
  shared: { device: string; ready: boolean } | null;
  /** Saved team's record in team games. */
  record?: { games: number; wins: number };
  crown?: boolean;
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
  /** Which markers appear (for the legend). */
  markers: { crown: boolean; leader: boolean };
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
      markers: { crown: false, leader: false },
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
      level: r.bot,
      summary: r.profileId ? roster.people?.[r.profileId] : undefined,
      crown: !!r.crown,
      leader: !!r.profileId && !!roster.leaders?.includes(r.profileId),
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
              return {
                key: key(c.name, name),
                name,
                color: p?.color ?? c.color,
                avatar: p?.avatar ?? 'fox',
                pictureUrl: p?.pictureUrl ?? null,
                device: '',
                ready: shared.ready,
                bot: false,
                summary: roster.people?.[m],
                crown: !!roster.reigning?.includes(m),
                leader: !!roster.leaders?.includes(m),
              };
            })
          : rows.filter((r) => r.team === c.name && !sharedRow(r)).map(personFrom);
        teams.push({
          key: `team|${c.name}`,
          name: c.name,
          color: c.color,
          avatar: c.avatar ?? 'shield',
          members,
          shared: shared ? { device: shared.device, ready: shared.ready } : null,
          record: roster.teamRecords?.[c.name],
          crown: !!roster.reigningTeams?.includes(c.name),
        });
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
    const markers = { crown: people.some((p) => p.crown) || !!teams?.some((t) => t.crown), leader: people.some((p) => p.leader) };
    return { ...base, count: roster.count, people, teams, ready: roster.ready, buzzers: rows.length, waiting: roster.waiting, markers };
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
        people.push({ key: key(null, c.name), name: c.name, color: c.color, avatar: 'robot', pictureUrl: null, device: 'Computer', ready: true, bot: true, level: BOT_LEVELS[c.bot].label });
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
    markers: { crown: false, leader: false },
  };
}

/** "12 games · 5 wins (2 team) · 42%" — solo and team wins are told apart, never merged into solo. */
export function summaryText(s: PersonSummary | undefined): string | null {
  if (!s) return null;
  if (s.private) return 'Statistics private';
  if (!s.games) return 'First game';
  const wins = `${s.wins} ${s.wins === 1 ? 'win' : 'wins'}`;
  const team = s.teamWins ? (s.soloWins ? ` (${s.teamWins} team)` : ' (team)') : '';
  const pct = s.games >= 3 ? ` · ${Math.round((s.wins / s.games) * 100)}%` : '';
  return `${s.games} ${s.games === 1 ? 'game' : 'games'} · ${wins}${team}${pct}`;
}

export const modeLabel = (m: 'solo' | 'team' | null) => (m === 'team' ? 'Teams' : m === 'solo' ? 'Individuals' : '');

export function countLabel(m: LobbyModel) {
  const noun = m.count === 1 ? 'player' : 'players';
  return m.max > 0 ? `${m.count} / ${m.max} ${m.max === 1 ? 'player' : 'players'}` : `${m.count} ${noun}`;
}
