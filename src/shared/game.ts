// Shared game domain model. Used by the server engine and all clients.
// Identity model: profiles (people), teams (groups of profiles) and controllers
// (input devices) are separate. Points belong to *competitors* — a competitor is
// either a solo player or a team. Individual contributions are statistics only.

export type Id = string;

// ---------- Boards ----------

export interface MediaRef {
  kind: 'image' | 'audio' | 'video';
  url: string; // local URL served by the game server (/media/...)
  caption?: string;
}

export interface Clue {
  id: Id;
  value: number;
  question: string;
  answer: string;
  notes?: string; // host-only notes
  dailyWager?: boolean;
  media?: MediaRef[];
}

export interface Category {
  id: Id;
  name: string;
  clues: Clue[];
}

export interface Round {
  id: Id;
  name: string;
  kind: 'standard' | 'final';
  categories: Category[]; // final round: exactly one category with one clue
}

export interface BoardContent {
  rounds: Round[];
}

export interface BoardMeta {
  id: Id;
  title: string;
  description: string;
  tags: string[];
  folder: string;
  favorite: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Board extends BoardMeta {
  content: BoardContent;
}

// ---------- Rules ----------

export interface TimerRules {
  autoStart: boolean;
  buzzSeconds: number; // time to buzz after unlock (0 = disabled)
  answerSeconds: number; // time to answer after winning buzz (0 = disabled)
  wagerSeconds: number;
  finalSeconds: number;
}

export interface GameRules {
  preset: string;
  incorrectDeducts: boolean;
  autoReopenAfterIncorrect: boolean;
  /** 'none': a competitor (team) gets one buzz opportunity per clue.
   *  'otherMembers': after an incorrect answer, a different member of the same team may buzz again. */
  teamRetry: 'none' | 'otherMembers';
  earlyBuzzLockoutMs: number; // 0 = early buzzes are ignored without penalty
  buzzDebounceMs: number;
  dailyWagerMin: number;
  finalAllowNonPositive: boolean;
  allowSelfJoin: boolean; // players joining from phones are added without host approval
  timers: TimerRules;
}

export const DEFAULT_RULES: GameRules = {
  preset: 'classic',
  incorrectDeducts: true,
  autoReopenAfterIncorrect: true,
  teamRetry: 'none',
  earlyBuzzLockoutMs: 0,
  buzzDebounceMs: 120,
  dailyWagerMin: 5,
  finalAllowNonPositive: false,
  allowSelfJoin: true,
  timers: { autoStart: true, buzzSeconds: 10, answerSeconds: 8, wagerSeconds: 30, finalSeconds: 30 },
};

export const RULE_PRESETS: Record<string, { label: string; description: string; rules: Partial<GameRules> }> = {
  classic: { label: 'Classic', description: 'Wrong answers lose points. One buzz per player or team per clue.', rules: {} },
  classroom: {
    label: 'Classroom',
    description: 'No penalty for wrong answers, longer timers, everyone can play Final.',
    rules: {
      incorrectDeducts: false,
      finalAllowNonPositive: true,
      timers: { autoStart: true, buzzSeconds: 20, answerSeconds: 15, wagerSeconds: 45, finalSeconds: 60 },
    },
  },
  speed: {
    label: 'Speed Trivia',
    description: 'Short timers and an early-buzz lockout.',
    rules: {
      earlyBuzzLockoutMs: 250,
      timers: { autoStart: true, buzzSeconds: 5, answerSeconds: 5, wagerSeconds: 20, finalSeconds: 20 },
    },
  },
  teamBattle: {
    label: 'Team Battle',
    description: 'Classic scoring; another teammate may try after a wrong answer.',
    rules: { teamRetry: 'otherMembers' },
  },
  casual: {
    label: 'Casual (no timers)',
    description: 'Timers off; the host runs the pace.',
    rules: { timers: { autoStart: false, buzzSeconds: 0, answerSeconds: 0, wagerSeconds: 0, finalSeconds: 0 } },
  },
};

export function rulesFromPreset(preset: string): GameRules {
  const p = RULE_PRESETS[preset] ?? RULE_PRESETS.classic;
  return {
    ...DEFAULT_RULES,
    ...p.rules,
    timers: { ...DEFAULT_RULES.timers, ...(p.rules.timers ?? {}) },
    preset: RULE_PRESETS[preset] ? preset : 'classic',
  };
}

// ---------- Competitors / controllers ----------

export const TEAM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

export type BuzzerMode = 'individual' | 'shared';

export interface Competitor {
  id: Id;
  kind: 'player' | 'team';
  profileId?: Id; // kind === 'player'
  teamId?: Id; // kind === 'team' (stable saved-team id)
  name: string; // team name snapshot (players resolve live from profile)
  color: string;
  avatar?: string;
  buzzerMode: BuzzerMode;
  memberIds: Id[]; // profile ids (historical membership for this game)
}

export type InputKind = 'joycon' | 'phone' | 'keyboard' | 'gamepad' | 'host';

export type BindingTarget = { kind: 'profile'; profileId: Id } | { kind: 'competitor'; competitorId: Id };

export interface ControllerBinding {
  controllerId: Id;
  kind: InputKind;
  label: string;
  target: BindingTarget;
}

// ---------- Live state ----------

export type Phase = 'lobby' | 'board' | 'clue' | 'final' | 'ended';

export interface BuzzWinner {
  competitorId: Id;
  profileId: Id | null;
  controllerId: Id;
  sourceKind: InputKind;
  at: number;
  reactionMs: number | null;
}

export interface BuzzerState {
  status: 'locked' | 'open' | 'buzzed';
  openedAt: number | null;
  winner: BuzzWinner | null;
  /** Ordered later buzzes received after the winner (display only). */
  queue: { competitorId: Id; profileId: Id | null; at: number }[];
  attemptedCompetitors: Id[];
  attemptedProfiles: Id[];
  lockouts: Record<string, number>; // controllerId -> until (early-buzz penalty)
}

export interface ActiveClue {
  clueId: Id;
  roundIndex: number;
  categoryIndex: number;
  clueIndex: number;
  value: number;
  isDailyWager: boolean;
  stage: 'wager' | 'question';
  wager: { competitorId: Id; amount: number; profileId: Id | null } | null;
  answerRevealed: boolean;
  resolved: boolean; // correct answer given or host closed scoring
}

export interface FinalEntry {
  competitorId: Id;
  wager: number | null;
  answer: string | null;
  judged: boolean;
  correct: boolean | null;
  profileId: Id | null; // optional attribution (statistics only)
}

export interface FinalState {
  stage: 'category' | 'wagers' | 'clue' | 'reveal' | 'done';
  roundIndex: number;
  entries: FinalEntry[];
}

export interface TimerState {
  kind: 'buzz' | 'answer' | 'wager' | 'final' | 'custom';
  durationMs: number;
  remainingMs: number; // remaining at `startedAt` (or at pause time)
  startedAt: number | null; // server time when last started; null when paused/stopped
  running: boolean;
  expired: boolean;
  heldByPause?: boolean; // paused because the whole game was paused
}

export type EventType =
  | 'game_start'
  | 'round_change'
  | 'clue_open'
  | 'clue_close'
  | 'buzz'
  | 'answer'
  | 'wager'
  | 'score_adjust'
  | 'attribution_correction'
  | 'undo'
  | 'game_end';

export interface GameplayEvent {
  id: Id;
  seq: number;
  type: EventType;
  at: number;
  clueId?: Id;
  roundIndex?: number;
  competitorId?: Id;
  profileId?: Id | null;
  controllerId?: Id;
  sourceKind?: InputKind;
  /** buzz: won | late | early ; answer: correct | incorrect ; wager: daily | final */
  result?: string;
  scoreDelta: number; // applies to the competitor's game score
  contributionDelta: number; // statistics only: applies to profileId's contribution
  wager?: number;
  reactionMs?: number | null;
  note?: string;
  correctsEventId?: Id;
  voided: boolean;
  voidedBy?: Id;
}

export interface UnassignedParticipant {
  profileId: Id;
  joinedAt: number;
  pending: boolean; // waiting for host approval
}

export interface GameResult {
  competitorId: Id;
  score: number;
  placement: number;
  isWinner: boolean;
}

export interface GameState {
  id: Id;
  title: string;
  boardId: Id | null;
  mode: 'solo' | 'team';
  rules: GameRules;
  board: BoardContent; // snapshot taken at game creation
  phase: Phase;
  paused: boolean;
  roundIndex: number;
  usedClueIds: Id[];
  competitors: Competitor[];
  unassigned: UnassignedParticipant[];
  bindings: ControllerBinding[];
  controlCompetitorId: Id | null;
  clue: ActiveClue | null;
  buzzer: BuzzerState;
  final: FinalState | null;
  timer: TimerState | null;
  events: GameplayEvent[];
  seq: number;
  showJoinQr: boolean;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  results: GameResult[] | null;
  /** Server-only: snapshots of gameplay fields for undo (never sent to non-host clients). */
  undoStack: UndoSnapshot[];
}

export interface UndoSnapshot {
  label: string;
  seq: number; // events with seq > this are voided when undoing
  data: string; // JSON of the restorable gameplay fields
}

// ---------- Helpers shared by client and server ----------

export function scoresOf(events: GameplayEvent[]): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const e of events) {
    if (e.voided || !e.competitorId || !e.scoreDelta) continue;
    out[e.competitorId] = (out[e.competitorId] ?? 0) + e.scoreDelta;
  }
  return out;
}

export function findClue(board: BoardContent, clueId: Id) {
  for (let r = 0; r < board.rounds.length; r++) {
    const round = board.rounds[r];
    for (let c = 0; c < round.categories.length; c++) {
      const cat = round.categories[c];
      for (let q = 0; q < cat.clues.length; q++) {
        if (cat.clues[q].id === clueId) return { round, category: cat, clue: cat.clues[q], r, c, q };
      }
    }
  }
  return null;
}

export function timerRemaining(t: TimerState | null, now: number): number {
  if (!t) return 0;
  if (!t.running || t.startedAt == null) return Math.max(0, t.remainingMs);
  return Math.max(0, t.remainingMs - (now - t.startedAt));
}
