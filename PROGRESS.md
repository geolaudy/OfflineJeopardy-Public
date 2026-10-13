# Progress

## Session 2 — 2026-10-12 (user feedback round 1)

### Completed
- Feedback recorded permanently: USER_FEEDBACK.md (audit findings AF1–AF15, requirements FB-x.y with acceptance criteria), PROJECT_SPEC §43, FEATURE_MATRIX, IMPLEMENTATION_PLAN milestone 15, DECISIONS D19–D27.
- Engine: early-buzz rules (none / short lockout / out for clue / lose points), per-person lockouts, correct early classification, refunds; answering-ended state + Reveal → Return flow with stale-tap guards; category introduction state (start/next/auto/skip); old saves normalised on load.
- Server: lockout-expiry rebroadcast, intro auto-pacing, separated leaderboard groups, public player page data, host CSV exports, teardown race fixed.
- Mobile/tablet: dvh app shells, safe areas, Modal rebuilt (bounded by visible viewport, no focus stealing on live updates, scroll lock), compositor-only animations, structural sharing of live state, second-resolution timers.
- Navigation: phone portal routes /join/* with drawer, titles, back arrow, browser Back; host drawer + back arrow; responsive desktop nav.
- Phone pages: Leaderboard, Players + public player page, Game history + detailed game page, Settings split from Profile; phone buzzer armed while locked (early presses count).
- Host: early-buzz chip/list/refund, Nobody knows → Reveal answer → Return to board, intro controls, keyboard shortcuts.
- TV (frontend-agent, reviewed): classic board, clue zoom from tile + reverse, question without category/value, subtle buzzer indicator, category intro, podium scoreboard, WAAPI timer bar, polish.

### Tests (2026-10-12, session 2)
- npx tsc -p . — clean. npm run build — OK.
- npm test — 58/58 (43 unit, 15 integration), no unhandled errors.
- npm run test:e2e — 8/8 (game, PIN, offline, mobile phones ×6 configs, iPad ×3, teams/editor/Final).
- Failing: none.

### Not verified (needs real hardware)
- Real iPhone/iPad Safari (toolbars, notch, smoothness), real Joy-Cons after these changes (the controller path itself was not modified), TV frame rate of the zoom.

### Next recommended tasks
1. Real-device pass: iPhone + iPad Safari (portal, buzzer, host), Joy-Cons early-buzz behaviour, TV zoom smoothness in the Electron board window.
2. Rebuild Windows installer/portable (npm run dist) and smoke-test.
3. Roadmap: game-package export with media (L9), backup incl. media (K6), theme editor (O5), editor E2E (K5).

## Session 1 — 2026-10-12

### Completed milestones
- Environment verified (Node 24.21, Electron 44.7 w/ Node 24.21, `node:sqlite` in Electron, sharp, Playwright Chromium+WebKit, REA MCP server responsive).
- Six subagent definitions in `.claude/agents/` (research, backend, frontend, gameplay, qa, integration). Note: definitions created mid-session are loaded by Claude Code in the *next* session; this session used a general-purpose agent with the frontend-agent brief to build the board library + editor.
- Pure game engine (scoring, negative scores, Daily/Final wagers, timers, undo via event voiding, team attribution, unified buzzer arbitration) + role projections.
- Local server: SQLite schema/migrations, scrypt PINs + lockouts, host pairing, WebSocket hub, REST API, profile pictures, board import/export/versions, statistics/history, crash recovery, backup.
- React UIs: TV board, iPad host (picker, setup, live, final, results, event log, rules), phone portal (profiles/PIN/create, buzzer, final, stats, history, profile editing w/ photo crop), desktop dashboard (connect, library, editor, players, teams, buzzers, history, settings, help).
- Joy-Con WebHID reader + gamepad + keyboard bridge; Electron main/preload with HID permissions and TV window on any display.
- Windows packaging: `release/OfflineJeopardy-Setup-0.1.0.exe` (NSIS, ~120 MB) and `release/OfflineJeopardy-Portable-0.1.0.exe` (~120 MB). Packaged exe smoke-tested (UI served from asar, sharp upload works).

### Tests (last run 2026-10-12)
- `npx tsc -p .` — clean.
- `npm test` — 38/38 passing (25 unit, 13 integration).
- `npm run test:e2e` — 4/4 passing (full iPad/phone/TV game; PIN sign-in; offline request check; CSV import + editor edit + mixed-mode team game with shared keyboard buzzer, attribution and full Final via phone).
- Failing: none.

### Bugs found & fixed by tests
- Non-buzz Joy-Con buttons (e.g. HOME) consumed the debounce window and swallowed a real buzz.
- PIN pad cleared digits on a 300 ms timer, dropping a quick retry after a wrong PIN.
- `Field` wrapped button groups in a `<label>`, giving the first button the field's name (screen-reader bug); added `group` mode.
- Host UI flashed the game picker before the first server state arrived; now waits for the first snapshot.

### Blockers / unverified
- Real Joy-Con hardware and a real iPad not available in this session (K1, K2).

### Next recommended tasks
See IMPLEMENTATION_PLAN.md → "Next tasks". Start with real-hardware validation (Joy-Cons, iPad), then game-package export with media and the theme editor.

### Git
- c6d5a7d engine · 04d1c0e server · (this commit) web UI, Electron, packaging, docs.
