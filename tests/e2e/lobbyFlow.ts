// The host's way into a game since round 5 (R5-4): Home → Create Lobby → lobby management, where
// the board, mode and rules are chosen. Create Lobby reuses the last game's board/mode/rules, so
// specs set what they depend on explicitly.
import { expect, type Page } from '@playwright/test';

export async function createLobby(page: Page, opts: { board?: string; mode?: 'solo' | 'team'; preset?: string } = {}) {
  const board = opts.board ?? 'Starter Trivia Night';
  await page.getByTestId('create-lobby').click();
  await expect(page.getByTestId('lobby-manage')).toBeVisible();
  await expect(page.getByTestId('lobby-board')).not.toHaveText('…');
  if (!((await page.getByTestId('lobby-board').textContent()) ?? '').includes(board)) {
    await page.getByTestId('change-board').click();
    await page.getByTestId('board-option').filter({ hasText: board }).first().click();
    await page.getByTestId('use-board').click();
    await expect(page.getByTestId('lobby-board')).toContainText(board);
  }
  const mode = opts.mode ?? 'solo';
  if ((await page.getByTestId(`mode-${mode}`).getAttribute('aria-pressed')) !== 'true') {
    await page.getByTestId(`mode-${mode}`).click();
    await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByLabel('Rules preset').selectOption({ label: opts.preset ?? 'Classic' });
}
