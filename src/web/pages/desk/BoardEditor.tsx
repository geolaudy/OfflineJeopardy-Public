import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import type { AiStatus } from '../../../shared/ai';
import { ActionButton, Button, Field, Modal, cx, inputCls, toast } from '../../components/ui';
import { blankBoard, blankCategory, blankClue, blankFinal, blankRound, boardStats, clueComplete, hasClueMedia, uid, validateBoard } from '../../../shared/boardUtils';
import { boardContentSchema } from '../../../shared/boardIO';
import type { BoardContent, Category, Clue, ClueLayout, ClueUnlock, MediaRef, Round } from '../../../shared/game';
import { Eye, Star, ArrowLeft, Image, Music, Film, OctagonAlert, TriangleAlert, ChevronLeft, ChevronRight, X, Download, Sparkles, Bold, Italic, Underline } from 'lucide-react';
import { acceptFor, formatList, MEDIA_FORMATS, type MediaKind } from '../../../shared/mediaTypes';
import { isRich, plainText, toggleTag } from '../../../shared/richText';
import { RichText } from '../../components/RichText';

// ---------- types & helpers ----------

interface Meta {
  title: string;
  description: string;
  tagsText: string;
  folder: string;
  favorite: boolean;
  archived: boolean;
  isTemplate: boolean;
}

interface BoardRecord {
  id: string;
  title: string;
  description: string;
  tags: string[];
  folder: string;
  favorite: boolean;
  archived: boolean;
  isTemplate: boolean;
  updatedAt: number;
  content: BoardContent;
}

type Status = 'saved' | 'saving' | 'dirty' | 'error' | 'new';

const MAX_ROUNDS = 10;
const MAX_CATS = 20;
const MAX_CLUES = 20;
const MAX_MEDIA = 6;

const blankMeta = (): Meta => ({ title: 'Untitled board', description: '', tagsText: '', folder: '', favorite: false, archived: false, isTemplate: false });

function metaFrom(b: BoardRecord): Meta {
  return { title: b.title, description: b.description, tagsText: b.tags.join(', '), folder: b.folder, favorite: b.favorite, archived: b.archived, isTemplate: b.isTemplate };
}

function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(',')) {
    const v = t.trim().slice(0, 40);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 30);
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Final round always stays last. */
function sortFinalLast(rounds: Round[]): Round[] {
  return [...rounds.filter((r) => r.kind !== 'final'), ...rounds.filter((r) => r.kind === 'final')];
}

function buildPayload(meta: Meta, content: BoardContent, version: boolean) {
  return {
    title: meta.title.trim().slice(0, 120) || 'Untitled board',
    description: meta.description.slice(0, 2000),
    tags: parseTags(meta.tagsText),
    folder: meta.folder.trim().slice(0, 60),
    favorite: meta.favorite,
    archived: meta.archived,
    isTemplate: meta.isTemplate,
    content,
    version,
  };
}

