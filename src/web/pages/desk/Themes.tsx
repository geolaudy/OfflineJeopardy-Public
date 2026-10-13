// TV themes: pick a preset or a custom theme for the TV, create/edit custom themes with a live
// preview (the real TV components in an iframe), upload a background image and logo, and
// import/export themes as self-contained .ojtheme.json files.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { downloadFile, hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Card, Field, Modal, cx, inputCls, toast } from '../../components/ui';
import { contrastRatio } from '../../lib/avatars';
import { FONT_STACKS, THEME_PRESETS, newThemeData, type CustomTheme, type CustomThemeData, type FontKey, type PresetId, type ThemeColors } from '../../../shared/themes';
import type { PreviewMessage, PreviewView } from '../board/Preview';
import { RotateCcw } from 'lucide-react';

const COLOR_FIELDS: [keyof ThemeColors, string][] = [
  ['background', 'Background'],
  ['background2', 'Background (edge)'],
  ['category', 'Category tiles'],
  ['categoryText', 'Category text'],
  ['tile', 'Clue tiles'],
  ['value', 'Point values'],
  ['used', 'Played tiles'],
  ['grid', 'Grid lines'],
  ['text', 'Text'],
  ['accent', 'Accent (answers, timer)'],
  ['buzzer', 'Buzzers-open light'],
];

const slug = (s: string) => s.replace(/[^a-z0-9 _-]/gi, '').trim() || 'theme';

export default function Themes() {
  const themes = useFetch(() => hostApi<CustomTheme[]>('GET', '/api/themes'), []);
  const settings = useFetch(() => hostApi<{ boardTheme: string }>('GET', '/api/settings'), []);
  const [editing, setEditing] = useState<{ id: string | null; data: CustomThemeData } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const current = settings.data?.boardTheme ?? 'classic';

  const use = async (id: string) => {
    const r = await attempt(() => hostApi<{ boardTheme: string }>('PUT', '/api/settings', { boardTheme: id }), 'The TV now uses this theme');
    if (r) settings.setData(r);
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast('That theme file is too large (max 5 MB).', 'error');
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      return toast('That file is not a theme file.', 'error');
    }
    const r = await attempt(() => hostApi<{ theme: CustomTheme; warnings: string[] }>('POST', '/api/themes/import', json), 'Theme imported');
    if (r) {
      for (const w of r.warnings) toast(w, 'info');
      await themes.reload();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-3xl font-black">TV themes</h1>
        <Button variant="secondary" onClick={() => importRef.current?.click()}>
          ⬆ Import theme…
        </Button>
        <Button onClick={() => setEditing({ id: null, data: newThemeData(current.startsWith('custom:') ? 'classic' : (current as PresetId), 'My theme') })} data-testid="new-theme">
          + New theme
        </Button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onImport(e)} data-testid="theme-import-input" />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-bold">Built-in themes</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {THEME_PRESETS.map((p) => (
            <Card key={p.id} className={cx('space-y-2 !p-2', current === p.id && 'ring-2 ring-blue-700')}>
              <MiniPreview theme={p.id} custom={null} />
              <div className="flex items-center gap-1 px-1">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.label}</span>
                {current === p.id ? (
                  <span className="text-xs font-bold text-blue-700">On TV</span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => use(p.id)}>
                    Use
                  </Button>
                )}
              </div>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setEditing({ id: null, data: newThemeData(p.id, `My ${p.label}`) })}>
                Customize…
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">My themes</h2>
        {!themes.data?.length ? (
          <p className="text-slate-600">No custom themes yet. Customize a built-in theme or import one.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="custom-themes">
            {themes.data.map((t) => {
              const id = `custom:${t.id}`;
              return (
                <Card key={t.id} className={cx('space-y-2 !p-2', current === id && 'ring-2 ring-blue-700')}>
                  <MiniPreview theme={t.base} custom={t} />
                  <div className="flex items-center gap-1 px-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="custom-theme-name">
                      {t.name}
                    </span>
                    {current === id ? (
                      <span className="text-xs font-bold text-blue-700">On TV</span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => use(id)}>
                        Use
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ id: t.id, data: stripMeta(t) })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => attempt(() => downloadFile(`/api/themes/${t.id}/export`, `${slug(t.name)}.ojtheme.json`))}>
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700"
                      onClick={async () => {
                        if (!confirm(`Delete the theme "${t.name}"?`)) return;
                        if (await attempt(() => hostApi('DELETE', `/api/themes/${t.id}`), 'Theme deleted')) {
                          await themes.reload();
                          await settings.reload();
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <ThemeEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async (t, andUse) => {
            setEditing(null);
            await themes.reload();
            if (andUse) await use(`custom:${t.id}`);
          }}
        />
      )}
    </div>
  );
}

function stripMeta(t: CustomTheme): CustomThemeData {
  const { id: _i, createdAt: _c, updatedAt: _u, ...data } = t;
  return data;
}

/** The real TV page in an iframe, fed the draft theme over postMessage. */
function LivePreview({ theme, custom, view, className, title }: { theme: string; custom: CustomThemeData | null; view: PreviewView; className?: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === ref.current?.contentWindow && (e.data as { type?: string })?.type === 'oj-preview-ready') setReady(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const m: PreviewMessage = { type: 'oj-theme-preview', theme, custom, view };
    ref.current?.contentWindow?.postMessage(m, location.origin);
  }, [ready, theme, custom, view]);
  return (
    <div className={cx('relative aspect-video w-full overflow-hidden rounded-lg bg-black', className)}>
      {/* Rendered at 1280×720 and scaled down so proportions match a real TV. */}
      <iframe ref={ref} src="/board/preview" title={title} tabIndex={-1} loading="lazy" className="pointer-events-none absolute top-0 left-0 h-[720px] w-[1280px] origin-top-left border-0" style={{ transform: 'scale(var(--s))' }} />
      <ScaleToWidth />
    </div>
  );
}

/** Sets --s on the parent so the 1280px iframe fills the container width. */
function ScaleToWidth() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const apply = () => host.style.setProperty('--s', String(host.clientWidth / 1280));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} hidden />;
}

