// Live game control for the host (iPad landscape first, portrait supported).
// Board: a replica of the TV board (R5-13). Clue: HostClue.tsx (R5-14). Introduction: category
// list, live TV preview and Next / Previous / Auto / Stop Auto / Skip (R5-12).
import { useState } from 'react';
import type { CompetitorView, GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { ActionButton, Avatar, Button, Lives, Modal, inputCls, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorHighlight, competitorName, findCompetitor } from '../../lib/view';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import FinalControl from './FinalControl';
import { HOST_SHORTCUTS, useHostShortcuts } from './shortcuts';
import { Undo2, Gamepad2, Play, ChevronLeft, ChevronRight, ChevronsRight, Square, SlidersHorizontal, QrCode, Flag } from 'lucide-react';
import { AnswerBanner } from './AnswerBanner';
import { ClueStage } from './HostClue';
import { HostBoardGrid, TvPreview } from './TvMirror';
import ScoreEditor from './ScoreEditor';
import { GameFrame } from './GameFrame';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

export default function Live({ g, run }: { g: GameView; run: Run }) {
  const [adjust, setAdjust] = useState<CompetitorView | null>(null);
  const [devices, setDevices] = useState(false);
  useHostShortcuts(g, run);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        {g.phase === 'final' ? (
          <FinalControl g={g} run={run} />
        ) : g.phase === 'board' && g.intro ? (
          <IntroStage g={g} run={run} />
        ) : g.phase === 'clue' && g.clue ? (
          <ClueStage g={g} run={run} />
        ) : (
          <BoardStage g={g} run={run} onDevices={() => setDevices(true)} />
        )}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* The scroller clips everything outside its padding box: the padding leaves room for the
            highlight ring (R6-2.2), which is never shrunk to fit. */}
        <div className="-m-1 flex items-stretch gap-2 overflow-x-auto p-1">
          {g.competitors.map((c) => {
            const hl = competitorHighlight(g, c.id);
            return (
            <button
              key={c.id}
              onClick={() => setAdjust(c)}
              className={cx(
                'flex min-w-36 shrink-0 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left',
                hl === 'buzz' ? 'border-amber-400 bg-amber-50 ring-4 ring-amber-300' : hl === 'pick' ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200',
                c.lives === 0 && 'opacity-50',
              )}
              aria-label={`Adjust score for ${competitorName(c, g)}`}
              data-testid="host-score"
              data-highlight={hl ?? undefined}
            >
              <Avatar profile={competitorAvatar(c, g)} size={32} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{competitorName(c, g)}</div>
                <div className={cx('text-lg font-black tabular-nums', c.score < 0 && 'text-red-700')}>{fmtScore(c.score)}</div>
                {c.lives !== undefined && (c.lives > 0 ? <Lives lives={c.lives} max={g.rules.survivalLives} size={13} /> : <span className="text-xs font-bold text-slate-500 uppercase">Out</span>)}
              </div>
            </button>
            );
          })}
          <div className="flex-1" />
          <ActionButton variant="secondary" size="lg" disabled={!g.undoLabel} onAction={() => run({ type: 'undo' })} className="shrink-0" data-testid="undo">
            <Undo2 size={18} aria-hidden /> Undo{g.undoLabel ? <span className="hidden text-sm font-normal text-slate-500 xl:inline">({g.undoLabel})</span> : null}
          </ActionButton>
        </div>
      </footer>
      {adjust && <ScoreEditor g={g} c={g.competitors.find((x) => x.id === adjust.id) ?? adjust} run={run} onClose={() => setAdjust(null)} />}
      <Modal open={devices} onClose={() => setDevices(false)} title="Buzzers & controllers" wide>
        <ControllersPanel g={g} />
      </Modal>
      <AssignListener g={g} />
    </div>
  );
}

