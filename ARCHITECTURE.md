# OfflineJeopardy — Architecture

## Overview

```
 ┌──────────────────────── Windows PC (Electron app) ────────────────────────┐
 │  Electron main (src/electron/main.ts)                                      │
 │   ├─ starts the local game server in-process (src/server/app.ts)           │
 │   ├─ main window  → http://127.0.0.1:<port>/desk   (dashboard + Joy-Con     │
 │   │                  reader via WebHID / Gamepad API)                       │
 │   └─ board window → http://127.0.0.1:<port>/board  (TV, fullscreen, any     │
 │                      display; keyboard buzzers)                             │
 │                                                                            │
 │  Local game server (Fastify, 0.0.0.0:3000..3010)                           │
 │   ├─ REST  /api/*      profiles, PIN auth, boards, games, teams, stats      │
 │   ├─ WS    /ws         live state (role projections), buzzes, controllers   │
 │   ├─ static            built React app (dist/web)                           │
 │   ├─ /media/*          uploaded profile pictures + clue media               │
 │   ├─ GameManager       authoritative game state + timers + persistence     │
 │   │    └─ engine/      PURE engine: state machine, scoring, wagers,         │
 │   │                    buzzer arbitration, undo, projections                │
 │   ├─ ControllerRegistry  devices, edge/debounce filter, press-to-assign    │
 │   └─ SQLite (node:sqlite, WAL) + media folder in the data directory        │
 └────────────────────────────────────────────────────────────────────────────┘
        ▲ Wi-Fi / Ethernet (LAN only, no internet)
        │
  iPad Safari  → /host  (host controller; paired with a 6-digit host code)
  Phones       → /join  (single public QR code: profiles, PIN, buzzer, stats)
  Other TVs    → /board (public projection only)
```

## Source layout

