// Pure, deterministic game engine: (state, action, ctx) -> result.
// No I/O. The server persists returned state + touched events and broadcasts projections.
import type { EngineAction } from '../../shared/actions.js';
import {
  type ActiveClue,
  type BuzzerState,
  type Competitor,
  type GameplayEvent,
  type GameResult,
  type GameRules,
  type GameState,
  type BoardContent,
  type Id,
  type TimerState,
  CLUE_LOCKOUT,
  findClue,
  finalRevealOrder,
  firstFreeColor,
  livesOf,
  mediaPosition,
  unlockModeFor,
  lockoutKey,
  ROOM_CODE_RE,
  normalizeRules,
  scoresOf,
  timerRemaining,
  TEAM_COLORS,
  TEAM_SLOT_NAMES,
  defaultTeamCount,
} from '../../shared/game.js';
export { TEAM_COLORS };

export interface EngineCtx {
  now: number;
  newId: () => string;
  /** A profile's preferred colour (R4-13), looked up by the server. */
  colorOf?: (profileId: Id) => string | null;
  /** Who sent the action ('host', 'profile:<id>', 'bot', 'timer', …). */
  actor?: string;
}

/** Inputs players send themselves: never an undo step, so the host's Undo skips over them. */
const PLAYER_INPUTS = new Set(['setFinalWager', 'setFinalAnswer']);

export type EngineResult =
  | { ok: true; state: GameState; touchedEvents: GameplayEvent[]; ignored?: boolean; info?: string }
  | { ok: false; error: string };


const UNDOABLE = new Set([
  'selectClue',
  'setDailyWager',
  'revealAnswer',
  'hideAnswer',
  'unlockBuzzers',
  'lockBuzzers',
  'resetBuzzers',
  'judge',
  'closeClue',
  'restoreClue',
  'adjustScore',
  'correctAttribution',
  'setRound',
  'setControl',
  'startFinal',
  'finalNext',
  'setFinalWager',
  'setFinalAnswer',
  'judgeFinal',
  'endGame',
  'startGame',
  'endAnswering',
  'refundPenalty',
]);
const UNDO_LIMIT = 100;

export function emptyBuzzer(): BuzzerState {
  return {
    status: 'locked',
    openedAt: null,
    winner: null,
    queue: [],
    attemptedCompetitors: [],
    attemptedProfiles: [],
    lockouts: {},
    early: [],
  };
}

/** Bring a saved state from an older version up to the current shape (no data is dropped). */
export function normalizeState(s: GameState): GameState {
  s.rules = normalizeRules(s.rules);
  s.buzzer = { ...emptyBuzzer(), ...(s.buzzer ?? {}) };
  if (!Array.isArray(s.buzzer.early)) s.buzzer.early = [];
  if (s.clue && typeof s.clue.answeringEnded !== 'boolean') s.clue.answeringEnded = s.clue.resolved;
  if (s.intro === undefined) s.intro = null;
  if (s.media === undefined) s.media = null;
  if (s.clue && !s.clue.unlockMode) s.clue.unlockMode = 'host';
  if (typeof s.practice !== 'boolean') s.practice = false;
  if (typeof s.roomCode !== 'string') s.roomCode = ''; // filled with a random code on load
  if (!s.playerColors) s.playerColors = {};
  if (!Array.isArray(s.colorPrompts)) s.colorPrompts = [];
  if (s.final) for (const e of s.final.entries) if (typeof e.submitted !== 'boolean') e.submitted = !!e.answer;
  if (!s.nicknames) s.nicknames = {};
  if (s.final && !Array.isArray(s.final.order)) {
    // Saved before the one-at-a-time reveal (R4-2): rebuild the order from pre-Final scores.
    const pre = scoresOf(s.events.filter((x) => !(x.type === 'answer' && x.note === 'final')));
    const ids = s.final.entries.map((x) => x.competitorId);
    s.final.preScores = Object.fromEntries(s.competitors.map((c) => [c.id, pre[c.id] ?? 0]));
    s.final.order = finalRevealOrder(ids, s.final.preScores, s.competitors.map((c) => c.id));
    const next = s.final.order.findIndex((id) => !s.final!.entries.find((x) => x.competitorId === id)?.judged);
    s.final.cursor = next < 0 ? Math.max(0, s.final.order.length - 1) : next;
    s.final.step = next < 0 ? 'answer' : 'contestant';
  }
  return s;
}

export function createGame(opts: {
  id: Id;
  title: string;
  boardId: Id | null;
  board: BoardContent;
  mode: 'solo' | 'team';
  rules: GameRules;
  now: number;
  practice?: boolean;
  roomCode?: string;
}): GameState {
  return {
    id: opts.id,
    title: opts.title,
    boardId: opts.boardId,
    mode: opts.mode,
    rules: normalizeRules(opts.rules),
    board: opts.board,
    phase: 'lobby',
    paused: false,
    roundIndex: Math.max(0, opts.board.rounds.findIndex((r) => r.kind === 'standard')),
    usedClueIds: [],
    competitors: [],
    unassigned: [],
    bindings: [],
    controlCompetitorId: null,
    clue: null,
    buzzer: emptyBuzzer(),
    final: null,
    timer: null,
    intro: null,
    media: null,
    events: [],
    seq: 0,
    showJoinQr: true,
    practice: !!opts.practice,
    roomCode: opts.roomCode ?? '',
    createdAt: opts.now,
    startedAt: null,
    endedAt: null,
    results: null,
    undoStack: [],
    nicknames: {},
  };
}

// ---------- small helpers ----------

class EngineError extends Error {}
const fail = (msg: string): never => {
  throw new EngineError(msg);
};

function competitorOf(s: GameState, id: Id | undefined | null): Competitor {
  const c = s.competitors.find((x) => x.id === id);
  if (!c) fail('Unknown player or team');
  return c!;
}

export function competitorForProfile(s: GameState, profileId: Id): Competitor | undefined {
  return s.competitors.find((c) => c.memberIds.includes(profileId));
}

function isParticipant(s: GameState, profileId: Id) {
  return !!competitorForProfile(s, profileId) || s.unassigned.some((u) => u.profileId === profileId);
}

function makeTimer(kind: TimerState['kind'], seconds: number, now: number): TimerState {
  const ms = seconds * 1000;
  return { kind, durationMs: ms, remainingMs: ms, startedAt: now, running: true, expired: false };
}

function maybeAutoTimer(s: GameState, kind: TimerState['kind'], now: number) {
  const t = s.rules.timers;
  const secs =
    kind === 'buzz' ? t.buzzSeconds : kind === 'answer' ? t.answerSeconds : kind === 'wager' ? t.wagerSeconds : t.finalSeconds;
  s.timer = t.autoStart && secs > 0 ? makeTimer(kind, secs, now) : null;
}

/** Validates that an attribution target belongs to the competitor. Returns null for team-only. */
function attribution(c: Competitor, requested: Id | null | undefined, fallback: Id | null): Id | null {
  if (c.kind === 'player') return c.profileId ?? null;
  const pid = requested !== undefined ? requested : fallback;
  if (pid == null) return null;
  if (!c.memberIds.includes(pid)) fail('That player is not on this team');
  return pid;
}

export function roundMaxValue(s: GameState): number {
  const round = s.board.rounds[s.roundIndex];
  let max = 0;
  for (const cat of round?.categories ?? []) for (const cl of cat.clues) max = Math.max(max, cl.value);
  return max;
}

export function computeResults(s: GameState): GameResult[] {
  const scores = scoresOf(s.events);
  const lives = livesOf(s);
  // Survival: players still in the game rank above eliminated ones, then by score.
  const alive = (id: Id) => (lives ? (lives[id] > 0 ? 1 : 0) : 1);
  const rows = s.competitors.map((c) => ({ competitorId: c.id, score: scores[c.id] ?? 0, alive: alive(c.id) }));
  rows.sort((a, b) => b.alive - a.alive || b.score - a.score);
  const out: GameResult[] = [];
  rows.forEach(({ alive: _a, ...r }, i) => {
    const placement = i > 0 && rows[i - 1].score === r.score && rows[i - 1].alive === rows[i].alive ? out[i - 1].placement : i + 1;
    out.push({ ...r, placement, isWinner: placement === 1 });
  });
  return out;
}

/** Can this competitor/profile buzz right now? Shared by engine and player projections. */
export function buzzBlockReason(s: GameState, competitorId: Id, profileId: Id | null, now: number): string | null {
  if (s.phase !== 'clue' || !s.clue) return 'no-clue';
  if (s.paused) return 'paused';
  if (s.clue.isDailyWager || s.clue.resolved || s.clue.stage !== 'question') return 'not-buzzable';
  if (s.clue.answeringEnded) return 'ended';
  const c = s.competitors.find((x) => x.id === competitorId);
  if (!c) return 'not-playing';
  if (isEliminated(s, competitorId)) return 'eliminated';
  if (s.buzzer.attemptedCompetitors.includes(competitorId)) {
    const retryOk =
      s.rules.teamRetry === 'otherMembers' &&
      c.kind === 'team' &&
      c.buzzerMode === 'individual' &&
      profileId != null &&
      !s.buzzer.attemptedProfiles.includes(profileId);
    if (!retryOk) return 'already-answered';
  }
  if (lockoutUntil(s, competitorId, profileId) > now) return 'locked-out';
  if (s.buzzer.status === 'locked') return 'locked';
  if (s.buzzer.status === 'buzzed') return 'taken';
  return null;
}

