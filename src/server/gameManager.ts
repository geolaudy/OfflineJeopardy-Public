// Owns the current (active) game: dispatches actions through the pure engine,
// persists state + events transactionally, schedules authoritative timers and
// notifies the hub to broadcast role projections.
import type { DB } from './db/db.js';
import { audit } from './db/db.js';
import type { EngineAction } from '../shared/actions.js';
import type { BoardContent, BuzzWinner, GameRules, GameState, InputKind } from '../shared/game.js';
import { CLUE_LOCKOUT, timerRemaining } from '../shared/game.js';
import { applyAction, createGame, type EngineResult } from './engine/engine.js';
import { resolveInput } from './engine/buzzer.js';
import { getSetting, setSetting } from './db/db.js';
import { listTeams, loadGame, newId, newRoomCode, persistGame, profilesByIds, recordParticipants, saveTeam, snapshotClues } from './repos.js';
import type { ProfilePublic } from '../shared/views.js';
import { BotDriver } from './bots.js';
import { BUZZ_WINDOW_MAX_MS, type BuzzFairness } from '../shared/buzzTiming.js';
import { buzzBlockReason } from './engine/engine.js';

/** A connected buzzer device and how much its presses may be corrected right now (R6-22). */
export interface BuzzDevice {
  controllerId: string;
  profileId?: string | null;
  capMs: number;
}

/** Identity of the current introduction step (game, round, step, start time, auto mode). */
function introKey(s: GameState | null) {
  const i = s?.intro;
  return i && s ? `${s.id}:${i.roundIndex}:${i.step}:${i.at ?? ''}:${i.auto ? 'auto' : 'manual'}` : '';
}

export class GameManager {
  current: GameState | null = null;
  private timerHandle: NodeJS.Timeout | null = null;
  private lockoutHandle: NodeJS.Timeout | null = null;
  private introHandle: NodeJS.Timeout | null = null;
  /** The introduction state the pending automatic step belongs to. */
  private introKey = '';
  private mediaHandle: NodeJS.Timeout | null = null;
  private resolveHandle: NodeJS.Timeout | null = null;
  /** R6-22: connected buzzer devices with their correction caps (from the hub). */
  buzzDevices: (mode: BuzzFairness) => BuzzDevice[] = () => [];
  /** Someone won the buzz (any device, after the arbitration window): e.g. Joy-Con rumble. */
  onBuzzWinner: (w: BuzzWinner) => void = () => {};
  /** Delay between automatic category-introduction steps. */
  introStepMs = 3500;
  onChange: () => void = () => {};
  /** A different game became current (or none): the TV's presentation may change (R4-11). */
  onCurrentChange: () => void = () => {};
  clock: () => number = () => Date.now();

  /** Computer opponents and practice auto-pilot. */
  readonly bots = new BotDriver((a) => {
    if (this.current) this.dispatch(a, 'bot');
  });

  constructor(private db: DB) {}

  /** Restore the most recent unfinished game after a restart using documented safety rules:
   *  running timers are paused and open buzzers are locked (no stale buzzes are accepted). */
  recover() {
    const id = getSetting<string | null>(this.db, 'currentGameId', null);
    if (!id) return;
    const s = loadGame(this.db, id);
    if (!s || s.phase === 'ended') {
      setSetting(this.db, 'currentGameId', null);
      return;
    }
    if (s.timer?.running) {
      s.timer.remainingMs = timerRemaining(s.timer, this.clock());
      s.timer.startedAt = null;
      s.timer.running = false;
    }
    if (s.buzzer.status === 'open') s.buzzer.status = 'locked';
    s.buzzer.lockouts = {};
    s.buzzer.pending = null; // presses that were still being arbitrated are not replayed
    this.current = s;
    persistGame(this.db, s, []);
    this.bots.sync(s);
  }

  profilesFor(s: GameState | null): Record<string, ProfilePublic> {
    if (!s) return {};
    const ids = new Set<string>();
    for (const c of s.competitors) for (const m of c.memberIds) ids.add(m);
    for (const u of s.unassigned) ids.add(u.profileId);
    return profilesByIds(this.db, [...ids]);
  }

