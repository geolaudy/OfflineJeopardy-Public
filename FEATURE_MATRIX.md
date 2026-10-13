# Feature Matrix

Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED (code exists, no automated test) · TESTED (relevant automated tests pass) · BLOCKED.
Test keys: **U** = `tests/unit/engine.test.ts` · **I** = `tests/integration/server.test.ts` · **E** = `tests/e2e/game.spec.ts`, **E2** = `tests/e2e/teams-editor.spec.ts` (Playwright: Chromium TV/desktop/Android, WebKit iPad/iPhone).
Last full run: 2026-10-12 (session 2) — Vitest 58/58, Playwright 8/8 passing.

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
| B6 | Final Wager screens (category, wager status, clue, reveal) | P0 | TESTED | BoardPage FinalScreen | U, E2 | — |
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
| H8 | Manage players & teams, per-team buzzer mode | P0 | TESTED | host/Setup.tsx | U, I, E2 | — |
| H9 | Controller assignment by button press | P0 | TESTED | ControllersPanel.tsx, controllers.ts | I, E2 (keyboard key) | Joy-Con path simulated only |
| H10 | Daily Wager & Final control | P0 | TESTED | Live.tsx, FinalControl.tsx | E, E2, U | — |
| H11 | Save / resume / switch / end games | P0 | TESTED | GamePicker.tsx, app.ts | I, E (end) | — |
| H12 | Event history + audited attribution correction | P1 | TESTED (engine) / IMPLEMENTED (UI) | EventLog.tsx | U | — |
| H13 | Rules & timers settings, presets (Classic, Classroom, Speed, Team Battle, Casual) | P1 | TESTED (engine) / IMPLEMENTED (UI) | RulesEditor.tsx, shared/game.ts | U | — |
| H14 | Pause / resume game | P1 | TESTED | engine | U | — |
| H15 | Keyboard shortcuts for host | P2 | TESTED | host/shortcuts.ts | U2 | See feedback table |

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
| P13 | Final wager/answer from phone | P0 | TESTED | PlayTab FinalForm, hub | U, E2 | — |
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
| Z4 | Early-buzz rules (none / lockout / clue / points), mid-game changes | P1 | TESTED | engine.ts | U, U2, I2 | — |
| Z5 | Team-aware arbitration, configurable team retry | P0 | TESTED | engine.ts | U | — |
| Z6 | Disconnection handling (devices marked disconnected; others keep working) | P0 | TESTED | controllers.ts, hub.ts | I | — |
| Z7 | Joy-Con detection/recognition via WebHID (L/R, MAC id), button mapping, identify lights | P0 | IMPLEMENTED | web/lib/inputBridge.ts, electron/main.ts | I (simulated input only) | **Not verified with real Joy-Cons** (KNOWN_ISSUES K1) |
| Z8 | Keyboard buzzers (TV window) | P1 | TESTED | inputBridge.ts | I, E2 | — |
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
| T9 | Leaderboard (respects privacy; solo/team/contribution separated) | P2 | TESTED | stats.leaderboard, join/Leaderboard.tsx | I2, E | — |
| T10 | Player comparison / head-to-head | P3 | NOT STARTED | — | — | — |
| T11 | Automatic team balancing | P3 | NOT STARTED | — | — | — |

## Boards, library, import/export

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| L1 | Board CRUD, duplicate, delete, rename, version history | P0 | TESTED (API; UI import→edit→save) | repos.ts, desk/Library.tsx, desk/BoardEditor.tsx | I, E2 | Duplicate/archive/version UI not browser-tested |
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
| O11 | Statistics export, score export | P2 | TESTED | profile export + host CSV (players, games) — I2 |
| O12 | Multiple save slots / save-file export | P2 | TESTED (multiple games resumable) / IMPLEMENTED (export) | I |
| O13 | Plugin system | P3 | NOT STARTED | |

## User feedback round 1 (2026-10-12) — see USER_FEEDBACK.md

Test keys added: **U2** = tests/unit/engine.test.ts feedback blocks + tests/unit/shortcuts.test.ts · **I2** = tests/integration/server.test.ts "user feedback round 1" · **M** = tests/e2e/mobile.spec.ts (iPhone SE/13/15 Pro Max portrait+landscape, iPad Pro 11 portrait+landscape, iPad Mini; WebKit) · **E/E2** updated flows.
Last run 2026-10-12: Vitest 58/58 (43 unit, 15 integration), Playwright 8/8.

