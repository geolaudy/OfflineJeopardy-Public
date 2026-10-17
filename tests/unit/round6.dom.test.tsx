// @vitest-environment jsdom
// Round 6, Milestone A: Final answers close into a waiting state and the host begins the reveal
// with a swipe (R6-6); timers have no label and leave the TV at zero (R6-12); one highlight per
// score box, the buzz-in replacing the picker ring (R6-3); no new-round sound under the Final (R6-4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import type { GameView, FinalView, CompetitorView, ProfilePublic } from '../../src/shared/views';

vi.mock('../../src/web/lib/sound', () => ({ playCue: vi.fn(), cueDuration: () => null }));
const { playCue } = await import('../../src/web/lib/sound');
const { FinalScreen } = await import('../../src/web/pages/board/FinalScreen');
const { Scoreboard } = await import('../../src/web/pages/board/Scoreboard');
const { TimerBar } = await import('../../src/web/pages/board/TimerBar');
const { BoardCtx, DEFAULT_SCALE } = await import('../../src/web/pages/board/common');
const { transitionCues } = await import('../../src/web/pages/board/soundCues');
const { competitorHighlight } = await import('../../src/web/lib/view');

const wrap = (reduced = false) =>
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <BoardCtx.Provider value={{ theme: 'classic', prefix: '$', logo: null, scale: DEFAULT_SCALE, reduced, vh: 900 }}>
        <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
      </BoardCtx.Provider>
    );
  };

const player = (id: string, name: string, score: number): CompetitorView => ({ id, kind: 'player', profileId: `p-${id}`, name, color: '#1d4ed8', buzzerMode: 'individual', memberIds: [`p-${id}`], score });
const profile = (id: string, name: string, nickname = '') => ({ id: `p-${id}`, name, nickname, color: '#1d4ed8', avatar: 'owl', pictureUrl: null }) as unknown as ProfilePublic;

function game(over: Partial<GameView> = {}): GameView {
  const competitors = [player('a', 'Ann', 200), player('b', 'Bob', 600)];
  return {
    role: 'public',
    id: 'g1',
    title: 'Test night',
    mode: 'solo',
    phase: 'final',
    competitors,
    profiles: { 'p-a': profile('a', 'Ann'), 'p-b': profile('b', 'Bob') },
    buzzer: { status: 'locked', winner: null, early: [] },
    clue: null,
    final: null,
    timer: null,
    intro: null,
    rules: { survivalLives: 3 },
    results: null,
    ...over,
  } as unknown as GameView;
}

function final(over: Partial<FinalView> = {}): FinalView {
  return {
    stage: 'clue',
    category: 'Capitals',
    question: 'Capital of Hungary.',
    answer: null,
    order: ['a', 'b'],
    preScores: { a: 200, b: 600 },
    cursor: 0,
    step: 'contestant',
    entries: [
      { competitorId: 'a', hasWager: true, hasAnswer: true, submitted: true, wager: null, answer: null, judged: false, correct: null, profileId: 'p-a' },
      { competitorId: 'b', hasWager: true, hasAnswer: true, submitted: false, wager: null, answer: null, judged: false, correct: null, profileId: 'p-b' },
    ],
    ...over,
  } as FinalView;
}

beforeEach(() => vi.mocked(playCue).mockClear());
afterEach(() => cleanup());

const running = (ms: number, kind = 'final') => ({ kind, durationMs: 30_000, remainingMs: ms, startedAt: Date.now(), running: true, expired: false }) as GameView['timer'];

describe('Final Jeopardy! answers close, the host begins the reveal (R6-6)', () => {
  it('closed: no timer, question and submission chips stay, nothing revealed; Begin swipes once with its sound', () => {
    const W = wrap();
    const view = render(<FinalScreen g={game({ final: final(), timer: running(10_000) })} />, { wrapper: W });
    expect(screen.getByTestId('tv-timer')).toBeTruthy();
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'closed' }), timer: null })} />);
    expect(screen.queryByTestId('tv-timer')).toBeNull();
    expect(screen.getByText('Capital of Hungary.')).toBeTruthy();
    expect(screen.queryByTestId('tv-final-name')).toBeNull();
    const root = screen.getByTestId('tv-final');
    expect(root.dataset.swipeSeq).toBe('0'); // closing the answers is not a swipe
    expect(playCue).not.toHaveBeenCalled();
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal' }) })} />);
    expect(root.dataset.swipeSeq).toBe('1');
    expect(root.dataset.swipeKind).toBe('swipe');
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(playCue).toHaveBeenCalledWith('categoryIntro');
    expect(screen.getByTestId('tv-final-name').textContent).toBe('Ann'); // lowest pre-Final score first
  });
});

