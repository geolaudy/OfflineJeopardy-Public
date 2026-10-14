// Public game board for the TV / projector. Receives only the public projection.
import { Maximize } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { connect, useLive, reconnectNow } from '../../lib/socket';
import { api, ensureLocalHost, tokens } from '../../lib/api';
import { Avatar, QrImage, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, findCompetitor } from '../../lib/view';
import { configureSound, playCue, sfx, stopCue, unlockAudio } from '../../lib/sound';
import { DEFAULT_TV_FX, normalizeTvFx, type PackFiles, type TvFx } from '../../../shared/tvFx';
import { timerRemaining } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import type { PublicLobby } from '../../../shared/presentation';
import { useTimerSeconds } from '../../lib/view';
import { FxCtx } from './fx';
import { reannounce, startInputBridge } from '../../lib/inputBridge';
import type { GameView } from '../../../shared/views';
import { avatarEmoji } from '../../lib/avatars';
import { isDesktopApp } from '../../lib/desktop';
import { BoardCtx, presentationFor, themeRoot, useBoard, usePrefersReducedMotion, useViewportHeight } from './common';
import type { CustomTheme } from '../../../shared/themes';
import { Grid } from './Grid';
import { CluePanel } from './ClueZoom';
import { Intro } from './Intro';
import { FinalScreen } from './FinalScreen';
import { Scoreboard } from './Scoreboard';
import { Presenter } from './Presenter';
import { EASE_OUT_ARR, T } from './timing';
import './board.css';

interface PublicSettings {
  theme: string;
  custom: CustomTheme | null;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
  tvFx?: TvFx;
  packFiles?: PackFiles;
}

export default function BoardPage() {
  const game = useLive((s) => s.game);
  const status = useLive((s) => s.status);
  const trusted = useLive((s) => s.trustedDevice);
  const profilesVersion = useLive((s) => s.profilesVersion);
  const lobby = useLive((s) => s.lobby);
  const presented = useLive((s) => s.presentation);
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
      const tvFx = normalizeTvFx(s.tvFx);
      setSettings({ ...s, tvFx });
      configureSound({ enabled: s.sound, volume: s.volume, fx: tvFx, packFiles: s.packFiles ?? {} });
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

  useSounds(game, lobby);
  useCountdownCue(game);

  const osReduced = usePrefersReducedMotion();
  const vh = useViewportHeight();
  const reduced = osReduced || settings.reducedMotion;
  const presentation = useMemo(() => presentationFor(settings.theme, settings.custom, reduced, vh), [settings.theme, settings.custom, reduced, vh]);
  const root = useMemo(() => themeRoot(settings.theme, settings.custom), [settings.theme, settings.custom]);

  // Which screen: gameplay (board / clue / Final), results, the presenter (public lobby and
  // presented pages) or the splash before any lobby exists.
  const page = presented?.page ?? 'lobby';
  const screen: 'play' | 'results' | 'present' | 'splash' = !game
    ? lobby?.open
      ? 'present'
      : 'splash'
    : game.phase === 'lobby'
      ? 'present'
      : game.phase === 'ended'
        ? page === 'lobby'
          ? 'results'
          : 'present'
        : 'play';

  return (
    <BoardCtx.Provider value={presentation}>
      <FxCtx.Provider value={settings.tvFx ?? DEFAULT_TV_FX}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div
          className={cx('board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none', settings.reducedMotion && 'reduce-motion')}
          data-theme={root.dataTheme}
          style={root.style}
          onClick={unlockAudio}
        >
          {screen === 'splash' ? (
            <Splash info={info} status={status} />
          ) : screen === 'present' ? (
            <Presenter g={game} lobby={lobby} presentation={presented} joinUrl={info?.urls.join ?? null} />
          ) : screen === 'results' && game ? (
            <Results g={game} />
          ) : game ? (
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
                      <RoomCode g={game} className="mt-[0.6vh] text-[1.6vh]" />
                    </div>
                  </div>
                )}
              </div>
              <Scoreboard g={game} />
            </>
          ) : null}
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
      </FxCtx.Provider>
    </BoardCtx.Provider>
  );
}

/**
 * The main presentation area (above the scoreboard): category intro, board grid, clue panel and
 * Final. The grid stays mounted while a clue is open so the clue can zoom out of / back into its
 * tile. After the server closes a clue we keep the last clue snapshot only for the length of the
 * closing animation; any newer state (another clue, a new round, the Final) replaces it at once.
 */
