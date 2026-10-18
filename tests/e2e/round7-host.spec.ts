// Round 7 (iPad host): every host page fits the visible viewport in Safari and in Home-Screen mode,
// portrait and landscape — the document itself never scrolls (Safari would collapse its toolbars
// and shift the app), and the sidebar's Present on TV switch is always fully on screen (R7-19).
import { test, expect, webkit, devices, request, type Browser, type Page } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let wk: Browser;
test.beforeAll(async () => {
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const c of wk?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
});

const PAGES = ['/host', '/host/boards', '/host/players', '/host/teams', '/host/buzzers', '/host/leaderboard', '/host/history', '/host/tournaments', '/host/settings', '/host/help'];

/** What the page looks like to Safari: document overflow, and where the Present on TV switch is. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const sw = document.querySelector('[data-testid="present-toggle"]') as HTMLElement | null;
    const visible = sw && sw.offsetParent !== null ? sw.getBoundingClientRect() : null;
    // Scrolling the window must not move anything (the app scrolls inside <main>).
    window.scrollTo(0, 10_000);
    const scrolled = window.scrollY;
    window.scrollTo(0, 0);
    return { docOverflow: doc.scrollHeight - window.innerHeight, docOverflowX: doc.scrollWidth - window.innerWidth, scrolled, toggleBottom: visible ? visible.bottom : null, vh: window.innerHeight };
  });
}

test('host pages fit Safari (toolbars shown / hidden) and Home-Screen mode, both orientations', async () => {
  test.setTimeout(240_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 7 host' } });
  const land = devices['iPad Pro 11 landscape'];
  const port = devices['iPad Pro 11'];
  // Visible heights: Home-Screen web app (full), Safari with its toolbar, Safari with tabs + toolbar.
  const sizes = [
    { name: 'landscape-webapp', dev: land, w: 1194, h: 834 },
    { name: 'landscape-safari', dev: land, w: 1194, h: 760 },
    { name: 'landscape-safari-tabs', dev: land, w: 1194, h: 724 },
    { name: 'ipad9-landscape-safari', dev: land, w: 1080, h: 740 },
    { name: 'portrait-webapp', dev: port, w: 834, h: 1194 },
    { name: 'portrait-safari', dev: port, w: 834, h: 1120 },
  ];
  const problems: string[] = [];
  for (const s of sizes) {
    const ctx = await wk.newContext({ ...s.dev, viewport: { width: s.w, height: s.h } });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
      const m = await measure(page);
      if (m.docOverflow > 0 || m.scrolled > 0) problems.push(`${s.name} ${path}: document scrolls (${m.docOverflow}px, scrollY ${m.scrolled})`);
      if (m.docOverflowX > 0) problems.push(`${s.name} ${path}: horizontal overflow ${m.docOverflowX}px`);
      if (m.toggleBottom != null && m.toggleBottom > m.vh) problems.push(`${s.name} ${path}: Present on TV ends at ${Math.round(m.toggleBottom)} > ${m.vh}`);
      // Viewport resizes like Safari's toolbar collapsing / expanding must not change that.
      if (s.name === 'landscape-safari') {
        await page.setViewportSize({ width: s.w, height: 834 });
        await page.waitForTimeout(100);
        const big = await measure(page);
        await page.setViewportSize({ width: s.w, height: s.h });
        await page.waitForTimeout(100);
        const back = await measure(page);
        for (const [k, v] of [['toolbar hidden', big], ['toolbar back', back]] as const) {
          if (v.docOverflow > 0) problems.push(`${s.name} ${path} (${k}): document scrolls ${v.docOverflow}px`);
          if (v.toggleBottom != null && v.toggleBottom > v.vh) problems.push(`${s.name} ${path} (${k}): Present on TV off screen`);
        }
      }
      if (path === '/host/boards') await page.screenshot({ path: `test-results/screens/r7-${s.name}-boards.png` });
    }
    await ctx.close();
  }
  expect(problems).toEqual([]);
  await api.delete('/api/lobby', { headers: H });
});

test('host sub-pages have a way back on small screens (R7-28)', async () => {
  const page = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await page.goto(`${BASE}/host/settings`);
  await page.getByRole('link', { name: /TV theme/i }).click();
  await expect(page).toHaveURL(/\/host\/themes$/);
  await expect(page.getByTestId('app-back')).toBeVisible();
  await expect(page.getByTestId('themes-back')).toBeVisible();
  await page.getByTestId('app-back').click();
  await expect(page).toHaveURL(/\/host\/settings$/);
  await page.goBack(); // browser back still works
  await expect(page).toHaveURL(/\/host\/themes$/);
  await page.getByTestId('themes-back').click();
  await expect(page).toHaveURL(/\/host\/settings$/);
});

test('the phone buzzer keeps its size and position in every state (R7-29)', async () => {
  test.setTimeout(120_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 7 phone' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await import('./hostSocket').then((m) => m.hostSocket(host));
  await h.until((g) => !!g);
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('new-profile').click();
  await phone.getByLabel('Your name', { exact: true }).fill(`Buzz Size ${Date.now() % 10000}`);
  await phone.getByLabel('PIN', { exact: true }).fill('2468');
  await phone.getByLabel('Confirm PIN').fill('2468');
  await phone.getByRole('button', { name: 'Create profile' }).click();
  await phone.getByTestId('join-game').click();
  const g0 = await h.until((g) => g.competitors?.length === 1);
  const other = (await (await api.post('/api/profiles', { data: { name: `Other ${Date.now() % 10000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } })).json()) as { profile: { id: string } };
  await h.act({ type: 'addPlayer', profileId: other.profile.id });
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  // Layout box (offset metrics ignore the short press-feedback scale).
  const box = () => phone.getByTestId('buzzer').evaluate((el: HTMLElement) => [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight].join(','));
  await expect(phone.getByTestId('buzzer')).toBeVisible();
  const states: Record<string, string> = { board: await box() };
  const clue = g0.rounds[0].categories[0].clues[0].id;
  await h.act({ type: 'selectClue', clueId: clue });
  await expect(phone.getByTestId('buzz-clue-line')).not.toHaveText('');
  states.clue = await box();
  await phone.getByTestId('buzzer').dispatchEvent('pointerdown'); // too early
  await expect(phone.getByTestId('buzz-status')).toContainText('Too early');
  states.early = await box();
  await phone.waitForTimeout(1500); // the short early-buzz lockout passes
  await h.act({ type: 'unlockBuzzers' });
  await expect(phone.getByTestId('buzzer')).toHaveAttribute('data-color', 'yellow');
  states.open = await box();
  await phone.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(phone.getByTestId('buzzer')).toHaveAttribute('data-color', 'green');
  await expect(phone.getByTestId('phone-timer')).toBeVisible();
  states.won = await box();
  await phone.screenshot({ path: 'test-results/screens/r7-phone-buzzer-won.png' });
  expect(new Set(Object.values(states)).size, JSON.stringify(states)).toBe(1);
  await h.act({ type: 'judge', result: 'correct' });
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
});