export function isEliminated(s: GameState, competitorId: Id) {
  const lives = livesOf(s);
  return !!lives && (lives[competitorId] ?? 1) <= 0;
}

/** End of the early-buzz lockout affecting this person (or shared-buzzer team); 0 when none. */
export function lockoutUntil(s: GameState, competitorId: Id, profileId: Id | null): number {
  return Math.max(s.buzzer.lockouts[lockoutKey(competitorId, profileId)] ?? 0, s.buzzer.lockouts[lockoutKey(competitorId, null)] ?? 0);
}

// ---------- event helpers ----------

interface Tx {
  s: GameState;
  ctx: EngineCtx;
  touched: Map<Id, GameplayEvent>;
}

function emit(tx: Tx, e: Omit<GameplayEvent, 'id' | 'seq' | 'at' | 'voided' | 'scoreDelta' | 'contributionDelta'> & Partial<GameplayEvent>) {
  const ev: GameplayEvent = {
    scoreDelta: 0,
    contributionDelta: 0,
    ...e,
    id: tx.ctx.newId(),
    seq: ++tx.s.seq,
    at: tx.ctx.now,
    voided: false,
  };
  tx.s.events.push(ev);
  tx.touched.set(ev.id, ev);
  return ev;
}

function voidEvent(tx: Tx, ev: GameplayEvent, by: Id) {
  ev.voided = true;
  ev.voidedBy = by;
  tx.touched.set(ev.id, ev);
}

// ---------- undo ----------

const RESTORABLE = ['phase', 'roundIndex', 'usedClueIds', 'controlCompetitorId', 'clue', 'buzzer', 'final', 'timer', 'intro', 'endedAt', 'results', 'startedAt', 'paused'] as const;

function snapshot(s: GameState, label: string) {
  const data: Record<string, unknown> = {};
  for (const k of RESTORABLE) data[k] = s[k];
  s.undoStack.push({ label, seq: s.seq, data: JSON.stringify(data) });
  if (s.undoStack.length > UNDO_LIMIT) s.undoStack.splice(0, s.undoStack.length - UNDO_LIMIT);
}

export function undoLabel(type: string): string {
  const labels: Record<string, string> = {
    selectClue: 'open clue',
    setDailyWager: 'Daily Double!',
    revealAnswer: 'reveal answer',
    hideAnswer: 'hide answer',
    unlockBuzzers: 'unlock buzzers',
    lockBuzzers: 'lock buzzers',
    resetBuzzers: 'reset buzzers',
    judge: 'judgement',
    closeClue: 'close clue',
    restoreClue: 'restore clue',
    adjustScore: 'score adjustment',
    correctAttribution: 'attribution change',
    setRound: 'round change',
    setControl: 'board control',
    startFinal: 'start Final',
    finalNext: 'Final step',
    setFinalWager: 'Final Jeopardy! wager',
    setFinalAnswer: 'Final Jeopardy! answer',
    judgeFinal: 'Final judgement',
    endGame: 'end game',
    startGame: 'start game',
    endAnswering: 'end answering',
    refundPenalty: 'penalty refund',
  };
  return labels[type] ?? type;
}

// ---------- main reducer ----------

export function applyAction(prev: GameState, action: EngineAction, ctx: EngineCtx): EngineResult {
  const s: GameState = structuredClone(prev);
  const tx: Tx = { s, ctx, touched: new Map() };
  try {
    const playerInput = PLAYER_INPUTS.has(action.type) && !!ctx.actor && ctx.actor !== 'host';
    if (UNDOABLE.has(action.type) && !playerInput) snapshot(s, undoLabel(action.type));
    const res = reduce(tx, action);
    syncPlayerColors(s, ctx);
    return { ok: true, state: s, touchedEvents: [...tx.touched.values()], ...(res ?? {}) };
  } catch (e) {
    if (e instanceof EngineError) return { ok: false, error: e.message };
    throw e;
  }
}

type ReduceExtra = { ignored?: boolean; info?: string } | void;