export function Stage({ g }: { g: GameView }) {
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
      className={cx('absolute right-3 bottom-3 z-50 inline-flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 text-sm text-white transition-opacity', visible ? 'opacity-100' : 'pointer-events-none opacity-0')}
      aria-label="Toggle full screen"
    >
      <Maximize size={16} aria-hidden /> Full screen (F11)
    </button>
  );
}

/** Sound cues (R2-22) follow the authoritative state; each cue can be switched off in Settings. */
function useSounds(g: GameView | null, lobby: PublicLobby | null) {
  const prev = useRef<GameView | null>(null);
  const wasOpen = useRef<boolean | null>(null);
  useEffect(() => {
    const open = !!lobby?.open;
    if (wasOpen.current === false && open) playCue('startup');
    wasOpen.current = open;
  }, [lobby?.open]);
  useEffect(() => {
    const p = prev.current;
    prev.current = g;
    // Leaving the Final (undo, game closed, another game) never leaves the think music running.
    if (!g || g.id !== p?.id || g.phase !== 'final') stopCue('finalThink', 400);
    if (!g || !p || p.id !== g.id) return;
    // Categories / new round. The board fill sound starts with its animation (Intro.tsx, R4-19).
    if (g.intro && p.intro && g.intro.roundIndex === p.intro.roundIndex && g.intro.step > p.intro.step && g.intro.step >= 0) playCue('categoryIntro');
    if (p.phase === 'lobby') {
      if (g.phase === 'board' && !g.intro) playCue('boardIntro'); // board appears without an intro
    } else if (p.roundIndex !== g.roundIndex) playCue('roundEnd');
    if (g.phase === 'final' && p.phase !== 'final') playCue('final');
    if (g.clue && g.clue.clueId !== p.clue?.clueId && !g.clue.isDailyWager) playCue('clueSelect');
    if (g.buzzer.status === 'open' && p.buzzer.status !== 'open' && g.phase === 'clue') playCue('unlock');
    if (g.buzzer.winner && g.buzzer.winner.at !== p.buzzer.winner?.at) sfx.buzz();
    if (g.clue?.isDailyWager && g.clue.clueId !== p.clue?.clueId) sfx.dailyWager();
    // The think music ends on its own; no "time's up" on top of it.
    if (g.timer?.expired && !p.timer?.expired && g.timer.kind !== 'final') sfx.timeUp();
    // Final Jeopardy! think music (R4-3): starts when the clue is shown for writing, fades out when
    // answers close. Pausing fades it; resuming continues where the timer is.
    const writing = (v: GameView) => v.phase === 'final' && v.final?.stage === 'clue' && !v.paused;
    if (writing(g) && !writing(p)) {
      const t = g.timer;
      const elapsed = t?.kind === 'final' ? (t.durationMs - timerRemaining(t, serverNow())) / 1000 : 0;
      playCue('finalThink', { offsetSec: p.paused ? elapsed : 0 });
    } else if (!writing(g) && writing(p)) stopCue('finalThink', g.paused ? 300 : 800);
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

/** Room code players must type to join (only when the host requires it). */
function RoomCode({ g, className }: { g: GameView; className?: string }) {
  if (!g.rules.requireRoomCode || !g.roomCode) return null;
  return (
    <p className={cx('font-semibold', className)} data-testid="tv-room-code">
      Room code <span className="rounded-md bg-slate-900 px-[0.6em] py-[0.1em] font-mono font-black tracking-[0.3em] text-white">{g.roomCode}</span>
    </p>
  );
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
      <p className="text-[3vh] opacity-90">
        {status === 'open' ? 'Waiting for the host — create a lobby on the game computer to begin.' : 'Connecting…'}
      </p>
      {info && (
        <div className="flex items-center gap-[3vw] rounded-3xl bg-white p-[2.5vh] text-slate-900 shadow-2xl">
          <QrImage target="join" className="h-[26vh] w-[26vh]" />
          <div className="text-left">
            <p className="text-[3.2vh] font-bold">Players: scan to set up your profile</p>
            <p className="font-mono text-[2.2vh]">{info.urls.join}</p>
            <p className="mt-[2vh] text-[2vh] text-slate-600">Host controller (iPad): {info.urls.host}</p>
          </div>
        </div>
      )}
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

/** "Last seconds" cue: one soft tick per second for the final five seconds of a running timer. */
function useCountdownCue(g: GameView | null) {
  const secs = useTimerSeconds(g?.timer ?? null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const running = !!g?.timer?.running && !g.paused;
    if (running && secs != null && secs > 0 && secs <= 5 && secs !== last.current) playCue('countdown');
    last.current = secs;
  }, [secs, g?.timer?.running, g?.paused]);
}
