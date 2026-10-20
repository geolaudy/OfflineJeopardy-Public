// @vitest-environment jsdom
// Round 6, Milestone C: the active TV lobby's header names the board (eyebrow "Board", the board's
// name, "2 Rounds • 60 Clues • Final Jeopardy!") with no separate board card (R6-10); one
// right-hand panel holds the game rules and the join instructions/address (R6-11); the compact
// corner panel shows the count, board, address and a required room code (R6-8).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { LobbyFull } from '../../src/web/pages/board/LobbyFull';
import { CompactLobby } from '../../src/web/pages/board/CompactLobby';
import { BoardCtx, DEFAULT_SCALE } from '../../src/web/pages/board/common';
import { boardMeta, boardName, type LobbyModel } from '../../src/web/pages/board/lobbyModel';

function Wrap({ children }: { children: ReactNode }) {
  return (
    <BoardCtx.Provider value={{ theme: 'classic', prefix: '$', logo: null, scale: DEFAULT_SCALE, reduced: true, vh: 900 }}>
      <MotionConfig reducedMotion="always">{children}</MotionConfig>
    </BoardCtx.Provider>
  );
}

const model = (over: Partial<LobbyModel> = {}): LobbyModel => ({
  preparing: false,
  kicker: 'Friday night',
  title: 'Starter Trivia Night',
  boardTitle: null,
  mode: 'solo',
  count: 2,
  max: 0,
  people: [
    { key: '|Ann', name: 'Ann', color: '#dc2626', avatar: 'fox', pictureUrl: null, device: 'Phone', ready: true, bot: false },
    { key: '|Bob', name: 'Bob', color: '#2563eb', avatar: 'owl', pictureUrl: null, device: 'Joy-Con (L)', ready: false, bot: false },
  ],
  teams: null,
  ready: 1,
  buzzers: 2,
  waiting: [],
  practice: false,
  hostConnected: true,
  markers: { crown: false, leader: false },
  rules: [
    { label: 'Early buzz', value: '0.25 s lockout' },
    { label: 'Time to buzz in', value: '10 s' },
    { label: 'Daily Double!', value: 'Wager 5 up to your score' },
  ],
  board: { title: 'Starter Trivia Night', description: '', rounds: 2, clues: 60, final: true },
  maxPerTeam: 0,
  waitingPeople: [],
  ...over,
});

afterEach(cleanup);

describe('board line (R6-10)', () => {
  it('rounds, clues and the Final, singular where it applies', () => {
    expect(boardMeta({ title: 'B', description: '', rounds: 2, clues: 60, final: true })).toBe('2 Rounds • 60 Clues • Final Jeopardy!');
    expect(boardMeta({ title: 'B', description: '', rounds: 1, clues: 1, final: false })).toBe('1 Round • 1 Clue');
    expect(boardMeta(null)).toBeNull();
  });
  it('the title is the selected board, falling back to the game title', () => {
    expect(boardName(model())).toBe('Starter Trivia Night');
    expect(boardName(model({ board: null, title: 'Game night' }))).toBe('Game night');
  });
});

describe('active lobby on the TV (R6-10, R6-11)', () => {
  it('header: eyebrow "Board", the board name once, the metadata row; no board card', () => {
    render(<LobbyFull m={model()} morphIn={false} roomCode={null} />, { wrapper: Wrap });
    const head = screen.getByTestId('tv-lobby-board');
    expect(within(head).getByText('Board')).toBeTruthy();
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Starter Trivia Night');
    expect(head.textContent).toContain('2 Rounds • 60 Clues • Final Jeopardy!');
    expect(screen.getAllByText('Starter Trivia Night')).toHaveLength(1);
    expect(screen.queryByText('Friday night')).toBeNull(); // the generic kicker is gone
    expect(document.querySelector('.tvp-side-card')).toBeNull();
    expect(screen.getByTestId('tv-lobby-count').textContent).toBe('2 players');
  });

  it('one right-hand panel: Join the Game (steps, room code) and the Game Rules', () => {
    render(<LobbyFull m={model()} morphIn={false} roomCode="QXZW" />, { wrapper: Wrap });
    const side = screen.getByTestId('tv-lobby-side');
    expect(side.textContent).toContain('Join the Game');
    expect(side.textContent).toContain('Scan the code.');
    expect(side.textContent).not.toContain('Or open'); // R13-9: the address is under the QR code (Presenter)
    expect(within(side).getByTestId('tv-room-code').textContent).toContain('QXZW');
    const rules = within(side).getByTestId('tv-lobby-rules');
    expect(rules.textContent).toContain('Game Rules');
    expect(rules.textContent).toContain('0.25 s lockout');
    expect(rules.textContent).toContain('Wager 5 up to your score');
  });

  it('a different game title stays visible as a chip (the board name is not repeated)', () => {
    render(<LobbyFull m={model({ title: 'Office Quiz' })} morphIn={false} roomCode={null} />, { wrapper: Wrap });
    expect(screen.getByTestId('tv-lobby-board').textContent).toContain('Office Quiz');
    expect(screen.getAllByText('Starter Trivia Night')).toHaveLength(1);
  });
});

describe('compact corner panel (R6-8)', () => {
  it('count, board and buzzer readiness, a required room code — no address line (R8-6.1: the QR has it)', () => {
    const { unmount } = render(<CompactLobby m={model()} roomCode={null} />, { wrapper: Wrap });
    const panel = screen.getByTestId('tv-lobby-compact');
    expect(panel.textContent).toContain('players joined');
    expect(panel.textContent).toContain('Starter Trivia Night');
    expect(panel.textContent).toContain('1 of 2 ready');
    expect(panel.textContent).not.toContain('/join');
    unmount();
    render(<CompactLobby m={model()} roomCode="QXZW" />, { wrapper: Wrap });
    expect(screen.getByTestId('tv-room-code').textContent).toContain('QXZW');
  });
});
