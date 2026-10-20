// Live game control for the host (iPad landscape first, portrait supported).
// Board: a replica of the TV board (R5-13). Clue: HostClue.tsx (R5-14). Introduction: category
// list, live TV preview and Next / Previous / Auto / Stop Auto / Skip (R5-12).
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, Lives, Modal, inputCls, cx, fmtScore, toast } from '../../components/ui';
import { hostApi } from '../../lib/api';
import { attempt, useMediaQuery } from '../../lib/hooks';
import { themeRoot } from '../board/common';
import { HostNavFooter, HostNavList, HostNavTitle } from './AppShell';
import { competitorAvatar, competitorColor, competitorHighlight, competitorName, findCompetitor } from '../../lib/view';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import FinalControl from './FinalControl';
import { HOST_SHORTCUTS, useHostShortcuts } from './shortcuts';
import { Undo2, Gamepad2, Play, Pause, ChevronLeft, ChevronRight, ChevronsRight, Square, SlidersHorizontal, QrCode, Flag, Menu as MenuIcon, Save, ScrollText } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';
import { ClueStage } from './HostClue';
import { HostBoardGrid, TvPreview, useBoardLook } from './TvMirror';
import ScoreEditor from './ScoreEditor';
import { FullscreenButton, GameFrame, HostFullscreenCtx } from './GameFrame';
import { RichText } from '../../components/RichText';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null;

/**
 * R11-3: the host controller full screen. The browser's Fullscreen API where it is available (the
 * whole live screen — preview, controls and scores — becomes the screen); where it is not (iPhone
 * Safari, some installed web apps) the live screen covers the browser window instead. The same
 * component tree stays mounted either way, so nothing about the game changes when switching.
 */
function useHostFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const native = useRef(false);
  useEffect(() => {
    const onChange = () => {
      if (!fullscreenElement() && native.current) {
        native.current = false;
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
        () => (native.current = true),
        () => undefined, // refused: the window-filling layout stays
      );
    } catch {
      // not allowed here: the window-filling layout stays
    }
  }, [on, ref]);
  return useMemo(() => ({ on, toggle }), [on, toggle]);
}

/** The game menu's dialogs, which live on the host's home page (HostPage.tsx). */
export interface LiveMenu {
  rules: () => void;
  log: () => void;
}

