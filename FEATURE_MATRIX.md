# Feature Matrix

Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED (code exists, no automated test) · TESTED (relevant automated tests pass) · BLOCKED.
Test keys: **U** = `tests/unit/engine.test.ts` · **I** = `tests/integration/server.test.ts` · **E** = `tests/e2e/game.spec.ts`, **E2** = `tests/e2e/teams-editor.spec.ts` (Playwright: Chromium TV/desktop/Android, WebKit iPad/iPhone).
Last full run: 2026-10-12 (session 3) — Vitest 73/73, Playwright 12/12 passing. **L** = tests/e2e/library.spec.ts, **T** = tests/e2e/themes.spec.ts, **P** = tests/e2e/practice.spec.ts, **R** = tests/e2e/roomcode.spec.ts.

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
| A8 | Backup / restore / integrity check (full .zip with media, or database-only .db) | P1 | TESTED | server/app.ts, server/zip.ts, desk/Settings.tsx | I (full backup → restore on next start incl. media, safety copies) | Restore applies on restart; large media folders are buffered in memory |
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
| B10 | Sound effects (synthesised), reduced motion, themes (8 presets + custom) | P2 | TESTED (themes) / IMPLEMENTED (sound) | lib/sound.ts, styles.css, board/board.css, desk/Themes.tsx | I, T | Sound packs not customizable |

## iPad host controller

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| H1 | Host auth via pairing code; persistent host session; reconnect | P0 | TESTED | auth.ts, app.ts, host/HostPage.tsx | I, E (WebKit iPad), **manual: real iPad (user, 2026-10-13)** | — |
| H2 | Select clue → TV; private answer + notes | P0 | TESTED | host/Live.tsx | E | — |
| H3 | Reveal/hide answer | P0 | TESTED | Live.tsx | E, U | — |
| H4 | Unlock / lock / reset buzzers | P0 | TESTED | Live.tsx | E, I, U | — |
| H5 | Timer start / pause / resume / reset | P0 | TESTED (engine) / IMPLEMENTED (UI) | Live.tsx TimerControls | U | UI buttons not E2E-tested |
| H6 | Correct / incorrect, award/deduct points, undo | P0 | TESTED | Live.tsx | E, U, I | — |
| H7 | Skip / restore clue, rounds, board control | P1 | TESTED (engine) / IMPLEMENTED (UI) | Live.tsx | U | — |
| H8 | Manage players & teams, per-team buzzer mode | P0 | TESTED | host/Setup.tsx | U, I, E2 | — |
| H9 | Controller assignment by button press | P0 | TESTED | ControllersPanel.tsx, controllers.ts | I, E2 (keyboard key), **manual: real Joy-Cons (user, 2026-10-13)** | — |
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
| P17 | Room codes: optional 4-letter code shown on the TV, required to join the current game (typed on the phone; never sent to phones; wrong codes rate-limited; host can regenerate). QR stays a plain URL | P2 | TESTED | shared/game.ts, engine playerJoin/setRoomCode, projection, hub, host/Setup, join/PlayTab, board/BoardPage | U, I, R = tests/e2e/roomcode.spec.ts | A code is per game; it gates joining, not reconnecting players already in the game |

