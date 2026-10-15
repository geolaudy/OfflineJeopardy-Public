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
