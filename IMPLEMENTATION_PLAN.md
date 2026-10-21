# Implementation Plan

Order follows CLAUDE.md §31. ✅ done · 🔶 partial · ⬜ not started.

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Architecture, identity model, DB schema, event model | ✅ | ARCHITECTURE.md, migrations v1 |
| 2 | Electron shell + embedded local server | ✅ | Dev + packaged launch verified |
| 3 | Public board + iPad host controller + WebSocket sync | ✅ | E2E (WebKit iPad) |
| 4 | Profile portal, single QR, PIN auth | ✅ | I + E |
| 5 | Board editor + library | ✅ | Browser-tested incl. drag-and-drop, versions, media (K5 closed in session 6) |
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

1. ✅ (done) E2E for import/edit, team setup with shared keyboard buzzer, Final via phones. Remaining: editor drag-and-drop/versions/media E2E.
2. Real-hardware validation session: pair 2+ Joy-Cons on Windows, verify detection/MAC ids/assign/buzz/reconnect; fix offsets if needed. Real iPad Safari pass.
3. ✅ Game-package export/import with media (zip), backup including media (session 3).
4. ✅ Theme editor (custom colors/fonts/background/logo) + theme import/export (session 3). Open: custom sound packs / transition styles.
5. ✅ Host keyboard shortcuts; ✅ statistics export (CSV); latency diagnostics view still open.
6. ✅ Computer opponents / practice mode, ✅ room codes (session 3); open: tournament & survival modes.
7. ✅ Ollama-based board generation + clue helper with manual fallback (session 6); open: workspaces.

## Milestone 15 — User feedback round 1 — ✅ implemented & tested 2026-10-12 (session 2); real-device validation pending (K14, K15)

Details/acceptance criteria: USER_FEEDBACK.md. Order (dependencies first):

1. Record requirements (done) → 2. engine: early-buzz rules, answering-ended flow, category intro,
   state normalisation for old saves (unit tests) → 3. server: lockout-expiry rebroadcast, teardown
   fix, leaderboard/player/history APIs (integration tests) → 4. mobile foundation: dvh/safe areas,
   Modal fix, store structural sharing, cheap animations → 5. navigation: phone portal routes +
   drawer, host drawer, responsive desk nav → 6. phone stats pages: leaderboard, players, history
   detail → 7. host UI: early-buzz controls, reveal→return flow, intro controls → 8. TV: classic
   theme, clue zoom, intro, subtle indicator, polish → 9. E2E updates + mobile layout screenshot
   tests → 10. docs, commit → continue roadmap (IMPLEMENTATION_PLAN "Next tasks").

## Milestone 16 — User feedback round 2 (started 2026-10-13, session 4)

Rollback point: tag v0.3.0. Order (dependencies first; see USER_FEEDBACK.md Round 2):
- **B — Immediate fixes:** R2-15 captions, R2-19 page header, R2-11 return to start, R2-12 media layout, R2-18 icons.
- **C — Media:** R2-14 clue/answer media (data model first, backward compatible), R2-13 host media controls (authoritative media state), R2-16 auto-unlock, R2-17 board/clue preview (reuses /board/preview components).
- **D — Lobby and presentation:** lobby state + per-lobby pairing (R2-1/2), host app shell with desktop navigation (R2-3/4/6), presentation state + TV presenter with compact lobby, rail, transitions (R2-5/7/8/9/10).
- **E — Polish:** R2-23 board intro, R2-24 indicator styles, R2-22 sound packs.
- **F — Import:** R2-21 importer architecture, R2-20 Buzzinga investigation + import.
- Unfinished from the round-1 roadmap: survival UI (O8), tournament mode.


## Milestone 17 — User feedback round 3 (started 2026-10-13, session 5)

Rollback point: tag v0.5.0. Order (see USER_FEEDBACK.md Round 3):
- **A — Immediate fixes:** R3-1 picker filters, R3-2 leaderboard on TV, R3-3 return to lobby, R3-4 settings on TV, R3-5 bot difficulty badge.
- **E (early part) — Build/release basics:** version bump, `npm run dist` + artifact verification script, GitHub Actions Windows workflow (release only on `v*` tags), CHANGELOG.md.
- **B — Lobby statistics:** R3-6 cards, R3-7 crown, R3-8 bot cards.
- **C — Bot gameplay:** R3-9 clue selection, R3-10/R3-13 visible answers + awaiting judgment, R3-11 local wrong answers, R3-12 timing.
- **D — Optional AI bots:** R3-14 provider abstraction, secure key storage (Electron safeStorage where available), host settings, test connection, fallback.