## Buzzers & controllers

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| Z1 | Unified buzzer engine (first valid buzz, lockout, queue) | P0 | TESTED | engine.ts handleBuzz | U, I, E | — |
| Z2 | Simultaneous buzzes deterministic (server arrival order) | P0 | TESTED | engine/hub | U, I | — |
| Z3 | Duplicate prevention, debounce, held buttons (edge-triggered) | P0 | TESTED | buzzer.ts InputFilter, controllers.ts | U, I | — |
| Z4 | Early-buzz rules (none / lockout / clue / points), mid-game changes | P1 | TESTED | engine.ts | U, U2, I2 | — |
| Z5 | Team-aware arbitration, configurable team retry | P0 | TESTED | engine.ts | U | — |
| Z6 | Disconnection handling (devices marked disconnected; others keep working) | P0 | TESTED | controllers.ts, hub.ts | I | — |
| Z7 | Joy-Con detection/recognition via WebHID (L/R, MAC id), button mapping, identify lights | P0 | TESTED | web/lib/inputBridge.ts, electron/main.ts | I (simulated input), **manual: real Joy-Cons on Windows (user, 2026-10-13)** | Switch 2 Joy-Cons unsupported (different device ids); see K1 |
| Z8 | Keyboard buzzers (TV window) | P1 | TESTED | inputBridge.ts | I, E2 | — |
| Z9 | Other gamepads (Gamepad API) | P2 | IMPLEMENTED | inputBridge.ts | — | — |
| Z10 | Mixed-device buzzing in one game | P0 | TESTED | — | U, I | — |
| Z11 | Buzzer delay settings / latency diagnostics | P2 | TESTED | shared/buzzCheck.ts, server/buzzCheck.ts (in-memory check, never reaches the game), hub (phone round-trip reported with pings, connections list, check routing; host-only control), components/BuzzCheckPanel.tsx (Buzzers page + lobby Buzzers tab), join/PlayTab BuzzCheckCard | I = tests/integration/buzzcheck.test.ts (order, delays, waiting list, game untouched, host-only), E = tests/e2e/buzzcheck.spec.ts (phone test button → host list with delay) | Delay = phone round trip on the LAN; Joy-Con/keyboard latency is local and not measured |
| Z12 | Vibration feedback on Joy-Con | P3 | IMPLEMENTED | shared/joyconRumble.ts (HD-rumble encoding, patterns), web/lib/inputBridge.ts (enable 0x48, output report 0x10), protocol controllerFx, hub.controllerFx (routed to the window that reads the device), app.ts onPress (first buzz / too early), Buzzers page toggle + Identify/Vibrate buttons (work from the iPad) | U (encoding vs documented values), I (routing, host-only, setting off) | Not felt on real Joy-Cons yet (K25) |

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
| T10 | Player comparison / head-to-head | P3 | TESTED | server/stats.ts headToHead (counted games both played: finishing order as opponents, record as teammates, recent games), GET /api/stats/compare (signed in; private profiles only for themselves and the host), components/HeadToHead.tsx, phone player page "Compare with me", host Players page Compare dialog | I = tests/integration/compare.test.ts, E = tests/e2e/compare.spec.ts | — |
| T11 | Automatic team balancing | P3 | TESTED | shared/teamBalance.ts (rating with priors from accuracy and wins; snake draft + improving swaps; seeded shuffle), GET /api/stats/ratings (host only; practice games excluded), host/Setup.tsx BalanceTeams (team count, shuffle, preview with team strength, create) | U = tests/unit/teamBalance.test.ts, E = tests/e2e/balance.spec.ts | Individual ratings are not shown (only team strength) |

## Boards, library, import/export

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| L1 | Board CRUD, duplicate, delete, rename, version history | P0 | TESTED | repos.ts, desk/Library.tsx, desk/BoardEditor.tsx | I, E2, L (duplicate, archive/restore in UI; version restore via API) | Version-restore button not clicked in a browser test |
| L2 | Configurable categories (fewer/more than 6), rows, values, DW flags, Final | P0 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L3 | Drag-and-drop category reordering, clue moves | P1 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L4 | Autosave drafts + manual save | P1 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L5 | CSV + JSON import (preview, validation, duplicate warning) and export | P0 | TESTED | shared/boardIO.ts, app.ts | I | — |
| L6 | Category import/export | P2 | IMPLEMENTED | BoardEditor.tsx | — | — |
| L7 | Search, filter, tags, folders, favorites, archive, templates, previews | P1 | IMPLEMENTED | Library.tsx | — | — |
| L8 | Multimedia clues (image/audio/video upload, display) | P1 | TESTED (upload, packaging) / IMPLEMENTED (editor UI) | app.ts /api/media, BoardEditor, BoardPage | I, L | Editor media-upload button not browser-tested; plain JSON export still references media by URL (use packages) |
| L9 | Board package export/import with media (.ojboard.zip) | P2 | TESTED | server/zip.ts, app.ts /api/boards/:id/package + /api/boards/import-package, desk/Library.tsx | U (zip, Windows interop), I (round trip, missing/hostile media, auth), L (UI export → import) | Max 300 MB per package |
| L10 | Example board | P1 | TESTED | shared/sampleBoards.ts | I, E | — |

## Other spec areas

