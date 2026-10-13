// Owns the current (active) game: dispatches actions through the pure engine,
// persists state + events transactionally, schedules authoritative timers and
// notifies the hub to broadcast role projections.
import type { DB } from './db/db.js';
import { audit } from './db/db.js';
import type { EngineAction } from '../shared/actions.js';
import type { BoardContent, GameRules, GameState, InputKind } from '../shared/game.js';
import { CLUE_LOCKOUT, timerRemaining } from '../shared/game.js';
import { applyAction, createGame, type EngineResult } from './engine/engine.js';
import { resolveInput } from './engine/buzzer.js';
import { getSetting, setSetting } from './db/db.js';
import { loadGame, newId, newRoomCode, persistGame, profilesByIds, recordParticipants, snapshotClues } from './repos.js';
import type { ProfilePublic } from '../shared/views.js';
import { BotDriver } from './bots.js';

export class GameManager {
  current: GameState | null = null;
  private timerHandle: NodeJS.Timeout | null = null;
  private lockoutHandle: NodeJS.Timeout | null = null;
  private introHandle: NodeJS.Timeout | null = null;
  /** Delay between automatic category-introduction steps. */
  introStepMs = 3500;
  onChange: () => void = () => {};
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
  }

  dispatch(action: EngineAction, actor = 'host'): EngineResult {
    const s = this.current;
    if (!s) return { ok: false, error: 'No game is loaded' };
    // Randomness stays out of the pure engine: the server picks the new code.
    if (action.type === 'newRoomCode') action = { type: 'setRoomCode', code: newRoomCode() };
    const res = applyAction(s, action, { now: this.clock(), newId });
    if (!res.ok) return res;
    if (res.ignored && res.touchedEvents.length === 0 && action.type === 'buzz') {
      // Rejected buzz with no state change: nothing to persist or broadcast.
      return res;
    }
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
    if (action.type === 'buzz' || action.type === 'unlockBuzzers' || action.type === 'undo') this.scheduleLockoutRefresh();
    if (action.type === 'startIntro' || action.type === 'introNext' || action.type === 'introSkip' || action.type === 'undo') this.scheduleIntro();
    this.bots.sync(this.current);
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

  /** Server-paced automatic category introduction (host chose "Auto"). */
  private scheduleIntro() {
    if (this.introHandle) clearTimeout(this.introHandle);
    this.introHandle = null;
    if (!this.current?.intro?.auto) return;
    this.introHandle = setTimeout(() => {
      this.introHandle = null;
      if (this.current?.intro?.auto) this.dispatch({ type: 'introNext' }, 'intro');
    }, this.introStepMs);
  }

  /** Single entry point for every buzz from every device type. */
  buzz(input: { controllerId: string; kind: InputKind; profileId?: string | null }) {
    const s = this.current;
    if (!s) return { ok: false as const, info: 'no-game' };
    const r = resolveInput(s, { controllerId: input.controllerId, profileId: input.profileId });
    if (!r.ok) return { ok: false as const, info: r.reason };
    const res = this.dispatch({ type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: input.controllerId, sourceKind: input.kind }, 'buzzer');
    if (!res.ok) return { ok: false as const, info: res.error };
    return { ok: res.info === 'won', info: res.info };
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
    for (const h of [this.timerHandle, this.lockoutHandle, this.introHandle]) if (h) clearTimeout(h);
    this.timerHandle = this.lockoutHandle = this.introHandle = null;
    this.onChange = () => {};
  }
}
