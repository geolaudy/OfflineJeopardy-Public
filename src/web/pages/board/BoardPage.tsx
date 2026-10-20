// Public game board for the TV / projector. Receives only the public projection.
import { Maximize } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { connect, useLive, reconnectNow } from '../../lib/socket';
import { api, ensureLocalHost, tokens } from '../../lib/api';
import { QrImage, cx } from '../../components/ui';
import { configureSound, playCue, stopCue, unlockAudio } from '../../lib/sound';
import { DEFAULT_TV_FX, normalizeTvFx, type PackFiles, type TvFx } from '../../../shared/tvFx';
import { timerRemaining } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import type { PublicLobby } from '../../../shared/presentation';
import { useTimerSeconds } from '../../lib/view';
import { FxCtx } from './fx';
import { reannounce, startInputBridge } from '../../lib/inputBridge';
import type { GameView } from '../../../shared/views';
import { isDesktopApp } from '../../lib/desktop';
import { BoardCtx, presentationFor, themeRoot, useBoard, usePrefersReducedMotion, useViewportHeight } from './common';
import type { CustomTheme } from '../../../shared/themes';
import { Grid } from './Grid';
import { CluePanel } from './ClueZoom';
import { Intro } from './Intro';
import { transitionCues } from './soundCues';
import { FinalScreen } from './FinalScreen';
import { Scoreboard } from './Scoreboard';
import { Presenter } from './Presenter';
import { TvHome } from './TvHome';
import { EASE_OUT_ARR, T } from './timing';
import { PodiumResults } from './Podium';
import './fonts.css';
import './board.css';

export interface PublicSettings {
  theme: string;
  custom: CustomTheme | null;
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
  tvFx?: TvFx;
  packFiles?: PackFiles;
  /** Licensed fonts the owner added to the data folder (R4-17). */
  fonts?: Partial<Record<'clue' | 'category' | 'value', string>>;
}

const USER_FONT_FAMILY = { clue: 'OJ User Clue', category: 'OJ User Category', value: 'OJ User Value' } as const;

/** @font-face rules for the owner's font files; nothing is declared (or requested) when there are none. */
export function UserFonts({ fonts }: { fonts?: PublicSettings['fonts'] }) {
  const css = Object.entries(fonts ?? {})
    .map(([k, url]) => `@font-face{font-family:'${USER_FONT_FAMILY[k as keyof typeof USER_FONT_FAMILY]}';src:url('${url}');font-display:swap;}`)
    .join('');
  return css ? <style data-testid="user-fonts">{css}</style> : null;
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
      <UserFonts fonts={settings.fonts} />
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div
          className={cx('board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none', settings.reducedMotion && 'reduce-motion')}
          data-theme={root.dataTheme}
          style={root.style}
          onClick={unlockAudio}
        >
          {screen === 'splash' ? (
            <TvHome p={presented} status={status} hostUrl={info?.urls.host ?? null} logo={<ThemeLogo className="max-h-[14vh]" />} />
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
 * R13-13: the host's preview renders this same stage; `quietStart` (a preview that opens mid-game)
 * skips the fill-in of a board that is already showing, as the TV would not replay it either.
 */
export function Stage({ g, quietStart }: { g: GameView; quietStart?: boolean }) {
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
  const gridKey = `${g.id}:${g.roundIndex}`;
  // The grid mounted on the first render keeps quiet; any later mount (new round, after the
  // introduction) fills in. Stable for a mount, so the fill never starts mid-game.
  const quiet = useRef(quietStart && showGrid ? gridKey : null);
  if (quiet.current && (!showGrid || quiet.current !== gridKey)) quiet.current = null;

  return (
    <>
      {showGrid && <Grid key={gridKey} g={g} activeId={shown?.clue?.clueId ?? null} activeOpen={!!live} fillIn={quiet.current !== gridKey} />}
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
    for (const cue of transitionCues(p, g)) playCue(cue);
    // Final Jeopardy! think music (R4-3): starts when the clue is shown for writing, fades out when
    // answers close. Pausing fades it; resuming continues where the timer is. R9-6.4: a clue with
    // sound or video plays first (think time not begun), and the music never plays over it.
    const writing = (v: GameView) =>
      v.phase === 'final' && v.final?.stage === 'clue' && v.final.thinking !== false && !v.paused && !(v.media?.status === 'playing' && v.media.clueId === v.final.clueId);
    if (writing(g) && !writing(p)) {
      const t = g.timer;
      const elapsed = t?.kind === 'final' ? (t.durationMs - timerRemaining(t, serverNow())) / 1000 : 0;
      playCue('finalThink', { offsetSec: elapsed > 0.5 ? elapsed : 0 });
    } else if (!writing(g) && writing(p)) stopCue('finalThink', g.paused ? 300 : 800);
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

/** End of game: the podium (R5-10). */
function Results({ g }: { g: GameView }) {
  return <PodiumResults g={g} logo={<ThemeLogo className="max-h-[8vh]" />} />;
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
