// Phone buzzer + current game participation.
import { useEffect, useState } from 'react';
import { send, useLive } from '../../lib/socket';
import { Avatar, Button, cx, fmtScore, inputCls } from '../../components/ui';
import { competitorName, findCompetitor, profileName, useTimer } from '../../lib/view';
import { unlockAudio } from '../../lib/sound';
import type { Me } from './JoinPage';

const REASONS: Record<string, string> = {
  'no-clue': 'Waiting for the next clue…',
  locked: 'Get ready…',
  paused: 'The game is paused',
  'not-buzzable': 'No buzzing on this clue',
  'already-answered': 'Your answer is in — wait for the next clue',
  'locked-out': 'Too early! Wait a moment…',
  'not-playing': 'You are not in this game yet',
  'shared-team': 'Your team uses a shared buzzer',
};

export default function PlayTab({ me }: { me: Me }) {
  const g = useLive((s) => s.game);
  const ctx = useLive((s) => s.me);
  const lastBuzz = useLive((s) => s.lastBuzz);
  const [pressed, setPressed] = useState(false);

  if (!g) return <Idle text="No game is running right now. Stay on this page — it updates automatically when the host starts one." />;
  if (g.phase === 'ended') {
    const mine = g.competitors.find((c) => c.memberIds.includes(me.id));
    const r = g.results?.find((x) => x.competitorId === mine?.id);
    return <Idle text={r ? (r.isWinner ? `🏆 You won with ${fmtScore(r.score)}!` : `Game over — you finished #${r.placement} with ${fmtScore(r.score)}.`) : 'This game has ended.'} />;
  }
  if (!ctx?.competitorId) {
    const pending = ctx?.pending || g.unassigned.some((u) => u.profileId === me.id);
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-semibold">{g.title}</p>
        {pending ? (
          <p className="rounded-2xl bg-amber-100 p-4 font-semibold text-amber-900">{g.mode === 'team' ? 'You joined! The host will put you on a team.' : 'Waiting for the host to let you in…'}</p>
        ) : (
          <Button size="xl" className="w-full" onClick={() => send({ t: 'join' })} data-testid="join-game">
            Join game
          </Button>
        )}
      </div>
    );
  }

  const myComp = findCompetitor(g, ctx.competitorId)!;
  const winner = g.buzzer.winner;
  const iWon = winner && (winner.profileId === me.id || (myComp.kind === 'team' && winner.competitorId === myComp.id));
  const buzz = () => {
    unlockAudio();
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    navigator.vibrate?.(40);
    send({ t: 'buzz' });
  };

  let label = 'BUZZ';
  let tone = 'bg-slate-300 text-slate-600';
  let sub = REASONS[ctx.buzzReason ?? ''] ?? '';
  if (ctx.canBuzz) {
    tone = 'bg-red-600 text-white shadow-[0_10px_0_#7f1d1d] active:translate-y-2 active:shadow-[0_2px_0_#7f1d1d]';
    sub = 'Tap to buzz in!';
  } else if (iWon) {
    label = "YOU'RE IN!";
    tone = 'bg-green-600 text-white';
    sub = myComp.kind === 'team' && winner?.profileId && winner.profileId !== me.id ? `${profileName(g.profiles[winner.profileId])} buzzed for your team` : 'Answer now!';
  } else if (winner) {
    const wc = findCompetitor(g, winner.competitorId);
    sub = `${competitorName(wc, g)} buzzed first`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <Avatar profile={myComp.kind === 'team' ? { name: myComp.name, color: myComp.color, avatar: myComp.avatar ?? 'shield', pictureUrl: null } : me} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{myComp.kind === 'team' ? myComp.name : 'Your score'}</div>
          {myComp.kind === 'team' && <div className="truncate text-xs text-slate-500">{myComp.memberIds.map((m) => profileName(g.profiles[m])).join(', ')}</div>}
        </div>
        <div className={cx('text-2xl font-black tabular-nums', myComp.score < 0 && 'text-red-700')} data-testid="my-score">
          {fmtScore(myComp.score)}
        </div>
      </div>

      {g.phase === 'final' && g.final ? (
        <FinalForm me={me} />
      ) : (
        <>
          {g.clue && (
            <p className="text-center text-sm text-slate-600">
              {g.clue.categoryName} · {g.clue.isDailyWager ? 'Daily Wager' : g.clue.value}
            </p>
          )}
          <div className="flex justify-center py-4">
            <button
              onPointerDown={ctx.canBuzz ? buzz : undefined}
              disabled={!ctx.canBuzz}
              className={cx('flex h-64 w-64 items-center justify-center rounded-full text-4xl font-black transition-all select-none', tone, pressed && 'scale-95', ctx.canBuzz && 'pulse-ring')}
              aria-label="Buzz"
              data-testid="buzzer"
            >
              {label}
            </button>
          </div>
          <p className="text-center text-lg font-semibold" role="status" data-testid="buzz-status">
            {sub}
          </p>
          {lastBuzz && !lastBuzz.ok && Date.now() - lastBuzz.at < 2000 && lastBuzz.info === 'early' && <p className="text-center text-sm text-amber-700">Too early — wait for the host to open the buzzers.</p>}
          <TimerLine />
        </>
      )}
    </div>
  );
}

