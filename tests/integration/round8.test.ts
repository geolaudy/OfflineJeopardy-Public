// Round 8 over the real server: a board keeps its rich clue text (line breaks, [b] [i] [u]) and
// category subheadings when saved and loaded; the host and the TV get the subheading (the Final's
// only once the Final starts); computer opponents work with plain text (R8-7, R8-8, R8-9).
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, hostToken, TestClient } from './helpers';
import { clueContext } from '../../src/server/botAnswers';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import type { BoardContent } from '../../src/shared/game';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

function richBoard(): BoardContent {
  const b = structuredClone(SAMPLE_BOARD) as BoardContent;
  const cat = b.rounds[0].categories[0];
  cat.subheading = 'Name the empire';
  cat.clues[0].question = 'This [b]ancient[/b] civilization\nbuilt [i]Machu Picchu[/i].';
  cat.clues[0].answer = '[u]The Inca[/u]\n(Incan Empire)';
  const fin = b.rounds.find((r) => r.kind === 'final')!.categories[0];
  fin.subheading = 'Capital cities';
  return b;
}

describe('rich clue text and category subheadings (R8-7, R8-8, R8-9)', () => {
  it('saved, loaded and shown to host and TV; bots get plain text', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const content = richBoard();
    const created = await api(s, 'POST', '/api/boards', { title: 'Rich board', content }, host);
    expect(created.status).toBe(200);
    const loaded = (await api(s, 'GET', `/api/boards/${created.data.id}`, undefined, host)).data;
    expect(loaded.content.rounds[0].categories[0].subheading).toBe('Name the empire');
    expect(loaded.content.rounds[0].categories[0].clues[0].question).toBe('This [b]ancient[/b] civilization\nbuilt [i]Machu Picchu[/i].');
    expect(loaded.content.rounds[0].categories[0].clues[0].answer).toBe('[u]The Inca[/u]\n(Incan Empire)');

    expect((await api(s, 'POST', '/api/lobby', {}, host)).status).toBe(200);
    expect((await api(s, 'POST', '/api/games', { boardId: created.data.id, mode: 'solo' }, host)).status).toBe(200);
    const h = await TestClient.connect(s, 'host', host);
    const tv = await TestClient.connect(s, 'public');
    clients.push(h, tv);
    const g = await h.waitState((x) => x?.phase === 'lobby');
    expect(g!.rounds[0].categories[0].subheading).toBe('Name the empire');
    await tv.waitState((x) => !!x);
    expect(tv.state!.rounds[0].categories[0].subheading).toBe('Name the empire');
    // The Final category (and so its subheading) stays hidden from the TV until the Final.
    const finalIdx = tv.state!.rounds.findIndex((r) => r.kind === 'final');
    expect(tv.state!.rounds[finalIdx].categories[0].subheading).toBeUndefined();
    expect(g!.rounds[finalIdx].categories[0].subheading).toBe('Capital cities');

    const ctx = clueContext(content, content.rounds[0].categories[0].clues[0].id)!;
    expect(ctx.question).toBe('This ancient civilization built Machu Picchu.');
    expect(ctx.answer).toBe('The Inca (Incan Empire)');
  });
});