function reduce(tx: Tx, a: EngineAction): ReduceExtra {
  const { s, ctx } = tx;
  const now = ctx.now;
  switch (a.type) {
    // ----- setup -----
    case 'addPlayer': {
      if (isParticipant(s, a.profileId) && competitorForProfile(s, a.profileId)) fail('Player is already in this game');
      if (!isParticipant(s, a.profileId)) checkRoom(s);
      s.unassigned = s.unassigned.filter((u) => u.profileId !== a.profileId);
      if (s.mode === 'team') {
        s.unassigned.push({ profileId: a.profileId, joinedAt: now, pending: false });
        return;
      }
      s.competitors.push({
        id: ctx.newId(),
        kind: 'player',
        profileId: a.profileId,
        name: '',
        color: TEAM_COLORS[s.competitors.length % TEAM_COLORS.length],
        buzzerMode: 'individual',
        memberIds: [a.profileId],
      });
      return;
    }
    case 'addTeam': {
      if (s.mode !== 'team') fail('Teams are only available in team games');
      if (a.teamId && s.competitors.some((c) => c.teamId === a.teamId)) fail('That team is already in this game');
      for (const pid of a.memberIds) {
        const other = competitorForProfile(s, pid);
        if (other) fail('A player can only be on one team per game');
      }
      s.unassigned = s.unassigned.filter((u) => !a.memberIds.includes(u.profileId));
      s.competitors.push({
        id: ctx.newId(),
        kind: 'team',
        teamId: a.teamId,
        name: a.name,
        color: a.color,
        avatar: a.avatar,
        buzzerMode: a.buzzerMode,
        memberIds: [...new Set(a.memberIds)],
      });
      return;
    }
    case 'addBot': {
      if (s.mode !== 'solo') fail('Computer opponents play in individual (solo) games');
      if (s.competitors.filter((c) => c.bot).length >= 5) fail('Up to 5 computer opponents per game');
      if (s.competitors.some((c) => c.bot && c.name.toLowerCase() === a.name.trim().toLowerCase())) fail('Give each computer opponent a different name');
      s.competitors.push({
        id: ctx.newId(),
        kind: 'player',
        name: a.name.trim(),
        color: a.color ?? firstFreeColor(takenColors(s)),
        avatar: 'robot',
        buzzerMode: 'individual',
        memberIds: [],
        bot: a.level,
        ...(a.ai ? { botAi: true } : {}),
      });
      return;
    }
    case 'hostBuzz': {
      const c = competitorOf(s, a.competitorId);
      // Same arbitration as every device; the host is the input source.
      const pid = c.kind === 'player' ? (c.profileId ?? null) : null;
      return handleBuzz(tx, { type: 'buzz', competitorId: c.id, profileId: pid, controllerId: `host:${c.id}`, sourceKind: 'host' });
    }
    case 'removeCompetitor': {
      const c = competitorOf(s, a.competitorId);
      if (s.phase !== 'lobby' && s.events.some((e) => e.competitorId === c.id && !e.voided && e.scoreDelta))
        fail('This player or team already has scores in this game');
      s.competitors = s.competitors.filter((x) => x.id !== c.id);
      if (c.kind === 'team') for (const pid of c.memberIds) s.unassigned.push({ profileId: pid, joinedAt: now, pending: false });
      s.bindings = s.bindings.filter((b) => !(b.target.kind === 'competitor' && b.target.competitorId === c.id));
      if (s.controlCompetitorId === c.id) s.controlCompetitorId = s.competitors[0]?.id ?? null;
      forgetCompetitor(s, c.id);
      return;
    }
    case 'updateCompetitor': {
      const c = competitorOf(s, a.competitorId);
      if (a.name !== undefined) c.name = a.name;
      if (a.color !== undefined) c.color = a.color;
      if (a.avatar !== undefined) c.avatar = a.avatar;
      if (a.buzzerMode !== undefined) {
        if (c.kind !== 'team') fail('Only teams have a buzzer mode');
        c.buzzerMode = a.buzzerMode;
      }
      if (a.botLevel !== undefined) {
        if (!c.bot) fail('Only computer opponents have a difficulty');
        c.bot = a.botLevel;
      }
      if (a.botAi !== undefined) {
        if (!c.bot) fail('Only computer opponents can use AI answers');
        c.botAi = a.botAi;
      }
      return;
    }
    case 'assignMember': {
      if (s.mode !== 'team') fail('Not a team game');
      const from = competitorForProfile(s, a.profileId);
      if (!from && !s.unassigned.some((u) => u.profileId === a.profileId)) fail('Player is not in this game');
      if (from) from.memberIds = from.memberIds.filter((p) => p !== a.profileId);
      s.unassigned = s.unassigned.filter((u) => u.profileId !== a.profileId);
      if (a.competitorId) {
        const to = competitorOf(s, a.competitorId);
        if (to.kind !== 'team') fail('Can only assign players to teams');
        // The host may over-fill a team (it is highlighted and blocks the start, R5-5.5).
        const at = a.index === undefined ? to.memberIds.length : Math.min(a.index, to.memberIds.length);
        to.memberIds.splice(at, 0, a.profileId);
      } else {
        s.unassigned.push({ profileId: a.profileId, joinedAt: now, pending: false });
      }
      return;
    }
    case 'joinTeam': {
      // R5-5.3: players choose their own team on their phones (lobby only, within the team size).
      if (s.phase !== 'lobby') fail('Teams can only be changed in the lobby');
      if (s.mode !== 'team') fail('Not a team game');
      const from = competitorForProfile(s, a.profileId);
      const u = s.unassigned.find((x) => x.profileId === a.profileId);
      if (!from && !u) fail('Join the game first');
      if (u?.pending) fail('Wait for the host to let you in');
      if ((from?.id ?? null) === a.competitorId) return { ignored: true };
      if (a.competitorId) {
        const to = competitorOf(s, a.competitorId);
        if (to.kind !== 'team') fail('That is not a team');
        if (s.rules.maxPerTeam > 0 && to.memberIds.length >= s.rules.maxPerTeam) fail(`${to.name} is full (${s.rules.maxPerTeam} players)`);
      }
      return reduce(tx, { type: 'assignMember', profileId: a.profileId, competitorId: a.competitorId });
    }
    case 'setTeamIdentity': {
      // R5-5.9: any member renames or recolours their team (lobby only; the server applies one
      // change at a time, so simultaneous edits never mix).
      if (s.phase !== 'lobby') fail('The team name and colour can only be changed in the lobby');
      const c = competitorOf(s, a.competitorId);
      if (c.kind !== 'team' || !c.memberIds.includes(a.profileId)) fail('You can only change your own team');
      if (a.name !== undefined) {
        const name = a.name.trim().replace(/\s+/g, ' ');
        if (!name || name.length > 30) fail('Team names are 1 to 30 characters');
        if (s.competitors.some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) fail('Another team already has that name');
        c.name = name;
      }
      if (a.color !== undefined) {
        const color = a.color.toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(color)) fail('Invalid colour');
        if (s.competitors.some((x) => x.id !== c.id && x.kind === 'team' && x.color.toLowerCase() === color)) fail('Another team already has that colour');
        c.color = color;
      }
      return;
    }
    case 'setTeamCount': {
      if (s.phase !== 'lobby') fail('Teams can only be changed before the game starts');
      if (s.mode !== 'team') fail('Switch to teams first');
      const teams = s.competitors.filter((c) => c.kind === 'team');
      for (let i = teams.length; i < a.count; i++) s.competitors.push(teamSlot(s, ctx));
      // Fewest players first, from the end: their players go back to Unassigned (never removed).
      while (s.competitors.filter((c) => c.kind === 'team').length > a.count) {
        const list = s.competitors.filter((c) => c.kind === 'team');
        const victim = [...list].reverse().sort((x, y) => x.memberIds.length - y.memberIds.length)[0];
        reduce(tx, { type: 'removeCompetitor', competitorId: victim.id });
      }
      return;
    }
    case 'updateGameInfo': {
      if (s.phase !== 'lobby') fail('This can only be changed before the game starts');
      if (a.title !== undefined) s.title = a.title;
      if (a.practice !== undefined) {
        if (a.practice && s.mode === 'team') fail('Practice games are played as individuals');
        s.practice = a.practice;
      }
      return;
    }
    case 'setNickname': {
      // R5-17: a nickname for this lobby only; the profile name is never changed.
      if (s.phase !== 'lobby' && s.phase !== 'ended') fail('Nicknames can be changed in the lobby');
      if (!humanParticipants(s).includes(a.profileId)) fail('That player is not in this game');
      const nick = a.nickname.trim().replace(/\s+/g, ' ');
      const taken = Object.entries(s.nicknames ?? {}).some(([p, n]) => p !== a.profileId && n.toLowerCase() === nick.toLowerCase());
      if (nick && taken) fail('Someone in this lobby already uses that nickname');
      const next = { ...(s.nicknames ?? {}) };
      if (nick) next[a.profileId] = nick;
      else delete next[a.profileId];
      s.nicknames = next;
      return;
    }
    case 'setPlayerColor': {
      // A player choosing their lobby colour (R4-13). Taken colours are refused, so two players
      // never end up with the same one (the server applies actions one at a time).
      if (!humanParticipants(s).includes(a.profileId)) fail('That player is not in this game');
      const color = a.color.toLowerCase();
      const others = takenColors(s, a.profileId);
      if (others.has(color)) fail('Someone else already has that colour — pick another one');
      s.playerColors = { ...(s.playerColors ?? {}), [a.profileId]: color };
      s.colorPrompts = (s.colorPrompts ?? []).filter((p) => p !== a.profileId);
      return;
    }
    case 'approvePlayer': {
      const u = s.unassigned.find((x) => x.profileId === a.profileId);
      if (!u) fail('No pending player');
      if (s.mode === 'solo') {
        s.unassigned = s.unassigned.filter((x) => x.profileId !== a.profileId);
        return reduce(tx, { type: 'addPlayer', profileId: a.profileId });
      }
      u!.pending = false;
      return;
    }
    case 'removeParticipant': {
      const c = competitorForProfile(s, a.profileId);
      s.unassigned = s.unassigned.filter((u) => u.profileId !== a.profileId);
      s.bindings = s.bindings.filter((b) => !(b.target.kind === 'profile' && b.target.profileId === a.profileId));
      if (!c) return;
      if (c.kind === 'player') return reduce(tx, { type: 'removeCompetitor', competitorId: c.id });
      c.memberIds = c.memberIds.filter((p) => p !== a.profileId);
      return;
    }
    case 'playerJoin': {
      if (competitorForProfile(s, a.profileId) || s.unassigned.some((u) => u.profileId === a.profileId))
        return { ignored: true, info: 'already-joined' };
      if (s.phase === 'ended') fail('This game has ended');
      checkRoom(s);
      if (s.rules.requireRoomCode && (a.code ?? '').trim().toUpperCase() !== s.roomCode) fail('That room code is not right — check the code on the TV');
      if (s.mode === 'solo' && s.rules.allowSelfJoin) return reduce(tx, { type: 'addPlayer', profileId: a.profileId });
      s.unassigned.push({ profileId: a.profileId, joinedAt: now, pending: !s.rules.allowSelfJoin });
      return;
    }
    case 'bindController': {
      if (a.target.kind === 'profile') {
        const pid = a.target.profileId;
        if (!isParticipant(s, pid)) fail('That player is not in this game');
      } else {
        const c = competitorOf(s, a.target.competitorId);
        if (c.kind !== 'team') fail('Assign solo players directly');
      }
      s.bindings = s.bindings.filter((b) => b.controllerId !== a.controllerId);
      s.bindings.push({ controllerId: a.controllerId, kind: a.kind, label: a.label, target: a.target });
      return;
    }
    case 'unbindController': {
      s.bindings = s.bindings.filter((b) => b.controllerId !== a.controllerId);
      return;
    }
    case 'updateRules': {
      // Takes effect from the next action/buzz; earlier events and penalties are never rewritten.
      s.rules = normalizeRules(a.rules as Partial<GameRules>);
      return;
    }
    case 'setRoomCode': {
      if (!ROOM_CODE_RE.test(a.code)) fail('Invalid room code');
      s.roomCode = a.code;
      return;
    }
    case 'newRoomCode':
      fail('A new room code is created by the game computer');
      return;
    case 'setBoard': {
      if (s.phase !== 'lobby') fail('The board can only be changed before the game starts');
      s.boardId = a.boardId;
      s.board = a.board;
      s.roundIndex = Math.max(0, a.board.rounds.findIndex((r) => r.kind === 'standard'));
      s.usedClueIds = [];
      if (a.title) s.title = a.title;
      return;
    }
    case 'setMode': {
      if (s.phase !== 'lobby') fail('The mode can only be changed before the game starts');
      if (s.mode === a.mode) return { ignored: true };
      if (a.mode === 'team' && s.practice) fail('Practice games are played as individuals');
      // Everyone stays in the game; only the grouping changes. Buzzers assigned to a player stay
      // with that player; buzzers assigned to a team (or a solo seat) are released.
      const people = [...new Set([...s.competitors.filter((c) => !c.bot).flatMap((c) => c.memberIds), ...s.unassigned.filter((u) => !u.pending).map((u) => u.profileId)])];
      const pending = s.unassigned.filter((u) => u.pending);
      if (s.mode === 'team') {
        // R5-5.8: keep the team setup (names, colours, members, shared buzzers) for switching back.
        s.teamDraft = structuredClone(s.competitors.filter((c) => c.kind === 'team'));
        s.teamDraftBindings = structuredClone(s.bindings.filter((b) => b.target.kind === 'competitor'));
      }
      s.bindings = s.bindings.filter((b) => b.target.kind === 'profile');
      s.competitors = [];
      s.controlCompetitorId = null;
      s.mode = a.mode;
      if (a.mode === 'team') {
        // R5-5.2: everyone waits in Unassigned (never put on an arbitrary team) next to empty team
        // slots, or the previous team setup comes back with its members who are still here.
        const here = new Set(people);
        const draft = (s.teamDraft ?? []).map((t) => ({ ...t, memberIds: t.memberIds.filter((m) => here.has(m)) }));
        const placed = new Set(draft.flatMap((t) => t.memberIds));
        s.competitors = draft;
        if (!draft.length) for (let i = 0, n = defaultTeamCount(people.length); i < n; i++) s.competitors.push(teamSlot(s, ctx));
        const ids = new Set(draft.map((t) => t.id));
        s.bindings.push(...(s.teamDraftBindings ?? []).filter((b) => b.target.kind === 'competitor' && ids.has(b.target.competitorId)));
        s.unassigned = [...people.filter((p) => !placed.has(p)).map((profileId) => ({ profileId, joinedAt: now, pending: false })), ...pending];
        s.teamDraft = null;
        s.teamDraftBindings = null;
      } else {
        s.unassigned = pending;
        for (const profileId of people)
          s.competitors.push({ id: ctx.newId(), kind: 'player', profileId, name: '', color: TEAM_COLORS[s.competitors.length % TEAM_COLORS.length], buzzerMode: 'individual', memberIds: [profileId] });
      }
      return;
    }
    case 'mediaPlay': {
      const clue = activeClue(s);
      if (a.clueId !== clue.clueId) return { ignored: true, info: 'stale' };
      if (a.side === 'answer' && !clue.answerRevealed) fail('Reveal the answer first');
      const found = findClue(s.board, clue.clueId);
      const list = (a.side === 'answer' ? found?.clue.answerMedia : found?.clue.media) ?? [];
      const item = list[a.index];
      if (!item || (item.kind !== 'audio' && item.kind !== 'video')) fail('Nothing to play');
      const same = s.media && s.media.clueId === clue.clueId && s.media.side === a.side && s.media.index === a.index;
      const prev = same ? s.media! : null;
      const resume = prev && (prev.status === 'paused' || prev.status === 'playing');
      s.media = {
        clueId: clue.clueId,
        side: a.side,
        index: a.index,
        status: 'playing',
        positionMs: resume ? mediaPosition(prev, now) : 0,
        startedAt: now,
        durationMs: a.durationMs ?? prev?.durationMs ?? null,
        muted: prev?.muted ?? false,
        started: true,
      };
      if (a.side === 'clue' && clue.unlockMode === 'mediaStart') maybeAutoOpen(s, clue, now);
      return;
    }
    case 'mediaPause': {
      if (s.media?.status !== 'playing') return { ignored: true };
      s.media = { ...s.media, status: 'paused', positionMs: mediaPosition(s.media, now), startedAt: null };
      return;
    }
    case 'mediaRestart': {
      if (!s.media) return { ignored: true };
      s.media = { ...s.media, status: 'playing', positionMs: 0, startedAt: now, started: true };
      return;
    }
    case 'mediaStop': {
      if (!s.media) return { ignored: true };
      s.media = { ...s.media, status: 'stopped', positionMs: 0, startedAt: null };
      return;
    }
    case 'mediaMute': {
      if (!s.media) return { ignored: true };
      s.media = { ...s.media, muted: a.muted };
      return;
    }
    case 'submitAnswer': {
      const clue = activeClue(s);
      if (clue.resolved || clue.stage !== 'question') fail('Not waiting for an answer');
      if (clue.submission) return { ignored: true, info: 'already-submitted' };
      const owner = clue.isDailyWager ? clue.wager?.competitorId : s.buzzer.status === 'buzzed' ? s.buzzer.winner?.competitorId : undefined;
      if (!owner || owner !== a.competitorId) return { ignored: true, info: 'not-answering' };
      const answer = a.answer.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!answer) fail('Empty answer');
      clue.submission = { competitorId: a.competitorId, answer, at: now, ...(a.via ? { via: a.via } : {}), ...(a.warning ? { warning: a.warning.slice(0, 200) } : {}) };
      // The answer is in: stop the answer timer so it can never run out while the host decides.
      if (s.timer && s.timer.kind === 'answer') s.timer = null;
      emit(tx, { type: 'submission', clueId: clue.clueId, roundIndex: clue.roundIndex, competitorId: a.competitorId, sourceKind: 'bot', note: answer });
      return;
    }
    case 'mediaEnded': {
      const m = s.media;
      if (!m || m.clueId !== a.clueId || m.status !== 'playing' || m.durationMs == null || mediaPosition(m, now) < m.durationMs - 50) return { ignored: true };
      s.media = { ...m, status: 'ended', positionMs: m.durationMs, startedAt: null };
      if (m.side === 'clue' && s.clue?.clueId === m.clueId && s.clue.unlockMode === 'mediaEnd') maybeAutoOpen(s, s.clue, now);
      return;
    }
    case 'showJoinQr': {
      s.showJoinQr = a.show;
      return;
    }

    // ----- game flow -----
    case 'startGame': {
      if (s.phase !== 'lobby') fail('Game already started');
      if (s.mode === 'team') {
        const max = s.rules.maxPerTeam;
        const over = max > 0 ? s.competitors.find((c) => c.kind === 'team' && c.memberIds.length > max) : undefined;
        if (over) fail(`${over.name} has ${over.memberIds.length} players but the limit is ${max}: move ${over.memberIds.length - max} first`);
        if (!s.competitors.some((c) => c.kind === 'team' && c.memberIds.length > 0)) fail('Put at least one player on a team first');
        // R5-5.6: empty team slots do not play (no scores, no buzzers); the lobby keeps them for
        // Return to Lobby. Players still in Unassigned stay in the lobby without playing (R5-5.7).
        s.lobbyTeams = structuredClone(s.competitors.filter((c) => c.kind === 'team'));
        const empty = new Set(s.competitors.filter((c) => c.kind === 'team' && c.memberIds.length === 0).map((c) => c.id));
        s.competitors = s.competitors.filter((c) => !empty.has(c.id));
        s.bindings = s.bindings.filter((b) => !(b.target.kind === 'competitor' && empty.has(b.target.competitorId)));
      }
      if (s.competitors.length === 0) fail('Add at least one player or team first');
      s.phase = 'board';
      s.startedAt = now;
      s.showJoinQr = false;
      s.roundIndex = Math.max(0, s.board.rounds.findIndex((r) => r.kind === 'standard'));
      s.controlCompetitorId = s.competitors[0].id;
      s.intro = s.rules.categoryIntro ? { roundIndex: s.roundIndex, step: -1, auto: false, at: now } : null;
      emit(tx, { type: 'game_start', roundIndex: s.roundIndex });
      return;
    }
    case 'pauseGame': {
      s.paused = true;
      if (s.media?.status === 'playing') s.media = { ...s.media, status: 'paused', positionMs: mediaPosition(s.media, now), startedAt: null };
      if (s.timer?.running) {
        s.timer.remainingMs = timerRemaining(s.timer, now);
        s.timer.startedAt = null;
        s.timer.running = false;
        s.timer.heldByPause = true;
      }
      return;
    }
    case 'resumeGame': {
      s.paused = false;
      if (s.timer?.heldByPause) {
        s.timer.startedAt = now;
        s.timer.running = true;
        s.timer.heldByPause = false;
      }
      return;
    }
    case 'setRound': {
      if (s.phase !== 'board' && s.phase !== 'clue') fail('Rounds can be changed from the board');
      const r = s.board.rounds[a.roundIndex];
      if (!r || r.kind !== 'standard') fail('No such round');
      closeActiveClue(tx, 'skipped');
      s.roundIndex = a.roundIndex;
      s.phase = 'board';
      // Lowest score picks first in a new round (traditional rule); host can override.
      const scores = scoresOf(s.events);
      const sorted = [...s.competitors].sort((x, y) => (scores[x.id] ?? 0) - (scores[y.id] ?? 0));
      s.controlCompetitorId = sorted[0]?.id ?? s.controlCompetitorId;
      s.intro = s.rules.categoryIntro ? { roundIndex: a.roundIndex, step: -1, auto: false, at: now } : null;
      emit(tx, { type: 'round_change', roundIndex: a.roundIndex });
      return;
    }
    case 'startIntro': {
      if (s.phase !== 'board') fail('Return to the board first');
      const round = s.board.rounds[s.roundIndex];
      if (!round || round.kind !== 'standard') fail('No round to introduce');
      // "Auto" while an introduction is running continues from the current category.
      if (s.intro && s.intro.roundIndex === s.roundIndex && a.auto) {
        s.intro.auto = true;
        return;
      }
      s.intro = { roundIndex: s.roundIndex, step: -1, auto: !!a.auto, at: now };
      return;
    }
    case 'introNext': {
      if (!s.intro) return { ignored: true };
      const count = s.board.rounds[s.intro.roundIndex]?.categories.length ?? 0;
      s.intro.step++;
      s.intro.at = now;
      if (s.intro.step >= count) s.intro = null;
      return;
    }
    case 'introSkip': {
      if (!s.intro) return { ignored: true };
      s.intro = null;
      return;
    }
    case 'introPrev':
    case 'introGoto': {
      // R5-12: the host jumps back one step or straight to a category. A manual jump takes the
      // introduction over from auto mode, so no scheduled advance follows it.
      if (!s.intro) return { ignored: true };
      const count = s.board.rounds[s.intro.roundIndex]?.categories.length ?? 0;
      const step = a.type === 'introPrev' ? s.intro.step - 1 : a.step;
      if (step < -1 || step >= count) {
        if (a.type === 'introPrev') return { ignored: true };
        fail('There is no such category in this round');
      }
      s.intro.auto = false;
      if (step === s.intro.step) return;
      s.intro.step = step;
      s.intro.at = now;
      return;
    }
    case 'introStopAuto': {
      if (!s.intro) return { ignored: true };
      s.intro.auto = false;
      return;
    }
    case 'setControl': {
      s.controlCompetitorId = competitorOf(s, a.competitorId).id;
      return;
    }
    case 'selectClue': {
      if (s.phase !== 'board') fail('Return to the board first');
      // Categories are presented (or explicitly skipped) before any clue can be opened (R4-16).
      if (s.intro) fail('Introduce the categories first (or skip the introduction)');
      const found = findClue(s.board, a.clueId);
      if (!found || found.r !== s.roundIndex || found.round.kind !== 'standard') fail('That clue is not on the current board');
      if (s.usedClueIds.includes(a.clueId)) fail('That clue has already been played');
      const f = found!;
      s.usedClueIds.push(a.clueId);
      const dw = !!f.clue.dailyWager;
      s.clue = {
        clueId: a.clueId,
        roundIndex: f.r,
        categoryIndex: f.c,
        clueIndex: f.q,
        value: f.clue.value,
        isDailyWager: dw,
        stage: dw ? 'wager' : 'question',
        wager: null,
        wagerBy: dw ? s.controlCompetitorId : null,
        pendingWager: null,
        answerRevealed: false,
        resolved: false,
        answeringEnded: false,
        // Decided once, when the clue opens: later rule changes apply to the next clue.
        unlockMode: dw ? 'host' : unlockModeFor(s.rules.autoUnlock, f.clue),
      };
      s.buzzer = emptyBuzzer();
      s.phase = 'clue';
      s.timer = null;
      s.media = null;
      if (dw) maybeAutoTimer(s, 'wager', now);
      else if (s.clue.unlockMode === 'immediate') openBuzzers(s, now);
      emit(tx, { type: 'clue_open', clueId: a.clueId, roundIndex: f.r, result: dw ? 'daily_wager' : 'standard' });
      return;
    }
    case 'setDailyWager': {
      const clue = activeClue(s);
      if (!clue.isDailyWager) fail('This is not a Daily Double!');
      if (clue.stage !== 'wager') fail('The wager is already locked');
      const c = competitorOf(s, a.competitorId);
      const score = scoresOf(s.events)[c.id] ?? 0;
      const max = Math.max(score, roundMaxValue(s));
      if (a.amount < s.rules.dailyWagerMin || a.amount > max)
        fail(`Wager must be between ${s.rules.dailyWagerMin} and ${max}`);
      const pid = attribution(c, a.profileId, null);
      clue.wager = { competitorId: c.id, amount: a.amount, profileId: pid };
      clue.pendingWager = null;
      clue.stage = 'question';
      maybeAutoTimer(s, 'answer', now);
      emit(tx, {
        type: 'wager',
        result: 'daily',
        clueId: clue.clueId,
        roundIndex: clue.roundIndex,
        competitorId: c.id,
        profileId: pid,
        wager: a.amount,
      });
      return;
    }
    case 'submitDailyWager': {
      // R5-20: the wagering player (or a member of the wagering team) sends the wager from their
      // phone; the host sees it and locks it, which shows the clue.
      const clue = activeClue(s);
      if (!clue.isDailyWager || clue.stage !== 'wager') fail('Wagering is not open');
      const owner = clue.wagerBy ?? null;
      if (!owner || owner !== a.competitorId) fail('It is not your Daily Double!');
      const c = competitorOf(s, a.competitorId);
      const prev = clue.pendingWager;
      if (prev && c.kind === 'team' && prev.profileId && a.profileId && prev.profileId !== a.profileId) fail('A teammate already entered your team’s wager');
      const score = scoresOf(s.events)[c.id] ?? 0;
      const max = Math.max(score, roundMaxValue(s));
      if (!Number.isInteger(a.amount) || a.amount < s.rules.dailyWagerMin || a.amount > max) fail(`Wager must be between ${s.rules.dailyWagerMin} and ${max}`);
      clue.pendingWager = { competitorId: c.id, amount: a.amount, profileId: attribution(c, a.profileId, null), at: now };
      return;
    }
    case 'revealAnswer': {
      if (a.clueId && s.clue?.clueId !== a.clueId) return { ignored: true, info: 'stale' };
      const clue = activeClue(s);
      clue.answerRevealed = true;
      // Once the answer is public nobody may still buzz in.
      finishAnswering(s, clue);
      if (s.media?.side === 'clue') s.media = { ...s.media, status: 'stopped', positionMs: 0, startedAt: null };
      return;
    }
    case 'endAnswering': {
      if (a.clueId && s.clue?.clueId !== a.clueId) return { ignored: true, info: 'stale' };
      const clue = activeClue(s);
      if (clue.isDailyWager && !clue.resolved) fail('Judge the Daily Double! first');
      if (s.buzzer.winner) fail('Judge the buzzed-in answer first');
      finishAnswering(s, clue);
      return;
    }
    case 'hideAnswer': {
      activeClue(s).answerRevealed = false;
      return;
    }
    case 'unlockBuzzers': {
      const clue = activeClue(s);
      if (clue.isDailyWager) fail('Daily Doubles do not use buzzers');
      if (clue.resolved) fail('This clue is already answered');
      if (clue.stage !== 'question') fail('The clue is not showing yet');
      if (clue.answerRevealed) fail('The answer is already showing');
      clue.answeringEnded = false; // the host may re-open after time ran out
      openBuzzers(s, now);
      return;
    }
    case 'lockBuzzers': {
      if (s.buzzer.status === 'open') {
        s.buzzer.status = 'locked';
        if (s.timer?.kind === 'buzz') s.timer = null;
      }
      return;
    }
    case 'resetBuzzers': {
      // Full reset of this clue's buzzing: attempts, queue and early-buzz lockouts are cleared.
      s.buzzer = emptyBuzzer();
      if (s.clue && !s.clue.resolved && !s.clue.answerRevealed) s.clue.answeringEnded = false;
      if (s.timer && (s.timer.kind === 'buzz' || s.timer.kind === 'answer')) s.timer = null;
      return;
    }
    case 'buzz':
      return handleBuzz(tx, a);
    case 'judge': {
      const clue = activeClue(s);
      if (clue.resolved) fail('This clue is already resolved');
      let competitorId = a.competitorId;
      let fallbackProfile: Id | null = null;
      let amount = clue.value;
      if (clue.isDailyWager) {
        if (!clue.wager) fail('Set the wager first');
        competitorId = clue.wager!.competitorId;
        fallbackProfile = clue.wager!.profileId;
        amount = clue.wager!.amount;
      } else if (!competitorId) {
        if (!s.buzzer.winner) fail('Nobody has buzzed in');
        competitorId = s.buzzer.winner!.competitorId;
        fallbackProfile = s.buzzer.winner!.profileId;
      } else if (s.buzzer.winner?.competitorId === competitorId) {
        fallbackProfile = s.buzzer.winner.profileId;
      }
      const c = competitorOf(s, competitorId);
      const pid = attribution(c, a.profileId, fallbackProfile);
      const correct = a.result === 'correct';
      const delta = correct ? amount : clue.isDailyWager || s.rules.incorrectDeducts ? -amount : 0;
      const winner = s.buzzer.winner;
      clue.submission = null;
      emit(tx, {
        type: 'answer',
        result: a.result,
        clueId: clue.clueId,
        roundIndex: clue.roundIndex,
        competitorId: c.id,
        profileId: pid,
        controllerId: winner?.competitorId === c.id ? winner.controllerId : undefined,
        sourceKind: winner?.competitorId === c.id ? winner.sourceKind : 'host',
        scoreDelta: delta,
        contributionDelta: pid ? delta : 0,
        wager: clue.isDailyWager ? amount : undefined,
      });
      if (correct) {
        clue.resolved = true;
        clue.answerRevealed = true;
        clue.answeringEnded = true;
        s.buzzer.status = 'locked';
        s.buzzer.winner = null;
        s.controlCompetitorId = c.id;
        s.timer = null;
      } else {
        if (!s.buzzer.attemptedCompetitors.includes(c.id)) s.buzzer.attemptedCompetitors.push(c.id);
        if (pid && !s.buzzer.attemptedProfiles.includes(pid)) s.buzzer.attemptedProfiles.push(pid);
        s.buzzer.winner = null;
        s.buzzer.queue = [];
        s.timer = null;
        if (clue.isDailyWager) {
          clue.resolved = true;
          clue.answeringEnded = true;
        } else {
          const someoneLeft = s.competitors.some((x) => buzzBlockReasonIgnoringStatus(s, x) === null);
          if (s.rules.autoReopenAfterIncorrect && someoneLeft) {
            s.buzzer.status = 'open';
            s.buzzer.openedAt = now;
            maybeAutoTimer(s, 'buzz', now);
          } else {
            s.buzzer.status = 'locked';
            // Nobody left to try → the host is guided to reveal the answer.
            if (!someoneLeft) clue.answeringEnded = true;
          }
        }
      }
      return;
    }
    case 'closeClue': {
      // A repeated tap (or a tap meant for a clue that is already closed) must not close the next clue.
      if (a.clueId && s.clue?.clueId !== a.clueId) return { ignored: true, info: 'stale' };
      if (s.phase !== 'clue' || !s.clue) fail('No clue is open');
      const c = s.clue!;
      const answered = s.events.some((e) => !e.voided && e.type === 'answer' && e.clueId === c.clueId && e.result === 'correct');
      closeActiveClue(tx, answered ? 'answered' : c.answerRevealed || c.answeringEnded || c.resolved ? 'unanswered' : 'skipped');
      s.phase = 'board';
      return;
    }
    case 'refundPenalty': {
      const orig = s.events.find((e) => e.id === a.eventId);
      if (!orig || orig.voided || orig.type !== 'buzz' || orig.result !== 'early' || !orig.scoreDelta) fail('That early-buzz penalty cannot be refunded');
      const o = orig!;
      // Audited correction: void the penalty and record an unpenalised early buzz in its place,
      // so statistics still count the early press but the score is restored.
      const corr = emit(tx, { type: 'score_adjust', competitorId: o.competitorId, profileId: o.profileId, clueId: o.clueId, roundIndex: o.roundIndex, note: 'early-buzz penalty refunded', correctsEventId: o.id });
      voidEvent(tx, o, corr.id);
      emit(tx, { type: 'buzz', result: 'early', clueId: o.clueId, roundIndex: o.roundIndex, competitorId: o.competitorId, profileId: o.profileId, controllerId: o.controllerId, sourceKind: o.sourceKind, correctsEventId: o.id, note: 'refunded' });
      return;
    }
    case 'restoreClue': {
      if (s.phase !== 'board') fail('Return to the board first');
      if (!s.usedClueIds.includes(a.clueId)) fail('That clue has not been played');
      s.usedClueIds = s.usedClueIds.filter((x) => x !== a.clueId);
      return;
    }
    case 'adjustScore': {
      const c = competitorOf(s, a.competitorId);
      if (a.delta === 0) fail('Enter a non-zero amount');
      const pid = a.profileId ? attribution(c, a.profileId, null) : c.kind === 'player' ? (c.profileId ?? null) : null;
      emit(tx, {
        type: 'score_adjust',
        competitorId: c.id,
        profileId: pid,
        scoreDelta: a.delta,
        contributionDelta: 0,
        note: a.note,
        clueId: s.clue?.clueId,
        roundIndex: s.roundIndex,
      });
      return;
    }
    case 'correctAttribution': {
      const orig = s.events.find((e) => e.id === a.eventId);
      if (!orig || orig.voided) fail('Event not found');
      const o = orig!;
      if (o.type !== 'answer' && o.type !== 'wager') fail('Only answers and wagers can be re-attributed');
      const c = competitorOf(s, o.competitorId);
      if (c.kind !== 'team') fail('Solo answers are always attributed to the player');
      const pid = attribution(c, a.profileId, null);
      const corr = emit(tx, {
        type: 'attribution_correction',
        correctsEventId: o.id,
        competitorId: c.id,
        profileId: pid,
        clueId: o.clueId,
        note: `${o.profileId ?? 'team'} -> ${pid ?? 'team'}`,
      });
      voidEvent(tx, o, corr.id);
      emit(tx, {
        type: o.type,
        result: o.result,
        clueId: o.clueId,
        roundIndex: o.roundIndex,
        competitorId: o.competitorId,
        profileId: pid,
        controllerId: o.controllerId,
        sourceKind: o.sourceKind,
        scoreDelta: o.scoreDelta,
        contributionDelta: pid ? o.scoreDelta : 0,
        wager: o.wager,
        correctsEventId: o.id,
      });
      return;
    }

    // ----- timers -----
    case 'timerStart': {
      s.timer = makeTimer(a.kind, a.seconds, now);
      return;
    }
    case 'timerPause': {
      if (!s.timer?.running) return { ignored: true };
      s.timer.remainingMs = timerRemaining(s.timer, now);
      s.timer.startedAt = null;
      s.timer.running = false;
      return;
    }
    case 'timerResume': {
      if (!s.timer || s.timer.running || s.timer.remainingMs <= 0) return { ignored: true };
      s.timer.startedAt = now;
      s.timer.running = true;
      s.timer.heldByPause = false;
      return;
    }
    case 'timerReset': {
      if (!s.timer) return { ignored: true };
      s.timer = { ...s.timer, remainingMs: s.timer.durationMs, startedAt: null, running: false, expired: false };
      return;
    }
    case 'timerStop': {
      s.timer = null;
      return;
    }
    case 'timerExpire': {
      const t = s.timer;
      if (!t || !t.running || timerRemaining(t, now) > 25) return { ignored: true };
      // Answers closing is a step the host can undo (back to writing, with fresh think time).
      if (t.kind === 'final' && s.phase === 'final' && s.final?.stage === 'clue') snapshot(s, 'Final answers closed');
      t.remainingMs = 0;
      t.startedAt = null;
      t.running = false;
      t.expired = true;
      // Final: answers close when the think time ends; the reveal starts (R4-2).
      if (t.kind === 'final' && s.phase === 'final' && s.final?.stage === 'clue') startFinalReveal(tx);
      if (t.kind === 'buzz' && s.buzzer.status === 'open') {
        s.buzzer.status = 'locked';
        // Time ran out with nobody buzzing: the answering period is over.
        if (s.clue && !s.buzzer.winner) s.clue.answeringEnded = true;
      }
      return;
    }

    // ----- final -----
    case 'startFinal': {
      if (s.phase !== 'board' && s.phase !== 'clue') fail('Start the Final from the board');
      const idx = s.board.rounds.findIndex((r) => r.kind === 'final');
      if (idx < 0) fail('This board has no Final round');
      const round = s.board.rounds[idx];
      if (!round.categories[0]?.clues[0]) fail('The Final round has no clue');
      closeActiveClue(tx, 'skipped');
      s.intro = null;
      const scores = scoresOf(s.events);
      const lives = livesOf(s);
      const eligible = s.competitors.filter((c) => (!lives || lives[c.id] > 0) && (s.rules.finalAllowNonPositive || (scores[c.id] ?? 0) > 0));
      s.phase = 'final';
      s.roundIndex = idx;
      const preScores = Object.fromEntries(s.competitors.map((c) => [c.id, scores[c.id] ?? 0]));
      s.final = {
        stage: 'category',
        roundIndex: idx,
        entries: eligible.map((c) => ({ competitorId: c.id, wager: null, answer: null, submitted: false, draft: null, judged: false, correct: null, profileId: null })),
        order: finalRevealOrder(eligible.map((c) => c.id), preScores, s.competitors.map((c) => c.id)),
        preScores,
        cursor: 0,
        step: 'contestant',
      };
      s.timer = null;
      emit(tx, { type: 'round_change', roundIndex: idx, result: 'final' });
      return;
    }
    case 'finalNext': {
      const f = finalState(s);
      if (f.stage === 'category') {
        f.stage = 'wagers';
        maybeAutoTimer(s, 'wager', now);
      } else if (f.stage === 'wagers') {
        const clue = s.board.rounds[f.roundIndex].categories[0].clues[0];
        for (const e of f.entries) {
          if (e.wager == null) e.wager = 0;
          emit(tx, { type: 'wager', result: 'final', clueId: clue.id, roundIndex: f.roundIndex, competitorId: e.competitorId, profileId: e.profileId, wager: e.wager });
        }
        f.stage = 'clue';
        maybeAutoTimer(s, 'final', now);
      } else if (f.stage === 'clue') {
        startFinalReveal(tx);
      } else if (f.stage === 'reveal') {
        if (f.entries.some((e) => !e.judged)) fail('Judge every Final Jeopardy! answer first');
        f.stage = 'done';
      } else fail('The Final is complete — end the game');
      return;
    }
    case 'finalReveal': {
      const f = finalState(s);
      if (f.stage !== 'reveal') fail('Close the answers first');
      const cur = f.order[f.cursor];
      const e = cur ? f.entries.find((x) => x.competitorId === cur) : undefined;
      if (!e) {
        f.stage = 'done';
        return;
      }
      if (f.step === 'contestant') f.step = 'wager';
      else if (f.step === 'wager') f.step = 'answer';
      else {
        if (!e.judged) fail('Judge this answer first');
        if (f.cursor + 1 < f.order.length) {
          f.cursor++;
          f.step = 'contestant';
        } else f.stage = 'done';
      }
      return;
    }
    case 'setFinalWager': {
      const f = finalState(s);
      // Wagers are accepted only after the host opens wagering (R5-18) and until they close.
      if (f.stage === 'category') fail('Wagering has not opened yet');
      if (f.stage !== 'wagers') fail('Wagers are locked');
      const e = f.entries.find((x) => x.competitorId === a.competitorId);
      if (!e) fail('Not playing in the Final');
      const score = scoresOf(s.events)[a.competitorId] ?? 0;
      const max = Math.max(score, 0);
      if (a.amount < 0 || a.amount > max) fail(`Wager must be between 0 and ${max}`);
      e!.wager = a.amount;
      return;
    }
    case 'setFinalAnswer': {
      const f = finalState(s);
      if (f.stage !== 'clue') fail('Answers are not open');
      const e = f.entries.find((x) => x.competitorId === a.competitorId);
      if (!e) fail('Not playing in the Final');
      const text = a.answer.trim();
      if (a.submit === false) {
        // Typing / "Change answer": the last submitted answer stays until a new one is submitted.
        e!.draft = text || null;
        e!.submitted = false;
      } else {
        if (!text) fail('Write an answer first');
        e!.answer = text;
        e!.submitted = true;
        e!.draft = null;
      }
      return;
    }
    case 'judgeFinal': {
      const f = finalState(s);
      if (f.stage !== 'reveal') fail('Reveal the Final Jeopardy! answers first');
      const e = f.entries.find((x) => x.competitorId === a.competitorId);
      if (!e) fail('Not playing in the Final');
      if (e!.judged) fail('Already judged — use Undo to change it');
      if (f.order[f.cursor] !== a.competitorId || f.step !== 'answer') fail('Reveal this answer first');
      const c = competitorOf(s, a.competitorId);
      const pid = attribution(c, a.profileId, e!.profileId);
      const w = e!.wager ?? 0;
      const delta = a.correct ? w : -w;
      const clue = s.board.rounds[f.roundIndex].categories[0].clues[0];
      e!.judged = true;
      e!.correct = a.correct;
      e!.profileId = pid;
      emit(tx, {
        type: 'answer',
        result: a.correct ? 'correct' : 'incorrect',
        clueId: clue.id,
        roundIndex: f.roundIndex,
        competitorId: c.id,
        profileId: pid,
        sourceKind: 'host',
        scoreDelta: delta,
        contributionDelta: pid ? delta : 0,
        wager: w,
        note: 'final',
      });
      return;
    }
    case 'endGame': {
      if (s.phase === 'ended') fail('Game already ended');
      if (s.phase === 'lobby') fail('The game has not started');
      closeActiveClue(tx, 'skipped');
      s.phase = 'ended';
      s.timer = null;
      s.intro = null;
      s.buzzer = emptyBuzzer();
      s.endedAt = now;
      s.results = computeResults(s);
      emit(tx, { type: 'game_end', note: JSON.stringify(s.results) });
      return;
    }
    case 'undo': {
      const snap = s.undoStack.pop();
      if (!snap) fail('Nothing to undo');
      const u = emit(tx, { type: 'undo', note: snap!.label });
      for (const e of s.events) if (e.seq > snap!.seq && e.id !== u.id && !e.voided) voidEvent(tx, e, u.id);
      const data = JSON.parse(snap!.data);
      for (const k of RESTORABLE) (s as unknown as Record<string, unknown>)[k] = data[k];
      // Timers are not resurrected by undo; the host restarts them if needed. Exception (R5-15):
      // back in Final Jeopardy! wagering or answering, that stage's timer starts again from its
      // full duration, so nobody is left without time (answers and wagers given so far are kept).
      const finalTimer = s.phase === 'final' && s.timer && ((s.final?.stage === 'clue' && s.timer.kind === 'final') || (s.final?.stage === 'wagers' && s.timer.kind === 'wager'));
      if (finalTimer) s.timer = makeTimer(s.timer!.kind, s.timer!.durationMs / 1000, now);
      else if (s.timer) s.timer = { ...s.timer, running: false, startedAt: null };
      normalizeState(s); // snapshots taken by older versions may lack newer fields
      if (s.intro) s.intro.auto = false;
      // Removing a player is not undoable: a restored snapshot must not bring their turn back.
      const gone = new Set([s.buzzer.winner?.competitorId, s.clue?.wager?.competitorId, ...(s.final?.entries.map((e) => e.competitorId) ?? [])].filter((id): id is string => !!id && !s.competitors.some((c) => c.id === id)));
      for (const id of gone) forgetCompetitor(s, id);
      if (s.controlCompetitorId && !s.competitors.some((c) => c.id === s.controlCompetitorId)) s.controlCompetitorId = s.competitors[0]?.id ?? null;
      return { info: `Undid ${snap!.label}` };
    }
    default: {
      const never: never = a;
      fail(`Unknown action ${(never as { type: string }).type}`);
    }
  }
}

