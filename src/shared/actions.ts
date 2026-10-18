// Host action contract (validated on the server with zod). Clients send these over
// the WebSocket as { t: 'host', action }. Only authenticated host sessions may send them.
import { z } from 'zod';
import type { BoardContent } from './game.js';

const id = z.string().min(1).max(64);
const int = z.number().int().min(-10_000_000).max(10_000_000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const name = z.string().trim().min(1).max(40);

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profile'), profileId: id }),
  z.object({ kind: z.literal('competitor'), competitorId: id }),
]);

const timerRules = z.object({
  autoStart: z.boolean(),
  buzzSeconds: z.number().int().min(0).max(600),
  answerSeconds: z.number().int().min(0).max(600),
  wagerSeconds: z.number().int().min(0).max(600),
  finalSeconds: z.number().int().min(0).max(900),
});

export const rulesSchema = z.object({
  preset: z.string().max(32),
  incorrectDeducts: z.boolean(),
  autoReopenAfterIncorrect: z.boolean(),
  teamRetry: z.enum(['none', 'otherMembers']),
  // New fields are optional so older clients/saves still validate; the engine normalises them.
  earlyBuzzPenalty: z.enum(['none', 'lockout', 'clue', 'points']).optional(),
  earlyBuzzLockoutMs: z.number().int().min(0).max(5000),
  earlyBuzzPoints: z.number().int().min(0).max(100000).optional(),
  buzzDebounceMs: z.number().int().min(0).max(2000),
  dailyWagerMin: z.number().int().min(0).max(100000),
  finalAllowNonPositive: z.boolean(),
  allowSelfJoin: z.boolean(),
  requireRoomCode: z.boolean().optional(),
  survivalLives: z.number().int().min(0).max(20).optional(),
  autoUnlock: z.enum(['off', 'all', 'mediaOnly', 'perClue']).optional(),
  maxPlayers: z.number().int().min(0).max(200).optional(),
  maxPerTeam: z.number().int().min(0).max(50).optional(),
  categoryIntro: z.boolean().optional(),
  buzzFairness: z.enum(['off', 'standard', 'generous']).optional(),
  timers: timerRules,
});

