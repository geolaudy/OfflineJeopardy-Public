// @vitest-environment jsdom
// Round 7, Milestone A (TV): Final judgments sound once even for a $0 wager (R7-8); manual score
// adjustments are silent and unanimated (R7-11); the Final clue is centred in the whole stage (R7-7).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import type { CompetitorView, FinalView, GameView, ProfilePublic } from '../../src/shared/views';

vi.mock('../../src/web/lib/sound', () => ({ playCue: vi.fn(), cueDuration: () => null }));
const { transitionCues } = await import('../../src/web/pages/board/soundCues');
const { Scoreboard } = await import('../../src/web/pages/board/Scoreboard');
const { FinalScreen } = await import('../../src/web/pages/board/FinalScreen');
const { BoardCtx, DEFAULT_SCALE } = await import('../../src/web/pages/board/common');

afterEach(() => cleanup());

const wrap = () =>
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <BoardCtx.Provider value={{ theme: 'classic', prefix: '$', logo: null, scale: DEFAULT_SCALE, reduced: false, vh: 900 }}>
        <MotionConfig reducedMotion="never">{children}</MotionConfig>
      </BoardCtx.Provider>
    );
  };
const player = (id: string, score: number): CompetitorView => ({ id, kind: 'player', profileId: `p-${id}`, name: id, color: '#1d4ed8', buzzerMode: 'individual', memberIds: [`p-${id}`], score });
const profile = (id: string) => ({ id: `p-${id}`, name: id.toUpperCase(), nickname: '', color: '#1d4ed8', avatar: 'owl', pictureUrl: null }) as unknown as ProfilePublic;
function game(over: Partial<GameView> = {}): GameView {
  return {
    role: 'public',
    id: 'g1',
    title: 'T',
    mode: 'solo',
    phase: 'board',
    roundIndex: 0,
    competitors: [player('a', 200), player('b', 600)],
    profiles: { 'p-a': profile('a'), 'p-b': profile('b') },
    buzzer: { status: 'locked', winner: null, early: [] },
    clue: null,
    final: null,
    timer: null,
    intro: null,
    rules: { survivalLives: 3 },
    results: null,
    scoreCause: null,
    ...over,
  } as unknown as GameView;
}
const entry = (id: string, judged: boolean, correct: boolean | null, wager = 0) => ({ competitorId: id, hasWager: true, hasAnswer: true, submitted: true, wager, answer: 'x', judged, correct, profileId: `p-${id}` });
const final = (entries: FinalView['entries'], over: Partial<FinalView> = {}) =>
  ({ stage: 'reveal', category: 'Capitals', question: 'Q', answer: null, order: ['a', 'b'], preScores: { a: 200, b: 600 }, cursor: 0, step: 'answer', entries, ...over }) as FinalView;

describe('Final judgment sounds (R7-8)', () => {
  it('a $0 wager judged correct / incorrect still plays the cue, once', () => {
    const before = game({ phase: 'final', final: final([entry('a', false, null), entry('b', false, null)]) });
    expect(transitionCues(before, game({ phase: 'final', final: final([entry('a', true, true), entry('b', false, null)]) }))).toEqual(['correct']);
    expect(transitionCues(before, game({ phase: 'final', final: final([entry('a', true, false), entry('b', false, null)]) }))).toEqual(['incorrect']);
  });
  it('a judgment that changes the score plays one cue, not two', () => {
    const before = game({ phase: 'final', final: final([entry('a', false, null, 150), entry('b', false, null)]) });
    const after = game({ phase: 'final', competitors: [player('a', 50), player('b', 600)], final: final([entry('a', true, false, 150), entry('b', false, null)]) });
    expect(transitionCues(before, after)).toEqual(['incorrect']);
  });
  it('the same judged state arriving again plays nothing', () => {
    const judged = game({ phase: 'final', final: final([entry('a', true, true), entry('b', false, null)]) });
    expect(transitionCues(judged, judged)).toEqual([]);
  });
});

