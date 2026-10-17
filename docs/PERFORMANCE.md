# TV presentation performance (R6-15)

A player reported that category presentations on the TV were "extremely choppy". This page
records how it was investigated, what the cause was, what changed and the measured result.

## How it is measured

`scripts/perf-intro.mjs` (run `npm run build:web` first):

```
node scripts/perf-intro.mjs --label=after            # headless Chromium, software raster
node scripts/perf-intro.mjs --label=after --cpu=4    # + 4× CPU throttling (slow PC / TV box)
node scripts/perf-intro.mjs --label=after --headed   # real window with the GPU
PERF_TOP=1 node scripts/perf-intro.mjs ...           # + where the main-thread time goes
```

It starts its own server (port 3299, fresh data), opens the TV page at 1920×1080, adds 8 players
(full scoreboard under the intro), starts the game and measures each step of the round
introduction through the host socket: the board fill, 6 × Next Category, Previous, two direct
jumps, and the next round's fill. Per step (1.1 s window; the fill 4.5 s):

- frame pacing from `requestAnimationFrame`: average fps, p95 and worst frame time, frames > 25 ms
  ("dropped" at 60 Hz),
- long main-thread tasks (`PerformanceObserver('longtask')`),
- paint / raster / layout / style / script time and counts from a Chrome trace,
- DOM mutations (a proxy for re-render churn).

Results are written to `test-results/perf-intro-<label>.json`.

**Limits:** headless Chromium rasterises in software, so its absolute numbers are pessimistic — but
that is also what a TV PC does when Chromium falls back to software compositing (older or
blocklisted GPU drivers, some remote/virtual displays). The headed run used this development PC's
GPU and a 144 Hz display. **No real TV, TV-box or iPad was measured.**

## Findings (profile before optimising)

| Possible cause | Evidence | Verdict |
|---|---|---|
| Network / host → TV sync | One small state message per step; the TV starts the swipe on the commit of that message | Not the cause |
| React re-renders / Zustand | ~9–12 ms of script per swipe, no long tasks, 2–4 layouts | Not the cause |
| Audio | Files are decoded ahead of time; playback starts on the same commit as the swipe | Not the cause |
| Font loading, layout | FitText fits the category once at mount (≈1–3 ms of layout) | Not the cause |
| **Paint / raster** | **~52 full-screen paints per 0.7 s swipe and ~3,000 ms of raster work** | **Cause** |

The sliding category card was moved with motion's `x` value, which writes `style.transform` from a
JavaScript frame loop. The card had no compositing hint, so Chromium repainted and re-rasterised the
whole 1920×1080 card on every frame — huge category text with blurred text-shadows on the
SVG-noise clue background. With a strong GPU this is hidden (the GPU rasterises it fast); with
software raster or a weak GPU it cannot keep up and the swipe stutters. The round-title card that
scales in after the board fill had the same problem.

## Changes

- `Intro.tsx`: the swiping layer has `will-change: transform` (rasterised once, then only moved
  by the compositor) and animates whole `transform` strings, which motion runs as Web Animations
  on the compositor thread — the swipe keeps its pace even if the main thread is busy. The round
  title card and the dimming board behind it got the same treatment.
- `Swipe.tsx` (Final Jeopardy! reveal and other full-screen swipes): same change.
- Navigation logic was already correct and is unchanged: a jump is one swipe in its direction,
  Stop Auto cancels the server's schedule, one sound per step change (covered by host-ipad.spec and
  the intro unit tests).

Tried and rejected (no measurable gain): removing the tile `filter`, removing the tile scale,
`will-change` on every fill tile.

## Results (category swipes: mean of 9 steps)

| Run | fps | p95 frame | frames > 25 ms | paints | raster |
|---|---|---|---|---|---|
| Software raster, before | 43.0 | 35.2 ms | 19.1 | 52 | 2,996 ms |
| Software raster, **after** | **59.0** | **18.6 ms** | **1.0** | **6** | **110 ms** |
| Software raster + 4× CPU, before | 41.8 | 38.9 ms | 20.1 | 50 | 2,992 ms |
| Software raster + 4× CPU, **after** | **58.9** | **18.6 ms** | **1.1** | **6** | **101 ms** |
| GPU (144 Hz), before | 148.5 | 7.2 ms | 0.1 | 206 | 63 ms |
| GPU (144 Hz), **after** | **150.5** | **7.1 ms** | **0.1** | **6** | **6 ms** |

DOM mutations per swipe dropped from ~58 (software) / ~219 (GPU, more frames) to 10: the frame
loop no longer writes styles.

Board fill + round title (4.5 s window), software raster + 4× CPU, the next round's fill:
long tasks 7 (433 ms) → 1, raster 2,884 → ~940 ms, paints 60 → 45. The very first fill when the
game replaces the lobby still has one long frame (the whole game screen mounts at once; ~160–190 ms
on this PC even with the GPU) — a one-off at the start of the game, not during category swipes.

## Recommendations for the TV PC

- Run the TV from the OfflineJeopardy app (Electron) or Chrome/Edge with hardware acceleration on.
- If the board still stutters on an old PC: Settings → "Reduce motion on the game board" (cross-fades).
