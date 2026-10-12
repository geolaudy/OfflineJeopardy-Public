// Public game board for the TV / projector. Receives only the public projection.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { connect, useLive, reconnectNow } from '../../lib/socket';
import { api, ensureLocalHost, tokens } from '../../lib/api';
import { Avatar, QrImage, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName, useTimer, TIMER_LABELS } from '../../lib/view';
import { configureSound, sfx, unlockAudio } from '../../lib/sound';
import { reannounce, startInputBridge } from '../../lib/inputBridge';
import type { GameView } from '../../../shared/views';
import { avatarEmoji } from '../../lib/avatars';
import { isDesktopApp } from '../../lib/desktop';

interface PublicSettings {
  theme: string;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
}

export default function BoardPage() {
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  const trusted = useLive((s) => s.trustedDevice);
  const profilesVersion = useLive((s) => s.profilesVersion);
  const [settings, setSettings] = useState<PublicSettings>({ theme: 'classic', sound: true, volume: 0.7, reducedMotion: false });
  const [info, setInfo] = useState<{ urls: { join: string; host: string } } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // On the game computer the board window becomes a trusted input bridge (keyboard / Joy-Con).
      const local = await ensureLocalHost();
      if (cancelled) return;
      connect('public', () => (local ? tokens.host : null));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    api<PublicSettings>('GET', '/api/settings/public').then((s) => {
      setSettings(s);
      configureSound({ enabled: s.sound, volume: s.volume });
    });
    api<{ urls: { join: string; host: string } }>('GET', '/api/info').then(setInfo);
  }, [profilesVersion]);

  useEffect(() => {
    if (trusted && status === 'open') {
      // In the desktop app the main window reads Joy-Cons; a browser board on the game PC reads them itself.
      void startInputBridge({ keyboard: true, devices: !isDesktopApp() });
      reannounce();
    }
  }, [trusted, status]);

  useSounds(game);

  return (
    <div
      className={cx('board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none', settings.reducedMotion && 'reduce-motion')}
      data-theme={settings.theme}
      onClick={unlockAudio}
    >
      {!game ? (
        <Splash info={info} status={status} />
      ) : game.phase === 'lobby' ? (
        <Lobby g={game} info={info} />
      ) : game.phase === 'ended' ? (
        <Results g={game} />
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            {game.phase === 'board' && <Grid g={game} />}
            <AnimatePresence>{game.phase === 'clue' && game.clue && <ClueScreen key={game.clue.clueId} g={game} />}</AnimatePresence>
            {game.phase === 'final' && game.final && <FinalScreen g={game} />}
            {game.showJoinQr && info && (
              <div className="absolute right-[1.5vw] bottom-[1.5vw] z-20 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl">
                <QrImage target="join" className="h-[14vh] w-[14vh]" />
                <div className="max-w-[16vw] text-[1.6vh] font-semibold leading-snug">
                  Scan to join
                  <br />
                  <span className="font-mono text-[1.3vh] font-normal break-all">{info.urls.join}</span>
                </div>
              </div>
            )}
          </div>
          <Scoreboard g={game} />
        </>
      )}
      {game?.paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
          <p className="font-[family-name:var(--b-font)] text-[8vh] font-black tracking-wide text-white">PAUSED</p>
        </div>
      )}
      {status !== 'open' && (
        <button onClick={reconnectNow} className="absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-black shadow">
          Reconnecting to the game server…
        </button>
      )}
      <FullscreenButton />
    </div>
  );
}

function FullscreenButton() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 3000);
    };
    show();
    window.addEventListener('mousemove', show);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F11') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return (
    <button
      onClick={toggle}
      className={cx('absolute top-3 right-3 z-50 rounded-lg bg-black/50 px-3 py-2 text-sm text-white transition-opacity', visible ? 'opacity-100' : 'pointer-events-none opacity-0')}
      aria-label="Toggle full screen"
    >
      ⛶ Full screen (F11)
    </button>
  );
}

