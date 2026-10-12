# Implementation Plan

Order follows CLAUDE.md §31. ✅ done · 🔶 partial · ⬜ not started.

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Architecture, identity model, DB schema, event model | ✅ | ARCHITECTURE.md, migrations v1 |
| 2 | Electron shell + embedded local server | ✅ | Dev + packaged launch verified |
| 3 | Public board + iPad host controller + WebSocket sync | ✅ | E2E (WebKit iPad) |
| 4 | Profile portal, single QR, PIN auth | ✅ | I + E |
| 5 | Board editor + library | 🔶 | Built; needs browser tests (K5) |
| 6 | Core gameplay, scoring, timers, wagers | ✅ | Final UI needs E2E |
| 7 | Unified buzzer engine | ✅ | |
| 8 | Joy-Con / phone / keyboard buzzers | 🔶 | Joy-Con needs real-hardware validation (K1) |
| 9 | Team mode + per-team buzzer modes | ✅ | Team setup UI needs E2E |
| 10 | Individual contribution tracking | ✅ | |
| 11 | Statistics + detailed history | ✅ | |
| 12 | Themes, multimedia, customization | 🔶 | 8 board themes, clue media; no theme editor |
| 13 | Advanced modes (presets done; computer opponents, tournament, survival) | 🔶 | |
| 14 | Comprehensive testing + packaging | 🔶 | NSIS + portable built |

## Next tasks (priority order)

1. E2E tests: board editor & library (create board, edit clue, import CSV, start game with it), team game setup UI with a shared buzzer + keyboard assignment, Final Wager UI end-to-end incl. phone wagers/answers.
2. Real-hardware validation session: pair 2+ Joy-Cons on Windows, verify detection/MAC ids/assign/buzz/reconnect; fix offsets if needed. Real iPad Safari pass.
3. Game-package export/import with media (zip), backup including media.
4. Theme editor (custom colors/fonts/background/logo) + theme import/export.
5. Host keyboard shortcuts; latency diagnostics view; statistics export (CSV).
6. Computer opponents / practice mode; room codes; tournament & survival modes.
7. Optional: Ollama-based question generation with manual fallback; workspaces.
