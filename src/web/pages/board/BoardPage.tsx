// Public game board for the TV / projector. Receives only the public projection.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { connect, useLive, reconnectNow } from '../../lib/socket';
import { api, ensureLocalHost, tokens } from '../../lib/api';
import { Avatar, QrImage, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, findCompetitor, profileName } from '../../lib/view';
import { configureSound, sfx, unlockAudio } from '../../lib/sound';
import { reannounce, startInputBridge } from '../../lib/inputBridge';
import type { GameView } from '../../../shared/views';
import { avatarEmoji } from '../../lib/avatars';
import { isDesktopApp } from '../../lib/desktop';
import { BoardCtx, presentationFor, themeRoot, useBoard, usePrefersReducedMotion, useViewportHeight, vhPx } from './common';
import type { CustomTheme } from '../../../shared/themes';
import { Grid } from './Grid';
import { CluePanel } from './ClueZoom';
import { Intro } from './Intro';
import { FinalScreen } from './FinalScreen';
import { Scoreboard } from './Scoreboard';
import { EASE_OUT_ARR, T } from './timing';
import './board.css';

interface PublicSettings {
  theme: string;
  custom: CustomTheme | null;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
}

export default function BoardPage() {
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  const trusted = useLive((s) => s.trustedDevice);
  const profilesVersion = useLive((s) => s.profilesVersion);
  const [settings, setSettings] = useState<PublicSettings>({ theme: 'classic', custom: null, sound: true, volume: 0.7, reducedMotion: false });
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

  const osReduced = usePrefersReducedMotion();
  const vh = useViewportHeight();
  const reduced = osReduced || settings.reducedMotion;
  const presentation = useMemo(() => presentationFor(settings.theme, settings.custom, reduced, vh), [settings.theme, settings.custom, reduced, vh]);
  const root = useMemo(() => themeRoot(settings.theme, settings.custom), [settings.theme, settings.custom]);

  return (
    <BoardCtx.Provider value={presentation}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div
          className={cx('board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none', settings.reducedMotion && 'reduce-motion')}
          data-theme={root.dataTheme}
          style={root.style}
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
                <Stage g={game} />
                {game.showJoinQr && info && (
                  <div className="absolute right-[1.5vw] bottom-[1.5vw] z-30 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl">
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
              <p className="bt-display text-[9vh] text-white">PAUSED</p>
            </div>
          )}
          {status !== 'open' && (
            <button onClick={reconnectNow} className="absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-black shadow">
              Reconnecting to the game server…
            </button>
          )}
          <FullscreenButton />
        </div>
      </MotionConfig>
    </BoardCtx.Provider>
  );
}

/**
 * The main presentation area (above the scoreboard): category intro, board grid, clue panel and
 * Final. The grid stays mounted while a clue is open so the clue can zoom out of / back into its
 * tile. After the server closes a clue we keep the last clue snapshot only for the length of the
 * closing animation; any newer state (another clue, a new round, the Final) replaces it at once.
 */
