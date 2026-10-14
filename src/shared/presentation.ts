// Lobby session + public TV presentation (R2-1…R2-10, R2-A).
//
// The host sends an explicit PresentRequest ("show the leaderboard ranked by wins"); the server
// turns it into a PresentationState that contains ONLY public data (public profiles and stats,
// category names without clues, team rosters, a rules summary, controller readiness without
// device ids) and broadcasts that. Host UI state is never sent to the TV.
import { z } from 'zod';
import type { ProfilePublic } from './views.js';

export const PRESENT_PAGES = ['lobby', 'leaderboard', 'players', 'player', 'teams', 'team', 'boards', 'board', 'rules', 'buzzers', 'tournament'] as const;
export type PresentPage = (typeof PRESENT_PAGES)[number];

export const presentRequestSchema = z.object({
  page: z.enum(PRESENT_PAGES),
  view: z.enum(['solo', 'team', 'contribution', 'teams']).optional(),
  metric: z.string().max(20).optional(),
  profileId: z.string().max(64).optional(),
  teamId: z.string().max(64).optional(),
  /** Return the TV to what it showed before the current page (lobby when there is nothing). */
  back: z.boolean().optional(),
  boardId: z.string().max(64).optional(),
  tournamentId: z.string().max(64).optional(),
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
  name: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  team: string | null;
  teamColor: string | null;
  /** Device type only ("Phone", "Joy-Con (L)", "Keyboard key", "Computer"…), never an id. */
  device: string;
  ready: boolean;
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
  practice: boolean;
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
  /** Tournament standings (names, avatars and points only). */
  tournament?: { id: string; name: string; note: string; finished: boolean; rows: PresentedLeaderRow[] };
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
};