/** Number of people in the game (computer opponents do not count). */
export function humanCount(s: GameState) {
  return new Set([...s.competitors.flatMap((c) => c.memberIds), ...s.unassigned.map((u) => u.profileId)]).size;
}

function checkRoom(s: GameState) {
  // Team games are limited per team (R5-4.2); joining is never blocked there: extra players wait in Unassigned.
  if (s.mode === 'solo' && s.rules.maxPlayers > 0 && humanCount(s) >= s.rules.maxPlayers) fail('This game is full (' + s.rules.maxPlayers + ' players)');
}

/** A new, empty team slot with the first free default name and colour (R5-5.1). */
function teamSlot(s: GameState, ctx: EngineCtx): Competitor {
  const names = new Set(s.competitors.map((c) => c.name.toLowerCase()));
  const colors = new Set(s.competitors.filter((c) => c.kind === 'team').map((c) => c.color.toLowerCase()));
  let i = TEAM_SLOT_NAMES.findIndex((n, k) => !names.has(n.toLowerCase()) && !colors.has(TEAM_COLORS[k]));
  if (i < 0) i = TEAM_SLOT_NAMES.findIndex((n) => !names.has(n.toLowerCase()));
  let name = i >= 0 ? TEAM_SLOT_NAMES[i] : '';
  for (let n = s.competitors.length + 1; !name; n++) if (!names.has(`team ${n}`)) name = `Team ${n}`;
  const color = i >= 0 && !colors.has(TEAM_COLORS[i]) ? TEAM_COLORS[i] : (TEAM_COLORS.find((c) => !colors.has(c)) ?? TEAM_COLORS[s.competitors.length % TEAM_COLORS.length]);
  return { id: ctx.newId(), kind: 'team', name, color, avatar: 'shield', buzzerMode: 'individual', memberIds: [] };
}

