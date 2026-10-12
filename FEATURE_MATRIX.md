# Feature Matrix

Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED (code exists, no automated test) · TESTED (relevant automated tests pass) · BLOCKED.
Test keys: **U** = `tests/unit/engine.test.ts` · **I** = `tests/integration/server.test.ts` · **E** = `tests/e2e/game.spec.ts` (Playwright: Chromium TV/Android, WebKit iPad/iPhone).
Last full run: 2026-10-12 — U 25/25, I 13/13, E 3/3 passing.

## Core architecture & desktop

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| A1 | Persistent identity model (profiles / teams / controllers / competitors separate, stable ids) | P0 | TESTED | shared/game.ts, server/repos.ts, db/db.ts | U, I (history after rename/move) | — |
| A2 | Electron app auto-starts/stops local server | P0 | TESTED | electron/main.ts | Manual launch probe 2026-10-12 (dev + packaged exe) | No automated Electron test yet |
| A3 | SQLite persistence, migrations, transactions, FK integrity | P0 | TESTED | server/db/db.ts | I | — |
| A4 | Windows installer (NSIS) + portable exe | P0 | TESTED | package.json `build`, build/installer.nsh | `npm run dist` succeeded; packaged exe smoke test (UI, upload) | Unsigned; installer not yet run end-to-end on a clean PC |
| A5 | Firewall rule on install (private networks) | P1 | IMPLEMENTED | build/installer.nsh | — | Not executed in a test |
| A6 | Configurable data dir (portable: next to exe; config.json override) | P2 | IMPLEMENTED | electron/main.ts | — | No UI to change it yet |
| A7 | Local logging | P2 | IMPLEMENTED | electron/main.ts (`data/logs/main.log`) | manual | — |
| A8 | Backup / restore / integrity check | P1 | TESTED (backup, integrity) / IMPLEMENTED (restore) | server/app.ts, desk/Settings.tsx | I | Backup excludes media files |
| A9 | Crash / restart recovery (state restored, timers paused, buzzers locked) | P0 | TESTED | gameManager.recover | I | — |

## Public board (TV)

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| B1 | Categories/values grid, used tiles | P0 | TESTED | pages/board/BoardPage.tsx | E | — |
| B2 | Clue display, answer only after reveal (server-side projection) | P0 | TESTED | engine/projection.ts | U, I, E | — |
| B3 | Timers (synced countdown) | P0 | TESTED | BoardPage TimerBar, lib/view.useTimer | E (visible), U | — |
| B4 | Scores, team scores + members, buzzer winner banner | P0 | TESTED | BoardPage | E | — |
| B5 | Daily Wager transition (clue hidden until wager locked) | P0 | TESTED | BoardPage ClueScreen | U, E | — |
| B6 | Final Wager screens (category, wager status, clue, reveal) | P0 | IMPLEMENTED | BoardPage FinalScreen | U (engine/projection) | No E2E of Final UI |
| B7 | Winner announcement / results | P0 | TESTED | BoardPage Results | E | — |
| B8 | Fullscreen, secondary-monitor placement | P1 | IMPLEMENTED | BoardPage, electron openBoardWindow | — | Multi-monitor untested |
| B9 | Join QR show/hide; lobby screen with large QR | P0 | TESTED | BoardPage, /api/qr | I (QR svg), E (lobby) | — |
| B10 | Sound effects (synthesised), reduced motion, themes (8 presets) | P2 | IMPLEMENTED | lib/sound.ts, styles.css, desk/Settings.tsx | — | No theme editor/import/export yet |

## iPad host controller

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| H1 | Host auth via pairing code; persistent host session; reconnect | P0 | TESTED | auth.ts, app.ts, host/HostPage.tsx | I, E (WebKit iPad) | Real iPad not yet verified |
| H2 | Select clue → TV; private answer + notes | P0 | TESTED | host/Live.tsx | E | — |
| H3 | Reveal/hide answer | P0 | TESTED | Live.tsx | E, U | — |
| H4 | Unlock / lock / reset buzzers | P0 | TESTED | Live.tsx | E, I, U | — |
| H5 | Timer start / pause / resume / reset | P0 | TESTED (engine) / IMPLEMENTED (UI) | Live.tsx TimerControls | U | UI buttons not E2E-tested |
| H6 | Correct / incorrect, award/deduct points, undo | P0 | TESTED | Live.tsx | E, U, I | — |
| H7 | Skip / restore clue, rounds, board control | P1 | TESTED (engine) / IMPLEMENTED (UI) | Live.tsx | U | — |
| H8 | Manage players & teams, per-team buzzer mode | P0 | TESTED (engine/API) / IMPLEMENTED (UI) | host/Setup.tsx | U, I | Team setup UI not E2E-tested |
| H9 | Controller assignment by button press | P0 | TESTED (server) / IMPLEMENTED (UI) | ControllersPanel.tsx, controllers.ts | I | — |
| H10 | Daily Wager & Final control | P0 | TESTED (DW E2E) / IMPLEMENTED (Final UI) | Live.tsx, FinalControl.tsx | E, U | — |
| H11 | Save / resume / switch / end games | P0 | TESTED | GamePicker.tsx, app.ts | I, E (end) | — |
| H12 | Event history + audited attribution correction | P1 | TESTED (engine) / IMPLEMENTED (UI) | EventLog.tsx | U | — |
| H13 | Rules & timers settings, presets (Classic, Classroom, Speed, Team Battle, Casual) | P1 | TESTED (engine) / IMPLEMENTED (UI) | RulesEditor.tsx, shared/game.ts | U | — |
| H14 | Pause / resume game | P1 | TESTED | engine | U | — |
| H15 | Keyboard shortcuts for host | P2 | NOT STARTED | — | — | — |

