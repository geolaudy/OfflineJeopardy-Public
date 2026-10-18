// R10-2: preview the Final Jeopardy! category, clue and correct response from the board editor,
// exactly as the TV shows them — the real TV screen (board/FinalScreen in the TV preview page)
// fed the editor's current, unsaved values; no lobby, players or game. A clue or answer sound plays
// here, on this computer (Play / Pause / Restart, one copy, stopped when the preview closes); the
// picture on the preview shows it playing.
import { useEffect, useRef, useState } from 'react';
import { Eye, Pause, Play, RotateCcw } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import { DEFAULT_RULES, type Category, type Clue, type MediaPlayback } from '../../../shared/game';
import { Button, Modal } from '../../components/ui';
import { serverNow } from '../../lib/socket';
import { FitBox, TvPreview } from '../host/TvMirror';

export type FinalPreviewStage = 'category' | 'clue' | 'done';
const TITLES: Record<FinalPreviewStage, string> = { category: 'Final Jeopardy! category', clue: 'Final Jeopardy! clue', done: 'Correct response' };

/** A game that is only the Final at `stage`, with the editor's values. */
export function finalPreviewGame(cat: Category, clue: Clue, stage: FinalPreviewStage, media: MediaPlayback | null): GameView {
  return {
    role: 'public',
    id: 'editor-final-preview',
    title: 'Final preview',
    mode: 'solo',
    phase: 'final',
    paused: false,
    roundIndex: 0,
    rules: DEFAULT_RULES,
    rounds: [],
    competitors: [],
    unassigned: [],
    bindings: [],
    controlCompetitorId: null,
    clue: null,
    buzzer: { status: 'locked', openedAt: null, winner: null, queue: [], attemptedCompetitors: [], attemptedProfiles: [], early: [] },
    final: {
      stage,
      category: cat.name,
      categorySubheading: cat.subheading ?? '',
      question: clue.question,
      answer: clue.answer,
      clueId: clue.id,
      media: clue.media ?? [],
      answerMedia: clue.answerMedia ?? [],
      layout: clue.layout ?? 'auto',
      thinking: true,
      order: [],
      preScores: {},
      cursor: 0,
      step: 'contestant',
      entries: [],
    },
    timer: null,
    media,
    intro: null,
    practice: false,
    roomCode: null,
    showJoinQr: false,
    results: null,
    startedAt: null,
    endedAt: null,
    profiles: {},
  };
}

/** The three preview buttons for the Final round in the editor. */
export function FinalPreviewButtons({ category, clue }: { category: Category; clue: Clue }) {
  const [stage, setStage] = useState<FinalPreviewStage | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2" data-testid="final-preview-buttons">
      <span className="mr-1 text-sm font-semibold text-slate-600">
        <Eye size={16} className="mr-1 inline align-[-3px]" aria-hidden />
        Preview on the TV:
      </span>
      <Button size="sm" variant="secondary" onClick={() => setStage('category')} data-testid="final-preview-category">
        Category
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setStage('clue')} data-testid="final-preview-clue">
        Preview Clue
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setStage('done')} data-testid="final-preview-answer">
        Preview Answer
      </Button>
      {stage && <FinalPreviewDialog category={category} clue={clue} stage={stage} onStage={setStage} onClose={() => setStage(null)} />}
    </div>
  );
}

function FinalPreviewDialog({ category, clue, stage, onStage, onClose }: { category: Category; clue: Clue; stage: FinalPreviewStage; onStage: (s: FinalPreviewStage) => void; onClose: () => void }) {
  // The sound of the side on screen: the clue's first sound / video, or the correct response's.
  const list = stage === 'clue' ? (clue.media ?? []) : stage === 'done' ? (clue.answerMedia ?? []) : [];
  const index = list.findIndex((m) => m.kind === 'audio' || m.kind === 'video');
  const src = index >= 0 ? list[index].url : null;
  const side: 'clue' | 'answer' = stage === 'done' ? 'answer' : 'clue';
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<{ status: MediaPlayback['status']; at: number; pos: number }>({ status: 'stopped', at: 0, pos: 0 });
  // Leaving a side (or the preview) stops its sound.
  useEffect(() => {
    setState({ status: 'stopped', at: 0, pos: 0 });
    const el = audio.current;
    return () => el?.pause();
  }, [src, stage]);
  const media: MediaPlayback | null =
    src && state.status !== 'stopped'
      ? { clueId: clue.id, side, index, status: state.status, positionMs: state.pos, startedAt: state.status === 'playing' ? state.at : null, durationMs: null, muted: true, started: true }
      : null;
  const game = finalPreviewGame(category, clue, stage, media);
  const sync = (status: MediaPlayback['status']) => {
    const el = audio.current;
    setState({ status, at: serverNow() - (el?.currentTime ?? 0) * 1000, pos: (el?.currentTime ?? 0) * 1000 });
  };
  const play = () => void audio.current?.play().catch(() => undefined);
  const pause = () => audio.current?.pause();
  const restart = () => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  };
  const playing = state.status === 'playing';
  return (
    <Modal open onClose={onClose} title={TITLES[stage]} xl>
      <div className="space-y-3" data-testid="final-preview-dialog" data-stage={stage}>
        <div className="flex flex-wrap items-center gap-2">
          {(['category', 'clue', 'done'] as const).map((s) => (
            <Button key={s} size="sm" variant={s === stage ? 'primary' : 'secondary'} aria-pressed={s === stage} onClick={() => onStage(s)} data-testid={`final-preview-tab-${s}`}>
              {s === 'category' ? 'Category' : s === 'clue' ? 'Clue' : 'Answer'}
            </Button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Unsaved changes are included. Nothing is shown on the TV.</span>
        </div>
        {/* The TV's whole 16:9 screen (the score strip's place stays empty: no players). */}
        <div className="flex aspect-video max-h-[70vh] w-full">
          <FitBox testId="final-preview-tv">{(size) => <TvPreview game={game} scoreboard={false} band title={`${TITLES[stage]} as the TV shows it`} size={size} testId="final-preview-frame" />}</FitBox>
        </div>
        {src && (
          <div className="flex flex-wrap items-center gap-2" data-testid="final-preview-sound">
            <span className="text-sm font-semibold text-slate-600">{side === 'clue' ? "Clue's sound" : "Correct response's sound"} (plays on this computer):</span>
            {playing ? (
              <Button size="sm" variant="secondary" onClick={pause} data-testid="final-preview-pause">
                <Pause size={16} aria-hidden /> Pause
              </Button>
            ) : (
              <Button size="sm" onClick={play} data-testid="final-preview-play">
                <Play size={16} aria-hidden /> {state.status === 'paused' ? 'Resume' : 'Play'}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={restart} data-testid="final-preview-restart">
              <RotateCcw size={16} aria-hidden /> Restart
            </Button>
            <audio
              ref={audio}
              key={`${stage}:${src}`}
              src={src}
              preload="auto"
              onPlay={() => sync('playing')}
              onPause={(e) => sync(e.currentTarget.ended ? 'ended' : 'paused')}
              onEnded={() => sync('ended')}
              data-testid="final-preview-audio"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