function TimerLine() {
  const g = useLive((s) => s.game);
  const remaining = useTimer(g?.timer ?? null);
  if (!g?.timer || remaining == null) return null;
  return <p className="text-center text-2xl font-black tabular-nums">{g.timer.expired ? "Time's up" : `${Math.ceil(remaining / 1000)}s`}</p>;
}

function FinalForm({ me }: { me: Me }) {
  const g = useLive((s) => s.game)!;
  const ctx = useLive((s) => s.me);
  const f = g.final!;
  const entry = f.entries.find((e) => e.competitorId === ctx?.competitorId);
  const myComp = findCompetitor(g, ctx?.competitorId);
  const [wager, setWager] = useState('');
  const [answer, setAnswer] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => setSent(null), [f.stage]);
  if (!entry) return <Idle text="Final Wager — you're watching this one. Good luck to the finalists!" />;
  const max = Math.max(0, myComp?.score ?? 0);
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-center text-sm font-bold tracking-widest text-slate-500 uppercase">Final Wager</p>
      <p className="text-center text-2xl font-black">{f.category}</p>
      {(f.stage === 'category' || f.stage === 'wagers') && (
        <>
          <p className="text-center text-slate-600">Wager between 0 and {max.toLocaleString()}. Only the host can see it until the reveal.</p>
          <input className={inputCls} inputMode="numeric" value={wager} onChange={(e) => setWager(e.target.value.replace(/\D/g, ''))} aria-label="Your wager" placeholder="Your wager" />
          <Button
            size="lg"
            className="w-full"
            disabled={wager === '' || Number(wager) > max}
            onClick={() => {
              send({ t: 'finalWager', amount: Number(wager) });
              setSent(`Wager of ${Number(wager).toLocaleString()} submitted`);
            }}
          >
            Submit wager
          </Button>
          {(sent || entry.hasWager) && <p className="text-center font-semibold text-green-700">{sent ?? 'Wager submitted ✓'}</p>}
        </>
      )}
      {f.stage === 'clue' && (
        <>
          <p className="text-center text-lg">{f.question}</p>
          <textarea className={inputCls} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" placeholder="Your answer" maxLength={200} />
          <Button
            size="lg"
            className="w-full"
            disabled={!answer.trim()}
            onClick={() => {
              send({ t: 'finalAnswer', answer });
              setSent('Answer submitted — you can change it until time is up');
            }}
          >
            Submit answer
          </Button>
          {(sent || entry.hasAnswer) && <p className="text-center font-semibold text-green-700">{sent ?? 'Answer submitted ✓'}</p>}
          <TimerLine />
        </>
      )}
      {(f.stage === 'reveal' || f.stage === 'done') && <p className="text-center text-lg">Watch the TV for the reveal! {entry.judged ? (entry.correct ? '✅' : '❌') : ''}</p>}
    </div>
  );
}

function Idle({ text }: { text: string }) {
  return <div className="rounded-2xl bg-white p-6 text-center text-lg text-slate-700 shadow-sm">{text}</div>;
}
