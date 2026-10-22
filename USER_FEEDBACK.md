# User Feedback — Round 1 (received 2026-10-12, session 2)

Permanent record of user-reported bugs and new requirements. Each item is tracked
individually in FEATURE_MATRIX.md (section "User feedback round 1") and must not be dropped.
Statuses here mirror the feature matrix.

**Confirmed working by the user (must stay working — regression-protected):**
Nintendo Switch Joy-Cons, Bluetooth controller connectivity, iPad host controller.
Also preserve: existing profiles, saved games, DB records, controller assignments, LAN
multiplayer, host/player synchronisation. Any migration must keep user data.

## Audit findings (root causes found in code, 2026-10-12)

| Ref | Finding | Where |
|---|---|---|
| AF1 | `Modal` is bottom-aligned with `max-h-[92vh]`. On iOS Safari `vh` = the *largest* viewport (toolbars hidden), so tall dialogs (profile creation, PIN pad) extend above the visible area → **top is cut off and unreachable**. | components/ui.tsx |
| AF2 | No `env(safe-area-inset-*)` padding on headers while `viewport-fit=cover` is set; full-height shells use `100%`/`100vh`. | index.html, JoinPage, HostPage, styles.css |
| AF3 | `Modal`'s focus effect depends on the (inline, new-every-render) `onClose` → re-runs on **every server broadcast**, re-focusing the first input → keyboard pops / scroll jumps on iPad & iPhone (major jitter source). | components/ui.tsx |
| AF4 | Infinite `box-shadow` keyframe (`pulse-ring`) on the phone buzzer and TV banner forces full repaints every frame on iOS. Timer bar animates `width` (layout) every 100 ms. Scoreboard uses Framer `layout` (measures on every render). | styles.css, PlayTab, BoardPage |
| AF5 | Every broadcast replaces the entire `game` object in the store → every subscribed component re-renders even when nothing it shows changed. | lib/socket.ts |
| AF6 | Early-buzz setting is a raw "ms" number hidden under *Advanced rules*; default 0 = off. Only one behaviour (short lockout). | host/RulesEditor.tsx, shared/game.ts |
| AF7 | Phones **cannot** buzz early: the phone button is disabled while buzzers are locked, so early-buzz rules only ever affected Joy-Cons/keyboards (inconsistent across devices). | join/PlayTab.tsx |
| AF8 | Buzzes after the buzz timer expired (or after everyone already tried) were classified as `early` and penalised. | engine.ts handleBuzz |
| AF9 | Temporary lockouts expire silently: no rebroadcast, so a phone could stay "Too early" / disabled until some unrelated state change. | gameManager / projection |
| AF10 | No feedback about early buzzes on host or TV. | Live.tsx, BoardPage |
| AF11 | No "answering period ended" state: when nobody buzzes, the host only sees **Skip clue →**; revealing then returning is not the guided path. | engine.ts, Live.tsx |
| AF12 | Full-screen clue shows category name and value; clue appears with a generic scale-from-centre animation; Grid is unmounted while a clue is open (no geometry to zoom from/to). | BoardPage.tsx |
| AF13 | Phone portal: bottom tab bar only, no URL routes (browser Back leaves the app), no leaderboard, no other players' profiles, history detail is a modal. | join/JoinPage.tsx |
| AF14 | Leaderboard API exists (wins/games/accuracy only, combined solo+team) but no player-facing page. | server/stats.ts |
| AF15 | (pre-existing, found while testing) integration tests log 3 unhandled "database is not open" errors: a broadcast scheduled with `setImmediate` runs after `close()`. | server/hub.ts |

## Requirements

Priority: P1 highest. Status values as in FEATURE_MATRIX.md.

### Priority 1 — Mobile & tablet interface

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-1.1 | Phone UI must not be cut off at the top (iPhone Safari, portrait + landscape, iPad). | Dialogs fit the *visible* viewport (`dvh`), are scrollable inside, header/close button always visible; app headers respect safe-area insets; full-height shells use `dvh` with `vh` fallback; Playwright screenshots at iPhone SE / 13 / 15 Pro Max portrait+landscape and iPad portrait+landscape show headers fully visible. |
| FB-1.2 | iPhone/iPad interfaces must feel smooth, not jittery. | No focus stealing on re-render; no infinite paint-heavy animations; timer bars animate with `transform`; unchanged state subtrees keep identity (no needless re-renders); no layout shifts from fixed bars; `-webkit-text-size-adjust` set; no artificial delays on buzz/timer paths. |
| FB-1.3 | Consistent navigation on phone, iPad and desktop. | Back arrow on sub-pages, hamburger/drawer with primary destinations, consistent page titles, current page highlighted, browser Back works (URL routes), keyboard accessible (Esc closes drawer, focusable items), no dead ends. Public board and active buzzer screen stay uncluttered. |

