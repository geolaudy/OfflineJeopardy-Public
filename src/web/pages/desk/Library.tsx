import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { ActionButton, Button, Card, Empty, Field, Modal, PageTitleBar, cx, inputCls, toast } from '../../components/ui';
import { Eye, Link2, Plus, Upload, Folder, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { ImportFromSourceModal } from './ImportFromSource';
import { CSV_HEADER } from '../../../shared/boardIO';
import type { BoardContent, Clue } from '../../../shared/game';

// ---------- API shapes ----------

interface BoardSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  folder: string;
  favorite: boolean;
  archived: boolean;
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
  rounds: { name: string; kind: 'standard' | 'final'; categories: string[] }[];
  clueCount: number;
  completeCount: number;
}

interface BoardFull extends Omit<BoardSummary, 'rounds' | 'clueCount' | 'completeCount'> {
  content: BoardContent;
}

interface ImportResponse {
  content: BoardContent | null;
  errors: string[];
  warnings: string[];
  summary: { rounds: number; categories: number; clues: number };
  title: string;
  saved: { id: string } | null;
}

type SortKey = 'recent' | 'title';

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

function safeName(title: string) {
  return title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'board';
}

export default function Library() {
  const navigate = useNavigate();
  const { data, error, loading, reload, setData } = useFetch(() => hostApi<BoardSummary[]>('GET', '/api/boards'), []);
  const boards = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>('recent');

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardSummary | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sourceImportOpen, setSourceImportOpen] = useState(false);
  const closeSourceImport = useCallback(() => setSourceImportOpen(false), []);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const folders = useMemo(() => [...new Set(boards.map((b) => b.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [boards]);
  const tags = useMemo(() => [...new Set(boards.flatMap((b) => b.tags))].sort((a, b) => a.localeCompare(b)), [boards]);
  const templates = useMemo(() => boards.filter((b) => b.isTemplate && !b.archived), [boards]);
  const archivedCount = boards.filter((b) => b.archived).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = boards.filter((b) => {
      if (!showArchived && b.archived) return false;
      if (favOnly && !b.favorite) return false;
      if (folder && b.folder !== folder) return false;
      if (tag && !b.tags.includes(tag)) return false;
      if (!q) return true;
      const hay = [b.title, b.description, ...b.tags, b.folder, ...b.rounds.flatMap((r) => r.categories)].join('\n').toLowerCase();
      return hay.includes(q);
    });
    return list.sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) : b.updatedAt - a.updatedAt));
  }, [boards, query, folder, tag, favOnly, showArchived, sort]);

  const filtersActive = Boolean(query || folder || tag || favOnly);

  // Stable callbacks: Modal re-focuses its first control whenever onClose changes identity.
  const closePreview = useCallback(() => setPreviewId(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeTemplates = useCallback(() => setTemplatesOpen(false), []);
  const openEditor = useCallback((id: string) => navigate(`/host/boards/${id}`), [navigate]);

  const replaceBoard = (b: Partial<BoardSummary> & { id: string }) =>
    setData((list) => (list ? list.map((x) => (x.id === b.id ? { ...x, ...b } : x)) : list));

  const patch = async (b: BoardSummary, body: Partial<Pick<BoardSummary, 'favorite' | 'archived'>>, msg?: string) => {
    replaceBoard({ id: b.id, ...body }); // optimistic
    const r = await attempt(() => hostApi<BoardSummary>('PATCH', `/api/boards/${b.id}`, body), msg);
    if (!r) replaceBoard(b);
    else replaceBoard({ id: b.id, updatedAt: r.updatedAt ?? b.updatedAt });
  };

  const duplicate = async (b: BoardSummary) => {
    const r = await attempt(() => hostApi<{ id: string }>('POST', `/api/boards/${b.id}/duplicate`), `Duplicated “${b.title}”`);
    if (r) await reload();
  };

  const exportBoard = (b: BoardSummary, format: 'json' | 'csv' | 'package') =>
    format === 'package'
      ? attempt(() => downloadFile(`/api/boards/${b.id}/package`, `${safeName(b.title)}.ojboard.zip`), 'Exported board package')
      : attempt(() => downloadFile(`/api/boards/${b.id}/export?format=${format}`, `${safeName(b.title)}.${format}`), `Exported ${format.toUpperCase()}`);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageTitleBar
        title="Board library"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={18} aria-hidden /> Import
            </Button>
            <Button variant="secondary" onClick={() => setSourceImportOpen(true)} data-testid="import-from-source">
              <Link2 size={18} aria-hidden /> From link or dataset
            </Button>
            {templates.length > 0 ? (
              <Button variant="secondary" onClick={() => setTemplatesOpen(true)}>
                From template
              </Button>
            ) : null}
            <Button onClick={() => navigate('/host/boards/new')}>
              <Plus size={18} aria-hidden /> New board
            </Button>
          </>
        }
      />

      {/* Search + filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="lib-search">
              Search
            </label>
            <input
              id="lib-search"
              type="search"
              className={inputCls}
              placeholder="Title, description, tag or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {folders.length > 0 ? (
            <div className="w-44">
              <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="lib-folder">
                Folder
              </label>
              <select id="lib-folder" className={inputCls} value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value="">All folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="w-40">
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="lib-sort">
              Sort
            </label>
            <select id="lib-sort" className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">Recently edited</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" className="h-5 w-5" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
            Favorites only
          </label>
          {archivedCount > 0 ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
              <input type="checkbox" className="h-5 w-5" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          ) : null}
        </div>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? '' : t)}
                className={cx(
                  'min-h-9 rounded-full border px-3 text-sm font-medium',
                  tag === t ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {loading && !data ? <p className="p-6 text-center text-slate-500">Loading boards…</p> : null}
      {error ? (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="font-semibold text-red-800">Could not load boards: {error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      ) : null}

      {data && boards.length === 0 ? (
        <Empty title="No boards yet">
          <p className="mb-3">Create a board from scratch or import a CSV / JSON file.</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button onClick={() => navigate('/host/boards/new')}>+ New board</Button>
          </div>
        </Empty>
      ) : null}

      {data && boards.length > 0 && visible.length === 0 ? (
        <Empty title="No boards match">
          {filtersActive ? (
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setFolder('');
                setTag('');
                setFavOnly(false);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Empty>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((b) => (
          <li key={b.id}>
            <BoardCard
              board={b}
              onEdit={() => navigate(`/host/boards/${b.id}`)}
              onPreview={() => navigate(`/board/preview/${b.id}`)}
              onQuickLook={() => setPreviewId(b.id)}
              onFavorite={() => void patch(b, { favorite: !b.favorite })}
              onArchive={() => void patch(b, { archived: !b.archived }, b.archived ? 'Board restored' : 'Board archived')}
              onDuplicate={() => duplicate(b)}
              onExport={(f) => exportBoard(b, f)}
              onDelete={() => setDeleteTarget(b)}
            />
          </li>
        ))}
      </ul>

      <PreviewModal boardId={previewId} onClose={closePreview} onEdit={openEditor} />

      <Modal open={deleteTarget != null} onClose={closeDelete} title="Delete board?">
        <p className="mb-2">
          “<strong>{deleteTarget?.title}</strong>” and its version history will be permanently deleted.
        </p>
        <p className="mb-4 text-sm text-slate-600">Completed games keep their own copy of the clues, so game history is not affected. Consider archiving instead if you might need it later.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <ActionButton
            variant="danger"
            onAction={async () => {
              const t = deleteTarget;
              if (!t) return;
              const ok = await attempt(() => hostApi('DELETE', `/api/boards/${t.id}`), 'Board deleted');
              if (ok) {
                setData((list) => (list ? list.filter((x) => x.id !== t.id) : list));
                setDeleteTarget(null);
              }
            }}
          >
            Delete
          </ActionButton>
        </div>
      </Modal>

      <ImportModal open={importOpen} onClose={closeImport} onSaved={openEditor} />
      <ImportFromSourceModal open={sourceImportOpen} onClose={closeSourceImport} onSaved={openEditor} />

      <Modal open={templatesOpen} onClose={closeTemplates} title="Start from a template">
        <p className="mb-3 text-sm text-slate-600">A copy of the template is created; the template itself stays unchanged.</p>
        <ul className="grid gap-2">
          {templates.map((t) => (
            <li key={t.id}>
              <ActionButton
                variant="secondary"
                className="w-full justify-between text-left"
                onAction={async () => {
                  const r = await attempt(() => hostApi<{ id: string }>('POST', `/api/boards/${t.id}/duplicate`));
                  if (r) {
                    setTemplatesOpen(false);
                    navigate(`/host/boards/${r.id}`);
                  }
                }}
              >
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-sm font-normal text-slate-500">{t.clueCount} clues</span>
              </ActionButton>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

// ---------- board card ----------

function BoardCard({
  board: b,
  onEdit,
  onPreview,
  onQuickLook,
  onFavorite,
  onArchive,
  onDuplicate,
  onExport,
  onDelete,
}: {
  board: BoardSummary;
  onEdit: () => void;
  onPreview: () => void;
  onQuickLook: () => void;
  onFavorite: () => void;
  onArchive: () => void;
  onDuplicate: () => Promise<unknown>;
  onExport: (f: 'json' | 'csv' | 'package') => Promise<unknown>;
  onDelete: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const standard = b.rounds.filter((r) => r.kind === 'standard').length;
  const hasFinal = b.rounds.some((r) => r.kind === 'final');
  const pctDone = b.clueCount ? Math.round((b.completeCount / b.clueCount) * 100) : 0;
  const complete = b.clueCount > 0 && b.completeCount === b.clueCount;

  return (
    <Card className={cx('flex h-full flex-col', b.archived && 'opacity-70')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold" title={b.title}>
            {b.title}
          </h2>
          <p className="text-sm text-slate-500">
            {b.folder ? (
                  <span className="mr-2 inline-flex items-center gap-1">
                    <Folder size={12} aria-hidden /> {b.folder}
                  </span>
                ) : null}
            Edited {timeAgo(b.updatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={b.favorite}
          aria-label={b.favorite ? `Remove ${b.title} from favorites` : `Add ${b.title} to favorites`}
          className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-slate-100', b.favorite ? 'text-amber-500' : 'text-slate-300')}
        >
          {b.favorite ? '★' : '☆'}
        </button>
      </div>

      {b.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-700">{b.description}</p> : null}

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
        {b.isTemplate ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Template</span> : null}
        {b.archived ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">Archived</span> : null}
        {b.tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            #{t}
          </span>
        ))}
      </div>

      <div className="mt-3 text-sm text-slate-700">
        {standard} round{standard === 1 ? '' : 's'}
        {hasFinal ? ' + Final' : ''} · {b.clueCount} clues
      </div>
      <div className="mt-1 flex items-center gap-2" aria-label={`${b.completeCount} of ${b.clueCount} clues complete`}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={cx('h-full rounded-full', complete ? 'bg-green-600' : 'bg-amber-500')} style={{ width: `${pctDone}%` }} />
        </div>
        <span className={cx('text-xs font-semibold', complete ? 'text-green-700' : 'text-amber-700')}>{complete ? 'Complete' : `${pctDone}% done`}</span>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={onPreview} data-testid="board-preview-button">
          <Eye size={16} aria-hidden /> Preview
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? 'Less' : 'More'} {moreOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </Button>
      </div>
      {moreOpen ? (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
          <Button size="sm" variant="secondary" onClick={onQuickLook}>
            Quick look (list)
          </Button>
          <ActionButton size="sm" variant="secondary" onAction={onDuplicate}>
            Duplicate
          </ActionButton>
          <ActionButton size="sm" variant="secondary" onAction={() => onExport('package')} title="Board plus its pictures, audio and video in one .zip file">
            Export package (with media)
          </ActionButton>
          <ActionButton size="sm" variant="secondary" onAction={() => onExport('json')}>
            Export JSON
          </ActionButton>
          <ActionButton size="sm" variant="secondary" onAction={() => onExport('csv')}>
            Export CSV
          </ActionButton>
          <Button size="sm" variant="secondary" onClick={onArchive}>
            {b.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button size="sm" variant="ghost" className="text-red-700" onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- preview ----------

function PreviewModal({ boardId, onClose, onEdit }: { boardId: string | null; onClose: () => void; onEdit: (id: string) => void }) {
  const { data, error, loading } = useFetch(
    () => (boardId ? hostApi<BoardFull>('GET', `/api/boards/${boardId}`) : Promise.resolve(null)),
    [boardId],
  );
  const [roundIdx, setRoundIdx] = useState(0);
  const [selected, setSelected] = useState<{ cat: string; clue: Clue } | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (boardId !== lastId) {
    setLastId(boardId);
    setRoundIdx(0);
    setSelected(null);
  }
  const board = data && data.id === boardId ? data : null;
  const round = board?.content.rounds[roundIdx];

  return (
    <Modal open={boardId != null} onClose={onClose} title={board ? board.title : 'Preview'} wide>
      {loading && !board ? <p className="text-slate-500">Loading…</p> : null}
      {error ? <p className="text-red-700">{error}</p> : null}
      {board && round ? (
        <div>
          <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Rounds">
            {board.content.rounds.map((r, i) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={i === roundIdx}
                onClick={() => {
                  setRoundIdx(i);
                  setSelected(null);
                }}
                className={cx('min-h-10 rounded-xl px-3 text-sm font-semibold', i === roundIdx ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
              >
                {r.kind === 'final' ? `⭐ ${r.name}` : r.name}
              </button>
            ))}
          </div>

          {round.kind === 'final' ? (
            <div className="rounded-xl bg-blue-950 p-4 text-white">
              <p className="text-sm uppercase tracking-wide text-blue-200">Category</p>
              <p className="mb-3 text-xl font-bold">{round.categories[0]?.name || '(no category)'}</p>
              <ClueDetail clue={round.categories[0]?.clues[0]} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, round.categories.length)}, minmax(110px, 1fr))` }}>
                {round.categories.map((c) => (
                  <div key={c.id} className="flex min-h-14 items-center justify-center rounded-md bg-blue-900 p-2 text-center text-xs font-bold uppercase text-white">
                    {c.name || '—'}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, ...round.categories.map((c) => c.clues.length)) }).map((_, row) =>
                  round.categories.map((c) => {
                    const q = c.clues[row];
                    if (!q) return <div key={`${c.id}-${row}`} className="rounded-md bg-slate-100" />;
                    const incomplete = !q.question.trim() || !q.answer.trim();
                    const isSel = selected?.clue.id === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelected({ cat: c.name, clue: q })}
                        aria-label={`${c.name || 'Category'} for ${q.value}`}
                        className={cx(
                          'relative min-h-12 rounded-md bg-blue-800 text-lg font-black text-amber-300 hover:bg-blue-700',
                          isSel && 'ring-4 ring-amber-400',
                          incomplete && 'opacity-60',
                        )}
                      >
                        {q.value}
                        {q.dailyWager ? <span className="absolute right-1 top-0.5 text-xs" title="Daily Wager">★</span> : null}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          )}

          {round.kind !== 'final' ? (
            selected ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-1 text-sm font-semibold text-slate-600">
                  {selected.cat || 'Category'} · {selected.clue.value}
                  {selected.clue.dailyWager ? ' · Daily Wager' : ''}
                </p>
                <ClueDetail clue={selected.clue} light />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Tap a value to see its question and answer.</p>
            )
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onEdit(board.id)}>Edit board</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function ClueDetail({ clue, light }: { clue?: Clue; light?: boolean }) {
  if (!clue) return <p className="italic">No clue.</p>;
  const muted = light ? 'text-slate-500' : 'text-blue-200';
  return (
    <div>
      <p className={cx('text-xs uppercase tracking-wide', muted)}>Question</p>
      <p className="mb-2 whitespace-pre-wrap text-lg">{clue.question || <em className={muted}>(empty)</em>}</p>
      <p className={cx('text-xs uppercase tracking-wide', muted)}>Answer</p>
      <p className="whitespace-pre-wrap font-semibold">{clue.answer || <em className={muted}>(empty)</em>}</p>
      {clue.notes ? <p className={cx('mt-2 text-sm', muted)}>Notes: {clue.notes}</p> : null}
      {clue.media?.length ? <p className={cx('mt-2 text-sm', muted)}>{clue.media.length} media attachment(s)</p> : null}
    </div>
  );
}

// ---------- import ----------

function packageForm(f: File) {
  const fd = new FormData();
  fd.append('file', f, f.name);
  return fd;
}

function ImportModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string; format: 'csv' | 'json' | 'package'; zip?: File } | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setTitle('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);
  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Board package (.zip): board + its pictures/audio/video, checked on the server.
    if (f.name.toLowerCase().endsWith('.zip') || f.type === 'application/zip') {
      if (f.size > 300 * 1024 * 1024) {
        toast('That package is too large (max 300 MB).', 'error');
        return;
      }
      setBusy(true);
      try {
        setFile({ name: f.name, text: '', format: 'package', zip: f });
        const r = await attempt(() => hostApi<ImportResponse>('POST', '/api/boards/import-package?preview=1', undefined, packageForm(f)));
        if (r) {
          setPreview(r);
          setTitle(r.title);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (f.size > 3_500_000) {
      toast('That file is too large to import (max ~3.5 MB).', 'error');
      return;
    }
    setBusy(true);
    try {
      const text = await f.text();
      const format: 'csv' | 'json' = /\.json$/i.test(f.name) || /^\s*[{[]/.test(text) ? 'json' : 'csv';
      setFile({ name: f.name, text, format });
      const r = await attempt(() => hostApi<ImportResponse>('POST', '/api/boards/import', { format, text, preview: true }));
      if (r) {
        setPreview(r);
        const base = f.name.replace(/\.(csv|json)$/i, '');
        setTitle(format === 'json' ? r.title : r.title === 'Imported board' ? base.slice(0, 120) : r.title);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file || !preview) return;
    const r = await attempt(
      () =>
        file.format === 'package' && file.zip
          ? hostApi<ImportResponse>('POST', `/api/boards/import-package?title=${encodeURIComponent(title.trim())}`, undefined, packageForm(file.zip))
          : hostApi<ImportResponse>('POST', '/api/boards/import', { format: file.format, text: file.text, title: title.trim() || undefined, preview: false }),
      'Board imported',
    );
    if (r?.saved) {
      reset();
      onClose();
      onSaved(r.saved.id);
    } else if (r) setPreview(r);
  };

  const blocked = !preview || preview.errors.length > 0 || !preview.content;

  return (
    <Modal open={open} onClose={close} title="Import a board" wide>
      <div className="grid gap-4">
        <div>
          <input ref={fileRef} type="file" accept=".csv,.json,.zip,text/csv,application/json,application/zip" className="sr-only" id="import-file" onChange={(e) => void onPick(e)} />
          <label
            htmlFor="import-file"
            className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-300"
          >
            <span className="font-semibold">{file ? (
              <span className="inline-flex items-center gap-1.5">
                <FileText size={16} aria-hidden /> {file.name}
              </span>
            ) : (
              'Choose a .csv, .json or board package (.zip)'
            )}</span>
            <span className="text-sm text-slate-500">{busy ? 'Checking…' : file ? 'Choose another file' : 'Files are read locally and checked before saving'}</span>
          </label>
        </div>

        {!preview ? (
          <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold">CSV format</summary>
            <p className="mt-2">
              First row is the header: <code className="rounded bg-white px-1">{CSV_HEADER.join(',')}</code>
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>One row per clue. Rows with the same round + category are grouped.</li>
              <li>
                A round named <strong>Final</strong> becomes the Final round (one category, one clue).
              </li>
              <li>
                <code>daily_wager</code>: <code>yes</code> or blank. <code>round</code> and <code>notes</code> are optional.
              </li>
            </ul>
            <p className="mt-2">JSON files exported from OfflineJeopardy can be imported as-is. Board packages (.ojboard.zip) also bring their pictures, audio and video.</p>
          </details>
        ) : null}

        {preview ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-3 text-sm">
              <span>
                <strong>{preview.summary.rounds}</strong> rounds
              </span>
              <span>
                <strong>{preview.summary.categories}</strong> categories
              </span>
              <span>
                <strong>{preview.summary.clues}</strong> clues
              </span>
            </div>
            {preview.errors.length ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                <p className="font-semibold">Fix these problems in the file, then choose it again:</p>
                <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview.warnings.length ? (
              <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <summary className="cursor-pointer font-semibold">
                  {preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'} (you can still import)
                </summary>
                <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {!blocked ? (
              <Field label="Board title">
                <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <ActionButton onAction={save} disabled={blocked || busy}>
            Save and edit
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
