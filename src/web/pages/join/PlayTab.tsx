// Phone buzzer + current game participation.
import { useEffect, useState } from 'react';
import { send, useLive } from '../../lib/socket';
import { Avatar, Button, Lives, cx, fmtScore, inputCls } from '../../components/ui';
import { competitorName, findCompetitor, profileName, useTimerSeconds } from '../../lib/view';
import { CLUE_LOCKOUT, LOBBY_COLORS } from '../../../shared/game';
import { unlockAudio } from '../../lib/sound';
import type { Me } from './JoinPage';
import { PlayerLobby } from './PlayerLobby';


const REASONS: Record<string, string> = {
  'no-clue': 'Waiting for the next clue…',
  locked: 'Wait for the host to open the buzzers…',
  ended: "Time's up for this clue",
  paused: 'The game is paused',
  'not-buzzable': 'No buzzing on this clue',
  'already-answered': 'Your answer is in — wait for the next clue',
  'locked-out': 'Too early! Wait a moment…',
  taken: 'Someone buzzed first',
  'not-playing': 'You are not in this game yet',
  'shared-team': 'Your team uses a shared buzzer',
};

export default function PlayTab({ me }: { me: Me }) {
  const g = useLive((s) => s.game);
  const ctx = useLive((s) => s.me);
  const lastBuzz = useLive((s) => s.lastBuzz);
  const myCheck = useLive((s) => s.myCheck);
  const [pressed, setPressed] = useState(false);
  const [, force] = useState(0);
  // Re-render once when the "Too early" flash should disappear.
  useEffect(() => {
    if (!lastBuzz || lastBuzz.info !== 'early') return;
    const t = setTimeout(() => force((x) => x + 1), 2100 - (Date.now() - lastBuzz.at));
    return () => clearTimeout(t);
  }, [lastBuzz]);

  if (myCheck?.active) return <BuzzCheckCard pressed={myCheck.pressed} />;
  if (!g) return <Idle text="No game is running right now. Stay on this page — it updates automatically when the host starts one." />;
  if (g.phase === 'ended') {
    const mine = g.competitors.find((c) => c.memberIds.includes(me.id));
    const r = g.results?.find((x) => x.competitorId === mine?.id);
    return <Idle text={r ? (r.isWinner ? `You won with ${fmtScore(r.score)}!` : `Game over — you finished #${r.placement} with ${fmtScore(r.score)}.`) : 'This game has ended.'} />;
  }
  // R5-17: before the game starts the phone shows the lobby, not the buzzer.
  if (g.phase === 'lobby')
    return (
      <>
        <ColorChoice />
        <PlayerLobby me={me} join={<JoinForm needsCode={g.rules.requireRoomCode} />} />
      </>
    );
  if (!ctx?.competitorId) {
    const pending = ctx?.pending || g.unassigned.some((u) => u.profileId === me.id);
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-semibold">{g.title}</p>
        <ColorChoice />
        {pending ? (
          <p className="rounded-2xl bg-amber-100 p-4 font-semibold text-amber-900">{g.mode === 'team' ? 'You joined! The host will put you on a team.' : 'Waiting for the host to let you in…'}</p>
        ) : (
          <JoinForm needsCode={g.rules.requireRoomCode} />
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

  const earlyFlash = !!lastBuzz && lastBuzz.info === 'early' && Date.now() - lastBuzz.at < 2000;
  let label = 'BUZZ';
  let tone = 'bg-slate-300 text-slate-600';
  let sub = REASONS[ctx.buzzReason ?? ''] ?? '';
  if (ctx.canBuzz) {
    tone = 'bg-red-600 text-white shadow-[0_10px_0_#7f1d1d]';
    sub = 'Tap to buzz in!';
  } else if (ctx.buzzReason === 'locked-out') {
    tone = 'bg-amber-400 text-amber-950';
    label = 'WAIT';
    sub = ctx.lockedUntil != null && ctx.lockedUntil >= CLUE_LOCKOUT ? 'You buzzed too early — you are out for this clue' : 'Too early! Locked for a moment…';
  } else if (ctx.canPress) {
    // Buzzers not open yet: the button is live (early presses count, like a real buzzer) but dimmed.
    tone = 'bg-red-900/80 text-red-100 shadow-[0_10px_0_#450a0a]';
    sub = earlyFlash ? 'Too early! Wait for the host to open the buzzers.' : REASONS.locked;
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
      <ColorChoice />
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <Avatar profile={myComp.kind === 'team' ? { name: myComp.name, color: myComp.color, avatar: myComp.avatar ?? 'shield', pictureUrl: null } : { ...me, color: ctx.color?.current ?? me.color }} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{myComp.kind === 'team' ? myComp.name : 'Your score'}</div>
          {myComp.kind === 'team' && (
            <div className="truncate text-xs text-slate-500" data-testid="my-teammates">
              {myComp.memberIds.filter((m) => m !== me.id).length ? `With ${myComp.memberIds.filter((m) => m !== me.id).map((m) => profileName(g.profiles[m])).join(', ')}` : 'Just you'}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className={cx('text-2xl font-black tabular-nums', myComp.score < 0 && 'text-red-700')} data-testid="my-score">
            {fmtScore(myComp.score)}
          </div>
          {myComp.lives !== undefined && <div className="text-xs font-semibold text-slate-600">{myComp.lives > 0 ? <Lives lives={myComp.lives} max={g.rules.survivalLives} size={14} /> : 'Out of lives'}</div>}
        </div>
      </div>

      {g.phase === 'final' && g.final ? (
        <FinalForm me={me} />
      ) : ctx.dailyWager ? (
        <DailyWagerForm />
      ) : (
        <>
          {g.clue && (
            <p className="text-center text-sm text-slate-600">
              {g.clue.categoryName} · {g.clue.isDailyWager ? 'Daily Double!' : g.clue.value}
            </p>
          )}
          <div className="flex justify-center py-4">
            <button
              onPointerDown={ctx.canPress ? buzz : undefined}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!ctx.canPress}
              className={cx(
                'flex size-[min(16rem,42dvh)] items-center justify-center rounded-full text-4xl font-black transition-transform duration-100 select-none [-webkit-touch-callout:none] [touch-action:manipulation]',
                tone,
                pressed && 'translate-y-1.5 scale-[0.97]',
                ctx.canBuzz && 'pulse-ring [--halo:#ef4444]',
              )}
              aria-label="Buzz"
              data-state={ctx.canBuzz ? 'open' : ctx.canPress ? 'armed' : 'off'}
              data-testid="buzzer"
            >
              {label}
            </button>
          </div>
          <p className="text-center text-lg font-semibold" role="status" data-testid="buzz-status">
            {sub}
          </p>
          <TimerLine />
        </>
      )}
    </div>
  );
}

/** R4-13: the preferred colour is taken in this lobby — pick a free one (taken ones are crossed out). */
function ColorChoice() {
  const ctx = useLive((s) => s.me);
  const [busy, setBusy] = useState(false);
  const c = ctx?.color;
  if (!c?.choose) return null;
  const taken = new Set(c.taken.map((x) => x.toLowerCase()));
  const pick = (color: string) => {
    setBusy(true);
    send({ t: 'pickColor', color });
    setTimeout(() => setBusy(false), 600);
  };
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-2 ring-amber-300" data-testid="color-choice">
      <p className="font-bold">Your colour is taken in this game</p>
      <p className="text-sm text-slate-600">Someone already plays in your preferred colour. Pick one of the free colours (your profile keeps its own colour).</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lobby colour">
        {LOBBY_COLORS.map((color) => {
          const isTaken = taken.has(color.toLowerCase());
          const current = c.current.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={current}
              aria-label={`Colour ${color}${isTaken ? ' (taken)' : ''}`}
              disabled={isTaken || busy}
              onClick={() => pick(color)}
              className={cx('relative h-11 w-11 rounded-full border-4 transition', current ? 'scale-110 border-slate-900' : 'border-white', isTaken && 'cursor-not-allowed opacity-35')}
              style={{ background: color }}
              data-testid={isTaken ? 'color-taken' : 'color-free'}
            >
              {isTaken && <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-white" aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
      <button className="min-h-11 text-sm font-semibold text-blue-700 underline" onClick={() => pick(c.current)} disabled={busy} data-testid="color-keep">
        Keep the colour I was given
      </button>
    </div>
  );
}

function TimerLine() {
  const timer = useLive((s) => s.game?.timer ?? null);
  const secs = useTimerSeconds(timer);
  if (!timer || secs == null) return null;
  return <p className="text-center text-2xl font-black tabular-nums">{timer.expired ? "Time's up" : `${secs}s`}</p>;
}

function FinalForm({ me }: { me: Me }) {
  const g = useLive((s) => s.game)!;
  const ctx = useLive((s) => s.me);
  const f = g.final!;
  const entry = f.entries.find((e) => e.competitorId === ctx?.competitorId);
  const myComp = findCompetitor(g, ctx?.competitorId);
  const mine = ctx?.final ?? null;
  const [wager, setWager] = useState('');
  const [changingWager, setChangingWager] = useState(false);
  const [answer, setAnswer] = useState(mine?.draft ?? mine?.answer ?? '');
  useEffect(() => setChangingWager(false), [f.stage]);
  // A phone that reconnects (or a teammate's phone) picks up what was already written.
  useEffect(() => {
    if (f.stage === 'clue' && !answer && (mine?.draft || mine?.answer)) setAnswer(mine.draft ?? mine.answer ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.answer, mine?.draft, f.stage]);
  const editing = f.stage === 'clue' && !mine?.submitted;
  // While editing, the text is autosaved as a draft so nothing is lost when the think music ends
  // (it counts only if no answer was ever submitted, R5-19).
  useEffect(() => {
    if (!editing || !answer.trim() || answer.trim() === (mine?.draft ?? '')) return;
    const t = setTimeout(() => send({ t: 'finalAnswer', answer, submit: false }), 700);
    return () => clearTimeout(t);
  }, [answer, editing, mine?.draft]);
  if (!entry) return <Idle text="Final Jeopardy! — you're watching this one. Good luck to the finalists!" />;
  const max = Math.max(0, myComp?.score ?? 0);
  const team = myComp?.kind === 'team';
  const showWagerInput = f.stage === 'wagers' && (mine?.wager == null || changingWager);
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" data-testid="phone-final">
      <p className="text-center text-sm font-bold tracking-widest text-slate-500 uppercase">Final Jeopardy!</p>
      <p className="text-center text-2xl font-black">{f.category}</p>
      {f.stage === 'category' && (
        <p className="rounded-xl bg-slate-100 p-3 text-center font-semibold text-slate-700" data-testid="phone-final-wait">
          Think about how much to wager — wagering opens when the host is ready.
        </p>
      )}
      {showWagerInput && (
        <>
          <p className="text-center text-slate-600">
            Wager between 0 and {max.toLocaleString()}. Nobody sees it — not even the host — until the reveal.{team ? ' Any team member can enter the team’s wager.' : ''}
          </p>
          <input className={inputCls} inputMode="numeric" value={wager} onChange={(e) => setWager(e.target.value.replace(/\D/g, ''))} aria-label="Your wager" placeholder="Your wager" />
          <Button
            size="lg"
            className="w-full"
            disabled={wager === '' || Number(wager) > max}
            onClick={() => {
              send({ t: 'finalWager', amount: Number(wager) });
              setWager('');
              setChangingWager(false);
            }}
            data-testid="phone-final-wager-submit"
          >
            Submit wager
          </Button>
        </>
      )}
      {f.stage === 'wagers' && !showWagerInput && mine?.wager != null && (
        <div className="space-y-3 text-center" data-testid="phone-final-wager-done">
          <p className="text-sm text-slate-500">{team ? 'Your team’s wager' : 'Your wager'}</p>
          <p className="text-3xl font-black tabular-nums">{fmtScore(mine.wager)}</p>
          <Button variant="secondary" className="w-full" onClick={() => setChangingWager(true)} data-testid="phone-final-wager-change">
            Change wager
          </Button>
        </div>
      )}
      {f.stage === 'clue' && (
        <>
          <p className="text-center text-lg">{f.question}</p>
          {editing ? (
            <>
              <textarea className={inputCls} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" placeholder="Your answer" maxLength={200} data-testid="phone-final-answer" data-draft-saved={!!answer.trim() && answer.trim() === (mine?.draft ?? '') ? 'true' : 'false'} />
              <Button size="lg" className="w-full" disabled={!answer.trim()} onClick={() => send({ t: 'finalAnswer', answer, submit: true })} data-testid="phone-final-answer-submit">
                Submit answer
              </Button>
              {mine?.answer && <p className="text-center text-sm text-slate-500">Not submitted yet — your last answer “{mine.answer}” counts until you submit again.</p>}
            </>
          ) : (
            <>
              <div className="rounded-xl bg-green-50 p-3 text-center ring-2 ring-green-500" data-testid="phone-final-answer-done">
                <p className="text-sm font-semibold text-green-800">{team ? 'Your team’s answer is in' : 'Your answer is in'}</p>
                <p className="mt-1 text-xl font-bold break-words">{mine?.answer}</p>
              </div>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => {
                  setAnswer(mine?.answer ?? '');
                  send({ t: 'finalAnswer', answer: mine?.answer ?? '', submit: false });
                }}
                data-testid="phone-final-answer-change"
              >
                Change answer
              </Button>
            </>
          )}
          <TimerLine />
        </>
      )}
      {(f.stage === 'closed' || f.stage === 'reveal' || f.stage === 'done') && (
        <div className="space-y-2 text-center">
          {mine?.answer && (
            <p className="text-slate-600" data-testid="phone-final-locked">
              Answers are closed. {team ? 'Your team’s answer' : 'Your answer'}: <b className="text-slate-900">{mine.answer}</b>
            </p>
          )}
          <p className="text-lg">
            {f.stage === 'closed' ? 'Time’s up! The reveal starts soon — watch the TV.' : 'Watch the TV for the reveal!'} {entry.judged ? (entry.correct ? '✅' : '❌') : ''}
          </p>
        </div>
      )}
    </div>
  );
}

/** R5-20: the Daily Double! wager, entered on the phone of the player (or team) who picked it. */
function DailyWagerForm() {
  const g = useLive((s) => s.game)!;
  const ctx = useLive((s) => s.me);
  const dw = ctx?.dailyWager;
  const [amount, setAmount] = useState('');
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener('oj-error', onErr);
    return () => window.removeEventListener('oj-error', onErr);
  }, []);
  if (!dw) return null;
  const n = Number(amount);
  const valid = amount !== '' && Number.isInteger(n) && n >= dw.min && n <= dw.max;
  const by = dw.pendingBy ? profileName(g.profiles[dw.pendingBy]) : null;
  const showInput = dw.mine && (dw.pending == null || changing);
  return (
    <div className="space-y-4 rounded-2xl bg-amber-50 p-4 shadow-sm ring-2 ring-amber-400" data-testid="phone-daily-wager">
      <p className="text-center text-2xl font-black text-amber-900">Daily Double!</p>
      <p className="text-center text-sm text-slate-600">{g.clue?.categoryName}</p>
      {showInput ? (
        <>
          <p className="text-center text-slate-700">
            Wager between {dw.min.toLocaleString()} and {dw.max.toLocaleString()}.
          </p>
          <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} aria-label="Daily Double wager" placeholder="Your wager" data-testid="phone-dd-input" />
          <div className="flex flex-wrap justify-center gap-2">
            {[...new Set([Math.round(dw.max / 2), dw.max])].filter((v) => v >= dw.min).map((v) => (
              <Button key={v} size="sm" variant="secondary" onClick={() => setAmount(String(v))}>
                {v === dw.max ? `All in (${v.toLocaleString()})` : v.toLocaleString()}
              </Button>
            ))}
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={!valid}
            onClick={() => {
              setError(null);
              send({ t: 'dailyWager', amount: n });
              setChanging(false);
              setAmount('');
            }}
            data-testid="phone-dd-submit"
          >
            Submit wager
          </Button>
          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
              {error}
            </p>
          )}
        </>
      ) : dw.pending != null ? (
        <div className="space-y-3 text-center" data-testid="phone-dd-done">
          <p className="text-sm text-slate-600">{dw.mine ? 'Your wager' : `${by ?? 'A teammate'} wagered for your team`}</p>
          <p className="text-3xl font-black tabular-nums">{fmtScore(dw.pending)}</p>
          <p className="text-sm text-slate-600">Waiting for the host to show the clue…</p>
          {dw.mine && (
            <Button variant="secondary" className="w-full" onClick={() => setChanging(true)}>
              Change wager
            </Button>
          )}
        </div>
      ) : (
        <p className="text-center text-slate-700">A teammate is entering your team’s wager…</p>
      )}
    </div>
  );
}

/** Join the current game; asks for the room code shown on the TV when the host requires it. */
function JoinForm({ needsCode }: { needsCode: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener('oj-error', onErr);
    return () => window.removeEventListener('oj-error', onErr);
  }, []);
  const join = () => {
    setError(null);
    send({ t: 'join', ...(needsCode ? { code } : {}) });
  };
  return (
    <div className="space-y-3">
      {needsCode && (
        <label className="block text-left">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Room code (shown on the TV)</span>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center font-mono text-3xl font-black tracking-[0.4em] uppercase"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            aria-label="Room code"
            data-testid="room-code-input"
          />
        </label>
      )}
      <Button size="xl" className="w-full" disabled={needsCode && code.length !== 4} onClick={join} data-testid="join-game">
        Join game
      </Button>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert" data-testid="join-error">
          {error}
        </p>
      )}
    </div>
  );
}

