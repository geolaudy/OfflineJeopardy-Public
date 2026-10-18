// Clue presentation on the TV: media-first layout, captions, the answer reveal (with optional
// answer-side media) and audio/video playback that follows the server's authoritative media state.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Music } from 'lucide-react';
import type { ClueView, GameView } from '../../../shared/views';
import { mediaPosition, type ClueLayout, type MediaPlayback, type MediaRef } from '../../../shared/game';
import { serverNow } from '../../lib/socket';
import { cx } from '../../components/ui';
import { FitText, useBoard } from './common';
import { EASE_OUT_ARR, T } from './timing';
import { RichText } from '../../components/RichText';

type Side = 'clue' | 'answer';
type Indexed = { m: MediaRef; i: number };

/** What a media composition needs: an open clue (ClueView) or the Final clue (R9-6). */
export interface MediaClue {
  clueId: string;
  question: string | null;
  answer: string | null;
  media: MediaRef[];
  answerMedia: MediaRef[];
  layout: ClueLayout;
}

/** Share of the clue area given to media vs. text for each layout. */
const SHARES: Record<Exclude<ClueLayout, 'auto'>, { media: number; text: number }> = {
  media: { media: 0.78, text: 0.17 },
  balanced: { media: 0.58, text: 0.34 },
  text: { media: 0.38, text: 0.52 },
};

export function resolveLayout(layout: ClueLayout, hasMedia: boolean): Exclude<ClueLayout, 'auto'> {
  if (layout !== 'auto') return layout;
  return hasMedia ? 'media' : 'text';
}

/** Size of an element, updated only when it actually changes. */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Which side is on screen. Revealing switches to the answer side only once its images have been
 * decoded (max 1.5 s), so nothing blank or wrong ever flashes during the cross-fade.
 * Media clues always reveal on the answer side (answer text replaces the hint; answer media, if
 * any, replaces the clue media). Plain text clues keep the classic "answer under the question".
 */
function useShownSide(clue: ClueView): Side {
  const hasMedia = clue.media.length > 0 || clue.answerMedia.length > 0;
  const want: Side = clue.answerRevealed && hasMedia ? 'answer' : 'clue';
  const [shown, setShown] = useState<Side>(want);
  useEffect(() => {
    if (want === shown) return;
    if (want === 'clue') return setShown('clue');
    let alive = true;
    const loads = clue.answerMedia
      .filter((m) => m.kind === 'image')
      .map((m) => {
        const im = new Image();
        im.src = m.url;
        return im.decode().catch(() => undefined);
      });
    void Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]).then(() => alive && setShown('answer'));
    return () => {
      alive = false;
    };
  }, [want, shown, clue.answerMedia]);
  return shown;
}

