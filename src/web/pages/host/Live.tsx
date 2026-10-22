// Live game control for the host (iPad landscape first, portrait supported): one frame for the
// whole game (GameFrame.tsx) with the TV preview, the stage's controls and the score cards.
// Board: the TV's board, tappable (R5-13, R13-13). Clue: HostClue.tsx (R5-14). Introduction: the
// categories in the header, Next / Previous / Auto / Stop Auto / Skip in the band (R5-12, R13-7).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, Lives, Modal, inputCls, cx, toast } from '../../components/ui';
import { hostApi } from '../../lib/api';
import { attempt, useMediaQuery } from '../../lib/hooks';
import { serverNow } from '../../lib/socket';
import { HostNavFooter, HostNavList, HostNavTitle } from './AppShell';
import { competitorAvatar, competitorColor, competitorHighlight, competitorName, findCompetitor } from '../../lib/view';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import FinalControl from './FinalControl';
import { HOST_SHORTCUTS, useHostShortcuts } from './shortcuts';
import { Undo2, Gamepad2, Play, Pause, ChevronLeft, ChevronRight, SlidersHorizontal, QrCode, Flag, Menu as MenuIcon, Save, ScrollText, Repeat, Power } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';
import { ClueStage } from './HostClue';
import { HostBoardHits, TvPreview, useBoardLook, type PreviewTile } from './TvMirror';
import { money, presentationFor } from '../board/common';
import ScoreEditor from './ScoreEditor';
import { FrameParts, FullscreenButton, GameFrame, HostFullscreenCtx, type FrameKind } from './GameFrame';
import { RichText } from '../../components/RichText';
import { scoreSample, useFitFontSize, widestScore } from '../../lib/scoreFit';
import { T } from '../board/timing';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
/**
 * R19-7: while a fresh round title's board fill plays in the preview, the host's area around the
 * picture keeps the board's ground (as the TV shows the fill); it turns to the panel surface when the
 * preview says the title has come in (TvMirror: 'oj-preview-intro') — or after the longest fill.
 */
function useRoundTitleFill(intro: GameView['intro']) {
  const key = intro && intro.step < 0 ? `${intro.roundIndex}:${intro.at ?? ''}` : null;
  // The preview's own rule (Intro.tsx): the fill plays only when the title was just started.
  const fresh = useMemo(() => !!key && (intro!.at == null || serverNow() - intro!.at < 2500), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !fresh) return;
    const onIntro = () => setDone(key);
    window.addEventListener('oj-preview-intro', onIntro);
    const t = setTimeout(onIntro, 7000);
    return () => {
      window.removeEventListener('oj-preview-intro', onIntro);
      clearTimeout(t);
    };
  }, [key, fresh]);
  return !!key && fresh && done !== key;
}

const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null;
/** R19-11: iPad / iPhone (iPadOS reports itself as a Mac with touch): Safari's real full screen draws
 *  its own close button over the top-left corner of the page. */
const appleTouch = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/**
 * R11-3: the host controller full screen. The browser's Fullscreen API where it is available (the
 * whole live screen — preview, controls and scores — becomes the screen); where it is not (iPhone
 * Safari, some installed web apps) the live screen covers the browser window instead. The same
 * component tree stays mounted either way, so nothing about the game changes when switching.
 */
function useHostFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const native = useRef(false);
  // R19-11: the browser's real full screen is on (not the window-filling layout).
  const [nativeOn, setNativeOn] = useState(false);
  useEffect(() => {
    const onChange = () => {
      setNativeOn(!!fullscreenElement() && native.current);
      if (!fullscreenElement() && native.current) {
        native.current = false;
        setNativeOn(false);
        setOn(false); // left with Esc or the system's own control
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const exitNative = () => {
    native.current = false;
    setNativeOn(false);
    const d = document as FsDocument;
    if (!fullscreenElement()) return;
    void Promise.resolve((d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)).catch(() => undefined);
  };
  // Esc leaves full screen (the browser usually handles it in real full screen; when the key still
  // reaches the page, leave both) — unless a dialog is open, which Esc closes first.
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setOn(false);
      exitNative();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
  // Leaving the live screen (game over, switching games) leaves full screen too.
  useEffect(() => () => exitNative(), []);
  // Back from full screen, the page is where it was (a phone may have scrolled it meanwhile).
  const scroll = useRef<{ win: number; els: [Element, number][] } | null>(null);
  useLayoutEffect(() => {
    const saved = scroll.current;
    if (on || !saved) return;
    scroll.current = null;
    for (const [el, top] of saved.els) el.scrollTop = top;
    window.scrollTo(0, saved.win);
  }, [on]);
  const toggle = useCallback(() => {
    if (on) {
      setOn(false);
      exitNative();
      return;
    }
    const els: [Element, number][] = [];
    for (let el = ref.current?.parentElement ?? null; el; el = el.parentElement) if (el.scrollTop) els.push([el, el.scrollTop]);
    ref.current?.querySelectorAll('.overflow-auto').forEach((el) => els.push([el, el.scrollTop]));
    scroll.current = { win: window.scrollY, els };
    setOn(true);
    const el = ref.current as FsElement | null;
    const req = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
    if (!el || !req) return;
    try {
      void Promise.resolve(req.call(el)).then(
        () => {
          native.current = true;
          setNativeOn(true);
        },
        () => undefined, // refused: the window-filling layout stays
      );
    } catch {
      // not allowed here: the window-filling layout stays
    }
  }, [on, ref]);
  return useMemo(() => ({ on, native: on && nativeOn, toggle }), [on, nativeOn, toggle]);
}

/** The game menu's dialogs, which live on the host's home page (HostPage.tsx). */
export interface LiveMenu {
  rules: () => void;
  log: () => void;
  switchGame?: () => void;
  closeLobby?: () => void;
}

export default function Live({ g, run, menu }: { g: GameView; run: Run; menu?: LiveMenu }) {
  const [adjust, setAdjust] = useState<CompetitorView | null>(null);
  const [devices, setDevices] = useState(false);
  const [nav, setNav] = useState(false);
  // R14-14: the menu slides closed (the reverse of opening) before it unmounts.
  const [navClosing, setNavClosing] = useState(false);
  const [tiles, setTiles] = useState<PreviewTile[]>([]);
  useHostShortcuts(g, run);
  const rootRef = useRef<HTMLDivElement>(null);
  const full = useHostFullscreen(rootRef);
  const titleFill = useRoundTitleFill(g.intro);
  // A short screen (a phone in landscape) gets the compact header, band and cards (R12-3).
  const compact = useMediaQuery('(max-height: 560px)');
  useEffect(() => {
    setNav(false);
    setNavClosing(false);
  }, [full.on]);
  const onDevices = useCallback(() => setDevices(true), []);
  const fs = useMemo(() => ({ ...full, compact }), [full, compact]);
  const kind: FrameKind = g.phase === 'final' && g.final ? 'final' : g.phase === 'board' && g.intro ? 'intro' : g.phase === 'clue' && g.clue ? 'clue' : 'board';
  return (
    <HostFullscreenCtx.Provider value={fs}>
      <div
        ref={rootRef}
        // R12-3 / R13-2: the same frame in both views; full screen only gives it the whole screen
        // (fixed, edge to edge, the safe areas kept clear inside the header and the score row).
        className={cx('host-live flex h-full flex-col', fs.on ? 'host-fullscreen fixed inset-0 z-[45] overflow-hidden' : 'relative')}
        data-testid="host-live"
        data-fullscreen={fs.on ? 'true' : 'false'}
        // R19-11: Safari's own close button sits over the header's left end in its real full screen.
        data-native-fs={fs.native && appleTouch() ? 'apple' : undefined}
        // R17-3: typing in the band (a Daily Double! wager) lifts the frame above the keyboard instead
        // of shrinking it (lib/keyboard) — the TV picture keeps its size.
        data-kb-lift
      >
        <GameFrame
          kind={kind}
          timer={g.timer}
          // R17-17 / R18-5: the introduction (the round title and its categories) shows on the clue
          // panel's surface, edge to edge; the playable board keeps its own frame. R19-7: the round
          // title's board fill first, on the board's ground.
          panel={kind === 'clue' || kind === 'final' || (kind === 'intro' && !titleFill)}
          clueId={g.clue?.clueId ?? null}
          scoreCount={g.competitors.length}
          // The one TV preview of the game (R13-13): the TV's own board, introduction, clue and Final.
          preview={(size, testId) => <TvPreview game={g} scoreboard={false} band frameless title="TV preview" size={size} testId={testId} onTiles={setTiles} />}
          scores={(m) => <ScoreCards g={g} run={run} onAdjust={setAdjust} {...m} />}
          // R13-2: the same header in both views — the menu slides over the game in either.
          start={
            <button type="button" className="host-icon-btn" onClick={() => {
                setNav(true);
                setNavClosing(false);
              }}
              aria-label="Open menu" aria-expanded={nav} data-testid="fs-menu-toggle">
              <MenuIcon size={28} strokeWidth={2.4} aria-hidden />
            </button>
          }
          end={
            <>
              <GameOptions g={g} run={run} onDevices={onDevices} menu={menu} compact={compact} />
              <FullscreenButton />
            </>
          }
        >
          {kind === 'final' ? <FinalControl g={g} run={run} tiles={tiles} /> : kind === 'intro' ? <IntroStage g={g} run={run} /> : kind === 'clue' ? <ClueStage g={g} run={run} /> : <BoardStage g={g} run={run} tiles={tiles} />}
        </GameFrame>
        {nav && (
          <FullscreenMenu
            closing={navClosing}
            onClose={() => setNavClosing(true)}
            onClosed={() => {
              setNav(false);
              setNavClosing(false);
            }}
          />
        )}
        {adjust && <ScoreEditor g={g} c={g.competitors.find((x) => x.id === adjust.id) ?? adjust} run={run} onClose={() => setAdjust(null)} />}
        <Modal open={devices} onClose={() => setDevices(false)} title="Buzzers & controllers" wide>
          <ControllersPanel g={g} />
        </Modal>
        <AssignListener g={g} />
      </div>
    </HostFullscreenCtx.Provider>
  );
}

/**
 * R12-7 / R13-5 / R14-2: the score cards, centred as a group under the game (Undo at the right end,
 * the same width kept free at the left while the cards have room). The section is the same height
 * for 1 … 12 players: up to six cards in one row, then two rows of up to six; the cards get narrower
 * (narrow cards show the colour as a dot instead of the picture). The
 * player's colour is the ring around their picture. R14-3: one score size for all cards, fitted to
 * the widest score the game can reach.
 */
function ScoreCards({ g, run, onAdjust, cardW, cardH, cardMin, rows, wide, pic }: { g: GameView; run: Run; onAdjust: (c: CompetitorView) => void; cardW: number; cardH: number; cardMin: number; rows: number; wide: boolean; pic: boolean }) {
  // The card's inner scale (picture, paddings, type): its height, but never more than its width
  // allows — a tall card in a single row must not squeeze the name and score (R14-2).
  const unit = Math.min(cardH, cardW * 0.5);
  const first = useRef<HTMLSpanElement>(null);
  // R19-9: scores as the TV writes them ("$1,400", "−$400": the theme's prefix); the size is fitted to
  // the widest score with that prefix, so the currency sign never pushes a score out of its card.
  const look = useBoardLook();
  const prefix = presentationFor(look.theme, look.custom, true, 0).prefix;
  const fs = useFitFontSize(first, scoreSample(prefix, widestScore(g)), Math.max(16.8, Math.min(33.6, unit * 0.36)), 0.96);
  // Exactly the planned number of cards per line (12 = 6 + 6, 9 = 5 + 4), however wide the cards are.
  const inRow = Math.max(1, Math.ceil(g.competitors.length / rows));
  // The picture leaves the name most of a narrow card (a tall single row must not squeeze it).
  const avatar = Math.round(Math.max(24, Math.min(64, unit * 0.62, cardW * 0.22)));
  return (
    <footer
      className="host-scores @container h-full"
      style={{ '--card-w': `${cardW}px`, '--card-h': `${cardH}px`, '--card-u': `${unit}px`, '--card-min': `${cardMin}px`, '--row-max': `${inRow * cardW + (inRow - 1) * 6 + 9}px`, ...(fs ? { '--score-fs': `${fs}px` } : {}) } as CSSProperties}
      data-testid="host-scores"
      data-rows={rows}
      data-pic={pic ? 'true' : 'false'}
    >
      <div className={cx('host-scores-grid', wide && 'is-wide')}>
        {/* The scroller clips everything outside its padding box: the padding leaves room for the
            highlight ring (R6-2.2), which is never shrunk to fit. */}
        <div className="host-scores-row" data-testid="host-score-row">
          {g.competitors.map((c, i) => {
            const hl = competitorHighlight(g, c.id);
            return (
              <button
                key={c.id}
                onClick={() => onAdjust(c)}
                className={cx('host-score-card', c.lives === 0 && 'opacity-50')}
                style={{ '--pc': competitorColor(c, g) } as CSSProperties}
                aria-label={`Adjust score for ${competitorName(c, g)}`}
                title={competitorName(c, g)}
                data-testid="host-score"
                data-highlight={hl ?? undefined}
              >
                {pic ? (
                  <span className="host-score-pic" data-testid="host-score-pic">
                    <Avatar profile={competitorAvatar(c, g)} size={avatar} />
                  </span>
                ) : (
                  <span className="host-score-dot" data-testid="host-score-pic" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="host-score-name">{competitorName(c, g)}</span>
                  {/* The first score is the one measured (its own heavy weight; every score has the same width). */}
                  <span ref={i === 0 ? first : undefined} className={cx('host-score-value', c.score < 0 && 'is-negative')}>
                    {money(prefix, c.score)}
                  </span>
                  {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={13} /> : <span className="text-xs font-bold text-slate-500 uppercase">Out</span>)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="host-scores-undo flex items-center justify-end">
          <ActionButton variant="secondary" disabled={!g.undoLabel} onAction={() => run({ type: 'undo' })} className="host-btn host-undo" title={g.undoLabel ? `Undo: ${g.undoLabel}` : undefined} data-testid="undo">
            <span className="flex items-center gap-1.5">
              <Undo2 size={18} aria-hidden /> Undo
            </span>
            {g.undoLabel && <span className="host-undo-what">{g.undoLabel}</span>}
          </ActionButton>
        </div>
      </div>
    </footer>
  );
}

/** R12-4: the host's navigation sliding over the game from the left (the game keeps its size); ‹,
 *  Esc or a tap beside it closes it. Inside the live screen (and so inside the full-screen element,
 *  where it also shows when the browser's own full screen is on). R14-14: `closing` slides it back
 *  out (the opening animation reversed); `onClosed` follows when it is gone. */
function FullscreenMenu({ onClose, closing, onClosed }: { onClose: () => void; closing: boolean; onClosed: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const closed = useRef(onClosed);
  closed.current = onClosed;
  useEffect(() => {
    if (!closing) return;
    // animationend ends it; the timer covers reduced motion (no animation runs).
    const t = setTimeout(() => closed.current(), 320);
    return () => clearTimeout(t);
  }, [closing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={cx('absolute inset-0 z-[60]', closing && 'pointer-events-none')} onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-testid="fs-menu-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && closed.current()}
        data-state={closing ? 'closing' : 'open'}
        className={cx('host-fs-menu drawer-panel flex h-full w-[min(20rem,85vw)] flex-col gap-3 bg-white p-3 text-slate-900 shadow-2xl', closing && 'is-closing')}
        style={{ paddingTop: 'max(0.75rem, var(--safe-top))', paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        data-testid="fs-menu"
      >
        <div className="flex items-start gap-2 px-2">
          <div className="min-w-0 flex-1">
            <HostNavTitle />
          </div>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100 active:bg-slate-200" aria-label="Close menu" data-testid="fs-menu-close">
            <ChevronLeft size={34} strokeWidth={2.6} aria-hidden />
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1">
          <HostNavList />
        </div>
        <HostNavFooter />
      </div>
    </div>
  );
}

/** R5-13 / R13-13: "{Player} is choosing a clue" in the header; the TV's own board in the preview,
 *  its tiles tappable through HostBoardHits. */
function BoardStage({ g, run, tiles }: { g: GameView; run: Run; tiles: PreviewTile[] }) {
  const round = g.rounds[g.roundIndex];
  const [played, setPlayed] = useState<string | null>(null);
  const { hasFinal, remaining, next } = roundInfo(g);
  const picker = findCompetitor(g, g.controlCompetitorId);
  if (!round || round.kind !== 'standard') return null;
  const q = played ? round.categories.flatMap((c) => c.clues).find((x) => x.id === played) : null;
  return (
    <>
      <FrameParts
        // R11-3.3: who is choosing, in the header; the board in the TV's blue area.
        head={
          <div className="host-head-status">
            <h2 className="host-band-title host-head-title" data-testid="choosing">
              {remaining === 0 ? 'This round is complete' : picker ? `${competitorName(picker, g)} is choosing a clue` : 'Choose a clue'}
            </h2>
            <p className="host-head-sub">
              {round.name} · {remaining === 0 ? 'every clue has been played' : `${remaining} ${remaining === 1 ? 'clue' : 'clues'} left`}
              {picker?.bot && remaining > 0 ? ' · picks by itself' : ''}
            </p>
          </div>
        }
        stage={(size) => <HostBoardHits g={g} tiles={tiles} scale={size.w / 1280} onTile={(id, used) => (used ? setPlayed(id) : run({ type: 'selectClue', clueId: id }))} />}
        bar={
          <div className="flex flex-wrap items-center gap-2">
            <p className="host-band-status min-w-0 flex-1 px-1">{remaining === 0 ? 'Every clue in this round has been played.' : 'Tap a clue on the board to open it.'}</p>
            {/* The next step appears only when the round is finished; earlier it lives in Options. */}
            {remaining === 0 && next && (
              <ActionButton size="lg" className="host-btn host-btn-main" onAction={() => run({ type: 'setRound', roundIndex: next.i })} data-testid="next-round">
                Next: {next.name} <ChevronRight size={20} aria-hidden />
              </ActionButton>
            )}
            {remaining === 0 && !next && hasFinal && (
              <ActionButton size="lg" className="host-btn host-btn-main" onAction={() => run({ type: 'startFinal' })} data-testid="start-final">
                <Flag size={20} aria-hidden /> Start Final Jeopardy!
              </ActionButton>
            )}
          </div>
        }
      />
      {played && (
        <Modal open onClose={() => setPlayed(null)} title="Played clue">
          <div className="space-y-3">
            <p className="text-lg">
              <RichText text={q?.question ?? ''} />
            </p>
            <AnswerBanner answer={q?.answer ? <RichText text={q.answer} /> : undefined} />
            <Button
              variant="secondary"
              disabled={g.phase !== 'board'}
              onClick={async () => {
                await run({ type: 'restoreClue', clueId: played });
                setPlayed(null);
              }}
            >
              Put back on the board
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** The round's progress: playable rounds, the next one, the Final, clues left in this one. */
function roundInfo(g: GameView) {
  const round = g.rounds[g.roundIndex];
  const standard = g.rounds.map((r, i) => ({ name: r.name, kind: r.kind, i })).filter((r) => r.kind === 'standard');
  return {
    standard,
    hasFinal: g.rounds.some((r) => r.kind === 'final'),
    remaining: round?.categories.reduce((a, c) => a + c.clues.filter((q) => !q.used).length, 0) ?? 0,
    next: standard.find((r) => r.i > g.roundIndex),
  };
}

/**
 * Options: Pause / Resume, round changes (on the board only), buzzers, the join QR, the introduction,
 * Rules & timers, Event history, Save now, End game, Switch game and Close lobby. R14-9: the same
 * dialog in the embedded view and in full screen (the page's own header with Pause and the game menu
 * is hidden while a game is played).
 */
function GameOptions({ g, run, onDevices, menu, compact }: { g: GameView; run: Run; onDevices: () => void; menu?: LiveMenu; compact?: boolean }) {
  const { standard, hasFinal, remaining, next } = roundInfo(g);
  const onBoard = g.phase === 'board' && !g.intro;
  const [options, setOptions] = useState(false);
  return (
    <>
      <button type="button" className="host-ghost-btn" onClick={() => setOptions(true)} aria-label="Options" data-testid="game-options">
        <SlidersHorizontal size={22} strokeWidth={2.4} aria-hidden /> <span className={cx(compact && 'sr-only')}>Options</span>
      </button>
      <Modal open={options} onClose={() => setOptions(false)} title="Game options">
        <div className="grid gap-2">
          <ActionButton size="lg" variant={g.paused ? 'warning' : 'secondary'} onAction={() => run({ type: g.paused ? 'resumeGame' : 'pauseGame' })} data-testid="option-pause">
            {g.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />} {g.paused ? 'Resume game' : 'Pause game'}
          </ActionButton>
          {onBoard && next && (
            <ActionButton
              size="lg"
              variant="secondary"
              onAction={async () => {
                if (remaining > 0 && !confirm(`Skip to ${next.name}? ${remaining} clues are still unplayed.`)) return;
                setOptions(false);
                await run({ type: 'setRound', roundIndex: next.i });
              }}
              data-testid="option-next-round"
            >
              Next round: {next.name} <ChevronRight size={18} aria-hidden />
            </ActionButton>
          )}
          {onBoard && standard.length > 1 && (
            <label className="text-sm font-semibold text-slate-600">
              Jump to round
              <select
                className={inputCls}
                value={g.roundIndex}
                onChange={async (e) => {
                  const i = Number(e.target.value);
                  if (i === g.roundIndex || !confirm(`Go to ${g.rounds[i]?.name}?`)) return;
                  setOptions(false);
                  await run({ type: 'setRound', roundIndex: i });
                }}
                aria-label="Jump to round"
              >
                {standard.map((r) => (
                  <option key={r.i} value={r.i}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onBoard && hasFinal && (
            <ActionButton
              size="lg"
              variant="secondary"
              onAction={async () => {
                if (!confirm('Start Final Jeopardy! now?' + (remaining ? ` ${remaining} clues are still unplayed.` : ''))) return;
                setOptions(false);
                await run({ type: 'startFinal' });
              }}
              data-testid="option-start-final"
            >
              <Flag size={18} aria-hidden /> Start Final Jeopardy!
            </ActionButton>
          )}
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              setOptions(false);
              onDevices();
            }}
          >
            <Gamepad2 size={18} aria-hidden /> Buzzers & controllers
          </Button>
          <Button size="lg" variant="secondary" onClick={() => run({ type: 'showJoinQr', show: !g.showJoinQr })} data-testid="option-qr">
            <QrCode size={18} aria-hidden /> {g.showJoinQr ? 'Hide' : 'Show'} join QR code on TV
          </Button>
          {onBoard && (
            <Button
              size="lg"
              variant="secondary"
              onClick={async () => {
                setOptions(false);
                await run({ type: 'startIntro' });
              }}
              data-testid="intro-start"
            >
              <Play size={18} aria-hidden /> Replay the category introduction
            </Button>
          )}
          {menu && (
            <>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  setOptions(false);
                  menu.rules();
                }}
              >
                <SlidersHorizontal size={18} aria-hidden /> Rules & timers
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  setOptions(false);
                  menu.log();
                }}
              >
                <ScrollText size={18} aria-hidden /> Event history
              </Button>
            </>
          )}
          <Button
            size="lg"
            variant="secondary"
            onClick={async () => {
              if (await attempt(() => hostApi<{ savedAt: number }>('POST', '/api/games/save'))) toast('Game saved', 'success');
            }}
          >
            <Save size={18} aria-hidden /> Save now <span className="text-sm font-normal text-slate-500">(also saves automatically)</span>
          </Button>
          <Button
            size="lg"
            variant="danger"
            onClick={async () => {
              if (!confirm('End the game now and show the results?')) return;
              setOptions(false);
              await run({ type: 'endGame' });
            }}
            data-testid="option-end-game"
          >
            <Flag size={18} aria-hidden /> End game
          </Button>
          {menu?.switchGame && (
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                setOptions(false);
                menu.switchGame!();
              }}
              data-testid="switch-game"
            >
              <Repeat size={18} aria-hidden /> Switch game (this one stays saved)
            </Button>
          )}
          {menu?.closeLobby && (
            <Button size="lg" variant="ghost" className="text-red-700" onClick={menu.closeLobby} data-testid="close-lobby">
              <Power size={18} aria-hidden /> Close lobby
            </Button>
          )}
          <p className="text-sm text-slate-500">To give board control to someone else, tap their score at the bottom of the screen.</p>
          <details className="hidden rounded-xl border border-slate-200 p-3 text-sm text-slate-600 [@media(pointer:fine)]:block">
            <summary className="cursor-pointer font-semibold">⌨ Keyboard shortcuts</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {HOST_SHORTCUTS.map(([k, d]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 font-mono text-xs">{k}</kbd>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </Modal>
    </>
  );
}

/**
 * Category introduction (R4-16, R5-12, R13-7): while it runs the clue board is hidden from the host,
 * so no clue can be opened by accident. The header says what is happening and holds the categories
 * — tap one to show it on the TV (one swipe, forward or back); the TV preview shows which one is on
 * screen, so the header does not repeat it. The band: Previous | Next, Auto (server-paced) / Stop
 * Auto, Skip.
 */
function IntroStage({ g, run }: { g: GameView; run: Run }) {
  const intro = g.intro!;
  const round = g.rounds[intro.roundIndex];
  if (!round) return null;
  const n = round.categories.length;
  const nextLabel = intro.step < 0 ? 'Show First Category' : intro.step >= n - 1 ? 'Done — show the board' : 'Next Category';
  return (
    <FrameParts
      head={
        <div className="host-intro-head" data-testid="intro-now">
          <h2 className="host-band-title host-intro-title">
            Introduce the categories{intro.auto ? <span className="host-intro-auto"> · auto</span> : null}
          </h2>
          <ol className="host-intro-cats" style={{ '--n': n } as CSSProperties} aria-label="Categories — tap one to show it on the TV">
            {round.categories.map((c, i) => (
              <li key={c.id} className="min-w-0">
                <button
                  onClick={() => run({ type: 'introGoto', step: i })}
                  aria-current={i === intro.step ? 'step' : undefined}
                  aria-label={`Show ${c.name || `Category ${i + 1}`} on the TV`}
                  className={cx('host-intro-cat', i === intro.step ? 'is-current' : i < intro.step && 'is-done')}
                  data-testid="intro-cat"
                >
                  <span className="line-clamp-2 [overflow-wrap:normal] hyphens-auto">{c.name || `Category ${i + 1}`}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      }
      bar={<IntroBar g={g} run={run} nextLabel={nextLabel} />}
    />
  );
}

/**
 * The introduction's band (R6-2.3). R17-17.5 / R18-6: one clear order of importance — Next Category
 * (Show First Category before the first one) is the band's main action at its far right, where every
 * stage keeps its next step; Previous Category a quieter button right beside it on its left; Auto
 * Present (a labelled switch) and Skip Category Presentation (a text action) stay visible, small, in
 * a group of their own at the band's left end. After
 * each step Previous / Next rest for the TV's swipe, so quick taps never start swipes on top of
 * each other (a tap during the rest waits for it).
 */
function IntroBar({ g, run, nextLabel }: { g: GameView; run: Run; nextLabel: string }) {
  const intro = g.intro!;
  const resting = useStepRest(`${intro.roundIndex}:${intro.step}`);
  return (
    <div className="host-intro-bar" data-testid="intro-bar">
      <div className="host-intro-utils">
        <button
          type="button"
          role="switch"
          aria-checked={intro.auto}
          className="host-intro-switch"
          onClick={() => run(intro.auto ? { type: 'introStopAuto' } : { type: 'startIntro', auto: true })}
          title={intro.auto ? 'Stop presenting automatically' : 'Present the categories automatically'}
          data-testid={intro.auto ? 'intro-stop-auto' : 'intro-auto'}
        >
          <span className="host-intro-switch-track" aria-hidden>
            <span className="host-intro-switch-knob" />
          </span>
          Auto Present
        </button>
        <button type="button" className="host-intro-skip" onClick={() => run({ type: 'introSkip' })} data-testid="intro-skip">
          Skip Category Presentation
        </button>
      </div>
      <div className="host-intro-steps">
        <ActionButton size="lg" variant="ghost" className="host-btn host-intro-prev" disabled={intro.step < 0 || resting} data-resting={resting || undefined} onAction={() => run({ type: 'introPrev' })} aria-label="Previous Category" data-testid="intro-prev">
          <ChevronLeft size={22} aria-hidden /> <span className="host-intro-prev-label">Previous</span>
        </ActionButton>
        <ActionButton size="lg" className="host-btn host-btn-main host-intro-next" disabled={resting} data-resting={resting || undefined} onAction={() => run({ type: 'introNext' })} data-testid="intro-next">
          {nextLabel} <ChevronRight size={24} aria-hidden />
        </ActionButton>
      </div>
    </div>
  );
}

/** True for the TV's swipe time after the introduction's step changes (R17-17.5). */
function useStepRest(key: string) {
  const [resting, setResting] = useState(false);
  const first = useRef(key);
  useEffect(() => {
    if (key === first.current) return;
    first.current = key;
    setResting(true);
    const t = setTimeout(() => setResting(false), T_SLIDE_MS);
    return () => clearTimeout(t);
  }, [key]);
  return resting;
}
const T_SLIDE_MS = T.slide * 1000;