function Stage({ g }: { g: GameView }) {
  const live = g.phase === 'clue' && g.clue ? g : null;
  const [prevLive, setPrevLive] = useState<GameView | null>(live);
  const [closing, setClosing] = useState<GameView | null>(null);
  if (live !== prevLive) {
    setPrevLive(live);
    if (!live && prevLive) setClosing(prevLive);
    else if (live && closing) setClosing(null);
  }
  // Zoom open only if this screen saw the board before the clue (not when (re)loading mid-clue).
  const sawBoard = useRef(!live);
  useEffect(() => {
    if (!live) sawBoard.current = true;
  });

  const closingShown = closing && !live && g.phase === 'board' && !g.intro && g.roundIndex === closing.roundIndex && closing.clue ? closing : null;
  const shown = live ?? closingShown;
  const showGrid = (g.phase === 'board' && !g.intro) || g.phase === 'clue';

  return (
    <>
      {showGrid && <Grid key={`${g.id}:${g.roundIndex}`} g={g} activeId={shown?.clue?.clueId ?? null} activeOpen={!!live} fillIn />}
      <AnimatePresence>{g.phase === 'board' && g.intro && <Intro key="intro" g={g} />}</AnimatePresence>
      {shown && (
        <CluePanel
          key={shown.clue!.clueId}
          g={shown}
          closing={!live}
          zoomIn={sawBoard.current}
          onClosed={() => setClosing(null)}
        />
      )}
      {g.phase === 'final' && g.final && <FinalScreen g={g} />}
    </>
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

/** A custom theme's logo (decorative), shown on title screens. */
export function ThemeLogo({ className }: { className?: string }) {
  const { logo } = useBoard();
  return logo ? <img src={logo} alt="" aria-hidden className={cx('w-auto max-w-[40vw] object-contain', className)} data-testid="theme-logo" /> : null;
}

function Splash({ info, status }: { info: { urls: { join: string; host: string } } | null; status: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[4vh] p-[4vw] text-center">
      <ThemeLogo className="max-h-[16vh]" />
      <h1 className="bt-headline">OfflineJeopardy</h1>
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
  const ctx = useBoard();
  return (
    <div className="flex h-full flex-col p-[3vw]">
      <div className="flex items-center justify-center gap-[2vw]">
        <ThemeLogo className="max-h-[10vh]" />
        <h1 className="bt-headline text-center !text-[min(8vh,5vw)]">{g.title}</h1>
      </div>
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
                    <Avatar profile={competitorAvatar(c, g)} size={vhPx(ctx, 5.2)} />
                    <span className="truncate text-[3vh] font-bold">{competitorName(c, g)}</span>
                  </div>
                  {c.kind === 'team' && (
                    <div className="mt-[1vh] flex flex-wrap gap-2 text-[1.8vh] opacity-90">
                      {c.memberIds.map((m) => (
                        <span key={m} className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-1">
                          <Avatar profile={g.profiles[m]} size={vhPx(ctx, 2)} /> {profileName(g.profiles[m])}
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

function Results({ g }: { g: GameView }) {
  const ctx = useBoard();
  const results = g.results ?? [];
  const winners = results.filter((r) => r.isWinner).map((r) => findCompetitor(g, r.competitorId));
  const big = Math.round(ctx.vh * 0.13);
  return (
    <div className="bt-results">
      <ThemeLogo className="max-h-[9vh]" />
      <p className="bt-kicker">{g.title}</p>
      <motion.h1
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: T.zoom, ease: EASE_OUT_ARR }}
        className="bt-headline"
        data-testid="winner"
      >
        {winners.length > 1 ? "It's a tie!" : `${competitorName(winners[0], g)} wins!`}
      </motion.h1>
      <div className="flex items-center gap-[2vw]">
        {winners.map((w) => w && <Avatar key={w.id} profile={competitorAvatar(w, g)} size={big} />)}
      </div>
      <div className="flex w-full max-w-[64vw] flex-col gap-[1vh]">
        {results.map((r, i) => {
          const c = findCompetitor(g, r.competitorId);
          return (
            <motion.div
              key={r.competitorId}
              initial={{ opacity: 0, y: '2vh' }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: T.fade, delay: T.zoom + i * 0.08 }}
              className={cx('bt-result-row', r.isWinner && 'is-winner')}
              style={{ '--pc': competitorColor(c, g) } as CSSProperties}
            >
              <span className="bt-display w-[4vw] text-[3.6vh] text-[var(--b-accent)]">#{r.placement}</span>
              <span className="text-[3vh]">{c?.kind === 'team' ? avatarEmoji(c.avatar) : ''}</span>
              <span className="bt-display flex-1 truncate text-left text-[3.4vh] uppercase">{competitorName(c, g)}</span>
              <span className={cx('bt-display text-[4vh] tabular-nums', r.score < 0 && 'text-[#ff7a6b]')}>{fmtScore(r.score)}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