## Milestone 18 — User feedback round 4 (started 2026-10-14, session 6)

Rollback point: tag v0.7.0. See USER_FEEDBACK.md "Round 4"; statuses in FEATURE_MATRIX.md.
- **A — Gameplay and validation:** R4-20 return to the existing lobby (investigate the report first), R4-2 Final Jeopardy! (engine reveal sequence + privacy, phone submission, host reveal UI, TV reveal), R4-4 simplified clue controls, R4-10 media-only clues, R4-16 intro gating, R4-7 wording.
- **B — Host and lobby UI:** R4-5, R4-15, R4-9, R4-8, R4-12, R4-14.
- **C — Profiles and pre-lobby:** R4-13 (profile picture, preferred colour, lobby colour assignment), R4-11 (pre-lobby TV).
- **D — Visual and audio:** R4-1 + R4-3 sound pack and think music, R4-6 bottom glow, R4-17 typography, R4-18 clue background, R4-19 board-fill sync.
- Tests for each item (Vitest + Playwright); release v0.8.0 when A–D are done.

## Milestone 19 — User feedback round 5 (started 2026-10-15, session 7)

Rollback point: tag v0.9.0. See USER_FEEDBACK.md "Round 5"; statuses in FEATURE_MATRIX.md.
- **A — Critical gameplay bugs:** R5-15 Final undo timer, R5-18 wager permissions, R5-16 profile picture, R5-19 Final answer submission, R5-20 Daily Double! phone wagers, R5-9 sound pack folders, R5-6 submission borders.
- **B — Home and lobby:** R5-2 TV/host home + recent games, R5-4 no Setup screen, R5-3 active lobby + rules summary + smaller QR + board choosing on the TV + minimized lobby with teams.
- **C — Teams:** R5-5 (defaults, Unassigned group, drag-and-drop + tap, phone self-selection, capacity, empty teams, warning, persistence across mode switches, name/colour by members, team-first buzz-in).
- **D — Phones:** R5-17 (profile choice with I'm New, lobby view, no buzzer before play, nicknames, others' stats, team info).
- **E — Host gameplay:** R5-12 category controls + preview, R5-13 board replica, R5-14 clue view.
- **F — Presentation:** R5-6 swipes, R5-7 score deltas, R5-8 typography, R5-10 podium + victory sound.
- **G — AI providers:** R5-11 Gemini + provider registry.
- Dependencies: C builds on the B lobby screen; D's team picker uses C's engine actions; E/F are independent of B–D. Release v0.10.0 when A–G are done and tested.


## Milestone 20 — User feedback round 6 (started 2026-10-17, session 8)

Rollback point: tag v0.10.0. See USER_FEEDBACK.md "Round 6"; statuses in FEATURE_MATRIX.md.
- **A — Gameplay bugs and timers:** R6-4 Final scatter sound, R6-6 Final timer expiry + Begin Answer Reveals, R6-12 timer label/hide at zero, R6-3 single highlight, R6-2.2 iPad highlight clipping, R6-13 descenders.
- **B — Scores and phone buzzer:** R6-5 in-box score deltas (no bubbles), R6-14 full-section buzzer with red/yellow/green states.
- **C — TV layout:** R6-7 compact lobby cards, R6-8 minimized lobby panel top-right, R6-9 content panels + grids, R6-10 board header, R6-11 rules + join panel.
- **D — iPad host:** R6-2.1 board preview without player cards, R6-2.3 Previous | Next, R6-2.4 category text proportions.
- **E — Category presentation performance:** R6-15 (profile first, fix the bottleneck, before/after numbers).
- **F — Buzzer fairness:** R6-16…24 research document first (research agent), then implementation + simulations.
- Release v0.11.0 when A–F are done and tested.

## Milestone 21 — User feedback round 7 (started 2026-10-17, session 9)

