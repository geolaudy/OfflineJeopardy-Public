// Lobby session + public TV presentation (R2-1…R2-10, R2-A).
//
// The host sends an explicit PresentRequest ("show the leaderboard ranked by wins"); the server
// turns it into a PresentationState that contains ONLY public data (public profiles and stats,
// category names without clues, team rosters, a rules summary, controller readiness without
// device ids) and broadcasts that. Host UI state is never sent to the TV.
import { z } from 'zod';
import type { ProfilePublic } from './views.js';

export const PRESENT_PAGES = ['lobby', 'leaderboard', 'players', 'player', 'teams', 'team', 'boards', 'board', 'rules', 'buzzers', 'tournament', 'compare', 'game'] as const;
export type PresentPage = (typeof PRESENT_PAGES)[number];

export const presentRequestSchema = z.object({
  page: z.enum(PRESENT_PAGES),
  view: z.enum(['solo', 'team', 'contribution', 'teams']).optional(),
  metric: z.string().max(20).optional(),
  profileId: z.string().max(64).optional(),
  /** Head to head: the second player. */
  otherId: z.string().max(64).optional(),
  teamId: z.string().max(64).optional(),
  /** Return the TV to what it showed before the current page (lobby when there is nothing). */
  back: z.boolean().optional(),
  boardId: z.string().max(64).optional(),
  tournamentId: z.string().max(64).optional(),
  /** A finished game's summary (R5-2.3). */
  gameId: z.string().max(64).optional(),
});
export type PresentRequest = z.infer<typeof presentRequestSchema>;

export interface PublicLobby {
  /** A lobby session exists (created on the game computer). */
  open: boolean;
  name: string;
  /** At least one host controller is connected. */
  hostConnected: boolean;
  createdAt: number;
}

export interface PresentedLeaderRow {
  rank: number;
  id: string;
  name: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  value: string;
  secondary: string;
}

export interface RosterRow {
  /** Lobby nickname, or the profile name when there is none. */
  name: string;
  /** The profile name, when a lobby nickname is shown instead (R5-17.6). */
  realName?: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  team: string | null;
  teamColor: string | null;
  /** Device type only ("Phone", "Joy-Con (L)", "Keyboard key", "Computer"…), never an id. */
  device: string;
  ready: boolean;
  /** Connected phone: smoothed round trip shown in steps (R7-4; 5 = under 10 ms). Absent while
   *  measuring and for other devices. Display only. */
  latencyMs?: number;
  /** Computer opponent: its difficulty label ("Easy", "Hard"…). */
  bot?: string;
  /** Player profile (public id; links the row to its history summary). */
  profileId?: string;
  /** Won the previous match in this lobby. */
  crown?: boolean;
}

/** Lobby-card history for one player (R3-6). Solo and team results are kept apart. */
export interface PersonSummary {
  private: boolean;
  games: number;
  wins: number;
  soloGames: number;
  soloWins: number;
  teamGames: number;
  teamWins: number;
  /** Wins in a row, most recent games first (solo and team). */
  streak: number;
}

/** Public summary of the game being set up (for the full and the compact lobby). */
export interface PublicRoster {
  title: string;
  boardTitle: string;
  mode: 'solo' | 'team';
  count: number;
  max: number; // 0 = no limit
  rows: RosterRow[];
  ready: number; // rows whose buzzer is ready
  waiting: string[]; // joined, not on a team yet
  /** Unassigned players with their pictures (team games, R5-5.2). */
  waitingPeople?: { name: string; realName?: string; color: string; avatar: string; pictureUrl: string | null }[];
  practice: boolean;
  /** Team games: most players per team (0 = no limit). */
  maxPerTeam?: number;
  /** The selected board (R5-3.3): title and size only; categories stay for the game. */
  board?: { title: string; description: string; rounds: number; clues: number; final: boolean } | null;
  /** History summaries for every player in the lobby, by profile id. */
  people?: Record<string, PersonSummary>;
  /** Profiles that won the previous match in this lobby (crown). */
  reigning?: string[];
  /** Team names that won the previous match. */
  reigningTeams?: string[];
  /** Profile(s) with the most wins among the players here (at least one win). */
  leaders?: string[];
  /** Saved-team records by team name (team games only). */
  teamRecords?: Record<string, { games: number; wins: number }>;
}

