// Controller management: detected devices, assignment by button press, testing,
// buzzer-button mapping and troubleshooting. Used in game setup and live menus. R13-11: compact
// cards in grids, so many controllers and players fit on one iPad screen.
import { useEffect, useState } from 'react';
import { controllerFx, send, useLive } from '../lib/socket';
import { scanJoyCons, webHidAvailable } from '../lib/inputBridge';
import type { GameView } from '../../shared/views';
import type { BindingTarget } from '../../shared/game';
import type { ControllerInfo } from '../../shared/protocol';
import { Avatar, Button, Modal, cx } from './ui';
import { competitorName, profileName } from '../lib/view';
import { act } from '../lib/socket';
import { Gamepad2, Lightbulb, UsersRound, Vibrate } from 'lucide-react';

const BUTTON_CHOICES: Record<string, string[]> = {
  joycon: ['any', 'SL,SR', 'A', 'B', 'X', 'Y', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L,ZL', 'R,ZR'],
  // Standard gamepad mapping (Xbox-style pads, incl. controllers forwarded by Steam Link): every
  // button can be chosen, shoulders and triggers too (R7-32).
  gamepad: ['any', 'B4,B5,B6,B7', 'B4,B6', 'B5,B7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B12', 'B13', 'B14', 'B15'],
  keyboard: ['any'],
};

const PAD_BUTTONS: Record<string, string> = { B0: 'A', B1: 'B', B2: 'X', B3: 'Y', B4: 'LB / L', B5: 'RB / R', B6: 'LT / ZL', B7: 'RT / ZR', B12: 'D-pad up', B13: 'D-pad down', B14: 'D-pad left', B15: 'D-pad right' };

/** "B4,B6" → "LB / L or LT / ZL" for gamepads; Joy-Con names as they are. */
export function buttonChoiceLabel(kind: string, v: string) {
  if (v === 'any') return 'Any button';
  if (kind !== 'gamepad') return v;
  if (v === 'B4,B5,B6,B7') return 'Any shoulder or trigger';
  return v
    .split(',')
    .map((b) => PAD_BUTTONS[b] ?? b)
    .join(' or ');
}

export function targetLabel(t: BindingTarget, g: GameView) {
  if (t.kind === 'profile') return profileName(g.profiles[t.profileId]);
  const c = g.competitors.find((x) => x.id === t.competitorId);
  return c ? `${competitorName(c, g)} (shared)` : 'Unknown';
}

/** "Press a button now" dialog shown while the server waits to bind the next press. */
export function AssignListener({ g }: { g: GameView }) {
  const listening = useLive((s) => s.listening);
  if (!listening) return null;
  return (
    <Modal open onClose={() => send({ t: 'assignListen', target: null })} title="Assign a buzzer">
      <div className="space-y-4 text-center">
        <Gamepad2 size={56} strokeWidth={1.5} className="mx-auto text-blue-700" aria-hidden />
        <p className="text-lg">
          Ask <b>{targetLabel(listening.target, g)}</b> to press a button on their Joy-Con, controller or keyboard key now.
        </p>
        <p className="text-sm text-slate-500">The first button pressed on any controller will be assigned. Phones don't need assigning — players buzz from the player page.</p>
        <Button variant="secondary" onClick={() => send({ t: 'assignListen', target: null })}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

export function assignTo(target: BindingTarget) {
  send({ t: 'assignListen', target });
}

/** The controller that was pressed a moment ago (its card lights up for 400 ms). */
function useInputFlash() {
  const lastInput = useLive((s) => s.lastInput);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!lastInput) return;
    setFlash(lastInput.controllerId);
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [lastInput]);
  return flash;
}

/**
 * R13-11: controllers as compact cards in a grid (connection, name, who it buzzes for, last
 * press) — a tap opens that controller's settings (buzz button, Identify, Vibrate, Unassign,
 * Forget). Then who uses which buzzer, also as a compact grid.
 */
export default function ControllersPanel({ g }: { g: GameView | null }) {
  const controllers = useLive((s) => s.controllers);
  const [help, setHelp] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const flash = useInputFlash();

  const bindingFor = (id: string) => g?.bindings.find((b) => b.controllerId === id);
  const physical = controllers.filter((c) => c.kind !== 'phone');
  const current = physical.find((c) => c.id === open) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-base font-bold">Controllers ({physical.length})</h3>
        {webHidAvailable() && (
          <Button variant="secondary" size="sm" onClick={() => void scanJoyCons()}>
            Refresh devices
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setHelp(true)}>
          Help
        </Button>
      </div>
      {physical.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          No controllers detected yet. Pair Joy-Cons with the game computer (Windows Settings → Bluetooth), then press a button. Keyboard keys on the game computer appear when pressed.
        </p>
      )}
      {physical.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5">
          {physical.map((c) => {
            const b = bindingFor(c.id);
            return (
              <li key={c.id} data-testid="controller-row">
                <button
                  type="button"
                  onClick={() => setOpen(c.id)}
                  className={cx('flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-0.5 text-left transition-colors hover:bg-slate-50', flash === c.id && 'bg-yellow-100')}
                  aria-label={`${c.label} settings`}
                >
                  <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', c.connected ? 'bg-green-600' : 'bg-slate-300')} title={c.connected ? 'Connected' : 'Disconnected'} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-semibold">
                      {c.label}
                      {!c.connected && <span className="font-normal text-slate-500"> (off)</span>}
                    </span>
                    <span className={cx('block truncate text-xs', b ? 'text-blue-800' : 'text-slate-500')}>{b && g ? `→ ${targetLabel(b.target, g)}` : 'Not assigned'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {g ? <AssignmentTable g={g} /> : <p className="text-sm text-slate-500">Once a game is set up, players and teams appear here so you can assign their controllers.</p>}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current?.label ?? 'Controller'}>
        {current && <ControllerSettings c={current} binding={bindingFor(current.id)} g={g} onDone={() => setOpen(null)} />}
      </Modal>
      <Modal open={help} onClose={() => setHelp(false)} title="Connecting Joy-Cons" wide>
        <ol className="list-decimal space-y-2 pl-5 text-slate-700">
          <li>On the game computer open Windows Settings → Bluetooth &amp; devices → Add device → Bluetooth.</li>
          <li>Hold the small round sync button on the Joy-Con's rail until the green lights run back and forth.</li>
          <li>Pick "Joy-Con (L)" or "Joy-Con (R)" in the list. Each Joy-Con pairs separately and works as its own buzzer.</li>
          <li>Back here, press any button on the Joy-Con — it appears in the list above. Tap it and use "Identify" to flash its lights.</li>
          <li>Tap "Assign" next to a player (or team) and have them press a button on their Joy-Con.</li>
        </ol>
        <h3 className="mt-4 font-bold">Troubleshooting</h3>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Joy-Con not listed? Make sure OfflineJeopardy is open on the game computer (the input reader runs there) and press "Refresh devices".</li>
          <li>Lights keep flashing after pairing? Remove the device in Windows Bluetooth settings and pair it again.</li>
          <li>Laggy or missed presses: keep Joy-Cons within a few metres and away from Wi-Fi routers; too many Bluetooth devices can cause interference.</li>
          <li>A Joy-Con dropped mid-game? Other buzzers keep working. Re-pair it, or switch that player to their phone (they can buzz from the player page right away).</li>
          <li>The default buzz button is "any button" (except Home, Capture, + and −, and Back, Start, Guide and stick presses on other controllers). You can pick a specific button per controller.</li>
        </ul>
        <h3 className="mt-4 font-bold">Joy-Cons on an Apple TV with Steam Link</h3>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Best: pair the Joy-Cons with the game computer itself (a small USB Bluetooth adapter is enough) — each Joy-Con is then its own buzzer with every button, Identify and vibration.</li>
          <li>Through Steam Link the Apple TV joins a left and right Joy-Con into one controller; hold Capture + Home for a few seconds to split them. At most 4 controllers.</li>
          <li>Start OfflineJeopardy from Steam (Add a Non-Steam Game) so Steam passes the controllers on; they then appear here as Xbox-compatible controllers (no Identify or vibration).</li>
        </ul>
      </Modal>
    </div>
  );
}

/** One controller's settings: buzz button, Identify / Vibrate (Joy-Cons), Unassign, Forget. */
function ControllerSettings({ c, binding: b, g, onDone }: { c: ControllerInfo; binding: GameView['bindings'][number] | undefined; g: GameView | null; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        {c.connected ? 'Connected' : 'Disconnected'} · {b && g ? `buzzes for ${targetLabel(b.target, g)}` : 'not assigned'} · last input {c.lastButton ?? '—'} · {c.presses} presses
      </p>
      <label className="block text-sm font-semibold text-slate-700">
        Buzz button
        <select className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-base" value={c.buzzButtons} onChange={(e) => send({ t: 'controllerConfig', controllerId: c.id, buzzButtons: e.target.value })}>
          {(BUTTON_CHOICES[c.kind] ?? ['any']).concat(BUTTON_CHOICES[c.kind]?.includes(c.buzzButtons) ? [] : [c.buzzButtons]).map((v) => (
            <option key={v} value={v}>
              {buttonChoiceLabel(c.kind, v)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {c.kind === 'joycon' && c.connected && (
          <>
            {/* Routed through the server, so this works from the iPad as well as on the game computer. */}
            <Button variant="secondary" onClick={() => controllerFx(c.id, 'identify')} title="Flash the lights on this Joy-Con" data-testid="identify-controller">
              <Lightbulb size={16} aria-hidden /> Identify
            </Button>
            <Button variant="secondary" onClick={() => controllerFx(c.id, 'test')} title="Vibrate this Joy-Con" data-testid="vibrate-controller">
              <Vibrate size={16} aria-hidden /> Vibrate
            </Button>
          </>
        )}
        {b && (
          <Button variant="ghost" onClick={() => void act({ type: 'unbindController', controllerId: c.id }).then(onDone)}>
            Unassign
          </Button>
        )}
        {!c.connected && !b && (
          <Button
            variant="ghost"
            onClick={() => {
              send({ t: 'controllerForget', controllerId: c.id });
              onDone();
            }}
          >
            Forget
          </Button>
        )}
      </div>
    </div>
  );
}

/** R13-10 / R13-11: the lobby's players tab — the connected controllers as small chips (who each
 *  buzzes for, a press lights it); the full settings are on the Buzzers tab. */
export function ControllerChips({ g, onOpen }: { g: GameView; onOpen: () => void }) {
  const physical = useLive((s) => s.controllers).filter((c) => c.kind !== 'phone');
  const flash = useInputFlash();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm" data-testid="controller-chips">
      <div className="flex min-h-10 items-center gap-2">
        <h3 className="flex-1 font-bold">
          <Gamepad2 size={18} className="mr-1.5 inline align-[-3px] text-slate-500" aria-hidden />
          Controllers ({physical.length})
        </h3>
        <Button size="sm" variant="ghost" onClick={onOpen} data-testid="controller-chips-open">
          Assign &amp; test…
        </Button>
      </div>
      {physical.length ? (
        <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5">
          {physical.map((c) => {
            const b = g.bindings.find((x) => x.controllerId === c.id);
            return (
              <li key={c.id} className={cx('flex min-h-10 items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1 transition-colors', flash === c.id && 'bg-yellow-100')} data-testid="controller-chip">
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', c.connected ? 'bg-green-600' : 'bg-slate-300')} title={c.connected ? 'Connected' : 'Disconnected'} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold">{c.label}</span>
                  <span className={cx('block truncate text-xs', b ? 'text-blue-800' : 'text-slate-500')}>{b ? `→ ${targetLabel(b.target, g)}` : 'Not assigned'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pb-1 text-sm text-slate-500">None yet — phones need no setup. Pair Joy-Cons in Windows Bluetooth, then press a button.</p>
      )}
    </section>
  );
}

/** Who uses which buzzer: one compact card per player (or shared team buzzer), several per row. */
function AssignmentTable({ g }: { g: GameView }) {
  const rows: { key: string; label: string; team?: string; avatar?: Parameters<typeof Avatar>[0]['profile']; target: BindingTarget; online?: boolean }[] = [];
  for (const c of g.competitors) {
    if (c.kind === 'team' && c.buzzerMode === 'shared') {
      rows.push({ key: c.id, label: `${c.name} — shared team buzzer`, target: { kind: 'competitor', competitorId: c.id } });
    } else {
      for (const m of c.memberIds)
        rows.push({
          key: m,
          label: profileName(g.profiles[m]),
          team: c.kind === 'team' ? c.name : undefined,
          avatar: g.profiles[m],
          target: { kind: 'profile', profileId: m },
          online: g.online?.includes(m),
        });
    }
  }
  const bound = (t: BindingTarget) =>
    g.bindings.filter((b) => b.target.kind === t.kind && (t.kind === 'profile' ? b.target.kind === 'profile' && b.target.profileId === t.profileId : b.target.kind === 'competitor' && b.target.competitorId === t.competitorId));
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-base font-bold">Who uses which buzzer</h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5">
        {rows.map((r) => {
          const b = bound(r.target);
          const source = b.length ? b.map((x) => x.label).join(', ') : r.target.kind === 'profile' ? (r.online ? 'Phone · connected' : 'Phone (offline)') : 'No buzzer yet';
          return (
            // R13-11: the whole card assigns (the name keeps the width a separate button would take).
            <li key={r.key} data-testid="assignment-row">
              <button
                type="button"
                onClick={() => assignTo(r.target)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white py-0.5 pr-2 pl-2 text-left hover:bg-slate-50 active:bg-slate-100"
                aria-label={`${b.length ? 'Change' : 'Assign'} controller for ${r.label}`}
                title={`${b.length ? 'Change' : 'Assign'} the controller`}
              >
                {r.avatar ? <Avatar profile={r.avatar} size={28} /> : <UsersRound size={26} className="shrink-0 text-slate-500" aria-hidden />}
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold">
                    {r.label}
                    {r.team && <span className="font-normal text-slate-500"> ({r.team})</span>}
                  </span>
                  <span className={cx('block truncate text-xs', b.length ? 'text-blue-800' : r.online ? 'text-green-700' : 'text-slate-500')}>{source}</span>
                </span>
                <Gamepad2 size={18} className={cx('shrink-0', b.length ? 'text-blue-700' : 'text-slate-400')} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