export default function Live({ g, run, menu }: { g: GameView; run: Run; menu?: LiveMenu }) {
  const [adjust, setAdjust] = useState<CompetitorView | null>(null);
  const [devices, setDevices] = useState(false);
  const [nav, setNav] = useState(false);
  useHostShortcuts(g, run);
  const rootRef = useRef<HTMLDivElement>(null);
  const full = useHostFullscreen(rootRef);
  // A short screen (a phone in landscape) has no room for a top bar above the game (R12-3).
  const compact = useMediaQuery('(max-height: 560px)');
  useEffect(() => {
    if (!full.on) setNav(false);
  }, [full.on]);
  const look = useBoardLook();
  const theme = themeRoot(look.theme, look.custom);
  const onDevices = useCallback(() => setDevices(true), []);
  const menuButton = (
    <button type="button" className={cx('host-icon-btn shrink-0', compact ? 'h-11 w-11' : 'h-12 w-12')} onClick={() => setNav(true)} aria-label="Open menu" aria-expanded={nav} data-testid="fs-menu-toggle">
      <MenuIcon size={26} strokeWidth={2.4} aria-hidden />
    </button>
  );
  const topRight = (
    <>
      <GameOptions g={g} run={run} onDevices={onDevices} menu={menu} all compact={compact} />
      <FullscreenButton className={compact ? 'h-11 w-11' : 'h-12 w-12'} />
    </>
  );
  const fs = { ...full, compact, corners: compact ? { left: menuButton, right: <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{topRight}</div> } : undefined };
  return (
    <HostFullscreenCtx.Provider value={fs}>
    <div
      ref={rootRef}
      // R12-3: full screen is edge to edge — the TV's blue behind everything, no page margin, no
      // scroll container.
      className={cx('flex h-full flex-col', fs.on && 'host-fullscreen board-theme fixed inset-0 z-[45] overflow-hidden')}
      data-theme={fs.on ? theme.dataTheme : undefined}
      style={fs.on ? theme.style : undefined}
      data-testid="host-live"
      data-fullscreen={fs.on ? 'true' : 'false'}
    >
      {fs.on && !compact && (
        <div className="host-fs-top flex shrink-0 items-center gap-2" data-testid="fs-top">
          {menuButton}
          <div className="flex-1" />
          {topRight}
        </div>
      )}
      <div className={cx('min-h-0 flex-1', fs.on ? 'relative overflow-hidden' : 'overflow-auto p-2 sm:p-3')}>
        {g.phase === 'final' ? (
          <FinalControl g={g} run={run} />
        ) : g.phase === 'board' && g.intro ? (
          <IntroStage g={g} run={run} />
        ) : g.phase === 'clue' && g.clue ? (
          <ClueStage g={g} run={run} />
        ) : (
          <BoardStage g={g} run={run} onDevices={onDevices} menu={menu} />
        )}
      </div>
      <ScoreCards g={g} run={run} onAdjust={setAdjust} compact={fs.on && compact} />
      {fs.on && nav && <FullscreenMenu onClose={() => setNav(false)} />}
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
 * R12-7: the score cards, centred as a group under the game (Undo at the right end, the same width
 * kept free at the left so the group stays centred). Many players: the cards get narrower, then
 * the row scrolls sideways — names and scores are never cut by the screen edge.
 */
function ScoreCards({ g, run, onAdjust, compact }: { g: GameView; run: Run; onAdjust: (c: CompetitorView) => void; compact?: boolean }) {
  return (
    <footer className={cx('host-scores @container shrink-0', compact && 'is-compact')} data-testid="host-scores">
      <div className="host-scores-grid">
        {/* The scroller clips everything outside its padding box: the padding leaves room for the
            highlight ring (R6-2.2), which is never shrunk to fit. */}
        <div className="host-scores-row flex min-w-0 items-stretch justify-center-safe gap-2 overflow-x-auto p-1.5" data-testid="host-score-row">
          {g.competitors.map((c) => {
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
                <Avatar profile={competitorAvatar(c, g)} size={compact ? 26 : 34} />
                <div className="min-w-0">
                  <div className="truncate text-sm leading-tight font-semibold">{competitorName(c, g)}</div>
                  <div className={cx('text-xl leading-tight font-black tabular-nums', c.score < 0 && 'text-red-700')}>{fmtScore(c.score)}</div>
                  {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={13} /> : <span className="text-xs font-bold text-slate-500 uppercase">Out</span>)}
                </div>
              </button>
            );
          })}
        </div>
        <div className="host-scores-undo flex items-center justify-end">
          <ActionButton variant="secondary" disabled={!g.undoLabel} onAction={() => run({ type: 'undo' })} className="host-btn min-h-12 shrink-0 px-4" data-testid="undo">
            <Undo2 size={18} aria-hidden /> Undo{g.undoLabel ? <span className="hidden text-sm font-normal text-slate-500 @5xl:inline">({g.undoLabel})</span> : null}
          </ActionButton>
        </div>
      </div>
    </footer>
  );
}

/** R12-4: the host's navigation sliding over the full-screen game from the left (the game keeps its
 *  size); ‹, Esc or a tap beside it closes it. Inside the full-screen element, so it also shows when
 *  the browser's own full screen is on. */
function FullscreenMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="absolute inset-0 z-[60]" onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-testid="fs-menu-backdrop">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Menu" className="host-fs-menu drawer-panel flex h-full w-[min(20rem,85vw)] flex-col gap-3 bg-white p-3 text-slate-900 shadow-2xl" style={{ paddingTop: 'max(0.75rem, var(--safe-top))', paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }} data-testid="fs-menu">
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

