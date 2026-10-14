// Optional AI answers for computer opponents (R3-14). Host only. The API key is write-only: the
// server reports whether one is saved, never its value. Everything works without this.
import { useEffect, useState } from 'react';
import { Bot, CircleAlert, CircleCheck, KeyRound, PlugZap, Trash2 } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Field, cx, inputCls, toast } from '../../components/ui';
import { AI_PROVIDERS, DEFAULT_AI_MODEL, type AiConfig, type AiStatus } from '../../../shared/ai';

export function AiSettings() {
  const st = useFetch(() => hostApi<AiStatus>('GET', '/api/ai'), []);
  const [draft, setDraft] = useState<AiConfig | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  useEffect(() => {
    if (st.data && !draft) setDraft(st.data.config);
  }, [st.data, draft]);
  if (!st.data || !draft) return <p className="text-sm text-slate-500">{st.error ?? 'Loading…'}</p>;
  const s = st.data;

  const save = async (patch: Partial<AiConfig>, extra: { apiKey?: string; clearKey?: boolean } = {}) => {
    const config = { ...draft, ...patch };
    setDraft(config);
    const r = await attempt(() => hostApi<AiStatus>('PUT', '/api/ai', { config, ...extra }));
    if (r) st.setData(r);
    return r;
  };
  const loadModels = async () => {
    const r = await attempt(() => hostApi<{ models: string[] }>('GET', '/api/ai/models'));
    if (r) setModels(r.models.filter((m) => m.startsWith('claude')));
  };
  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const r = await attempt(() => hostApi<{ ok: boolean; latencyMs?: number; error?: string }>('POST', '/api/ai/test'));
    setTesting(false);
    if (r) setTest(r);
    void st.reload();
  };
  const modelChoices = [...new Set([draft.model, DEFAULT_AI_MODEL, ...(models ?? [])])];

  return (
    <div className="space-y-4" data-testid="ai-settings">
      <p className="text-sm text-slate-600">
        Computer opponents normally answer offline. Optionally, bots set to <b>AI answers</b> can use an AI service for more natural answers — you still judge every answer. This needs internet and an API key from your own account, and <b>may cost money</b>. The clue, category and expected answer are sent to the provider; nothing about players is sent. If the AI is unavailable, the game carries on with offline answers.
      </p>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={draft.enabled} onChange={(e) => void save({ enabled: e.target.checked })} data-testid="ai-enabled" />
        <span>
          <span className="block font-semibold">Use AI answers for computer opponents</span>
          <span className="block text-xs text-slate-500">Only bots with “AI answers” switched on use it.</span>
        </span>
      </label>

      <div className={cx('flex items-center gap-2 rounded-xl p-3 text-sm font-semibold', s.ready ? 'bg-green-50 text-green-900' : 'bg-slate-100 text-slate-700')} data-testid="ai-status">
        {s.ready ? <CircleCheck size={18} aria-hidden /> : <Bot size={18} aria-hidden />}
        {s.ready ? 'AI answers are on' : !s.keySaved ? 'No API key saved — bots answer offline' : 'AI answers are off — bots answer offline'}
        {s.requests > 0 && <span className="ml-auto font-normal text-slate-600">{s.requests} requests · {s.failures} failed{s.gameRequests ? ` · ${s.gameRequests} this game` : ''}</span>}
      </div>
      {s.lastError && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="ai-last-error">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> Last problem: {s.lastError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <select className={inputCls} value={draft.provider} onChange={(e) => void save({ provider: e.target.value as AiConfig['provider'] })} aria-label="AI provider">
            {Object.entries(AI_PROVIDERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model" hint={models ? `${models.length} models available to this key` : 'Load the list after saving a key'}>
          <div className="flex gap-2">
            <select className={inputCls} value={draft.model} onChange={(e) => void save({ model: e.target.value })} aria-label="AI model">
              {modelChoices.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" disabled={!s.keySaved} onClick={() => void loadModels()}>
              Load
            </Button>
          </div>
        </Field>
      </div>

      <Field label="API key" hint={s.keySaved ? (s.keyProtected ? 'A key is saved, encrypted for your Windows account. It is never shown again or sent to any device.' : 'A key is saved (unencrypted — development server). It is never shown again or sent to any device.') : 'Paste a key from your provider account. It stays on this computer.'}>
        <div className="flex flex-wrap gap-2">
          <input
            className={cx(inputCls, 'min-w-0 flex-1')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={s.keySaved ? '•••••••• (saved)' : 'sk-ant-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-label="API key"
            data-testid="ai-key"
          />
          <Button
            variant="secondary"
            disabled={key.trim().length < 10}
            onClick={async () => {
              if (await save({}, { apiKey: key.trim() })) {
                setKey('');
                toast('API key saved');
              }
            }}
            data-testid="ai-save-key"
          >
            <KeyRound size={16} aria-hidden /> {s.keySaved ? 'Replace key' : 'Save key'}
          </Button>
          {s.keySaved && (
            <Button variant="ghost" className="text-red-700" onClick={async () => (confirm('Remove the saved API key?') ? void save({}, { clearKey: true }) : undefined)} aria-label="Remove API key">
              <Trash2 size={16} aria-hidden />
            </Button>
          )}
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" busy={testing} disabled={!s.keySaved} onClick={() => void runTest()} data-testid="ai-test">
          <PlugZap size={16} aria-hidden /> Test connection
        </Button>
        {test && (
          <span className={cx('text-sm font-semibold', test.ok ? 'text-green-700' : 'text-red-700')} data-testid="ai-test-result">
            {test.ok ? `Connected (${((test.latencyMs ?? 0) / 1000).toFixed(1)} s)` : (test.error ?? 'Not connected')}
          </span>
        )}
      </div>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">Limits and fallback</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Wait at most (seconds)">
            <input className={inputCls} type="number" min={2} max={60} value={draft.timeoutSeconds} onChange={(e) => setDraft({ ...draft, timeoutSeconds: Number(e.target.value) })} onBlur={() => void save({ timeoutSeconds: Math.min(60, Math.max(2, Math.round(draft.timeoutSeconds) || 8)) })} aria-label="AI timeout" />
          </Field>
          <Field label="AI answers per game" hint="0 = no limit">
            <input className={inputCls} type="number" min={0} max={1000} value={draft.maxPerGame} onChange={(e) => setDraft({ ...draft, maxPerGame: Number(e.target.value) })} onBlur={() => void save({ maxPerGame: Math.min(1000, Math.max(0, Math.round(draft.maxPerGame) || 0)) })} aria-label="AI answers per game" />
          </Field>
          <Field label="When the AI can't answer">
            <select className={inputCls} value={draft.fallback} onChange={(e) => void save({ fallback: e.target.value as AiConfig['fallback'] })} aria-label="AI fallback">
              <option value="local">Use an offline answer</option>
              <option value="pass">The bot passes</option>
            </select>
          </Field>
        </div>
      </details>
    </div>
  );
}
