// Sound cues (R2-22, R4-1). Classic / Arcade / Soft are synthesised with Web Audio — no audio
// files, nothing to license, works offline. Jeopardy!/Buzzinga plays the owner's own sound files
// (installed locally on the game computer); "custom" plays files uploaded per cue. Both fall back
// to the Classic tone for any cue without a file, so no event is ever silent by accident.
// Only the TV page plays cues, so sound comes from one place (the TV / game computer).
import { DEFAULT_TV_FX, type PackFiles, type SoundCue, type SoundPack, type TvFx } from '../../shared/tvFx';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let enabled = true;
let pack: SoundPack = DEFAULT_TV_FX.soundPack;
let cues: TvFx['cues'] = DEFAULT_TV_FX.cues;
let custom: TvFx['customSounds'] = {};
let volumes: NonNullable<TvFx['volumes']> = {};
/** Volume of the cue being played right now (applied to every voice it creates). */
let cueGain = 1;
let packFiles: PackFiles = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();
/** Playing file-based cues: one at a time per cue (no duplicates when state arrives twice). */
const playing = new Map<SoundCue, { src: AudioBufferSourceNode; gain: GainNode; startedAt: number }>();
const lastSynth = new Map<SoundCue, number>();

export function configureSound(opts: { enabled?: boolean; volume?: number; fx?: Pick<TvFx, 'soundPack' | 'cues' | 'customSounds' | 'volumes'>; packFiles?: PackFiles }) {
  if (opts.enabled !== undefined) enabled = opts.enabled;
  if (opts.volume !== undefined) volume = opts.volume;
  if (opts.fx) {
    // Switching packs stops whatever the previous pack is still playing (no double playback).
    if (opts.fx.soundPack !== pack) stopAll();
    pack = opts.fx.soundPack;
    cues = opts.fx.cues;
    custom = opts.fx.customSounds;
    volumes = opts.fx.volumes ?? {};
  }
  if (opts.packFiles) packFiles = opts.packFiles;
  if (master) master.gain.value = enabled ? volume : 0;
  if (!enabled || volume <= 0 || pack === 'off') stopAll();
  // Decode the active pack's files ahead of time so cues start exactly with their animation.
  for (const url of Object.values(activeFiles())) if (url) void load(url);
}