function MiniPreview({ theme, custom }: { theme: string; custom: CustomThemeData | null }) {
  return <LivePreview theme={theme} custom={custom} view="board" title={`${custom?.name ?? theme} preview`} />;
}

function ThemeEditor({ initial, onClose, onSaved }: { initial: { id: string | null; data: CustomThemeData }; onClose: () => void; onSaved: (t: CustomTheme, andUse: boolean) => void }) {
  const [d, setD] = useState<CustomThemeData>(initial.data);
  const [view, setView] = useState<PreviewView>('board');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CustomThemeData>) => setD((x) => ({ ...x, ...patch }));
  const setColor = (k: keyof ThemeColors, v: string) => setD((x) => ({ ...x, colors: { ...x.colors, [k]: v } }));
  const lowContrast = d.colors.value && d.colors.tile && contrastRatio(d.colors.value, d.colors.tile) < 3;

  const upload = async (f: File | undefined, key: 'backgroundImage' | 'logo') => {
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f, f.name);
    const r = await attempt(() => hostApi<{ url: string; kind: string }>('POST', '/api/media', undefined, fd));
    if (!r) return;
    if (r.kind !== 'image') return toast('Please choose an image (JPEG, PNG, WebP or GIF).', 'error');
    set({ [key]: r.url } as Partial<CustomThemeData>);
  };

  const save = async (andUse: boolean) => {
    if (!d.name.trim()) return toast('Give the theme a name.', 'error');
    setBusy(true);
    try {
      const t = await attempt(() => (initial.id ? hostApi<CustomTheme>('PUT', `/api/themes/${initial.id}`, d) : hostApi<CustomTheme>('POST', '/api/themes', d)), 'Theme saved');
      if (t) onSaved(t, andUse);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit theme — ${initial.data.name}` : 'New theme'} wide>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
          <LivePreview theme={d.base} custom={d} view={view} title="Live theme preview" />
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Preview screen">
            {(
              [
                ['board', 'Board'],
                ['clue', 'Question'],
                ['intro', 'Category intro'],
                ['title', 'Round title + logo'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cx('min-h-9 rounded-lg px-3 text-sm font-semibold', view === k ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700')}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">This is the real TV screen with sample data. Empty settings keep the look of the base theme.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Theme name">
              <input className={inputCls} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Theme name" />
            </Field>
            <Field label="Based on">
              <select className={inputCls} value={d.base} onChange={(e) => set({ base: e.target.value as PresetId })} aria-label="Based on">
                {THEME_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-slate-700">Colors</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {COLOR_FIELDS.map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <input type="color" className="h-9 w-11 shrink-0 cursor-pointer rounded border border-slate-300" value={d.colors[k] || '#888888'} onChange={(e) => setColor(k, e.target.value)} aria-label={label} />
                  <span className={cx('min-w-0 flex-1 truncate text-sm', !d.colors[k] && 'text-slate-400')}>{label}</span>
                  {d.colors[k] ? (
                    <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setColor(k, '')} aria-label={`Reset ${label}`}>
                      <RotateCcw size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {lowContrast ? <p className="mt-1 text-sm text-amber-700">Point values may be hard to read on these tiles — choose more contrasting colors.</p> : null}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['displayFont', 'Headings & values font'],
                ['clueFont', 'Question font'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <select className={inputCls} value={d[k]} onChange={(e) => set({ [k]: e.target.value as FontKey } as Partial<CustomThemeData>)} aria-label={label}>
                  {Object.entries(FONT_STACKS).map(([fk, f]) => (
                    <option key={fk} value={fk}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['categoryScale', 'Category text'],
                ['valueScale', 'Point values'],
                ['clueScale', 'Questions'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={`${label}: ${Math.round(d[k] * 100)}%`}>
                <input type="range" min={0.6} max={1.5} step={0.05} value={d[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<CustomThemeData>)} className="w-full" aria-label={`${label} size`} />
              </Field>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tile corners">
              <select className={inputCls} value={d.radius == null ? '' : String(d.radius)} onChange={(e) => set({ radius: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Default</option>
                <option value="0">Square</option>
                <option value="0.6">Slightly rounded</option>
                <option value="1.5">Rounded</option>
                <option value="3">Very rounded</option>
              </select>
            </Field>
            <Field label="Shadows">
              <select className={inputCls} value={d.shadows} onChange={(e) => set({ shadows: e.target.value as CustomThemeData['shadows'] })}>
                <option value="preset">Default</option>
                <option value="on">Strong</option>
                <option value="off">None (flat)</option>
              </select>
            </Field>
            <Field label="Before values">
              <select className={inputCls} value={d.valuePrefix == null ? 'default' : d.valuePrefix} onChange={(e) => set({ valuePrefix: e.target.value === 'default' ? null : e.target.value })} aria-label="Value prefix">
                <option value="default">Default</option>
                <option value="">Nothing (200)</option>
                <option value="$">$ (dollars)</option>
                <option value="€">€ (euros)</option>
                <option value="£">£ (pounds)</option>
                <option value="★">★ (stars)</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ImagePick label="Background image" url={d.backgroundImage} onPick={(f) => upload(f, 'backgroundImage')} onClear={() => set({ backgroundImage: null })} />
            <ImagePick label="Logo (title screens)" url={d.logo} onPick={(f) => upload(f, 'logo')} onClear={() => set({ logo: null })} />
          </div>
          {d.backgroundImage ? (
            <Field label={`Darken background image: ${Math.round(d.backgroundDim * 100)}%`}>
              <input type="range" min={0} max={0.9} step={0.05} value={d.backgroundDim} onChange={(e) => set({ backgroundDim: Number(e.target.value) })} className="w-full" />
            </Field>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" busy={busy} onClick={() => save(false)} data-testid="save-theme">
              Save
            </Button>
            <Button busy={busy} onClick={() => save(true)} data-testid="save-use-theme">
              Save & use on TV
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ImagePick({ label, url, onPick, onClear }: { label: string; url: string | null; onPick: (f: File | undefined) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">none</span>}
        </div>
        <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>
          {url ? 'Change' : 'Choose…'}
        </Button>
        {url ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        ) : null}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