| Path | Purpose |
|---|---|
| `src/shared/game.ts` | Domain model (boards, rules, competitors, bindings, events, state). |
| `src/shared/actions.ts` | Host action contract (zod-validated). |
| `src/shared/views.ts` | Role projections sent to clients (`GameView`, `PlayerContext`). |
| `src/shared/protocol.ts` | WebSocket message contract, controller events. |
| `src/shared/boardIO.ts`, `boardUtils.ts`, `sampleBoards.ts` | Board import/export/validation, example board. |
| `src/server/engine/engine.ts` | Pure reducer `applyAction(state, action, {now,newId})`. |
| `src/server/engine/buzzer.ts` | `InputFilter` (edge-trigger + debounce) and `resolveInput` (device → competitor/profile). |
| `src/server/engine/projection.ts` | `projectState(state, role)` – removes secrets per role. |
| `src/server/gameManager.ts` | Current game, dispatch → persist → broadcast, timers, crash recovery. |
| `src/server/hub.ts` | WebSocket hub: hello/auth, routing, per-role broadcast. |
| `src/server/controllers.ts` | Physical controller registry, mapping, assignment-by-press. |
| `src/server/app.ts` | Fastify app: all REST routes, static hosting, startup. |
| `src/server/db/db.ts` | SQLite open, migrations, transactions, settings, audit log. |
| `src/server/repos.ts` | Profiles, teams, boards, games, history snapshots. |
| `src/server/stats.ts` | Statistics + history derived from events. |
| `src/server/auth.ts` | scrypt PIN hashing, sessions, lockouts, rate limiter, pairing code. |
| `src/server/images.ts` | sharp-based image validation/resizing; media sniffing; safe paths. |
| `src/web/pages/board` | Public TV board: BoardPage (stage), Grid, ClueZoom (FLIP zoom from tile), Intro, Scoreboard, TimerBar (WAAPI), FinalScreen, board.css (classic look), timing.ts. |
| `src/server/lobby.ts` | `LobbyManager`: lobby session (name, temporary pairing code) and the public **presentation state** the TV shows outside play. Payloads (roster, leaderboard, players, player card, teams, boards, board categories, rules summary, buzzer overview) are built on the server from public data only; phones never receive them. |
| `src/shared/tournament.ts`, `src/server/tournaments.ts` | Tournaments: a named series of games (migration v4: `tournaments`, `games.tournament_id`). Standings are computed from finished games' `game_competitors` snapshots (placement points or total score), never stored. |
| `src/shared/buzzCheck.ts`, `src/server/buzzCheck.ts` | Buzzer check: in-memory, presses recorded in order and kept away from the game; phones report round-trip times with pings. |
| `src/shared/teamBalance.ts`, `src/shared/joyconRumble.ts` | Team balancing (ratings with priors, snake draft + swaps) and Joy-Con HD-rumble encoding. |
| `src/server/soundPacks.ts` | Jeopardy!/Buzzinga sound pack: installed (`<data>/media/soundpacks/buzzinga`) and bundled (`new_sfx` in dev, `resources/soundpacks/buzzinga` in a local build) files, matched to cues by name; served at `/media/pack/:source/:file`. |
| `src/shared/navigation.ts` | One navigation order for host nav and TV rail. |
| `src/web/pages/board/PreLobby.tsx`, `fonts.css` | Pre-lobby TV preview; bundled OFL TV fonts + licensed-font hooks (`local()` names, `<data>/fonts`). |
| `src/shared/tvFx.ts` | TV effects setting (board intro + speed, buzzers-open indicator, sound pack / cues / custom files): schema, defaults, normalisation. TV side: `pages/board/fx.tsx` (context, checker reveal, unlock indicator) and `lib/sound.ts` (synthesised packs, custom files). |
| `src/shared/presentation.ts`, `leaderboard.ts`, `rulesSummary.ts` | Presentation contract (`PresentRequest` → `PresentationState`), shared ranking and plain-language rules summary (same wording on host and TV). |
| `src/web/pages/host` | Host app for the iPad **and** the game computer: `AppShell` (Home, Boards, Players, Teams, Buzzers, History, Settings, Help; Present-on-TV switch; Back to start on the game computer), `HostPage` (pairing gate incl. one-step `#pair=` link, routes), Home = set up (GamePicker) → lobby (Setup + LobbyControls) → live → results. The library/editor/players/teams/… pages under `pages/desk` are reused as host pages. |
| `src/web/pages/join` | Phone player portal. Routes: `/join` (buzzer), `/join/profile`, `/join/stats`, `/join/history[/:gameId]`, `/join/leaderboard`, `/join/players[/:id]`, `/join/settings`; drawer + back arrow. |
| `src/web/pages/desk` | `DeskPage` = the game computer's **start screen** (`/desk`: Create lobby, Resume, Boards, Settings, Help; after creating: host pairing QR + code, host status, TV window). Old `/desk/*` addresses redirect to `/host/*`. The other files are the shared management pages used by the host app. |
| `src/web/pages/board/TvHome.tsx`, `home.css` | TV home screen when no lobby is open (R5-2): welcome, recent games, game recap (`PresentationState.home` / `game`, built by `LobbyManager` from `stats.recentGames` / `gameSummary`). |
| `src/web/pages/host/HostLanding.tsx`, `Setup.tsx` | Host home (Create Lobby → `POST /api/lobby {game:true}`, recent games, resume) and lobby management (board chooser, Play As + limits, rules summary, team board with drag-and-drop / Move sheet). |
| `src/web/pages/host/HostClue.tsx`, `TvMirror.tsx`, `host-tv.css` | iPad clue view (answer banner, clue card, footer flow, More) and the live TV preview (Preview page in an iframe). |
| `src/web/pages/join/PlayerLobby.tsx`, `components/PersonName.tsx` | Phone lobby before the game (teams, nickname, buzzer status); "Nickname (Real name)" display. |
| `src/server/aiProviders/` | AI provider registry (anthropic, openaiCompat, gemini) used by `AiService`. |
| `src/web/lib/inputBridge.ts` | Joy-Con (WebHID) / gamepad / keyboard reader → server. |
| `src/electron/` | Electron main + preload. |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest unit, Vitest+real server integration, Playwright E2E. |

## Identity model (separate entities, stable ids)

- **Profile** (`profiles.id`, UUID): a person. Name/nickname/picture/color/avatar can change freely.
- **Team** (`teams.id`, UUID): a saved group of profiles, reusable across games.
- **Controller** (`controllers.id`, e.g. `joycon:<bluetooth MAC>`, `kb:KeyA`, `gamepad:…`, `phone:<profileId>`): an input device only. Never an identity.
- **Competitor** (per game): the scoring entity — a solo player or a team. Game points belong to competitors.
- **Binding** (per game): controller → profile, or controller → team (shared buzzer).
- **Game participants** (`game_participants`): the profile→competitor/team membership *as it was in that game* (historical membership).

## Game engine