function schemaError(content: BoardContent): string | null {
  const r = boardContentSchema.safeParse(content);
  if (r.success) return null;
  const i = r.error.issues[0];
  return `Board data is invalid (${i.path.join('.')}: ${i.message}).`;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function fileSafe(s: string) {
  return s.replace(/[^a-z0-9 _-]/gi, '').trim() || 'category';
}

/** Text or media plus an answer (media-only clues are complete, R4-10). */
const mediaLabel = (q: Clue) => {
  const kinds = new Set((q.media ?? []).map((m) => m.kind));
  return kinds.size === 1 ? `${[...kinds][0] === 'image' ? 'Image' : [...kinds][0] === 'audio' ? 'Audio' : 'Video'} clue` : 'Media clue';
};

interface ConfirmState {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => unknown;
}

// ---------- component ----------

export default function BoardEditor() {
  const { id = 'new' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<Meta>(blankMeta);
  const [content, setContent] = useState<BoardContent>(() => blankBoard());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('new');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);

  const [editing, setEditing] = useState<{ ri: number; ci: number; qi: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  // Refs used by the save pipeline (avoid stale closures in timers/unmount).
  const latest = useRef({ meta, content });
  latest.current = { meta, content };
  const revRef = useRef(0);
  const savedRev = useRef(0);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const boardIdRef = useRef<string | null>(null);
  const createdRef = useRef<string | null>(null);

  const markDirty = useCallback(() => {
    revRef.current += 1;
    setRev(revRef.current);
    setStatus('dirty');
  }, []);

  const editContent = useCallback(
    (fn: (c: BoardContent) => BoardContent) => {
      setContent((c) => fn(c));
      markDirty();
    },
    [markDirty],
  );
  const editMeta = useCallback(
    (p: Partial<Meta>) => {
      setMeta((m) => ({ ...m, ...p }));
      markDirty();
    },
    [markDirty],
  );

  const applyBoard = useCallback((b: BoardRecord) => {
    setMeta(metaFrom(b));
    setContent(b.content);
    latest.current = { meta: metaFrom(b), content: b.content };
    boardIdRef.current = b.id;
    savedRev.current = revRef.current;
    setStatus('saved');
    setSaveError(null);
  }, []);

  // ---------- load ----------
  useEffect(() => {
    let alive = true;
    if (id === 'new') {
      boardIdRef.current = null;
      revRef.current = 0;
      savedRev.current = 0;
      setRev(0);
      setMeta(blankMeta());
      setContent(blankBoard());
      setRoundIdx(0);
      setStatus('new');
      setLoaded(true);
      setLoadError(null);
      return;
    }
    if (id === createdRef.current) {
      // We just created this board and navigated here; state is already current.
      boardIdRef.current = id;
      return;
    }
    setLoaded(false);
    setLoadError(null);
    hostApi<BoardRecord>('GET', `/api/boards/${encodeURIComponent(id)}`)
      .then((b) => {
        if (!alive) return;
        revRef.current = 0;
        setRev(0);
        applyBoard(b);
        setRoundIdx(0);
        setLoaded(true);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [id, applyBoard]);

  // ---------- save ----------
  const persist = useCallback(async (version: boolean): Promise<boolean> => {
    const boardId = boardIdRef.current;
    if (!boardId) return false;
    if (savingRef.current) {
      pendingRef.current = true;
      return false;
    }
    const { meta: m, content: c } = latest.current;
    const invalid = schemaError(c);
    if (invalid) {
      setStatus('error');
      setSaveError(invalid);
      if (version) toast(invalid, 'error');
      return false;
    }
    const target = revRef.current;
    savingRef.current = true;
    setStatus('saving');
    try {
      await hostApi('PUT', `/api/boards/${encodeURIComponent(boardId)}`, buildPayload(m, c, version));
      savedRev.current = Math.max(savedRev.current, target);
      setSaveError(null);
      setStatus(savedRev.current >= revRef.current ? 'saved' : 'dirty');
      if (version) toast('Saved — version recorded', 'success');
      return true;
    } catch (e) {
      setStatus('error');
      setSaveError((e as Error).message);
      if (version) toast((e as Error).message, 'error');
      return false;
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        if (revRef.current > savedRev.current) void persistRef.current(false);
      }
    }
  }, []);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const create = useCallback(async () => {
    const { meta: m, content: c } = latest.current;
    const invalid = schemaError(c);
    if (invalid) {
      toast(invalid, 'error');
      return;
    }
    const target = revRef.current;
    setStatus('saving');
    try {
      const { version: _v, ...body } = buildPayload(m, c, true);
      void _v;
      const b = await hostApi<BoardRecord>('POST', '/api/boards', body);
      createdRef.current = b.id;
      boardIdRef.current = b.id;
      savedRev.current = target;
      setStatus(revRef.current > target ? 'dirty' : 'saved');
      toast('Board created', 'success');
      navigate(`/host/boards/${b.id}`, { replace: true });
      if (revRef.current > target) void persistRef.current(false);
    } catch (e) {
      setStatus('error');
      setSaveError((e as Error).message);
      toast((e as Error).message, 'error');
    }
  }, [navigate]);

  const manualSave = useCallback(() => (boardIdRef.current ? persist(true) : create()), [persist, create]);

  // Autosave (existing boards only), debounced.
  useEffect(() => {
    if (!boardIdRef.current || rev === 0 || rev <= savedRev.current) return;
    const t = setTimeout(() => void persistRef.current(false), 1500);
    return () => clearTimeout(t);
  }, [rev]);

  // Flush pending changes when leaving the editor inside the app.
  useEffect(
    () => () => {
      if (boardIdRef.current && revRef.current > savedRev.current) void persistRef.current(false);
    },
    [],
  );

  const unsaved = status === 'dirty' || status === 'saving' || status === 'error' || (status === 'new' && rev > 0);
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void manualSave();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [manualSave]);

  // ---------- derived ----------
  const issues = useMemo(() => validateBoard(content), [content]);
  const stats = useMemo(() => boardStats(content), [content]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const unfinished = stats.clues - stats.complete;
  const ri = Math.min(roundIdx, content.rounds.length - 1);
  const round = content.rounds[ri];
  const hasFinal = content.rounds.some((r) => r.kind === 'final');
  const standardCount = content.rounds.filter((r) => r.kind === 'standard').length;

  // ---------- mutations ----------
  const updateRound = (index: number, fn: (r: Round) => Round) => editContent((c) => ({ rounds: c.rounds.map((r, i) => (i === index ? fn(r) : r)) }));
  const updateCat = (index: number, ci: number, fn: (c: Category) => Category) =>
    updateRound(index, (r) => ({ ...r, categories: r.categories.map((c, i) => (i === ci ? fn(c) : c)) }));
  const updateClue = (index: number, ci: number, qi: number, patch: Partial<Clue>) =>
    updateCat(index, ci, (c) => ({ ...c, clues: c.clues.map((q, i) => (i === qi ? { ...q, ...patch } : q)) }));

  const addRound = (name: string, mult: number, cats: number, rows: number) => {
    const r = blankRound(name, mult, cats, rows);
    const finalAt = content.rounds.findIndex((x) => x.kind === 'final');
    const at = finalAt >= 0 ? finalAt : content.rounds.length;
    editContent((c) => ({ rounds: [...c.rounds.slice(0, at), r, ...c.rounds.slice(at)] }));
    setRoundIdx(at);
  };

  const addFinal = () => {
    editContent((c) => ({ rounds: [...c.rounds, blankFinal()] }));
    setRoundIdx(content.rounds.length);
  };

  const deleteRound = (index: number) => {
    editContent((c) => ({ rounds: c.rounds.filter((_, i) => i !== index) }));
    setRoundIdx(Math.max(0, index - 1));
  };

  const moveRound = (index: number, dir: -1 | 1) => {
    editContent((c) => ({ rounds: sortFinalLast(move(c.rounds, index, index + dir)) }));
    setRoundIdx(index + dir);
  };

  const rowCount = round ? Math.max(0, ...round.categories.map((c) => c.clues.length)) : 0;

  const addRow = () =>
    updateRound(ri, (r) => ({
      ...r,
      categories: r.categories.map((c) => {
        if (c.clues.length >= MAX_CLUES) return c;
        const last = c.clues[c.clues.length - 1];
        const prev = c.clues[c.clues.length - 2];
        const step = last && prev ? last.value - prev.value : last ? last.value : 200;
        return { ...c, clues: [...c.clues, blankClue(Math.max(0, (last?.value ?? 0) + (step > 0 ? step : 200)))] };
      }),
    }));

  const removeLastRow = () => {
    const doIt = () => updateRound(ri, (r) => ({ ...r, categories: r.categories.map((c) => (c.clues.length === rowCount ? { ...c, clues: c.clues.slice(0, -1) } : c)) }));
    const lossy = round.categories.some((c) => {
      const q = c.clues[rowCount - 1];
      return c.clues.length === rowCount && q && (q.question.trim() || q.answer.trim() || q.media?.length);
    });
    if (lossy)
      setConfirm({ title: 'Remove last row?', message: 'Some clues in the last row have content. They will be deleted.', confirmLabel: 'Remove row', danger: true, onConfirm: doIt });
    else doIt();
  };

  const addCategory = () =>
    updateRound(ri, (r) => {
      const values = (r.categories[0]?.clues ?? []).map((q) => q.value);
      return { ...r, categories: [...r.categories, blankCategory('', values.length ? values : [200, 400, 600, 800, 1000])] };
    });

  const removeCategory = (ci: number) => {
    const c = round.categories[ci];
    const doIt = () => updateRound(ri, (r) => ({ ...r, categories: r.categories.filter((_, i) => i !== ci) }));
    if (c.name.trim() || c.clues.some((q) => q.question.trim() || q.answer.trim()))
      setConfirm({
        title: 'Delete category?',
        message: `“${c.name || `Category ${ci + 1}`}” and its ${c.clues.length} clues will be removed.`,
        confirmLabel: 'Delete category',
        danger: true,
        onConfirm: doIt,
      });
    else doIt();
  };

  const moveCategory = (from: number, to: number) => updateRound(ri, (r) => ({ ...r, categories: move(r.categories, from, to) }));

  /** Move a clue's content up/down; point values stay with their row. */
  const moveClue = (rIndex: number, ci: number, qi: number, dir: -1 | 1) => {
    const cat = content.rounds[rIndex].categories[ci];
    const to = qi + dir;
    if (to < 0 || to >= cat.clues.length) return;
    updateCat(rIndex, ci, (c) => {
      const clues = c.clues.slice();
      const a = clues[qi];
      const b = clues[to];
      clues[qi] = { ...b, value: a.value };
      clues[to] = { ...a, value: b.value };
      return { ...c, clues };
    });
    setEditing({ ri: rIndex, ci, qi: to });
  };

  const exportCategory = (c: Category) =>
    downloadJson({ format: 'offline-jeopardy-category', version: 1, category: c }, `${fileSafe(c.name || 'category')}.category.json`);

  const importFileRef = useRef<HTMLInputElement>(null);
  const importCategory = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !round) return;
    if (round.categories.length >= MAX_CATS) return toast(`A round can have at most ${MAX_CATS} categories.`, 'error');
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      return toast('That file is not valid JSON.', 'error');
    }
    const d = data as { format?: unknown; category?: unknown };
    if (!d || d.format !== 'offline-jeopardy-category' || typeof d.category !== 'object' || d.category === null)
      return toast('That is not an OfflineJeopardy category file.', 'error');
    const check = boardContentSchema.safeParse({ rounds: [{ id: 'r', name: 'r', kind: 'standard', categories: [d.category] }] });
    if (!check.success) {
      const i = check.error.issues[0];
      return toast(`Category file is invalid (${i.path.slice(3).join('.') || 'category'}: ${i.message}).`, 'error');
    }
    const cat = check.data.rounds[0].categories[0];
    const fresh: Category = { ...cat, id: uid('c'), clues: cat.clues.map((q) => ({ ...q, id: uid('q') })) };
    updateRound(ri, (r) => ({ ...r, categories: [...r.categories, fresh] }));
    toast(`Imported “${fresh.name || 'category'}”`, 'success');
  };

  // Drag and drop of category columns
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Stable modal callbacks (Modal re-focuses its first field when onClose identity changes).
  const closeEditing = useCallback(() => setEditing(null), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeAddRound = useCallback(() => setAddRoundOpen(false), []);
  const closeValues = useCallback(() => setValuesOpen(false), []);
  const closeVersions = useCallback(() => setVersionsOpen(false), []);
  const onRestored = useCallback(
    (b: BoardRecord) => {
      applyBoard(b);
      setRoundIdx(0);
      setVersionsOpen(false);
    },
    [applyBoard],
  );

  // ---------- render ----------
  if (loadError)
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="mb-4 text-lg font-semibold text-red-700">Could not open this board: {loadError}</p>
        <Link to="/host/boards" className="font-semibold text-blue-700 underline">
          Back to library
        </Link>
      </div>
    );
  if (!loaded || !round) return <p className="p-6 text-center text-slate-500">Loading board…</p>;

  const statusText: Record<Status, string> = {
    saved: 'Saved',
    saving: 'Saving…',
    dirty: 'Unsaved changes',
    error: 'Not saved',
    new: rev > 0 ? 'Unsaved changes' : 'New board — not saved yet',
  };
  const statusColor: Record<Status, string> = {
    saved: 'bg-green-600',
    saving: 'bg-blue-500',
    dirty: 'bg-amber-500',
    error: 'bg-red-600',
    new: 'bg-slate-400',
  };

  /** Save pending edits, then show the real TV preview (no game is created). */
  const openPreview = async (clueId?: string) => {
    if (status !== 'saved' && !(await persist(false))) return toast('Save the board first — it has a problem that prevents saving.', 'error');
    navigate(`/board/preview/${boardIdRef.current}${clueId ? `?clue=${encodeURIComponent(clueId)}` : ''}`);
  };

  const editingClue = editing ? content.rounds[editing.ri]?.categories[editing.ci]?.clues[editing.qi] : undefined;

  return (
    // R7-26: the same side and bottom padding as the other pages (the sticky bar stays edge to edge).
    <div className="mx-auto max-w-[1400px] px-4 pb-6 sm:px-6">
      {/* Top bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          to="/host/boards"
          onClick={(e) => {
            if (!boardIdRef.current && rev > 0 && !window.confirm('This new board has not been saved. Leave anyway?')) e.preventDefault();
          }}
          className="flex min-h-11 items-center rounded-xl px-3 font-semibold text-slate-700 hover:bg-slate-200"
        >
          <ArrowLeft size={18} aria-hidden /> Boards
        </Link>
        <label className="sr-only" htmlFor="board-title">
          Board title
        </label>
        <input
          id="board-title"
          value={meta.title}
          maxLength={120}
          onChange={(e) => editMeta({ title: e.target.value })}
          className="min-h-11 min-w-48 flex-1 rounded-xl border border-transparent bg-transparent px-3 text-xl font-bold hover:border-slate-300 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <span className="flex items-center gap-2 text-sm font-medium text-slate-600" role="status" aria-live="polite" title={saveError ?? undefined}>
          <span className={cx('h-2.5 w-2.5 rounded-full', statusColor[status])} />
          {statusText[status]}
        </span>
        {status === 'error' && boardIdRef.current ? (
          <Button size="sm" variant="secondary" onClick={() => void persist(false)}>
            Retry
          </Button>
        ) : null}
        {boardIdRef.current ? (
          <Button variant="secondary" onClick={() => setVersionsOpen(true)}>
            History
          </Button>
        ) : null}
        {boardIdRef.current ? (
          <ActionButton variant="secondary" onAction={() => openPreview()} data-testid="editor-preview">
            <Eye size={18} aria-hidden /> Preview board
          </ActionButton>
        ) : null}
        <ActionButton onAction={manualSave} title="Save (Ctrl+S)">
          Save
        </ActionButton>
      </div>
      {status === 'error' && saveError ? (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">
          {saveError}
        </p>
      ) : null}

      {/* Details + issues */}
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <details className="rounded-2xl border border-slate-200 bg-white p-3">
          <summary className="flex min-h-9 cursor-pointer items-center font-semibold">Details</summary>
          <div className="mt-3 grid gap-3">
            <Field label="Description">
              <textarea className={inputCls} rows={2} maxLength={2000} value={meta.description} onChange={(e) => editMeta({ description: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tags" hint="Separate with commas">
                <input className={inputCls} value={meta.tagsText} onChange={(e) => editMeta({ tagsText: e.target.value })} placeholder="science, kids" />
              </Field>
              <Field label="Folder">
                <input className={inputCls} value={meta.folder} maxLength={60} onChange={(e) => editMeta({ folder: e.target.value })} placeholder="e.g. Family nights" />
              </Field>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
              <input type="checkbox" className="h-5 w-5" checked={meta.isTemplate} onChange={(e) => editMeta({ isTemplate: e.target.checked })} />
              Use as a template (offered under “From template” in the library)
            </label>
          </div>
        </details>
        {/AI-generated/i.test(meta.tagsText) && (
          <p className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900" data-testid="ai-generated-note">
            <b>Written by AI.</b> Check every clue and answer before playing — AI can be wrong. Clues it wrote carry the note “AI-generated”; blank clues are for you to fill in. Remove the “AI-generated” tag when you have checked the board.
          </p>
        )}
        <details className={cx('rounded-2xl border p-3', errors.length ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
          <summary className="flex min-h-9 cursor-pointer flex-wrap items-center gap-x-3 font-semibold">
            <span>Checks</span>
            <span className={cx('text-sm', errors.length ? 'text-red-700' : 'text-slate-600')}>
              {errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} · ` : ''}
              {unfinished === 0 ? 'All clues complete' : `${unfinished} of ${stats.clues} clues unfinished`}
            </span>
          </summary>
          {issues.length ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
              {[...errors, ...warnings].map((i, k) => (
                <li key={k} className={i.level === 'error' ? 'font-semibold text-red-800' : 'text-amber-800'}>
                  {i.level === 'error' ? <OctagonAlert size={16} className="mr-1 inline align-[-3px]" aria-hidden /> : <TriangleAlert size={16} className="mr-1 inline align-[-3px]" aria-hidden />}
                  {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-green-700">No problems found.</p>
          )}
        </details>
      </div>

      {/* Round tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Rounds">
        {content.rounds.map((r, i) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={i === ri}
            onClick={() => setRoundIdx(i)}
            className={cx('min-h-11 rounded-xl px-4 font-semibold', i === ri ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100')}
          >
            {r.kind === 'final' ? <Star size={14} className="mr-1 inline fill-current align-[-2px]" aria-hidden /> : null}
            {r.name || `Round ${i + 1}`}
          </button>
        ))}
        <Button variant="ghost" onClick={() => setAddRoundOpen(true)} disabled={content.rounds.length >= MAX_ROUNDS}>
          + Round
        </Button>
        {!hasFinal ? (
          <Button variant="ghost" onClick={addFinal} disabled={content.rounds.length >= MAX_ROUNDS}>
            + Final Jeopardy! round
          </Button>
        ) : null}
      </div>

      {/* Round toolbar */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="w-56">
          <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="round-name">
            Round name
          </label>
          <input id="round-name" className={inputCls} maxLength={60} value={round.name} onChange={(e) => updateRound(ri, (r) => ({ ...r, name: e.target.value }))} />
        </div>
        {round.kind === 'standard' ? (
          <>
            <Button variant="secondary" size="md" aria-label="Move round earlier" title="Move round earlier" disabled={ri === 0} onClick={() => moveRound(ri, -1)}>
              <ChevronLeft size={18} aria-hidden />
            </Button>
            <Button
              variant="secondary"
              aria-label="Move round later"
              title="Move round later"
              disabled={ri + 1 >= content.rounds.length || content.rounds[ri + 1].kind === 'final'}
              onClick={() => moveRound(ri, 1)}
            >
              <ChevronRight size={18} aria-hidden />
            </Button>
            <span className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <Button variant="secondary" onClick={addCategory} disabled={round.categories.length >= MAX_CATS}>
              + Category
            </Button>
            <Button variant="secondary" onClick={addRow} disabled={rowCount >= MAX_CLUES || round.categories.length === 0}>
              + Row
            </Button>
            <Button variant="secondary" onClick={removeLastRow} disabled={rowCount <= 1}>
              − Row
            </Button>
            <Button variant="secondary" onClick={() => setValuesOpen(true)} disabled={round.categories.length === 0}>
              Set values
            </Button>
            <Button variant="secondary" onClick={() => importFileRef.current?.click()} disabled={round.categories.length >= MAX_CATS}>
              Import category
            </Button>
            <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void importCategory(e)} />
          </>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={round.kind === 'standard' && standardCount <= 1}
          title={round.kind === 'standard' && standardCount <= 1 ? 'A board needs at least one round' : undefined}
          onClick={() =>
            setConfirm({
              title: round.kind === 'final' ? 'Remove the Final Jeopardy! round?' : `Delete “${round.name}”?`,
              message: 'All categories and clues in this round will be removed.',
              confirmLabel: 'Delete round',
              danger: true,
              onConfirm: () => deleteRound(ri),
            })
          }
        >
          {round.kind === 'final' ? 'Remove Final Jeopardy!' : 'Delete round'}
        </Button>
      </div>

      {/* Round body */}
      {round.kind === 'final' ? (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-4">
          <Field label="Final category">
            <input
              className={inputCls}
              maxLength={100}
              value={round.categories[0]?.name ?? ''}
              onChange={(e) => updateCat(ri, 0, (c) => ({ ...c, name: e.target.value }))}
            />
          </Field>
          {round.categories[0]?.clues[0] ? (
            <div className="mt-3">
              <ClueFields clue={round.categories[0].clues[0]} final category={round.categories[0].name} onChange={(p) => updateClue(ri, 0, 0, p)} />
            </div>
          ) : null}
        </div>
      ) : round.categories.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
          <p className="mb-3 font-semibold">This round has no categories.</p>
          <Button onClick={addCategory}>+ Add category</Button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${round.categories.length}, minmax(150px, 1fr))` }}>
            {round.categories.map((c, ci) => (
              <div
                key={c.id}
                onDragOver={(e) => {
                  if (dragFrom == null) return;
                  e.preventDefault();
                  setDragOver(ci);
                }}
                onDragLeave={() => setDragOver((o) => (o === ci ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom != null) moveCategory(dragFrom, ci);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={cx(
                  'flex flex-col rounded-xl bg-blue-900 p-2 text-white',
                  dragOver === ci && dragFrom !== ci && 'ring-4 ring-amber-400',
                  dragFrom === ci && 'opacity-50',
                )}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-y-0.5 text-xs text-blue-200">
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(ci);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(ci));
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    className="flex min-h-8 cursor-grab select-none items-center rounded-md px-1.5 hover:bg-blue-800"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    ⠿ {ci + 1}
                  </span>
                  <span className="flex gap-0.5">
                    <IconBtn label={`Move ${c.name || `category ${ci + 1}`} left`} disabled={ci === 0} onClick={() => moveCategory(ci, ci - 1)}>
                      <ChevronLeft size={16} aria-hidden />
                    </IconBtn>
                    <IconBtn label={`Move ${c.name || `category ${ci + 1}`} right`} disabled={ci === round.categories.length - 1} onClick={() => moveCategory(ci, ci + 1)}>
                      <ChevronRight size={16} aria-hidden />
                    </IconBtn>
                    <IconBtn label={`Export ${c.name || `category ${ci + 1}`}`} onClick={() => exportCategory(c)}>
                      <Download size={15} aria-hidden />
                    </IconBtn>
                    <IconBtn label={`Delete ${c.name || `category ${ci + 1}`}`} onClick={() => removeCategory(ci)}>
                      <X size={16} aria-hidden />
                    </IconBtn>
                  </span>
                </div>
                <textarea
                  aria-label={`Category ${ci + 1} name`}
                  rows={2}
                  maxLength={100}
                  value={c.name}
                  placeholder="Category name"
                  onChange={(e) => updateCat(ri, ci, (x) => ({ ...x, name: e.target.value }))}
                  className="w-full resize-none rounded-lg bg-blue-950/40 px-2 py-1 text-center text-sm font-bold uppercase text-white placeholder:normal-case placeholder:text-blue-300 focus:bg-blue-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {/* R8-9: optional smaller line under the category name on the TV. */}
                <input
                  aria-label={`Category ${ci + 1} subheading`}
                  maxLength={100}
                  value={c.subheading ?? ''}
                  placeholder="Subheading (optional)"
                  onChange={(e) => updateCat(ri, ci, (x) => ({ ...x, subheading: e.target.value || undefined }))}
                  className="mt-1 w-full rounded-lg bg-blue-950/40 px-2 py-1 text-center text-xs font-semibold uppercase text-blue-50 placeholder:normal-case placeholder:font-normal placeholder:text-blue-300/80 focus:bg-blue-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  data-testid="category-subheading-input"
                />
              </div>
            ))}
            {Array.from({ length: rowCount }).map((_, row) =>
              round.categories.map((c, ci) => {
                const q = c.clues[row];
                if (!q) {
                  if (row === c.clues.length)
                    return (
                      <button
                        key={`${c.id}-add-${row}`}
                        type="button"
                        onClick={() =>
                          updateCat(ri, ci, (x) => ({ ...x, clues: [...x.clues, blankClue(round.categories.find((o) => o.clues[row])?.clues[row]?.value ?? (row + 1) * 200)] }))
                        }
                        className="min-h-16 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 hover:bg-white"
                      >
                        + Add clue
                      </button>
                    );
                  return <div key={`${c.id}-empty-${row}`} />;
                }
                const done = clueComplete(q);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setEditing({ ri, ci, qi: row })}
                    aria-label={`Edit ${c.name || `category ${ci + 1}`} ${q.value}${done ? '' : ' (unfinished)'}`}
                    className={cx(
                      'relative flex min-h-16 flex-col items-start rounded-xl border p-2 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500',
                      done ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50',
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="font-black text-blue-900">{q.value}</span>
                      <span className="flex gap-1 text-xs">
                        {q.dailyWager ? <span title="Daily Double!"><Star size={12} className="inline fill-current" aria-hidden /></span> : null}
                        {q.media?.length ? <span title="Has media"><Image size={12} className="inline" aria-hidden /></span> : null}
                      </span>
                    </span>
                    <span className={cx('line-clamp-2 text-xs', done ? 'text-slate-700' : 'italic text-amber-800')}>{q.question.trim() ? plainText(q.question) : hasClueMedia(q) ? mediaLabel(q) : 'Needs clue text or media'}</span>
                  </button>
                );
              }),
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Tip: drag a category header to reorder, or use the arrow buttons. Click a clue to edit it.</p>
        </div>
      )}

      {/* Clue editor */}
      <Modal open={editing != null && editingClue != null} onClose={closeEditing} title="Edit clue" wide>
        {editing && editingClue ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-600">
              {content.rounds[editing.ri].name} · {content.rounds[editing.ri].categories[editing.ci].name || `Category ${editing.ci + 1}`} · row {editing.qi + 1}
            </p>
            <ClueFields clue={editingClue} category={content.rounds[editing.ri].categories[editing.ci].name} onChange={(p) => updateClue(editing.ri, editing.ci, editing.qi, p)} />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" size="sm" disabled={editing.qi === 0} onClick={() => moveClue(editing.ri, editing.ci, editing.qi, -1)}>
                ▲ Move up
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={editing.qi >= content.rounds[editing.ri].categories[editing.ci].clues.length - 1}
                onClick={() => moveClue(editing.ri, editing.ci, editing.qi, 1)}
              >
                ▼ Move down
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-700"
                onClick={() => updateClue(editing.ri, editing.ci, editing.qi, { question: '', answer: '', notes: undefined, dailyWager: undefined, media: undefined })}
              >
                Clear clue
              </Button>
              <span className="flex-1" />
              {boardIdRef.current ? (
                <ActionButton variant="secondary" onAction={() => openPreview(content.rounds[editing.ri].categories[editing.ci].clues[editing.qi]?.id)} data-testid="clue-preview">
                  <Eye size={16} aria-hidden /> Preview this clue
                </ActionButton>
              ) : null}
              <Button onClick={closeEditing}>Done</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <AddRoundModal
        open={addRoundOpen}
        defaultName={`Round ${standardCount + 1}`}
        defaultMult={standardCount + 1}
        onClose={closeAddRound}
        onAdd={(n, m, c, r) => {
          addRound(n, m, c, r);
          setAddRoundOpen(false);
        }}
      />

      {round.kind === 'standard' ? (
        <SetValuesModal
          open={valuesOpen}
          round={round}
          onClose={closeValues}
          onApply={(values) => {
            updateRound(ri, (r) => ({ ...r, categories: r.categories.map((c) => ({ ...c, clues: c.clues.map((q, i) => ({ ...q, value: values[i] ?? q.value })) })) }));
            setValuesOpen(false);
          }}
        />
      ) : null}

      <VersionsModal
        open={versionsOpen}
        boardId={boardIdRef.current}
        hasUnsaved={revRef.current > savedRev.current}
        onClose={closeVersions}
        onRestored={onRestored}
        askConfirm={setConfirm}
      />

      <Modal open={confirm != null} onClose={closeConfirm} title={confirm?.title ?? ''}>
        <div className="mb-4 text-slate-700">{confirm?.message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeConfirm}>
            Cancel
          </Button>
          <ActionButton
            variant={confirm?.danger ? 'danger' : 'primary'}
            onAction={async () => {
              const c = confirm;
              setConfirm(null);
              await c?.onConfirm();
            }}
          >
            {confirm?.confirmLabel ?? 'OK'}
          </ActionButton>
        </div>
      </Modal>
    </div>
  );
}

// ---------- small pieces ----------

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-7 items-center justify-center rounded-md text-sm text-blue-100 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Spec §19 helper: AI writes a clue for the answer, or tidies the wording. Shown only when AI is set up. */
function AiClueHelper({ clue, category, onChange }: { clue: Clue; category: string; onChange: (p: Partial<Clue>) => void }) {
  const st = useFetch(() => hostApi<AiStatus>('GET', '/api/ai').catch(() => null), []);
  const [busy, setBusy] = useState<'write' | 'tidy' | null>(null);
  const [hint, setHint] = useState<{ question: string; answer: string } | null>(null);
  useEffect(() => setHint(null), [clue.id]);
  const ready = !!st.data && (!st.data.keyRequired || st.data.keySaved);
  if (!ready) return null;
  const ask = async (mode: 'write' | 'tidy') => {
    setBusy(mode);
    const r = await attempt(() => hostApi<{ question: string; answer: string }>('POST', '/api/ai/clue', { mode, category, value: clue.value, question: clue.question, answer: clue.answer }));
    setBusy(null);
    if (r) setHint(r);
  };
  return (
    <div className="space-y-2" data-testid="ai-clue-helper">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!clue.answer.trim() || !!busy} busy={busy === 'write'} onClick={() => void ask('write')} data-testid="ai-write-clue">
          <Sparkles size={14} aria-hidden /> Write a clue for this answer
        </Button>
        <Button size="sm" variant="ghost" disabled={!clue.question.trim() || !!busy} busy={busy === 'tidy'} onClick={() => void ask('tidy')} data-testid="ai-tidy-clue">
          <Sparkles size={14} aria-hidden /> Tidy the wording
        </Button>
      </div>
      {hint && (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm" data-testid="ai-clue-suggestion">
          <p className="text-xs font-bold tracking-wide text-violet-800 uppercase">AI suggestion — check it</p>
          <p className="font-semibold text-slate-900">{hint.question}</p>
          <p className="text-slate-700">Answer: {hint.answer}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onChange({ question: hint.question, answer: hint.answer, notes: clue.notes?.trim() ? clue.notes : 'AI-generated — check before playing' });
                setHint(null);
              }}
              data-testid="ai-clue-use"
            >
              Use it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHint(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClueFields({ clue, onChange, final, category = '' }: { clue: Clue; onChange: (p: Partial<Clue>) => void; final?: boolean; category?: string }) {
  const media = clue.media ?? [];
  const answerMedia = clue.answerMedia ?? [];
  const hasMedia = media.length > 0 || answerMedia.length > 0;
  return (
    <div className="grid gap-4">
      {!final ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-36">
            <Field label="Value">
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                step={100}
                value={clue.value}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  onChange({ value: Number.isFinite(v) ? Math.min(1_000_000, Math.max(0, v)) : 0 });
                }}
              />
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" className="h-5 w-5" checked={Boolean(clue.dailyWager)} onChange={(e) => onChange({ dailyWager: e.target.checked || undefined })} />
            <Star size={16} aria-hidden className="text-amber-500" /> Daily Double!
          </label>
        </div>
      ) : null}

      <section className="space-y-3 rounded-xl border border-slate-200 p-3" aria-labelledby="clue-presentation">
        <h3 id="clue-presentation" className="font-bold">
          Clue presentation
        </h3>
        <Field label="Question (shown on the board)" hint={media.length ? 'Optional when the clue is a picture, sound or video.' : undefined} group>
          <RichField value={clue.question} onChange={(question) => onChange({ question })} rows={3} maxLength={2000} label="Question" fieldLabel="Question (shown on the board)" testId="clue-question" />
        </Field>
        <AiClueHelper clue={clue} category={category} onChange={onChange} />
        <MediaList
          label="Clue media"
          hint="Captions appear under the picture on the TV (for example a hint)."
          items={media}
          onItems={(next) => onChange({ media: next.length ? next : undefined })}
          testId="clue-media"
        />
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 p-3" aria-labelledby="answer-reveal">
        <h3 id="answer-reveal" className="font-bold">
          Answer reveal
        </h3>
        <Field label="Answer (host only until revealed)" group>
          <RichField value={clue.answer} onChange={(answer) => onChange({ answer })} rows={2} maxLength={1000} label="Answer" fieldLabel="Answer (host only until revealed)" testId="clue-answer-input" />
        </Field>
        <MediaList
          label="Answer media (optional)"
          hint="Shown instead of the clue media when you reveal the answer — e.g. the uncovered picture."
          items={answerMedia}
          onItems={(next) => onChange({ answerMedia: next.length ? next : undefined })}
          testId="answer-media"
        />
      </section>

      <details className="rounded-xl border border-slate-200 p-3" open={hasMedia || !!clue.unlock}>
        <summary className="cursor-pointer font-bold">Layout & buzzers</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Layout on the TV">
            <select className={inputCls} value={clue.layout ?? 'auto'} onChange={(e) => onChange({ layout: e.target.value === 'auto' ? undefined : (e.target.value as ClueLayout) })} aria-label="Layout on the TV">
              <option value="auto">Automatic (media first when there is a picture)</option>
              <option value="media">Media emphasized</option>
              <option value="balanced">Balanced media and text</option>
              <option value="text">Text emphasized</option>
            </select>
          </Field>
          <Field label="Buzzer unlock" hint="Used when the game's automatic unlock setting is not Off.">
            <select className={inputCls} value={clue.unlock ?? 'default'} onChange={(e) => onChange({ unlock: e.target.value === 'default' ? undefined : (e.target.value as ClueUnlock) })} aria-label="Buzzer unlock">
              <option value="default">Use the game setting</option>
              <option value="immediate">Unlock as soon as the clue opens</option>
              <option value="host">Wait for the host</option>
              <option value="mediaStart">Unlock when the media starts</option>
              <option value="mediaEnd">Unlock when the media finishes</option>
            </select>
          </Field>
        </div>
      </details>

      <Field label="Host notes" hint="Only visible on the host controller">
        <textarea className={inputCls} rows={2} maxLength={2000} value={clue.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
      </Field>
    </div>
  );
}

/** Upload / caption / remove media for one side of a clue. */
function MediaList({ label, hint, items, onItems, testId }: { label: string; hint: string; items: MediaRef[]; onItems: (m: MediaRef[]) => void; testId: string }) {
  const fileRefs = useRef<Partial<Record<MediaKind, HTMLInputElement | null>>>({});
  const [uploading, setUploading] = useState<MediaKind | null>(null);
  const upload = async (e: ChangeEvent<HTMLInputElement>, kind: MediaKind) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (items.length >= MAX_MEDIA) return toast(`At most ${MAX_MEDIA} media items here.`, 'error');
    const fd = new FormData();
    fd.append('file', f);
    setUploading(kind);
    const r = await attempt(() => hostApi<{ id: string; kind: MediaRef['kind']; url: string }>('POST', `/api/media?kind=${kind}`, undefined, fd), `${MEDIA_FORMATS[kind].label} added`);
    setUploading(null);
    if (r) onItems([...items, { kind: r.kind, url: r.url }]);
  };
  const kindIcon = { image: Image, audio: Music, video: Film } as const;
  return (
    <div data-testid={testId}>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      {items.length ? (
        <ul className="mb-2 grid gap-2 sm:grid-cols-2">
          {items.map((m, i) => (
            <li key={`${m.url}-${i}`} className="rounded-xl border border-slate-200 p-2">
              {m.kind === 'image' ? (
                <img src={m.url} alt={m.caption ?? ''} className="mb-2 max-h-36 w-full rounded-lg bg-slate-100 object-contain" />
              ) : m.kind === 'audio' ? (
                <audio src={m.url} controls className="mb-2 w-full" />
              ) : (
                <video src={m.url} controls className="mb-2 max-h-36 w-full rounded-lg bg-black" />
              )}
              <div className="flex gap-2">
                <input
                  className={cx(inputCls, 'py-1.5 text-sm')}
                  aria-label={`${label}: caption ${i + 1}`}
                  placeholder="Caption (optional)"
                  maxLength={200}
                  value={m.caption ?? ''}
                  onChange={(e) => onItems(items.map((x, k) => (k === i ? { ...x, caption: e.target.value || undefined } : x)))}
                />
                <Button size="sm" variant="ghost" className="text-red-700" aria-label={`${label}: remove ${i + 1}`} onClick={() => onItems(items.filter((_, k) => k !== i))}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(['image', 'audio', 'video'] as const).map((kind) => {
          const Icon = kindIcon[kind];
          return (
            <span key={kind}>
              <input
                ref={(el) => {
                  fileRefs.current[kind] = el;
                }}
                type="file"
                accept={acceptFor(kind)}
                className="hidden"
                aria-hidden
                tabIndex={-1}
                data-testid={`${testId}-${kind}-input`}
                onChange={(e) => void upload(e, kind)}
              />
              <Button
                size="sm"
                variant="secondary"
                busy={uploading === kind}
                disabled={items.length >= MAX_MEDIA || (uploading !== null && uploading !== kind)}
                title={`Supported: ${formatList(kind)}`}
                onClick={() => fileRefs.current[kind]?.click()}
              >
                <Icon size={16} aria-hidden /> Add {kind}
              </Button>
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Images: {formatList('image')} · Audio: {formatList('audio')} · Video: {formatList('video')}
      </p>
    </div>
  );
}

function AddRoundModal({
  open,
  defaultName,
  defaultMult,
  onClose,
  onAdd,
}: {
  open: boolean;
  defaultName: string;
  defaultMult: number;
  onClose: () => void;
  onAdd: (name: string, mult: number, cats: number, rows: number) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [mult, setMult] = useState(defaultMult);
  const [cats, setCats] = useState(6);
  const [rows, setRows] = useState(5);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(defaultName);
      setMult(defaultMult);
      setCats(6);
      setRows(5);
    }
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v) || lo));
  return (
    <Modal open={open} onClose={onClose} title="Add a round">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(name.trim().slice(0, 60) || defaultName, clamp(mult, 1, 10), clamp(cats, 1, MAX_CATS), clamp(rows, 1, MAX_CLUES));
        }}
      >
        <Field label="Round name">
          <input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Value multiplier" hint={`Values will be ${Array.from({ length: Math.min(rows, 5) }, (_, i) => (i + 1) * 200 * clamp(mult, 1, 10)).join(', ')}${rows > 5 ? ', …' : ''}`}>
          <input className={inputCls} type="number" min={1} max={10} value={mult} onChange={(e) => setMult(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categories">
            <input className={inputCls} type="number" min={1} max={MAX_CATS} value={cats} onChange={(e) => setCats(Number(e.target.value))} />
          </Field>
          <Field label="Clues per category">
            <input className={inputCls} type="number" min={1} max={MAX_CLUES} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add round</Button>
        </div>
      </form>
    </Modal>
  );
}

function SetValuesModal({ open, round, onClose, onApply }: { open: boolean; round: Round; onClose: () => void; onApply: (values: number[]) => void }) {
  const rows = Math.max(0, ...round.categories.map((c) => c.clues.length));
  const first = round.categories[0]?.clues[0]?.value || 200;
  const [mode, setMode] = useState<'multiple' | 'step'>('multiple');
  const [base, setBase] = useState(first);
  const [start, setStart] = useState(first);
  const [step, setStep] = useState(first);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBase(first);
      setStart(first);
      setStep(first);
    }
  }
  const n = (v: number) => (Number.isFinite(v) ? Math.min(1_000_000, Math.max(0, Math.round(v))) : 0);
  const values = Array.from({ length: rows }, (_, i) => n(mode === 'multiple' ? base * (i + 1) : start + step * i));
  return (
    <Modal open={open} onClose={onClose} title={`Set values — ${round.name}`}>
      <div className="grid gap-3">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-700">Pattern</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="vmode" className="h-5 w-5" checked={mode === 'multiple'} onChange={() => setMode('multiple')} />
            Base × row number
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="vmode" className="h-5 w-5" checked={mode === 'step'} onChange={() => setMode('step')} />
            Start value + custom step
          </label>
        </fieldset>
        {mode === 'multiple' ? (
          <Field label="Base value">
            <input className={inputCls} type="number" min={0} value={base} onChange={(e) => setBase(Number(e.target.value))} />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First row">
              <input className={inputCls} type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} />
            </Field>
            <Field label="Step">
              <input className={inputCls} type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} />
            </Field>
          </div>
        )}
        <p className="rounded-xl bg-slate-50 p-3 text-sm">
          Rows get: <strong>{values.join(', ')}</strong>
        </p>
        <p className="text-xs text-slate-500">Applies to every category in this round. Questions and answers are not changed.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(values)} disabled={rows === 0}>
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function VersionsModal({
  open,
  boardId,
  hasUnsaved,
  onClose,
  onRestored,
  askConfirm,
}: {
  open: boolean;
  boardId: string | null;
  hasUnsaved: boolean;
  onClose: () => void;
  onRestored: (b: BoardRecord) => void;
  askConfirm: (c: ConfirmState) => void;
}) {
  const [versions, setVersions] = useState<{ id: number; title: string; savedAt: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !boardId) return;
    let alive = true;
    setVersions(null);
    setError(null);
    hostApi<{ id: number; title: string; savedAt: number }[]>('GET', `/api/boards/${encodeURIComponent(boardId)}/versions`)
      .then((v) => alive && setVersions(v))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, boardId]);

  return (
    <Modal open={open} onClose={onClose} title="Version history">
      <p className="mb-3 text-sm text-slate-600">A version is recorded each time you press Save. A restored version is added as the newest entry, so nothing in this list is lost.</p>
      {error ? <p className="text-red-700">{error}</p> : null}
      {!versions && !error ? <p className="text-slate-500">Loading…</p> : null}
      {versions && versions.length === 0 ? <p className="text-slate-500">No saved versions yet.</p> : null}
      {versions && versions.length ? (
        <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-auto">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.title}</p>
                <p className="text-sm text-slate-500">
                  {new Date(v.savedAt).toLocaleString()}
                  {i === 0 ? ' · latest' : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  boardId &&
                  askConfirm({
                    title: 'Restore this version?',
                    message: (
                      <>
                        The board will be replaced with the version from <strong>{new Date(v.savedAt).toLocaleString()}</strong>.
                        {hasUnsaved ? ' Your unsaved changes will be lost.' : ''}
                      </>
                    ),
                    confirmLabel: 'Restore',
                    onConfirm: async () => {
                      const b = await attempt(() => hostApi<BoardRecord>('POST', `/api/boards/${encodeURIComponent(boardId)}/versions/${v.id}/restore`), 'Version restored');
                      if (b) onRestored(b);
                    },
                  })
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}

/**
 * Clue / answer text with line breaks (Enter or Shift+Enter) and bold, italics, underline
 * (R8-7, R8-8): the buttons and Ctrl+B / I / U wrap the selection in [b] [i] [u] tags, which the TV,
 * the host and phones render (RichText). A preview appears once formatting or a line break is used.
 */
function RichField({ value, onChange, rows, maxLength, label, fieldLabel, testId }: { value: string; onChange: (v: string) => void; rows: number; maxLength: number; label: string; fieldLabel: string; testId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (tag: 'b' | 'i' | 'u') => {
    const el = ref.current;
    if (!el) return;
    const r = toggleTag(value, el.selectionStart, el.selectionEnd, tag);
    if (r.text.length > maxLength) return;
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const tools: { tag: 'b' | 'i' | 'u'; name: string; Icon: typeof Bold }[] = [
    { tag: 'b', name: 'Bold', Icon: Bold },
    { tag: 'i', name: 'Italic', Icon: Italic },
    { tag: 'u', name: 'Underline', Icon: Underline },
  ];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={`${label} formatting`}>
        {tools.map(({ tag, name, Icon }) => (
          <button
            key={tag}
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()} // keep the selection in the text box
            onClick={() => apply(tag)}
            aria-label={`${name} (${label.toLowerCase()})`}
            title={`${name} (Ctrl+${tag.toUpperCase()})`}
            data-testid={`${testId}-${tag}`}
          >
            <Icon size={18} aria-hidden />
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Enter or Shift+Enter starts a new line</span>
      </div>
      <textarea
        ref={ref}
        className={inputCls}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'b' || k === 'i' || k === 'u')) {
            e.preventDefault();
            apply(k);
          }
        }}
        aria-label={fieldLabel}
        data-testid={testId}
      />
      {isRich(value) && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800" data-testid={`${testId}-preview`}>
          <span className="mr-1 text-xs font-semibold text-slate-500">As shown:</span>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}