| ID | Feature / bug | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| FB-1.1 | Phone/tablet top clipping (dvh shells, safe areas, dialogs bounded by visible viewport) | P1 | TESTED | components/ui.tsx (Modal, Drawer, PageHeader), styles.css, JoinPage, HostPage | M (header/dialog/close button inside viewport on 6 iPhone + 3 iPad configs) | Emulated viewports only — no real Safari toolbars/notch in Playwright; real iPhone/iPad check pending (K2, K14) |
| FB-1.2 | Smooth mobile UI: no focus stealing, compositor-only animations, structural sharing, second-resolution timers | P1 | TESTED (focus regression) / IMPLEMENTED (smoothness) | ui.tsx, lib/socket.ts, lib/view.ts, PlayTab, styles.css, board/TimerBar.tsx | M (host keeps focus + typed value during a live update) | Frame-rate smoothness judged from code + screenshots, not measured on devices |
| FB-1.3 | Consistent navigation (back arrow, drawer, titles, browser Back, current page) | P1 | TESTED | ui.tsx, JoinPage (routes /join/*), HostPage, DeskPage | E, M | — |
| FB-2.1 | Leaderboard: Solo / Team games / Contributions, explicit ranking criteria, minimum samples | P2 | TESTED | stats.leaderboard, join/Leaderboard.tsx, desk/History.tsx | I2, E | Thresholds fixed (3 games / 10 answers) |
| FB-2.2 | Other players' public profiles & stats; private profiles hidden | P2 | TESTED | app.ts /api/stats/profiles/:id, join/Players.tsx | I2 (no secrets in payload, 403 private), E, M | Game details only for games you played |
| FB-2.3 | Personal history + detailed game page (participants, teams, scores, categories, my clues, ± points, wagers) | P2 | TESTED | join/HistoryPages.tsx, stats.gameDetail | E | — |
| FB-2.4 | Drawer links: Current game, My profile, My statistics, Game history, Leaderboard, Players, Settings | P2 | TESTED | JoinPage JOIN_NAV | M | — |
| FB-3.1 | Early-buzz rules: none / short lockout / out for clue / lose points; editable before & during game; never retroactive | P3 | TESTED | shared/game.ts, engine.ts handleEarlyBuzz, host/EarlyBuzzRule.tsx, RulesEditor | U2, I2 | — |
| FB-3.2 | Consistent server-side detection for Joy-Con / phone / keyboard, shared & individual team buzzers; lockout per person | P3 | TESTED | engine.ts buzzBlockReason/lockoutUntil, projection.playerContext | U2, I2 (simulated Joy-Con + keyboard + phone in one clue), E | Joy-Con path simulated (real Joy-Cons confirmed working by user before this change; re-check recommended) |
| FB-3.3 | Feedback: host list + refunds, TV "Early" tag, phone "Too early"/lockout text, lockout-expiry rebroadcast | P3 | TESTED | Live.tsx EarlyBuzzes, EventLog, board/Scoreboard.tsx, PlayTab, gameManager.scheduleLockoutRefresh | I2, E | — |
| FB-4.1 | Classic board appearance (TV only) | P4 | IMPLEMENTED | board/board.css, Grid.tsx, Scoreboard.tsx | E (renders), screenshots 16:9, 4:3, 21:9 | Original system-font styling; no proprietary fonts/assets |
| FB-4.2 | Clue zoom from tile (FLIP, WAAPI transform/opacity) + reverse; reduced motion = fade | P4 | IMPLEMENTED | board/ClueZoom.tsx, timing.ts | E (clue shows), agent screenshot checks incl. close→open race | Smoothness not measured on TV hardware |
| FB-4.3 | Full-screen question without category/value | P4 | TESTED | board/ClueZoom.tsx | E (panel has no category/value) | — |
| FB-4.4 | Subtle buzzers-open indicator (edge strips + small label) | P4 | TESTED | board/ClueZoom.tsx, board.css | E | — |
| FB-4.5 | Category introduction per round (start/next/auto/skip/replay) | P4 | TESTED | engine intro actions, gameManager.scheduleIntro, board/Intro.tsx, Live.tsx IntroControls | U2, E | — |
| FB-5.1 | Unanswered clue: Nobody knows/time up → Reveal answer → Return to board; skip secondary; stale taps ignored | P5 | TESTED | engine (answeringEnded, clueId guards), Live.tsx ClueFlow | U2, I2, E, E2 | — |
| FB-6.1 | Presentation polish (timing constants, fill-in, score flash, Final/winner styling) | P6 | IMPLEMENTED | board/* | E | Visual review from screenshots only |
| FB-E1 | Test teardown race | — | TESTED | hub.ts closed flag, gameManager.dispose | npm test: no unhandled errors | — |
| FB-E2 | Saved-game backward compatibility | — | TESTED | engine.normalizeState, repos.loadGame | U2 | — |
| H15 | Host keyboard shortcuts (Space, C, X, E, R, Enter, N, Ctrl+Z) | P2 | TESTED | host/shortcuts.ts, Live.tsx | U2 | Disabled while dialogs/menu are open; shared-buzzer judgements need the buttons |
| O11b | Host CSV exports (players, game results) | P2 | TESTED | stats.playersCsv/gamesCsv, desk/History.tsx | I2 | — |