function activeFiles(p: SoundPack = pack): PackFiles {
  return p === 'buzzinga' ? packFiles : p === 'custom' ? custom : {};
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = enabled ? volume : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture to unlock audio on iOS Safari / browsers that block autoplay. */
export function unlockAudio() {
  ac();
}

type Voice = { wave: OscillatorType; gain: number; decay: number };
type Synth = 'classic' | 'arcade' | 'soft';
const VOICES: Record<Synth, Voice> = {
  classic: { wave: 'triangle', gain: 0.25, decay: 1 },
  arcade: { wave: 'square', gain: 0.12, decay: 0.7 },
  soft: { wave: 'sine', gain: 0.2, decay: 1.5 },
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, out?: AudioNode) {
  const c = ac();
  if (!c || !master || !enabled || volume <= 0) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * cueGain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out ?? master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** A short melody: [frequency, start, duration] in the pack's voice. */
function phrase(p: Synth, notes: [number, number, number][], gainScale = 1, wave?: OscillatorType, out?: AudioNode) {
  const v = VOICES[p];
  for (const [f, t, d] of notes) tone(f, t, d * v.decay, wave ?? v.wave, v.gain * gainScale, out);
}

/** An original, gentle 30-second "thinking" figure for packs without a think-music file. */
function thinkMelody(p: Synth, out: AudioNode) {
  const motif = [392, 523, 392, 262, 392, 523, 392, 0, 523, 440, 392, 349, 330, 294, 262, 0];
  const notes: [number, number, number][] = [];
  for (let bar = 0; bar < 4; bar++) motif.forEach((f, i) => f && notes.push([f * (bar === 2 ? 1.125 : 1), bar * 7.5 + i * 0.46, 0.4]));
  phrase(p, notes, 0.55, 'sine', out);
}

const SYNTH: Record<SoundCue, (p: Synth, out?: AudioNode) => void> = {
  startup: (p) => phrase(p, [[392, 0, 0.25], [523, 0.15, 0.25], [659, 0.3, 0.4]], 0.8),
  boardIntro: (p) => phrase(p, [[523, 0, 0.12], [659, 0.08, 0.12], [784, 0.16, 0.12], [1047, 0.24, 0.3]], 0.6),
  categoryIntro: (p) => phrase(p, [[784, 0, 0.18]], 0.5),
  clueSelect: (p) => phrase(p, [[660, 0, 0.1], [990, 0.06, 0.18]], 0.5),
  unlock: (p) => phrase(p, [[880, 0, 0.12], [1175, 0.08, 0.2]], 0.45, p === 'arcade' ? 'square' : 'sine'),
  buzz: (p) => (p === 'soft' ? phrase(p, [[740, 0, 0.25], [988, 0.06, 0.3]]) : (tone(880, 0, 0.18, 'square', 0.18), tone(1320, 0.05, 0.2, 'square', 0.12))),
  correct: (p) => phrase(p, [[660, 0, 0.15], [880, 0.12, 0.25]]),
  incorrect: (p) => (p === 'soft' ? phrase(p, [[330, 0, 0.3], [262, 0.18, 0.4]], 0.8) : tone(160, 0, 0.45, p === 'arcade' ? 'square' : 'sawtooth', 0.15)),
  timeUp: (p) => [0, 0.25, 0.5].forEach((t) => tone(330, t, 0.2, p === 'soft' ? 'sine' : 'square', 0.12)),
  dailyWager: (p) => phrase(p, [523, 659, 784, 1047].map((f, i) => [f, i * 0.09, 0.3] as [number, number, number]), 0.8),
  final: (p) => phrase(p, [[392, 0, 0.35], [494, 0.25, 0.35], [587, 0.5, 0.35], [784, 0.75, 0.7]], 0.8),
  finalThink: (p, out) => out && thinkMelody(p, out),
  countdown: (p) => phrase(p, [[1000, 0, 0.06]], 0.35, p === 'soft' ? 'sine' : 'square'),
  roundEnd: (p) => phrase(p, [[659, 0, 0.2], [523, 0.15, 0.2], [784, 0.3, 0.45]], 0.7),
  winner: (p) => fanfare(p),
};

/** Victory fanfare (R5-10): a short pickup, a warm sustained major chord and a light sparkle on
 *  top — about 2.5 s, kept below the level of the buzz so it never blares. Original, synthesised. */
function fanfare(p: Synth) {
  const lead: OscillatorType = p === 'arcade' ? 'square' : 'triangle';
  const g = p === 'arcade' ? 0.09 : 0.17;
  // Pickup: G G G → C, then up to E, G.
  for (const [f, t, d] of [[392, 0, 0.13], [392, 0.14, 0.13], [392, 0.28, 0.13], [523, 0.44, 0.42], [659, 0.86, 0.2], [784, 1.06, 1.1]] as [number, number, number][])
    tone(f, t, d * VOICES[p].decay + 0.05, lead, g);
  // Sustained C-major chord under the last note.
  for (const f of [262, 330, 392, 523]) tone(f, 1.04, 1.5 * VOICES[p].decay, 'sine', g * 0.55);
  // Sparkle.
  [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 1.12 + i * 0.07, 0.35, 'sine', g * 0.28));
}

function load(url: string): Promise<AudioBuffer | null> {
  const c = ac();
  if (!c) return Promise.resolve(null);
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => (decoded.set(url, buf), buf))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

/** Length (s) of the file the current pack plays for a cue, when it is already decoded. */
export function cueDuration(cue: SoundCue): number | null {
  const url = activeFiles()[cue];
  return url ? (decoded.get(url)?.duration ?? null) : null;
}

/** Waits (briefly) until a cue's file is ready; resolves with its duration or null. */
export function prepareCue(cue: SoundCue, maxWaitMs = 400): Promise<number | null> {
  const url = activeFiles()[cue];
  if (!url || pack === 'off' || !enabled) return Promise.resolve(null);
  return Promise.race([load(url).then((b) => b?.duration ?? null), new Promise<null>((r) => setTimeout(() => r(null), maxWaitMs))]);
}

function startFile(cue: SoundCue, buf: AudioBuffer, offset = 0) {
  const c = ac();
  if (!c || !master) return;
  stopCue(cue, 0);
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = volumes[cue] ?? 1;
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start(0, Math.max(0, Math.min(offset, buf.duration - 0.05)));
  const entry = { src, gain: g, startedAt: c.currentTime - offset };
  playing.set(cue, entry);
  src.onended = () => {
    if (playing.get(cue) === entry) playing.delete(cue);
  };
}

/** Synthesised think figure routed through its own gain so it can be stopped like a file. */
function startSynthLoop(cue: SoundCue, p: Synth) {
  const c = ac();
  if (!c || !master) return;
  stopCue(cue, 0);
  const g = c.createGain();
  g.connect(master);
  cueGain = volumes[cue] ?? 1;
  SYNTH[cue](p, g);
  cueGain = 1;
  const fake = c.createBufferSource(); // placeholder handle so stopCue can fade the gain
  playing.set(cue, { src: fake, gain: g, startedAt: c.currentTime });
}

/**
 * Plays a cue if sound is on, the pack isn't muted and the cue is switched on. `force` ignores the
 * cue switch (Test buttons). `offsetSec` starts a long cue part-way (never used after reconnects).
 */
export function playCue(cue: SoundCue, opts: { force?: boolean; pack?: SoundPack; offsetSec?: number } = {}) {
  const p = opts.pack ?? pack;
  if (!enabled || volume <= 0 || p === 'off') return;
  if (!opts.force && !cues[cue]) return;
  const url = activeFiles(p)[cue];
  const fallback: Synth = p === 'arcade' || p === 'soft' ? p : 'classic';
  if (url) {
    const buf = decoded.get(url);
    if (buf) return startFile(cue, buf, opts.offsetSec);
    void load(url).then((b) => (b ? startFile(cue, b, opts.offsetSec) : playSynth(cue, fallback)));
    return;
  }
  playSynth(cue, fallback);
}

function playSynth(cue: SoundCue, p: Synth) {
  if (cue === 'finalThink') return startSynthLoop(cue, p);
  const c = ac();
  const now = c?.currentTime ?? 0;
  if (now - (lastSynth.get(cue) ?? -1) < 0.12) return; // the same cue twice in a row: play once
  lastSynth.set(cue, now);
  cueGain = volumes[cue] ?? 1;
  SYNTH[cue](p);
  cueGain = 1;
}

/** Stops a long cue (Final think music) with a short fade. */
export function stopCue(cue: SoundCue, fadeMs = 600) {
  const e = playing.get(cue);
  const c = ctx;
  if (!e || !c) return;
  playing.delete(cue);
  const t = c.currentTime;
  e.gain.gain.cancelScheduledValues(t);
  e.gain.gain.setValueAtTime(e.gain.gain.value, t);
  e.gain.gain.linearRampToValueAtTime(0.0001, t + fadeMs / 1000);
  try {
    if (e.src.buffer) e.src.stop(t + fadeMs / 1000 + 0.02);
  } catch {
    /* already stopped */
  }
  setTimeout(() => e.gain.disconnect(), fadeMs + 60);
}

export function isCuePlaying(cue: SoundCue) {
  return playing.has(cue);
}

function stopAll() {
  for (const cue of [...playing.keys()]) stopCue(cue, 150);
}

/** Back-compat names used by older call sites. */
export const sfx = {
  buzz: () => playCue('buzz'),
  correct: () => playCue('correct'),
  incorrect: () => playCue('incorrect'),
  dailyWager: () => playCue('dailyWager'),
  timeUp: () => playCue('timeUp'),
  win: () => playCue('winner'),
};