| ID | Feature | Pri | Status | Notes |
|---|---|---|---|---|
| O1 | Offline operation (no external requests) | P0 | TESTED | E (request interception across all pages) |
| O2 | LAN address detection + interface choice + troubleshooting | P0 | IMPLEMENTED | desk/Connect.tsx, network.ts |
| O3 | Single-player vs computer opponents (4 difficulties: knowledge, reaction time, risk, wager style; buzz/answer/Daily Wager/Final automatically, never early), practice mode (not counted in stats, auto-opening buzzers, answer hidden from the playing host, B = buzz) | P2 | TESTED | server/bots.ts, engine addBot/hostBuzz, migration v3 (games.practice), stats COUNTED filter, host Setup/GamePicker/Live — tests: tests/unit/bots.test.ts, I (practice excluded from stats, bot history snapshot), P = tests/e2e/practice.spec.ts. Bots are solo-mode only; the host still picks clues for them |
| O4 | Shared-screen local multiplayer (keyboard buzzers on one PC) | P1 | IMPLEMENTED | keyboard buzzers + host on same PC |
| O5 | Theme editor (colors, offline font stacks, text sizes, corners, shadows, value prefix, background image + dim, logo), live preview (real TV page in iframe), import/export (.ojtheme.json with embedded, re-validated images), live TV update | P2 | TESTED | shared/themes.ts, db migration v2, repos.ts, app.ts /api/themes*, board/common.tsx + Preview.tsx, desk/Themes.tsx — tests: I (CRUD, auth, URL whitelist, import re-validation, TV resolution, migration), T = tests/e2e/themes.spec.ts. Not customizable yet: sound effects, transition/reveal effects, timer/scoreboard layout |
| O6 | Workspaces & roles | P3 | NOT STARTED | |
| O7 | Optional offline AI (Ollama): local/OpenAI-compatible provider for bot answers; **Create a board with AI** from a topic (draft marked AI-generated, gaps blank, editor notice) | P3 | TESTED | server/ai.ts (compatChat, generateBoard), app.ts /api/ai/generate-board, desk/GenerateBoard.tsx, desk/AiSettings.tsx, BoardEditor notice | I (ai-local.test: answers, guard, errors, generation incl. duplicates/gaps/final), E (ai-board.spec, bots.spec settings) | Not tried with a real Ollama/LM Studio install (K30). Clue helper (write from answer / tidy wording) in the editor added after v0.9.0 |
| O8 | Additional modes: Double/Triple rounds via multi-round boards, presets; **Survival** (lives, hearts on TV/host/phone); **Tournaments** (series of games with placement-points or total-score standings) | P2 | TESTED | shared/tournament.ts (standings, tie-breaks), server/tournaments.ts + migration v4 (tournaments table, games.tournament_id), /api/tournaments*, desk/Tournaments.tsx (list, create, standings, games, finish/reopen, delete), GamePicker tournament select, host Results standings, TV presented 'tournament' page | U (standings), I = tests/integration/tournament.test.ts, E = tests/e2e/tournament.spec.ts, survival.spec.ts | Team tournaments recognise a team across games by its saved team (ad-hoc teams match by name) |
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