## Player portal, profiles, PINs

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| P1 | Single public QR → portal (select / create profile) | P0 | TESTED | join/JoinPage.tsx | E | — |
| P2 | 4-digit PIN creation + confirmation, leading zeros | P0 | TESTED | ProfileForm.tsx, app.ts | I, E | — |
| P3 | PIN auth, salted scrypt hashing, never stored/returned plaintext | P0 | TESTED | auth.ts | I | scrypt instead of Argon2 (DECISIONS D3) |
| P4 | Rate limiting + temporary lockouts; host-assisted reset | P0 | TESTED | auth.ts, app.ts | I | — |
| P5 | PIN change, sessions persist across refresh, logout / all devices | P0 | TESTED | app.ts, ProfileTab.tsx | I, E | — |
| P6 | Unauthorized profile modification prevented | P0 | TESTED | app.ts | I | — |
| P7 | Picture upload (JPEG/PNG/WebP…), validation, crop, resize, replace, remove | P0 | TESTED (server) / IMPLEMENTED (crop UI) | images.ts, ProfileTab.tsx | I | HEIC not decoded (iOS usually converts to JPEG) |
| P8 | Built-in avatars, colors with contrast check | P0 | IMPLEMENTED | lib/avatars.ts, ui.tsx | — | Emoji render per device |
| P9 | Real-time profile sync to TV, host, portal | P0 | TESTED | hub.profilesChanged | I, E | — |
| P10 | Buzzer preferences (device, Joy-Con side/button, key) | P1 | IMPLEMENTED | ProfileTab.tsx | — | Preferences are informational; not auto-applied |
| P11 | Join current game (self-join or host approval) | P0 | TESTED | engine playerJoin, PlayTab.tsx | E, I | — |
| P12 | Phone buzzer, status feedback, vibration | P0 | TESTED | PlayTab.tsx | E | — |
| P13 | Final wager/answer from phone | P0 | IMPLEMENTED | PlayTab FinalForm, hub | U (engine) | No E2E |
| P14 | Personal stats dashboard (solo vs team separated) | P0 | TESTED (API) / TESTED (renders) | stats.ts, StatsView.tsx | I, E | — |
| P15 | Game history + per-game detail (clue by clue) | P0 | TESTED | stats.ts, StatsView.tsx | I, E | — |
| P16 | Profile export, delete (soft), stats privacy | P1 | IMPLEMENTED | app.ts | — | Profile import not implemented |
| P17 | Room-code joining | P2 | NOT STARTED | — | — | QR / URL only |

## Buzzers & controllers

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| Z1 | Unified buzzer engine (first valid buzz, lockout, queue) | P0 | TESTED | engine.ts handleBuzz | U, I, E | — |
| Z2 | Simultaneous buzzes deterministic (server arrival order) | P0 | TESTED | engine/hub | U, I | — |
| Z3 | Duplicate prevention, debounce, held buttons (edge-triggered) | P0 | TESTED | buzzer.ts InputFilter, controllers.ts | U, I | — |
| Z4 | Early-buzz rule (optional lockout) | P1 | TESTED | engine.ts | U | — |
| Z5 | Team-aware arbitration, configurable team retry | P0 | TESTED | engine.ts | U | — |
| Z6 | Disconnection handling (devices marked disconnected; others keep working) | P0 | TESTED | controllers.ts, hub.ts | I | — |
| Z7 | Joy-Con detection/recognition via WebHID (L/R, MAC id), button mapping, identify lights | P0 | IMPLEMENTED | web/lib/inputBridge.ts, electron/main.ts | I (simulated input only) | **Not verified with real Joy-Cons** (KNOWN_ISSUES K1) |
| Z8 | Keyboard buzzers (TV window) | P1 | TESTED (server, simulated) / IMPLEMENTED (capture) | inputBridge.ts | I | — |
| Z9 | Other gamepads (Gamepad API) | P2 | IMPLEMENTED | inputBridge.ts | — | — |
| Z10 | Mixed-device buzzing in one game | P0 | TESTED | — | U, I | — |
| Z11 | Buzzer delay settings / latency diagnostics | P2 | IN PROGRESS | reactionMs recorded | U | No diagnostics UI |
| Z12 | Vibration feedback on Joy-Con | P3 | NOT STARTED | — | — | Optional per spec |

