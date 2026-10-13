// Controller management: detected devices, assignment by button press, testing,
// buzzer-button mapping and troubleshooting. Used in game setup and live menus.
import { useEffect, useState } from 'react';
import { controllerFx, send, useLive } from '../lib/socket';
import { scanJoyCons, webHidAvailable } from '../lib/inputBridge';
import type { GameView } from '../../shared/views';
import type { BindingTarget } from '../../shared/game';
import { Avatar, Button, Modal, cx } from './ui';
import { competitorName, profileName } from '../lib/view';
import { act } from '../lib/socket';
import { Gamepad2, Lightbulb, UsersRound, Vibrate } from 'lucide-react';

const BUTTON_CHOICES: Record<string, string[]> = {
  joycon: ['any', 'SL,SR', 'A', 'B', 'X', 'Y', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L,ZL', 'R,ZR'],
  gamepad: ['any', 'B0', 'B1', 'B2', 'B3'],
  keyboard: ['any'],
};

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

export default function ControllersPanel({ g }: { g: GameView | null }) {
  const controllers = useLive((s) => s.controllers);
  const lastInput = useLive((s) => s.lastInput);
  const [help, setHelp] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!lastInput) return;
    setFlash(lastInput.controllerId);
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [lastInput]);

  const bindingFor = (id: string) => g?.bindings.find((b) => b.controllerId === id);
  const physical = controllers.filter((c) => c.kind !== 'phone');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-lg font-bold">Controllers</h3>
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
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {physical.map((c) => {
          const b = bindingFor(c.id);
          return (
            <li key={c.id} className={cx('flex flex-wrap items-center gap-3 p-3 transition-colors', flash === c.id && 'bg-yellow-100')} data-testid="controller-row">
              <span className={cx('h-3 w-3 rounded-full', c.connected ? 'bg-green-600' : 'bg-slate-300')} title={c.connected ? 'Connected' : 'Disconnected'} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {c.label} <span className="text-xs font-normal text-slate-500">{c.connected ? '' : '(disconnected)'}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {b && g ? `Assigned to ${targetLabel(b.target, g)}` : 'Not assigned'} · Last input: {c.lastButton ?? '—'} · Presses: {c.presses}
                </div>
              </div>
              <label className="text-xs text-slate-600">
                Buzz button{' '}
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1"
                  value={c.buzzButtons}
                  onChange={(e) => send({ t: 'controllerConfig', controllerId: c.id, buzzButtons: e.target.value })}
                >
                  {(BUTTON_CHOICES[c.kind] ?? ['any']).concat(BUTTON_CHOICES[c.kind]?.includes(c.buzzButtons) ? [] : [c.buzzButtons]).map((v) => (
                    <option key={v} value={v}>
                      {v === 'any' ? 'Any button' : v}
                    </option>
                  ))}
                </select>
              </label>
              {c.kind === 'joycon' && c.connected && (
                <>
                  {/* Routed through the server, so this works from the iPad as well as on the game computer. */}
                  <Button variant="ghost" size="sm" onClick={() => controllerFx(c.id, 'identify')} title="Flash the lights on this Joy-Con" data-testid="identify-controller">
                    <Lightbulb size={16} aria-hidden /> Identify
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => controllerFx(c.id, 'test')} title="Vibrate this Joy-Con" data-testid="vibrate-controller">
                    <Vibrate size={16} aria-hidden /> Vibrate
                  </Button>
                </>
              )}
              {b && (
                <Button variant="ghost" size="sm" onClick={() => act({ type: 'unbindController', controllerId: c.id })}>
                  Unassign
                </Button>
              )}
              {!c.connected && !b && (
                <Button variant="ghost" size="sm" onClick={() => send({ t: 'controllerForget', controllerId: c.id })}>
                  Forget
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {g ? <AssignmentTable g={g} /> : <p className="text-sm text-slate-500">Once a game is set up, players and teams appear here so you can assign their controllers.</p>}
      <Modal open={help} onClose={() => setHelp(false)} title="Connecting Joy-Cons" wide>
        <ol className="list-decimal space-y-2 pl-5 text-slate-700">
          <li>On the game computer open Windows Settings → Bluetooth &amp; devices → Add device → Bluetooth.</li>
          <li>Hold the small round sync button on the Joy-Con's rail until the green lights run back and forth.</li>
          <li>Pick "Joy-Con (L)" or "Joy-Con (R)" in the list. Each Joy-Con pairs separately and works as its own buzzer.</li>
          <li>Back here, press any button on the Joy-Con — it appears in the list above. Use "Identify" to flash its lights.</li>
          <li>Tap "Assign" next to a player (or team) and have them press a button on their Joy-Con.</li>
        </ol>
        <h3 className="mt-4 font-bold">Troubleshooting</h3>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Joy-Con not listed? Make sure OfflineJeopardy is open on the game computer (the input reader runs there) and press "Refresh devices".</li>
          <li>Lights keep flashing after pairing? Remove the device in Windows Bluetooth settings and pair it again.</li>
          <li>Laggy or missed presses: keep Joy-Cons within a few metres and away from Wi-Fi routers; too many Bluetooth devices can cause interference.</li>
          <li>A Joy-Con dropped mid-game? Other buzzers keep working. Re-pair it, or switch that player to their phone (they can buzz from the player page right away).</li>
          <li>The default buzz button is "any button" (except Home, Capture, + and −). You can pick a specific button per controller.</li>
        </ul>
      </Modal>
    </div>
  );
}

function AssignmentTable({ g }: { g: GameView }) {
  const rows: { key: string; label: string; avatar?: Parameters<typeof Avatar>[0]['profile']; target: BindingTarget; online?: boolean; note?: string }[] = [];
  for (const c of g.competitors) {
    if (c.kind === 'team' && c.buzzerMode === 'shared') {
      rows.push({ key: c.id, label: `${c.name} — shared team buzzer`, target: { kind: 'competitor', competitorId: c.id } });
    } else {
      for (const m of c.memberIds)
        rows.push({
          key: m,
          label: profileName(g.profiles[m]) + (c.kind === 'team' ? ` (${c.name})` : ''),
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
      <h3 className="mb-2 text-lg font-bold">Who uses which buzzer</h3>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => {
          const b = bound(r.target);
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-3 p-3" data-testid="assignment-row">
              {r.avatar ? <Avatar profile={r.avatar} size={32} /> : <UsersRound size={28} className="text-slate-500" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.label}</div>
                <div className="text-xs text-slate-500">
                  {b.length ? b.map((x) => x.label).join(', ') : r.target.kind === 'profile' ? 'Phone buzzer' : 'No buzzer yet'}
                  {r.target.kind === 'profile' ? (r.online ? ' · phone connected' : ' · phone not connected') : ''}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => assignTo(r.target)}>
                {b.length ? 'Change' : 'Assign'} controller
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
