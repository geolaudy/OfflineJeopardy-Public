# Session handoff

Read this first in a new session, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 4".

## Current state (updated 2026-10-14, session 6)

- Branch: `main`, pushed to `origin/main`.
- Releases: v0.6.0, v0.7.0 published. Round 4 is targeted at **v0.8.0** (see PROGRESS.md for whether it was tagged).
- Round-4 requirements: USER_FEEDBACK.md "Round 4" (R4-1 … R4-20), IMPLEMENTATION_PLAN milestone 18.

## Round 4 status

| Milestone | Items | Status |
|---|---|---|
| A — gameplay | R4-2 Final Jeopardy!, R4-4 clue controls, R4-10 media-only clues, R4-16 intro gating, R4-7 wording, R4-20 return to lobby | Done, tested |
| B — host/lobby UI | R4-5, R4-8, R4-9, R4-12, R4-14, R4-15 | Done (visual items judged from screenshots) |
| C — profiles/pre-lobby | R4-13 profile picture + colours, R4-11 pre-lobby TV | Done, tested |
| D — audio/visual | R4-1 sound pack, R4-3 think music, R4-6 bottom glow, R4-17 fonts, R4-18 background, R4-19 board fill sync | Done; audio not verified by ear (K23) |

## Owner's assets (important)

- `new_sfx/` holds the owner's sound files + a clue background image. **Git-ignored. Never commit or publish them.**
- `npm run build:electron` copies the audio into `build/private-sfx/` (git-ignored) → a *local* `npm run dist` ships them in `resources/soundpacks/buzzinga` (personal use only). The GitHub workflow has no `new_sfx`, so public releases contain none; `verify-dist` fails in CI if any are present.
- Dev server: `npm run dev:server` passes `--sfx=new_sfx`.
- The clue background is recreated in CSS (the JPEG is not used); TV fonts are OFL look-alikes (licensed fonts plug in via Windows install or `<data>/fonts/clue|category|value.*`).

## Builds / release workflow

Unchanged from session 5: `npm run dist` + `npm run dist:verify`; release = bump version + CHANGELOG section → commit/push → `git tag -a vX.Y.Z` → push tag → GitHub Actions builds, verifies and publishes. No `gh` CLI; verify via the GitHub API with the stored git credential.

## Gotchas

- Do not leave a shell inside `test-results/` (Playwright hangs on Windows).
- Python edit scripts: write with `newline=''`; **never put regexes with `\b` in a heredoc** — write the script to a file (a heredoc turned `\b` into backspace characters once).
- Stopping a Playwright run can leave its test server on port 3210; check `netstat -ano | grep 3210` before re-running.

## Next recommended tasks

1. Owner: listen to the Jeopardy!/Buzzinga pack on the real TV (board fill sync, think music), check QR scanning distance with the smaller code, try Final Jeopardy! on real phones.
2. Optional: per-cue volume; rename old boards' "Final Wager" round to "Final Jeopardy!" automatically.
3. Earlier open items: AI answers with a real key (K26), Joy-Con vibration on hardware (K25).
