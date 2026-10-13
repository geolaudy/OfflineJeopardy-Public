// Lobby session + public TV presentation (R2-1…R2-10). Kept separate from the authoritative game
// state: the lobby owns the temporary host pairing code, and the presentation state holds only
// public data computed here from an explicit host request.
import type { DB } from './db/db.js';
import { newPairingCode } from './auth.js';
import * as repo from './repos.js';
import * as stats from './stats.js';
import type { GameState } from '../shared/game.js';
import { BOT_LEVELS } from '../shared/game.js';
import { summarizeRules } from '../shared/rulesSummary.js';
import { rankRows, secondaryLine, formatValue, VIEW_LABELS, type LeaderView } from '../shared/leaderboard.js';
import type { PresentationState, PresentRequest, PublicLobby, PublicRoster, RosterRow } from '../shared/presentation.js';
import { humanCount } from './engine/engine.js';
import type { ControllerRegistry } from './controllers.js';

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
    this.present({ page: 'lobby' });
    return this.lobby;
  }

  /** Closing the lobby invalidates its pairing code (already paired hosts keep their session). */
  close() {
    this.lobby = null;
    this.present({ page: 'lobby' });
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

  present(req: PresentRequest) {
    this.request = req;
    this.presentation = { ...this.build(req), roster: this.roster(), rev: this.presentation.rev + 1 };
    this.onChange();
  }

  /** Data behind the presented page changed (profiles, rules, controllers): rebuild soon. */
  refreshSoon() {
    const phase = this.game()?.phase;
    // During play the TV shows the game, not presentation pages.
    if (this.refreshTimer || phase === 'board' || phase === 'clue' || phase === 'final') return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.present(this.request);
    }, 400);
  }

  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  private build(req: PresentRequest): Omit<PresentationState, 'rev'> {
    switch (req.page) {
      case 'leaderboard':
        return { page: 'leaderboard', leaderboard: this.leaderboard(req.view ?? 'solo', req.metric) };
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
      default:
        return { page: 'lobby' };
    }
  }

  private leaderboard(view: LeaderView, metric?: string): PresentationState['leaderboard'] {
    const { crit, ranked, unranked } = rankRows(stats.leaderboard(this.db), view, metric);
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

  private rules(): PresentationState['rules'] {
    const s = this.game();
    if (!s) return { title: 'Game rules', lines: [{ label: 'Status', value: 'The host is still choosing the game settings.' }] };
    const board = s.boardId ? repo.getBoard(this.db, s.boardId)?.title : null;
    const lines = summarizeRules(s.rules, { mode: s.mode, boardTitle: board ?? s.title, practice: s.practice, bots: s.competitors.filter((c) => c.bot).map((c) => `${c.name} (${BOT_LEVELS[c.bot!].label})`) });
    return { title: s.title, lines };
  }

  /** Public lobby summary: who is in, on which team, and whether their buzzer is ready. */
  private roster(): PublicRoster | null {
    const s = this.game();
    if (!s || (s.phase !== 'lobby' && s.phase !== 'ended')) return null;
    const rows = this.buzzerRows(s);
    const profiles = repo.profilesByIds(this.db, s.unassigned.map((u) => u.profileId));
    const board = s.boardId ? repo.getBoard(this.db, s.boardId)?.title : null;
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
      return { device, ready: kind === 'phone' ? true : !!info?.connected };
    };
    const rows: RosterRow[] = [];
    for (const c of s.competitors) {
      if (c.bot) {
        rows.push({ name: c.name, color: c.color, avatar: 'robot', pictureUrl: null, team: null, teamColor: null, device: 'Computer', ready: true });
        continue;
      }
      const shared = c.kind === 'team' && c.buzzerMode === 'shared';
      if (shared) {
        const b = s.bindings.find((x) => x.target.kind === 'competitor' && x.target.competitorId === c.id);
        const d = b ? describe(b.controllerId, b.kind) : { device: 'No team buzzer yet', ready: false };
        rows.push({ name: `${c.name} (team)`, color: c.color, avatar: c.avatar ?? 'shield', pictureUrl: null, team: c.name, teamColor: c.color, ...d });
        continue;
      }
      for (const m of c.memberIds) {
        const p = profiles[m];
        const b = s.bindings.find((x) => x.target.kind === 'profile' && x.target.profileId === m);
        const d = b ? describe(b.controllerId, b.kind) : { device: 'Phone', ready: online.has(m) };
        rows.push({ name: p?.nickname?.trim() || p?.name || 'Player', color: p?.color ?? c.color, avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null, team: c.kind === 'team' ? c.name : null, teamColor: c.kind === 'team' ? c.color : null, ...d });
      }
    }
    return rows;
  }
}
