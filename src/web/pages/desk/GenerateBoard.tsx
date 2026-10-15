// Create a board with AI (spec §19, optional offline AI): a draft from a topic, written by a local
// model (Ollama / LM Studio — no internet) or Anthropic. The draft opens in the editor; every clue
// is marked AI-generated and gaps are left blank, so the host checks and finishes it by hand.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { ActionButton, Field, Modal, inputCls } from '../../components/ui';
import type { AiStatus } from '../../../shared/ai';

export function GenerateBoardModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const st = useFetch(() => (open ? hostApi<AiStatus>('GET', '/api/ai') : Promise.resolve(null)), [open]);
  const [topic, setTopic] = useState('');
  const [categories, setCategories] = useState(6);
  const [rows, setRows] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [final, setFinal] = useState(true);
  const ready = !!st.data && (!st.data.keyRequired || st.data.keySaved);
  const local = st.data?.config.provider === 'openai';
  const create = async () => {
    const r = await attempt(() => hostApi<{ id: string; filled: number; total: number }>('POST', '/api/ai/generate-board', { topic: topic.trim(), categories, rows, difficulty, final }));
    if (!r) return;
    onCreated(r.id);
  };
  return (
    <Modal open={open} onClose={onClose} title="Create a board with AI">
      <div className="space-y-4" data-testid="generate-board">
        <p className="text-sm text-slate-600">
          The AI writes a first draft from your topic. It opens in the editor, every clue is marked <b>AI-generated</b>, and anything the AI could not write is left blank. <b>Check every clue before playing</b> — AI can be wrong.
        </p>
        {!st.data ? (
          <p className="text-sm text-slate-500">{st.error ?? 'Loading…'}</p>
        ) : !ready ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Set up AI first in{' '}
            <Link to="/host/settings" className="font-semibold underline" onClick={onClose}>
              Settings → AI answers
            </Link>
            : choose a local AI server (Ollama or LM Studio, no internet needed) or save an API key.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Using {local ? `the AI server at ${st.data.config.baseUrl}` : 'Anthropic'} · model {st.data.config.model}.{local ? ' A local model can take a minute or two.' : ''}
          </p>
        )}
        <Field label="Topic">
          <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} placeholder="e.g. 90s movies, the solar system, our family trip to Italy" aria-label="Topic" data-testid="generate-topic" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Categories">
            <select className={inputCls} value={categories} onChange={(e) => setCategories(Number(e.target.value))} aria-label="Categories">
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clues each">
            <select className={inputCls} value={rows} onChange={(e) => setRows(Number(e.target.value))} aria-label="Clues per category">
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className={inputCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label="Difficulty">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={final} onChange={(e) => setFinal(e.target.checked)} />
          <span className="font-semibold">Include a Final Jeopardy! clue</span>
        </label>
        <ActionButton size="lg" className="w-full" disabled={!ready || topic.trim().length < 2} onAction={create} data-testid="generate-create">
          <Sparkles size={18} aria-hidden /> Write the draft
        </ActionButton>
      </div>
    </Modal>
  );
}