export const hostActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addPlayer'), profileId: id }),
  z.object({
    type: z.literal('addTeam'),
    teamId: id.optional(),
    name,
    color,
    avatar: z.string().max(64).optional(),
    buzzerMode: z.enum(['individual', 'shared']),
    memberIds: z.array(id).max(50),
  }),
  z.object({ type: z.literal('removeCompetitor'), competitorId: id }),
  /** Lobby, team games: the number of team slots (R5-5). Removing a slot moves its players to Unassigned. */
  z.object({ type: z.literal('setTeamCount'), count: z.number().int().min(1).max(12) }),
  /** Lobby: game title / practice flag (the Setup screen is part of the lobby now, R5-4). */
  z.object({ type: z.literal('updateGameInfo'), title: z.string().trim().min(1).max(120).optional(), practice: z.boolean().optional() }),
  /** Lobby nickname of a player (R5-17); empty = none. */
  z.object({ type: z.literal('setNickname'), profileId: id, nickname: z.string().trim().max(24) }),
  z.object({ type: z.literal('addBot'), name, level: z.enum(['easy', 'medium', 'hard', 'expert']), color: color.optional(), ai: z.boolean().optional() }),
  // The host buzzes on behalf of a competitor (single-player practice, or a player whose device failed).
  z.object({ type: z.literal('hostBuzz'), competitorId: id }),
  z.object({
    type: z.literal('updateCompetitor'),
    competitorId: id,
    name: name.optional(),
    color: color.optional(),
    avatar: z.string().max(64).optional(),
    buzzerMode: z.enum(['individual', 'shared']).optional(),
    botLevel: z.enum(['easy', 'medium', 'hard', 'expert']).optional(),
    botAi: z.boolean().optional(),
  }),
  // index: position in the team's member list (drag-and-drop reordering, R5-5.4).
  z.object({ type: z.literal('assignMember'), profileId: id, competitorId: id.nullable(), index: z.number().int().min(0).max(50).optional() }),
  z.object({ type: z.literal('approvePlayer'), profileId: id }),
  z.object({ type: z.literal('removeParticipant'), profileId: id }),
  z.object({
    type: z.literal('bindController'),
    controllerId: id,
    kind: z.enum(['joycon', 'phone', 'keyboard', 'gamepad']),
    label: z.string().max(60),
    target,
  }),
  z.object({ type: z.literal('unbindController'), controllerId: id }),
  z.object({ type: z.literal('updateRules'), rules: rulesSchema }),
  z.object({ type: z.literal('startGame') }),
  z.object({ type: z.literal('selectClue'), clueId: id }),
  z.object({ type: z.literal('setDailyWager'), competitorId: id, amount: int, profileId: id.nullable().optional() }),
  // clueId (optional) makes the action a no-op if a different clue is open (stale double taps).
  z.object({ type: z.literal('revealAnswer'), clueId: id.optional() }),
  z.object({ type: z.literal('hideAnswer') }),
  z.object({ type: z.literal('unlockBuzzers') }),
  z.object({ type: z.literal('lockBuzzers') }),
  z.object({ type: z.literal('resetBuzzers') }),
  z.object({
    type: z.literal('judge'),
    result: z.enum(['correct', 'incorrect']),
    competitorId: id.optional(),
    profileId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('closeClue'), clueId: id.optional() }),
  z.object({ type: z.literal('endAnswering'), clueId: id.optional() }),
  z.object({ type: z.literal('refundPenalty'), eventId: id }),
  z.object({ type: z.literal('startIntro'), auto: z.boolean().optional() }),
  z.object({ type: z.literal('introNext') }),
  z.object({ type: z.literal('introSkip') }),
  // R5-12: one step back, straight to a category (step -1 = round title card), stop auto-advance.
  z.object({ type: z.literal('introPrev') }),
  z.object({ type: z.literal('introGoto'), step: z.number().int().min(-1).max(99) }),
  z.object({ type: z.literal('introStopAuto') }),
  z.object({ type: z.literal('restoreClue'), clueId: id }),
  z.object({
    type: z.literal('adjustScore'),
    competitorId: id,
    delta: int,
    note: z.string().max(120).optional(),
    profileId: id.nullable().optional(),
  }),
  // R7-22: take back one score change (a manual adjustment is removed; a gameplay change is
  // offset by an opposite adjustment). Audited: linked to the original event.
  z.object({ type: z.literal('reverseScoreChange'), eventId: id }),
  z.object({ type: z.literal('correctAttribution'), eventId: id, profileId: id.nullable() }),
  z.object({
    type: z.literal('timerStart'),
    kind: z.enum(['buzz', 'answer', 'wager', 'final', 'custom']),
    seconds: z.number().int().min(1).max(3600),
  }),
  z.object({ type: z.literal('timerPause') }),
  z.object({ type: z.literal('timerResume') }),
  z.object({ type: z.literal('timerReset') }),
  z.object({ type: z.literal('timerStop') }),
  z.object({ type: z.literal('setRound'), roundIndex: z.number().int().min(0).max(50) }),
  z.object({ type: z.literal('setControl'), competitorId: id }),
  z.object({ type: z.literal('startFinal') }),
  z.object({ type: z.literal('finalNext') }),
  /** Final reveal (R4-2): contestant → wager → answer → (judge) → next contestant. */
  z.object({ type: z.literal('finalReveal') }),
  /** R9-6.4: start the think time of a Final clue with sound or video before it has finished. */
  z.object({ type: z.literal('finalStartThink') }),
  /** A player's lobby colour (R4-13). */
  z.object({ type: z.literal('setPlayerColor'), profileId: id, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ type: z.literal('setFinalWager'), competitorId: id, amount: int }),
  // submit=false: a draft (autosave / "Change answer"), the TV shows the player as not ready (R5-19).
  z.object({ type: z.literal('setFinalAnswer'), competitorId: id, answer: z.string().max(200), submit: z.boolean().optional() }),
  z.object({
    type: z.literal('judgeFinal'),
    competitorId: id,
    correct: z.boolean(),
    profileId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('endGame') }),
  z.object({ type: z.literal('pauseGame') }),
  z.object({ type: z.literal('resumeGame') }),
  z.object({ type: z.literal('showJoinQr'), show: z.boolean() }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('newRoomCode') }),
  /** Lobby only: switch between individuals and teams (assignments that no longer fit are reset). */
  z.object({ type: z.literal('setMode'), mode: z.enum(['solo', 'team']) }),
  // Media playback (the TV plays; the host controls). durationMs comes from the host's metadata load.
  z.object({ type: z.literal('mediaPlay'), clueId: id, side: z.enum(['clue', 'answer']), index: z.number().int().min(0).max(10), durationMs: z.number().int().min(0).max(36_000_000).nullable().optional() }),
  z.object({ type: z.literal('mediaPause') }),
  z.object({ type: z.literal('mediaRestart') }),
  z.object({ type: z.literal('mediaStop') }),
  z.object({ type: z.literal('mediaMute'), muted: z.boolean() }),
]);

export type HostAction = z.infer<typeof hostActionSchema>;

/** Actions produced by the server itself (never accepted from clients directly). */
export type SystemAction =
  | {
      type: 'buzz';
      competitorId: string;
      profileId: string | null;
      controllerId: string;
      sourceKind: 'joycon' | 'phone' | 'keyboard' | 'gamepad' | 'host' | 'bot';
      /** R6-22 (all optional = plain arrival order): corrected press time (server clock), its ±
       *  uncertainty, and how long to wait for competing presses (arbitration window end). */
      pressAt?: number;
      uncertaintyMs?: number;
      holdUntil?: number;
    }
  /** R6-22: the arbitration window ended — announce the earliest press. */
  | { type: 'buzzResolve' }
  | { type: 'timerExpire' }
  /** A player picks (or leaves, competitorId null) a team on their phone in the lobby (R5-5.3). */
  | { type: 'joinTeam'; profileId: string; competitorId: string | null }
  /** A team member renames / recolours their team in the lobby (R5-5.9). */
  | { type: 'setTeamIdentity'; profileId: string; competitorId: string; name?: string; color?: string }
  /** A player's Daily Double! wager from their phone; the host locks it (R5-20). */
  | { type: 'submitDailyWager'; competitorId: string; profileId: string | null; amount: number }
  | { type: 'playerJoin'; profileId: string; code?: string }
  | { type: 'setRoomCode'; code: string }
  | { type: 'mediaEnded'; clueId: string }
  /** A computer opponent gives its answer; the host still judges it. */
  | { type: 'submitAnswer'; competitorId: string; answer: string; via?: 'ai' | 'local'; warning?: string }
  /** Lobby only: play a different board (loaded and validated by the server). */
  | { type: 'setBoard'; boardId: string; board: BoardContent; title?: string };

export type EngineAction = HostAction | SystemAction;
