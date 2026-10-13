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
