// Keyboard shortcuts for hosting from a PC/laptop (or an iPad with a keyboard). They call the
// same host actions as the buttons; the server validates everything as usual.
import { useEffect, useRef } from 'react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';

export const HOST_SHORTCUTS: [string, string][] = [
  ['Space', 'Unlock / lock buzzers'],
  ['B', 'Buzz (single player)'],
  ['C', 'Correct'],
  ['X', 'Incorrect'],
  ['E', 'Nobody knows (end answering)'],
  ['R', 'Reveal answer'],
  ['Enter', 'Return to board'],
  ['N', 'Next category (introduction)'],
  ['Ctrl+Z', 'Undo'],
];

/** Returns the action for a key in the current state, or null. Exported for tests. */
export function shortcutAction(key: string, ctrl: boolean, g: GameView): HostAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (ctrl && k === 'z') return g.undoLabel ? { type: 'undo' } : null;
  if (ctrl) return null;
  if (g.phase === 'board' && g.intro && (k === 'n' || k === 'ArrowRight')) return { type: 'introNext' };
  const clue = g.clue;
  if (g.phase !== 'clue' || !clue) return null;
  const judgeable = !clue.resolved && (clue.isDailyWager ? clue.stage === 'question' : !!g.buzzer.winner);
  switch (k) {
    case ' ':
      if (clue.isDailyWager || clue.resolved || clue.answerRevealed) return null;
      return g.buzzer.status === 'open' ? { type: 'lockBuzzers' } : g.buzzer.winner ? null : { type: 'unlockBuzzers' };
    case 'c':
      return judgeable && !(g.competitors.find((c) => c.id === g.buzzer.winner?.competitorId)?.buzzerMode === 'shared') ? { type: 'judge', result: 'correct' } : null;
    case 'x':
      return judgeable && !(g.competitors.find((c) => c.id === g.buzzer.winner?.competitorId)?.buzzerMode === 'shared') ? { type: 'judge', result: 'incorrect' } : null;
    case 'b': {
      // Single-player: buzz for the one human player (computer opponents buzz on their own).
      const humans = g.competitors.filter((c) => !c.bot && !g.buzzer.attemptedCompetitors.includes(c.id));
      return g.buzzer.status === 'open' && !g.buzzer.winner && humans.length === 1 ? { type: 'hostBuzz', competitorId: humans[0].id } : null;
    }
    case 'e':
      return !clue.isDailyWager && !clue.answeringEnded && !g.buzzer.winner ? { type: 'endAnswering', clueId: clue.clueId } : null;
    case 'r':
      return clue.answerRevealed ? null : { type: 'revealAnswer', clueId: clue.clueId };
    case 'Enter':
      return clue.answerRevealed ? { type: 'closeClue', clueId: clue.clueId } : null;
    default:
      return null;
  }
}

export function useHostShortcuts(g: GameView, run: (a: HostAction) => unknown) {
  const ref = useRef({ g, run });
  ref.current = { g, run };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Dialogs and the menu own the keyboard while they are open.
      if (document.querySelector('[role="dialog"], nav[aria-label="Main menu"]')) return;
      // Team answers with a shared buzzer need the host to pick who answered — use the buttons.
      const a = shortcutAction(e.key, e.ctrlKey, ref.current.g);
      if (!a) return;
      e.preventDefault();
      void ref.current.run(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
