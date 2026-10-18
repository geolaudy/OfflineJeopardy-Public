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
