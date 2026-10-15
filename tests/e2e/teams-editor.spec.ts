// E2E: board import + editing in the desktop dashboard, then a team game with one
// individual-buzzer team and one shared-buzzer team (keyboard key on the TV window),
// host attribution, and the complete Final Jeopardy! flow with phone wager/answer (R4-2).
import { test, expect, chromium, webkit, devices, request, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let wk: Browser;
let cr: Browser;
test.beforeAll(async () => {
  wk = await webkit.launch();
  cr = await chromium.launch();
});
// Close every page after each test: lingering WebKit contexts slow down later tests on Windows.
test.afterEach(async () => {
  for (const b of [wk, cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
  await cr?.close();
});

const CSV = `round,category,value,question,answer,daily_wager,notes
Round 1,Space,200,The red planet.,Mars,,
Round 1,Space,400,Our galaxy.,The Milky Way,,
Round 1,Food,200,Main ingredient of guacamole.,Avocado,,
Round 1,Food,400,Spice that makes curry yellow.,Turmeric,,
Final,Capitals,0,Capital of Hungary.,Budapest,,
`;

test('import + edit a board, then a mixed-mode team game through the Final', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H }); // start without a loaded game
  const mk = async (name: string) => (await (await api.post('/api/profiles', { data: { name, color: '#1d4ed8', avatar: 'owl', pin: '2468' } })).json()) as { token: string; profile: { id: string } };
  const [alex, jordan, taylor, sam] = await Promise.all(['TAlex', 'TJordan', 'TTaylor', 'TSam'].map(mk));

  // ---- Desktop: import CSV through the library, edit a clue in the editor ----
  const desk = await (await cr.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await desk.goto(`${BASE}/host/boards`);
  await desk.getByRole('button', { name: /^Import/ }).first().click();
  await desk.locator('#import-file').setInputFiles({ name: 'team-test.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await desk.getByLabel('Board title').fill('Team Test Board');
  await desk.getByRole('button', { name: 'Save and edit' }).click();
  await expect(desk).toHaveURL(/\/host\/boards\/[0-9a-f-]{36}$/);
  const boardId = desk.url().split('/').pop()!;
  await desk.getByRole('button', { name: 'Edit Space 200' }).click();
  await desk.getByLabel('Question (shown on the board)').fill('Known as the Red Planet.');
  await desk.getByRole('button', { name: 'Done' }).click();
  await desk.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(desk.getByText('Saved — version recorded')).toBeVisible();
  const saved = await (await api.get(`/api/boards/${boardId}`, { headers: H })).json();
  expect(saved.content.rounds[0].categories[0].clues[0].question).toBe('Known as the Red Planet.');
  expect(saved.content.rounds[1].kind).toBe('final');

  // ---- TV window on the game PC (trusted keyboard bridge) ----
  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);

  // ---- iPad host: create team game from the edited board ----
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByRole('button', { name: /Team Test Board/ }).click();
  await ipad.getByRole('button', { name: 'Teams', exact: true }).click();
  await ipad.getByRole('button', { name: 'Open lobby' }).click();

  const makeTeam = async (name: string, shared: boolean, members: string[]) => {
    await ipad.getByRole('button', { name: '+ New team' }).click();
    await ipad.getByLabel('Team name').fill(name);
    if (shared) await ipad.getByRole('button', { name: 'One shared buzzer' }).click();
    await ipad.getByRole('button', { name: 'Save team' }).click();
    const card = ipad.getByTestId('team-card').filter({ hasText: name }).locator('..');
    for (const m of members) {
      await card.getByRole('button', { name: '+ Add player' }).click();
      await ipad.getByRole('dialog').getByRole('button', { name: m }).click();
      await ipad.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    }
  };
  await makeTeam('Wizards', false, ['TAlex', 'TJordan']);
  await makeTeam('Dragons', true, ['TTaylor', 'TSam']);
  const dragonsMode = ipad.getByRole('radiogroup', { name: 'Dragons buzzer mode' });
  await expect(dragonsMode.getByRole('radio', { checked: true })).toContainText('One shared buzzer');
  await expect(ipad.getByRole('radiogroup', { name: 'Wizards buzzer mode' }).getByRole('radio', { checked: true })).toContainText('Each player buzzes');

  // Assign the "P" key on the TV computer as the Dragons' shared buzzer
  await ipad.getByRole('tab', { name: '2. Buzzers' }).click();
  await ipad.getByTestId('assignment-row').filter({ hasText: 'Dragons — shared team buzzer' }).getByRole('button', { name: /controller/ }).click();
  await expect(ipad.getByText('to press a button')).toBeVisible();
  await tv.keyboard.press('KeyP');
  await expect(ipad.getByTestId('assignment-row').filter({ hasText: 'Dragons' })).toContainText('Key P');
  await ipad.getByTestId('start-game').click();
  // R4-16: categories are presented (or skipped) before any clue can be opened.
  await expect(ipad.getByTestId('host-tile')).toHaveCount(0);
  await ipad.getByTestId('intro-skip').click();

  // ---- Clue 1: Dragons buzz with the shared key; host credits TTaylor ----
  await ipad.getByRole('button', { name: 'Space for 200' }).click();
  await expect(tv.getByTestId('clue-text')).toContainText('RED PLANET', { ignoreCase: true });
  await ipad.getByTestId('unlock').click();
  await expect(tv.getByText('BUZZERS OPEN')).toBeVisible();
  await tv.waitForTimeout(150); // past the debounce window of the assignment press
  await tv.keyboard.press('KeyP');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Dragons');
  await expect(tv.getByTestId('buzz-winner')).toContainText('Dragons');
  await expect(ipad.getByRole('radio', { name: 'Team only / unknown' })).toBeChecked(); // never assumed
  await ipad.getByRole('radio', { name: 'TTaylor' }).click();
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // ---- Clue 2: Wizards member buzzes from phone (individual mode) ----
  const alexPhone = await (await cr.newContext({ ...devices['Pixel 7'] })).newPage();
  await alexPhone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), alex.token);
  await alexPhone.goto(`${BASE}/join`);
  const taylorPhone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await taylorPhone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), taylor.token);
  await taylorPhone.goto(`${BASE}/join`);
  await expect(taylorPhone.getByTestId('buzz-status')).toHaveText('Your team uses a shared buzzer');
  await ipad.getByRole('button', { name: 'Food for 400' }).click();
  await ipad.getByTestId('unlock').click();
  await alexPhone.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Wizards');
  await expect(ipad.getByRole('radio', { name: 'TAlex' })).toBeChecked(); // identified buzzer
  await ipad.getByTestId('incorrect').click();
  await ipad.getByTestId('reveal-answer').click();
  await ipad.getByTestId('back-to-board').click();
  await expect(tv.getByTestId('scoreboard')).toContainText('−400');

  // ---- Final Jeopardy!: only Dragons (positive score) play; they submit on their phone ----
  await ipad.getByTestId('game-options').click();
  ipad.once('dialog', (d) => d.accept());
  await ipad.getByTestId('option-start-final').click();
  await expect(tv.getByText('Capitals')).toBeVisible();
  await expect(tv.getByText('Final Jeopardy!')).toBeVisible();
  await expect(ipad.getByTestId('final-status')).toHaveCount(1);
  await expect(ipad.getByLabel('Wager for this player')).toBeHidden(); // host entry only in the collapsed recovery section
  await ipad.getByTestId('final-next').click(); // open wagers
  await taylorPhone.getByLabel('Your wager').fill('150');
  await taylorPhone.getByRole('button', { name: 'Submit wager' }).click();
  await expect(ipad.getByTestId('final-status')).toContainText('Wagered ✓');
  await expect(ipad.getByTestId('final-control')).not.toContainText('150'); // private from the host too
  await expect(tv.getByText('150')).toHaveCount(0); // hidden wager
  await ipad.getByTestId('final-next').click(); // lock wagers, show clue
  await expect(tv.getByText('Capital of Hungary.', { exact: false })).toBeVisible();
  await taylorPhone.getByLabel('Your answer').fill('Buda and Pest');
  await taylorPhone.getByRole('button', { name: 'Submit answer' }).click();
  await expect(ipad.getByTestId('final-status')).toContainText('Answered ✓');
  await expect(ipad.getByTestId('final-control')).not.toContainText('Buda and Pest'); // the host sees only the correct answer
  await ipad.getByTestId('final-next').click(); // close answers → reveal
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Dragons');
  await expect(tv.getByTestId('tv-final-wager')).toHaveCount(0);
  await ipad.getByTestId('final-reveal-next').click(); // wager
  await expect(tv.getByTestId('tv-final-wager')).toContainText('150');
  await expect(tv.getByTestId('tv-final-answer')).toHaveCount(0);
  await ipad.getByTestId('final-reveal-next').click(); // answer
  await expect(tv.getByTestId('tv-final-answer')).toHaveText('Buda and Pest');
  await expect(ipad.getByTestId('final-reveal-answer')).toHaveText('Buda and Pest');
  await expect(tv.getByTestId('scoreboard')).not.toContainText('350'); // not scored before judging
  await ipad.getByTestId('final-correct').click();
  await expect(tv.getByTestId('tv-final-verdict')).toContainText('350');
  await tv.screenshot({ path: 'test-results/screens/tv-final-reveal.png' });
  await ipad.screenshot({ path: 'test-results/screens/ipad-final-reveal.png' });
  await ipad.getByTestId('final-reveal-next').click(); // finish the reveal
  await ipad.getByTestId('end-game').click();
  await expect(tv.getByTestId('winner')).toHaveText('Dragons wins!');

  // ---- Scores & statistics: team points once, contributions separate ----
  const teamsList = await (await api.get('/api/teams', { headers: H })).json();
  const dragonsId = teamsList.find((t: { name: string }) => t.name === 'Dragons').id;
  const ts = (await (await api.get(`/api/stats/teams/${dragonsId}`, { headers: H })).json()).stats;
  expect(ts.games).toMatchObject({ played: 1, wins: 1, highestScore: 350 }); // 200 + 150
  const st = async (id: string) => (await (await api.get(`/api/stats/profiles/${id}`, { headers: H })).json()).stats.team;
  expect((await st(taylor.profile.id)).contribution).toMatchObject({ correct: 1, net: 200 }); // Final was team-only
  expect((await st(sam.profile.id)).contribution).toMatchObject({ correct: 0, net: 0 });
  expect((await st(alex.profile.id)).contribution).toMatchObject({ incorrect: 1, net: -400 });
  expect((await st(jordan.profile.id)).contribution).toMatchObject({ correct: 0, incorrect: 0 });
  await api.dispose();
});
