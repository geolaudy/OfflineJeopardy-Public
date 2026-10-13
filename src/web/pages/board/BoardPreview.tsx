// Board preview (R2-17): the real TV board and clue screens for a saved board, without a game.
// Everything here is local state: no game is created, no events, scores or statistics, and the
// saved board is never modified (played tiles reset when you leave).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ArrowLeft, Eye, Pause, Play, RotateCcw, Undo2 } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import { DEFAULT_RULES, findClue, mediaPosition, type Board, type MediaPlayback } from '../../../shared/game';
import type { CustomTheme } from '../../../shared/themes';
import { api, ensureLocalHost, hostApi } from '../../lib/api';
import { cx } from '../../components/ui';
import { BoardCtx, presentationFor, themeRoot, usePrefersReducedMotion, useViewportHeight } from './common';
import { Stage } from './BoardPage';
import './board.css';

interface Local {
  roundIndex: number;
  openId: string | null;
  revealed: boolean;
  played: string[];
  media: MediaPlayback | null;
}

function buildView(board: Board, st: Local): GameView {
  const found = st.openId ? findClue(board.content, st.openId) : null;
  const q = found?.clue;
  return {
    role: 'public',
    id: `preview:${board.id}`,
    title: board.title,
    mode: 'solo',
    phase: q ? 'clue' : 'board',
    paused: false,
    roundIndex: st.roundIndex,
    rules: DEFAULT_RULES,
    rounds: board.content.rounds.map((r) => ({
      name: r.name,
      kind: r.kind,
      categories: r.categories.map((c) => ({ id: c.id, name: c.name, clues: c.clues.map((x) => ({ id: x.id, value: x.value, used: st.played.includes(x.id) })) })),
    })),
    competitors: [],
    unassigned: [],
    bindings: [],
    controlCompetitorId: null,
    clue: q
      ? {
          clueId: q.id,
          categoryName: found!.category.name,
          value: q.value,
          isDailyWager: false, // the preview shows the question directly
          stage: 'question',
          question: q.question,
          answer: st.revealed ? q.answer : null,
          notes: null,
          media: q.media ?? [],
          answerMedia: st.revealed ? (q.answerMedia ?? []) : [],
          layout: q.layout ?? 'auto',
          unlockMode: 'host',
          wager: null,
          answerRevealed: st.revealed,
          resolved: false,
          answeringEnded: st.revealed,
        }
      : null,
    buzzer: { status: 'locked', openedAt: null, winner: null, queue: [], attemptedCompetitors: [], attemptedProfiles: [], early: [] },
    final: null,
    timer: null,
    intro: null,
    media: st.media,
    practice: false,
    roomCode: null,
    showJoinQr: false,
    results: null,
    startedAt: null,
    endedAt: null,
    profiles: {},
  };
}

