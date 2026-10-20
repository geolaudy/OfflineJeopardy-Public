// Live theme preview: the real TV components rendered with demo data, no game connection.
// The theme editor embeds this page in an iframe and sends the draft theme with postMessage,
// so the preview always matches what the TV will show.
// With ?live=1 the host controller embeds it instead (R5-12 / R5-14) and sends a game view: the
// current category introduction (with the TV's swipes) or a revealed answer, exactly as the TV
// formats it, and Final Jeopardy! (R9-6). Nothing here connects to the server or plays sound.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { GameView } from '../../../shared/views';
import { DEFAULT_RULES } from '../../../shared/game';
import { SAMPLE_BOARD } from '../../../shared/sampleBoards';
import type { CustomThemeData } from '../../../shared/themes';
import { BoardCtx, HOST_BAND, presentationFor, themeRoot, useViewportHeight } from './common';
import { Grid } from './Grid';
import { Scoreboard } from './Scoreboard';
import { CluePanel } from './ClueZoom';
import { Intro } from './Intro';
import { Stage, ThemeLogo, UserFonts, type PublicSettings } from './BoardPage';
import { FxCtx } from './fx';
import { DEFAULT_TV_FX, normalizeTvFx } from '../../../shared/tvFx';
import { configureSound } from '../../lib/sound';
import { useLive } from '../../lib/socket';
import './fonts.css';
import './board.css';

export type PreviewView = 'board' | 'clue' | 'intro' | 'title';
export interface PreviewMessage {
  type: 'oj-theme-preview';
  theme: string;
  custom: CustomThemeData | null;
  view: PreviewView;
}

function demoGame(view: PreviewView): GameView {
  const round = SAMPLE_BOARD.rounds[0];
  const used = new Set([round.categories[0].clues[1].id, round.categories[3].clues[0].id, round.categories[4].clues[2].id]);
  const clue = round.categories[1].clues[2];
  const profiles = {
    p1: { id: 'p1', name: 'Alex', nickname: '', color: '#2563eb', avatar: 'fox', pictureUrl: null },
    p2: { id: 'p2', name: 'Sam', nickname: '', color: '#dc2626', avatar: 'owl', pictureUrl: null },
    p3: { id: 'p3', name: 'Jordan', nickname: '', color: '#16a34a', avatar: 'panda', pictureUrl: null },
  };
  return {
    role: 'public',
    id: 'preview',
    title: 'Theme preview',
    mode: 'solo',
    phase: view === 'clue' ? 'clue' : 'board',
    paused: false,
    roundIndex: 0,
    rules: DEFAULT_RULES,
    rounds: SAMPLE_BOARD.rounds.map((r) => ({
      name: r.name,
      kind: r.kind,
      categories: r.categories.map((c) => ({ id: c.id, name: c.name, clues: c.clues.map((q) => ({ id: q.id, value: q.value, used: used.has(q.id) || (view === 'clue' && q.id === clue.id) })) })),
    })),
    competitors: Object.values(profiles).map((p, i) => ({ id: `c${i}`, kind: 'player' as const, profileId: p.id, name: '', color: p.color, buzzerMode: 'individual' as const, memberIds: [p.id], score: [1200, 800, -200][i] })),
    unassigned: [],
    bindings: [],
    controlCompetitorId: 'c0',
    clue:
      view === 'clue'
        ? { clueId: clue.id, categoryName: round.categories[1].name, value: clue.value, isDailyWager: false, stage: 'question', question: clue.question, answer: null, notes: null, media: [], wager: null, answerRevealed: false, resolved: false, answeringEnded: false, answerMedia: [], layout: 'auto', unlockMode: 'host' }
        : null,
    buzzer: { status: view === 'clue' ? 'open' : 'locked', openedAt: null, winner: null, queue: [], attemptedCompetitors: [], attemptedProfiles: [], early: [] },
    final: null,
    timer: null,
    media: null,
    intro: view === 'intro' ? { roundIndex: 0, step: 0, auto: false } : view === 'title' ? { roundIndex: 0, step: -1, auto: false } : null,
    practice: false,
    roomCode: null,
    showJoinQr: false,
    results: null,
    startedAt: null,
    endedAt: null,
    profiles,
  };
}

/** Sent by the host controller (pages/host/TvPreview.tsx) to /board/preview?live=1. */
export interface LivePreviewMessage {
  type: 'oj-live-preview';
  look: Pick<PublicSettings, 'theme' | 'custom' | 'tvFx' | 'fonts' | 'reducedMotion'>;
  /** The host's server clock offset, so "fresh" intro steps are judged like on the TV. */
  offset: number;
  game: GameView;
  scoreboard: boolean;
  /** R10-6: the host's preview — the score strip's place is kept empty for the host's controls
   *  and the timer bar is not drawn (the TV itself is unchanged). */
  band?: boolean;
}

/** R13-13: where the board's clue tiles are inside the preview (its own CSS pixels), sent back to
 *  the host so the tiles can be tapped through the preview, which itself takes no input. R14-18: the
 *  Final's player bubbles (`kind: 'final'`, id = the competitor) are reported the same way. */
export interface PreviewTilesMessage {
  type: 'oj-preview-tiles';
  tiles: { id: string; x: number; y: number; w: number; h: number; kind?: 'final' }[];
}