  create(opts: { title: string; boardId: string | null; board: BoardContent; mode: 'solo' | 'team'; rules: GameRules; practice?: boolean }) {
    const s = createGame({ id: newId(), now: this.clock(), roomCode: newRoomCode(), ...opts });
    persistGame(this.db, s, []);
    snapshotClues(this.db, s);
    this.setCurrent(s);
    audit(this.db, 'host', 'game.create', { id: s.id, title: s.title });
    return s;
  }

  /**
   * Return to Lobby (R3-3): the finished game stays completed in history; a fresh game starts in
   * the lobby with the same players, teams, controller bindings, room code, rules, mode and board
   * (re-read from the library so edits apply). Only match state (scores, used clues, buzzes,
   * timers, wagers, lockouts, media) starts over.
   */
  rematch(board: { id: string; content: BoardContent } | null): GameState | null {
    const old = this.current;
    if (!old || old.phase !== 'ended') return null;
    const s = createGame({
      id: newId(),
      now: this.clock(),
      roomCode: old.roomCode || newRoomCode(),
      title: old.title,
      boardId: board?.id ?? old.boardId,
      board: board ? board.content : old.board,
      mode: old.mode,
      rules: old.rules,
      practice: old.practice,
    });
    s.competitors = structuredClone(old.competitors);
    s.unassigned = structuredClone(old.unassigned);
    s.bindings = structuredClone(old.bindings);
    // Same lobby, same colours (R4-20 / R4-13).
    s.playerColors = structuredClone(old.playerColors ?? {});
    s.colorPrompts = structuredClone(old.colorPrompts ?? []);
    s.nicknames = structuredClone(old.nicknames ?? {});
    // Team slots that stayed empty in the last game come back with the lobby (R5-5.6).
    if (old.mode === 'team' && old.lobbyTeams?.length) {
      const playing = new Set(s.competitors.map((c) => c.id));
      s.competitors.push(...structuredClone(old.lobbyTeams.filter((t) => !playing.has(t.id)).map((t) => ({ ...t, memberIds: [] }))));
      const order = old.lobbyTeams.map((t) => t.id);
      const pos = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
      s.competitors.sort((a, b) => pos(a.id) - pos(b.id));
    }
    s.showJoinQr = old.showJoinQr;
    persistGame(this.db, s, []);
    snapshotClues(this.db, s);
    this.setCurrent(s);
    audit(this.db, 'host', 'game.rematch', { id: s.id, previous: old.id });
    return s;
  }

  /**
   * Team statistics belong to saved teams (stable ids). Lobby team slots and teams made on the
   * phones (R5-5) are linked to a saved team when the game starts: the saved team with the same
   * name and the same members, otherwise a new one. Members renamed or recoloured since keep it.
   */
  private linkSavedTeams(s: GameState) {
    if (s.mode !== 'team' || s.practice) return;
    const saved = listTeams(this.db, true);
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    for (const c of s.competitors) {
      if (c.kind !== 'team' || c.teamId || !c.memberIds.length) continue;
      const match = saved.find((t) => t.name.toLowerCase() === c.name.toLowerCase() && same(t.memberIds, c.memberIds));
      c.teamId = match?.id ?? saveTeam(this.db, { name: c.name, color: c.color, avatar: c.avatar ?? 'shield', buzzerMode: c.buzzerMode, memberIds: c.memberIds }).id;
    }
  }

  /** A profile's preferred colour (the lobby colour is assigned from it, R4-13). */
  private preferredColor(profileId: string): string | null {
    const r = this.db.prepare('SELECT color FROM profiles WHERE id = ?').get(profileId) as { color: string } | undefined;
    return r?.color ?? null;
  }

  load(id: string): GameState | null {
    const s = loadGame(this.db, id);
    if (!s) return null;
    this.setCurrent(s);
    return s;
  }

  unload() {
    this.setCurrent(null);
  }