`applyAction(state, action, ctx)` is pure and deterministic. It returns the next state plus the
touched events. Every outcome is a `GameplayEvent` (`buzz`, `answer`, `wager`, `score_adjust`,
`attribution_correction`, `undo`, …) with `scoreDelta` (applies to the competitor) and
`contributionDelta` (statistics only, applies to the attributed profile).

- **Scores are derived** from non-voided events (`scoresOf(events)`), never stored separately → no drift, no double counting.
- **Undo** restores a snapshot of gameplay fields and *voids* (not deletes) every event after it, recording an `undo` event — a full audit trail.
- **Attribution correction** voids the original answer event and appends a replacement with the new profile (same `scoreDelta`), linked by `correctsEventId`.
- **Team scoring**: a team answer creates one event: team `scoreDelta = ±value`; the answering member gets `contributionDelta = ±value` only if identified. Shared-buzzer answers default to team-only (`profileId = null`).

### Phases
`lobby → board ⇄ clue → … → final(category → wagers → clue → reveal → done) → ended`.
Daily Wager clues have a `wager` stage (question hidden from public) before the `question` stage.

### Buzzer arbitration (one path for all devices)
1. Device layer reports raw button edges (Joy-Con via WebHID, gamepads, keyboard) or a phone sends `buzz`.
2. `ControllerRegistry` applies `InputFilter` (edge-triggered; held buttons never repeat; debounce per controller) and the button mapping.
3. `resolveInput` maps the device to a competitor (+ profile when identifiable). Phones of shared-buzzer team members are rejected; shared teams buzz only via their team-bound device.
4. The engine `buzz` action: first valid buzz while `open` wins; later buzzes are queued as `late`; buzzes while locked are `early` (optional lockout penalty); competitors that already attempted are blocked (team-aware, with optional `teamRetry: otherMembers`).
5. The server processes messages sequentially, so simultaneous presses are resolved deterministically by arrival order at the server. Client timestamps are never trusted.

### Clue sub-states and unanswered clues
Within phase `clue`: question (or Daily Wager wager stage) → buzzers `open`/`buzzed`/`locked` → **`answeringEnded`** (correct answer, buzz timer expired, host `endAnswering`, or nobody left to try) → `answerRevealed` → `closeClue` (event `clue_close` with result `answered`/`unanswered`/`skipped`). `revealAnswer`, `endAnswering` and `closeClue` accept an optional `clueId` and are ignored when it no longer matches (stale double taps).

### Early buzzes
A buzz is *early* when the question is showing, answering has not ended, the competitor may still answer and buzzers are locked. The rule in force at that moment (`rules.earlyBuzzPenalty`: none / lockout / clue / points) is applied. Lockouts are stored per person (`p:<profileId>`) or per shared-buzzer team (`c:<competitorId>`), never per device. Point penalties are `buzz`/`early` events with a negative `scoreDelta` (once per player per clue) and can be refunded (`refundPenalty`: void + unpenalised replacement event). `buzzer.early` lists the clue's early buzzes for host/TV/phone feedback; the lockout table never leaves the server. The GameManager re-broadcasts when the next temporary lockout expires.

### Final Jeopardy! (round 4)
`FinalState` carries `order` (ascending pre-Final score, ties in competitor order), `preScores`, `cursor` and `step` (contestant → wager → answer). Players submit through the hub (`finalWager`/`finalAnswer`); `finalReveal` advances the step; `judgeFinal` is accepted only for the current contestant at the answer step. `finalEntryReveal()` decides what every projection may show — the host included. When answers close (host or think-timer expiry) each written answer is recorded as a `submission` event (result `final`) for history.

### Team lobby and nicknames (round 5)
Team games start with `defaultTeamCount(players)` empty team slots (`teamSlot`); players wait in `unassigned` and move with `joinTeam` (players, within `rules.maxPerTeam`) or `assignMember` (host, optional `index`); `setTeamCount` adds/removes slots (players of removed slots go back to Unassigned). `setMode` keeps the team setup in `teamDraft(Bindings)` while in individual mode. `startGame` blocks over-full teams, drops empty slots (kept in `lobbyTeams`, restored by `GameManager.rematch`) and leaves unassigned players out; `GameManager.linkSavedTeams` gives every playing team a saved team id. `nicknames` (per lobby) are projected into `profiles[].nickname`.