function useSounds(g: GameView | null) {
  const prev = useRef<GameView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = g;
    if (!g || !p || p.id !== g.id) return;
    if (g.buzzer.winner && g.buzzer.winner.at !== p.buzzer.winner?.at) sfx.buzz();
    if (g.clue?.isDailyWager && g.clue.clueId !== p.clue?.clueId) sfx.dailyWager();
    if (g.timer?.expired && !p.timer?.expired) sfx.timeUp();
    if (g.phase === 'ended' && p.phase !== 'ended') sfx.win();
    const before = new Map(p.competitors.map((c) => [c.id, c.score]));
    let delta = 0;
    for (const c of g.competitors) delta += c.score - (before.get(c.id) ?? c.score);
    if (g.phase !== 'ended') {
      if (delta > 0) sfx.correct();
      else if (delta < 0) sfx.incorrect();
    }
  }, [g]);
}

function Splash({ info, status }: { info: { urls: { join: string; host: string } } | null; status: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[4vh] p-[4vw] text-center">
      <h1 className="font-[family-name:var(--b-font)] text-[9vh] font-black tracking-tight b-accent drop-shadow">OfflineJeopardy</h1>
      <p className="text-[3vh] opacity-90">{status === 'open' ? 'Waiting for the host to start a game…' : 'Connecting…'}</p>
      {info && (
        <div className="flex items-center gap-[3vw] rounded-3xl bg-white p-[2.5vh] text-slate-900 shadow-2xl">
          <QrImage target="join" className="h-[26vh] w-[26vh]" />
          <div className="text-left">
            <p className="text-[3.2vh] font-bold">Players: scan to join</p>
            <p className="font-mono text-[2.2vh]">{info.urls.join}</p>
            <p className="mt-[2vh] text-[2vh] text-slate-600">Host controller (iPad): {info.urls.host}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Lobby({ g, info }: { g: GameView; info: { urls: { join: string } } | null }) {
  return (
    <div className="flex h-full flex-col p-[3vw]">
      <h1 className="text-center font-[family-name:var(--b-font)] text-[7vh] font-black b-accent">{g.title}</h1>
      <div className="mt-[3vh] grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-[3vw]">
        <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-[3vh] text-slate-900 shadow-2xl">
          <QrImage target="join" className="h-[38vh] w-[38vh]" />
          <p className="mt-[2vh] text-[3.4vh] font-bold">Scan to join</p>
          {info && <p className="font-mono text-[2.2vh]">{info.urls.join}</p>}
        </div>
        <div className="min-h-0 overflow-hidden">
          <p className="mb-[2vh] text-[3vh] font-semibold opacity-90">{g.mode === 'team' ? 'Teams' : 'Players'} ({g.competitors.length})</p>
          <div className="grid grid-cols-2 gap-[1.5vh] xl:grid-cols-3">
            <AnimatePresence>
              {g.competitors.map((c) => (
                <motion.div key={c.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-black/25 p-[1.5vh]">
                  <div className="flex items-center gap-[1vw]">
                    <Avatar profile={competitorAvatar(c, g)} size={56} />
                    <span className="truncate text-[3vh] font-bold">{competitorName(c, g)}</span>
                  </div>
                  {c.kind === 'team' && (
                    <div className="mt-[1vh] flex flex-wrap gap-2 text-[1.8vh] opacity-90">
                      {c.memberIds.map((m) => (
                        <span key={m} className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-1">
                          <Avatar profile={g.profiles[m]} size={22} /> {profileName(g.profiles[m])}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {g.unassigned.length > 0 && (
            <p className="mt-[2vh] text-[2.2vh] opacity-80">
              Waiting for a team: {g.unassigned.map((u) => profileName(g.profiles[u.profileId])).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Grid({ g }: { g: GameView }) {
  const round = g.rounds[g.roundIndex];
  if (!round) return null;
  const rows = Math.max(...round.categories.map((c) => c.clues.length));
  return (
    <div className="flex h-full flex-col p-[1vw]">
      <div className="grid min-h-0 flex-1 gap-[0.6vw]" style={{ gridTemplateColumns: `repeat(${round.categories.length}, minmax(0, 1fr))`, gridTemplateRows: `1.25fr repeat(${rows}, 1fr)` }}>
        {round.categories.map((c) => (
          <div key={c.id} className="b-cat flex items-center justify-center p-[0.8vw] text-center text-[clamp(14px,2.6vh,48px)] font-black uppercase leading-tight" data-testid="board-category">
            {c.name}
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) =>
          round.categories.map((c) => {
            const q = c.clues[r];
            if (!q) return <div key={`${c.id}-${r}`} />;
            return q.used ? (
              <div key={q.id} className="b-used" />
            ) : (
              <div key={q.id} className="b-tile flex items-center justify-center text-[clamp(20px,6vh,96px)] font-black" data-testid="board-tile">
                {q.value.toLocaleString()}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function TimerBar({ g }: { g: GameView }) {
  const remaining = useTimer(g.timer);
  if (!g.timer || remaining == null) return null;
  const frac = g.timer.durationMs ? remaining / g.timer.durationMs : 0;
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className="absolute inset-x-[3vw] bottom-[2vh] flex items-center gap-[1.5vw]" role="timer" aria-label={`${secs} seconds left`}>
      <span className="w-[14vw] text-right text-[2.4vh] font-semibold opacity-90">{TIMER_LABELS[g.timer.kind]}</span>
      <div className="h-[1.6vh] flex-1 overflow-hidden rounded-full bg-black/40">
        <div className={cx('h-full rounded-full transition-[width] duration-100', frac < 0.25 ? 'bg-red-500' : 'bg-[var(--b-accent)]')} style={{ width: `${frac * 100}%` }} />
      </div>
      <span className={cx('w-[6vw] text-[4vh] font-black tabular-nums', g.timer.expired && 'text-red-400')}>{g.timer.expired ? "Time!" : secs}</span>
    </div>
  );
}

function BuzzBanner({ g }: { g: GameView }) {
  const w = g.buzzer.winner;
  const c = findCompetitor(g, w?.competitorId);
  if (!w || !c) {
    if (g.buzzer.status === 'open')
      return (
        <div className="absolute top-[2vh] left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-[2vw] py-[0.8vh] text-[2.6vh] font-black text-black shadow-lg pulse-ring">
          BUZZERS OPEN
        </div>
      );
    return null;
  }
  const player = w.profileId ? g.profiles[w.profileId] : null;
  return (
    <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-[2vh] left-1/2 flex -translate-x-1/2 items-center gap-[1vw] rounded-full px-[2vw] py-[1vh] shadow-2xl" style={{ background: c.kind === 'team' ? c.color : player?.color ?? c.color, color: '#fff' }} data-testid="buzz-winner">
      <Avatar profile={player ?? competitorAvatar(c, g)} size={64} />
      <div>
        <div className="text-[4vh] font-black leading-none">{c.kind === 'team' ? c.name : profileName(player)}</div>
        {c.kind === 'team' && player && <div className="text-[2.2vh] font-semibold opacity-90">{profileName(player)}</div>}
      </div>
    </motion.div>
  );
}

function ClueScreen({ g }: { g: GameView }) {
  const clue = g.clue!;
  const wagerOwner = findCompetitor(g, clue.wager?.competitorId);
  if (clue.isDailyWager && clue.stage === 'wager') {
    const controller = findCompetitor(g, g.controlCompetitorId);
    return (
      <motion.div initial={{ scale: 0.2, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120 }} className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[3vh] bg-[var(--b-tile)] text-center">
        <p className="font-[family-name:var(--b-font)] text-[13vh] font-black leading-none b-accent drop-shadow-lg">DAILY WAGER!</p>
        <p className="text-[4vh] font-semibold">{clue.categoryName}</p>
        {controller && <p className="text-[3vh] opacity-90">{competitorName(controller, g)} is wagering…</p>}
        <TimerBar g={g} />
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0 z-10 flex flex-col bg-[var(--b-tile)] p-[3vw]">
      <div className="flex items-baseline justify-between text-[3vh] font-bold uppercase opacity-90">
        <span>{clue.categoryName}</span>
        <span className="b-accent">{clue.isDailyWager && clue.wager ? `Daily Wager: ${clue.wager.amount.toLocaleString()} — ${competitorName(wagerOwner, g)}` : clue.value.toLocaleString()}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vh]">
        {clue.media.filter((m) => m.kind === 'image').length > 0 && (
          <div className="flex max-h-[45vh] gap-[1vw]">
            {clue.media
              .filter((m) => m.kind === 'image')
              .map((m) => (
                <img key={m.url} src={m.url} alt={m.caption ?? ''} className="max-h-[45vh] rounded-xl object-contain shadow-2xl" />
              ))}
          </div>
        )}
        {clue.media
          .filter((m) => m.kind !== 'image')
          .map((m) =>
            m.kind === 'video' ? (
              <video key={m.url} src={m.url} controls autoPlay className="max-h-[50vh] rounded-xl" />
            ) : (
              <audio key={m.url} src={m.url} controls autoPlay />
            ),
          )}
        <p className="b-clue max-w-[85vw] text-center text-[clamp(24px,6.2vh,110px)] leading-tight font-semibold uppercase drop-shadow" data-testid="clue-text">
          {clue.question}
        </p>
        <AnimatePresence>
          {clue.answerRevealed && clue.answer && (
            <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-black/35 px-[3vw] py-[1.5vh] text-center text-[5vh] font-black b-accent" data-testid="clue-answer">
              {clue.answer}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <BuzzBanner g={g} />
      <TimerBar g={g} />
    </motion.div>
  );
}

function FinalScreen({ g }: { g: GameView }) {
  const f = g.final!;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[3vh] bg-[var(--b-tile)] p-[3vw] text-center">
      <p className="text-[3vh] font-bold tracking-widest uppercase opacity-80">Final Wager</p>
      <p className="font-[family-name:var(--b-font)] text-[8vh] font-black uppercase b-accent">{f.category}</p>
      {f.stage === 'wagers' && (
        <div className="flex flex-wrap justify-center gap-[1.5vw]">
          {f.entries.map((e) => {
            const c = findCompetitor(g, e.competitorId);
            return (
              <div key={e.competitorId} className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-[2.6vh] font-semibold">
                {competitorName(c, g)} {e.hasWager ? '✓' : '…'}
              </div>
            );
          })}
        </div>
      )}
      {(f.stage === 'clue' || f.stage === 'reveal' || f.stage === 'done') && f.question && (
        <p className="b-clue max-w-[85vw] text-[6vh] leading-tight font-semibold uppercase">{f.question}</p>
      )}
      {f.stage === 'clue' && (
        <div className="flex flex-wrap justify-center gap-[1.5vw]">
          {f.entries.map((e) => (
            <span key={e.competitorId} className="rounded-full bg-black/30 px-4 py-2 text-[2.4vh]">
              {competitorName(findCompetitor(g, e.competitorId), g)} {e.hasAnswer ? '✓' : '…'}
            </span>
          ))}
        </div>
      )}
      {(f.stage === 'reveal' || f.stage === 'done') && (
        <div className="grid w-full max-w-[85vw] grid-cols-2 gap-[1.5vh] xl:grid-cols-3">
          {f.entries.map((e) => {
            const c = findCompetitor(g, e.competitorId);
            return (
              <motion.div key={e.competitorId} layout className={cx('rounded-2xl p-[1.5vh] text-left', e.judged ? (e.correct ? 'bg-green-700' : 'bg-red-800') : 'bg-black/30')}>
                <div className="text-[2.6vh] font-bold">{competitorName(c, g)}</div>
                <div className="text-[3.2vh] font-semibold">{e.judged ? e.answer || '(no answer)' : '???'}</div>
                <div className="text-[2.2vh] opacity-90">{e.judged ? `Wager ${fmtScore(e.wager ?? 0)}` : ''}</div>
              </motion.div>
            );
          })}
        </div>
      )}
      {f.stage === 'done' && f.answer && <p className="rounded-2xl bg-black/35 px-[3vw] py-[1.5vh] text-[5vh] font-black b-accent">{f.answer}</p>}
      <TimerBar g={g} />
    </div>
  );
}

function Scoreboard({ g }: { g: GameView }) {
  return (
    <div className="flex shrink-0 justify-center gap-[0.8vw] bg-black/40 px-[1vw] py-[1vh]" data-testid="scoreboard">
      {g.competitors.map((c) => {
        const winner = g.buzzer.winner?.competitorId === c.id;
        const control = g.controlCompetitorId === c.id && g.phase === 'board';
        return (
          <motion.div
            key={c.id}
            layout
            className={cx('flex min-w-0 flex-1 items-center gap-[0.8vw] rounded-xl px-[1vw] py-[0.8vh]', winner ? 'bg-yellow-400 text-black' : 'bg-black/30')}
            style={{ borderBottom: `0.6vh solid ${c.kind === 'team' ? c.color : g.profiles[c.profileId!]?.color ?? c.color}`, maxWidth: '24vw' }}
          >
            <Avatar profile={competitorAvatar(c, g)} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[2.2vh] font-bold">
                {competitorName(c, g)} {control ? <span title="Picks next" aria-label="Picks next">▸</span> : null}
              </div>
              {c.kind === 'team' && (
                <div className="truncate text-[1.5vh] opacity-80">{c.memberIds.map((m) => profileName(g.profiles[m])).join(' · ')}</div>
              )}
            </div>
            <div className={cx('text-[3.6vh] font-black tabular-nums', c.score < 0 && !winner && 'text-red-400')} data-testid="score">
              {fmtScore(c.score)}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function Results({ g }: { g: GameView }) {
  const results = g.results ?? [];
  const winners = results.filter((r) => r.isWinner).map((r) => findCompetitor(g, r.competitorId));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[3vw] text-center">
      <p className="text-[3vh] tracking-widest uppercase opacity-80">{g.title}</p>
      <motion.h1 initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} className="font-[family-name:var(--b-font)] text-[10vh] font-black leading-none b-accent" data-testid="winner">
        {winners.length > 1 ? "It's a tie!" : `${competitorName(winners[0], g)} wins!`}
      </motion.h1>
      <div className="flex items-center gap-[2vw]">
        {winners.map((w) => w && <Avatar key={w.id} profile={competitorAvatar(w, g)} size={140} />)}
      </div>
      <div className="w-full max-w-[60vw] space-y-[1vh]">
        {results.map((r) => {
          const c = findCompetitor(g, r.competitorId);
          return (
            <div key={r.competitorId} className={cx('flex items-center gap-[1.5vw] rounded-2xl px-[2vw] py-[1vh]', r.isWinner ? 'bg-yellow-400 text-black' : 'bg-black/30')}>
              <span className="w-[4vw] text-[3.4vh] font-black">#{r.placement}</span>
              <span className="text-[3vh]">{c?.kind === 'team' ? avatarEmoji(c.avatar) : ''}</span>
              <span className="flex-1 text-left text-[3.2vh] font-bold">{competitorName(c, g)}</span>
              <span className="text-[3.6vh] font-black tabular-nums">{fmtScore(r.score)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
