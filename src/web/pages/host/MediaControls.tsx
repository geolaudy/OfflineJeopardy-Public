// Host controls for clue audio/video. The TV plays the media; this panel only sends commands.
// The host device loads metadata (for the duration) but never plays the sound itself.
import { useEffect, useState, type ReactNode } from 'react';
import { Music, Pause, Play, RotateCcw, Square, Video, Volume2, VolumeX, Image as ImageIcon } from 'lucide-react';
import type { GameView } from '../../../shared/views';
import type { HostAction } from '../../../shared/actions';
import { finalMediaLive, mediaPosition, type MediaRef } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import { Button, cx } from '../../components/ui';

type Run = (a: HostAction) => Promise<{ ok: boolean }>;

const fmt = (ms: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return '–:––';
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Duration from the file's metadata (no playback on this device). */
function useDuration(m: MediaRef) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.muted = true;
    const on = () => setMs(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.addEventListener('loadedmetadata', on);
    el.src = m.url;
    return () => {
      el.removeEventListener('loadedmetadata', on);
      el.removeAttribute('src');
      el.load();
    };
  }, [m.url, m.kind]);
  return ms;
}

/** Re-render a few times per second while playing, for the position read-out. */
function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [active]);
}

type Sides = { side: 'clue' | 'answer'; list: MediaRef[] }[];

export function MediaControls({ g, run }: { g: GameView; run: Run }) {
  const clue = g.clue!;
  const sides: Sides = [{ side: 'clue', list: clue.media }];
  if (clue.answerRevealed && clue.answerMedia.length) sides.push({ side: 'answer', list: clue.answerMedia });
  return (
    <MediaPanel g={g} run={run} clueId={clue.clueId} sides={sides}>
      {clue.unlockMode === 'mediaStart' && g.buzzer.openedAt == null && <p className="px-1 text-xs text-slate-500">Buzzers open automatically when the media starts.</p>}
      {clue.unlockMode === 'mediaEnd' && g.buzzer.openedAt == null && <p className="px-1 text-xs text-slate-500">Buzzers open automatically when the media finishes.</p>}
    </MediaPanel>
  );
}

/** R9-6.4: Final Jeopardy! sound and video — the clue's while the clue is on the TV, the correct
 *  response's once it is shown (never earlier, so nothing is revealed by accident). */
export function FinalMediaControls({ g, run }: { g: GameView; run: Run }) {
  const f = g.final!;
  const sides: Sides = [];
  if (finalMediaLive(f.stage, 'clue')) sides.push({ side: 'clue', list: f.media });
  if (finalMediaLive(f.stage, 'answer')) sides.push({ side: 'answer', list: f.answerMedia });
  return (
    <MediaPanel g={g} run={run} clueId={f.clueId} sides={sides}>
      {f.stage === 'clue' && !f.thinking && <p className="px-1 text-xs text-slate-500">The think time starts when the clue's sound or video finishes.</p>}
    </MediaPanel>
  );
}

/** Whether a side list has anything to play (images only show). */
export const playableIn = (sides: Sides) => sides.some(({ list }) => list.some((m) => m.kind !== 'image'));

function MediaPanel({ g, run, clueId, sides, children }: { g: GameView; run: Run; clueId: string; sides: Sides; children?: ReactNode }) {
  const playable = sides.flatMap(({ side, list }) => list.map((m, index) => ({ side, m, index })).filter(({ m }) => m.kind !== 'image'));
  if (!playable.length) return null;
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-2" data-testid="media-controls">
      {playable.map(({ side, m, index }) => (
        <MediaRow key={`${side}:${index}`} g={g} run={run} clueId={clueId} side={side} m={m} index={index} />
      ))}
      {children}
    </div>
  );
}

function MediaRow({ g, run, clueId, side, m, index }: { g: GameView; run: Run; clueId: string; side: 'clue' | 'answer'; m: MediaRef; index: number }) {
  const duration = useDuration(m);
  const pb = g.media && g.media.clueId === clueId && g.media.side === side && g.media.index === index ? g.media : null;
  const playing = pb?.status === 'playing';
  useTick(playing);
  const pos = pb ? mediaPosition(pb, serverNow()) : 0;
  const total = pb?.durationMs ?? duration;
  const label = m.caption || (m.kind === 'video' ? 'Video' : 'Audio');
  const Icon = m.kind === 'video' ? Video : Music;
  const play = () => run({ type: 'mediaPlay', clueId, side, index, durationMs: duration });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="media-row">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
        <Icon size={18} aria-hidden className="shrink-0 text-slate-500" />
        <span className="truncate">
          {side === 'answer' ? 'Answer: ' : ''}
          {label}
        </span>
      </span>
      <span className="text-sm text-slate-600 tabular-nums" data-testid="media-time">
        {fmt(pos)} / {fmt(total)}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className="h-full bg-blue-600" style={{ width: total ? `${Math.min(100, (pos / total) * 100)}%` : 0 }} />
      </div>
      <div className="flex w-full gap-2">
        {playing ? (
          <Button size="lg" variant="secondary" className="flex-1" onClick={() => run({ type: 'mediaPause' })} data-testid="media-pause">
            <Pause size={20} aria-hidden /> Pause
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={play} data-testid="media-play">
            <Play size={20} aria-hidden /> {pb && pb.status === 'paused' ? 'Resume' : 'Play on TV'}
          </Button>
        )}
        <Button size="lg" variant="secondary" disabled={!pb} onClick={() => run({ type: 'mediaRestart' })} aria-label="Restart" title="Restart">
          <RotateCcw size={20} aria-hidden />
        </Button>
        <Button size="lg" variant="secondary" disabled={!pb || pb.status === 'stopped'} onClick={() => run({ type: 'mediaStop' })} aria-label="Stop" title="Stop">
          <Square size={20} aria-hidden />
        </Button>
        <Button size="lg" variant="secondary" disabled={!pb} onClick={() => run({ type: 'mediaMute', muted: !pb?.muted })} aria-label={pb?.muted ? 'Unmute' : 'Mute'} title={pb?.muted ? 'Unmute' : 'Mute'}>
          {pb?.muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
        </Button>
      </div>
      {pb?.status === 'ended' && <p className="w-full text-xs text-slate-500">Finished.</p>}
    </div>
  );
}

/** Small thumbnails so the host can see what the TV shows (clue side and answer side). */
export function MediaThumbs({ list, label }: { list: MediaRef[]; label: string }) {
  if (!list.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">
        {list.map((m, i) => (
          <figure key={i} className="w-28">
            {m.kind === 'image' ? (
              <img src={m.url} alt={m.caption ?? ''} className="h-20 w-28 rounded-lg bg-slate-100 object-contain" />
            ) : (
              <span className={cx('flex h-20 w-28 items-center justify-center rounded-lg bg-slate-100 text-slate-500')}>
                {m.kind === 'video' ? <Video aria-hidden /> : m.kind === 'audio' ? <Music aria-hidden /> : <ImageIcon aria-hidden />}
              </span>
            )}
            {m.caption ? <figcaption className="mt-0.5 truncate text-xs text-slate-600">{m.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </div>
  );
}
