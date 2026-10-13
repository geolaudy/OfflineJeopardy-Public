// Live theme preview: the real TV components rendered with demo data, no game connection.
// The theme editor embeds this page in an iframe and sends the draft theme with postMessage,
// so the preview always matches what the TV will show.
import { useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { GameView } from '../../../shared/views';
import { DEFAULT_RULES } from '../../../shared/game';
import { SAMPLE_BOARD } from '../../../shared/sampleBoards';
import type { CustomThemeData } from '../../../shared/themes';
import { BoardCtx, presentationFor, themeRoot, useViewportHeight } from './common';
import { Grid } from './Grid';
import { Scoreboard } from './Scoreboard';
import { CluePanel } from './ClueZoom';
import { Intro } from './Intro';
import { ThemeLogo } from './BoardPage';
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
        ? { clueId: clue.id, categoryName: round.categories[1].name, value: clue.value, isDailyWager: false, stage: 'question', question: clue.question, answer: null, notes: null, media: [], wager: null, answerRevealed: false, resolved: false, answeringEnded: false }
        : null,
    buzzer: { status: view === 'clue' ? 'open' : 'locked', openedAt: null, winner: null, queue: [], attemptedCompetitors: [], attemptedProfiles: [], early: [] },
    final: null,
    timer: null,
    intro: view === 'intro' ? { roundIndex: 0, step: 0, auto: false } : view === 'title' ? { roundIndex: 0, step: -1, auto: false } : null,
    showJoinQr: false,
    results: null,
    startedAt: null,
    endedAt: null,
    profiles,
  };
}

export default function BoardPreview() {
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