  private setCurrent(s: GameState | null) {
    this.current = s;
    setSetting(this.db, 'currentGameId', s?.id ?? null);
    this.scheduleTimer();
    this.scheduleIntro();
    this.bots.sync(this.current);
    this.onChange();
    this.onCurrentChange();
  }

  dispatch(action: EngineAction, actor = 'host'): EngineResult {
    const s = this.current;
    if (!s) return { ok: false, error: 'No game is loaded' };
    // Randomness stays out of the pure engine: the server picks the new code.
    if (action.type === 'newRoomCode') action = { type: 'setRoomCode', code: newRoomCode() };
    const res = applyAction(s, action, { now: this.clock(), newId, colorOf: (pid) => this.preferredColor(pid), actor });
    if (!res.ok) return res;
    if (res.ignored && res.touchedEvents.length === 0 && action.type === 'buzz') {
      // Rejected buzz with no state change: nothing to persist or broadcast.
      return res;
    }
    if (action.type === 'startGame') this.linkSavedTeams(res.state);
    persistGame(this.db, res.state, res.touchedEvents);
    this.current = res.state;
    if (action.type === 'startGame' || action.type === 'endGame' || (action.type === 'undo' && s.phase === 'ended')) {
      recordParticipants(this.db, res.state, this.profilesFor(res.state));
    }
    if (action.type === 'endGame' || action.type === 'correctAttribution' || action.type === 'adjustScore' || action.type === 'refundPenalty' || action.type === 'updateRules')
      audit(this.db, actor, `game.${action.type}`, { gameId: s.id, action });
    if (action.type === 'undo' && s.phase === 'ended' && res.state.phase !== 'ended') {
      // Re-opened a completed game: it is active again until ended.
      persistGame(this.db, res.state, []);
    }
    this.scheduleTimer();
    this.scheduleBuzzResolve();
    const w = res.state.buzzer.winner;
    if (w && (w.at !== s.buzzer.winner?.at || w.controllerId !== s.buzzer.winner?.controllerId)) this.onBuzzWinner(w);
    if (action.type === 'buzz' || action.type === 'unlockBuzzers' || action.type === 'undo') this.scheduleLockoutRefresh();
    // Any change to the introduction (a manual step, a jump, Stop Auto, undo, a new round…)
    // replaces the pending automatic step; unrelated actions leave its pacing alone.
    if (introKey(res.state) !== this.introKey) this.scheduleIntro();
    this.bots.sync(this.current);
    this.scheduleMediaEnd();
    this.onChange();
    return res;
  }

  /** Early-buzz lockouts expire silently in state; re-broadcast when the next one ends so phones
   *  re-enable their buzzer without waiting for an unrelated change. */
  private scheduleLockoutRefresh() {
    if (this.lockoutHandle) clearTimeout(this.lockoutHandle);
    this.lockoutHandle = null;
    const now = this.clock();
    const next = Math.min(...Object.values(this.current?.buzzer.lockouts ?? {}).filter((t) => t > now && t < CLUE_LOCKOUT));
    if (!Number.isFinite(next)) return;
    this.lockoutHandle = setTimeout(() => {
      this.lockoutHandle = null;
      this.onChange();
      this.scheduleLockoutRefresh();
    }, next - now + 5);
  }

  /** Media playback is authoritative on the server: when the playing item reaches its known
   *  duration, record the end (which may unlock buzzers for "after media finishes" clues). */
  private scheduleMediaEnd() {
    if (this.mediaHandle) clearTimeout(this.mediaHandle);
    this.mediaHandle = null;
    const m = this.current?.media;
    if (!m || m.status !== 'playing' || m.durationMs == null || m.startedAt == null) return;
    const left = m.durationMs - (m.positionMs + (this.clock() - m.startedAt));
    const clueId = m.clueId;
    this.mediaHandle = setTimeout(() => {
      this.mediaHandle = null;
      if (this.current?.media?.clueId === clueId) this.dispatch({ type: 'mediaEnded', clueId }, 'media');
    }, Math.max(0, left) + 20);
  }

