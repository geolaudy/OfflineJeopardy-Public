// Round 4 helpers: sound-file → cue mapping (R4-1), board-fill timeline (R4-19), lobby colour
// fallback (R4-13) and the shared navigation order (R4-9).
import { describe, expect, it } from 'vitest';
import { cueForFileName, DEFAULT_TV_FX } from '../../src/shared/tvFx';
import { revealTimeline, revealSeconds } from '../../src/web/pages/board/fx';
import { extraLobbyColor, firstFreeColor, LOBBY_COLORS } from '../../src/shared/game';
import { NAV } from '../../src/shared/navigation';

describe('sound pack file names (R4-1)', () => {
  it('maps the provided new_sfx files to their cues and ignores the rest', () => {
    const map = Object.fromEntries(
      ['Final Jeopardy Think.mp3', 'board_fill.mp3', 'buzzed_in.mp3', 'catagory_swipe.mp3', 'clue background.jpg', 'correct_answer.mp3', 'daily_double.mp3', 'final_category_reveal.mp3', 'times_up.mp3', 'wrong_answer.mp3'].map((f) => [f, cueForFileName(f)]),
    );
    expect(map).toEqual({
      'Final Jeopardy Think.mp3': 'finalThink',
      'board_fill.mp3': 'boardIntro',
      'buzzed_in.mp3': 'buzz',
      'catagory_swipe.mp3': 'categoryIntro',
      'clue background.jpg': null,
      'correct_answer.mp3': 'correct',
      'daily_double.mp3': 'dailyWager',
      'final_category_reveal.mp3': 'final',
      'times_up.mp3': 'timeUp',
      'wrong_answer.mp3': 'incorrect',
    });
    expect(cueForFileName('Incorrect.wav')).toBe('incorrect'); // "incorrect" is not "correct"
    expect(cueForFileName('holiday photo.mp3')).toBeNull();
  });
});

describe('board fill timeline (R4-19)', () => {
  it('stretches the reveal to the sound and falls back to the speed setting without one', () => {
    expect(revealTimeline(DEFAULT_TV_FX, 3.971)).toBeCloseTo(3.653, 2); // tiles end just before the sound
    expect(revealTimeline(DEFAULT_TV_FX, null)).toBe(revealSeconds(DEFAULT_TV_FX));
    expect(revealTimeline(DEFAULT_TV_FX, 0.3)).toBe(revealSeconds(DEFAULT_TV_FX)); // too short to follow
    expect(revealTimeline(DEFAULT_TV_FX, 30)).toBe(6); // never drags on
  });
});

describe('lobby colours (R4-13)', () => {
  it('uses the palette first, then distinct generated colours', () => {
    const taken = new Set(LOBBY_COLORS.map((c) => c.toLowerCase()));
    const extra = firstFreeColor(taken);
    expect(LOBBY_COLORS).not.toContain(extra);
    expect(extra).toMatch(/^#[0-9a-f]{6}$/);
    const many = Array.from({ length: 40 }, (_, i) => extraLobbyColor(i));
    expect(new Set(many).size).toBe(40);
  });
});

describe('navigation order (R4-9)', () => {
  it('is the agreed order, and the TV rail follows it', () => {
    expect(NAV.map((n) => n.label)).toEqual(['Home', 'Boards', 'Players', 'Teams', 'Buzzers', 'Leaderboards', 'History', 'Tournaments', 'Settings', 'Help']);
    expect(NAV.filter((n) => n.tv).map((n) => n.tv)).toEqual(['lobby', 'boards', 'players', 'teams', 'buzzers', 'leaderboard', 'rules']);
  });
});