## Teams, scoring, contributions, statistics

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| T1 | Team create/name/color/logo, saved teams, ≥2 members (no size cap) | P0 | TESTED | repos.ts, Teams.tsx, Setup.tsx | I, U | — |
| T2 | Per-team buzzer mode (individual/shared), mixed in one game | P0 | TESTED | engine.ts, buzzer.ts | U, I | — |
| T3 | Team scoring: points once to team; contributions statistical | P0 | TESTED | engine judge | U, I | — |
| T4 | Shared-buzzer attribution (member or Team only), audited correction | P0 | TESTED | engine judge/correctAttribution | U, I | — |
| T5 | Team wagers (DW/Final) affect team score once | P0 | TESTED | engine | U | — |
| T6 | Historical team membership preserved | P0 | TESTED | repos.recordParticipants | I | — |
| T7 | Solo stats / individual team contributions / team stats kept separate | P0 | TESTED | stats.ts | I | — |
| T8 | Category performance (no merging of different names) | P1 | TESTED | stats.ts | I | Only case/whitespace normalisation, no alias UI |
| T9 | Leaderboard (respects privacy) | P2 | IMPLEMENTED | stats.leaderboard, History.tsx | — | — |
| T10 | Player comparison / head-to-head | P3 | NOT STARTED | — | — | — |
| T11 | Automatic team balancing | P3 | NOT STARTED | — | — | — |

## Boards, library, import/export

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| L1 | Board CRUD, duplicate, delete, rename, version history | P0 | TESTED (API) / IMPLEMENTED (UI) | repos.ts, desk/Library.tsx, desk/BoardEditor.tsx | I | Editor/library UI not browser-tested yet |
| L2 | Configurable categories (fewer/more than 6), rows, values, DW flags, Final | P0 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L3 | Drag-and-drop category reordering, clue moves | P1 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L4 | Autosave drafts + manual save | P1 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L5 | CSV + JSON import (preview, validation, duplicate warning) and export | P0 | TESTED | shared/boardIO.ts, app.ts | I | — |
| L6 | Category import/export | P2 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L7 | Search, filter, tags, folders, favorites, archive, templates, previews | P1 | IMPLEMENTED | Library.tsx | — | — |
| L8 | Multimedia clues (image/audio/video upload, display) | P1 | IMPLEMENTED | app.ts /api/media, BoardEditor, BoardPage | — | Media not included in JSON export packages |
| L9 | Complete game-package export with media | P2 | NOT STARTED | — | — | — |
| L10 | Example board | P1 | TESTED | shared/sampleBoards.ts | I, E | — |

## Other spec areas

| ID | Feature | Pri | Status | Notes |
|---|---|---|---|---|
| O1 | Offline operation (no external requests) | P0 | TESTED | E (request interception across all pages) |
| O2 | LAN address detection + interface choice + troubleshooting | P0 | IMPLEMENTED | desk/Connect.tsx, network.ts |
| O3 | Single-player vs computer opponents, practice mode | P2 | NOT STARTED | |
| O4 | Shared-screen local multiplayer (keyboard buzzers on one PC) | P1 | IMPLEMENTED | keyboard buzzers + host on same PC |
| O5 | Theme editor, theme import/export, custom fonts/logos/backgrounds | P2 | NOT STARTED | 8 preset themes exist |
| O6 | Workspaces & roles | P3 | NOT STARTED | |
| O7 | Optional offline AI (Ollama) | P3 | NOT STARTED | |
| O8 | Additional modes: Double/Triple rounds via multi-round boards, presets | P2 | IN PROGRESS | multi-round boards + rule presets; no survival/tournament |
| O9 | Accessibility (focus rings, ARIA, contrast, reduced motion, high-contrast theme) | P1 | IN PROGRESS | No screen-reader audit yet |
| O10 | Spectator mode | P3 | IMPLEMENTED | /board can be opened on any device |
| O11 | Statistics export, score export | P2 | IN PROGRESS | profile export only |
| O12 | Multiple save slots / save-file export | P2 | TESTED (multiple games resumable) / IMPLEMENTED (export) | I |
| O13 | Plugin system | P3 | NOT STARTED | |
