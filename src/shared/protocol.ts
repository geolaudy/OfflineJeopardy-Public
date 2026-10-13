// WebSocket message contract between clients and the local game server.
import { z } from 'zod';
import type { BindingTarget, InputKind } from './game.js';
import type { GameView, PlayerContext } from './views.js';
import { presentRequestSchema, type PresentationState, type PublicLobby } from './presentation.js';

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
  }),
]);
export type ControllerEvent = z.infer<typeof ControllerEventSchema>;

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profile'), profileId: z.string() }),
  z.object({ kind: z.literal('competitor'), competitorId: z.string() }),
]);

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), role: z.enum(['host', 'public', 'player']), token: z.string().max(200).optional() }),
  z.object({ t: z.literal('host'), id: z.number().optional(), action: z.unknown() }),
  z.object({ t: z.literal('buzz') }),
  z.object({ t: z.literal('join'), code: z.string().max(12).optional() }),
  z.object({ t: z.literal('finalWager'), amount: z.number().int() }),
  z.object({ t: z.literal('finalAnswer'), answer: z.string().max(200) }),
  z.object({ t: z.literal('ping'), c: z.number() }),
  z.object({ t: z.literal('controller'), ev: ControllerEventSchema }),
  z.object({ t: z.literal('assignListen'), target: target.nullable(), label: z.string().max(60).optional() }),
  z.object({ t: z.literal('controllerConfig'), controllerId: z.string(), label: z.string().max(60).optional(), buzzButtons: z.string().max(200).optional() }),
  z.object({ t: z.literal('controllerForget'), controllerId: z.string() }),
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
  | { t: 'buzzResult'; ok: boolean; info?: string }
  | { t: 'profilesChanged' }
  | { t: 'presentation'; lobby: PublicLobby | null; p: PresentationState }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; message: string };

/** Joy-Con buttons that never trigger a buzz under the default "any button" mapping. */
export const NON_BUZZ_BUTTONS = new Set(['HOME', 'CAPTURE', 'PLUS', 'MINUS', 'LSTICK', 'RSTICK']);

export function isBuzzButton(buzzButtons: string, button: string): boolean {
  if (buzzButtons === 'any') return !NON_BUZZ_BUTTONS.has(button);
  return buzzButtons.split(',').map((b) => b.trim()).includes(button);
}
