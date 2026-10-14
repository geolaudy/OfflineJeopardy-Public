// Lobby session + public TV presentation (R2-1…R2-10). Kept separate from the authoritative game
// state: the lobby owns the temporary host pairing code, and the presentation state holds only
// public data computed here from an explicit host request.
import type { DB } from './db/db.js';
import { getSetting, setSetting } from './db/db.js';
import { newPairingCode } from './auth.js';
import * as repo from './repos.js';
import * as stats from './stats.js';
import type { GameState } from '../shared/game.js';
import { BOT_LEVELS } from '../shared/game.js';
import { publicSettings } from '../shared/rulesSummary.js';
import { DEFAULT_THRESHOLDS, type Thresholds, rankRows, rankTeamRows, secondaryLine, teamSecondaryLine, formatValue, TEAMS_VIEW_LABEL, VIEW_LABELS, type LeaderView } from '../shared/leaderboard.js';
import { normalizeRules, type GameRules } from '../shared/game.js';
import type { PresentationState, PresentRequest, PublicLobby, PublicRoster, RosterRow } from '../shared/presentation.js';
import { humanCount } from './engine/engine.js';
import type { ControllerRegistry } from './controllers.js';
import * as tour from './tournaments.js';

/** Game settings the host is choosing before the game exists (shown on the TV's Settings page). */
export interface SettingsDraft {
  mode: 'solo' | 'team';
  boardId: string | null;
  rules: GameRules;
  practice: boolean;
  tournamentId: string | null;
}

export interface LobbySession {
  name: string;
  createdAt: number;
  pairingCode: string;
}

const pctText = (v: number | null) => formatValue(v, 'pct');
const scoreText = (v: number | null) => formatValue(v, 'score');

export class LobbyManager {
  lobby: LobbySession | null = null;
  presentation: PresentationState = { page: 'lobby', rev: 0 };
  private request: PresentRequest = { page: 'lobby' };
  /** What the TV showed before the current page (host "Back" on the TV). */
  private previous: PresentRequest | null = null;
  private draft: SettingsDraft | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  onChange: () => void = () => {};

  constructor(
    private db: DB,
    private game: () => GameState | null,
    private controllers: ControllerRegistry,
    private online: () => string[],
  ) {}

  create(name?: string) {
    this.lobby = { name: name?.trim() || 'Game night', createdAt: Date.now(), pairingCode: newPairingCode() };
    this.save();
    this.present({ page: 'lobby' });
    return this.lobby;
  }

  /**
   * After a restart the lobby comes back together with the restored game (R4-20): players keep
   * their place and the same join QR, so Return to Lobby never lands in a lobby-less game. The
   * host pairing code is new (paired hosts keep their sessions).
   */
  restore() {
    const saved = getSetting<{ name: string; createdAt: number } | null>(this.db, 'lobbySession', null);
    if (!saved || this.lobby) return;
    if (!this.game()) return this.save(); // nothing to come back to
    this.lobby = { name: saved.name, createdAt: saved.createdAt, pairingCode: newPairingCode() };
    this.present({ page: 'lobby' });
  }

  private save() {
    setSetting(this.db, 'lobbySession', this.lobby ? { name: this.lobby.name, createdAt: this.lobby.createdAt } : null);
  }

  /** Closing the lobby invalidates its pairing code (already paired hosts keep their session). */
  close() {
    this.lobby = null;
    this.save();
    this.draft = null;
    this.previous = null;
    this.reigning = null;
    this.present({ page: 'lobby' });
  }

  /** Winner(s) of the previous match in this lobby (crown on the lobby cards). */
  reigning: { profileIds: string[]; botNames: string[]; teamNames: string[] } | null = null;

  setReigning(prev: GameState) {
    const winners = (prev.results ?? []).filter((r) => r.isWinner).map((r) => prev.competitors.find((c) => c.id === r.competitorId)).filter((c) => !!c);
    this.reigning = winners.length
      ? {
          profileIds: winners.filter((c) => !c.bot).flatMap((c) => c.memberIds),
          botNames: winners.filter((c) => c.bot).map((c) => c.name),
          teamNames: winners.filter((c) => c.kind === 'team').map((c) => c.name),
        }
      : null;
  }

  setDraft(d: (Omit<SettingsDraft, 'rules'> & { rules: Partial<GameRules> }) | null) {
    this.draft = d ? { ...d, rules: normalizeRules(d.rules) } : null;
    // The TV follows the host's choices live before the game exists (Settings page and pre-lobby, R4-11).
    if (!this.game()) this.refreshSoon();
  }