function buzzBlockReasonIgnoringStatus(s: GameState, c: Competitor): string | null {
  if (isEliminated(s, c.id)) return 'eliminated';
  if (!s.buzzer.attemptedCompetitors.includes(c.id)) return null;
  if (s.rules.teamRetry === 'otherMembers' && c.kind === 'team' && c.buzzerMode === 'individual') {
    return c.memberIds.some((m) => !s.buzzer.attemptedProfiles.includes(m)) ? null : 'all-tried';
  }
  return 'tried';
}

function activeClue(s: GameState): ActiveClue {
  if (s.phase !== 'clue' || !s.clue) fail('No clue is open');
  return s.clue!;
}

/** Answers close: each written answer is recorded for the game history (kept private until its
 *  reveal step by the projection), then the reveal starts with the lowest score. */
function startFinalReveal(tx: Tx) {
  const s = tx.s;
  const f = s.final!;
  const clue = s.board.rounds[f.roundIndex]?.categories[0]?.clues[0];
  for (const e of f.entries) {
    // Nothing submitted: whatever was typed counts (the last submitted answer otherwise, R5-19).
    if (!e.answer && e.draft) e.answer = e.draft;
    e.draft = null;
    e.submitted = !!e.answer;
    if (!e.answer) continue;
    const c = s.competitors.find((x) => x.id === e.competitorId);
    emit(tx, { type: 'submission', result: 'final', clueId: clue?.id, roundIndex: f.roundIndex, competitorId: e.competitorId, sourceKind: c?.bot ? 'bot' : 'phone', note: e.answer });
  }
  f.stage = 'reveal';
  f.cursor = 0;
  f.step = 'contestant';
  s.timer = null;
}