describe('Timers on the TV (R6-12)', () => {
  it('shows only the countdown — no label', () => {
    render(<TimerBar timer={running(12_000, 'buzz')} />, { wrapper: wrap() });
    const t = screen.getByTestId('tv-timer');
    expect(t.textContent).toBe('12');
    expect(t.textContent).not.toMatch(/buzz/i);
  });
  it('disappears when it expires or reaches zero', () => {
    const view = render(<TimerBar timer={{ ...running(0, 'answer')!, running: false, expired: true }} />, { wrapper: wrap() });
    expect(screen.queryByTestId('tv-timer')).toBeNull();
    view.rerender(<TimerBar timer={{ ...running(0, 'answer')!, startedAt: Date.now() - 5 }} />);
    expect(screen.queryByTestId('tv-timer')).toBeNull();
  });
});

describe('One highlight per score box (R6-3)', () => {
  const clue = { clueId: 'q1' } as GameView['clue'];
  it('the picker ring gives way to the buzz-in highlight and comes back afterwards', () => {
    const board = game({ phase: 'board', controlCompetitorId: 'a' } as Partial<GameView>);
    expect(competitorHighlight(board, 'a')).toBe('pick');
    expect(competitorHighlight(board, 'b')).toBeNull();
    // The picker buzzes in: one highlight (buzz), not two.
    const selfBuzz = game({ phase: 'clue', clue, controlCompetitorId: 'a', buzzer: { status: 'locked', winner: { competitorId: 'a', profileId: 'p-a', at: 1 }, early: [] } } as unknown as Partial<GameView>);
    expect(competitorHighlight(selfBuzz, 'a')).toBe('buzz');
    // Someone else buzzes in: only they are highlighted.
    const otherBuzz = game({ phase: 'clue', clue, controlCompetitorId: 'a', buzzer: { status: 'locked', winner: { competitorId: 'b', profileId: 'p-b', at: 1 }, early: [] } } as unknown as Partial<GameView>);
    expect(competitorHighlight(otherBuzz, 'a')).toBeNull();
    expect(competitorHighlight(otherBuzz, 'b')).toBe('buzz');
    // Judged / no buzz any more: the picker ring is back.
    expect(competitorHighlight(game({ phase: 'clue', clue, controlCompetitorId: 'b' } as Partial<GameView>), 'b')).toBe('pick');
    expect(competitorHighlight(game({ phase: 'final', controlCompetitorId: 'a' } as Partial<GameView>), 'a')).toBeNull();
  });
  it('the TV podium carries exactly one highlight class', () => {
    render(<Scoreboard g={game({ phase: 'clue', clue, controlCompetitorId: 'a', buzzer: { status: 'locked', winner: { competitorId: 'a', profileId: 'p-a', at: 1 }, early: [] } } as unknown as Partial<GameView>)} />, { wrapper: wrap() });
    const [a, b] = screen.getAllByTestId('podium');
    expect(a.className).toContain('is-winner');
    expect(a.className).not.toContain('is-control');
    expect(a.dataset.highlight).toBe('buzz');
    expect(b.dataset.highlight).toBeUndefined();
  });
});

describe('Sound cues on state changes (R6-4)', () => {
  const comp = (score: number) => [{ id: 'a', score }] as CompetitorView[];
  const v = (over: Partial<GameView>) => ({ id: 'g', phase: 'board', roundIndex: 0, intro: null, clue: null, buzzer: { status: 'locked', winner: null }, timer: null, competitors: comp(0), ...over }) as unknown as GameView;
  it('starting the Final plays only the Final cue (no new-round / board sound)', () => {
    const cues = transitionCues(v({}), v({ phase: 'final', roundIndex: 2 }));
    expect(cues).toEqual(['final']);
  });
  it('a new standard round still plays the new-round cue', () => {
    expect(transitionCues(v({}), v({ roundIndex: 1 }))).toContain('roundEnd');
  });
});

