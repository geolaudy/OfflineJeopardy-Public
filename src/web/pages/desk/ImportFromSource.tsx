// "Import from another source" (R2-20 / R2-21): Buzzinga share links, links to .csv/.json files,
// Buzzinga CSV exports, clue datasets and CSV files with media links. Inspect → preview → import.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileText, ImageOff, Link2, TriangleAlert } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt } from '../../lib/hooks';
import { ActionButton, Button, Field, Modal, cx, inputCls, toast } from '../../components/ui';

interface MissingMedia {
  where: string;
  side: 'clue' | 'answer';
  ref: string;
  reason: string;
}
interface BoardPreview {
  key: string;
  label: string;
  title: string;
  summary: { rounds: number; categories: number; clues: number; mediaFound: number };
  categories: { round: string; name: string; clues: number }[];
  missingMedia: MissingMedia[];
  warnings: string[];
  duplicateTitle?: string;
}
interface InspectResponse {
  importId: string;
  source: { id: string; label: string };
  title: string;
  summary: BoardPreview['summary'];
  board: BoardPreview;
  boards?: { key: string; label: string }[];
  warnings: string[];
  missingMedia: MissingMedia[];
  duplicateTitle?: string;
  attribution?: string;
  originUrl?: string;
}
interface CommitResponse {
  boardId: string;
  boards: { id: string; title: string }[];
  warnings: string[];
  media: { stored: number; failed: { where: string; ref: string; reason: string }[] };
}

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_SELECTION = 10;
const LIST_LIMIT = 200;

type Tab = 'link' | 'file';