/** A competitor left mid-game: nothing may still wait on them (buzz, Daily Double!, Final reveal),
 *  otherwise the host could not continue. */
function forgetCompetitor(s: GameState, id: Id) {
  const b = s.buzzer;
  if (b.winner?.competitorId === id) {
    b.winner = null;
    b.status = 'locked';
    if (s.timer?.kind === 'answer') s.timer = null;
  }
  b.queue = b.queue.filter((q) => q.competitorId !== id);
  b.attemptedCompetitors = b.attemptedCompetitors.filter((x) => x !== id);
  if (s.clue?.submission?.competitorId === id) s.clue.submission = null;
  if (s.clue?.isDailyWager && s.clue.wager?.competitorId === id && !s.clue.resolved) {
    s.clue.wager = null;
    s.clue.stage = 'wager';
  }
  const f = s.final;
  if (f) {
    const at = f.order.indexOf(id);
    f.entries = f.entries.filter((e) => e.competitorId !== id);
    f.order = f.order.filter((x) => x !== id);
    if (at >= 0 && at < f.cursor) f.cursor--;
    else if (at === f.cursor) f.step = 'contestant';
    if (f.stage === 'reveal' && f.cursor >= f.order.length) {
      f.cursor = Math.max(0, f.order.length - 1);
      // Everyone left has been judged: the reveal is over.
      if (f.entries.every((e) => e.judged)) f.stage = 'done';
    }
  }
}

