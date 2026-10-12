// Host action contract (validated on the server with zod). Clients send these over
// the WebSocket as { t: 'host', action }. Only authenticated host sessions may send them.
import { z } from 'zod';

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
  earlyBuzzLockoutMs: z.number().int().min(0).max(5000),
  buzzDebounceMs: z.number().int().min(0).max(2000),
  dailyWagerMin: z.number().int().min(0).max(100000),
  finalAllowNonPositive: z.boolean(),
  allowSelfJoin: z.boolean(),
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
  z.object({
    type: z.literal('updateCompetitor'),
    competitorId: id,
    name: name.optional(),
    color: color.optional(),
    avatar: z.string().max(64).optional(),
    buzzerMode: z.enum(['individual', 'shared']).optional(),
  }),
  z.object({ type: z.literal('assignMember'), profileId: id, competitorId: id.nullable() }),
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
  z.object({ type: z.literal('revealAnswer') }),
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
  z.object({ type: z.literal('closeClue') }),
  z.object({ type: z.literal('restoreClue'), clueId: id }),
  z.object({
    type: z.literal('adjustScore'),
    competitorId: id,
    delta: int,
    note: z.string().max(120).optional(),
    profileId: id.nullable().optional(),
  }),
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
  z.object({ type: z.literal('setFinalWager'), competitorId: id, amount: int }),
  z.object({ type: z.literal('setFinalAnswer'), competitorId: id, answer: z.string().max(200) }),
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
]);

export type HostAction = z.infer<typeof hostActionSchema>;

/** Actions produced by the server itself (never accepted from clients directly). */
export type SystemAction =
  | {
      type: 'buzz';
      competitorId: string;
      profileId: string | null;
      controllerId: string;
      sourceKind: 'joycon' | 'phone' | 'keyboard' | 'gamepad' | 'host';
    }
  | { type: 'timerExpire' }
  | { type: 'playerJoin'; profileId: string };

export type EngineAction = HostAction | SystemAction;
