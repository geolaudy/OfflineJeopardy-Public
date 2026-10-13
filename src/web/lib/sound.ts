// Sound cues (R2-22). Built-in packs are synthesised with Web Audio — no audio files, nothing to
// license, works offline. A "custom" pack plays the host's own uploaded files (stored locally),
// falling back to the classic tones for cues without a file.
import { DEFAULT_TV_FX, type SoundCue, type SoundPack, type TvFx } from '../../shared/tvFx';

let ctx: AudioContext | null = null;
let volume = 0.7;
let enabled = true;
let pack: SoundPack = DEFAULT_TV_FX.soundPack;
let cues: TvFx['cues'] = DEFAULT_TV_FX.cues;
let custom: TvFx['customSounds'] = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function configureSound(opts: { enabled?: boolean; volume?: number; fx?: Pick<TvFx, 'soundPack' | 'cues' | 'customSounds'> }) {
  if (opts.enabled !== undefined) enabled = opts.enabled;
  if (opts.volume !== undefined) volume = opts.volume;
  if (opts.fx) {
    pack = opts.fx.soundPack;
    cues = opts.fx.cues;
    custom = opts.fx.customSounds;
  }
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture to unlock audio on iOS Safari. */
export function unlockAudio() {
  ac();
}

type Voice = { wave: OscillatorType; gain: number; decay: number };
const VOICES: Record<'classic' | 'arcade' | 'soft', Voice> = {
  classic: { wave: 'triangle', gain: 0.25, decay: 1 },
  arcade: { wave: 'square', gain: 0.12, decay: 0.7 },
  soft: { wave: 'sine', gain: 0.2, decay: 1.5 },
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25) {
  const c = ac();
  if (!c || !enabled || volume <= 0) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * volume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** A short melody: [frequency, start, duration] in the pack's voice. */
function phrase(p: 'classic' | 'arcade' | 'soft', notes: [number, number, number][], gainScale = 1, wave?: OscillatorType) {
  const v = VOICES[p];
  for (const [f, t, d] of notes) tone(f, t, d * v.decay, wave ?? v.wave, v.gain * gainScale);
}

const SYNTH: Record<SoundCue, (p: 'classic' | 'arcade' | 'soft') => void> = {
  startup: (p) => phrase(p, [[392, 0, 0.25], [523, 0.15, 0.25], [659, 0.3, 0.4]], 0.8),
  boardIntro: (p) => phrase(p, [[523, 0, 0.12], [659, 0.08, 0.12], [784, 0.16, 0.12], [1047, 0.24, 0.3]], 0.6),
  categoryIntro: (p) => phrase(p, [[784, 0, 0.18]], 0.5),
  clueSelect: (p) => phrase(p, [[660, 0, 0.1], [990, 0.06, 0.18]], 0.5),
  unlock: (p) => phrase(p, [[880, 0, 0.12], [1175, 0.08, 0.2]], 0.45, p === 'arcade' ? 'square' : 'sine'),
  buzz: (p) => (p === 'soft' ? phrase(p, [[740, 0, 0.25], [988, 0.06, 0.3]]) : (tone(880, 0, 0.18, 'square', 0.18), tone(1320, 0.05, 0.2, 'square', 0.12))),
  correct: (p) => phrase(p, [[660, 0, 0.15], [880, 0.12, 0.25]]),
  incorrect: (p) => (p === 'soft' ? phrase(p, [[330, 0, 0.3], [262, 0.18, 0.4]], 0.8) : tone(160, 0, 0.45, p === 'arcade' ? 'square' : 'sawtooth', 0.15)),
  dailyWager: (p) => phrase(p, [523, 659, 784, 1047].map((f, i) => [f, i * 0.09, 0.3] as [number, number, number]), 0.8),
  final: (p) => phrase(p, [[392, 0, 0.35], [494, 0.25, 0.35], [587, 0.5, 0.35], [784, 0.75, 0.7]], 0.8),
  countdown: (p) => phrase(p, [[1000, 0, 0.06]], 0.35, p === 'soft' ? 'sine' : 'square'),
  roundEnd: (p) => phrase(p, [[659, 0, 0.2], [523, 0.15, 0.2], [784, 0.3, 0.45]], 0.7),
  winner: (p) => phrase(p, [523, 659, 784, 1047, 784, 1047].map((f, i) => [f, i * 0.12, 0.35] as [number, number, number]), 0.9),
};

async function playFile(url: string): Promise<boolean> {
  const c = ac();
  if (!c) return false;
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  const buf = await p;
  if (!buf) return false;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = volume;
  src.buffer = buf;
  src.connect(g).connect(c.destination);
  src.start();
  return true;
}

/** Plays a cue if sound is on, the pack isn't muted and the cue is switched on. `force` ignores the cue switch (Test buttons). */
export function playCue(cue: SoundCue, opts: { force?: boolean; pack?: SoundPack } = {}) {
  const p = opts.pack ?? pack;
  if (!enabled || volume <= 0 || p === 'off') return;
  if (!opts.force && !cues[cue]) return;
  if (p === 'custom') {
    const url = custom[cue];
    if (url) {
      void playFile(url).then((ok) => ok || SYNTH[cue]('classic'));
      return;
    }
    SYNTH[cue]('classic');
    return;
  }
  SYNTH[cue](p);
}

/** Back-compat names used by older call sites. */
export const sfx = {
  buzz: () => playCue('buzz'),
  correct: () => playCue('correct'),
  incorrect: () => playCue('incorrect'),
  dailyWager: () => playCue('dailyWager'),
  timeUp: () => pack !== 'off' && [0, 0.25, 0.5].forEach((t) => tone(330, t, 0.2, 'square', 0.12)),
  win: () => playCue('winner'),
};
