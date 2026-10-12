import { useLive } from '../../lib/socket';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';

export default function ControllersPage() {
  const game = useLive((s) => s.game);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-3xl font-black">Buzzers & controllers</h1>
      <p className="text-slate-600">
        Joy-Cons, other game controllers and keyboard keys on this computer can be buzzers. Players can always buzz from their phone too. Press a button on a controller to see it light up below.
      </p>
      <ControllersPanel g={game && game.phase !== 'ended' ? game : null} />
      {game && <AssignListener g={game} />}
    </div>
  );
}