function Idle({ text }: { text: string }) {
  return <div className="rounded-2xl bg-white p-6 text-center text-lg text-slate-700 shadow-sm">{text}</div>;
}

/** Buzzer check (Z11): press once so the host can see this phone works. Never affects the game. */
function BuzzCheckCard({ pressed }: { pressed: boolean }) {
  const rtt = useLive((s) => s.rtt);
  return (
    <div className="space-y-4 text-center" data-testid="phone-buzz-check">
      <p className="text-lg font-semibold">Buzzer check</p>
      <p className="text-slate-600">{pressed ? 'Got it — the host can see your buzzer works.' : 'The host is checking everyone’s buzzer. Press it once.'}</p>
      <button
        onClick={() => {
          unlockAudio();
          navigator.vibrate?.(40);
          send({ t: 'buzz' });
        }}
        className={cx('mx-auto flex aspect-square w-[min(70vw,18rem)] items-center justify-center rounded-full text-3xl font-black select-none', pressed ? 'bg-green-600 text-white' : 'bg-red-600 text-white shadow-[0_10px_0_#7f1d1d] active:translate-y-2 active:shadow-none')}
        data-testid="phone-buzz-check-button"
      >
        {pressed ? 'OK!' : 'TEST'}
      </button>
      {rtt != null && <p className="text-sm text-slate-500">Connection delay: {Math.round(rtt)} ms</p>}
    </div>
  );
}