  /** Server-paced automatic category introduction (host chose "Auto"). The pending step is tied
   *  to the introduction state it was scheduled for: if anything changed it since (Previous, a
   *  category jump, Stop Auto, another round), it never fires. */
  private scheduleIntro() {
    if (this.introHandle) clearTimeout(this.introHandle);
    this.introHandle = null;
    const key = introKey(this.current);
    this.introKey = key;
    if (!this.current?.intro?.auto) return;
    this.introHandle = setTimeout(() => {
      this.introHandle = null;
      if (this.current?.intro?.auto && introKey(this.current) === key) this.dispatch({ type: 'introNext' }, 'intro');
    }, this.introStepMs);
  }

  /**
   * Single entry point for every buzz from every device type. R6-22: `timing` is the bounded
   * correction the hub computed from the device's own press timestamp (none = arrival order).
   * The decision waits only as long as another connected, eligible device could still have
   * pressed earlier (its correction cap), at most BUZZ_WINDOW_MAX_MS.
   */
  buzz(input: { controllerId: string; kind: InputKind; profileId?: string | null; timing?: { compMs: number; uncertaintyMs: number } }) {
    const s = this.current;
    if (!s) return { ok: false as const, info: 'no-game' };
    const r = resolveInput(s, { controllerId: input.controllerId, profileId: input.profileId });
    if (!r.ok) return { ok: false as const, info: r.reason };
    const now = this.clock();
    const pressAt = now - Math.max(0, input.timing?.compMs ?? 0);
    const wait = this.otherDevicesCap(s, r.competitorId, input.controllerId, now);
    const holdUntil = wait > 0 ? Math.min(now + BUZZ_WINDOW_MAX_MS, pressAt + wait + 2) : now;
    const res = this.dispatch(
      { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: input.controllerId, sourceKind: input.kind, pressAt, uncertaintyMs: input.timing?.uncertaintyMs, holdUntil },
      'buzzer',
    );
    if (!res.ok) return { ok: false as const, info: res.error };
    return { ok: res.info === 'won', info: res.info };
  }

  /** Largest correction cap among connected devices of *other* competitors who may still buzz. */
  private otherDevicesCap(s: GameState, competitorId: string, controllerId: string, now: number): number {
    if (s.rules.buzzFairness === 'off') return 0;
    let max = 0;
    for (const d of this.buzzDevices(s.rules.buzzFairness ?? 'standard')) {
      if (d.capMs <= max || d.controllerId === controllerId) continue;
      const r = resolveInput(s, { controllerId: d.controllerId, profileId: d.profileId });
      if (!r.ok || r.competitorId === competitorId) continue;
      const why = buzzBlockReason(s, r.competitorId, r.profileId, now);
      if (why === null || why === 'taken') max = d.capMs;
    }
    return max;
  }

  /** R6-22: announce the buzz winner when the arbitration window closes. */
  private scheduleBuzzResolve() {
    if (this.resolveHandle) clearTimeout(this.resolveHandle);
    this.resolveHandle = null;
    const p = this.current?.buzzer.pending;
    if (!p) return;
    this.resolveHandle = setTimeout(() => {
      this.resolveHandle = null;
      if (this.current?.buzzer.pending) this.dispatch({ type: 'buzzResolve' }, 'buzzer');
    }, Math.max(0, p.deadline - this.clock()) + 1);
  }

  private scheduleTimer() {
    if (this.timerHandle) clearTimeout(this.timerHandle);
    this.timerHandle = null;
    const t = this.current?.timer;
    if (!t?.running) return;
    const ms = timerRemaining(t, this.clock());
    this.timerHandle = setTimeout(() => {
      this.timerHandle = null;
      if (this.current?.timer?.running) this.dispatch({ type: 'timerExpire' }, 'timer');
    }, ms + 5);
  }

  dispose() {
    this.bots.stop();
    for (const h of [this.timerHandle, this.lockoutHandle, this.introHandle, this.mediaHandle, this.resolveHandle]) if (h) clearTimeout(h);
    this.timerHandle = this.lockoutHandle = this.introHandle = this.mediaHandle = this.resolveHandle = null;
    this.onChange = () => {};
  }
}