### Lobby colours (round 4)
`playerColors` / `colorPrompts` in the game state; `syncPlayerColors` runs after every engine action with `ctx.colorOf` (the profile's preferred colour from the DB). Projections substitute the lobby colour into `profiles`; phones get `PlayerContext.color` and answer with `pickColor`.

### Category introduction
`state.intro = {roundIndex, step, auto, at}` (step -1 = round title card) is set by `startGame`/`setRound` when `rules.categoryIntro`, or by `startIntro`; `introNext`, `introSkip` and `selectClue` advance or end it. R5-12: `introPrev` (one step back, ignored on the title card), `introGoto {step}` (straight to a step, -1…n-1, out of range = error) and `introStopAuto`; Previous and a jump also switch auto mode off (the host takes over). Auto mode is paced by the GameManager (3.5 s per step); the pending step is keyed to the intro state it was scheduled for (game, round, step, `at`, auto) and is cleared/rescheduled whenever that key changes, so no stale automatic step can fire after Stop Auto, Previous or a jump. The TV derives the swipe direction from the previous and new step (forward: in from the right; back: in from the left), plays one `categoryIntro` sound per step change, and shows the current step without a swipe when it (re)connects. The host sees a live preview: `/board/preview?live=1` (the real TV components in a scaled 1280×720 iframe, fed the game over postMessage, sound off).

### Saved-game compatibility
`normalizeState` upgrades states loaded from SQLite (and undo snapshots) to the current shape; `normalizeRules` maps the legacy `earlyBuzzLockoutMs > 0` to the `lockout` rule.

### Timers
Server-authoritative `{durationMs, remainingMs, startedAt, running}`. Clients render using a
ping-estimated clock offset. The GameManager schedules `timerExpire`; buzz-timer expiry locks buzzers.

### Role projections
`projectState` builds `host` / `public` / `player` views. Public/player views never contain
unrevealed answers, host notes, Daily Wager locations, hidden Final wagers/answers, the event log
or undo data. Answers are removed on the server — not hidden with CSS.

## Persistence

- SQLite via Node's built-in `node:sqlite` (identical in Node 24 and Electron 44, no native rebuilds), WAL mode, foreign keys on, numbered migrations (`schema_migrations`).
- Every dispatch persists the game state (`games.state_json`, without events) and the touched events (`gameplay_events`) in **one transaction**.
- At game creation the board is snapshotted into the state and into `game_clues` (historical clue snapshots). At start and end, `game_competitors`, `game_participants` and `game_controller_assignments` are written.
- **Crash recovery**: the current game id is stored in settings; on startup the game is reloaded, running timers are paused and open buzzers are locked.
- Backup = `VACUUM INTO` download; restore = verified upload applied on next start (previous DB kept as `pre-restore-*.db`).

## Security

- Host: 6-digit pairing code shown only on the desktop app → long-lived host session token (sliding expiry). Loopback requests may obtain a host session (configurable: Settings → Advanced).
- Profiles: 4-digit PIN, scrypt (N=16384,r=8,p=1, 16-byte salt). 5 failures → 30 s lockout, doubling every 5 failures up to 15 min; per-IP sliding-window rate limiting; host-assisted reset revokes sessions.
- Sessions: random 256-bit bearer tokens; only SHA-256 hashes stored.
- WebSocket: every message zod-validated; host actions require a host session; controller input accepted only from trusted (host-token) clients; per-connection flood limits.
- Uploads: size limits, content sniffing via sharp/magic bytes, re-encoding to WebP, strict filename whitelist, path-traversal-safe media serving.
- QR codes contain only plain URLs.

## Networking

The server binds `0.0.0.0` on the first free port in 3000–3010. `/api/info` lists LAN IPv4
addresses (virtual adapters de-prioritised); the host can pick the interface used for QR codes.
The NSIS installer adds a Windows Firewall rule for private networks.

## Joy-Con input

See RESEARCH_NOTES.md. The desktop window reads Nintendo HID devices (vendor 0x057E) with WebHID,
switches them to the standard full input report (0x30), reads the Bluetooth MAC (subcommand 0x02)
for a stable controller id, and forwards button edges over the WebSocket. Electron grants WebHID
permission for Nintendo devices automatically.

## Client rendering notes (mobile)

- App shells use the `.app-screen` class (100dvh) with an internal `.scroll-area`; headers and footers pad with the safe-area insets.
- `Modal` and `Drawer` are bounded by the visible viewport, lock body scroll, and move focus only when they open.
- `lib/socket.ts` applies structural sharing (`replaceEqualDeep`) to every state message, so unchanged subtrees keep identity.
- Countdown text uses `useTimerSeconds` (one re-render per second); the TV timer bar is a Web Animation on `transform`.