export function ImportFromSourceModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (boardId: string) => void }) {
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [data, setData] = useState<InspectResponse | null>(null);
  const [preview, setPreview] = useState<BoardPreview | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef<string | null>(null);

  const discard = useCallback(() => {
    const id = importIdRef.current;
    importIdRef.current = null;
    if (id) void hostApi('DELETE', `/api/import/${encodeURIComponent(id)}`).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    discard();
    setData(null);
    setPreview(null);
    setSelection([]);
    setFilter('');
    setTitle('');
    setError(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }, [discard]);

  const close = useCallback(() => {
    if (committing) return;
    reset();
    setUrl('');
    onClose();
  }, [committing, reset, onClose]);

  // Drop any server-side pending import if the page goes away with the dialog open.
  useEffect(() => () => discard(), [discard]);

  const accept = (r: InspectResponse) => {
    importIdRef.current = r.importId;
    setData(r);
    setPreview({ ...r.board, duplicateTitle: r.duplicateTitle });
    const multi = (r.boards?.length ?? 0) > 1;
    setSelection(multi ? [r.board.key] : []);
    setTitle(r.board.title);
  };

  const inspect = async (body: { kind: 'url'; url: string } | { kind: 'file'; name: string; text: string }) => {
    reset();
    setInspecting(true);
    try {
      const r = await hostApi<InspectResponse>('POST', '/api/import/inspect', body);
      accept(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInspecting(false);
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError('That file is too large (max 64 MB).');
      return;
    }
    const text = await f.text();
    await inspect({ kind: 'file', name: f.name, text });
    setFileName(f.name);
  };

  // Multi-board datasets: preview follows the selection when exactly one show is chosen.
  const multi = (data?.boards?.length ?? 0) > 1;
  const single = !multi || selection.length === 1;
  const previewKey = multi && selection.length === 1 ? selection[0] : null;
  useEffect(() => {
    if (!data || !previewKey || previewKey === preview?.key) return;
    let live = true;
    void hostApi<BoardPreview>('GET', `/api/import/${encodeURIComponent(data.importId)}/preview?key=${encodeURIComponent(previewKey)}`)
      .then((p) => {
        if (!live) return;
        setPreview(p);
        setTitle(p.title);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [data, previewKey, preview?.key]);

  const shown = useMemo(() => {
    const list = data?.boards ?? [];
    const q = filter.trim().toLowerCase();
    return (q ? list.filter((b) => b.label.toLowerCase().includes(q)) : list).slice(0, LIST_LIMIT);
  }, [data, filter]);

  const toggle = (key: string) => {
    if (selection.includes(key)) setSelection(selection.filter((k) => k !== key));
    else if (selection.length >= MAX_SELECTION) toast(`Choose up to ${MAX_SELECTION} shows at a time.`, 'error');
    else setSelection([...selection, key]);
  };

  const commit = async () => {
    if (!data) return;
    setCommitting(true);
    try {
      const r = await attempt(() =>
        hostApi<CommitResponse>('POST', '/api/import/commit', {
          importId: data.importId,
          ...(single && title.trim() ? { title: title.trim() } : {}),
          ...(multi ? { selection } : {}),
        }),
      );
      if (!r) return;
      importIdRef.current = null; // consumed by the server
      const failed = r.media.failed.length;
      toast(
        r.boards.length > 1 ? `${r.boards.length} boards imported` : failed ? `Board imported — ${failed} media file${failed === 1 ? '' : 's'} could not be downloaded` : 'Board imported',
        failed ? 'info' : 'success',
      );
      reset();
      setUrl('');
      onClose();
      onSaved(r.boardId);
    } finally {
      setCommitting(false);
    }
  };

  const pv = preview;
  const warnings = data ? [...data.warnings.filter((w) => !pv?.warnings.includes(w)), ...(pv?.warnings ?? [])] : [];
  const missing = pv?.missingMedia ?? [];
  const canImport = !!data && !inspecting && !committing && (!multi || selection.length > 0);

  return (
    <Modal open={open} onClose={close} title="Import from another source" wide>
      <div className="grid gap-4">
        <div role="tablist" aria-label="Import source" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['link', 'From a link', Link2],
              ['file', 'From a file (dataset/CSV)', FileText],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              disabled={committing}
              onClick={() => {
                if (tab !== id) {
                  reset();
                  setTab(id);
                }
              }}
              className={cx('flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold', tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === 'link' ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void inspect({ kind: 'url', url: url.trim() });
            }}
          >
            <Field label="Share link" hint="A Buzzinga share link (Share > Copy share link) or a direct link to a .csv or .json board file.">
              <div className="flex gap-2">
                <input className={inputCls} type="url" inputMode="url" placeholder="https://play.buzzinga.io/share/…" value={url} onChange={(e) => setUrl(e.target.value)} disabled={committing} />
                <Button type="submit" variant="secondary" busy={inspecting} disabled={!url.trim() || committing}>
                  Check
                </Button>
              </div>
            </Field>
            <p className="text-xs text-slate-500">
              Importing from a link needs an internet connection; playing stays fully offline. Only boards their owner made shareable can be imported — nothing behind a sign-in or a paid plan.
            </p>
          </form>
        ) : (
          <div className="grid gap-2">
            <input ref={fileRef} id="import-source-file" type="file" accept=".csv,.json,.txt,text/csv,application/json" className="sr-only" onChange={(e) => void onPickFile(e)} disabled={committing} />
            <label
              htmlFor="import-source-file"
              className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-300"
            >
              <span className="font-semibold">{fileName || 'Choose a .csv or .json file'}</span>
              <span className="text-sm text-slate-500">{inspecting ? 'Checking…' : fileName ? 'Choose another file' : 'Checked on this computer before anything is saved'}</span>
            </label>
            <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold">Supported files</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Buzzinga CSV export</strong> (board editor &gt; gear icon &gt; Download CSV).
                </li>
                <li>
                  <strong>Clue dataset</strong>: a JSON list of clues with <code>category</code>, <code>value</code>, <code>question</code>, <code>answer</code>, <code>round</code>, <code>show_number</code>. Pick which shows become boards.
                </li>
                <li>
                  <strong>CSV</strong> with columns <code>round, category, value, question, answer</code> and optionally <code>daily_wager, notes, image, answer_image, caption</code>. Image columns take web links to pictures, sounds or videos.
                </li>
              </ul>
              <p className="mt-2">Use only content you have the right to use. OfflineJeopardy does not include or download any TV show content.</p>
            </details>
          </div>
        )}

        {error ? (
          <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {data && pv ? (
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">
              Source: <strong>{data.source.label}</strong>
              {data.attribution ? <span className="block text-xs text-slate-500">{data.attribution}</span> : null}
            </p>

            {multi ? (
              <Field label={`Shows (${data.boards!.length})`} hint={`Each chosen show becomes its own board. Up to ${MAX_SELECTION} at a time.`} group>
                <input className={cx(inputCls, 'mb-2')} placeholder="Filter by show number or date" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter shows" />
                <div className="max-h-48 overflow-auto rounded-xl border border-slate-200">
                  {shown.map((b) => (
                    <label key={b.key} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 px-3 text-sm last:border-b-0 hover:bg-slate-50">
                      <input type="checkbox" className="h-5 w-5" checked={selection.includes(b.key)} onChange={() => toggle(b.key)} />
                      {b.label}
                    </label>
                  ))}
                  {shown.length === 0 ? <p className="p-3 text-sm text-slate-500">No matching shows.</p> : null}
                </div>
                <span className="mt-1 block text-xs text-slate-500">{selection.length} selected</span>
              </Field>
            ) : null}

            {single ? (
              <>
                <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <span>
                    <strong>{pv.summary.rounds}</strong> rounds
                  </span>
                  <span>
                    <strong>{pv.summary.categories}</strong> categories
                  </span>
                  <span>
                    <strong>{pv.summary.clues}</strong> clues
                  </span>
                  <span>
                    <strong>{pv.summary.mediaFound}</strong> media files to download
                  </span>
                </div>
                <details className="rounded-xl border border-slate-200 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Categories</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {pv.categories.map((c, i) => (
                      <li key={i} className="truncate">
                        <span className="text-slate-500">{c.round}:</span> {c.name || <em>Untitled</em>} <span className="text-slate-400">({c.clues})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : null}

            {single && pv.duplicateTitle && pv.duplicateTitle.toLowerCase() === title.trim().toLowerCase() ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A board named “{pv.duplicateTitle}” already exists. The import will be saved as a separate board — you can rename it below.</p>
            ) : null}

            {single && missing.length ? (
              <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                  <ImageOff size={16} aria-hidden />
                  {missing.length} media item{missing.length === 1 ? '' : 's'} cannot be imported (the clue text is kept)
                </summary>
                <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                  {missing.map((m, i) => (
                    <li key={i} className="break-words">
                      {m.where}
                      {m.side === 'answer' ? ' (answer)' : ''}: {m.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {warnings.length ? (
              <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <summary className="cursor-pointer font-semibold">
                  {warnings.length} note{warnings.length === 1 ? '' : 's'} (you can still import)
                </summary>
                <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {single ? (
              <Field label="Board title">
                <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={committing} />
              </Field>
            ) : null}
            {pv.summary.mediaFound > 0 && single ? (
              <p className="text-xs text-slate-500">Media is downloaded and checked when you import. Files that fail are skipped and listed afterwards; the clues keep their text.</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {committing ? (
            <span className="mr-auto text-sm text-slate-600" role="status">
              {data && data.summary.mediaFound > 0 ? 'Downloading media and creating the board…' : 'Creating the board…'}
            </span>
          ) : null}
          <Button variant="secondary" onClick={close} disabled={committing}>
            Cancel
          </Button>
          <ActionButton onAction={commit} disabled={!canImport}>
            {multi && selection.length > 1 ? `Import ${selection.length} boards` : 'Import'}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
