// Role-specific projections of the authoritative game state sent to clients.
import type {
  BuzzerState,
  Competitor,
  ControllerBinding,
  FinalRevealStep,
  FinalState,
  GameResult,
  GameRules,
  GameplayEvent,
  Id,
  IntroState,
  ClueLayout,
  MediaPlayback,
  UnlockMode,
  MediaRef,
  Phase,
  TimerState,
  UnassignedParticipant,
  InputKind,
} from './game.js';

export type ViewRole = 'host' | 'public' | 'player';

/** One press of the current buzzer opening, for the host (R6-23). */
export interface BuzzTimingRow {
  competitorId: Id;
  profileId: Id | null;
  sourceKind: InputKind;
  result: 'won' | 'late';
  /** Milliseconds after the winner's press (0 for the winner). */
  gapMs: number;
  confident: boolean;
}

export interface ProfilePublic {
  id: Id;
  name: string;
  nickname: string;
  color: string;
  avatar: string; // built-in avatar id
  pictureUrl: string | null;
  /** R12-11: a guest (nickname only, no PIN): kept out of profile lists, leaderboards and statistics. */
  guest?: true;
}

export interface ClueCell {
  id: Id;
  value: number;
  used: boolean;
  dailyWager?: boolean; // host only
  question?: string; // host only
  answer?: string; // host only
}

export interface RoundView {
  name: string;
  kind: 'standard' | 'final';
  categories: { id: Id; name: string; subheading?: string; clues: ClueCell[] }[];
}

export interface ClueView {
  clueId: Id;
  categoryName: string;
  value: number;
  isDailyWager: boolean;
  stage: 'wager' | 'question';
  question: string | null; // hidden on public screens during the Daily Wager wager stage
  answer: string | null; // host always; others only when revealed
  notes: string | null; // host only
  media: MediaRef[];
  wager: { competitorId: Id; amount: number; profileId: Id | null } | null;
  /** Daily Double!: who wagers (R5-20). */
  wagerBy?: Id | null;
  /** R16-7: Daily Double!: the host has unlocked wagering. */
  wagerOpen?: boolean;
  /** Daily Double!: wager sent from a phone, not locked yet. The amount is for the host only. */
  pendingWager?: { competitorId: Id; amount: number | null; profileId: Id | null } | null;
  /** R17-2: Daily Double!: who enters the wager (host in the band, or the player's phone). */
  wagerEntry?: 'host' | 'player';
  /** R17-1: Daily Double!: the answer time was started by the host (Start Timer). */
  answerStarted?: boolean;
  answerRevealed: boolean;
  resolved: boolean;
  answeringEnded: boolean;
  /** Answer-side media: host always; others only once the answer is revealed. */
  answerMedia: MediaRef[];
  layout: ClueLayout;
  unlockMode: UnlockMode;
  /** Answer given in text (computer opponents), waiting for the host's judgment. */
  submission?: { competitorId: Id; answer: string; at: number; via?: 'ai' | 'local'; warning?: string } | null;
}

export interface FinalEntryView {
  competitorId: Id;
  hasWager: boolean;
  hasAnswer: boolean;
  /** An answer is submitted and the player is not changing it (TV: green border, R5-6). */
  submitted: boolean;
  wager: number | null; // hidden from everyone until its reveal step
  answer: string | null; // hidden from everyone until its reveal step
  judged: boolean;
  correct: boolean | null;
  profileId: Id | null;
}

export interface FinalView {
  stage: FinalState['stage'];
  category: string;
  /** R8-9: the category's subheading ('' when none). */
  categorySubheading: string;
  question: string | null;
  answer: string | null;
  /** The Final clue's id (media playback refers to it). */
  clueId: Id;
  /** Clue media (R9-6): visible like the question. */
  media: MediaRef[];
  /** Correct-response media: host always; others only once the correct response is shown. */
  answerMedia: MediaRef[];
  layout: ClueLayout;
  /** Think time has begun (see FinalState.thinking). */
  thinking: boolean;
  /** Reveal order, lowest → highest pre-Final score (R4-2). */
  order: Id[];
  preScores: Record<Id, number>;
  cursor: number;
  step: FinalRevealStep;
  entries: FinalEntryView[];
}