## User feedback round 2 (2026-10-13) — see USER_FEEDBACK.md "Round 2"

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| R2-1 | Startup landing + Create Lobby | P1 | TESTED | desk/DeskPage.tsx (start screen: Create lobby, Resume, Boards, Settings, Help, network help; opens the TV window on the second screen) | E = tests/e2e/lobby.spec.ts (start screen → lobby open → close) | Electron TV auto-open not covered by automated tests |
| R2-2 | Per-lobby host pairing (QR + temporary code) | P1 | TESTED | server/lobby.ts (code per lobby), app.ts (/api/qr?target=hostPair requires host auth; login 409 without a lobby), host/HostPage.tsx (#pair= fragment one-step pairing, removed from the URL), hub observer flag | I (server.test pairing), E (QR pairing, host connected status, code rejected after close), **manual: QR scanned with a real iPad (user, 2026-10-13)** | — |
| R2-3 | Full host management UI on iPad | P1 | TESTED | host/AppShell.tsx (Home, Boards, Players, Teams, Buzzers, History, Settings, Help; drawer on narrow screens), host/HostPage.tsx routes reuse the desk pages | E (lobby.spec, mobile.spec on iPad Pro/Mini, teams-editor), **manual: real iPad (user, 2026-10-13)** | — |
| R2-4 | Host Home = game setup + Open Lobby | P1 | TESTED | host/GamePicker.tsx (board list with preview, mode, preset, player limit, rules draft, summary via shared/rulesSummary.ts, Open lobby), Resume list | E (game, practice, roomcode, teams-editor via Open lobby) | — |
| R2-5 | Full-screen public TV lobby | P1 | TESTED | board/Presenter.tsx, LobbyFull.tsx, lobbyModel.ts, presenter.css; server/lobby.ts roster (public fields, device types only) | E (lobby.spec: waiting state, Scan to join, host code never on TV; game/practice/roomcode specs) + screenshots 1080p, 1280×1024, 1024×768, 14-player and team lobbies | Shared-buzzer team members come from the game projection (roster row has no member list) |
| R2-6 | Host lobby controls | P1 | TESTED | host/Setup.tsx LobbyControls (board, Individuals/Teams with a warning that names what is reset, player count/limit, rules), engine setMode + server-only setBoard, POST /api/games/current/board, Close lobby (menu + start screen) | U (setMode keeps everyone and personal buzzers, releases shared team buzzers; setBoard lobby-only), E (lobby.spec mode + board change) | Moving a player between teams uses the existing team editor |
| R2-7 | Synchronized public presentation pages | P1 | TESTED | server/lobby.ts builders, shared/presentation.ts, board/PresentPages.tsx (leaderboard, players, player, teams, boards, board, rules, buzzers), AppShell + Players/History hooks | I (privacy: phones never receive presentation; private stats hidden), E (TV follows Players/Teams/Lobby) + screenshots of every page | Leaderboard/player pages verified with injected data (scratch DB had no finished games) |
| R2-8 | Private View / Present on TV | P1 | TESTED | host/AppShell.tsx (Present on TV switch, per-session preference, disabled during play), server builds public payloads | I (presentation privacy), E (TV follows nav; private view leaves it unchanged) | — |
| R2-9 | Compact lobby panel + transitions | P1 | TESTED | board/CompactLobby.tsx (shared join card never remounts; avatar shared-element morph), timing.ts morph constants | E (compact panel visible on presented pages) + mid-transition screenshots | Reduced-motion variant not visually checked |
| R2-10 | Public navigation rail + branding | P2 | TESTED | board/NavRail.tsx (current page highlighted), wordmark top-right | E (rail visible while presenting) | — |
| R2-11 | Return to start from local host mode | P1 | TESTED | AppShell Back to start (game computer only), HostPage Close lobby → /desk, legacy /desk/* redirects to /host/* | E (lobby.spec legacy redirects) | — |
| R2-12 | Media-first clue layout + per-clue layout option | P1 | TESTED | board/ClueMedia.tsx, board.css | U, E = tests/e2e/media.spec.ts (image >45% of screen height, caption, screenshots) | Video clues share the image path; no portrait-TV screenshot yet |
| R2-13 | Host audio/video controls (synced) | P1 | TESTED | engine media* actions, gameManager.scheduleMediaEnd, host/MediaControls.tsx, ClueMedia.useMediaSync, Electron autoplayPolicy | U, E (play/pause/resume on the TV, duration from metadata, nothing playing after close) | Plain-browser TVs need one click before sound can autoplay (the Electron TV window does not) |
| R2-14 | Separate clue / answer media | P1 | TESTED | shared/game.ts answerMedia, projection (hidden until reveal), ClueMedia (decoded before cross-fade), BoardEditor sections | U (never leaked before reveal), E (uncovered image + caption; answer replaces hint) | Board package import does not yet carry answerMedia (fix pending) |
| R2-15 | Image captions fixed end to end | P1 | TESTED | ClueMedia captions (figcaption), BoardEditor MediaList | E (caption on TV for clue and answer side); persistence via boardIO schema | — |
| R2-16 | Automatic buzzer unlock (game + per clue) | P1 | TESTED | rules.autoUnlock, Clue.unlock, unlockModeFor, engine openBuzzers/maybeAutoOpen, RulesEditor, BoardEditor | U (off/all/mediaOnly/perClue, mediaEnd), E (media-only clue opens itself; audio clue opens when the sound ends) | Default Off preserves the old behaviour |
| R2-17 | Board and clue preview without a game (library card, editor header, per-clue) using the real TV components | P1 | TESTED | board/BoardPreview.tsx (local view model; exported Stage), desk/Library.tsx, desk/BoardEditor.tsx | L (open clue, reveal, back, exit; no game/history created) | Daily Wager clues preview their question directly; no buzzers in preview |
| R2-18 | Vector icon set replacing emoji | P2 | IMPLEMENTED | lucide-react in host app, start screen, launcher, phone menu, editor, library, settings, Live/Setup/Final controls, TV presenter | E (suites updated for icon buttons) | Typographic arrows/✓ in sentences and built-in avatar emoji kept on purpose; TV board grid unchanged |
| R2-19 | Shared page header / Boards alignment | P2 | IMPLEMENTED | components/ui.tsx PageTitleBar; Library, GamePicker | E (library.spec) | Remaining pages keep their own (already right-aligned) headers |
| R2-20 | Buzzinga.io import (share link via the public endpoint the share page itself uses; official CSV export; saved board JSON) | P2 | IMPLEMENTED | importers/sources/buzzinga.ts, importRoutes.ts, desk/ImportFromSource.tsx; findings in RESEARCH_NOTES.md | U, I (fixture server), L (dialog via dataset) | **Not verified against a real shareable Buzzinga board** (response shape inferred from their public JavaScript); undocumented endpoint may change; requires internet at import time only |
| R2-21 | Extensible importer (parse → normalise → media → validate → create; plugin registry) + user-provided Jeopardy-style datasets (JSON clue lists, generic CSV, direct .csv/.json links); SSRF-safe downloads, size caps, rollback, previews, duplicate warnings | P2 | TESTED | src/server/importers/**, importRoutes.ts, desk/ImportFromSource.tsx | U (15), I (11), L = library.spec.ts dataset import | Nothing bundled or scraped; media folders for CSV and TSV datasets not supported |
| R2-22 | Sound cues + sound packs | P2 | TESTED | shared/tvFx.ts (13 cues, packs), web/lib/sound.ts (synthesised Classic/Arcade/Soft, Custom files with Classic fallback, Muted; per-cue switches), BoardPage useSounds/useCountdownCue, desk/PresentationSettings.tsx (pack, per-cue toggle + Test, upload/remove own files), POST/DELETE /api/sounds/:cue (host only, audio sniffed, 2 MB cap, old file removed) | I (tvfx.test: upload validation, auth, replace/delete, files cannot be set via settings), E (settings save pack/cues) | Audible output not verified by automated tests (no audio capture); custom sounds are not included in board packages (they are in full backups) |
| R2-23 | Board intro (checker reveal) animation + settings | P2 | TESTED | board/fx.tsx BoardReveal + checkerDelays, Intro.tsx (reveal before the round title, then title over the dimmed board), Grid checker fill when no intro, tvFx.boardIntro/introSpeed (also paces auto category intro), skip/replay via host intro controls | E (practice.spec: reveal visible after Start, gone after Skip; screenshot), E (settings toggle) | Reduced motion = simple fade (checked in CSS, not visually) |
| R2-24 | Buzzer unlock indicator styles | P2 | TESTED | board/fx.tsx UnlockIndicator (side edges, top glow, bottom glow, status dot, brief pulse, none; colour/theme colour, intensity, full-strength duration, persist while open, optional label, screen-reader status always), cue 'unlock' for sound, settings previews | E (practice.spec: dot style on the TV after auto-unlock; settings style change) | — |
| R2-25 | UX consistency pass | P3 | IMPLEMENTED | components/ui.tsx PageTitleBar (title keeps a real width; actions wrap), consistent page headers with icon buttons, host Home: one bar on phones (nav button + TV switch move into the game bar; Pause/Menu icon-only below sm; game menu uses ⋮ so it differs from navigation), short buzzer button labels on phones, editor category controls wrap, start screen padding | E (full suite) + audit screenshots on iPad (gen 7), iPad Mini, iPhone 13 and iPhone SE (WebKit) | Not verified in Safari on real devices (K2/K14) |

## User feedback round 3 (2026-10-13) — see USER_FEEDBACK.md "Round 3"

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| R3-1 | Media file picker filters per media kind | P1 | TESTED | shared/mediaTypes.ts (explicit extensions + MIME per kind), desk/BoardEditor.tsx MediaList (Add image / Add audio / Add video), app.ts /api/media?kind= check (audio-only MP4/WebM accepted from Audio) | U (mediaTypes.test), I (server.test R3-1), E (media.spec pickers: accept lists, audio upload plays, picture via Audio refused) | Not verified in the real Windows file dialog (automated tests set files directly) |
| R3-2 | Show Leaderboard on TV (metric, player/team selection, return) | P1 | TESTED | host/LeaderboardPage.tsx (new nav item + History tab), join/Leaderboard.tsx (Teams view, selection), shared/leaderboard.ts (team criteria; Points earned, Incorrect answers), stats.teamLeaderboard, lobby.ts team page + `back`, PresentPages TeamPage | I (round3: teams view, team page, previous page, incorrect metric, privacy), E (practice.spec: Private view → Show Leaderboard on TV → metric + Teams follow live → Lobby) | Leaderboard shows up to 12 rows on the TV |
| R3-3 | Return to Lobby after a game (keep players/bindings/pairing) | P1 | TESTED | gameManager.rematch, POST /api/games/current/rematch (tournament carried over), host/Results.tsx (Return to Lobby primary, Create new lobby secondary), lobby.ts phone readiness fix | I (round3: three consecutive games — roster, bindings, bot, room code kept; scores/clues/buzzes reset; history + stats counted once; disconnected phone not ready, reconnects), E (practice.spec) | Undo of the previous game's end is no longer offered after returning |
| R3-4 | Read-only public Settings page on TV | P1 | TESTED | shared/rulesSummary.publicSettings (grouped, explained), lobby.ts rules() (game rules / host draft / defaults), POST /api/lobby/draft, host/ShowSettingsOnTv.tsx (Settings page + game setup), PresentPages RulesPage (measured fit) | I (round3: draft live, game rules, no room code/token/PIN), E (practice.spec: no controls, screenshot) | — |
| R3-5 | Bot difficulty badge (TV lobby, host lobby, bot dialog) | P1 | TESTED | RosterRow.bot, lobbyModel level, LobbyFull badge, host/Setup.tsx badge (dialog already shows levels) | I (round3 roster bot: Hard), E (practice.spec: Easy → Expert updates the TV) | — |
| R3-6 | Lobby player cards with wins / games played | P2 | TESTED | stats.lobbySummaries (solo/team split, streak, privacy), PublicRoster.people, lobbyModel.summaryText, LobbyFull Summary + team member wins + saved-team record | I (round3: summaries after 1 and 2 games, streak, private player shows no numbers), E (lobby-stats.spec: "1 game · 1 win" / "1 game · 0 wins", screenshot) | Win % only shown from 3 games; compact lobby panel shows avatars only |
| R3-7 | Crown (reigning winner) + all-time wins leader marker | P2 | TESTED | LobbyManager.reigning (set on Return to Lobby, cleared when the lobby closes), roster reigning/leaders/reigningTeams, LobbyFull Marks + legend | I (round3: crown on previous winner; leader only with a unique-or-partial top, never when everyone ties; private players excluded), E (lobby-stats.spec crown, medal, legend) | Crown applies to matches played in the current lobby session |
| R3-8 | Bot player cards | P2 | TESTED | RosterRow.bot/crown, LobbyFull (difficulty badge line, Computer player tag, robot avatar, crown when a bot won) | I (round3 bot row), E (lobby-stats.spec: Medium badge, no statistics line) | Bot statistics are not tracked (no profile), so none are shown |
| R3-9 | Bots select clues | P1 | TESTED | botAnswers.pickClue (easy random; medium favourite categories, cheaper first; hard down a category, big values when behind/late; expert score-aware, chases high rows of untouched categories — never peeks at Daily Wagers), BotDriver pick task (only with control, board phase, no intro) | U (bots.test: picks only open clues, waits on the human's turn; strategy cases), E (bots.spec: bot with control opens a clue) | Bots do not advance rounds; the host still does |
| R3-10 | Visible bot answers + host judgment | P1 | TESTED | engine submitAnswer → ActiveClue.submission + 'submission' event; projection (public: answer text only), host Live bot panel (difficulty, answer, expected privately — hidden in practice games), TV winner banner, EventLog + game history | U, I (practice flow: TV sees the answer, not the expected one; host judges), E (bots.spec, screenshots) | — |
| R3-11 | Plausible local wrong answers | P2 | TESTED | botAnswers.localAnswer (same-category answers, same-shape answers from the board, near-miss numbers/years, no repeats; easier bots guess further away) | U (related material only, no repeats, closer numbers for harder bots) | Boards with very few clues can fall back to "Pass" |
| R3-12 | Difficulty-based bot timing | P2 | TESTED | BOT_PARAMS (react/think/pick per level), per-bot pace 0.85–1.2×, think time kept inside a running answer timer | U (reaction windows) | — |
| R3-13 | Awaiting-judgment state stops the answer timer | P1 | TESTED | engine submitAnswer clears the answer timer; bots no longer judge themselves (also Daily Wager and Final) | U (30 s after submitting: still unjudged, no answer event), E (waits past a 6 s answer timer) | Human answers are unchanged |
| R3-14 | Optional AI-powered bots (secure key, fallback) | P3 | IMPLEMENTED | server/ai.ts (official @anthropic-ai/sdk, structured JSON output, effort low, server-side refusal fallback `default`, hard timeout, per-game limit, cache, scrubbed errors, wrong-answer guard), key file outside the DB encrypted with Electron safeStorage (DPAPI), /api/ai (write-only key, host only), /api/ai/test, /api/ai/models, desk/AiSettings.tsx, per-bot "AI answers" (add dialog + lobby), host panel AI tag / fallback warning | I (ai.test: key never in DB/backup/broadcasts/errors, AI answer used and host-judged, accidental right answer rejected, refusal + timeout fall back, per-game limit, pass fallback, per-bot), U (encrypted key file), E (settings: write-only key, no browser requests to the provider) | **Not verified against the real provider** (K26); Anthropic is the only provider so far |
| R3-15 | Windows installer + portable builds with verification | P2 | TESTED | package.json dist/dist:verify/release:local, scripts/verify-dist.mjs, electron/main.ts `--smoke-test`, build-electron.mjs version injection | Local: 14/14 checks incl. headless start of the unpacked app and the portable exe on Windows 10 | Installer not executed (needs UAC); unsigned |
| R3-16 | GitHub Releases + Actions workflow on version tags | P3 | IMPLEMENTED | .github/workflows/windows-build.yml, scripts/release-notes.mjs, CHANGELOG.md | release-notes extractor run locally | Workflow not yet run on GitHub |

## User feedback round 4 (2026-10-14) — see USER_FEEDBACK.md "Round 4"

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| R4-1 | Jeopardy!/Buzzinga sound pack (default; Classic/Arcade/Soft kept; install own files; Classic fallback per cue) | P1 | TESTED | shared/tvFx.ts (pack, cues timeUp/finalThink, PACK_FILE_RULES, v2 migration), server/soundPacks.ts, app.ts /api/soundpacks + /media/pack, web/lib/sound.ts, desk/SoundPackPicker.tsx, electron main + package.json extraResources | I (round4: defaults/migration, bundled files, install/replace/remove, bad files, no-files fallback), E (practice.spec: four packs, default label, switching) | What is *heard* is not verified automatically (K23); local builds include `new_sfx` — do not publish them |
| R4-2 | Final Jeopardy! by players' phones, private until reveal, one-at-a-time reveal lowest → highest, judge then next | P1 | TESTED | engine (order/preScores/cursor/step, finalReveal, judge gating, time-up closes answers, submission events), projection (redaction for every role + host events), host/FinalControl.tsx, board/FinalScreen.tsx, join/PlayTab.tsx (own submission, autosave) | U (order, ties, zero/max/missing wagers, privacy, step gating, legacy saves), I (round4: phones, privacy, reconnects of phone + host, scores, history), E (teams-editor: full Final via phone on TV + iPad) | Recovery entry by the host is in a collapsed section |
| R4-3 | Final Jeopardy! think music (TV only, synced with the timer, fades out, no restart on reconnect) | P1 | IMPLEMENTED | BoardPage useSounds (finalThink start/stop/pause-resume offset), sound.ts stoppable cue | — (audio not capturable) | Original synthesised figure when no think file is installed |
| R4-4 | Simplified clue controls (Unlock Buzzers → Correct/Incorrect → Reveal Answer → Return to Board; auto re-open; tools under More) | P1 | TESTED | host/Live.tsx CluePanel, ClueFlow, BuzzersOpen, ClueTools | E (game.spec: re-opens after a wrong answer, reveal without Skip; media.spec, practice.spec) | — |
| R4-5 | Host clue readability (large clue, red ANSWER banner) | P2 | IMPLEMENTED | host/AnswerBanner.tsx, Live.tsx, FinalControl.tsx | E (screenshots) | iPad portrait checked in emulation only |
| R4-7 | Daily Double! / Final Jeopardy! wording | P2 | TESTED | engine labels/errors, rulesSummary, tvFx, StatsView, editor, library, history, help, TV Daily Double splash, importers' new round names | E (game.spec DAILY DOUBLE!, teams-editor Final Jeopardy!) | Boards saved earlier keep their stored round name ("Final Wager") until renamed |
| R4-10 | Media-only clues are complete | P1 | TESTED | shared/boardUtils.ts clueHasPrompt/clueComplete (validation, stats), repos, editor tile label, library | I (round4) | — |
| R4-15 | Rare controls (next round, Final, buzzers, QR, intro replay) in Options; next step shown when a round is done | P2 | TESTED | Live.tsx BoardTools | E (teams-editor via Options) | — |
| R4-16 | Category introduction gates clue selection; dedicated host intro screen | P1 | TESTED | engine selectClue, Live.tsx IntroStage | U, E (game.spec: no host tiles during the intro) | — |
| R4-19 | Board fill synced with its sound; no replay after reconnect | P2 | IMPLEMENTED | fx.tsx revealTimeline, Intro.tsx, IntroState.at | U (intro timestamp) | Sync judged by design/screens; audio timing not measurable in tests |
| R4-20 | Return to the existing lobby (primary) after a game | P1 | TESTED | lobby.ts restore/save, app.ts rematch re-opens lobby, Results.tsx (Return to Lobby first, New Lobby secondary, no back arrow) | I (round4: restart mid-game, three consecutive games, same room code, phones stay, stats once), E (practice.spec) | Each match is its own game record (D38) |
| R4-6 | Bottom Glow default (mustard theme accent, thicker) | P2 | TESTED | tvFx default + v2 migration; fx.tsx accent fallback; board.css thicker bottom glow | I (round4 defaults) | Look judged from screenshots |
| R4-8 | Compact lobby separation + smaller styled QR | P2 | IMPLEMENTED | presenter.css (join card ~22% width, gold frame, rounded; compact panel border/shadow) | E (lobby specs + screenshots) | QR scannability checked by size only, not with a phone at TV distance |
| R4-9 | Shared navigation order + Show Leaderboards on TV | P2 | TESTED | shared/navigation.ts (host nav + TV rail), host menu + Results "Show Leaderboards on TV", LeaderboardPage | E (practice.spec leaderboard flow, lobby.spec nav) | Desk start screen has only Resume/Boards/Settings/Help (same relative order) |
| R4-11 | Pre-lobby TV (board choices following the host, category preview, public settings), no join QR before Open Lobby (also not on the splash) | P2 | TESTED | lobby.ts setup payload (draft-driven, refreshed on draft/game change), board/PreLobby.tsx, Presenter (no join card without a game), BoardPage splash | I (round4: setup payload, follows draft, no clue text/answers, ends when the game exists), E (lobby.spec: no QR before, board + categories follow the host, QR after Open Lobby) | Host pairing QR stays on the game computer's start screen |
| R4-12 | Lobby card avatar centring + spacing | P3 | IMPLEMENTED | ui.tsx Avatar (flex-centred emoji), presenter.css (tighter lines, no strip) | E (screenshots) | — |
| R4-13 | Unified Profile Picture (Upload / Choose Default, circular previews), Preferred Color, unique lobby colours (race-safe, prompt + free colours, fallback palette), colour ring | P2 | TESTED | components/ProfileForm.tsx ProfilePicturePicker (create: phone, host Setup, Players; edit: phone ProfileTab, host Players), DELETE /api/admin/profiles/:id/picture; shared/game.ts LOBBY_COLORS/firstFreeColor; engine syncPlayerColors + setPlayerColor; projection colour override + PlayerContext.color; hub pickColor; PlayTab ColorChoice; rematch keeps colours | I (round4: simultaneous joins, prompt, taken refused, preference kept, rematch keeps; palette overflow) | Old saved games get lobby colours only for players who join after the update |
| R4-14 | Mustard ring on the picking player's score box + larger TV score boxes | P2 | IMPLEMENTED | Scoreboard.tsx is-control (board + clue), board.css podium sizes; host score bar ring | E (screenshots) | — |
| R4-17 | TV typography (Korinna-style clues, Swiss 911-style categories/values; licensed fonts pluggable) | P2 | IMPLEMENTED | board/fonts.css (Merriweather 700/900, Anton via @fontsource, OFL; local() names of the licensed fonts), board.css font variables, app.ts /fonts/user + public `fonts`, BoardPage UserFonts | E (screenshots) | Look-alikes, not the original fonts; licensed files never bundled |
| R4-18 | Classic clue background | P2 | IMPLEMENTED | board.css --bt-panel (CSS gradients + SVG noise recreating the provided image; the image itself is not shipped) | E (screenshots) | — |

## User feedback round 5 (2026-10-15) — see USER_FEEDBACK.md "Round 5"

| ID | Feature | Pri | Status | Source | Tests | Limitations |
|---|---|---|---|---|---|---|
| R5-15 | Undo back into Final Jeopardy! answering (or wagering) restarts that stage's timer from its full duration; answers kept; player inputs are not undo steps; think-time expiry is an undo step | P1 | TESTED | engine (PLAYER_INPUTS, `actor` in EngineCtx, timerExpire snapshot, undo timer rule), gameManager passes the actor | U (round5: expiry → undo ×3, early close → undo, host entries undoable), I (round5: timer running on host, TV and phone after undo) | Policy documented in DECISIONS D55 |
| R5-18 | Wagers only while the host has wagering open (Final: Wagers stage only; Daily Double!: wager stage only), enforced on the server | P1 | TESTED | engine setFinalWager / submitDailyWager, bots, PlayTab (no input before opening), FinalControl recovery only when open | U (round5), I (round5: hand-written early/late socket messages refused) | — |
| R5-19 | Final answers: Submit → read-only + Change Answer; editing = not submitted (gray on TV); draft autosave counts only if nothing was ever submitted; locked after close | P1 | TESTED | FinalEntry submitted/draft, setFinalAnswer submit flag, protocol finalAnswer.submit, PlayTab FinalForm, FinalControl status | U, I (round5), E (playtest: draft counts, Jon green / Kai gray, read-only card) | — |
| R5-20 | Daily Double! wager entered on the picking player's phone (team: first member owns it), host sees it and locks it → clue; host entry is the recovery path | P1 | TESTED | ActiveClue wagerBy/pendingWager, engine submitDailyWager, hub dailyWager, projection (amount host-only), PlayerContext.dailyWager, PlayTab DailyWagerForm, Live.tsx DailyWagerForm | U (round5: limits, owner only, team clash, closed after lock), I (round5), E (playtest phone flow, game.spec recovery) | — |
| R5-16 | Choosing a default picture keeps the upload (hidden, switchable back); picker previews, Save confirms, Cancel reverts | P1 | TESTED | migration v6 `profiles.picture_off`, repos toPublic/toPrivate (uploadedPictureUrl), PATCH usePicture, ProfilePicturePicker (tabs only browse), ProfileTab, ProfileCreateForm, host Players | I (round5: hide, file kept, restore), E (playtest create profile) | — |
| R5-9 | Jeopardy!/Buzzinga files found automatically: every bundled folder (personal build resources, `Sounds`/`new_sfx` beside the exe or in the data folder) merged; Add a folder import; public builds still ship none | P1 | IMPLEMENTED | soundPacks.ts (multi-folder), electron main soundPackDirs, SoundPackPicker | I (round5: multi-folder, first wins, missing folders skipped; round4 install/remove) | Packaged-build check pending; recordings are not redistributable (K28) |
| R5-6 | Final submission indicators: green border = submitted, gray = not (no "…"/✓) | P2 | TESTED | FinalScreen SubmissionChips, board.css .bt-submit-chip | E (playtest data-done) | Swipe transitions: NOT STARTED |
| R5-10a | Victory fanfare (synthesised, moderate level) for every pack without a winner file | P2 | IMPLEMENTED | sound.ts fanfare | — (audio) | Podium: NOT STARTED |
| R5-2 | TV + host home screen with recent games | P1 | NOT STARTED | | | |
| R5-3 | Active lobby redesign, rules summary, smaller QR, board choosing on the TV, minimized lobby with teams | P1 | NOT STARTED | | | |
| R5-4 | Setup screen merged into the lobby; limits under Play As | P1 | NOT STARTED | | | |
| R5-5 | Team management (defaults, Unassigned, drag-and-drop, phone self-selection, capacity, persistence, name/colour, team-first buzz-in) | P1 | NOT STARTED | | | |
| R5-7 | Score delta labels + quicker pop | P2 | NOT STARTED | | | |
| R5-8 | Consistent game typography | P2 | NOT STARTED | | | |
| R5-11 | Gemini + provider registry | P2 | NOT STARTED | | | |
| R5-12 | Category intro controls + host preview | P2 | NOT STARTED | | | |
| R5-13 | iPad board replica | P2 | NOT STARTED | | | |
| R5-14 | iPad clue hosting view | P1 | NOT STARTED | | | |
| R5-17 | Phone lobby experience + nicknames | P1 | NOT STARTED | | | |
