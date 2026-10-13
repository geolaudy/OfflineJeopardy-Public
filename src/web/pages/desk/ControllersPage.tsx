import { useLive } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { PageTitleBar } from '../../components/ui';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import BuzzCheckPanel from '../../components/BuzzCheckPanel';

export default function ControllersPage() {
  const game = useLive((s) => s.game);
  const settings = useFetch(() => hostApi<{ joyconRumble: boolean }>('GET', '/api/settings'), []);
  const rumble = settings.data?.joyconRumble ?? true;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PageTitleBar
        title="Buzzers & controllers"
        subtitle="Joy-Cons, other game controllers and keyboard keys on the game computer can be buzzers. Players can always buzz from their phone too. Press a button on a controller to see it light up below."
      />
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
        <input
          type="checkbox"
          className="h-6 w-6 accent-blue-700"
          checked={rumble}
          disabled={!settings.data}
          onChange={async (e) => {
            const next = e.target.checked;
            const r = await attempt(() => hostApi<{ joyconRumble: boolean }>('PUT', '/api/settings', { joyconRumble: next }));
            if (r) settings.setData(r);
          }}
          data-testid="joycon-rumble"
        />
        <span>
          <span className="block font-semibold">Joy-Cons vibrate when their player buzzes in</span>
          <span className="block text-xs text-slate-500">One firm pulse for the first buzz, two short taps when someone buzzes too early.</span>
        </span>
      </label>
      <BuzzCheckPanel />
      <ControllersPanel g={game && game.phase !== 'ended' ? game : null} />
      {game && <AssignListener g={game} />}
    </div>
  );
}
