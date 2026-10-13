// Role-specific projections of the authoritative game state sent to clients.
import type {
  BuzzerState,
  Competitor,
  ControllerBinding,
  FinalState,
  GameResult,
  GameRules,
  GameplayEvent,
  Id,
  IntroState,
  MediaRef,
  Phase,
  TimerState,
  UnassignedParticipant,
} from './game.js';

export type ViewRole = 'host' | 'public' | 'player';

export interface ProfilePublic {
  id: Id;
  name: string;
  nickname: string;
  color: string;
  avatar: string; // built-in avatar id
  pictureUrl: string | null;
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
  categories: { id: Id; name: string; clues: ClueCell[] }[];
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
  answerRevealed: boolean;
  resolved: boolean;
  answeringEnded: boolean;
}

export interface FinalEntryView {
  competitorId: Id;
  hasWager: boolean;
  hasAnswer: boolean;
  wager: number | null; // hidden from non-host until judged
  answer: string | null; // hidden from non-host until judged
  judged: boolean;
  correct: boolean | null;
  profileId: Id | null;
}

export interface FinalView {
  stage: FinalState['stage'];
  category: string;
  question: string | null;
  answer: string | null;
  entries: FinalEntryView[];
}

export interface CompetitorView extends Competitor {
  score: number;
}

export interface GameView {
  role: ViewRole;
  id: Id;
  title: string;
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
  buzzer: Omit<BuzzerState, 'lockouts' | 'attemptedProfiles'> & { attemptedProfiles: Id[] };
  final: FinalView | null;
  timer: TimerState | null;
  intro: IntroState | null;
  showJoinQr: boolean;
  results: GameResult[] | null;
  startedAt: number | null;
  endedAt: number | null;
  profiles: Record<Id, ProfilePublic>;
  online?: Id[]; // profiles with a connected phone/portal
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
}
