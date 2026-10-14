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
  /** Clue-side media (shown with the question). Captions appear under images. */
  media?: MediaRef[];
  /** Answer-side media: replaces the clue media when the answer is revealed (optional). */
  answerMedia?: MediaRef[];
  /** How the TV balances media and text (default auto = media first when there is an image). */
  layout?: ClueLayout;
  /** When buzzers unlock for this clue (default: follow the game rule). */
  unlock?: ClueUnlock;
}

export type ClueLayout = 'auto' | 'media' | 'balanced' | 'text';
export type ClueUnlock = 'default' | 'immediate' | 'host' | 'mediaStart' | 'mediaEnd';

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

/** What happens when someone buzzes while the clue is showing but buzzers are not open yet.
 *  none: recorded only · lockout: locked out for `earlyBuzzLockoutMs` · clue: locked out for the
 *  rest of the clue · points: lose `earlyBuzzPoints` (once per player per clue) + short lockout. */
export type EarlyBuzzPenalty = 'none' | 'lockout' | 'clue' | 'points';

export const EARLY_BUZZ_OPTIONS: Record<EarlyBuzzPenalty, { label: string; description: string }> = {
  none: { label: 'No penalty', description: 'Early presses are ignored (they still count in statistics).' },
  lockout: { label: 'Short lockout', description: 'Buzzing early blocks that player for a moment, like on TV.' },
  clue: { label: 'Out for this clue', description: 'Buzzing early blocks that player until the next clue.' },
  points: { label: 'Lose points', description: 'Buzzing early costs points (once per player per clue) plus a short lockout.' },
};

export interface GameRules {
  preset: string;
  incorrectDeducts: boolean;
  autoReopenAfterIncorrect: boolean;
  /** 'none': a competitor (team) gets one buzz opportunity per clue.
   *  'otherMembers': after an incorrect answer, a different member of the same team may buzz again. */
  teamRetry: 'none' | 'otherMembers';
  earlyBuzzPenalty: EarlyBuzzPenalty;
  earlyBuzzLockoutMs: number; // duration for 'lockout' (and the anti-mash lockout of 'points')
  earlyBuzzPoints: number; // points lost for 'points'
  buzzDebounceMs: number;
  dailyWagerMin: number;
  finalAllowNonPositive: boolean;
  allowSelfJoin: boolean; // players joining from phones are added without host approval
  categoryIntro: boolean; // introduce the categories on the TV at the start of each round
  requireRoomCode: boolean; // phones must type the room code shown on the TV to join this game
  /** Survival mode: lives per player/team (0 = off). Each wrong answer costs a life; at 0 you are out. */
  survivalLives: number;
  /** Automatic buzzer unlock when a clue opens: off (host unlocks), all clues, only clues that are
   *  media without text, or follow each clue's own setting. Per-clue settings apply unless 'off'. */
  autoUnlock: AutoUnlock;
  /** Maximum number of (human) players in this game; 0 = no limit. */
  maxPlayers: number;
  timers: TimerRules;
}

export const DEFAULT_RULES: GameRules = {
  preset: 'classic',
  incorrectDeducts: true,
  autoReopenAfterIncorrect: true,
  teamRetry: 'none',
  earlyBuzzPenalty: 'none',
  earlyBuzzLockoutMs: 250,
  earlyBuzzPoints: 100,
  buzzDebounceMs: 120,
  dailyWagerMin: 5,
  finalAllowNonPositive: false,
  allowSelfJoin: true,
  categoryIntro: true,
  requireRoomCode: false,
  survivalLives: 0,
  autoUnlock: 'off',
  maxPlayers: 0,
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
      earlyBuzzPenalty: 'lockout',
      earlyBuzzLockoutMs: 500,
      timers: { autoStart: true, buzzSeconds: 5, answerSeconds: 5, wagerSeconds: 20, finalSeconds: 20 },
    },
  },
  survival: {
    label: 'Survival',
    description: 'Everyone has 3 lives; each wrong answer costs one. Run out and you are out — last one standing wins.',
    rules: { survivalLives: 3 },
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

/** Fill in rule fields added after a game was saved (older saves / older clients). */
export function normalizeRules(r: Partial<GameRules> | null | undefined): GameRules {
  const src = r ?? {};
  const legacyMs = typeof src.earlyBuzzLockoutMs === 'number' ? src.earlyBuzzLockoutMs : undefined;
  return {
    ...DEFAULT_RULES,
    ...src,
    // Before 'earlyBuzzPenalty' existed, a non-zero lockout meant "short lockout".
    earlyBuzzPenalty: src.earlyBuzzPenalty ?? (legacyMs ? 'lockout' : 'none'),
    earlyBuzzLockoutMs: legacyMs || DEFAULT_RULES.earlyBuzzLockoutMs,
    timers: { ...DEFAULT_RULES.timers, ...(src.timers ?? {}) },
  };
}

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
  /** Computer opponent (solo games): no profile; name/colour live on the competitor. */
  bot?: BotLevel;
  /** Computer opponent answers with the optional AI provider (falls back to offline answers). */
  botAi?: boolean;
}

export type InputKind = 'joycon' | 'phone' | 'keyboard' | 'gamepad' | 'host' | 'bot';