describe('Score changes inside the score box (R6-5)', () => {
  const g = (a: number) => game({ phase: 'board', competitors: [player('a', 'Ann', a), player('b', 'Bob', 600)] });
  it('the box shows +$600 instead of the score, then the new total; nothing beside it', () => {
    vi.useFakeTimers();
    try {
      const view = render(<Scoreboard g={g(2400)} />, { wrapper: wrap() });
      const box = () => screen.getAllByTestId('score')[0];
      expect(box().textContent).toBe('$2,400');
      view.rerender(<Scoreboard g={g(3000)} />);
      expect(box().textContent).toBe('+$600'); // replaced, not added beside
      expect(box().dataset.score).toBe('3000'); // the authoritative value is already the new one
      expect(screen.getByTestId('score-delta').className).toContain('is-up');
      act(() => void vi.advanceTimersByTime(1400));
      expect(box().textContent).toBe('$3,000');
      view.rerender(<Scoreboard g={g(2400)} />);
      expect(box().textContent).toBe('−$600');
      expect(screen.getByTestId('score-delta').className).toContain('is-down');
    } finally {
      vi.useRealTimers();
    }
  });
  it('rapid changes never overlap and end on the current total', () => {
    vi.useFakeTimers();
    try {
      const view = render(<Scoreboard g={g(0)} />, { wrapper: wrap() });
      view.rerender(<Scoreboard g={g(400)} />);
      act(() => void vi.advanceTimersByTime(500));
      view.rerender(<Scoreboard g={g(-200)} />); // a correction mid-animation
      expect(screen.getAllByTestId('score-delta')).toHaveLength(1);
      expect(screen.getByTestId('score-delta').textContent).toBe('−$600');
      act(() => void vi.advanceTimersByTime(1000)); // the first change's timer must not end the second early
      expect(screen.getByTestId('score-delta').textContent).toBe('−$600');
      act(() => void vi.advanceTimersByTime(400));
      expect(screen.getAllByTestId('score')[0].textContent).toBe('−$200');
    } finally {
      vi.useRealTimers();
    }
  });
  it('the Final verdict: the wager as a change, then the total — no green/red pill', () => {
    vi.useFakeTimers();
    try {
      const entry = (judged: boolean) => ({ competitorId: 'a', hasWager: true, hasAnswer: true, submitted: true, wager: 150, answer: 'Buda', judged, correct: judged ? true : null, profileId: 'p-a' });
      const shown = (judged: boolean) => game({ final: final({ stage: 'reveal', step: 'answer', entries: [entry(judged), final().entries[1]] }) });
      const view = render(<FinalScreen g={shown(false)} />, { wrapper: wrap() });
      view.rerender(<FinalScreen g={shown(true)} />);
      const verdict = screen.getByTestId('tv-final-verdict');
      expect(verdict.textContent).toBe('+$150');
      expect(verdict.className).not.toMatch(/is-right|is-wrong/);
      act(() => void vi.advanceTimersByTime(1400));
      expect(screen.getByTestId('tv-final-verdict').textContent).toBe('$350');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('phone timing messages (R6-23)', async () => {
  const { buzzTimingText, buzzerLook } = await import('../../src/web/pages/join/PlayTab');
  const g = game({ phase: 'clue' } as Partial<GameView>);
  const t = (over: object) => ({ result: 'late' as const, otherCompetitorId: 'a', otherProfileId: 'p-a', gapMs: 42, confident: true, teammateWon: false, ...over });
  it('numbers only when confident, rounded to 10 ms; seconds beyond one second', () => {
    expect(buzzTimingText(g, t({}))).toBe('Ann buzzed 40 ms before you!');
    expect(buzzTimingText(g, t({ gapMs: 1234 }))).toBe('You were 1.23 seconds behind!');
    expect(buzzTimingText(g, t({ confident: false, gapMs: 12 }))).toBe('Very close buzz! Ann won.');
    expect(buzzTimingText(g, t({ result: 'won', otherCompetitorId: 'b', otherProfileId: 'p-b', gapMs: 80 }))).toBe('You buzzed in first! Bob was 80 ms behind.');
    expect(buzzTimingText(g, t({ result: 'won', otherCompetitorId: null, otherProfileId: null, gapMs: null, confident: false }))).toBe('You buzzed in first!');
    expect(buzzTimingText(g, t({ teammateWon: true }))).toBeNull();
  });
  it('buzzer colours: red locked, yellow open, green won — always with words', () => {
    expect(buzzerLook({ canBuzz: false, canPress: true, buzzReason: 'locked' }, false, false)).toMatchObject({ color: 'red', label: 'LOCKED' });
    expect(buzzerLook({ canBuzz: true }, false, false)).toMatchObject({ color: 'yellow', label: 'BUZZ!' });
    expect(buzzerLook({ canBuzz: false, buzzReason: 'taken' }, true, false)).toMatchObject({ color: 'green', label: "YOU'RE IN!" });
    expect(buzzerLook({ canBuzz: false, buzzReason: 'locked-out' }, false, false)).toMatchObject({ color: 'red', label: 'TOO EARLY' });
  });
});
