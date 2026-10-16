// E2E (round 5, Milestone F — TV presentation): score-change labels (R5-7), the Final Jeopardy!
// swipe between screens / contestants including quick host taps (R5-6), the results podium with
// places 4+ listed (R5-10) and the team buzz-in banner (R5-5.10). Set up through the host socket;
// screenshots go to test-results/screens.
import { test, expect, chromium, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/present-${name}.png` });
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterEach(async () => {
  for (const c of cr?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
});

async function setup(mode: 'solo' | 'team', name: string) {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const mk = async (n: string, color: string, avatar: string, nickname?: string) =>
    (await (await api.post('/api/profiles', { data: { name: n, nickname, color, avatar, pin: '2468' } })).json()) as { token: string; profile: { id: string } };
  const done = async () => {
    h.close();
    await api.post('/api/games/close', { headers: H });
    await api.delete('/api/lobby', { headers: H });
    await api.dispose();
  };
  return { api, h, mk, done };
}

test('score labels, the Final swipe and the podium with places 4+', async () => {
  test.setTimeout(150_000);
  const { h, mk, done } = await setup('solo', 'Presentation night');
  const colors = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c'];
  const names = ['Ava Podium', 'Ben Podium', 'Cat Podium', 'Dan Podium', 'Eve Podium'];
  const ps: { token: string; profile: { id: string } }[] = [];
  for (let i = 0; i < names.length; i++) ps.push(await mk(names[i], colors[i], ['fox', 'owl', 'cat', 'bear', 'frog'][i]));
  for (const p of ps) await h.act({ type: 'addPlayer', profileId: p.profile.id });
  const g0 = await h.until((g) => g.competitors.length === 5);
  const cid = (i: number) => g0.competitors.find((c: { profileId: string }) => c.profileId === ps[i].profile.id).id as string;
  const [A, B, C, D, E] = [0, 1, 2, 3, 4].map(cid);

  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' }).catch(() => {});
  await expect(tv.getByTestId('scoreboard')).toBeVisible();
  const podium = (n: string) => tv.getByTestId('podium').filter({ hasText: n });

  // ---- R5-7: a right answer shows "+$400" beside the score, a wrong one "−$200" ----
  await h.act({ type: 'selectClue', clueId: 'hist_2' });
  await h.act({ type: 'unlockBuzzers' });
  await h.act({ type: 'hostBuzz', competitorId: A });
  await h.act({ type: 'judge', result: 'correct' });
  const avaDelta = podium('Ava Podium').getByTestId('score-delta');
  await expect(avaDelta).toHaveText('+$400');
  await expect(avaDelta).toHaveAttribute('data-dir', 'up');
  await shot(tv, 'score-delta');
  await expect(avaDelta).toHaveCount(0, { timeout: 4000 }); // fades away
  await expect(podium('Ava Podium').getByTestId('score')).toHaveText('400');
  await h.act({ type: 'closeClue' }).catch(() => {});
  await h.act({ type: 'selectClue', clueId: 'hist_1' });
  await h.act({ type: 'unlockBuzzers' });
  await h.act({ type: 'hostBuzz', competitorId: E });
  await h.act({ type: 'judge', result: 'incorrect' });
  await expect(podium('Eve Podium').getByTestId('score-delta')).toHaveText('−$200');
  await h.act({ type: 'closeClue' }).catch(() => {});
  // Distinct places: Ava 1000, Ben 600, Cat 400, Dan 0, Eve −200.
  await h.act({ type: 'adjustScore', competitorId: A, delta: 600 });
  await h.act({ type: 'adjustScore', competitorId: B, delta: 600 });
  await h.act({ type: 'adjustScore', competitorId: C, delta: 400 });
  await expect(podium('Ben Podium').getByTestId('score-delta')).toHaveText('+$600');

  // ---- R5-6: Final Jeopardy! — swipe from the answers to the reveal and between contestants ----
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' }); // wagers
  await h.act({ type: 'setFinalWager', competitorId: C, amount: 300 });
  await h.act({ type: 'setFinalWager', competitorId: B, amount: 100 });
  await h.act({ type: 'setFinalWager', competitorId: A, amount: 0 });
  await h.act({ type: 'finalNext' }); // clue
  for (const c of [A, B, C]) await h.act({ type: 'setFinalAnswer', competitorId: c, answer: 'Budapest', submit: true });
  const final = tv.getByTestId('tv-final');
  await expect(tv.getByTestId('tv-final-status')).toBeVisible();
  await expect(final).toHaveAttribute('data-swipe-seq', '0');
  await h.act({ type: 'finalNext' }); // reveal: lowest score first (Cat)
  await expect(final).toHaveAttribute('data-screen', 'reveal:0');
  await expect(final).toHaveAttribute('data-swipe-seq', '1');
  await expect(final).toHaveAttribute('data-swipe-kind', 'swipe');
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Cat Podium');
  await expect(tv.locator('[data-swipe-layer="leaving"]')).toHaveCount(0); // the swipe finished
  await h.act({ type: 'finalReveal' }); // wager
  await h.act({ type: 'finalReveal' }); // answer
  await expect(tv.getByTestId('tv-final-answer')).toHaveText('Budapest');
  await expect(final).toHaveAttribute('data-swipe-seq', '1'); // reveal steps do not swipe
  await h.act({ type: 'judgeFinal', competitorId: C, correct: true });
  await expect(tv.getByTestId('tv-final-verdict')).toContainText('700');
  await expect(tv.getByTestId('tv-final-verdict').getByTestId('score-delta')).toHaveText('+$300');
  await shot(tv, 'final-verdict');
  await h.act({ type: 'finalReveal' }); // next contestant: Ben
  await expect(final).toHaveAttribute('data-swipe-seq', '2');
  await tv.waitForTimeout(250);
  await shot(tv, 'final-swipe-mid');
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Ben Podium');
  await expect(tv.getByTestId('tv-final-wager')).toHaveCount(0); // a fresh contestant, nothing shown yet
  // Quick taps: wager, answer, judge, next and the next wager back to back.
  await Promise.all([h.act({ type: 'finalReveal' }), h.act({ type: 'finalReveal' })]);
  await h.act({ type: 'judgeFinal', competitorId: B, correct: false });
  await Promise.all([h.act({ type: 'finalReveal' }), h.act({ type: 'finalReveal' })]);
  await expect(final).toHaveAttribute('data-screen', 'reveal:2');
  await expect(final).toHaveAttribute('data-swipe-seq', '3'); // one swipe per contestant change
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Ava Podium');
  await expect(tv.getByTestId('tv-final-wager')).toContainText('0');
  await expect(tv.locator('[data-swipe-layer="leaving"]')).toHaveCount(0);
  await expect(tv.locator('[data-swipe-layer="current"]')).toHaveCount(1);
  await h.act({ type: 'finalReveal' }); // answer
  await h.act({ type: 'judgeFinal', competitorId: A, correct: true });
  await h.act({ type: 'finalReveal' }); // done
  await expect(final).toHaveAttribute('data-screen', 'done');
  await expect(final).toHaveAttribute('data-swipe-seq', '4');
  await expect(final).toHaveAttribute('data-swipe-kind', 'fade');

  // ---- R5-10: podium. Ava 1000 (1st, centre), Cat 700 (2nd, left), Ben 500 (3rd, right) ----
  await h.act({ type: 'endGame' });
  await expect(tv.getByTestId('winner')).toHaveText('Ava Podium wins!');
  const entries = tv.getByTestId('tv-podium-entry');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toHaveAttribute('data-place', '2');
  await expect(entries.nth(1)).toHaveAttribute('data-place', '1');
  await expect(entries.nth(2)).toHaveAttribute('data-place', '3');
  await expect(entries.nth(1).getByTestId('tv-podium-name')).toHaveText('Ava Podium');
  await expect(entries.nth(0).getByTestId('tv-podium-name')).toHaveText('Cat Podium');
  await expect(entries.nth(2).getByTestId('tv-podium-name')).toHaveText('Ben Podium');
  await expect(entries.nth(1).getByTestId('tv-podium-score')).toHaveText('1,000');
  const rest = tv.getByTestId('tv-results-rest-entry');
  await expect(rest).toHaveCount(2);
  await expect(rest.nth(0)).toContainText('4th');
  await expect(rest.nth(0)).toContainText('Dan Podium');
  await expect(rest.nth(1)).toContainText('5th');
  await expect(rest.nth(1)).toContainText('Eve Podium');
  await tv.waitForTimeout(3200); // entrance finished
  const box = async (i: number) => (await entries.nth(i).locator('.bt-pod-well').boundingBox())!;
  const [left, centre, right] = [await box(0), await box(1), await box(2)];
  expect(Math.abs(centre.x + centre.width / 2 - 800)).toBeLessThan(40); // 1st in the middle
  expect(left.x).toBeLessThan(centre.x);
  expect(right.x).toBeGreaterThan(centre.x);
  expect(centre.height).toBeGreaterThan(left.height);
  expect(left.height).toBeGreaterThan(right.height);
  await shot(tv, 'podium-16x9');
  await tv.setViewportSize({ width: 1024, height: 768 });
  await tv.waitForTimeout(400);
  await shot(tv, 'podium-4x3');
  await done();
});

test('team buzz-in: team name large, "Buzzed by" the nickname; shared buzzer shows only the team', async () => {
  const { h, mk, done } = await setup('team', 'Team presentation');
  const alex = await mk('Alexandra Present', '#dc2626', 'fox', 'Ace');
  const sam = await mk('Sam Present', '#2563eb', 'owl');
  const tay = await mk('Taylor Present', '#16a34a', 'cat');
  const jo = await mk('Jo Present', '#9333ea', 'bear');
  await h.act({ type: 'addTeam', name: 'Dragons', color: '#b91c1c', avatar: 'dragon', buzzerMode: 'individual', memberIds: [alex.profile.id, sam.profile.id] });
  await h.act({ type: 'addTeam', name: 'Wizards', color: '#1d4ed8', avatar: 'shield', buzzerMode: 'shared', memberIds: [tay.profile.id, jo.profile.id] });
  // R5-17: the nickname is chosen for this lobby (not the profile's own nickname).
  await h.act({ type: 'setNickname', profileId: alex.profile.id, nickname: 'Ace' });
  const g0 = await h.until((g) => g.competitors.length === 2);
  const wizards = g0.competitors.find((c: { name: string }) => c.name === 'Wizards').id as string;

  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const phone = await (await cr.newContext({ ...devices['Pixel 7'] })).newPage();
  await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), alex.token);
  await phone.goto(`${BASE}/join`);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' }).catch(() => {});

  // Individual team buzzer: Alex (nickname "Ace") buzzes from the phone.
  await h.act({ type: 'selectClue', clueId: 'hist_3' });
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await h.act({ type: 'unlockBuzzers' });
  await phone.getByTestId('buzzer').dispatchEvent('pointerdown');
  const banner = tv.getByTestId('buzz-winner');
  await expect(banner).toHaveAttribute('data-kind', 'team');
  await expect(banner.getByTestId('buzz-winner-name')).toHaveText('Dragons');
  await expect(banner.getByTestId('buzz-winner-sub')).toHaveText('Buzzed by Ace');
  await expect(banner).not.toContainText('Alexandra');
  const nameSize = await banner.getByTestId('buzz-winner-name').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const subSize = await banner.getByTestId('buzz-winner-sub').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(nameSize).toBeGreaterThan(subSize * 2); // the team name is the prominent line
  await tv.waitForTimeout(600);
  await shot(tv, 'team-buzz-16x9');
  await h.act({ type: 'judge', result: 'correct' });
  await expect(tv.getByTestId('podium').filter({ hasText: 'Dragons' }).getByTestId('score-delta')).toHaveText('+$600');
  await h.act({ type: 'closeClue' }).catch(() => {});

  // Shared team buzzer, nobody identified: just the team name.
  await h.act({ type: 'selectClue', clueId: 'hist_4' });
  await expect(tv.getByTestId('clue-text')).toContainText('Constantinople');
  await h.act({ type: 'unlockBuzzers' });
  await h.act({ type: 'hostBuzz', competitorId: wizards });
  await expect(banner.getByTestId('buzz-winner-name')).toHaveText('Wizards');
  await expect(banner.getByTestId('buzz-winner-sub')).toHaveCount(0);
  await tv.waitForTimeout(1200); // clue zoom + content fade finished
  await shot(tv, 'team-buzz-shared');
  await done();
});