Rollback point: tag v0.11.0 (verified on GitHub). See USER_FEEDBACK.md "Round 7"; statuses in FEATURE_MATRIX.md.
- **0 — GitHub recovery:** v0.11.0 was already on origin (main 8c57d43, tag, release with 3 assets) — verified, nothing to push.
- **A — Gameplay/UI bugs:** R7-7, R7-8, R7-9, R7-10, R7-11, R7-12, R7-19, R7-28, R7-29.
- **B — TV presentation (shared gameplay theme tokens first):** R7-5, R7-15, R7-6, R7-13, R7-16, R7-14, R7-17.
- **A, B — done** (session 9, other computer: 41352f8, 5323344).
- **C — Lobby/menu layout:** R7-2, R7-3, R7-4, R7-17. **Done** (session 10): one heading/content line on every TV page, stacked names that never clip, phone delay on lobby cards.
- **D — iPad host:** R7-18, R7-20, R7-21, R7-22, R7-23, R7-24, R7-25, R7-26, R7-27 (R7-20/25 after B's tokens). **Done** (sessions 10–11).
- **E — Developer tools:** R7-31 (small: dev-only page, buzzer fairness test with simulated offsets, JSON export). **Done** (session 11, D76).
- **F — AI/import (agent, worktree):** R7-30.1 … R7-30.5.
- **G — Controller research (research agent):** R7-32.
- Order: A → B → (C, D) → E; F and G in parallel from the start. Release v0.12.0 when A–D (+ whatever of E–G is verified) are done and tested.

## Milestone 22 — User feedback round 8 (started 2026-10-18, session 12)

Rollback point: tag v0.12.0 (published). See USER_FEEDBACK.md "Round 8"; statuses in FEATURE_MATRIX.md.
- **0 — Verify E:** full Playwright run that low memory stopped in session 11.
- **A — Gameplay presentation bugs:** R8-2 (clue flicker), R8-3 (host board preview styling), R8-4 (board fill → intro), R8-5 (Final answer sizing). **Done.**
- **B — Minimized lobby:** R8-6.1 … R8-6.4. **Done.**
- **C — Rich clue text:** R8-7 (line breaks), R8-8 (bold/italic/underline), R8-9 (category subheading). **Done.** One shared text format for board content (stored with the board, rendered by one component on TV, host and phones; plain-text fallbacks for search, history and AI).
- **F (round 7):** R7-30.1 … R7-30.5 after A–C. **Done** (session 12, D81).
- Commit + push after every stable sub-task; release v0.13.0 when A–C are done and tested.

## Milestone 23 — User feedback round 9 (started 2026-10-18, session 13)

Rollback point: tag v0.13.0 (published). See USER_FEEDBACK.md "Round 9"; statuses in FEATURE_MATRIX.md.
- **0 — Release v0.13.0:** full Playwright run 53/53, then the release. **Done.**
- **A — Final Jeopardy! media + iPad Final in the game frame:** R9-5, R9-6.1 … R9-6.10. **Done** (D82).
- Next: smaller leftovers (category subheadings in CSV, the iPad buzzed-in line's inline "Nickname (Name)").

## Milestone 24 — User feedback round 10 (started 2026-10-18, session 14)

Rollback point: tag v0.13.0. See USER_FEEDBACK.md "Round 10"; statuses in FEATURE_MATRIX.md. The owner verified Final media on real hardware.
- **A — Small gameplay and presentation fixes:** R10-3, R10-5, R10-8, R10-4, R10-10. **Done.**
- **B — iPad preview:** R10-6, R10-9. **Done** (D83).
- **C — Host answer banner:** R10-7. **Done.**
- **D — Board editor:** R10-2 (Final previews), R10-11 (visual rich text). **Done** (D84).

## Milestone 25 — User feedback round 11 (started 2026-10-18, session 14)

Rollback point: tag v0.14.0. See USER_FEEDBACK.md "Round 11"; statuses in FEATURE_MATRIX.md.
- **A — Focused fixes:** R11-2, R11-5, R11-6, R11-3.7, R11-4. **Done.**
- **B — Fullscreen host preview:** R11-3 (shared fitting for fullscreen and embedded). **Done** (D85).
- **C — iPad web app:** R11-7. **Done** (D86).
- **D — Final answer closing:** R11-9. **Done** (D87).

## Milestone 26 — User feedback round 12 (started 2026-10-19, session 15)

Rollback point: tag v0.15.0. See USER_FEEDBACK.md "Round 12"; statuses in FEATURE_MATRIX.md.
- **0 — Development lock:** R12-1. **Done** (D88; DEVELOPMENT_LOCK.md).
- **A + B — Host full screen redesign:** R12-3 … R12-8. **Done** (D89).
- **C — iPad top edge + subheadings:** R12-9 (D93, needs the real iPad), R12-10. **Done.**
- **D — Play as Guest:** R12-11 (D90). **Done.**
- **E — Lobby Test Buzzer:** R12-12 (D91). **Done.**
- **F — Wi-Fi details near the QR:** R12-13 (D92). **Done** (automatic detection untested on a Wi-Fi PC).

## Milestone 27 — User feedback round 13 (started 2026-10-20, session 16)

Rollback point: tag v0.16.0. See USER_FEEDBACK.md "Round 13"; statuses in FEATURE_MATRIX.md.
- **A — Layout architecture and preview scaling:** R13-1, R13-2, R13-3 (D94, D96). One persistent GameFrame for both views; header row + picture + band + score cards; portrait keeps the TV's proportions.
- **B — Visual redesign:** R13-4 … R13-6, R13-8 (D94). Score cards in the frame (no white bar), colour ring, larger texts, navy tokens, boxless icon buttons.
- **C — Category introduction:** R13-7. Categories in the header.
- **D — Lobby and buzzer screens:** R13-9 … R13-12 (D97). TV join section; two-column iPad lobby; compact controllers; Buzzers tab / page.
- **E — Animation parity:** R13-13 (D95). The preview renders the TV's `Stage`; tiles tapped through `HostBoardHits`.

## Milestone 28 — User feedback round 14 → v0.17.0 release candidate (started 2026-10-20, session 17)

Rollback point: tag v0.16.0. See USER_FEEDBACK.md "Round 14"; statuses in FEATURE_MATRIX.md. The owner tests the 0.17.0 release candidate on real hardware before it is published.
- **A — Critical gameplay and layout:** R14-1 (12 entries, D98), R14-2 / R14-3 (score cards and fitted scores, D99), R14-4 (bot difficulty overlap), R14-12 (bot delay), R14-13 (clue picture flash). **Done.**
- **B — Host controller polish:** R14-6 … R14-10, R14-14, R14-23 … R14-25. **Done** (status-bar colour depends on iPadOS — K55).
- **C — Final Jeopardy!:** R14-15 … R14-22 (D100). **Done.**
- **D — Lobby, profiles, Wi-Fi:** R14-5 (D101), R14-26 … R14-29. **Done** (elevated Wi-Fi read and hotspot untested on a Wi-Fi PC — K48).
- **E — Windows start-up:** R14-11 (D102). **Done** (splash + zip portable; real start-up timed on this PC only — K56).

## Milestone 29 — User feedback round 15 → v0.17.0-rc.2 (started 2026-10-21, session 18)

Rollback point: tag v0.16.0 (0.17.0-rc.1 = commit 12bbb04, tested by the owner). See USER_FEEDBACK.md "Round 15"; statuses in FEATURE_MATRIX.md.
- **A — Critical host layout:** R15-10 … R15-13, R15-22, R15-23 (D103). **Done.**
- **B — TV lobby and phone:** R15-4 … R15-9. **Done.**
- **C — Daily Double!:** R15-17 … R15-21 (D104). **Done.**
- **D — Final presentation:** R15-24 … R15-27 (D106). **Done.**
- **E — Preview fill and zoom transition:** R15-14 … R15-16. **Done** (grain only, see FEATURE_MATRIX).
- **F — Bots:** R15-28, R15-29 (D105). **Done.**
- **G — Zoom and status bar:** R15-30, R15-31 (D107). **Done** — both need the owner's iPad (K55, K60).

## Milestone 30 — User feedback round 16 → v0.17.0-rc.3 (started 2026-10-21, session 19)

Rollback point: tag v0.16.0 (0.17.0-rc.2 = commit 56acd72, tested by the owner). See USER_FEEDBACK.md "Round 16"; statuses in FEATURE_MATRIX.md.
- **A — Keyboard and input visibility:** R16-4 … R16-6 (D108). **Done.**
- **B — Daily Double! and bot wagering:** R16-7 … R16-10 (D109, D110). **Done.**
- **C — Final presentation:** R16-11 … R16-13. **Done.**
- **D — Bot pick glow:** R16-14. **Done.**
- **E — iPadOS status bar:** R16-15, R16-16 (D112). **Done** — reverted; K55 stays open.
- **F — Preview surroundings and zoom:** R16-17 … R16-19 (D111). **Done.**
