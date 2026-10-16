// Which Final Jeopardy! screen the TV shows, and how it changes (R5-6). Pure, for tests.
import type { FinalView } from '../../../shared/views';

export type SwipeKind = 'swipe' | 'fade';

/** One key per full screen: writing (category → wagers → clue, one screen that updates in
 *  place), each contestant's reveal, and the closing summary. */
export function finalScreenKey(f: Pick<FinalView, 'stage' | 'cursor'>): string {
  if (f.stage === 'reveal') return `reveal:${f.cursor}`;
  if (f.stage === 'done') return 'done';
  return 'pre';
}

/** Moving forward (answers → reveal, one contestant → the next) is a swipe with its sound; going
 *  back (undo) or to the summary is a quiet cross-fade. */
export function finalTransition(prev: string, next: string): SwipeKind {
  if (prev === next) return 'fade';
  const a = /^reveal:(\d+)$/.exec(prev);
  const b = /^reveal:(\d+)$/.exec(next);
  if (prev === 'pre' && b) return 'swipe';
  if (a && b && Number(b[1]) > Number(a[1])) return 'swipe';
  return 'fade';
}