/** Every human in the game (solo players, team members, players waiting for a team), in join order. */
export function humanParticipants(s: GameState): Id[] {
  const ids: Id[] = [];
  for (const c of s.competitors) if (!c.bot) ids.push(...c.memberIds);
  for (const u of s.unassigned) ids.push(u.profileId);
  return [...new Set(ids)];
}

/** Colours in use (lower case): lobby colours of other players and computer opponents' colours. */
function takenColors(s: GameState, except?: Id): Set<string> {
  const out = new Set<string>();
  for (const [pid, c] of Object.entries(s.playerColors ?? {})) if (pid !== except) out.add(c.toLowerCase());
  for (const c of s.competitors) if (c.bot) out.add(c.color.toLowerCase());
  return out;
}

/**
 * R4-13: each human player gets a distinct lobby colour — their preferred colour when it is free,
 * otherwise the first free one plus a prompt on their phone to choose. Players who left free theirs.
 */
function syncPlayerColors(s: GameState, ctx: EngineCtx) {
  const humans = humanParticipants(s);
  const present = new Set(humans);
  const colors = { ...(s.playerColors ?? {}) };
  for (const pid of Object.keys(colors)) if (!present.has(pid)) delete colors[pid];
  let prompts = (s.colorPrompts ?? []).filter((p) => present.has(p));
  for (const pid of humans) {
    if (colors[pid]) continue;
    const taken = takenColors({ ...s, playerColors: colors });
    const pref = ctx.colorOf?.(pid)?.toLowerCase() ?? null;
    if (pref && !taken.has(pref)) colors[pid] = pref;
    else {
      colors[pid] = firstFreeColor(taken).toLowerCase();
      if (pref) prompts = [...prompts, pid];
    }
  }
  s.playerColors = colors;
  s.colorPrompts = prompts;
  for (const c of s.competitors) if (c.kind === 'player' && !c.bot && c.profileId && colors[c.profileId]) c.color = colors[c.profileId];
}