export function QuestionCard({ g, still }: { g: GameView; still?: boolean }) {
  const clue = g.clue!;
  const side = useShownSide(clue);
  const classic = clue.media.length === 0 && clue.answerMedia.length === 0;
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useBoxSize(areaRef);
  return (
    <div className={cx('bt-stage flex min-h-0 flex-1 flex-col items-center px-[4vw] pt-[5.5vh] pb-[7.5vh]', still && 'is-still')} data-testid="tv-stage">
      {/* R7-16: plain text clues mirror the answer slot above the text, so the clue is centred on
          the screen and the answer appearing below never moves it. */}
      {classic && <div className="bt-answer-mirror" aria-hidden />}
      {/* Both sides share one grid cell, so the reveal cross-fades without moving anything. */}
      <div ref={areaRef} className="bt-xfade min-h-0 w-full flex-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={side}
            className="flex min-h-0 flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}
            data-testid={side === 'answer' ? 'answer-side' : 'clue-side'}
          >
            {area.h > 0 && <Composition g={g} mc={clue} side={side} area={area} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Plain text clues: fixed slot so the classic answer reveal never re-flows the question. */}
      {classic && (
        <div className="bt-answer-slot w-full shrink-0 pt-[2vh]">
          <AnimatePresence>
            {clue.answerRevealed && !!clue.answer && (
              <motion.p
                key="answer"
                initial={{ opacity: 0, y: '3vh' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}
                className="bt-answer"
                data-testid="clue-answer"
              >
                <RichText text={clue.answer} />
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** A media composition filling the space it is given (Final Jeopardy!, R9-6): measured, then laid
 *  out like an open clue's — except that a sound with a picture is a badge on the picture's corner
 *  instead of its own line, so the picture can be larger in the Final's smaller area. */
export function MediaStage({ g, mc, side, testId }: { g: GameView; mc: MediaClue; side: Side; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const area = useBoxSize(ref);
  return (
    <div ref={ref} className="flex min-h-0 w-full flex-1 flex-col items-center justify-center" data-testid={testId}>
      {area.h > 0 && <Composition g={g} mc={mc} side={side} area={area} inlineAudio />}
    </div>
  );
}

/** Media first (upper area) with the text beneath; the pair is centred as one composition. */
function Composition({ g, mc: clue, side, area, inlineAudio }: { g: GameView; mc: MediaClue; side: Side; area: { w: number; h: number }; inlineAudio?: boolean }) {
  const { scale, vh } = useBoard();
  const id = clue.clueId;
  // Answer side: answer media if the clue has some, otherwise keep the clue media on screen.
  const ownAnswerMedia = side === 'answer' && clue.answerMedia.length > 0;
  const media = ownAnswerMedia ? clue.answerMedia : clue.media;
  const mediaSide: Side = ownAnswerMedia ? 'answer' : 'clue';
  const text = side === 'answer' ? clue.answer : clue.question;
  const indexed: Indexed[] = media.map((m, i) => ({ m, i }));
  const visual = indexed.filter(({ m }) => m.kind === 'image' || m.kind === 'video');
  const audio = indexed.filter(({ m }) => m.kind === 'audio');
  const hasText = !!text?.trim();
  const layout = resolveLayout(clue.layout, media.length > 0);
  const share = SHARES[layout];
  const textH = hasText ? (visual.length ? share.text : 1) * area.h : 0;
  const beside = !!inlineAudio && audio.length > 0 && visual.length > 0;
  const audioH = audio.length && !beside ? (visual.length || hasText ? 0.12 : 0.6) * area.h : 0;
  const mediaH = visual.length ? Math.max(80, (hasText ? share.media : 0.95) * area.h - audioH) : 0;
  const row = visual.length > 0 && <MediaRow items={visual} g={g} clueId={id} side={mediaSide} maxW={area.w * 0.94} maxH={mediaH} />;
  return (
    <>
      {beside ? (
        <div className="relative shrink-0 self-center">
          {row}
          <div className="absolute top-[1.2vh] right-[1.2vh]">
            <AudioCue items={audio} g={g} clueId={id} side={mediaSide} height={vh * 0.08} big={false} />
          </div>
        </div>
      ) : (
        row
      )}
      {audio.length > 0 && !beside && <AudioCue items={audio} g={g} clueId={id} side={mediaSide} height={audioH} big={!visual.length && !hasText} />}
      {hasText && (
        <FitText
          text={text ?? ''}
          max={(visual.length ? { media: 5, balanced: 6, text: 7 }[layout] : 8.2) * scale.clue}
          min={2.2 * Math.min(1, scale.clue)}
          className={side === 'answer' ? 'bt-question bt-answer-text' : 'bt-question'}
          boxClassName="w-full shrink-0"
          boxStyle={{ height: visual.length || audio.length ? textH - (visual.length ? 0 : audioH) : area.h }}
          testId={side === 'answer' ? 'clue-answer' : 'clue-text'}
        />
      )}
    </>
  );
}

/** Images/videos sized from their real aspect ratio: as large as the space allows, never cropped
 *  or stretched; invisible until loaded so the composition never jumps. */
function MediaRow({ items, g, clueId, side, maxW, maxH }: { items: Indexed[]; g: GameView; clueId: string; side: Side; maxW: number; maxH: number }) {
  const { vh } = useBoard();
  const gap = 24;
  const each = (maxW - gap * (items.length - 1)) / items.length;
  const captioned = items.some(({ m }) => m.caption);
  // Room for one caption line even in a small area (the Final's, R9-6).
  const capH = captioned ? Math.max(vh * 0.05, Math.min(70, maxH * 0.12)) : 0;
  return (
    <div className="flex shrink-0 items-start justify-center" style={{ gap }}>
      {items.map(({ m, i }) => (
        <figure key={`${side}:${i}:${m.url}`} className="flex flex-col items-center">
          <SizedMedia m={m} maxW={each} maxH={maxH - capH} g={g} clueId={clueId} side={side} index={i} />
          {m.caption ? (
            <figcaption className="bt-caption" style={{ maxWidth: each, height: capH }} data-testid="clue-caption">
              {m.caption}
            </figcaption>
          ) : captioned ? (
            <span style={{ height: capH }} aria-hidden />
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function SizedMedia({ m, maxW, maxH, g, clueId, side, index }: { m: MediaRef; maxW: number; maxH: number; g: GameView; clueId: string; side: Side; index: number }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  let w = maxW;
  let h = maxH;
  if (aspect) {
    if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
  }
  const style: CSSProperties = { width: Math.round(w), height: Math.round(h), opacity: aspect || failed ? 1 : 0 };
  if (failed)
    return (
      <div className="bt-media-missing" style={style} role="img" aria-label="Media could not be loaded">
        Media not available
      </div>
    );
  if (m.kind === 'video') return <SyncedVideo m={m} style={style} g={g} clueId={clueId} side={side} index={index} onAspect={setAspect} onError={() => setFailed(true)} />;
  return (
    <img
      src={m.url}
      alt={m.caption ?? ''}
      className="bt-media-img"
      style={style}
      onLoad={(e) => setAspect(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
      onError={() => setFailed(true)}
      draggable={false}
      data-testid="clue-image"
    />
  );
}

function SyncedVideo({ m, style, g, clueId, side, index, onAspect, onError }: { m: MediaRef; style: CSSProperties; g: GameView; clueId: string; side: Side; index: number; onAspect: (a: number) => void; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useMediaSync(ref, g, clueId, side, index);
  return (
    <video
      ref={ref}
      src={m.url}
      className="bt-media-img"
      style={style}
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => onAspect(e.currentTarget.videoWidth / Math.max(1, e.currentTarget.videoHeight))}
      onError={onError}
      data-testid="clue-video"
    />
  );
}

/** Audio has no picture: a calm indicator (large when the sound is the whole clue). */
function AudioCue({ items, g, clueId, side, height, big }: { items: Indexed[]; g: GameView; clueId: string; side: Side; height: number; big: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-[3vw]" style={{ height }}>
      {items.map(({ m, i }) => (
        <AudioItem key={`${side}:${i}:${m.url}`} m={m} g={g} clueId={clueId} side={side} index={i} big={big} />
      ))}
    </div>
  );
}

function AudioItem({ m, g, clueId, side, index, big }: { m: MediaRef; g: GameView; clueId: string; side: Side; index: number; big: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const playing = useMediaSync(ref, g, clueId, side, index);
  return (
    <div className="flex flex-col items-center gap-[1vh]" data-testid="clue-audio" data-playing={playing ? 'true' : 'false'}>
      <audio ref={ref} src={m.url} preload="auto" />
      <span className={big ? 'bt-audio-big' : 'bt-audio-small'} data-playing={playing ? 'true' : 'false'} aria-hidden>
        <Music strokeWidth={1.75} />
      </span>
      {m.caption ? <p className="bt-caption">{m.caption}</p> : null}
    </div>
  );
}

/**
 * Keeps an <audio>/<video> element in step with the server's playback state for this item
 * (`index` = position in that side's media list of clue `clueId`): plays/pauses, seeks when it drifts > 0.4 s,
 * mutes. Returns whether it is playing.
 */
export function useMediaSync(ref: RefObject<HTMLMediaElement | null>, g: GameView, clueId: string, side: Side, index: number) {
  const pb = g.media;
  const mine: MediaPlayback | null = pb && pb.clueId === clueId && pb.side === side && pb.index === index ? pb : null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mine) {
      el.pause();
      return;
    }
    el.muted = mine.muted;
    const target = mediaPosition(mine, serverNow()) / 1000;
    if (mine.status === 'playing') {
      if (Math.abs(el.currentTime - target) > 0.4) el.currentTime = target;
      el.play().catch(() => {
        // Autoplay blocked in a plain browser before any click; the Electron TV window allows it.
      });
    } else {
      el.pause();
      const at = mine.status === 'stopped' ? 0 : target;
      if (Math.abs(el.currentTime - at) > 0.05) el.currentTime = at;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, mine?.status, mine?.positionMs, mine?.startedAt, mine?.muted, !!mine]);
  // Stop when the element leaves the screen (clue closed, answer revealed).
  useEffect(() => {
    const el = ref.current;
    return () => el?.pause();
  }, [ref]);
  return mine?.status === 'playing';
}
