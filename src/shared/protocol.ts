// WebSocket message contract between clients and the local game server.
import { z } from 'zod';
import type { BindingTarget, InputKind } from './game.js';
import type { GameView, PlayerContext } from './views.js';
import { presentRequestSchema, type PresentationState, type PublicLobby } from './presentation.js';
import type { BuzzCheckView, ConnectionRow } from './buzzCheck.js';

export const ControllerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('connected'),
    controllerId: z.string().min(1).max(80),
    kind: z.enum(['joycon', 'keyboard', 'gamepad']),
    label: z.string().max(60),
    side: z.enum(['L', 'R']).nullable().optional(),
  }),
  z.object({ type: z.literal('disconnected'), controllerId: z.string().min(1).max(80) }),
  z.object({
    type: z.literal('button'),
    controllerId: z.string().min(1).max(80),
    kind: z.enum(['joycon', 'keyboard', 'gamepad']).optional(),
    label: z.string().max(60).optional(),
    side: z.enum(['L', 'R']).nullable().optional(),
    button: z.string().min(1).max(30),
    pressed: z.boolean(),
    // R6-22: when the window saw the press (its performance.now() base) and its sync epoch.
    at: z.number().optional(),
    e: z.number().int().optional(),
  }),
]);
export type ControllerEvent = z.infer<typeof ControllerEventSchema>;

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profile'), profileId: z.string() }),
  z.object({ kind: z.literal('competitor'), competitorId: z.string() }),
]);

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), role: z.enum(['host', 'public', 'player']), token: z.string().max(200).optional(), observer: z.boolean().optional() }),
  z.object({ t: z.literal('host'), id: z.number().optional(), action: z.unknown() }),
  // R6-22: p = the press as the phone saw it (pointerdown Event.timeStamp, performance.now()
  // base), e = the phone's sync epoch. Both optional: without them the press counts on arrival.
  z.object({ t: z.literal('buzz'), p: z.number().optional(), e: z.number().int().optional() }),
  // R6-22: answer to the server's clock probe {t:'sync', n}: c = performance.now() on receipt.
  z.object({ t: z.literal('syncR'), n: z.number().int(), c: z.number(), e: z.number().int() }),
  z.object({ t: z.literal('join'), code: z.string().max(12).optional() }),
  z.object({ t: z.literal('finalWager'), amount: z.number().int() }),
  // submit=false: autosaved draft or "Change answer" (the player is shown as not ready, R5-19).
  z.object({ t: z.literal('finalAnswer'), answer: z.string().max(200), submit: z.boolean().optional() }),
  // R5-5.3 / R5-5.9 / R5-17: in the lobby a player picks or leaves a team, renames or recolours
  // their team, and chooses a nickname for this lobby.
  z.object({ t: z.literal('pickTeam'), competitorId: z.string().max(64).nullable() }),
  z.object({ t: z.literal('teamIdentity'), name: z.string().max(30).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({ t: z.literal('nickname'), nickname: z.string().max(24) }),
  // R5-20: the Daily Double! wager from the wagering player's phone.
  z.object({ t: z.literal('dailyWager'), amount: z.number().int().min(0).max(10_000_000) }),
  z.object({ t: z.literal('pickColor'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  // rtt: the client's last measured round trip (ms), for connection diagnostics.
  z.object({ t: z.literal('ping'), c: z.number(), rtt: z.number().min(0).max(60_000).optional() }),
  // Host: run a buzzer check (Z11), or refresh the connection list.
  z.object({ t: z.literal('buzzCheck'), action: z.enum(['start', 'stop', 'refresh']) }),
  z.object({ t: z.literal('controller'), ev: ControllerEventSchema }),
  z.object({ t: z.literal('assignListen'), target: target.nullable(), label: z.string().max(60).optional() }),
  z.object({ t: z.literal('controllerConfig'), controllerId: z.string(), label: z.string().max(60).optional(), buzzButtons: z.string().max(200).optional() }),
  z.object({ t: z.literal('controllerForget'), controllerId: z.string() }),
  // Host: feedback on a physical controller (flash lights / test vibration). Routed to the window that reads it.
  z.object({ t: z.literal('controllerFx'), controllerId: z.string().min(1).max(80), fx: z.enum(['identify', 'test']) }),
  // Host: show a public page on the TV (the server builds the public payload).
  z.object({ t: z.literal('present'), req: presentRequestSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface ControllerInfo {
  id: string;
  kind: InputKind;
  label: string;
  side: 'L' | 'R' | null;
  connected: boolean;
  buzzButtons: string; // 'any' or comma-separated button names
  lastButton: string | null;
  lastInputAt: number | null;
  presses: number;
}

export type ServerMessage =
  | { t: 'welcome'; role: 'host' | 'public' | 'player'; profileId: string | null; trustedDevice: boolean; serverTime: number }
  | { t: 'state'; game: GameView | null; me?: PlayerContext | null; serverTime: number }
  | { t: 'result'; id?: number; ok: boolean; error?: string; info?: string }
  | { t: 'controllers'; list: ControllerInfo[]; listening: { target: BindingTarget; label?: string } | null }
  | { t: 'controllerInput'; controllerId: string; button: string; at: number }
  /** Hosts: the buzzer check and phone connection quality. */
  | { t: 'buzzCheck'; view: BuzzCheckView | null; connections: ConnectionRow[] }
  /** Players: only whether a check runs and whether this phone already pressed. */
  | { t: 'buzzCheckMine'; active: boolean; endsAt: number; pressed: boolean }
  /** To the window reading this controller: play feedback (lights / vibration). */
  | { t: 'controllerFx'; controllerId: string; fx: 'identify' | 'test' | 'buzzWin' | 'early' }
  | { t: 'buzzResult'; ok: boolean; info?: string }
  /** R6-22: clock probe; answer at once with {t:'syncR', n, c: performance.now(), e: epoch}. */
  | { t: 'sync'; n: number }
  | { t: 'profilesChanged' }
  | { t: 'presentation'; lobby: PublicLobby | null; p: PresentationState }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; message: string };

/** Joy-Con buttons that never trigger a buzz under the default "any button" mapping. */
// Joy-Con menu buttons and, in the standard gamepad mapping, Back/View (B8), Start/Menu (B9),
// stick presses (B10, B11) and Guide (B16) never buzz with "any button".
export const NON_BUZZ_BUTTONS = new Set(['HOME', 'CAPTURE', 'PLUS', 'MINUS', 'LSTICK', 'RSTICK', 'B8', 'B9', 'B10', 'B11', 'B16']);

export function isBuzzButton(buzzButtons: string, button: string): boolean {
  if (buzzButtons === 'any') return !NON_BUZZ_BUTTONS.has(button);
  return buzzButtons.split(',').map((b) => b.trim()).includes(button);
}
