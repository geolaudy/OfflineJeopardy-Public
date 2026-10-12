// Synthesised sound effects (Web Audio) — no audio files or network needed.
let ctx: AudioContext | null = null;
let volume = 0.7;
let enabled = true;

export function configureSound(opts: { enabled?: boolean; volume?: number }) {
  if (opts.enabled !== undefined) enabled = opts.enabled;
  if (opts.volume !== undefined) volume = opts.volume;
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

export const sfx = {
  buzz: () => {
    tone(880, 0, 0.18, 'square', 0.18);
    tone(1320, 0.05, 0.2, 'square', 0.12);
  },
  correct: () => {
    tone(660, 0, 0.15, 'triangle');
    tone(880, 0.12, 0.25, 'triangle');
  },
  incorrect: () => tone(160, 0, 0.45, 'sawtooth', 0.15),
  reveal: () => tone(520, 0, 0.25, 'sine', 0.18),
  dailyWager: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.2)),
  timeUp: () => [0, 0.25, 0.5].forEach((t) => tone(330, t, 0.2, 'square', 0.12)),
  tick: () => tone(1000, 0, 0.05, 'sine', 0.08),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.22)),
};