function finalState(s: GameState) {
  if (s.phase !== 'final' || !s.final) fail('The Final round is not active');
  return s.final!;
}

function closeActiveClue(tx: Tx, result: 'answered' | 'unanswered' | 'skipped') {
  const s = tx.s;
  if (!s.clue) return;
  emit(tx, { type: 'clue_close', clueId: s.clue.clueId, roundIndex: s.clue.roundIndex, result });
  s.clue = null;
  s.media = null;
  s.buzzer = emptyBuzzer();
  s.timer = null;
}

/** Open the buzzers for a new answering opportunity (host unlock or an automatic unlock). */
function openBuzzers(s: GameState, now: number) {
  s.buzzer.status = 'open';
  s.buzzer.openedAt = now;
  s.buzzer.winner = null;
  s.buzzer.queue = [];
  maybeAutoTimer(s, 'buzz', now);
}

/** Automatic unlock tied to media: only the first time, and never after answering ended. */
function maybeAutoOpen(s: GameState, clue: ActiveClue, now: number) {
  if (s.paused || clue.resolved || clue.answeringEnded || clue.answerRevealed || clue.stage !== 'question') return;
  if (s.buzzer.openedAt != null || s.buzzer.status !== 'locked') return;
  openBuzzers(s, now);
}

/** Close the answering opportunity: no more buzzing for this clue unless the host re-opens. */
function finishAnswering(s: GameState, clue: ActiveClue) {
  clue.answeringEnded = true;
  if (s.buzzer.status === 'open') s.buzzer.status = 'locked';
  if (s.timer && (s.timer.kind === 'buzz' || (s.timer.kind === 'answer' && !s.buzzer.winner))) s.timer = null;
}

/** Applies the current early-buzz rule. Detection is purely server-side: a buzz that arrives while
 *  the question is showing but buzzers are not open for this answering opportunity. */
function handleEarlyBuzz(tx: Tx, c: Competitor, a: Extract<EngineAction, { type: 'buzz' }>, clue: ActiveClue): ReduceExtra {
  const { s, ctx } = tx;
  const now = ctx.now;
  const r = s.rules;
  const key = lockoutKey(c.id, a.profileId);
  let until: number | null = null;
  let points = 0;
  if (r.earlyBuzzPenalty === 'lockout') until = now + r.earlyBuzzLockoutMs;
  else if (r.earlyBuzzPenalty === 'clue') until = CLUE_LOCKOUT;
  else if (r.earlyBuzzPenalty === 'points') {
    until = now + r.earlyBuzzLockoutMs; // stops button mashing
    const already = s.buzzer.early.some((e) => e.points > 0 && lockoutKey(e.competitorId, e.profileId) === key);
    if (!already) points = Math.max(0, r.earlyBuzzPoints);
  }
  if (until != null) s.buzzer.lockouts[key] = Math.max(s.buzzer.lockouts[key] ?? 0, until);
  s.buzzer.early.push({ competitorId: c.id, profileId: a.profileId, at: now, penalty: r.earlyBuzzPenalty, until, points });
  if (s.buzzer.early.length > 30) s.buzzer.early.splice(0, s.buzzer.early.length - 30);
  emit(tx, {
    type: 'buzz',
    result: 'early',
    clueId: clue.clueId,
    roundIndex: clue.roundIndex,
    competitorId: c.id,
    profileId: a.profileId,
    controllerId: a.controllerId,
    sourceKind: a.sourceKind,
    // Points belong to the competitor (team); the person's contribution is only charged when known.
    scoreDelta: points ? -points : 0,
    contributionDelta: points && a.profileId ? -points : 0,
    note: r.earlyBuzzPenalty,
  });
  return { ignored: true, info: 'early' };
}

function handleBuzz(tx: Tx, a: Extract<EngineAction, { type: 'buzz' }>): ReduceExtra {
  const { s, ctx } = tx;
  const now = ctx.now;
  const c = s.competitors.find((x) => x.id === a.competitorId);
  if (!c) return { ignored: true, info: 'not-playing' };
  const reason = buzzBlockReason(s, c.id, a.profileId, now);
  const clue = s.clue;
  if (reason === 'locked' && clue) return handleEarlyBuzz(tx, c, a, clue);
  if (reason === 'taken' && clue && s.buzzer.winner && s.buzzer.winner.competitorId !== c.id) {
    if (!s.buzzer.queue.some((q) => q.competitorId === c.id) && !s.buzzer.attemptedCompetitors.includes(c.id)) {
      s.buzzer.queue.push({ competitorId: c.id, profileId: a.profileId, at: now });
      emit(tx, {
        type: 'buzz',
        result: 'late',
        clueId: clue.clueId,
        roundIndex: clue.roundIndex,
        competitorId: c.id,
        profileId: a.profileId,
        controllerId: a.controllerId,
        sourceKind: a.sourceKind,
        reactionMs: s.buzzer.openedAt != null ? now - s.buzzer.openedAt : null,
      });
    }
    return { ignored: true, info: 'taken' };
  }
  if (reason) return { ignored: true, info: reason };
  const reactionMs = s.buzzer.openedAt != null ? now - s.buzzer.openedAt : null;
  s.buzzer.status = 'buzzed';
  s.buzzer.winner = {
    competitorId: c.id,
    profileId: a.profileId,
    controllerId: a.controllerId,
    sourceKind: a.sourceKind,
    at: now,
    reactionMs,
  };
  maybeAutoTimer(s, 'answer', now);
  emit(tx, {
    type: 'buzz',
    result: 'won',
    clueId: clue!.clueId,
    roundIndex: clue!.roundIndex,
    competitorId: c.id,
    profileId: a.profileId,
    controllerId: a.controllerId,
    sourceKind: a.sourceKind,
    reactionMs,
  });
  return { info: 'won' };
}
