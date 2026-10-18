// Round 7 milestone C: phone delay on the TV lobby cards (R7-4) — smoothing, honest steps,
// hysteresis, and the device line ("Phone • 25 ms", "Joy-Con (L) • Bluetooth").
import { describe, expect, it } from 'vitest';
import { LatencyDisplay, latencyStep } from '../../src/server/lobbyLatency';
import { deviceLine } from '../../src/web/pages/board/lobbyModel';

describe('latency steps (R7-4)', () => {
  it('5 ms steps under 100 ms, 10 ms under 1 s, then 100 ms; under 10 ms is one step', () => {
    expect(latencyStep(3)).toBe(5);
    expect(latencyStep(9.9)).toBe(5);
    expect(latencyStep(23)).toBe(25);
    expect(latencyStep(97)).toBe(95);
    expect(latencyStep(144)).toBe(140);
    expect(latencyStep(1260)).toBe(1300);
  });
});

describe('LatencyDisplay (R7-4)', () => {
  const feed = (d: LatencyDisplay, rtt: number | null, key = 'p1') => d.update(new Map([[key, rtt]]));

  it('shows the first measurement, then ignores jitter and follows real changes smoothly', () => {
    const d = new LatencyDisplay();
    expect(feed(d, null)).toBe(false); // connected, not measured yet
    expect(d.get('p1')).toBeUndefined();
    expect(feed(d, 24)).toBe(true);
    expect(d.get('p1')).toBe(25);
    // Ordinary Wi-Fi jitter around the same value: the number on the TV stays put.
    for (const v of [28, 21, 26, 30, 22, 27]) expect(feed(d, v)).toBe(false);
    expect(d.get('p1')).toBe(25);
    // One spike does not jump the display (smoothed); a lasting change does.
    feed(d, 200);
    expect(d.get('p1')!).toBeLessThan(200);
    for (let i = 0; i < 12; i++) feed(d, 120);
    expect(d.get('p1')).toBeGreaterThanOrEqual(100);
    expect(d.get('p1')).toBeLessThanOrEqual(130);
  });

  it('forgets a phone that disconnected (and says so once)', () => {
    const d = new LatencyDisplay();
    feed(d, 40);
    expect(d.update(new Map())).toBe(true);
    expect(d.get('p1')).toBeUndefined();
    expect(d.update(new Map())).toBe(false);
  });

  it('keeps players apart', () => {
    const d = new LatencyDisplay();
    d.update(
      new Map([
        ['a', 12],
        ['b', 180],
      ]),
    );
    expect(d.get('a')).toBe(10);
    expect(d.get('b')).toBe(180);
  });
});

describe('lobby card device line (R7-4)', () => {
  it('phones show their delay, controllers their connection, never an id', () => {
    expect(deviceLine('Phone', true, 25)).toBe('Phone • 25 ms');
    expect(deviceLine('Phone', true, 5)).toBe('Phone • < 10 ms');
    expect(deviceLine('Phone', true)).toBe('Phone • measuring…');
    expect(deviceLine('Phone', false, 25)).toBe('Phone • not connected');
    expect(deviceLine('Joy-Con (L)', true)).toBe('Joy-Con (L) • Bluetooth');
    expect(deviceLine('Joy-Con (R)', false)).toBe('Joy-Con (R) • disconnected');
    expect(deviceLine('Keyboard key', true)).toBe('Keyboard key • this PC');
    expect(deviceLine('Controller', true)).toBe('Controller • connected');
    expect(deviceLine('Computer', true)).toBe('Computer player');
    expect(deviceLine('Team buzzer not set', false)).toBe('Team buzzer not set');
  });
});