  newPairingCode() {
    if (!this.lobby) return null;
    this.lobby.pairingCode = newPairingCode();
    this.onChange();
    return this.lobby.pairingCode;
  }

  publicLobby(hostConnected: boolean): PublicLobby | null {
    return this.lobby ? { open: true, name: this.lobby.name, hostConnected, createdAt: this.lobby.createdAt } : null;
  }

  present(input: PresentRequest) {
    const { back: _back, ...req }: PresentRequest = input.back ? (this.previous ?? { page: 'lobby' }) : input;
    if (req.page !== this.request.page) this.previous = this.request;
    this.request = req;
    this.presentation = { ...this.build(req), roster: this.roster(), rev: this.presentation.rev + 1 };
    this.onChange();
  }

  /** Data behind the presented page changed (profiles, rules, controllers): rebuild soon. */
  refreshSoon() {
    const phase = this.game()?.phase;
    // During play the TV shows the game, not presentation pages.
    if (this.disposed || this.refreshTimer || phase === 'board' || phase === 'clue' || phase === 'final') return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.present(this.request);
    }, 400);
  }

  private disposed = false;
  dispose() {
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  private build(req: PresentRequest): Omit<PresentationState, 'rev'> {
    switch (req.page) {
      case 'leaderboard':
        return { page: 'leaderboard', leaderboard: req.view === 'teams' ? this.teamLeaderboard(req.metric) : this.leaderboard(req.view ?? 'solo', req.metric) };
      case 'team': {
        const t = req.teamId ? this.team(req.teamId) : null;
        return t ? { page: 'team', team: t } : { page: 'teams', teams: this.teams() };
      }
      case 'player':
        return req.profileId ? { page: 'player', player: this.player(req.profileId) ?? undefined } : { page: 'players', players: this.players() };
      case 'players':
        return { page: 'players', players: this.players() };
      case 'teams':
        return { page: 'teams', teams: this.teams() };
      case 'boards':
        return { page: 'boards', boards: this.boards(req.boardId ?? null) };
      case 'board': {
        const b = req.boardId ? this.board(req.boardId) : null;
        return b ? { page: 'board', board: b } : { page: 'boards', boards: this.boards(null) };
      }
      case 'rules':
        return { page: 'rules', rules: this.rules() };
      case 'buzzers':
        return { page: 'buzzers', buzzers: this.buzzers() };
      case 'tournament': {
        const t = req.tournamentId ? this.tournament(req.tournamentId) : null;
        return t ? { page: 'tournament', tournament: t } : { page: 'lobby' };
      }
      default:
        // No game yet: the pre-lobby preview instead of the join screen (R4-11).
        return this.lobby && !this.game() ? { page: 'lobby', setup: this.setup() } : { page: 'lobby' };
    }
  }

  private thresholds(): Thresholds {
    return { ...DEFAULT_THRESHOLDS, ...(getSetting<Partial<Thresholds> | null>(this.db, 'leaderboardThresholds', null) ?? {}) };
  }

  private setup(): NonNullable<PresentationState['setup']> {
    const selected = this.draft?.boardId ?? null;
    return { boards: this.boards(selected)!, board: selected ? this.board(selected) : null, rules: this.rules()! };
  }

  private leaderboard(view: LeaderView, metric?: string): PresentationState['leaderboard'] {
    const { crit, ranked, unranked } = rankRows(stats.leaderboard(this.db), view, metric, this.thresholds());
    return {
      viewLabel: VIEW_LABELS[view].label,
      metricLabel: crit.label,
      minNote: crit.min ? `Ranked: players with ${crit.min.label}` : null,
      rows: ranked.slice(0, 12).map(({ r, rank }) => ({
        rank,
        id: r.id,
        name: r.nickname?.trim() || r.name,
        color: r.color,
        avatar: r.avatar,
        pictureUrl: r.pictureUrl,
        value: formatValue(crit.value(r), crit.format),
        secondary: secondaryLine(view, r),
      })),
      unranked: unranked.length,
    };
  }

  private teamLeaderboard(metric?: string): PresentationState['leaderboard'] {
    const { crit, ranked, unranked } = rankTeamRows(stats.teamLeaderboard(this.db), metric, this.thresholds());
    return {
      viewLabel: TEAMS_VIEW_LABEL.label,
      metricLabel: crit.label,
      minNote: crit.min ? `Ranked: teams with ${crit.min.label}` : null,
      rows: ranked.slice(0, 12).map(({ r, rank }) => ({
        rank,
        id: r.id,
        name: r.name,
        color: r.color,
        avatar: r.avatar,
        pictureUrl: null,
        value: formatValue(crit.value(r), crit.format),
        secondary: teamSecondaryLine(r),
      })),
      unranked: unranked.length,
    };
  }

  /** One saved team's own statistics (team results; no member's private statistics). */
  private team(id: string): PresentationState['team'] | null {
    const t = repo.listTeams(this.db, true).find((x) => x.id === id);
    if (!t) return null;
    const s = stats.teamStats(this.db, id);
    const profiles = repo.profilesByIds(this.db, t.memberIds);
    const cats = s.categories.filter((c) => c.correct + c.incorrect >= 2).sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)).slice(0, 3);
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      avatar: t.avatar,
      members: t.memberIds.map((m) => profiles[m]).filter(Boolean),
      stats: {
        games: s.games.played,
        wins: s.games.wins,
        winRate: pctText(s.games.winRate),
        averageScore: scoreText(s.games.averageScore),
        correct: s.answers.correct,
        incorrect: s.answers.incorrect,
        accuracy: pctText(s.answers.accuracy),
        wagers: s.wagers.attempted ? `${s.wagers.won} won · ${s.wagers.lost} lost` : '—',
        buzzSpeed: s.buzzer.averageReactionMs == null ? '—' : `${(s.buzzer.averageReactionMs / 1000).toFixed(2)} s`,
      },
      topCategories: cats.map((c) => ({ name: c.category, accuracy: pctText(c.accuracy) })),
    };
  }

  private players(): PresentationState['players'] {
    const lb = new Map(stats.leaderboard(this.db, { includePrivate: true }).map((r) => [r.id, r]));
    const privateIds = new Set((this.db.prepare('SELECT id FROM profiles WHERE stats_private = 1').all() as { id: string }[]).map((r) => r.id));
    return {
      profiles: repo.listProfiles(this.db).map((p) => {
        const r = lb.get(p.id);
        const priv = privateIds.has(p.id);
        return { ...repo.toPublic(p), games: priv ? 0 : (r?.games ?? 0), wins: priv ? 0 : (r?.wins ?? 0), private: priv };
      }),
    };
  }

  private player(id: string): PresentationState['player'] | null {
    const p = repo.getProfile(this.db, id);
    if (!p || p.deleted_at) return null;
    const profile = repo.toPublic(p);
    if (p.stats_private) return { profile, private: true };
    const s = stats.profileStats(this.db, id);
    const history = (stats.profileHistory(this.db, id) as Record<string, unknown>[]).filter((h) => !h.practice).slice(0, 5);
    const cats = [...s.solo.categories, ...s.team.categories].filter((c) => c.correct + c.incorrect >= 2).sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)).slice(0, 3);
    const speed = s.solo.buzzer.averageReactionMs ?? s.team.buzzer.averageReactionMs;
    return {
      profile,
      private: false,
      stats: {
        soloGames: s.solo.games.played,
        soloWins: s.solo.games.wins,
        accuracy: pctText(s.combined.correct + s.combined.incorrect ? s.combined.correct / (s.combined.correct + s.combined.incorrect) : null),
        bestScore: scoreText(s.solo.games.highestScore),
        teamGames: s.team.games.played,
        teamWins: s.team.games.wins,
        contribution: scoreText(s.team.contribution.net),
        buzzSpeed: speed == null ? '—' : `${(speed / 1000).toFixed(2)} s`,
      },
      recent: history.map((h) => ({
        title: String(h.title),
        when: Number(h.endedAt),
        placement: (h.placement as number | null) ?? null,
        of: Number(h.competitorCount ?? 0),
        score: scoreText((h.finalScore as number | null) ?? 0),
        won: !!h.isWinner,
      })),
      topCategories: cats.map((c) => ({ name: c.category, accuracy: pctText(c.accuracy) })),
    };
  }

  private tournament(id: string): PresentationState['tournament'] | null {
    const t = tour.getTournament(this.db, id);
    if (!t) return null;
    const rows = tour.standings(this.db, t);
    const played = tour.tournamentGames(this.db, id).filter((g) => g.status === 'completed').length;
    const profiles = repo.profilesByIds(this.db, rows.map((r) => r.profileId).filter((x): x is string => !!x));
    const teams = new Map(repo.listTeams(this.db).map((x) => [x.id, x]));
    return {
      id: t.id,
      name: t.name,
      finished: t.status === 'finished',
      note: `${played} ${played === 1 ? 'game' : 'games'} played · ${t.scoring === 'placement' ? 'placement points' : 'total score'}${t.status === 'finished' ? ' · final standings' : ''}`,
      rows: rows.map((r) => {
        const p = r.profileId ? profiles[r.profileId] : null;
        const team = r.teamId ? teams.get(r.teamId) : null;
        return {
          rank: r.rank,
          id: r.key,
          name: p ? p.nickname || p.name : r.name,
          color: p?.color ?? team?.color ?? r.color,
          avatar: p?.avatar ?? team?.avatar ?? 'shield',
          pictureUrl: p?.pictureUrl ?? null,
          value: t.scoring === 'placement' ? `${r.points} pts` : scoreText(r.points),
          secondary: `${r.games} ${r.games === 1 ? 'game' : 'games'} · ${r.wins} ${r.wins === 1 ? 'win' : 'wins'}`,
        };
      }),
    };
  }

  private teams(): PresentationState['teams'] {
    const profiles = repo.profilesByIds(this.db, repo.listTeams(this.db).flatMap((t) => t.memberIds));
    return {
      teams: repo.listTeams(this.db).map((t) => {
        const ts = stats.teamStats(this.db, t.id);
        return { id: t.id, name: t.name, color: t.color, avatar: t.avatar, members: t.memberIds.map((m) => profiles[m]).filter(Boolean), games: ts.games.played, wins: ts.games.wins };
      }),
    };
  }

  private boards(selectedId: string | null): PresentationState['boards'] {
    return {
      selectedId,
      boards: repo
        .listBoards(this.db)
        .filter((b) => !b.archived)
        .map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          rounds: b.rounds.filter((r) => r.kind === 'standard').length,
          categories: b.rounds.reduce((a, r) => a + r.categories.length, 0),
          clues: b.clueCount,
          tags: b.tags,
        })),
    };
  }

  /** Category names and counts only — never clue text, answers or Daily Wager positions. */
  private board(id: string): PresentationState['board'] | null {
    const b = repo.getBoard(this.db, id);
    if (!b) return null;
    let clues = 0;
    let media = 0;
    for (const r of b.content.rounds)
      for (const c of r.categories)
        for (const q of c.clues) {
          clues++;
          media += (q.media?.length ?? 0) > 0 ? 1 : 0;
        }
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      // The Final category stays a surprise.
      rounds: b.content.rounds.map((r) => ({ name: r.name, kind: r.kind, categories: r.kind === 'final' ? [] : r.categories.map((c) => c.name) })),
      clues,
      media,
    };
  }

  /** Read-only public settings (R3-4): the live game's rules, or the host's draft before it exists. */
  private rules(): PresentationState['rules'] {
    const s = this.game();
    const boardTitle = (id: string | null) => (id ? (repo.getBoard(this.db, id)?.title ?? null) : null);
    if (s) {
      const tid = tour.tournamentOfGame(this.db, s.id);
      const sections = publicSettings(s.rules, {
        mode: s.mode,
        boardTitle: boardTitle(s.boardId) ?? s.title,
        practice: s.practice,
        bots: s.competitors.filter((c) => c.bot).map((c) => `${c.name} (${BOT_LEVELS[c.bot!].label})`),
        teams: s.competitors.filter((c) => c.kind === 'team').map((c) => ({ name: c.name, members: c.memberIds.length, shared: c.buzzerMode === 'shared' })),
        tournament: tid ? (tour.getTournament(this.db, tid)?.name ?? null) : null,
      });
      return { title: s.title, note: s.phase === 'lobby' ? 'The host can still change these before the game starts.' : null, sections };
    }
    const d = this.draft;
    if (d) {
      const tournament = d.tournamentId ? (tour.getTournament(this.db, d.tournamentId)?.name ?? null) : null;
      const sections = publicSettings(d.rules, { mode: d.mode, boardTitle: boardTitle(d.boardId), practice: d.practice, tournament });
      return { title: boardTitle(d.boardId) ?? 'Game settings', note: 'The host is still choosing — these settings may change.', sections };
    }
    return { title: 'Game settings', note: 'The host has not chosen the settings yet. These are the standard rules.', sections: publicSettings(normalizeRules({}), { mode: 'solo' }) };
  }

  /** Public lobby summary: who is in, on which team, and whether their buzzer is ready. */
  private roster(): PublicRoster | null {
    const s = this.game();
    if (!s || (s.phase !== 'lobby' && s.phase !== 'ended')) return null;
    const rows = this.buzzerRows(s);
    const profiles = repo.profilesByIds(this.db, s.unassigned.map((u) => u.profileId));
    const board = s.boardId ? repo.getBoard(this.db, s.boardId)?.title : null;
    // History on the lobby cards (R3-6/7): summaries, the reigning winner and the wins leader.
    const ids = [...new Set(s.competitors.filter((c) => !c.bot).flatMap((c) => c.memberIds))];
    const people = stats.lobbySummaries(this.db, ids);
    const best = Math.max(0, ...Object.values(people).map((p) => (p.private ? 0 : p.wins)));
    const leaders = best > 0 ? ids.filter((id) => !people[id]?.private && people[id]?.wins === best) : [];
    const teamRecords: Record<string, { games: number; wins: number }> = {};
    for (const c of s.competitors)
      if (c.kind === 'team' && c.teamId) {
        const ts = stats.teamStats(this.db, c.teamId);
        teamRecords[c.name] = { games: ts.games.played, wins: ts.games.wins };
      }
    const reign = this.reigning;
    return {
      title: s.title,
      boardTitle: board ?? s.title,
      mode: s.mode,
      count: humanCount(s),
      max: s.rules.maxPlayers,
      rows,
      ready: rows.filter((r) => r.ready).length,
      waiting: s.unassigned.filter((u) => !u.pending).map((u) => profiles[u.profileId]?.nickname?.trim() || profiles[u.profileId]?.name || 'Player'),
      practice: s.practice,
      people,
      reigning: reign ? reign.profileIds.filter((id) => ids.includes(id)) : [],
      reigningTeams: reign?.teamNames ?? [],
      // A leader marker only means something with two or more people to compare.
      leaders: ids.length > 1 && leaders.length < ids.length ? leaders : [],
      teamRecords,
    };
  }

  /** Who buzzes with what — device type only, never device ids or addresses. */
  private buzzers(): PresentationState['buzzers'] {
    const s = this.game();
    if (!s) return { rows: [], phonesNote: 'Players can buzz with their phones, Joy-Cons or keyboard keys.' };
    return { rows: this.buzzerRows(s), phonesNote: 'Phones are ready when the player has the game open.' };
  }

  private buzzerRows(s: GameState): RosterRow[] {
    const profiles = repo.profilesByIds(this.db, s.competitors.flatMap((c) => c.memberIds));
    const online = new Set(this.online());
    const describe = (controllerId: string, kind: string) => {
      const info = this.controllers.get(controllerId);
      const device = kind === 'joycon' ? `Joy-Con${info?.side ? ` (${info.side})` : ''}` : kind === 'keyboard' ? 'Keyboard key' : kind === 'gamepad' ? 'Controller' : 'Phone';
      return { device, ready: !!info?.connected };
    };
    // A phone binding is ready only while that phone's player has the game open.
    const describeFor = (b: GameState['bindings'][number], memberIds: string[]) =>
      b.kind === 'phone' ? { device: 'Phone', ready: memberIds.some((m) => online.has(m)) } : describe(b.controllerId, b.kind);
    const rows: RosterRow[] = [];
    for (const c of s.competitors) {
      if (c.bot) {
        rows.push({ name: c.name, color: c.color, avatar: 'robot', pictureUrl: null, team: null, teamColor: null, device: 'Computer', ready: true, bot: BOT_LEVELS[c.bot].label, crown: !!this.reigning?.botNames.includes(c.name) });
        continue;
      }
      const shared = c.kind === 'team' && c.buzzerMode === 'shared';
      if (shared) {
        const b = s.bindings.find((x) => x.target.kind === 'competitor' && x.target.competitorId === c.id);
        const d = b ? describeFor(b, c.memberIds) : { device: 'No team buzzer yet', ready: false };
        rows.push({ name: `${c.name} (team)`, color: c.color, avatar: c.avatar ?? 'shield', pictureUrl: null, team: c.name, teamColor: c.color, ...d });
        continue;
      }
      for (const m of c.memberIds) {
        const p = profiles[m];
        const b = s.bindings.find((x) => x.target.kind === 'profile' && x.target.profileId === m);
        const d = b ? describeFor(b, [m]) : { device: 'Phone', ready: online.has(m) };
        rows.push({ name: p?.nickname?.trim() || p?.name || 'Player', color: s.playerColors?.[m] ?? p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null, team: c.kind === 'team' ? c.name : null, teamColor: c.kind === 'team' ? c.color : null, ...d, profileId: m, crown: !!this.reigning?.profileIds.includes(m) });
      }
    }
    return rows;
  }
}