export interface CompetitorView extends Competitor {
  score: number;
  /** Survival mode: lives left (absent when survival is off). */
  lives?: number;
}

export interface GameView {
  role: ViewRole;
  id: Id;
  title: string;
  /** The board being played (host only). */
  boardId?: Id | null;
  mode: 'solo' | 'team';
  phase: Phase;
  paused: boolean;
  roundIndex: number;
  rules: GameRules;
  rounds: RoundView[];
  competitors: CompetitorView[];
  unassigned: UnassignedParticipant[];
  bindings: ControllerBinding[];
  controlCompetitorId: Id | null;
  clue: ClueView | null;
  buzzer: Omit<BuzzerState, 'lockouts' | 'attemptedProfiles' | 'pending' | 'attempts'> & {
    attemptedProfiles: Id[];
    /** Host only (R6-23): the presses of this opening in press order, with the gap to the winner
     *  and whether that gap is larger than the timing uncertainty. */
    timing?: BuzzTimingRow[];
  };
  final: FinalView | null;
  timer: TimerState | null;
  intro: IntroState | null;
  media: MediaPlayback | null;
  practice: boolean;
  /** Shown on the TV and to the host; always null for phones. */
  roomCode: string | null;
  showJoinQr: boolean;
  results: GameResult[] | null;
  startedAt: number | null;
  endedAt: number | null;
  profiles: Record<Id, ProfilePublic>;
  online?: Id[]; // profiles with a connected phone/portal
  /** R15-29: the tile a computer player has just chosen, outlined for a moment before it opens. */
  pickHint?: { clueId: Id; at: number } | null;
  /** The latest event that changed scores (R7-11). `quiet` = a manual adjustment or an undo: the
   *  TV shows the new total without a sound or the "+$/−$" swap. */
  scoreCause?: { seq: number; quiet: boolean } | null;
  // host only
  undoLabel?: string | null;
  events?: GameplayEvent[];
  contributions?: Record<Id, number>; // profileId -> net contribution this game
}

export interface PlayerContext {
  profileId: Id;
  competitorId: Id | null;
  pending: boolean;
  canBuzz: boolean;
  /** The button is live: buzzers open, or the clue is showing and an early press would count
   *  (so phones behave like physical buzzers, including early-buzz rules). */
  canPress: boolean;
  buzzReason: string | null;
  sharedTeam: boolean;
  /** End of an early-buzz lockout (server time); null = none. Very large = rest of the clue. */
  lockedUntil: number | null;
  /** Lobby colour (R4-13): current colour, whether to ask the player to choose, colours taken by others. */
  color?: { current: string; choose: boolean; taken: string[] } | null;
  /** This player's (team's) own Final Jeopardy! wager and answer (private to them). */
  final?: { wager: number | null; answer: string | null; submitted: boolean; draft: string | null } | null;
  /** R6-23: how this player's press of the current opening compared with the others (only when
   *  they pressed). `gapMs` is to the winner when they lost, to the runner-up when they won;
   *  `confident` = larger than the timing uncertainty (show the number), else "very close". */
  buzzTiming?: { result: 'won' | 'late'; otherCompetitorId: Id | null; otherProfileId: Id | null; gapMs: number | null; confident: boolean; teammateWon: boolean } | null;
  /** Daily Double! wager stage for this player's competitor (R5-20). */
  /** `open`: the host has unlocked wagering (R16-7) — the phone shows the entry only then. */
  dailyWager?: { min: number; max: number; pending: number | null; pendingBy: Id | null; mine: boolean; open: boolean; byHost: boolean } | null;
}