export interface PresentationState {
  page: PresentPage;
  rev: number;
  roster?: PublicRoster | null;
  leaderboard?: { viewLabel: string; metricLabel: string; minNote: string | null; rows: PresentedLeaderRow[]; unranked: number };
  player?: {
    profile: ProfilePublic;
    private: boolean;
    stats?: { soloGames: number; soloWins: number; accuracy: string; bestScore: string; teamGames: number; teamWins: number; contribution: string; buzzSpeed: string };
    recent?: { title: string; when: number; placement: number | null; of: number; score: string; won: boolean }[];
    topCategories?: { name: string; accuracy: string }[];
  };
  players?: { profiles: (ProfilePublic & { games: number; wins: number; private: boolean })[] };
  teams?: { teams: { id: string; name: string; color: string; avatar: string; members: ProfilePublic[]; games: number; wins: number }[] };
  boards?: { boards: { id: string; title: string; description: string; rounds: number; categories: number; clues: number; tags: string[] }[]; selectedId: string | null };
  board?: { id: string; title: string; description: string; rounds: { name: string; kind: 'standard' | 'final'; categories: string[] }[]; clues: number; media: number };
  rules?: { title: string; note: string | null; sections: SettingsSection[] };
  team?: {
    id: string;
    name: string;
    color: string;
    avatar: string;
    members: ProfilePublic[];
    stats: { games: number; wins: number; winRate: string; averageScore: string; correct: number; incorrect: number; accuracy: string; wagers: string; buzzSpeed: string };
    topCategories: { name: string; accuracy: string }[];
  };
  buzzers?: { rows: RosterRow[]; phonesNote: string };
  /** Before the host opens the lobby (R4-11): the boards to choose from (with the one the host is
   *  looking at), a preview of it and the public settings. No join code is shown at this point. */
  setup?: { boards: NonNullable<PresentationState['boards']>; board: PresentationState['board'] | null; rules: NonNullable<PresentationState['rules']> };
  /** Head to head on the TV: public numbers only; a private player is named but not compared. */
  compare?:
    | {
        a: { profile: ProfilePublic; summary: { games: number; wins: number; accuracy: number | null; bestScore: number | null; avgReactionMs: number | null } };
        b: { profile: ProfilePublic; summary: { games: number; wins: number; accuracy: number | null; bestScore: number | null; avgReactionMs: number | null } };
        record: { games: number; aAhead: number; bAhead: number; tied: number; teammateGames: number; teammateWins: number };
      }
    | { unavailable: string };
  /** Tournament standings (names, avatars and points only). */
  tournament?: { id: string; name: string; note: string; finished: boolean; rows: PresentedLeaderRow[] };
  /** No lobby open (R5-2): the home screen's recent games and a paused game, if any. */
  home?: { recent: RecentGameCard[]; unfinished: { title: string; updatedAt: number; started: boolean } | null };
  /** A finished game's public summary (R5-2.3). */
  game?: GameSummaryCard | null;
}

export interface RecentGameCard {
  id: string;
  title: string;
  boardTitle: string;
  endedAt: number;
  mode: 'solo' | 'team';
  practice: boolean;
  winners: { name: string; color: string; avatar: string; pictureUrl: string | null; team: boolean }[];
  winningScore: number | null;
  players: number;
  bots: number;
  teams: number;
}

export interface GameSummaryCard {
  id: string;
  title: string;
  boardTitle: string;
  mode: 'solo' | 'team';
  practice: boolean;
  startedAt: number | null;
  endedAt: number;
  cluesPlayed: number;
  standings: { placement: number | null; name: string; color: string; team: boolean; avatar: string; pictureUrl: string | null; score: number | null; isWinner: boolean; members: string[]; correct: number; incorrect: number }[];
}

/** Public, read-only game settings grouped for the TV (never secrets, PINs or device details). */
export interface SettingsSection {
  title: string;
  items: { label: string; value: string; hint?: string }[];
}

export const PAGE_LABELS: Record<PresentPage, string> = {
  lobby: 'Lobby',
  leaderboard: 'Leaderboards',
  players: 'Players',
  player: 'Player',
  teams: 'Teams',
  team: 'Team',
  boards: 'Boards',
  board: 'Board',
  rules: 'Settings',
  buzzers: 'Buzzers',
  tournament: 'Tournament',
  compare: 'Head to head',
  game: 'Game',
};