export type BotLevel = 'easy' | 'medium' | 'hard' | 'expert';
export const BOT_LEVELS: Record<BotLevel, { label: string; description: string }> = {
  easy: { label: 'Easy', description: 'Knows about a third of the answers and buzzes slowly.' },
  medium: { label: 'Medium', description: 'Knows about half of the answers; average reactions.' },
  hard: { label: 'Hard', description: 'Knows most answers and buzzes fast.' },
  expert: { label: 'Expert', description: 'Rarely misses and is very quick on the buzzer.' },
};
export const BOT_NAMES = ['Robo Rita', 'Byte Bert', 'Quizbot Quinn', 'Circuit Cleo', 'Professor Pixel', 'Data Dana', 'Gizmo Gus', 'Turing Tess'];

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

export interface EarlyBuzz {
  competitorId: Id;
  profileId: Id | null;
  at: number;
  penalty: EarlyBuzzPenalty;
  until: number | null; // lockout end (CLUE_LOCKOUT = rest of the clue)
  points: number; // points deducted by this early buzz
}

/** Lockout value meaning "until the next clue" (JSON-safe). */
export const CLUE_LOCKOUT = Number.MAX_SAFE_INTEGER;

/** Penalties apply to the person (or to the whole team for a shared buzzer), never to a device. */
export function lockoutKey(competitorId: Id, profileId: Id | null | undefined) {
  return profileId ? `p:${profileId}` : `c:${competitorId}`;
}

export interface BuzzerState {
  status: 'locked' | 'open' | 'buzzed';
  openedAt: number | null;
  winner: BuzzWinner | null;
  /** Ordered later buzzes received after the winner (display only). */
  queue: { competitorId: Id; profileId: Id | null; at: number }[];
  attemptedCompetitors: Id[];
  attemptedProfiles: Id[];
  lockouts: Record<string, number>; // lockoutKey -> until (early-buzz penalty)
  /** Early buzzes during this clue (most recent last). */
  early: EarlyBuzz[];
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
  /** The answering opportunity is over (correct answer, time ran out, host ended it, or nobody
   *  left to try). The host is then guided to reveal the answer and return to the board. */
  answeringEnded: boolean;
  /** How buzzers open for this clue (decided when it opened, from the clue and the game rule). */
  unlockMode: UnlockMode;
  /** An answer given in text (computer opponents): shown to everyone, waiting for the host's
   *  judgment. The answer timer is stopped while it waits. */
  submission?: AnswerSubmission | null;
}

export interface AnswerSubmission {
  competitorId: Id;
  answer: string;
  at: number;
  /** Where the text came from (host only): the AI provider or the offline generator. */
  via?: 'ai' | 'local';
  /** Host-only note, e.g. why the AI was not used. */
  warning?: string;
}

export type AutoUnlock = 'off' | 'all' | 'mediaOnly' | 'perClue';
export type UnlockMode = 'host' | 'immediate' | 'mediaStart' | 'mediaEnd';

/** Authoritative playback of a clue's audio/video. The TV plays it; the host controls it. */
export interface MediaPlayback {
  clueId: Id;
  side: 'clue' | 'answer';
  index: number; // index into that side's media list
  status: 'playing' | 'paused' | 'stopped' | 'ended';
  positionMs: number; // position at startedAt (or when paused)
  startedAt: number | null; // server time playback (re)started; null unless playing
  durationMs: number | null;
  muted: boolean;
  started: boolean; // has played at least once (for "unlock after media starts")
}

export function hasText(s: string | null | undefined) {
  return !!s && s.trim().length > 0;
}

/** Decide how buzzers open for a clue when it is selected. */
export function unlockModeFor(rule: AutoUnlock, clue: Pick<Clue, 'question' | 'media' | 'unlock'>): UnlockMode {
  if (rule === 'off') return 'host';
  const own = clue.unlock && clue.unlock !== 'default' ? clue.unlock : null;
  if (own) return own;
  if (rule === 'all') return 'immediate';
  if (rule === 'mediaOnly') return (clue.media?.length ?? 0) > 0 && !hasText(clue.question) ? 'immediate' : 'host';
  return 'host';
}

export function mediaPosition(m: MediaPlayback, now: number) {
  const p = m.status === 'playing' && m.startedAt != null ? m.positionMs + (now - m.startedAt) : m.positionMs;
  return m.durationMs != null ? Math.min(p, m.durationMs) : p;
}

/** Category introduction on the TV at the start of a round. step -1 = round title card. */
export interface IntroState {
  roundIndex: number;
  step: number;
  auto: boolean;
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
  | 'submission'
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
  intro: IntroState | null;
  media: MediaPlayback | null;
  events: GameplayEvent[];
  seq: number;
  showJoinQr: boolean;
  /** Practice game: playable and kept in history, but not counted in statistics or leaderboards. */
  practice: boolean;
  /** Short code shown on the TV; required to join when rules.requireRoomCode (never sent to phones). */
  roomCode: string;
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

/** Room codes avoid look-alike letters (no I, O, L, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** Survival lives left per competitor, derived from non-voided incorrect answers (so undo stays exact). */
export function livesOf(s: Pick<GameState, 'rules' | 'events' | 'competitors'>): Record<Id, number> | null {
  const max = s.rules.survivalLives;
  if (!max) return null;
  const out: Record<Id, number> = {};
  for (const c of s.competitors) out[c.id] = max;
  for (const e of s.events) if (!e.voided && e.type === 'answer' && e.result === 'incorrect' && e.competitorId && e.competitorId in out) out[e.competitorId] = Math.max(0, out[e.competitorId] - 1);
  return out;
}

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