/** R5-13: "{Player} is choosing a clue" above a replica of the TV board (tiles are buttons). */
function BoardStage({ g, run, onDevices }: { g: GameView; run: Run; onDevices: () => void }) {
  const round = g.rounds[g.roundIndex];
  const [played, setPlayed] = useState<string | null>(null);
  const standard = g.rounds.map((r, i) => ({ name: r.name, kind: r.kind, i })).filter((r) => r.kind === 'standard');
  const hasFinal = g.rounds.some((r) => r.kind === 'final');
  const remaining = round?.categories.reduce((a, c) => a + c.clues.filter((q) => !q.used).length, 0) ?? 0;
  const next = standard.find((r) => r.i > g.roundIndex);
  const picker = findCompetitor(g, g.controlCompetitorId);
  if (!round || round.kind !== 'standard') return null;
  const q = played ? round.categories.flatMap((c) => c.clues).find((x) => x.id === played) : null;
  return (
    <>
      <GameFrame
        boxTestId="host-board-box"
        head={
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-black" data-testid="choosing">
              {remaining === 0 ? 'This round is complete' : picker ? `${competitorName(picker, g)} is choosing a clue` : 'Choose a clue'}
            </h2>
            <p className="truncate text-sm text-slate-500">
              {round.name} · {remaining} {remaining === 1 ? 'clue' : 'clues'} left{picker?.bot && remaining > 0 ? ' · picks by itself' : ''}
            </p>
          </div>
        }
        preview={() => <HostBoardGrid g={g} onTile={(id, used) => (used ? setPlayed(id) : run({ type: 'selectClue', clueId: id }))} />}
        bar={
          <div className="flex flex-wrap items-center gap-2 py-1">
            <p className="min-w-0 flex-1 px-1 text-slate-600">{remaining === 0 ? 'Every clue in this round has been played.' : null}</p>
            {/* The next step appears only when the round is finished; earlier it lives in Options. */}
            {remaining === 0 && next && (
              <ActionButton size="xl" onAction={() => run({ type: 'setRound', roundIndex: next.i })} data-testid="next-round">
                Next: {next.name} <ChevronRight size={20} aria-hidden />
              </ActionButton>
            )}
            {remaining === 0 && !next && hasFinal && (
              <ActionButton size="xl" onAction={() => run({ type: 'startFinal' })} data-testid="start-final">
                <Flag size={20} aria-hidden /> Start Final Jeopardy!
              </ActionButton>
            )}
            <GameOptions g={g} run={run} onDevices={onDevices} remaining={remaining} next={next} standard={standard} hasFinal={hasFinal} />
          </div>
        }
      />
      {played && (
        <Modal open onClose={() => setPlayed(null)} title="Played clue">
          <div className="space-y-3">
            <p className="text-lg">{q?.question}</p>
            <AnswerBanner answer={q?.answer} />
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

function GameOptions({
  g,
  run,
  onDevices,
  remaining,
  next,
  standard,
  hasFinal,
}: {
  g: GameView;
  run: Run;
  onDevices: () => void;
  remaining: number;
  next: { name: string; i: number } | undefined;
  standard: { name: string; i: number }[];
  hasFinal: boolean;
}) {
  const [options, setOptions] = useState(false);
  return (
    <>
      <Button size="lg" variant="secondary" onClick={() => setOptions(true)} data-testid="game-options">
        <SlidersHorizontal size={18} aria-hidden /> Options
      </Button>
      <Modal open={options} onClose={() => setOptions(false)} title="Game options">
        <div className="grid gap-2">
          {next && (
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
          {standard.length > 1 && (
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
          {hasFinal && (
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
      head={
        <div className="flex min-w-0 flex-1 flex-col" data-testid="intro-now">
          <p className="truncate text-xs font-bold tracking-wide text-slate-500 uppercase">Introduce the categories{intro.auto ? ' · automatic' : ''}</p>
          <p className="flex min-w-0 items-baseline gap-3">
            <span className="min-w-0 truncate text-2xl font-black">{current}</span>
            <span className="shrink-0 text-slate-600">{intro.step < 0 ? 'The round title is on the TV.' : `Category ${intro.step + 1} of ${n}`}</span>
          </p>
        </div>
      }
      // R6-2.1: the presentation only — the scores are in the iPad's own bar below.
      preview={(size) => <TvPreview game={g} scoreboard={false} title="TV preview" size={size} testId="intro-preview" />}
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
                'flex min-h-11 w-full items-center justify-center rounded-xl px-2 py-1 text-center text-sm leading-tight font-bold uppercase',
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
