import { useState } from 'react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { ActionButton, Button, Card, Empty, Field, inputCls, cx } from '../../components/ui';
import { RULE_PRESETS } from '../../../shared/game';

interface BoardSummary {
  id: string;
  title: string;
  description: string;
  archived: boolean;
  favorite: boolean;
  clueCount: number;
  completeCount: number;
  rounds: { name: string; kind: string; categories: string[] }[];
}
interface SavedGame {
  id: string;
  title: string;
  mode: string;
  status: string;
  updatedAt: number;
}

export default function GamePicker() {
  const games = useFetch(() => hostApi<{ games: SavedGame[] }>('GET', '/api/games'), []);
  const boards = useFetch(() => hostApi<BoardSummary[]>('GET', '/api/boards'), []);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [preset, setPreset] = useState('classic');
  const [title, setTitle] = useState('');
  const list = (boards.data ?? []).filter((b) => !b.archived).sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const selected = list.find((b) => b.id === (boardId ?? list[0]?.id));

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 md:grid-cols-[1fr_1.3fr]">
      <section>
        <h2 className="mb-3 text-xl font-bold">Resume a game</h2>
        {games.data?.games.length ? (
          <div className="space-y-2">
            {games.data.games.map((g) => (
              <Card key={g.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.title}</div>
                  <div className="text-sm text-slate-500">
                    {g.status === 'setup' ? 'Setting up' : 'In progress'} · {g.mode === 'team' ? 'Teams' : 'Solo'} · {new Date(g.updatedAt).toLocaleString()}
                  </div>
                </div>
                <ActionButton onAction={() => attempt(() => hostApi('POST', `/api/games/${g.id}/load`))}>Resume</ActionButton>
                <ActionButton
                  variant="ghost"
                  aria-label={`Discard ${g.title}`}
                  onAction={async () => {
                    if (!confirm(`Discard "${g.title}"? It will no longer appear here.`)) return;
                    await attempt(() => hostApi('DELETE', `/api/games/${g.id}`));
                    void games.reload();
                  }}
                >
                  🗑
                </ActionButton>
              </Card>
            ))}
          </div>
        ) : (
          <Empty title="No unfinished games">Start a new game on the right.</Empty>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">New game</h2>
        <Card className="space-y-4">
          <Field label="Board" group>
            <div className="max-h-64 space-y-2 overflow-auto">
              {list.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBoardId(b.id)}
                  className={cx('w-full rounded-xl border-2 p-3 text-left', selected?.id === b.id ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}
                >
                  <div className="font-semibold">
                    {b.favorite ? '★ ' : ''}
                    {b.title}
                  </div>
                  <div className="text-sm text-slate-500">
                    {b.rounds.filter((r) => r.kind === 'standard').length} rounds · {b.clueCount} clues
                    {b.completeCount < b.clueCount ? ` · ${b.clueCount - b.completeCount} unfinished` : ''}
                  </div>
                </button>
              ))}
              {!list.length && <p className="text-slate-500">Create a board on the game computer first (Library).</p>}
            </div>
          </Field>
          <Field label="Game title (optional)">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selected?.title ?? ''} maxLength={120} />
          </Field>
          <Field label="Play as" group>
            <div className="grid grid-cols-2 gap-2">
              {(['solo', 'team'] as const).map((m) => (
                <Button key={m} variant={mode === m ? 'primary' : 'secondary'} size="lg" onClick={() => setMode(m)}>
                  {m === 'solo' ? '👤 Individuals' : '👥 Teams'}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Rules" hint={RULE_PRESETS[preset]?.description}>
            <select className={inputCls} value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.entries(RULE_PRESETS).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <ActionButton
            size="xl"
            className="w-full"
            disabled={!selected}
            onAction={() => attempt(() => hostApi('POST', '/api/games', { boardId: selected!.id, mode, preset, title: title.trim() || undefined }))}
          >
            Create game
          </ActionButton>
        </Card>
      </section>
    </div>
  );
}