export default function BoardPreview() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [look, setLook] = useState<{ theme: string; custom: CustomTheme | null }>({ theme: 'classic', custom: null });
  const [st, setSt] = useState<Local>({ roundIndex: 0, openId: null, revealed: false, played: [], media: null });
  const vh = useViewportHeight();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    void (async () => {
      await ensureLocalHost();
      try {
        const b = await hostApi<Board>('GET', `/api/boards/${encodeURIComponent(id)}`);
        setBoard(b);
        const first = Math.max(0, b.content.rounds.findIndex((r) => r.kind === 'standard'));
        const start = params.get('clue');
        const f = start ? findClue(b.content, start) : null;
        setSt((s) => ({ ...s, roundIndex: f ? f.r : first, openId: f ? start : null }));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    api<{ theme: string; custom: CustomTheme | null }>('GET', '/api/settings/public').then(setLook, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const g = useMemo(() => (board ? buildView(board, st) : null), [board, st]);
  const ctx = useMemo(() => presentationFor(look.theme, look.custom, reduced, vh), [look, reduced, vh]);
  const root = themeRoot(look.theme, look.custom);
  const exit = () => (window.history.length > 1 ? navigate(-1) : navigate(`/desk/boards/${id}`));

  const open = (clueId: string) => setSt((s) => (s.openId || s.played.includes(clueId) ? s : { ...s, openId: clueId, revealed: false, media: null }));
  const back = () => setSt((s) => (s.openId ? { ...s, played: [...s.played, s.openId], openId: null, revealed: false, media: null } : s));
  const reveal = () => setSt((s) => (s.openId ? { ...s, revealed: true, media: s.media?.side === 'clue' ? null : s.media } : s));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (st.openId ? back : exit)();
      else if (e.key === 'r' || e.key === 'R') reveal();
      else if (e.key === 'Enter' && st.revealed) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <div className="p-8 text-center text-red-700">{error}</div>;
  if (!board || !g) return <div className="p-8 text-center text-slate-500">Loading preview…</div>;
  const standard = board.content.rounds.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === 'standard');
  const clue = st.openId ? findClue(board.content, st.openId)?.clue : null;
  const side: 'clue' | 'answer' = st.revealed && clue?.answerMedia?.length ? 'answer' : 'clue';
  const playable = ((side === 'answer' ? clue?.answerMedia : clue?.media) ?? []).map((m, index) => ({ m, index })).filter(({ m }) => m.kind !== 'image');

  const toggleMedia = (index: number) =>
    setSt((s) => {
      const now = Date.now();
      const m = s.media && s.media.side === side && s.media.index === index ? s.media : null;
      if (m?.status === 'playing') return { ...s, media: { ...m, status: 'paused', positionMs: mediaPosition(m, now), startedAt: null } };
      return { ...s, media: { clueId: s.openId!, side, index, status: 'playing', positionMs: m?.status === 'paused' ? m.positionMs : 0, startedAt: now, durationMs: null, muted: false, started: true } };
    });

  return (
    <BoardCtx.Provider value={ctx}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div className="board-theme relative flex h-screen w-screen flex-col overflow-hidden select-none" data-theme={root.dataTheme} style={root.style} data-testid="board-preview">
          {/* Tiles are plain elements on the TV; the preview makes them clickable. */}
          <div
            className="relative min-h-0 flex-1 cursor-pointer"
            onClick={(e) => {
              const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-clue-id]');
              if (tile?.dataset.clueId && !st.openId) open(tile.dataset.clueId);
            }}
          >
            <Stage g={g} />
          </div>
          <div className="pointer-events-auto absolute top-3 right-3 z-50 flex max-w-[90vw] flex-wrap items-center justify-end gap-2 rounded-2xl bg-slate-900/85 p-2 text-sm text-white shadow-xl backdrop-blur" role="toolbar" aria-label="Preview controls">
            <span className="px-2 font-semibold">Preview — nothing is saved</span>
            {!st.openId && standard.length > 1
              ? standard.map(({ r, i }) => (
                  <button key={i} onClick={() => setSt((s) => ({ ...s, roundIndex: i }))} className={cx('min-h-9 rounded-lg px-3 font-semibold', st.roundIndex === i ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20')}>
                    {r.name}
                  </button>
                ))
              : null}
            {st.openId && !st.revealed ? (
              <button onClick={reveal} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-400 px-3 font-semibold text-slate-900" data-testid="preview-reveal">
                <Eye size={16} aria-hidden /> Reveal answer
              </button>
            ) : null}
            {st.openId
              ? playable.map(({ m, index }) => {
                  const on = st.media?.side === side && st.media.index === index && st.media.status === 'playing';
                  return (
                    <button key={`${side}${index}`} onClick={() => toggleMedia(index)} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20" data-testid="preview-media">
                      {on ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />} {m.kind === 'video' ? 'Video' : 'Audio'}
                    </button>
                  );
                })
              : null}
            {st.openId ? (
              <button onClick={back} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20" data-testid="preview-back">
                <Undo2 size={16} aria-hidden /> Back to board
              </button>
            ) : st.played.length ? (
              <button onClick={() => setSt((s) => ({ ...s, played: [] }))} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20">
                <RotateCcw size={16} aria-hidden /> Reset tiles
              </button>
            ) : null}
            <button onClick={exit} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 font-semibold text-slate-900" data-testid="preview-exit">
              <ArrowLeft size={16} aria-hidden /> Exit preview
            </button>
          </div>
        </div>
      </MotionConfig>
    </BoardCtx.Provider>
  );
}
