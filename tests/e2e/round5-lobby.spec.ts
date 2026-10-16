// Round 5 lobby in the browser: phones show a lobby (no buzzer) where players pick teams, rename
// their team and set a nickname; the host drags a player between teams on the iPad and uses the
// tap alternative; the TV shows the nickname with the profile name; the buzzer appears at the start.
import { test, expect, chromium, webkit, devices, request, type Browser } from '@playwright/test';
import { createLobby } from './lobbyFlow';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let wk: Browser;
let cr: Browser;
test.beforeAll(async () => {
  wk = await webkit.launch();
  cr = await chromium.launch();
});
test.afterAll(async () => {
  await wk?.close();
  await cr?.close();
});

async function phone(token: string, device: (typeof devices)[string], browser: Browser) {
  const p = await (await browser.newContext({ ...device })).newPage();
  await p.addInitScript((t) => localStorage.setItem('oj.profileToken', t), token);
  await p.goto(`${BASE}/join`);
  return p;
}
const shot = (p: { screenshot: (o: { path: string }) => Promise<unknown> }, name: string) => p.screenshot({ path: `test-results/screens/r5-${name}.png` });

test('team lobby: phones pick teams, rename them and set nicknames; host drags players; buzzer only after the start', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const { token: host } = await (await api.post('/api/host/local-login')).json();
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const mk = async (name: string) => (await (await api.post('/api/profiles', { data: { name, color: '#1d4ed8', avatar: 'owl', pin: '1234' } })).json()) as { token: string; profile: { id: string } };
  const [ann, ben, cat] = [await mk('Annabelle R5'), await mk('Ben R5'), await mk('Cat R5')];

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  ipad.on('dialog', (d) => void d.accept());
  await ipad.goto(`${BASE}/host`);
  await createLobby(ipad, { mode: 'team' });

  // Phones: a lobby, not a buzzer; join; nickname.
  const [pa, pb, pc] = [await phone(ann.token, devices['iPhone 13'], wk), await phone(ben.token, devices['Pixel 7'], cr), await phone(cat.token, devices['iPhone SE'], wk)];
  for (const p of [pa, pb, pc]) {
    await expect(p.getByTestId('player-lobby')).toBeVisible();
    await expect(p.getByTestId('buzzer')).toHaveCount(0);
    await p.getByTestId('join-game').click();
    await expect(p.getByTestId('lobby-joined')).toBeVisible();
  }
  await expect(ipad.getByTestId('unassigned-group').getByTestId('team-player')).toHaveCount(3);
  await pa.getByTestId('nickname-open').click();
  await pa.getByTestId('nickname-input').fill('QuizMaster');
  await pa.getByTestId('nickname-save').click();
  await expect(pa.getByTestId('player-lobby').getByTestId('person-name').first()).toContainText('QuizMaster');
  await expect(pa.getByTestId('player-lobby').getByTestId('person-real-name').first()).toHaveText('(Annabelle R5)');

  // Phones pick teams; Ann renames hers.
  await pa.getByTestId('phone-team').first().getByTestId('phone-join-team').click();
  await pb.getByTestId('phone-team').first().getByTestId('phone-join-team').click();
  await expect(ipad.getByTestId('team-card').first().getByTestId('team-player')).toHaveCount(2);
  await pa.getByTestId('team-identity-open').click();
  await pa.getByTestId('team-name-input').fill('The Owls');
  await pa.getByTestId('team-identity-save').click();
  await expect(pb.getByTestId('phone-team').first()).toContainText('The Owls');
  await expect(ipad.getByTestId('team-card').first()).toContainText('The Owls');
  await expect(tv.getByTestId('tv-lobby-full')).toContainText('The Owls');
  await expect(tv.getByTestId('tv-lobby-full')).toContainText('QuizMaster');
  await expect(tv.getByTestId('tv-lobby-full')).toContainText('(Annabelle R5)');
  await shot(pa, 'phone-lobby');
  await shot(tv, 'tv-team-lobby');

  // Host: drag Cat from Unassigned into the second team (touch-free pointer drag).
  const handle = ipad.getByTestId('unassigned-group').getByTestId('drag-handle').first();
  const target = ipad.getByTestId('team-card').nth(1);
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  await ipad.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await ipad.mouse.down();
  // Hold near the bottom edge: the lobby scrolls until the second team is on screen (auto-scroll).
  const vp = ipad.viewportSize()!;
  await ipad.mouse.move(from.x + 40, vp.height - 20, { steps: 6 });
  await expect(target).toBeInViewport({ timeout: 8000 });
  const to = (await target.boundingBox())!;
  await ipad.mouse.move(to.x + to.width / 2, Math.min(to.y + to.height / 2, vp.height - 100), { steps: 6 });
  await ipad.mouse.up();
  await expect(target.getByTestId('team-player')).toHaveCount(1);
  await expect(ipad.getByTestId('unassigned-group').getByTestId('team-player')).toHaveCount(0);
  // Tap alternative: move Ben to the second team, then back to Unassigned, then to The Owls.
  await ipad.getByRole('button', { name: 'Move Ben R5' }).click();
  await ipad.getByTestId('move-sheet').getByTestId('move-to-team').first().click();
  await expect(target.getByTestId('team-player')).toHaveCount(2);
  await ipad.getByRole('button', { name: 'Move Ben R5' }).click();
  await ipad.getByTestId('move-to-unassigned').click();
  await expect(ipad.getByTestId('unassigned-group').getByTestId('team-player')).toHaveCount(1);
  await shot(ipad, 'host-team-lobby');

  // Start with Ben unassigned: warned (accepted), Ben stays in the lobby without a buzzer.
  await ipad.getByTestId('start-game').click();
  await expect(ipad.getByTestId('intro-controls')).toBeVisible();
  await expect(pa.getByTestId('buzzer')).toBeVisible();
  await expect(pa.getByTestId('my-teammates')).toBeVisible();
  await expect(pb.getByTestId('buzzer')).toHaveCount(0);

  await ipad.getByTestId('nav-menu').click();
  await ipad.getByTestId('close-lobby').click();
  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});