/** R5-13: "{Player} is choosing a clue" above a replica of the TV board (tiles are buttons). */
function BoardStage({ g, run, onDevices, menu }: { g: GameView; run: Run; onDevices: () => void; menu?: LiveMenu }) {
  const round = g.rounds[g.roundIndex];
  const [played, setPlayed] = useState<string | null>(null);
  const fs = useContext(HostFullscreenCtx);
  const { standard, hasFinal, remaining, next } = roundInfo(g);
  const picker = findCompetitor(g, g.controlCompetitorId);
  if (!round || round.kind !== 'standard') return null;
  const q = played ? round.categories.flatMap((c) => c.clues).find((x) => x.id === played) : null;
  return (
    <>
      <GameFrame
        boxTestId="host-board-box"
        // R11-3.3: who is choosing, in the top strip; the board in the TV's blue area.
        top={
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 text-center">
            <h2 className="host-band-title max-w-full truncate text-2xl" data-testid="choosing">
              {remaining === 0 ? 'This round is complete' : picker ? `${competitorName(picker, g)} is choosing a clue` : 'Choose a clue'}
            </h2>
            <p className="max-w-full truncate text-sm text-slate-500">
              {round.name} · {remaining === 0 ? 'every clue has been played' : `${remaining} ${remaining === 1 ? 'clue' : 'clues'} left`}
              {picker?.bot && remaining > 0 ? ' · picks by itself' : ''}
            </p>
          </div>
        }
        preview={() => <HostBoardGrid g={g} onTile={(id, used) => (used ? setPlayed(id) : run({ type: 'selectClue', clueId: id }))} />}
        bar={
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 px-1 text-slate-600">{remaining === 0 ? 'Every clue in this round has been played.' : 'Tap a clue on the board to open it.'}</p>
            {/* The next step appears only when the round is finished; earlier it lives in Options. */}
            {remaining === 0 && next && (
              <ActionButton size="lg" onAction={() => run({ type: 'setRound', roundIndex: next.i })} data-testid="next-round">
                Next: {next.name} <ChevronRight size={20} aria-hidden />
              </ActionButton>
            )}
            {remaining === 0 && !next && hasFinal && (
              <ActionButton size="lg" onAction={() => run({ type: 'startFinal' })} data-testid="start-final">
                <Flag size={20} aria-hidden /> Start Final Jeopardy!
              </ActionButton>
            )}
            {/* Full screen: Options is at the top right of the screen (R12-3.3). */}
            {!fs.on && <GameOptions g={g} run={run} onDevices={onDevices} menu={menu} />}
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
 * Options: round changes (on the board only), buzzers, the join QR, the introduction. `all` (full
 * screen, R12-3.3 — the page's own header with Pause and the game menu is covered there) adds Pause
 * / Resume, Rules & timers, Event history, Save now and End game.
 */
function GameOptions({ g, run, onDevices, menu, all, compact }: { g: GameView; run: Run; onDevices: () => void; menu?: LiveMenu; all?: boolean; compact?: boolean }) {
  const { standard, hasFinal, remaining, next } = roundInfo(g);
  const onBoard = g.phase === 'board' && !g.intro;
  const [options, setOptions] = useState(false);
  return (
    <>
      <Button size="lg" variant="secondary" className={cx('host-btn', all && (compact ? 'min-h-11 px-3' : 'min-h-12 px-4'))} onClick={() => setOptions(true)} aria-label="Options" data-testid="game-options">
        <SlidersHorizontal size={18} aria-hidden /> <span className={cx(compact && 'sr-only')}>Options</span>
      </Button>
      <Modal open={options} onClose={() => setOptions(false)} title="Game options">
        <div className="grid gap-2">
          {all && (
            <ActionButton size="lg" variant={g.paused ? 'warning' : 'secondary'} onAction={() => run({ type: g.paused ? 'resumeGame' : 'pauseGame' })} data-testid="option-pause">
              {g.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />} {g.paused ? 'Resume game' : 'Pause game'}
            </ActionButton>
          )}
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
          {all && menu && (
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
          {all && (
            <>
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
            </>
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
 * Category introduction (R4-16, R5-12): while it runs the clue board is hidden from the host, so
 * no clue can be opened by accident. Tap a category to show it on the TV (one swipe, forward or
 * back); Next / Previous; Auto (server-paced) / Stop Auto; Skip. Below the list: a live preview
 * of the TV.
 */
function IntroStage({ g, run }: { g: GameView; run: Run }) {
  const intro = g.intro!;
  const round = g.rounds[intro.roundIndex];
  if (!round) return null;
  const n = round.categories.length;
  const nextLabel = intro.step < 0 ? 'Show the first category' : intro.step >= n - 1 ? 'Done — show the board' : 'Next Category';
  const current = intro.step < 0 ? round.name : round.categories[intro.step]?.name || `Category ${intro.step + 1}`;
  return (
    <GameFrame
      testId="intro-controls"
      boxTestId="intro-preview-box"
      // R6-2.1 / R10-6: the presentation; the host's controls where the TV has its scores.
      top={
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 text-center" data-testid="intro-now">
          <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Introduce the categories{intro.auto ? ' · automatic' : ''}</p>
          <p className="flex max-w-full min-w-0 items-baseline gap-3">
            <span className="host-band-title min-w-0 truncate text-2xl">{current}</span>
            <span className="shrink-0 text-sm text-slate-600">{intro.step < 0 ? 'The round title is on the TV.' : `Category ${intro.step + 1} of ${n}`}</span>
          </p>
        </div>
      }
      preview={(size) => <TvPreview game={g} scoreboard={false} band title="TV preview" size={size} testId="intro-preview" />}
      bar={<IntroBar g={g} run={run} n={n} nextLabel={nextLabel} />}
    />
  );
}

/** The introduction's controls: tap a category to show it, then Previous | Next, Auto, Skip. */
function IntroBar({ g, run, n, nextLabel }: { g: GameView; run: Run; n: number; nextLabel: string }) {
  const intro = g.intro!;
  const round = g.rounds[intro.roundIndex]!;
  return (
    <div className="flex flex-col gap-2">
      <ol className={cx('grid shrink-0 gap-2', n <= 6 ? 'grid-cols-6' : 'grid-cols-4 @5xl:grid-cols-6')} aria-label="Categories — tap one to show it on the TV">
        {round.categories.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <button
              onClick={() => run({ type: 'introGoto', step: i })}
              aria-current={i === intro.step ? 'step' : undefined}
              aria-label={`Show ${c.name || `Category ${i + 1}`} on the TV`}
              className={cx(
                'flex min-h-10 w-full items-center justify-center rounded-xl px-2 py-1 text-center text-sm leading-tight font-bold uppercase',
                i === intro.step ? 'bg-amber-300 text-black ring-2 ring-amber-500' : i < intro.step ? 'bg-blue-800 text-white active:bg-blue-900' : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-100',
              )}
              data-testid="intro-cat"
            >
              <span className="line-clamp-2 [overflow-wrap:normal] hyphens-auto">{c.name || `Category ${i + 1}`}</span>
            </button>
          </li>
        ))}
      </ol>
      {/* R6-2.3: Previous Category | Next Category. */}
      <div className="grid shrink-0 grid-cols-[1.5fr_2fr_1fr_1fr] gap-2">
        <ActionButton size="lg" variant="secondary" className="px-3 text-lg" disabled={intro.step < 0} onAction={() => run({ type: 'introPrev' })} data-testid="intro-prev">
          <ChevronLeft size={22} aria-hidden /> Previous Category
        </ActionButton>
        <ActionButton size="lg" className="px-3 text-lg" onAction={() => run({ type: 'introNext' })} data-testid="intro-next">
          {nextLabel} <ChevronRight size={22} aria-hidden />
        </ActionButton>
        {!intro.auto ? (
          <Button size="lg" variant="secondary" className="px-3 text-lg" onClick={() => run({ type: 'startIntro', auto: true })} title="Play the introduction automatically" data-testid="intro-auto">
            Auto <ChevronsRight size={20} aria-hidden />
          </Button>
        ) : (
          <ActionButton size="lg" variant="warning" className="px-3 text-lg" onAction={() => run({ type: 'introStopAuto' })} data-testid="intro-stop-auto">
            <Square size={18} aria-hidden /> Stop Auto
          </ActionButton>
        )}
        <ActionButton size="lg" variant="ghost" className="px-3 text-lg" onAction={() => run({ type: 'introSkip' })} data-testid="intro-skip">
          Skip
        </ActionButton>
      </div>
    </div>
  );
}
