// Plain-language summary of a game's settings — the host's setup summary and the TV's public
// rules page use the same wording.
import { EARLY_BUZZ_OPTIONS, type GameRules } from './game.js';

export interface SummaryContext {
  mode: 'solo' | 'team';
  boardTitle?: string | null;
  practice?: boolean;
  bots?: string[]; // "Robo Rita (Easy)"
}

const AUTO_UNLOCK: Record<GameRules['autoUnlock'], string> = {
  off: 'The host opens them',
  all: 'Automatically for every clue',
  mediaOnly: 'Automatically for picture/sound clues without text',
  perClue: "As set on each clue",
};

export function summarizeRules(r: GameRules, ctx: SummaryContext): { label: string; value: string }[] {
  const secs = (n: number) => (n > 0 ? `${n} s` : 'off');
  return [
    ...(ctx.boardTitle ? [{ label: 'Board', value: ctx.boardTitle }] : []),
    { label: 'Mode', value: ctx.mode === 'team' ? 'Teams' : 'Individuals' },
    { label: 'Player limit', value: r.maxPlayers ? String(r.maxPlayers) : 'No limit' },
    { label: 'Wrong answers', value: r.incorrectDeducts ? 'Lose the clue value' : 'No penalty' },
    { label: 'Early buzzing', value: EARLY_BUZZ_OPTIONS[r.earlyBuzzPenalty].label + (r.earlyBuzzPenalty === 'points' ? ` (−${r.earlyBuzzPoints})` : '') },
    { label: 'Buzzers open', value: AUTO_UNLOCK[r.autoUnlock] },
    { label: 'Time to buzz in', value: secs(r.timers.buzzSeconds) },
    { label: 'Time to answer', value: secs(r.timers.answerSeconds) },
    { label: 'Daily Wager minimum', value: String(r.dailyWagerMin) },
    { label: 'Final Wager', value: r.finalAllowNonPositive ? 'Everyone plays' : 'Players with a positive score' },
    ...(r.survivalLives ? [{ label: 'Survival', value: `${r.survivalLives} lives each` }] : []),
    ...(ctx.mode === 'team' ? [{ label: 'After a wrong answer', value: r.teamRetry === 'otherMembers' ? 'A teammate may try' : 'One try per team' }] : []),
    ...(ctx.bots?.length ? [{ label: 'Computer opponents', value: ctx.bots.join(', ') }] : []),
    ...(ctx.practice ? [{ label: 'Practice game', value: 'Not counted in statistics' }] : []),
  ];
}
