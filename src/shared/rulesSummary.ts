// Plain-language summary of a game's settings — the host's setup summary and the TV's public
// rules page use the same wording.
import { EARLY_BUZZ_OPTIONS, RULE_PRESETS, type GameRules } from './game.js';

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
    { label: 'Daily Double! minimum wager', value: String(r.dailyWagerMin) },
    { label: 'Final Jeopardy!', value: r.finalAllowNonPositive ? 'Everyone plays' : 'Players with a positive score' },
    ...(r.survivalLives ? [{ label: 'Survival', value: `${r.survivalLives} lives each` }] : []),
    ...(ctx.mode === 'team' ? [{ label: 'After a wrong answer', value: r.teamRetry === 'otherMembers' ? 'A teammate may try' : 'One try per team' }] : []),
    ...(ctx.bots?.length ? [{ label: 'Computer opponents', value: ctx.bots.join(', ') }] : []),
    ...(ctx.practice ? [{ label: 'Practice game', value: 'Not counted in statistics' }] : []),
  ];
}

export interface PublicSettingsContext extends SummaryContext {
  teams?: { name: string; members: number; shared: boolean }[];
  tournament?: string | null;
}

/**
 * The read-only settings page on the TV (R3-4): only rules players care about, grouped, with a
 * short explanation each. Never includes room-code values, PINs, tokens, keys or device details.
 */
export function publicSettings(r: GameRules, ctx: PublicSettingsContext): { title: string; items: { label: string; value: string; hint?: string }[] }[] {
  const secs = (n: number) => (n > 0 ? `${n} seconds` : 'No time limit');
  const presetLabel = RULE_PRESETS[r.preset]?.label;
  const game = [
    { label: 'Mode', value: ctx.mode === 'team' ? 'Teams' : 'Individuals', hint: ctx.mode === 'team' ? 'Points belong to the team; personal answers still count in your statistics.' : 'Everyone plays for themselves.' },
    ...(ctx.boardTitle ? [{ label: 'Board', value: ctx.boardTitle }] : []),
    ...(presetLabel ? [{ label: 'Rule set', value: presetLabel, hint: RULE_PRESETS[r.preset]?.description }] : []),
    { label: 'Player limit', value: r.maxPlayers ? `${r.maxPlayers} players` : 'No limit' },
    { label: 'Joining', value: r.allowSelfJoin ? 'Scan the code and tap Join' : 'The host approves new players', hint: r.requireRoomCode ? 'You also need the room code shown on this screen.' : undefined },
    ...(ctx.tournament ? [{ label: 'Tournament', value: ctx.tournament, hint: 'This game counts towards the standings.' }] : []),
    ...(ctx.practice ? [{ label: 'Practice game', value: 'Not counted in statistics' }] : []),
    ...(r.survivalLives ? [{ label: 'Survival', value: `${r.survivalLives} ${r.survivalLives === 1 ? 'life' : 'lives'} each`, hint: 'Every wrong answer costs a life. With none left you are out.' }] : []),
  ];
  const teams =
    ctx.mode === 'team'
      ? [
          ...(ctx.teams ?? []).map((t) => ({ label: t.name, value: `${t.members} ${t.members === 1 ? 'player' : 'players'}`, hint: t.shared ? 'One shared team buzzer' : 'Everyone has their own buzzer' })),
          { label: 'Second try', value: r.teamRetry === 'otherMembers' ? 'A teammate may try after a wrong answer' : 'One try per team per clue' },
        ]
      : [];
  const buzzers = [
    { label: 'Buzzers open', value: AUTO_UNLOCK[r.autoUnlock], hint: r.autoUnlock === 'off' ? 'Wait until the host has read the clue.' : undefined },
    { label: 'Buzzing too early', value: EARLY_BUZZ_OPTIONS[r.earlyBuzzPenalty].label + (r.earlyBuzzPenalty === 'points' ? ` (−${r.earlyBuzzPoints})` : ''), hint: EARLY_BUZZ_OPTIONS[r.earlyBuzzPenalty].description },
    { label: 'After a wrong answer', value: r.autoReopenAfterIncorrect ? 'Buzzers reopen for the others' : 'The host reopens the buzzers' },
  ];
  const timers = [
    { label: 'Time to buzz in', value: secs(r.timers.buzzSeconds) },
    { label: 'Time to answer', value: secs(r.timers.answerSeconds) },
    { label: 'Time to wager', value: secs(r.timers.wagerSeconds) },
    { label: 'Final answer', value: secs(r.timers.finalSeconds) },
  ];
  const scoring = [
    { label: 'Wrong answers', value: r.incorrectDeducts ? 'Lose the clue value' : 'No penalty' },
    { label: 'Daily Double!', value: `Bet at least ${r.dailyWagerMin}`, hint: 'Up to your score, or the round’s top value if that is higher.' },
    { label: 'Final Jeopardy!', value: r.finalAllowNonPositive ? 'Everyone plays' : 'Only players with a positive score' },
    ...(ctx.bots?.length ? [{ label: 'Computer opponents', value: ctx.bots.join(', ') }] : []),
  ];
  return [
    { title: 'Game', items: game },
    ...(teams.length ? [{ title: 'Teams', items: teams }] : []),
    { title: 'Buzzers', items: buzzers },
    { title: 'Timers', items: timers },
    { title: 'Scoring and wagers', items: scoring },
  ];
}