### Priority 2 — Player statistics & history on phones

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-2.1 | Leaderboard page. | Views: Solo, Team games, Team contributions — never mixed. Columns: games, wins, win %, average score, highest score, correct, accuracy, (contribution: net/earned). Clear "Ranked by …" selector; rate-based rankings require a minimum sample (shown). Respects profile privacy + host's leaderboard switch. |
| FB-2.2 | View other players' permitted profiles & stats. | Players list → player page with name, picture/avatar, colour, public solo/team stats, category performance, recent game results. Never exposes PIN, sessions, preferences, private settings or admin data. Private profiles show "This player keeps their statistics private". |
| FB-2.3 | Personal game history with detailed per-game view. | List shows title, date, mode, score, placement, winner. Detail page (own URL, Back works): participants, teams + historical members, final scores, winner, categories used, every clue the player buzzed on / answered (correct/incorrect, points ±, wagers). Built only from historical snapshots (board edits don't change it). |
| FB-2.4 | Mobile navigation links: My Profile, My Statistics, Leaderboard, Players, Game History, Current Game, Settings. | All reachable from the drawer on the phone portal. |

### Priority 3 — Early buzz-in penalties

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-3.1 | Early-buzz rules configurable before and during a game; changes apply to the next buzz without restart; past penalties never altered retroactively (except explicit host correction). | Rule options: **No penalty**, **Short lockout** (configurable ms), **Locked out for the rest of the clue**, **Lose points** (configurable amount, once per player per clue). Clear explanation in the UI. Editable from Setup, the Rules dialog and a quick control in the live clue panel. |
| FB-3.2 | Detection is server-side and consistent for Joy-Con, phone, keyboard, shared and individual team buzzers. | Early = buzz while the clue is showing and buzzers are not yet open for this answering opportunity. Not early: after time ran out / answering ended / already answered. Phones can press while locked (like physical buzzers). Lockouts keyed by the person (or the team for shared buzzers), not by the device. Client timestamps never used. |
| FB-3.3 | Feedback. | Host sees who buzzed early and the penalty; TV shows a subtle "early" marker on that player's score tile; phone says "Too early" (and remaining lockout / clue lockout). Lockout expiry triggers a state refresh. Point penalties appear in the event log and can be refunded by the host (audited). |

### Priority 4 — Classic game-show presentation (public board only)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-4.1 | Classic board appearance. | Deep-blue tiles separated by black grid lines, large white condensed uppercase categories, gold values with drop shadow, symmetrical layout, full-screen TV scaling, minimal chrome. Host/portal UIs keep their clean modern look. Original implementation; no copied assets/fonts. |
| FB-4.2 | Clue zoom (HIGH). | Selected tile expands from its measured on-screen position to full screen (FLIP: transform/opacity only), no flicker; reverse transition back to the tile on return; reduced-motion = simple fade; works at any resolution/aspect ratio; animation never blocks or changes authoritative state. |
| FB-4.3 | Full-screen clue presentation. | Question large, centred, uppercase, classic blue; **no category name and no value** on the question screen (host still sees both). |
| FB-4.4 | Subtle active-buzzer indicator. | Small, static edge/corner indicator (no large overlay, no flashing); accessible label; host keeps detailed status. |
| FB-4.5 | Category introduction per round. | Round title card, then categories one at a time with horizontal slide transitions, then the board. Host can start, advance, skip, replay; optional auto-advance. Works for any category count. Automatically offered at the start of each round (rule toggle). |

### Priority 5 — Unanswered clue flow

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-5.1 | When nobody answers correctly (timer expired / host ends answering / everyone tried), host gets **Reveal answer** → then **Return to board**. | Engine distinguishes: selected/presented (clue phase), buzzers open, answering ended, answer revealed, completed (clue_close with result answered/unanswered/skipped), back on board. No points change unless a rule says so. Skip remains as a secondary action. Double taps cannot complete twice or close the next clue. Incorrect-answer, wager and team flows unchanged. |

### Priority 6 — Overall presentation polish

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FB-6.1 | Cohesive TV presentation. | Shared timing constants; board fill-in after intro; clue open/close via zoom; answer reveal fade-up; score change highlight; compact buzz-winner banner; round transitions via intro; Final Wager screens and winner announcement in the same visual language; no excessive effects. |

### Engineering items

| ID | Item | Acceptance criteria |
|---|---|---|
| FB-E1 | Fix teardown race (AF15). | `npm test` shows no unhandled errors. |
| FB-E2 | Backward compatibility of saved games. | Saved `state_json` without the new fields loads and plays (rules normalised, missing state fields defaulted). Covered by a unit test. |

---

# User Feedback — Round 2 (received 2026-10-13, session 4)

Rollback point before this work: tag **v0.3.0** (Vitest 74/74, Playwright 12/12).
Must keep working: Windows app, TV board, iPad host, Joy-Cons, phone portal, profiles, teams,
local multiplayer, sync, scoring/buzzers, saved games and boards (backward compatible).

Statuses are tracked in FEATURE_MATRIX.md → "User feedback round 2".

| ID | Requirement (summary) | Pri | Acceptance criteria |
|---|---|---|---|
| R2-1 | **Startup flow**: landing page with **Create Lobby** (primary), Resume, Settings, Help — no lobby exposed before creation | P1 | App opens on a clean landing page; Create Lobby starts a lobby session, shows host QR + short temporary pairing code scoped to that lobby, and waits for a host |
| R2-2 | **Host pairing per lobby**: iPad scans QR → host controller; temporary code invalidated when the lobby closes | P1 | Pairing works only for the current lobby; old codes rejected; existing host sessions still reconnect |
| R2-3 | **Full host management UI on iPad** with the desktop navigation (Home, Boards, Players, Teams, Buzzers, History, Settings, Help), touch-optimised | P1 | Host never needs the PC to configure a game |
| R2-4 | **Host Home = game setup**: board, mode, solo/team, player limit, teams, buzzer/early-buzz rules, timers, wagers; configuration summary; **Open Lobby** (does not start play) | P1 | Settings editable before/after Open Lobby; summary accurate |
| R2-5 | **Open Lobby → full-screen public TV lobby**: title, board, mode, player count/limit, joined players (avatars, colours), teams, controller status (subtle), join QR + instructions; real-time | P1 | No private/device identifiers shown |
| R2-6 | **Host lobby controls**: change board/mode/rules/limit, assign Joy-Cons/controllers, move/remove players, connection status, leaderboard, stats, start game, close lobby, back to start; warn when a change invalidates assignments | P1 | — |
| R2-7 | **Synchronized public presentation**: host navigation can drive public TV pages (Leaderboard + metric + player stats, Boards preview, Players, Teams, Settings summary, Buzzers overview) | P1 | TV receives only explicit public presentation state, never host UI state |
| R2-8 | **Private View / Present on TV** toggle | P1 | Private browsing never changes the TV; auth/settings/sensitive pages never broadcast |
| R2-9 | **Compact lobby panel** while other pages are presented (QR, count, avatars, board, mode, controller readiness) + smooth full/compact transitions (shared element, transform/opacity, reduced motion) | P1 | No remounts or jumps; joining stays active |
| R2-10 | **Public navigation rail** (left, subtle, current page) + branding top-right | P2 | Presentation only; nobody touches the TV |
| R2-11 | **Return to start** from "Host on this computer" and anywhere; confirm before abandoning; saved state preserved | P1 | No restart needed |
| R2-12 | **Media-first clue layout**: larger images (contain, no distortion/cropping), image above text, combined composition centred, responsive (wide/tall/square, TV/phone), no layout shift; per-clue layout option (auto / media / balanced / text) | P1 | Screenshots at TV sizes show images using most of the screen |
| R2-13 | **Host media controls** (audio/video): play, pause, resume, restart, stop, mute; state/position/duration; TV is the playback device; synchronized; stops when the clue closes; reconnect-safe | P1 | No duplicate playback; no media left playing |
| R2-14 | **Separate clue media and answer media** (text, image, audio, video, caption each side); answer reveal crossfades to answer media and answer text; editor sections "Clue presentation" / "Answer reveal"; old boards unchanged | P1 | Wrong media never flashes |
| R2-15 | **Fix image captions** end to end (editor → save → export/import → render on TV/preview) | P1 | Caption visible in gameplay; survives save/export/import |
| R2-16 | **Automatic buzzer unlock**: game setting (off / all clues / media-only clues / per clue) + per-clue (game default / immediately / wait for host / after media starts / after media ends); via the authoritative engine; applies to subsequent clues | P1 | Default preserves current behaviour (off) |
| R2-17 | **Board and clue preview without a game** (library + editor): real presentation components; open clue, reveal answer (answer media), back, exit; no events/scores/stats | P1 | Preview never touches game state |
| R2-18 | **Replace emoji with a consistent minimalist vector icon set** across desktop, host, portal, settings, editor, menus | P2 | One icon style; accessible labels |
| R2-19 | **Boards page header alignment**: reusable page header; actions top-right with consistent padding; check other pages | P2 | — |
| R2-20 | **Import Buzzinga.io boards** from a share link where publicly/legitimately accessible; preview, missing-media report, duplicate detection, rollback; never bypass paywalls/auth/protections | P2 | Investigation documented in RESEARCH_NOTES.md; best supported import with stated limits |
| R2-21 | **Extensible importer architecture** (parse → normalise → media acquisition → validate → create) + Jeopardy-style structured data (JSON/CSV/datasets/user media folders); no unlicensed show content bundled | P2 | — |
| R2-22 | **Sound design**: configurable cues (startup, board intro, category intro, clue select, unlock, buzz, right, wrong, Daily Wager, Final, countdown, round end, winner); sound packs (default, alternative, custom import, muted), volumes; offline; no unauthorized copyrighted audio | P2 | — |
| R2-23 | **Classic board intro animation** (board/checker reveal before the category intro); settings: board intro / category intro on-off, speed, skip, replay; reduced motion; no flashing | P2 | — |
| R2-24 | **Buzzer unlock indicator styles**: top glow, bottom glow, status dot, edge accent, brief pulse, none; colour, intensity, duration, persist while unlocked, optional sound; reflects authoritative state | P2 | Never obscures the clue |
| R2-25 | UX consistency pass (padding, buttons, icons, transitions, responsive tablet/phone, Safari) | P3 | — |

Architecture requirement (R2-A): keep separate state for game, lobby, host navigation, public
presentation, profiles, controller assignments and media playback. The TV receives only
authorised public presentation data via explicit presentation state.

---

# User Feedback — Round 3 (received 2026-10-13, session 5)

Rollback point before this work: tag **v0.5.0** (Vitest 123/123, Playwright 23/23).
Must keep working: Joy-Con Bluetooth, iPad host, TV presentation, profiles, sync, team mode,
game rules, saved boards and history, lobby + host pairing.

Statuses are tracked in FEATURE_MATRIX.md → "User feedback round 3".

| ID | Requirement (summary) | Milestone | Acceptance criteria |
|---|---|---|---|
| R3-1 | **Media file picker filters**: image picker shows images, audio picker audio, video picker video; a combined button shows all supported media | A | No need to pick "All files"; accept lists match what the server actually validates/plays |
| R3-2 | **Show Leaderboard on TV** from the host leaderboard page (+ host navigation): change metric/category, select player/team → public stats; return the TV to lobby/previous page | A | Uses the existing presentation system; only existing statistics; host stays private |
| R3-3 | **Return to Lobby after a game** (primary) + Create New Lobby (secondary): keep lobby, players, profiles, teams, controller/Joy-Con/phone bindings, host pairing, settings, mode, board; reset only match state; results finalised first | A | Consecutive games in one lobby: scores reset, history/stats correct, assignments kept, no duplicates, no stale buzzes/state; disconnected devices stay members but show disconnected |
| R3-4 | **Settings on TV**: presenting Settings shows a read-only public settings summary (mode, board, limit, teams, buzzer/early-buzz rules, timers, wagers, auto-unlock…) updated live; no secrets/PINs/tokens/API keys; no controls | A | — |
| R3-5 | **Bot difficulty badge** on TV lobby, host lobby and bot dialog; updates immediately | A | Only implemented levels |
| R3-6 | **Lobby player cards with history**: picture, name, team, controller status, wins, games played, optional win % / streak | B | Solo vs team wins separated; refreshed after each game |
| R3-7 | **Crown**: reigning winner of the previous match in this lobby; separate subtle all-time wins leader; legend/tooltip; nothing when nobody qualifies | B | — |
| R3-8 | **Bot cards**: name, difficulty, status, bot stats if tracked; clearly bots | B | — |
| R3-9 | **Bots select clues** on their turn (difficulty-based strategy; never unavailable clues; same turn rules) | C | — |
| R3-10 | **Visible bot answers**: bot prepares an answer → host sees it (with difficulty, expected answer privately) → TV shows it → host judges; no automatic scoring | C | Submitted answer + judgment recorded in history |
| R3-11 | **Plausible wrong answers** related to clue/category; difficulty controls quality | C | No random strings / placeholders |
| R3-12 | **Bot timing** varies by difficulty (reaction, preparation, willingness) | C | — |
| R3-13 | **Awaiting host judgment**: once a bot submits, the answer timer stops and never auto-marks it wrong; human timers unchanged | C | — |
| R3-14 | **Optional AI bots** (external LLM): provider config in Settings (desk + host), API key stored securely (never in Git/WS/TV/phones/logs/exports), test connection, model choice, enable/disable, fallback, timeouts, request limits; backend-only requests; structured output validated | D | Game never blocks; offline play unaffected |
| R3-15 | **Windows builds**: installer + portable via existing electron-builder; verification script; artifacts at session end | E | Report what was/wasn't executed on Windows |
| R3-16 | **GitHub Releases** for major milestones only (semver, changelog: New Features / Improvements / Bug Fixes / Known Issues, installer + portable attached); optional GitHub Actions Windows workflow publishing only on version tags | E | Never move tags or overwrite releases |

---

# User Feedback — Round 4 (received 2026-10-14, session 6, reviewing v0.7.0)

Rollback point: tag **v0.7.0** (Vitest 139/139, Playwright 27/27). Must keep working: Joy-Con
Bluetooth, iPad host, profiles, sync, team mode, history, lobby persistence, board editing, media
clues, buzzer behaviour. User-provided assets in `new_sfx/` (git-ignored, not redistributed).
Statuses: FEATURE_MATRIX.md → "User feedback round 4".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R4-1 | **Jeopardy!/Buzzinga sound pack** from `new_sfx` as a 4th pack and the default for new users (Classic/Arcade/Soft kept; existing explicit choices kept); missing cues fall back; installable/importable locally; not in public releases unless redistribution rights exist; previews in Settings (desk + host) | D |
| R4-2 | **Final Jeopardy! redesign**: players submit their own wager + answer on their devices (team rule for teams); private until reveal (host sees status only); reveal one contestant at a time, lowest → highest pre-Final score (deterministic ties): contestant → wager → answer → host judges → next; score changes only on judgment; recovery entry kept separate | A |
| R4-3 | **Final Jeopardy! think music** during the answer-writing phase on the TV only, no duplicates, stops when answers close, not restarted on reconnect, synced with the timer | D |
| R4-4 | **Simplified clue controls**: one primary Unlock Buzzers; remove reset/lock/timer/skip from the main clue UI; incorrect → automatic re-unlock for others; no buzz → Reveal Answer → Return to Board; timers automatic; auto-unlock settings kept; recovery tools in a secondary menu | A |
| R4-5 | **Host clue readability**: clue dominant; answer in a smaller red "ANSWER" banner; iPad portrait + landscape | B |
| R4-6 | **Default unlock indicator = Bottom Glow**, mustard yellow, slightly thicker, smooth, no flashing; other styles kept; explicit user choices kept | D |
| R4-7 | **Rename** Daily Wager → **Daily Double!**, Final Wager → **Final Jeopardy!** in every user-facing label (internal ids unchanged) | A |
| R4-8 | **Lobby presentation**: compact lobby visually distinct; smaller, styled QR codes (rounded themed card, quiet zone, contrast kept) | B |
| R4-9 | **Navigation**: one shared order (Home, Boards, Players, Teams, Buzzers, Leaderboards, History, Settings, Help) for desk, host and TV; obvious **Show Leaderboards on TV** | B |
| R4-10 | **Media-only clues are valid** (text OR playable/displayable media) in editor, completeness, save/import validation, preview and gameplay | A |
| R4-11 | **Pre-lobby TV**: settings preview + board browsing on the TV before Open Lobby; no player QR / joining before the lobby opens; host pairing QR kept separate | C |
| R4-12 | **Lobby player cards**: centred avatars, tighter spacing | B |
| R4-13 | **Profile pictures**: one "Profile Picture" concept (Upload or Choose Default, circular previews); "Preferred Color"; distinct lobby colours (preferred if free, otherwise pick from free colours, race-safe, fallback palette); colour shown as a ring, no left strip | C |
| R4-14 | **Current picker highlight** (mustard ring on the score box) + slightly larger TV score boxes | B |
| R4-15 | **Host Options menu**: Next Round, Start Final Jeopardy!, Buzzers, Show QR move to a secondary menu; primary area shows only the current action; confirmations for disruptive actions | B |
| R4-16 | **Category introduction gates clue selection**: no clue can be opened before the round's categories are presented or skipped; host sees a dedicated intro screen | A |
| R4-17 | **TV typography**: clue text Korinna-style (bold, upper case, white, drop shadow); categories + dollar values Swiss 911 Compressed-style; licensed fonts pluggable later, free look-alikes now | D |
| R4-18 | **Clue background** like the classic TV blue (provided image evaluated; CSS recreation preferred for scaling/licensing) | D |
| R4-19 | **Board-fill animation synced with its sound** (one timeline from the audio duration; graceful without audio; no repeat on reconnect) | D |
| R4-20 | **Return to the existing lobby after a game** (primary), New Lobby secondary; keep lobby/join code/players/colours/phones/Joy-Cons/teams/bots/pairing/settings/board; reset only match state; ≥3 consecutive games tested | A |

# User Feedback — Round 5 (received 2026-10-15, session 7, reviewing v0.9.0)

Rollback point: tag **v0.9.0** (Vitest 166/166, Playwright 32/32). Must keep working: Joy-Con
Bluetooth, iPad hosting, profiles + statistics, persistent lobbies, phone buzzers, team play,
offline play, board editing, media clues, history, sync. IDs follow the sections of the request.
Statuses: FEATURE_MATRIX.md → "User feedback round 5".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R5-2 | **TV home screen** when no lobby is open (logo, subtitle, "Waiting for the host to open a lobby", 2–3 recent-game cards: board, date, winner, winning score, players; no categories, no setup controls); **host home** with the same content + **Create Lobby** + pick a recent game to show its details on the TV | B |
| R5-3 | **Active lobby** redesign: selected board, mode, players/teams, rules summary (early-buzz lockout, buzz time, answer time, Daily Double!/Final rules, think time, other rules; live; no secrets), QR at ~60 % size with a tight frame (quiet zone kept); board choices on the TV only while the host is choosing (lobby minimized), then back; minimized lobby shows teams | B |
| R5-4 | **No separate Setup Game screen**: Home → Create Lobby → lobby management (players, teams, rules, board, settings) → open joining → start; settings summary on the iPad with Customize Rules/Timers/Buzzers + Rules under it; player/team limits right under **Play As** (individual: max players; teams: number of teams + max per team) | B |
| R5-5 | **Team management**: default teams = ceil(players / 2); switching to teams keeps everyone in **Unassigned Players** + empty team slots; players pick/leave/switch teams on their phones; host drag-and-drop (touch) + tap alternative; `n / max Players` with over-capacity highlight blocking Start; empty teams excluded at start; unassigned players warning (continue allowed, not a team); team setup kept across Teams → Individuals → Teams; any member edits team name/colour (race-safe); team name prominent on buzz-in with "Buzzed by …" | C |
| R5-6 | **Final Jeopardy! visuals**: no "…"/✓ — green border = submitted, gray = not; swipe transition (with sound) into the reveal and between contestants, one per action, no overlaps | A (borders), F (swipes) |
| R5-7 | **Score changes**: +$400 green / −$400 red next to the score in the money font, slightly smaller; quicker, smoother pop (one system for clues, Daily Double!, Final) | F |
| R5-8 | **Consistent game typography** (buzz-in names, Final names, team names, reveal labels) | F |
| R5-9 | **Jeopardy!/Buzzinga pack works without picking files**: map `new_sfx` automatically, packaged correctly, tested in a packaged build; public releases only with redistribution rights → local import + fallbacks | A |
| R5-10 | **Winner**: better victory sound; **podium** (1st centre/tallest, 2nd left, 3rd right; name, picture/team identity, score, place; <3 adapts, >3 listed below; ties) | F |
| R5-11 | **Google Gemini** (official API, model list from the API, quotas/rate limits respected) + provider architecture; host settings: provider, key, model, test, save, enable bots; keys never leave the backend; offline fallback | G |
| R5-12 | **Category introduction**: live TV preview on the host, **Previous Category**, tap any category (one swipe in the right direction), **Stop Auto** (no stale timers) | E |
| R5-13 | **iPad board** = replica of the TV board (same aspect); remove "Tap a clue…" and "Picks Next"; heading "{Player} is choosing a clue" (team identity in team mode) | E |
| R5-14 | **iPad clue view**: answer banner (red, centred) + large clue (TV aspect) + compact footer; image answers → private lightbox; Unlock Buzzers bottom-right; compact timer; buzzed-in contestant + Correct/Incorrect side by side; Reveal Answer in the footer when no timer; More menu; Return to Board after correct/reveal | E |
| R5-15 | **Final Jeopardy! Undo** back into answering restarts the timer (synced, no stale timers, answers kept) | A |
| R5-16 | **Profile picture**: opening/choosing default pictures must not delete the upload; preview, cancel, confirm | A |
| R5-17 | **Phone lobby**: no buzzer before the game; profile choice with **I'm New** first; lobby view (players, teams, board, controller status, own profile, join/leave teams); view others' public stats; per-lobby **nickname** (not the profile name) shown as **Nickname** *(Profile name)* everywhere except the TV buzz-in; buzzer + team/teammates during play; back to the lobby view after the game | D |
| R5-18 | **Wager permissions**: no wager input or acceptance before the host opens wagering (Final and Daily Double!), also for direct WebSocket messages; closed after | A |
| R5-19 | **Final answer on phones**: after Submit show the answer read-only + **Change Answer** (editing = not ready on the TV); locked when answering ends; last submitted answer kept | A |
| R5-20 | **Daily Double! wager from the phone** of the picking player/team (validated, host sees it and reveals the clue; no change after lock; team conflicts prevented; host entry only as recovery) | A |

# User Feedback — Round 6 (received 2026-10-17, session 8, reviewing v0.10.0)

Rollback point: tag **v0.10.0** (Vitest 226/226, Playwright 38/38). Must keep working: Joy-Con
Bluetooth, phone buzzers, iPad hosting, profiles + statistics, team play, persistent lobbies,
board editing, media clues, sound packs, history, sync, offline play. IDs follow the sections of
the request. Statuses: FEATURE_MATRIX.md → "User feedback round 6".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R6-2.1 | iPad board preview: no player cards inside it (the bottom score bar stays); preview larger, TV aspect kept | D |
| R6-2.2 | iPad mustard highlight of the picking player fully visible (no clipping by padding/overflow), all iPad sizes/orientations | A |
| R6-2.3 | Category navigation order **Previous Category \| Next Category** | D |
| R6-2.4 | TV category text proportionally as large in its box as on the iPad (proportions, not pixels; long names still fit) | D |
| R6-3 | One highlight system: buzz-in highlight replaces the picker ring (no double outline); picker ring back after the clue; players and teams | A |
| R6-4 | No board-scatter sound when Final Jeopardy! begins (fix the cause; think music unchanged) | A |
| R6-5 | Score change: the score box temporarily shows **+$600** green / **−$600** red in the money font, centred, then the new total; no side bubbles anywhere (clues, Daily Double!, Final); same box size; rapid changes never overlap or show stale totals; authoritative score updates immediately | B |
| R6-6 | Final think timer at zero: timer leaves the TV, answers close, waiting-for-host state; host button **Begin Answer Reveals** → swipe + sound → contestants lowest → highest pre-Final score, each: contestant → wager → swipe to answer → judge → next | A |
| R6-7 | TV lobby player cards ~60 % of their size (picture, padding, stats, controller), text still readable; responsive grid | C |
| R6-8 | Minimized lobby = one cohesive panel (QR + status + info + count), top-right corner, main content reclaims the width | C |
| R6-9 | TV menu pages: primary content inside one consistent content panel; Boards 3 per row, Buzzers 2–3 columns, Players/Teams/Leaderboards responsive | C |
| R6-10 | Active lobby header: eyebrow **Board**, board name as title, metadata row (rounds • clues • Final Jeopardy!); separate board card removed | C |
| R6-11 | One right-hand panel: Game Rules summary + Join the Game (QR, short instructions, address) | C |
| R6-12 | In-game timer: no label beside it; at zero it disappears (all clue timers + Final); no auto-advance past host decisions | A |
| R6-13 | Player names never clip descenders (g j p q y) on lobby/player cards | A |
| R6-14 | Phone buzzer: full-section rounded rectangle; red = locked, yellow = unlocked, green = server-confirmed win; text labels; pointerdown, instant local press feedback, no repeats, no scroll/selection | B |
| R6-15 | Choppy TV category presentation: profile, find the real bottleneck, fix (60 fps goal), one directional swipe for jumps, no overlaps/stale timers, audio in sync, Stop Auto respected; record before/after measurements | E |
| R6-16…21 | Research buzzer fairness (BuzzIn.live, Buzzinga, other apps, multiplayer timing techniques), compare approaches A–E, write `docs/BUZZER_FAIRNESS_RESEARCH.md` | F |
| R6-22 | Implement fair server-authoritative timing: latency/jitter measurement, bounded compensation with validated timestamps, short arbitration window, Joy-Con path not compensated blindly, offline | F |
| R6-23 | Phones show how close it was (only to players who buzzed): "You buzzed in first!", "Alex buzzed 42 ms before you!", or "Very close buzz! Alex won." when uncertain; early-buzz info; colours kept | F |
| R6-24 | Simulations: 2/5/10 phones, latency, jitter, reordering, duplicates, early buzzes, forged timestamps, inflated latency, disconnects, Joy-Con vs phone; compare with arrival order (accuracy, bias, added delay, false early penalties) | F |

# User Feedback — Round 7 (received 2026-10-17, session 9, reviewing v0.11.0)

Rollback point: tag **v0.11.0** (Vitest 273/273, Playwright 41/41; already pushed and released —
verified via the GitHub API at the start of session 9). Visual references: the Wikimedia board SVG
(`Jeopardy!_game_board_US.svg`, measured in RESEARCH_NOTES.md "Board reference") and the owner's
images in `references/` (git-ignored: third-party screenshots). IDs follow the request's sections.
Statuses: FEATURE_MATRIX.md → "User feedback round 7".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R7-2 | TV menu pages: the minimized lobby must not push the page down; page header/subheader at the same height as on the Lobby page on every menu page; content uses the free width; no overlaps | C |
| R7-3 | TV lobby: long names never clipped (wider cards / 2 columns / wrapping / responsive type); nickname is the main name with the profile name *underneath*, smaller, gray, same family — everywhere the pair appears | C |
| R7-4 | TV lobby cards show the controller + measured latency ("Phone • 24 ms", "Joy-Con • Bluetooth"); smoothed, throttled, honest precision, unavailable/disconnected states; reuse the fair-timing clock-sync data; no effect on buzzing | C |
| R7-5 | Board colours, typography, spacing and shadows like the reference SVG (blue tiles, gold values, white categories, hard shadows — categories subtler than values); shared theme tokens; related yellow/blue accents follow; licensed fonts only | B |
| R7-6 | Board control shown by a sharp gold five-pointed star left of the picture in the score card (same yellow, name-height, name-like shadow), space always reserved (nothing shifts); buzz-in highlight kept and distinct; teams | B |
| R7-7 | Final Jeopardy! clue vertically centred in the whole presentation area | A |
| R7-8 | Correct/incorrect sounds when the host judges a **bot's** (and every) Final answer; once per judgment; current sound pack | A |
| R7-9 | Final reveal shows only the wager — no extra ±$ next to it; the one score-change animation is the score card's | A |
| R7-10 | Final category text: same font/size/position/shadow on "category only" and "Lock Wagers and Show Clue" (category-only screen is the reference) | A |
| R7-11 | Manual score adjustments are silent and unanimated (no sound, no ±$ swap; score simply changes); still synced, recorded and undoable | A |
| R7-12 | Final reveal verdict indicators: sharp vector green check / red X in the score-change colours | A |
| R7-13 | Clue zoom: clue text visible inside the expanding tile throughout; zoom ~1/0.85 × as long; smooth, audio in sync | B |
| R7-14 | Setting "Player colour on score cards": picture border (default, no top bar) / name / both; uses the lobby colour; saved; live on the TV | B |
| R7-15 | Full-screen clue text shadow = dollar-value shadow (shared token) | B |
| R7-16 | Full-screen clues vertically centred; revealing the answer never moves the clue; long clues shrink to fit (no overlap with the answer area); media layouts kept | B |
| R7-17 | Two coherent styling systems (gameplay; menus/lobby) with shared tokens/components | B, C |
| R7-18 | iPad home: nickname / profile name aligned in the new stacked style | D |
| R7-19 | iPad Safari + Home-Screen web app: no clipped navigation or off-screen buttons (Boards → Present on TV), dynamic viewport, safe areas, both orientations, laptop | A |
| R7-20 | iPad preview uses the same board/clue theme as the TV (tokens, not copies) | D |
| R7-21 | iPad game preview keeps one size/aspect/position in every state; controls and the bot's answer in compact overlays/reserved bars | D |
| R7-22 | iPad score editor like the references: editable score, − / + by the round's lowest value, green/red accumulated change, Save/Cancel, recent score changes with remove/reverse, Remove Player with confirmation | D |
| R7-23 | iPad board preview with square corners | D |
| R7-24 | iPad correct-answer banner like `references/host_controller_layout.png` (red striped band, small CORRECT ANSWER label over the response, clue font, white + shadow), overlaying the clue; host-only | D |
| R7-25 | iPad preview matches the TV (fonts, sizes, padding, shadows, media, proportions) via shared components/tokens | D |
| R7-26 | Board creator padding (portrait/landscape, consistent with other pages) | D |
| R7-27 | No "(AI)" suffix on AI board titles (metadata/tag instead; user-typed text untouched) | D |
| R7-28 | Phone theme editor (and every phone submenu) has a clear Back; browser back works; no dead ends | A |
| R7-29 | Phone buzzer keeps the same size/position in every state; status text in a reserved area | A |
| R7-30.1 | Buzzinga imports bring their images/audio/video (investigate why not; graceful failures; no broken references) | F |
| R7-30.2 | AI bots: verify AI answers are really used (diagnose pipeline); Gemini 503 resilience (bounded retries with backoff, timeouts, clear errors) | F |
| R7-30.3 | AI boards default to 2 rounds + Final Jeopardy!, validated; incomplete generation never saved as complete | F |
| R7-30.4 | Research sign-in-based AI connections (Claude, Gemini, ChatGPT) — official methods only; document feasibility | F |
| R7-30.5 | AI clue from a prompt in the editor (clue + answer, editable, no silent overwrite) | F |
| R7-31 | Developer tools (not in normal releases): buzzer fairness test with known offsets, latency, sync/perf diagnostics, exportable JSON report without secrets | E |
| R7-32 | Research Joy-Cons through Apple TV + Steam Link (separate controllers? buttons?); implement what is feasible, document limits and alternatives | G |

# User Feedback — Round 8 (received 2026-10-18, session 12, reviewing v0.12.0)

Rollback point: tag **v0.12.0** (published, 3 assets). IDs follow the request's sections. Also continue the
unfinished round-7 milestone F (R7-30.x). Statuses: FEATURE_MATRIX.md → "User feedback round 8".
Session rules for this round: commit + push after every stable sub-task; at every handoff update
SESSION_HANDOFF.md, PROGRESS.md and the two prompt files CONTINUE_PROMPT_SAME_COMPUTER.txt /
CONTINUE_PROMPT_OTHER_COMPUTER.txt (branch, latest commit, exact next task, open issues).

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R8-2 | Clue text must not flicker when a clue opens: find and fix the root cause (re-renders, font loading, transitions, state updates, layout); keep the reveal animation and timing | A |
| R8-3 | Host controller board preview matches the TV board's current styling (colours, borders, fonts, spacing, tiles); same aspect and layout; TV unchanged | A |
| R8-4 | Opening board fill: no dead pause at the end; the hand-off into the category reveal / introduction is continuous; sounds and timing intent kept | A |
| R8-5 | Final Jeopardy! answer text sized to fit its fixed box (shrinks, stays readable); never pushes the player name or "before Final Jeopardy!" over the category | A |
| R8-6.1 | Minimized lobby: shorter, with padding between it and the menu page's main container | B |
| R8-6.2 | Menu pages (not the lobby): main container rises to the padding under the page header; the minimized lobby fits that height on every page | B |
| R8-6.3 | Minimized lobby: no "Scan to join" text; the QR grows as large as the card allows (quiet zone kept, scannable) | B |
| R8-6.4 | Minimized lobby gets the same quick swipe/fade page-change animation as the other page elements | B |
| R8-7 | Shift+Enter line breaks in clues and answers kept and shown on host and TV (board editor and gameplay) | C |
| R8-8 | Bold / italic / underline in clues and answers (board editor), rendered on host and TV; sizing and readability kept | C |
| R8-9 | Category subheading (smaller second line under the category name): editable in the board editor, shown on the TV board and the host; long names handled | C |

# User Feedback — Round 9 (received 2026-10-18, session 13, after v0.13.0)

Release v0.13.0 first (full Playwright run), then the iPad Final Jeopardy! screen in the shared game frame, then a functional bug: Final Jeopardy! pictures and sounds.

| ID | Requirement | Milestone |
|---|---|---|
| R9-1 | Release v0.13.0 after one complete, green Playwright run (installer + portable, verified) | — |
| R9-5 | iPad Final Jeopardy! screen in the shared game frame; keep every `final-*` test id and the host workflow | A |
| R9-6.1 | Investigate why Final media does not show (saving, game state, projection, rendering, playback, sync) and fix the cause | A |
| R9-6.2 | Final clue pictures on the TV: image only, text only, image + text; large, aspect kept, balanced | A |
| R9-6.3 | Final correct-response pictures: image only, text only, image + text; hidden until the correct-response reveal; never shown as a contestant's answer | A |
| R9-6.4 | Final clue sound: audio only / + text / + image; host Play, Pause, Resume, Restart; works with the timer and think music; no restart on re-render, no overlapping copies, cleanup when the clue leaves | A |
| R9-6.5 | Final correct-response sound: silent and hidden until the correct-response reveal, then available (never automatic) | A |
| R9-6.6 | iPad: clue pictures in the preview, clue sound controls, the correct response's media privately, fixed preview, no layout shifts | A |
| R9-6.7 | TV: sizes, readable text, no overflow, balanced, smooth, nothing early | A |
| R9-6.8 | Keep wagers, timer, think music, answers, reveal order, judging, scores, bots, teams, results working | A |
| R9-6.9 | Board editor saves, reloads, edits and removes Final media; existing boards keep working | A |
| R9-6.10 | Regression tests (15 cases listed in the request) | A |

# User Feedback — Round 10 (received 2026-10-18, session 14, after testing the local 0.13.0 build)

The owner tested the local build (0.13.0 + round 9) on real hardware: **Final Jeopardy! clue and correct-response pictures and sounds — USER-VERIFIED ON REAL HARDWARE — PASS.** Don't reopen that system except for the items below.

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R10-2 | Board editor: preview the Final's category, clue and correct response as the TV shows them (text, picture, sound and combinations), sound play / pause / restart (one copy, stops on close), from unsaved editor values, no game needed, TV aspect kept, same components as the TV | D |
| R10-3 | Category subheading directly under the name as one group (board, introduction, Final, previews), centred, multi-line names, no negative-margin hack | A |
| R10-4 | Phone nickname editor stays visible above the on-screen keyboard (input, typed text, Save, Cancel); portrait and landscape | A |
| R10-5 | Final Jeopardy!: a modest gap between media and text (clue and correct response), shared value, no overlap | A |
| R10-6 | iPad: larger fixed-aspect TV preview; the score-card band becomes host controls; controls overlay the preview within its bounds; no iPad timer bar (TV unchanged); no layout shifts in any state; landscape/portrait/desktop | B |
| R10-7 | iPad answer banner: no "only you"; answer text in the label's typography; notes in the same style; inside the preview (no resize); uses its width before height; lightbox for long answers / notes; stripes reversed; private | C |
| R10-8 | TV: the revealed answer slightly closer under the clue (consistent gap, the clue does not move) | A |
| R10-9 | iPad: category and value compact inside the preview in the gameplay style (not added to the TV clue) | B |
| R10-10 | After a round's last clue, "Start Round 2" / "Start Final Jeopardy!" (or the end of the game) replaces Return to Board; no automatic advance; any round structure | A |
| R10-11 | Board editor: visual bold / italic / underline (no visible markup) for clues and answers (regular and Final); existing [b]/[i]/[u] boards keep working; safe; undo, paste, shortcuts; tests | D |

# User Feedback — Round 11 (received 2026-10-18, session 14, after v0.14.0)

Rollback point: tag **v0.14.0** (published, 3 assets). Statuses: FEATURE_MATRIX.md → "User feedback round 11".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R11-2 | Buzzinga import: a picture clue's accompanying text goes into the clue text field (not the image caption); image-only / text-only / audio / answer media / existing boards unchanged; tests incl. editor field and gameplay | A |
| R11-3 | Fullscreen host preview (Fullscreen API where available, a fullscreen-style layout otherwise; Exit, Esc): the blue presentation fits between the red answer band and the bottom controls at its own proportions (wider screens: more blue at the sides; narrower: scale uniformly, never crop); band and controls span the width; same fitting rules for the embedded preview; no state change when switching | B |
| R11-3.7 | Host controls vertically centred in the bottom band (fullscreen and normal) | A |
| R11-4 | Host sliding timer back, inside the bottom control band (synced with the TV; the TV timer unchanged; nothing moves) | A |
| R11-5 | No "buzzed in" card at the top of the host preview (the TV keeps it); the host still sees who buzzed | A |
| R11-6 | Only one buzz glow: remove the extra glow line above the timer (TV and host preview) | A |
| R11-7 | iPad web app: consistent app-like pages (no page opening a Safari context), standalone display mode, safe-area-correct header; the OfflineJeopardy title not under the status bar / Liquid Glass on Boards; one shared header | C |
| R11-9 | Final Jeopardy!: a setting for how answering closes — host closes answering (default) or automatically when the timer ends; Close Answer Submissions for the host; after time's up in manual mode submissions stay open; late submissions rejected after closing; status on phones and host; reveal flow unchanged | D |

# User Feedback — Round 12 (received 2026-10-19, session 15, after v0.15.0; first session on this computer, DESKTOP-6HN0OQ4)

Rollback point: tag **v0.15.0** (published). References (git-ignored, copy by hand): `references/0.15.0 host fullscreen board improved.png`, `… clue improved.png`, `… menu open example.png`, `topedge_fadeoff_example.png`. Statuses: FEATURE_MATRIX.md → "User feedback round 12".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R12-1 | Multi-computer development lock on GitHub: atomic acquisition, heartbeat + expiry, fencing, safe recovery, fail closed offline, release, docs, tests; permanent workflow (CLAUDE.md §36, DEVELOPMENT_LOCK.md) | 0 |
| R12-3.1 | Host full screen: no white border / margins / scrollbars; blue to the screen edges | A |
| R12-3.2 | TV presentation fills the full screen at its own proportions (more blue on wide screens, never cropped) | A |
| R12-3.3 | Layout as in the references: hamburger top-left, Options + minimise top-right on the blue, full-width message / answer bar, control band (status left, More + main action right), centred score cards, Undo bottom-right | B |
| R12-4 | Full-screen pop-out menu: the host navigation slides over from the left (game not resized), "‹" to close, touch / mouse / keyboard (Esc), safe areas | B |
| R12-5 | Restyled host buttons (theme, pressed / disabled states, touch size); Fullscreen / minimise placed as in the references; switching never resets the game | B |
| R12-6 | Upper message bar redesigned: answer banner (correct-response label + prominent answer, category, value, notes, long answers) and "X is choosing a clue" in one design; nothing private reaches the TV | B |
| R12-7 | Host score cards centred as a group, restyled, any number of players / teams / bots, no clipping | B |
| R12-8 | Reveal Answer in the Unlock Buzzers button's place while the clue timer runs (existing reveal path, valid states only) | B |
| R12-9 | iPad web app: nothing essential under the faded top edge (status-bar blur) on every host page, full screen and menus | C |
| R12-10 | Category subheading text at ~65 % of its current size, still right under the name, everywhere it is shown | C |
| R12-11 | Play as Guest: nickname only, no profile / PIN, rename in the lobby, normal play, reconnection without predictable ids, no persistent profile | D |
| R12-12 | Lobby Test Buzzer on phones: the player's lobby card glows yellow ~1 s for everyone; no gameplay effect | E |
| R12-13 | Wi-Fi name (auto) and password (auto where Windows allows without admin, else typed by the host) near the lobby QR; host-controlled visibility, masked by default, never logged or stored in plaintext | F |

# User Feedback — Round 13 (received 2026-10-20, session 16, after playtesting v0.16.0; DESKTOP-6HN0OQ4)

Rollback point: tag **v0.16.0** (published). Statuses: FEATURE_MATRIX.md → "User feedback round 13".

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R13-1 | Host TV preview as large as possible: in landscape full screen edge to edge horizontally, no black / white border, no side margins; the TV's aspect ratio kept (never stretched or cropped); the surrounding strips (answer strip, menu / Options / minimise strip, button band) thinner, gaps removed; any unavoidable limit documented | A |
| R13-2 | Full screen and embedded use one layout (embedded = a smaller version of full screen); the Fullscreen / minimise button never jumps; no awkward gaps; switching never resets clue, timer, buzzers, media, scores, answer visibility, menu | A |
| R13-3 | Portrait / other screen shapes: a deliberate strategy — content never squished; landscape keeps the TV's aspect ratio; proportional inner padding; media rules unchanged; the public TV unchanged | A |
| R13-4 | Embedded mode: remove the white bar between the button row and the score cards (fix the cause) | B |
| R13-5 | Score cards larger, using the space under them; the player colour as a ring around the picture instead of the bottom strip; 2 … 15 players; active / buzz highlights kept | B |
| R13-6 | Larger text: "Read the clue, then unlock the buzzers"; answer strip category / Correct Response label / answer / value (while the strip gets thinner); "Introduce the Category" about as prominent as "[Player] is choosing" | B, C |
| R13-7 | Category introduction: the clickable categories move into the header (replacing the redundant "[Category] — Category 1 of 6"), current one identifiable, no horizontal scrolling | C |
| R13-8 | Colour harmony of the full screen (the awkward blue area above the red strip), the same principles in embedded mode; consistent button / icon styling (no needless boxes, e.g. the menu icon), shared design tokens | B |
| R13-9 | TV lobby: Wi-Fi network / password move to where "or open [join URL]" was, labelled "Network:" / "Password:", room for long values, host visibility rules kept; the join URL moves under "Scan to Join", centred and sized to the QR code's width | D |
| R13-10 | Pregame iPad host lobby: players, controllers, Wi-Fi, More Options and the main actions without scrolling (iPad landscape, up to 15 players / controllers), readable and touch-friendly | D |
| R13-11 | Compact connected-controller display (identity, status, assigned player, battery where known, assignment, actions) | D |
| R13-12 | Home screen Buzzers tab without scrolling (up to 15 players / controllers, iPad landscape) | D |
| R13-13 | Host preview animations as on the TV: board-to-clue zoom, opening board fill — shared with the TV, never restarted by a mode switch or a late / reconnecting preview | E |

# User Feedback — Round 14 (received 2026-10-20, session 17, after playtesting the unreleased round-13 build on real hardware; DESKTOP-6HN0OQ4)

Rollback point: tag **v0.16.0** (published). Statuses: FEATURE_MATRIX.md → "User feedback round 14". The owner will test a 0.17.0 release candidate on real hardware before the release is published.

**Verified by the owner on real hardware (keep):** the host preview reaches the screen edges (embedded + full screen, landscape + portrait); the lobby Buzzers tab.

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R14-1 | At most 12 competing entries (12 players solo, 12 teams in team mode — team members not limited to 12): lobby, host, TV, joining, guests, bots, teams, game start; clear feedback at the limit; nobody removed; older games with more stay readable | A |
| R14-2 | Host score cards: section height independent of the player count (12 ≈ 3), one row of 12 or two rows of 6, narrower cards first; never clipped top / bottom, no overlap; colour ring + active / buzz indicators kept; 1/3/6/9/12 × embedded / full screen × portrait / landscape | A |
| R14-3 | TV score never leaves its card: score font size fixed at game start from the card width and the widest possible score (currency, at least 6 digits, negative; more digits when the game's values can exceed it — Daily Doubles, Final, custom values, teams); same principle on the host cards | A |
| R14-4 | Host lobby: bot difficulty selector overlaps the "Computer opponent" label — fix the cause | A |
| R14-5 | Automatic Wi-Fi name and password (admin allowed): supported Windows methods; Ethernet / hotspot / open / several adapters / not retrievable; explicit host-approved elevation only for the password, never the whole app; manual fallback with the reason; password never shown publicly without the host, never logged / committed / stored needlessly | D |
| R14-6 | Host preview: the blue strips above / below the picture and the picture's border take the clue background during clues (clue, picture / sound clue, Daily Double, answer, Final); black stays on the board; from the real presentation state | B |
| R14-7 | No "buzzers open" bottom glow on the host preview (the TV keeps it) | B |
| R14-8 | "Correct Response" and the answer centred on the whole width (not between uneven neighbours) | B |
| R14-9 | Embedded mode uses the full-screen Options menu (menu actions + Pause in Options), same centred overlay | B |
| R14-10 | iPad full screen: the status-bar area matches the blue header where iPadOS allows (no extra strip in embedded mode; no false claims) | B |
| R14-11 | Windows startup splash (styled name, status text from the real start-up stages, loading bar, errors, closes when ready) + investigate the ~30 s start | E |
| R14-12 | Bot answer error "The value of "delay" is out of range … Received 6398.400000000001" → the bot passes; fix the delay calculation (integer, bounds) | A |
| R14-13 | Clue picture flashes on the TV and the host preview when the answer is revealed | A |
| R14-14 | Full-screen hamburger menu slides closed (reverse of opening) | B |
| R14-15 | Final Jeopardy!: no "Final Jeopardy (Category)" text in the footer; footer keeps its height | C |
| R14-16 | Final Jeopardy!: no category / "Final Jeopardy" in the red banner | C |
| R14-17 | Final Jeopardy!: the clue / wager panel replaced by a **Preview Clue** button (left of Open / Lock Wagers) → centred lightbox with the clue text only in the TV clue style; nothing changes on the TV | C |
| R14-18 | Final Jeopardy!: host player bubbles like the TV's (green submitted / grey not); tap → set / edit that player's wager and answer (same validation, phase rules, privacy) | C |
| R14-19 | Final Jeopardy!: category name ≈ 80 % and closer to "Final Jeopardy!" after the category reveal (TV + host) | C |
| R14-20 | Final Jeopardy!: no ✓ / ✗ in the TV bubbles; outline colours green correct / red incorrect / yellow revealing / grey not yet | C |
| R14-21 | Final results: no colour strip on top of the boxes; names styled like the TV score cards | C |
| R14-22 | Final results: no "Correct Response" label (the answer stays) | C |
| R14-23 | Red host banner: answer ≈ 80 %; value = category size; "Correct Response" ≈ category size | B |
| R14-24 | Red host banner: value ↔ Options gap = category ↔ menu gap | B |
| R14-25 | Host footer: larger primary actions (Return to Board, Unlock, Reveal, More…), Undo secondary; no clipping of score cards / preview | B |
| R14-26 | TV lobby: "or open" centred above the join address, both centred on the QR | D |
| R14-27 | Lobby player cards: streak text clipped (references/lobby_player_cutoff.png) | D |
| R14-28 | Players page profile editor: no nickname field (keep the data) | D |
| R14-29 | Lobby player cards: tap → change the lobby nickname (used everywhere in the game) / view profile / edit profile; guests: nickname only | D |

# User Feedback — Round 15 (received 2026-10-21, session 18, after testing the 0.17.0-rc.1 release candidate on real hardware; DESKTOP-6HN0OQ4)

Rollback point: tag **v0.16.0** (published); the tested candidate is commit 12bbb04 (0.17.0-rc.1, not published). Statuses: FEATURE_MATRIX.md → "User feedback round 15". The owner tests the next candidate (0.17.0-rc.2) before v0.17.0 is published.

## Real-hardware results of 0.17.0-rc.1 (reported by the owner — not automatic results)

| Area | Feature | Owner's result |
|---|---|---|
| iPad host | Embedded host controller | WORKING |
| iPad host | Full-screen host controller | WORKING |
| iPad host | Landscape / portrait layouts | WORKING |
| iPad host | Player score cards, 1 … 12 players | PARTIALLY BROKEN — clipped at the top and bottom, even with 3 players (also 9 and 12) → R15-11 |
| iPad host | Centred correct response | FIXED |
| iPad host | Options menu | FIXED |
| iPad host | Menu slide-out | FIXED |
| iPad host | iOS status-bar colour | NOT WORKING (K55) → R15-31 |
| TV | Automatic score sizing | FIXED |
| TV | Final Jeopardy! player bubbles / outline colours / results | FIXED |
| TV | Lobby "or open" position | FIXED |
| Final | Host enters a player's wager and answer by tapping the bubble (phone could not submit) | WORKING |
| Bots | AI-provider bots answer without the "delay" error | WORKING |
| Picture clue | No flash when the answer is revealed | FIXED |
| Wi-Fi | Automatic Wi-Fi credentials / administrator approval | NOT VERIFIED (the PC was on Ethernet) — K48 |
| Wi-Fi | Mobile Hotspot | NOT TESTED — K48 |
| Windows | Installer start-up, portable start-up, splash, time to window | WORKING (K56 start-up improvements verified) |
| Controllers | Joy-Cons, phone buzzers | WORKING |

## New requests (the round-15 prompt's items 4 … 32; IDs follow the item numbers)

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R15-4 | TV lobby: a nickname must not change the grid (3 columns → 2, back at ~11); same card size with or without nicknames, 1 … 12 players | B |
| R15-5 | TV lobby: the Games / Wins / Streak line has one size and style with or without a nickname | B |
| R15-6 | TV lobby test-buzz glow: follows the card's rounded corners, subtler, from behind the card, ~0.4–0.6 s | B |
| R15-7 | TV lobby: changing a nickname must not move, shuffle or flash any card (stable identity, not the nickname) | B |
| R15-8 | Phone Test Buzzer: a visible back arrow to the lobby (nothing lost: profile, nickname, lobby) | B |
| R15-9 | Phone buzzer screen: remove the white box edge showing under the header near the picture (find the real element) | B |
| R15-10 | Host board: "[Player] is choosing a clue" and "Round 1 — n clues left" centred on the whole header | A |
| R15-11 | **Critical:** host score cards clipped top / bottom on the real iPad with 3, 9 and 12 players — root cause, 1/3/6/9/12 × embedded / full screen × landscape / portrait, stable section height, readable cards | A |
| R15-12 | Host score cards: no white cards — navy, integrated with the host design; keep the colour ring; no colour strip | A |
| R15-13 | Thin artifacts: a darker bar at the bottom of the red banner (clue), a light bar under the navy banner (board) | A |
| R15-14 | Embedded preview: the fill above / below matches the clue background during clues (Daily Double, picture, sound, answer, Final); the board keeps its black | E |
| R15-15 | The fill changes together with the clue zoom (no abrupt colour switch before the zoom) | E |
| R15-16 | (Low) the fill continues the clue background's grain / gradient, not a flat colour | E |
| R15-17 | Red banner shows "Daily…" — show "Daily Double" whole | C |
| R15-18 | Daily Double!: the host starts the wager timer (not automatically when the clue is chosen) | C |
| R15-19 | Preview Clue lightbox: as tall as the TV preview, centred; a minimal × (transparent, no border, accessible target) | C |
| R15-20 | Daily Double!: Preview Clue (host only; never locks, times, scores, advances or shows anything publicly) | C |
| R15-21 | Daily Double!: no wager card over the preview — who wagers, the wager, host entry and **Lock Wager & Show Clue** (in Unlock Buzzers' place) in the band | C |
| R15-22 | Red banner: value ↔ Options gap = category ↔ menu gap (also Daily Double!) | A |
| R15-23 | The sliding timer sits above the band, not in its top padding; nothing moves when it appears | A |
| R15-24 | Final: the category keeps its size and place from the category reveal to the wagering screen | D |
| R15-25 | Final: "Enter your wagers now" under the category (category-introduction subheading style), fading in with the bubbles | D |
| R15-26 | Final reveals: only the contestant's part (picture, score before, wager / answer box) swipes; heading, category, bubbles stay | D |
| R15-27 | Final reveals: the category as on the Final clue screen (size, place, spacing, style) | D |
| R15-28 | Bot answer directly under the middle of the red banner, distinct from the official response | F |
| R15-29 | Bot's chosen tile outlined for about a second before the zoom (the right tile, synchronised, no duplicate animation) | F |
| R15-30 | Flicker / shaking when zooming (host, menus, other screens; TV-preview text) — find and fix the cause, keep zoom available | G |
| R15-31 | iOS status bar white in full screen (K55) — supported iPadOS behaviour, closest reliable result, document limits | G |
| R15-32 | One cohesive host design (minimal boxes, shared rules) | all |

# User Feedback — Round 16 (received 2026-10-21, session 19, after testing the 0.17.0-rc.2 release candidate on real hardware; DESKTOP-6HN0OQ4)

The owner's prompt calls the tested build "0.17.1-rc.2"; the repository's last candidate is **0.17.0-rc.2** (commit 56acd72, built in session 18 — no 0.17.1 exists), so that is the build these results are for. The next candidate is 0.17.0-rc.3. Rollback point: tag **v0.16.0** (published). Statuses: FEATURE_MATRIX.md → "User feedback round 16".

## Real-hardware results of 0.17.0-rc.2 (reported by the owner — not automatic results)

| Area | Feature | Owner's result |
|---|---|---|
| iPad host | Embedded / full-screen host controller, landscape and portrait | WORKING |
| iPad host | Score cards with 1, 3, 9 and 12 players (R15-11) | FIXED — keep the layout |
| iPad host | Navy player score cards (R15-12) | FIXED — the owner likes them |
| iPad host | Centred "[Player] is choosing a clue" (R15-10) | FIXED |
| iPad host | Thin lines under the host banners (R15-13) | FIXED |
| iPad host | Clue value spacing beside Options (R15-22) | FIXED |
| iPad host | Sliding timer above the footer (R15-23) | FIXED |
| iPad host | iOS status bar (K55, R15-31) | NOT IMPLEMENTED CORRECTLY — the navy strip / gradient and the downward shift are rejected → R16-15, R16-16 |
| Daily Double! | Host starts the wager timer; Preview Clue; host enters a wager; Lock Wager & Show Clue; phone wager | WORKING (the sequence is changed on request → R16-7, R16-8) |
| Final | Category stays put into wagering (R15-24) | FIXED |
| Final | "Enter your wagers now" | WORKING (moved on request → R16-11) |
| Final | Only the contestant's elements move during reveals (R15-26) | PARTIALLY WORKING — they disappear before the screen edge → R16-13 |
| Bots | Chosen tile outlined before the zoom (R15-29) | WORKING (restyled on request → R16-14) |
| Bots | Bot answer under the host's answer banner (R15-28) | WORKING |
| Bots | Bot wagering | BROKEN (newly reported) → R16-9 |
| Zoom | iPad pinch zoom without jumping / flicker (K60, R15-30) | FIXED |
| Preview | Host preview background during the clue zoom (R15-14 … R15-16) | PARTIALLY WORKING → R16-17 … R16-19 |
| Wi-Fi | Wi-Fi credentials / Mobile Hotspot (K48) | NOT TESTED |
| TV lobby / phone | Lobby columns with nicknames, no shuffling, test-buzz glow, phone Test Buzzer back arrow (R15-4 … R15-8) | NOT REPORTED — still to be confirmed |

Previously verified and to be kept: TV score fitting, 12 entries, centred answer, Options, menu slide-out, Final bubbles and results, host Final entry, AI bot timing, picture reveals without a flash, Windows splash / installer / portable, Joy-Cons, phone buzzers, offline multiplayer.

## New requests (the round-16 prompt's items; IDs follow the item numbers)

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R16-4 | **Critical:** the phone's nickname sheet must stay above the on-screen keyboard (input, Save / Cancel visible; no jump under the keyboard) | A |
| R16-5 | **Critical:** iPad lobby Wi-Fi name / password above the keyboard in landscape, whether the left column was scrolled or not; no manual scrolling, no arbitrary padding | A |
| R16-6 | Every text field of the app above the keyboard (one shared solution, no new zoom flicker) | A |
| R16-7 | Daily Double!: wagering locked until the host presses the green **Unlock Wager** (main action), which starts the wager timer; then **Lock Wager & Show Clue** (enabled once a wager is in) | B |
| R16-8 | A wager (phone, host entry, bot) stops the wager timer; the clue is still shown only by the host; time running out invents nothing | B |
| R16-9 | Bots wager again (Daily Double! after the host's unlock, Final), legally, by difficulty | B |
| R16-10 | "Daily Double" in the red banner in the category's size, whole, beside Options | B |
| R16-11 | Final: "Enter your wagers now" above the player bubbles (not under the category), category unmoved | C |
| R16-12 | TV: "[Player] is wagering…" lower, in the clue text's area, away from the category (the line is on the TV's Daily Double! screen — the Final shows no such line) | C |
| R16-13 | Final reveals: the contestant's part swipes to the screen's edges (it vanished early, clipped by a container) | C |
| R16-14 | Bot's chosen tile: a glow like the lobby's test-buzz glow, from behind, square corners; two short blinks, a longer third, then the zoom; reduced motion respected | D |
| R16-15 | Status bar: remove the rc.2 gradient / navy strip and the downward shift; back to rc.1's plain white bar | E |
| R16-16 | Status bar: research a supported way to a blue bar; only if reliable; keep K55 open | E |
| R16-17 | Preview: the blue above / below the clue continues the clue background (colour, gradient, grain) — one surface | F |
| R16-18 | Preview: no thin black lines between the picture and the blue around it | F |
| R16-19 | Preview: the blue around the picture zooms with the clue (it filled in before the clue reached the edges) | F |
| R16-20 | Keep everything verified so far (score cards, navy cards, K60, …) | all |

# User Feedback — Round 17 (received 2026-10-21, session 20, after testing the 0.17.0-rc.3 release candidate on real hardware; DESKTOP-6HN0OQ4)

The owner tested **0.17.0-rc.3** (commit 488c909; the prompt also mentions an earlier "0.17.1-rc.2" — no 0.17.1 exists, see round 16). The next candidate is **0.17.0-rc.4**. Rollback point: tag **v0.16.0** (published). Statuses: FEATURE_MATRIX.md → "User feedback round 17".

## Real-hardware results of 0.17.0-rc.3 (reported by the owner — not automatic results)

| Area | Feature | Owner's result |
|---|---|---|
| Phone (iPhone 17 Pro, iOS 26) | Nickname field and Save / Cancel above the keyboard — portrait, landscape, Safari, Home Screen app (R16-4) | FIXED — keep it |
| Phone | Daily Double! wager Submit above the keyboard | BROKEN → R17-6 |
| Phone | Final Jeopardy! wager Submit above the keyboard | BROKEN → R17-6 |
| Phone | Final Jeopardy! answer Submit above the keyboard | BROKEN → R17-6 |
| Phone | Test Buzzer back arrow (R15-8) | FIXED |
| iPad host | Embedded / full screen, landscape / portrait; score-card sizing; navy cards; centred board status; no banner lines; value beside Options; sliding timer | WORKING / FIXED |
| iPad host | Lobby Wi-Fi name / password above the keyboard (R16-5): with the left column scrolled a little, tapping the field makes the column jump to its top and the field sinks under the keyboard; other low fields too | NOT FIXED → R17-5 |
| iPad host | Preview blue fill / zoom synchronisation (R16-17 … R16-19) | NOT FIXED → R17-17 |
| iPad host | Preview edge / border during clues | reported fixed by the previous session; not explicitly confirmed by the owner |
| iPad host | Status bar (K55): currently plain white | NOT FIXED (blue wanted) → R17-16 |
| Daily Double! | Locked at first, phone told to wait, green Unlock Wager, wager timer, phone / host / bot wager stops it, Lock Wager & Show Clue, banner typography | WORKING / FIXED |
| Daily Double! | Answer timer starting by itself when the clue shows | NEEDS CHANGE → R17-1 |
| Bots | Daily Double! and Final wagering; selected-tile glow (two blinks + longer hold) | FIXED / WORKING — keep the timing |
| Final | "Enter your wagers now" above the bubbles; full-width contestant swipe; heading elements stationary | FIXED / WORKING |
| Final | TV answer / results screen styling | NEEDS REDESIGN → R17-11 |
| TV lobby | Nickname cards, stable columns, no shuffling, test-buzz glow | WORKING / FIXED |
| Zoom | iPad pinch zoom (K60) | FIXED — keep it |
| Wi-Fi | Wi-Fi PC / Mobile Hotspot (K48) | NOT TESTED |

## New requests (the round-17 prompt's parts 3 … 11)

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R17-1 | Daily Double!: Lock Wager & Show Clue shows the clue with the answer timer **stopped**; a large green **Start Timer** starts it (once); then Correct / Incorrect. Wager timer and answer timer are separate phases | A |
| R17-2 | New game setting **Daily Double! wager entry**: **Host enters the wager (default)** / Player enters it on their device. Host entry: a wager field in the band (no dialog over the preview); the phone says the host enters it and cannot send one; bots still wager by themselves; the host reveals the clue. Player entry: the rc.3 workflow (Unlock Wager …) plus Start Timer. Not for the Final | A |
| R17-3 | The band's wager field: touch-friendly, readable, stable, above the keyboard; no resizing of the TV preview, score cards not covered | A |
| R17-5 | **Critical:** iPad lobby Wi-Fi fields (and other low fields) stay visible with the keyboard — find why the column jumps to its top; keep / restore the scroll position; reusable, no arbitrary padding | B |
| R17-6 | iPhone: Daily Double! wager, Final wager and Final answer — field and Submit visible above the keyboard, portrait and landscape, without dismissing the keyboard | B |
| R17-7 | Audit every text field (nickname, Wi-Fi, wagers, Final answer, board editor, profiles, settings, dialogs); keep the nickname fix and K60 | B |
| R17-11 | Redesign the TV's Final Jeopardy! answer / results screen: less crowded, clear hierarchy, player answers in the score cards' visual language; keep the reveal order, swipes, stationary heading / category / bubbles, judgments, scoring, outlines, host entry; up to 12 entries | D |
| R17-12 | TV: "[Player] is wagering…" vertically centred between the category's bottom and the clue area's bottom | E |
| R17-13 | Host lobby: bot difficulty "Medium" clipped — every difficulty label whole, badge compact | E |
| R17-14 | Host Settings in tabs (Gameplay, Players & Controllers, Presentation, Network, Data & Storage, Advanced — from the real settings); no setting lost; each tab without scrolling on an iPad in landscape; minimal, consistent design | C |
| R17-15 | **Game Data Location** in Data & Storage: show the folder; Change Location (Windows folder picker, safe migration, restart when needed), Open Folder, Restore Default Location; bootstrap file outside the data folder; never delete data before a verified copy; missing / read-only / unplugged folders handled | C |
| R17-16 | Status bar (K55): investigate `black-translucent` with safe-area handling for a real blue bar; keep the plain white fallback if unreliable; never the rejected gradient; document whether the Home Screen icon must be re-added; K55 stays open until the owner confirms | F |
| R17-17 | Preview fill: one rendering approach instead of two timed animations (clue + bars); one background coordinate system | F |
| R17-17.3–17.4 | Category introduction: the blue fill around it in the embedded preview; edge to edge (no black border) in full screen | F |
| R17-17.5–17.6 | Category introduction controls: **Next Category** dominant, Previous Category secondary right beside it, Auto Present and **Skip Category Presentation** small but visible (not in a menu); no overlapping swipes | F |
| R17-20 | Keep everything verified so far | all |

# User Feedback — Round 18 (received 2026-10-22, session 21, after testing the 0.17.0-rc.4 release candidate on real hardware; DESKTOP-6HN0OQ4)

The owner tested **0.17.0-rc.4** (commit 0812c70 / handoff 4ccfcd7 — nothing was committed after it). The next candidate is **0.17.0-rc.5**. Rollback point: tag **v0.16.0** (published). Statuses: FEATURE_MATRIX.md → "User feedback round 18".

## Real-hardware results of 0.17.0-rc.4 (reported by the owner — not automatic results)

| Area | Feature | Owner's result |
|---|---|---|
| Daily Double! | Default host entry: wager typed in the band, field and Set reachable, TV preview keeps its size, Lock Wager & Show Clue, clue with the answer time stopped, green Start Timer, then Correct / Incorrect (R17-1 … R17-3) | VERIFIED WORKING — keep the state machine |
| Daily Double! | Player entry (Settings → Gameplay → Daily Double! wager entry): Unlock Wager, wager timer, phone wager, host reveals, host-started answer timer | VERIFIED WORKING |
| Daily Double! | The band in embedded mode grows upwards | NEW ISSUE → R18-2 |
| iPhone | Keyboard: Daily Double! wager, Final wager, Final answer — Submit visible and tappable, portrait + landscape, Safari + Home Screen app (R17-6) | FIXED — keep it |
| iPad host | Lobby Wi-Fi name / password: the field starts above the keyboard, then while typing drops under it, comes back, drops again; switching fields does it too; sometimes it stays under the keyboard until the host leaves the page or scrolls (R17-5) | **NOT FIXED** → R18-1. Diagnostics photo: `references/keyboard_diagnostics.png` |
| Settings | Tabs; Data & Storage | MOSTLY WORKING — Players & Bots still scrolls to Limits / Fallback, more when expanded → R18-7 |
| Final | Contestant answer cards, answer placement, before-Final score + wager, green / red outline, results with the usual player count (R17-11) | VERIFIED WORKING |
| Final | "Enter your wagers now" stays after every wager is in; the host still shows Lock Wagers | NEW REQUEST → R18-3, R18-4 |
| Host preview | Blue grows with the clue; categories edge to edge; no black border in full screen; category controls; embedded / full screen; portrait / landscape (R17-17) | VERIFIED WORKING |
| Host preview | The Board 1 introduction (round title) still has a black border | NEW ISSUE → R18-5 |
| Other | TV "… is wagering" centred; "Medium" whole; TV lobby columns with nicknames; no card shuffling; lobby test-buzz glow; phone Test Buzzer back arrow; K60 pinch zoom | VERIFIED WORKING / FIXED |
| iPad | Status bar (K55) | STILL WHITE — investigate the owner's sticky-header workaround → R18-8 |
| Wi-Fi | Wi-Fi PC / Mobile Hotspot (K48) | NOT TESTED |

## What the diagnostics photo shows (R18-1)

`references/keyboard_diagnostics.png` (iPad landscape, lobby, keyboard open, `?kbdebug=1`): every line reads `vv 438@484 ×1.00 ih 438 kb 438` — the visible area 438 px high, the visual viewport's offsetTop **484**, and `window.innerHeight` **438** (equal to the visible area). The log alternates, about every 0.15–0.2 s (each keystroke): `scroll (not the user) div.scroll-area → 391`, then `guard … back to 189`, again and again; one `scroll (not the user) input[wifi-ssid] → 0` (the field's own text scrolling); after the keyboard closes `vv 922@0 … ih 922` and the column back at 0. Interpretation in PROGRESS session 21 / RESEARCH_NOTES "round 18".

## New requests (the round-18 prompt's parts 3 … 10)

| ID | Requirement (summary) | Milestone |
|---|---|---|
| R18-1 | **Highest priority.** iPad text fields must stay visible through continuous typing (long names / passwords, fast typing, deleting, select-and-replace, switching fields, repeated focus / blur), not just when focused; find the feedback loop / competing scroll mechanisms; one shared solution; keep the iPhone fixes and K60; keep the diagnostics available but off by default; open until verified on the iPad | A |
| R18-2 | Daily Double!: the host band keeps one height through every step (select, typing, set, lock, clue, Start Timer, Correct / Incorrect) — embedded and full screen; the TV preview never moves; nothing clipped or overlapping; workflow unchanged | B |
| R18-3 | Final: when every competing entry's wager is in (authoritative state — humans, bots, teams, host-entered, reconnects), "Enter your wagers now" fades out without moving the heading, category or bubbles; comes back if wagering reopens; never advances by itself | C |
| R18-4 | Final: the host's Lock Wagers becomes **Show Clue** once every wager is in (same place / style); pressing it locks the wagers and shows the clue; incomplete wagers keep Lock Wagers | C |
| R18-5 | Host preview: the Board 1 introduction (round title) on the same edge-to-edge blue as the categories — through the whole introduction, embedded / full screen, portrait / landscape; the playable board keeps its frame | D |
| R18-6 | Introduction band: Auto Present and Skip Category Presentation on the **left** (least emphasis); Previous Category, then the main Show First Category / Next Category at the **far right**; no extra height, nothing hidden in a menu | D |
| R18-7 | Settings → Players & Bots fits an iPad in landscape with Limits and Fallback shown; no setting removed or reset; graceful overflow on smaller screens | E |
| R18-8 | Status bar (K55): investigate the Reddit workaround (sticky header, solid background, `padding-top: env(safe-area-inset-top)`, `default` style, matching manifest theme_color, menus below the header); only if safe — no gradient, no layout shift, no strip where it does not belong; keep the white fallback otherwise; K55 open until the owner confirms | F |