describe('Manual score adjustments are silent (R7-11)', () => {
  const adjusted = (a: number, quiet: boolean, seq = 9) => game({ competitors: [player('a', a), player('b', 600)], scoreCause: { seq, quiet } });
  it('no correct / incorrect cue for an adjustment or an undo; gameplay changes still sound', () => {
    expect(transitionCues(adjusted(200, false, 1), adjusted(600, true, 2))).toEqual([]);
    expect(transitionCues(adjusted(200, false, 1), adjusted(-200, true, 2))).toEqual([]);
    expect(transitionCues(adjusted(200, false, 1), adjusted(600, false, 2))).toEqual(['correct']);
  });
  it('the score box shows the new total at once — no ±$ swap, no settle animation', () => {
    vi.useFakeTimers();
    try {
      const view = render(<Scoreboard g={adjusted(200, false, 1)} />, { wrapper: wrap() });
      view.rerender(<Scoreboard g={adjusted(600, true, 2)} />);
      expect(screen.queryByTestId('score-delta')).toBeNull();
      const v = screen.getAllByTestId('score-value')[0];
      expect(v.textContent).toBe('$600');
      expect(v.className).not.toContain('is-settle');
      // A gameplay change afterwards animates again.
      view.rerender(<Scoreboard g={adjusted(1000, false, 3)} />);
      expect(screen.getByTestId('score-delta').textContent).toBe('+$400');
      act(() => void vi.advanceTimersByTime(1500));
      expect(screen.getAllByTestId('score')[0].textContent).toBe('$1,000');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Final clue layout (R7-7)', () => {
  it('the clue sits in a full-stage layer; the submission chips move under it', () => {
    render(<FinalScreen g={game({ phase: 'final', final: final([entry('a', false, null), entry('b', false, null)], { stage: 'clue', step: 'contestant' }) })} />, { wrapper: wrap() });
    const q = screen.getByText('Q');
    expect(q.closest('.bt-final-q')).not.toBeNull();
    expect(screen.getByTestId('tv-final-status').className).toContain('mt-auto');
  });
});

describe('Board-control star and score-card colours (R7-6, R7-14)', async () => {
  const { FxCtx } = await import('../../src/web/pages/board/fx');
  const { DEFAULT_TV_FX } = await import('../../src/shared/tvFx');
  const withFx = (scoreColor: 'picture' | 'name' | 'both') =>
    function Wrap({ children }: { children: ReactNode }) {
      const W = wrap();
      return (
        <W>
          <FxCtx.Provider value={{ ...DEFAULT_TV_FX, scoreColor }}>{children}</FxCtx.Provider>
        </W>
      );
    };
  it('one star for the player in control; every box keeps a star slot, so nothing moves', () => {
    render(<Scoreboard g={game({ controlCompetitorId: 'b' })} />, { wrapper: withFx('picture') });
    expect(screen.getAllByTestId('control-star')).toHaveLength(1);
    const boxes = screen.getAllByTestId('podium');
    expect(boxes[1].dataset.control).toBe('true');
    for (const b of boxes) expect(b.querySelectorAll('.bt-star-slot')).toHaveLength(2); // star + mirror
    expect(boxes[1].className).not.toContain('is-control'); // no second outline
  });
  it('no star in the Final; the buzz-in highlight is separate from the star', () => {
    render(<Scoreboard g={game({ phase: 'final', controlCompetitorId: 'b' })} />, { wrapper: withFx('picture') });
    expect(screen.queryByTestId('control-star')).toBeNull();
    cleanup();
    render(<Scoreboard g={game({ phase: 'clue', controlCompetitorId: 'b', buzzer: { status: 'locked', winner: { competitorId: 'a', profileId: 'p-a', at: 1 }, early: [] } } as Partial<GameView>)} />, { wrapper: withFx('picture') });
    const boxes = screen.getAllByTestId('podium');
    expect(boxes[0].className).toContain('is-winner');
    expect(boxes[1].querySelector('[data-testid="control-star"]')).not.toBeNull();
  });
  it('picture border (default), name colour, or both', () => {
    const view = render(<Scoreboard g={game()} />, { wrapper: withFx('picture') });
    expect(screen.getAllByTestId('podium-avatar')[0].className).toContain('is-ring');
    expect(screen.getAllByTestId('podium-name')[0].style.color).toBe('');
    view.unmount();
    render(<Scoreboard g={game()} />, { wrapper: withFx('name') });
    expect(screen.getAllByTestId('podium-avatar')[0].className).not.toContain('is-ring');
    expect(screen.getAllByTestId('podium-name')[0].style.color).not.toBe('');
    cleanup();
    render(<Scoreboard g={game()} />, { wrapper: withFx('both') });
    expect(screen.getAllByTestId('podium-avatar')[0].className).toContain('is-ring');
    expect(screen.getAllByTestId('podium-name')[0].style.color).not.toBe('');
  });
  it('a dark lobby colour is lightened for a readable name on the board blue', async () => {
    const { readableTextOn, contrastRatio } = await import('../../src/web/lib/avatars');
    const c = readableTextOn('#1d4ed8', '#071277');
    expect(contrastRatio(c, '#071277')).toBeGreaterThanOrEqual(3);
    expect(readableTextOn('#fde047', '#071277')).toBe('#fde047'); // already readable: unchanged
  });
});
