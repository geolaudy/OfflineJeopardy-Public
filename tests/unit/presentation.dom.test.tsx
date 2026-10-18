// @vitest-environment jsdom
// TV presentation components (round 5, Milestone F): the Final swipe fires once per host action
// and never on load / duplicate state (R5-6); score changes show "+$400" / "−$400" (R5-7); team
// buzz-ins show the team name with "Buzzed by" (R5-5.10); the results podium (R5-10).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import type { GameView, FinalView, CompetitorView, ProfilePublic } from '../../src/shared/views';

vi.mock('../../src/web/lib/sound', () => ({ playCue: vi.fn(), cueDuration: () => null }));
const { playCue } = await import('../../src/web/lib/sound');
const { FinalScreen } = await import('../../src/web/pages/board/FinalScreen');
const { Scoreboard } = await import('../../src/web/pages/board/Scoreboard');
const { CluePanel } = await import('../../src/web/pages/board/ClueZoom');
const { PodiumResults } = await import('../../src/web/pages/board/Podium');
const { BoardCtx, DEFAULT_SCALE } = await import('../../src/web/pages/board/common');

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
    clueId: 'fq',
    media: [],
    answerMedia: [],
    layout: 'auto',
    thinking: true,
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

describe('Final Jeopardy! swipe (R5-6)', () => {
  it('one swipe + one sound per forward step; duplicates and re-renders do nothing', () => {
    const W = wrap();
    const view = render(<FinalScreen g={game({ final: final() })} />, { wrapper: W });
    const root = screen.getByTestId('tv-final');
    expect(root.dataset.swipeSeq).toBe('0');
    // Green/gray submission chips stay.
    expect(screen.getByText('Ann').getAttribute('data-done')).toBe('true');
    expect(screen.getByText('Bob').getAttribute('data-done')).toBe('false');
    expect(playCue).not.toHaveBeenCalled();

    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal' }) })} />);
    expect(root.dataset.swipeSeq).toBe('1');
    expect(root.dataset.swipeKind).toBe('swipe');
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(playCue).toHaveBeenCalledWith('categoryIntro');
    expect(screen.getByTestId('tv-final-name').textContent).toBe('Ann');

    // The same state again (duplicate broadcast / reconnect) and a reveal step inside the same
    // contestant: no new swipe.
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal' }) })} />);
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal', step: 'wager' }) })} />);
    expect(root.dataset.swipeSeq).toBe('1');
    expect(playCue).toHaveBeenCalledTimes(1);

    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal', cursor: 1 }) })} />);
    expect(root.dataset.swipeSeq).toBe('2');
    expect(playCue).toHaveBeenCalledTimes(2);
    // Only the arriving contestant carries the test ids (the leaving layer is inert).
    expect(screen.getAllByTestId('tv-final-name').map((e) => e.textContent)).toEqual(['Bob']);

    // Undo back to the previous contestant: a quiet cross-fade.
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal', cursor: 0 }) })} />);
    expect(root.dataset.swipeKind).toBe('fade');
    expect(playCue).toHaveBeenCalledTimes(2);
  });

  it('a TV that loads mid-reveal plays no swipe and no sound', () => {
    render(<FinalScreen g={game({ final: final({ stage: 'reveal', cursor: 1 }) })} />, { wrapper: wrap() });
    expect(screen.getByTestId('tv-final').dataset.swipeSeq).toBe('0');
    expect(screen.getByTestId('tv-final-name').textContent).toBe('Bob');
    expect(playCue).not.toHaveBeenCalled();
  });

  it('reduced motion cross-fades but the step still happens once', () => {
    const W = wrap(true);
    const view = render(<FinalScreen g={game({ final: final({ stage: 'reveal' }) })} />, { wrapper: W });
    view.rerender(<FinalScreen g={game({ final: final({ stage: 'reveal', cursor: 1 }) })} />);
    expect(screen.getAllByTestId('tv-final-name').map((e) => e.textContent)).toEqual(['Bob']);
    expect(playCue).toHaveBeenCalledTimes(1);
  });

  it('a judged answer: wager unchanged, a vector mark on the contestant chip (R7-9, R7-12)', () => {
    const W = wrap();
    const shown = (judged: boolean, correct: boolean | null) =>
      game({
        final: final({
          stage: 'reveal',
          step: 'answer',
          entries: [
            { competitorId: 'a', hasWager: true, hasAnswer: true, submitted: true, wager: 150, answer: 'Buda', judged, correct, profileId: 'p-a' },
            final().entries[1],
          ],
        }),
      });
    const view = render(<FinalScreen g={shown(false, null)} />, { wrapper: W });
    expect(screen.queryByTestId('score-delta')).toBeNull();
    expect(screen.queryByTestId('verdict-mark')).toBeNull();
    view.rerender(<FinalScreen g={shown(true, false)} />);
    expect(screen.queryByTestId('score-delta')).toBeNull();
    expect(screen.getByTestId('tv-final-wager').textContent).toContain('$150');
    const mark = screen.getByTestId('verdict-mark');
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark.dataset.correct).toBe('false');
    expect(mark.getAttribute('class')).toContain('is-down');
    cleanup();
    render(<FinalScreen g={shown(true, true)} />, { wrapper: W });
    expect(screen.getByTestId('verdict-mark').dataset.correct).toBe('true');
  });
});

