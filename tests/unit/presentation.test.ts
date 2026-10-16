// TV presentation polish (round 5, Milestone F): podium layout (R5-10), Final screen keys and
// transitions (R5-6), score-change labels (R5-7).
import { describe, expect, it } from 'vitest';
import { ordinal, placeLabel, podiumLayout } from '../../src/web/pages/board/podiumModel';
import { finalScreenKey, finalTransition } from '../../src/web/pages/board/finalSwipe';
import { deltaText } from '../../src/web/pages/board/common';

const r = (competitorId: string, score: number, placement: number) => ({ competitorId, score, placement, isWinner: placement === 1 });

describe('podiumLayout', () => {
  it('puts 2nd left, 1st centre, 3rd right and lists 4th+ underneath', () => {
    const l = podiumLayout([r('a', 900, 1), r('b', 500, 2), r('c', 300, 3), r('d', 100, 4), r('e', -200, 5)]);
    expect(l.columns.map((c) => c.competitorId)).toEqual(['b', 'a', 'c']);
    expect(l.rest.map((c) => c.competitorId)).toEqual(['d', 'e']);
    expect(l.steps).toBe(3);
    // Steps rise 3rd → 2nd → 1st.
    expect(Object.fromEntries(l.columns.map((c) => [c.placement, c.riseOrder]))).toEqual({ 3: 0, 2: 1, 1: 2 });
  });

  it('adapts to one or two contestants', () => {
    expect(podiumLayout([r('a', 100, 1)]).columns.map((c) => c.competitorId)).toEqual(['a']);
    const two = podiumLayout([r('a', 100, 1), r('b', 0, 2)]);
    expect(two.columns.map((c) => c.competitorId)).toEqual(['b', 'a']);
    expect(two.columns.find((c) => c.placement === 1)!.riseOrder).toBe(1);
    expect(two.rest).toEqual([]);
  });

  it('follows the server placement for ties: shared winners share the top step', () => {
    const l = podiumLayout([r('a', 800, 1), r('b', 800, 1), r('c', 300, 3), r('d', 300, 3), r('e', 0, 5)]);
    expect(l.columns.map((c) => [c.competitorId, c.placement, c.tied, c.groupStart])).toEqual([
      ['a', 1, true, true],
      ['b', 1, true, false],
      ['c', 3, true, true],
      ['d', 3, true, false],
    ]);
    expect(l.rest.map((c) => c.competitorId)).toEqual(['e']);
    expect(l.steps).toBe(2);
  });

  it('labels places', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
    expect(placeLabel(1, true)).toBe('T-1st');
    expect(placeLabel(4, false)).toBe('4th');
  });
});

describe('Final screen transitions', () => {
  it('keys one screen for writing, one per contestant and one for the summary', () => {
    expect(['category', 'wagers', 'clue'].map((stage) => finalScreenKey({ stage: stage as 'clue', cursor: 0 }))).toEqual(['pre', 'pre', 'pre']);
    expect(finalScreenKey({ stage: 'reveal', cursor: 2 })).toBe('reveal:2');
    expect(finalScreenKey({ stage: 'done', cursor: 2 })).toBe('done');
  });

  it('swipes forward only; undo and the summary cross-fade', () => {
    expect(finalTransition('pre', 'reveal:0')).toBe('swipe');
    expect(finalTransition('reveal:0', 'reveal:1')).toBe('swipe');
    expect(finalTransition('reveal:1', 'reveal:0')).toBe('fade');
    expect(finalTransition('reveal:0', 'pre')).toBe('fade');
    expect(finalTransition('reveal:2', 'done')).toBe('fade');
    expect(finalTransition('reveal:1', 'reveal:1')).toBe('fade');
  });
});

describe('score change labels', () => {
  it('uses a plus sign or a real minus sign and the theme prefix', () => {
    expect(deltaText('$', 400)).toBe('+$400');
    expect(deltaText('$', -400)).toBe('−$400');
    expect(deltaText('$', 1200)).toBe(`+$${(1200).toLocaleString()}`);
    expect(deltaText('', -50)).toBe('−50');
  });
});