/** Reports the tiles' (or bubbles') boxes to the host whenever they change (new round, resize,
 *  fill-in) — again shortly after, for elements that are still sliding or fading in. */
function useTileReport(what: 'board' | 'final' | null, dep: unknown) {
  const last = useRef('');
  useLayoutEffect(() => {
    const send = () => {
      const sel = what === 'board' ? '[data-clue-id]' : what === 'final' ? '[data-final-chip]' : null;
      const tiles = sel
        ? [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
            const r = el.getBoundingClientRect();
            const box = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
            return what === 'final' ? { id: el.dataset.finalChip!, kind: 'final' as const, ...box } : { id: el.dataset.clueId!, ...box };
          })
        : [];
      const key = JSON.stringify(tiles);
      if (key === last.current) return;
      last.current = key;
      window.parent?.postMessage({ type: 'oj-preview-tiles', tiles } satisfies PreviewTilesMessage, location.origin);
    };
    send();
    const later = [400, 1000, 2000].map((ms) => setTimeout(send, ms));
    window.addEventListener('resize', send);
    return () => {
      later.forEach(clearTimeout);
      window.removeEventListener('resize', send);
    };
  }, [what, dep]);
}

export default function BoardPreview() {
  const live = useMemo(() => new URLSearchParams(location.search).get('live') === '1', []);
  return live ? <LivePreview /> : <ThemePreview />;
}

function LivePreview() {
  const [msg, setMsg] = useState<LivePreviewMessage | null>(null);
  const vh = useViewportHeight();
  useEffect(() => {
    configureSound({ enabled: false }); // the TV plays the sounds, never the host's preview
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as LivePreviewMessage)?.type !== 'oj-live-preview') return;
      const m = e.data as LivePreviewMessage;
      useLive.setState({ offset: m.offset });
      setMsg(m);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'oj-preview-ready' }, location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const look = msg?.look;
  const reduced = !!look?.reducedMotion;
  const ctx = useMemo(() => presentationFor(look?.theme ?? 'classic', look?.custom ?? null, reduced, vh), [look?.theme, look?.custom, reduced, vh]);
  const fx = useMemo(() => (look?.tvFx ? normalizeTvFx(look.tvFx) : DEFAULT_TV_FX), [look?.tvFx]);
  const fs = msg?.game.final?.stage;
  useTileReport(!msg?.band ? null : msg.game.phase === 'board' && !msg.game.intro ? 'board' : msg.game.phase === 'final' && (fs === 'wagers' || fs === 'clue' || fs === 'closed') ? 'final' : null, msg);
  if (!msg) return <div className="h-screen w-screen bg-black" />;
  const g = msg.game;
  const root = themeRoot(look?.theme ?? 'classic', look?.custom ?? null);
  return (
    <BoardCtx.Provider value={ctx}>
      <FxCtx.Provider value={fx}>
        <UserFonts fonts={look?.fonts} />
        <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
          <div className={`board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none${msg.band ? ' is-host-preview' : ''}`} data-theme={root.dataTheme} style={root.style} data-testid="live-preview-root" data-host-stage={g.phase === 'final' ? 'final' : g.phase === 'clue' ? 'clue' : 'board'}>
            <div className="relative min-h-0 flex-1">
              {/* R13-13: the TV's own stage — board fill-in, clue zoom, introduction swipes, Final. */}
              <Stage g={g} quietStart />
            </div>
            {msg.band ? <div className="bt-host-band-slot" style={{ height: `${HOST_BAND * 100}vh` }} aria-hidden /> : msg.scoreboard && <Scoreboard g={g} />}
          </div>
        </MotionConfig>
      </FxCtx.Provider>
    </BoardCtx.Provider>
  );
}

function ThemePreview() {
  const [msg, setMsg] = useState<PreviewMessage>({ type: 'oj-theme-preview', theme: 'classic', custom: null, view: 'board' });
  const vh = useViewportHeight();
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as PreviewMessage)?.type !== 'oj-theme-preview') return;
      setMsg(e.data as PreviewMessage);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'oj-preview-ready' }, location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const g = useMemo(() => demoGame(msg.view), [msg.view]);
  const ctx = useMemo(() => presentationFor(msg.theme, msg.custom, true, vh), [msg.theme, msg.custom, vh]);
  const root = themeRoot(msg.theme, msg.custom);
  return (
    <BoardCtx.Provider value={ctx}>
      <MotionConfig reducedMotion="always">
        <div className="board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none" data-theme={root.dataTheme} style={root.style} data-testid="theme-preview-root">
          <div className="relative min-h-0 flex-1">
            {msg.view === 'title' && (
              <div className="absolute top-[3vh] left-1/2 z-10 -translate-x-1/2">
                <ThemeLogo className="max-h-[14vh]" />
              </div>
            )}
            {g.intro ? <Intro g={g} /> : <Grid g={g} activeId={g.clue?.clueId ?? null} activeOpen={false} fillIn={false} />}
            {g.clue && <CluePanel g={g} closing={false} zoomIn={false} onClosed={() => {}} />}
          </div>
          <Scoreboard g={g} />
        </div>
      </MotionConfig>
    </BoardCtx.Provider>
  );
}