describe('score change label (R5-7)', () => {
  it('shows +$ / −$ beside the changed score, then fades away', () => {
    vi.useFakeTimers();
    try {
      const W = wrap();
      const g = (a: number) => game({ phase: 'board', competitors: [player('a', 'Ann', a), player('b', 'Bob', 600)] });
      const view = render(<Scoreboard g={g(200)} />, { wrapper: W });
      expect(screen.queryByTestId('score-delta')).toBeNull(); // nothing on load
      view.rerender(<Scoreboard g={g(600)} />);
      expect(screen.getByTestId('score-delta').textContent).toBe('+$400');
      expect(screen.getByTestId('score-delta').dataset.dir).toBe('up');
      view.rerender(<Scoreboard g={g(600)} />); // duplicate state
      expect(screen.getAllByTestId('score-delta')).toHaveLength(1);
      view.rerender(<Scoreboard g={g(200)} />);
      expect(screen.getByTestId('score-delta').textContent).toBe('−$400');
      act(() => void vi.advanceTimersByTime(2000));
      expect(screen.queryByTestId('score-delta')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('team buzz-in (R5-5.10)', () => {
  const team = (buzzerMode: 'individual' | 'shared'): CompetitorView => ({ id: 't1', kind: 'team', name: 'Dragons', color: '#b91c1c', avatar: 'dragon', buzzerMode, memberIds: ['p-a', 'p-b'], score: 0 });
  const clueGame = (c: CompetitorView, profileId: string | null) =>
    game({
      mode: c.kind === 'team' ? 'team' : 'solo',
      phase: 'clue',
      competitors: [c],
      profiles: { 'p-a': profile('a', 'Alexandra Long', 'Alex'), 'p-b': profile('b', 'Sam') },
      clue: { clueId: 'c1', categoryName: 'Space', value: 200, question: 'Red planet', isDailyWager: false, stage: 'question', media: [], answerMedia: [], answerRevealed: false, answer: null, submission: null } as unknown as GameView['clue'],
      buzzer: { status: 'locked', winner: { competitorId: c.id, profileId, at: 1 }, early: [] } as unknown as GameView['buzzer'],
    });

  it('team name large, "Buzzed by" with the nickname (no permanent name)', () => {
    render(<CluePanel g={clueGame(team('individual'), 'p-a')} closing={false} zoomIn={false} onClosed={() => {}} />, { wrapper: wrap() });
    expect(screen.getByTestId('buzz-winner-name').textContent).toBe('Dragons');
    expect(screen.getByTestId('buzz-winner-sub').textContent).toBe('Buzzed by Alex');
    expect(screen.getByTestId('buzz-winner').textContent).not.toContain('Alexandra');
  });

  it('shared buzzer with nobody identified: just the team name', () => {
    render(<CluePanel g={clueGame(team('shared'), null)} closing={false} zoomIn={false} onClosed={() => {}} />, { wrapper: wrap() });
    expect(screen.getByTestId('buzz-winner-name').textContent).toBe('Dragons');
    expect(screen.queryByTestId('buzz-winner-sub')).toBeNull();
  });

  it('solo: the player name only', () => {
    render(<CluePanel g={clueGame(player('a', 'Ann', 0), 'p-a')} closing={false} zoomIn={false} onClosed={() => {}} />, { wrapper: wrap() });
    expect(screen.getByTestId('buzz-winner-name').textContent).toBe('Alex');
    expect(screen.queryByTestId('buzz-winner-sub')).toBeNull();
  });
});

describe('results podium (R5-10)', () => {
  it('1st in the centre, 2nd left, 3rd right, the rest listed; the headline names the winner', () => {
    const competitors = ['a', 'b', 'c', 'd', 'e'].map((id, i) => player(id, id.toUpperCase(), 1000 - i * 200));
    const profiles = Object.fromEntries(competitors.map((c) => [c.profileId!, profile(c.id, `Player ${c.id.toUpperCase()}`)]));
    const results = competitors.map((c, i) => ({ competitorId: c.id, score: c.score, placement: i + 1, isWinner: i === 0 }));
    render(<PodiumResults g={game({ phase: 'ended', competitors, profiles, results })} />, { wrapper: wrap() });
    expect(screen.getByTestId('winner').textContent).toBe('Player A wins!');
    expect(screen.getAllByTestId('tv-podium-entry').map((e) => e.dataset.place)).toEqual(['2', '1', '3']);
    const rest = screen.getAllByTestId('tv-results-rest-entry');
    expect(rest.map((e) => e.dataset.place)).toEqual(['4', '5']);
    expect(rest[0].textContent).toMatch(/^4th.*Player D.*400$/);
    expect(rest[1].textContent).toMatch(/^5th.*Player E.*200$/);
  });

  it('ties share a step and are labelled', () => {
    const competitors = [player('a', 'A', 500), player('b', 'B', 500)];
    const results = [
      { competitorId: 'a', score: 500, placement: 1, isWinner: true },
      { competitorId: 'b', score: 500, placement: 1, isWinner: true },
    ];
    render(<PodiumResults g={game({ phase: 'ended', competitors, results })} />, { wrapper: wrap(true) });
    expect(screen.getByTestId('winner').textContent).toBe("It's a tie!");
    expect(screen.getAllByTestId('tv-podium-entry').map((e) => e.dataset.placeLabel)).toEqual(['T-1st', 'T-1st']);
    expect(screen.getAllByText('Tie')).toHaveLength(2);
  });
});
