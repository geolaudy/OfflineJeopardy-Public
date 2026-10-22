# Session handoff

Read this first, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 17". Ready-to-paste resume prompts: `CONTINUE_PROMPT_SAME_COMPUTER.txt` / `CONTINUE_PROMPT_OTHER_COMPUTER.txt`.

**Before anything else: the development lock (`DEVELOPMENT_LOCK.md`).** `npm run dev:lock:status`, then `npm run dev:lock:acquire -- --task "…"`. Do not change files while another computer holds it.

## Current state (session 20, 2026-10-22 — round 17 done; 0.17.0 RELEASE CANDIDATE 4 built, NOT published; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 488c909 (0.17.0-rc.3 = what the owner tested). Development lock generation 8; **released at the end of session 20 (acquire it before you start)**.
- **Git:** `main` = `origin/main` after the round-17 commits (A+B 0c62fc8, then C–F + docs + version) and this handoff; pushed. The working tree keeps one change that is **not** this session's: `.claude/agents/research-agent.md` (a `model: sonnet` line, uncommitted since before session 19) — ask the owner before committing or discarding it. package.json **0.17.0-rc.4**; CHANGELOG [Unreleased] = rounds 13 … 17 (the future [0.17.0]). No tag, no GitHub release (rc builds stay local).
- **Owner's verdict on rc.3** (USER_FEEDBACK "Round 17"): nickname sheet, Test Buzzer arrow, host layouts, Daily Double! unlock flow, bot wagers / glow, Final cue / swipe, TV lobby, K60 **fixed**; iPhone wager / answer Submit **broken**; iPad lobby Wi-Fi fields, preview fill sync, status bar **not fixed**; Daily Double! answer timer **needs change**; Final answer / results screen **needs redesign**; Wi-Fi (K48) not tested.
- **Round 17 (R17-1 … R17-20, plan milestone 31, D113–D120) — milestones A–F done** (root causes in PROGRESS session 20):
  - A: the host types the Daily Double! wager in the band by default (new rule "Daily Double! wager entry"; player entry keeps Unlock Wager); the clue shows with the time stopped; green **Start Timer** (Space) starts it once.
  - B: keyboard scroll guard (undoes scrolls nobody made that hide the field; restores the column on close), shell fitted until the keyboard has closed, live frame lifted for the band field; phone wager / answer Submit beside / under the field; diagnostics with `?kbdebug=1` or Settings → Advanced.
  - C: Settings in tabs (Gameplay, Players & Bots, TV & Display, Sound, Network, Data & Storage, Advanced; rules dialog: three tabs); **Game data location** (change / open / restore default; the move runs at the next start — copy, verify, switch, the old folder kept; bootstrap `%APPDATA%\OfflineJeopardy\config.json`).
  - D: Final reveal and results as score cards (answer inside, verdict as the outline, up to 12 in balanced rows).
  - E: "… is wagering" centred below the category; bot level ("Medium") whole.
  - F: preview — the TV clue panel's surface runs past the picture and the host's surroundings run on the TV animation's own keyframes and timeline (one surface, no drift); the introduction's categories edge to edge (embedded and full screen); introduction band: **Next Category** leads, Previous beside it, Auto Present switch and Skip Category Presentation small at the end, no stacked swipes. Status bar investigated again: stays white (WebKit bug 301994 open on iOS 27; K55 open).
- **Tests:** tsc clean; Vitest **434/434**; Playwright full **142/143**, the 1 failure fixed and re-run green with all Final specs (details in PROGRESS).
- **Release candidate 0.17.0-rc.4 (`npm run release:local`: tsc, Vitest 434/434, dist, verify-dist 17/17 — both executables started headlessly; personal build — includes new_sfx, never upload):**
  - `release/OfflineJeopardy-Setup-0.17.0-rc.4.exe` (110 MB) — SHA-256 a4fc05cfd7ac891679efd969e94f3f6153510bedbac5806db5a179dfd0ec7d4d
  - `release/OfflineJeopardy-Portable-0.17.0-rc.4.exe` (155 MB) — SHA-256 567c0b678f72252654c97b98ce1279d6a63cb6e0986ef024fbde2be89705ca35
  - Built from commit 0812c70. Start-up / splash not re-timed this session. Note: the data location now reads `%APPDATA%\OfflineJeopardy\config.json` for the installed and the portable app alike; with no config file both keep their old default folders (installed: `%APPDATA%\OfflineJeopardy\data`, portable: `OfflineJeopardyData` next to the exe), so existing data is found as before. The rc.1 … rc.3 files are still in release/; C: has ~3.5 GB free.
- **Owner to check on real hardware before v0.17.0 is published:**
  1. Daily Double! (default host entry): type the wager in the band (keyboard: field and Set visible, TV picture keeps its size), Lock Wager & Show Clue, the clue with the time stopped, green Start Timer, then Correct / Incorrect. The phone says "Tell the host your wager — they enter it for you." Optional: Settings → Gameplay → Daily Double! wager entry = player, then the rc.3 Unlock flow + Start Timer.
  2. iPhone: Daily Double! wager, Final wager and Final answer — Submit visible and tappable with the keyboard open (portrait + landscape, Safari + Home Screen app).
  3. iPad lobby in landscape: scroll the left column a little, tap Wi-Fi name / password — the field stays above the keyboard; the column is back where it was after closing. If not: open the host with `?kbdebug=1` (or Settings → Advanced → "Show keyboard diagnostics on this device") and send a photo of the overlay.
  4. Settings: every tab without scrolling on the iPad; Data & Storage → Change Location on the PC (folder picker), restart, data all there; Restore Default Location.
  5. Final on the TV: the contestant card (answer inside, before / wager under it), green / red outline after the judgment; results with your usual player count.
  6. Preview (embedded / full screen, portrait / landscape): the blue grows out of the tile with the clue as one piece; category introduction blue edge to edge (no black border in full screen); band: Next Category, Previous, Auto Present, Skip Category Presentation.
  7. TV "… is wagering" centred below the category; lobby bot level "Medium" whole.
  8. Status bar: unchanged white (nothing to re-add for rc.4; K55 stays open). Wi-Fi PC / hotspot when possible (K48).

### Single recommended next task (session 20)

1. Acquire the development lock. Get the owner's verdict on 0.17.0-rc.4 (record it as USER_FEEDBACK "Round 18" and fix first if needed). **Only after explicit approval:** set package.json to 0.17.0, rename CHANGELOG [Unreleased] → [0.17.0] — date, build + verify, commit, push, tag v0.17.0 (windows-release skill), verify the GitHub release assets.

## Current state (session 19, 2026-10-21 — round 16 done; 0.17.0 RELEASE CANDIDATE 3 built, NOT published; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 91928b2 (0.17.0-rc.2 = what the owner tested; their prompt calls it "0.17.1-rc.2" — there is no 0.17.1). Development lock generation 7; **released at the end of session 19 (acquire it before you start)**.
- **Git:** `main` = `origin/main` after the round-16 commits (A+E 9992f96, then B–F + docs) and this handoff; pushed. The working tree keeps one change that is **not** this session's: `.claude/agents/research-agent.md` (a `model: sonnet` line, uncommitted when the session began) — ask the owner before committing or discarding it. package.json **0.17.0-rc.3**; CHANGELOG [Unreleased] = rounds 13 … 16 (the future [0.17.0]). No tag, no GitHub release (rc builds stay local).
- **Owner's verdict on rc.2** (USER_FEEDBACK "Round 16"): host layout, score cards, navy cards, K60 pinch zoom **fixed**; status bar gradient **rejected** (K55); bot wagering **broken**; Final swipe clipped early; preview fill partly wrong; Wi-Fi (K48) not tested.
- **Round 16 (R16-4 … R16-20, plan milestone 30, D108–D112) — milestones A–F done** (see PROGRESS session 19 for root causes): keyboard tracker; Unlock Wager → timer → any wager stops it → Lock Wager & Show Clue; bots wager after the unlock (task keys per clue opening); "Daily Double" at category size (narrow headers: two lines, Options icon); Final cue above the bubbles, full-width swipe; TV "… is wagering" lower; square three-blink bot glow; status bar back to `default`; preview fill = the panel's gradient in the picture's coordinates and the TV's own zoom.
- **Tests:** tsc clean; Vitest **409/409**; Playwright full **124/127**, the 3 re-run green after fixes (details in PROGRESS).
- **Release candidate 0.17.0-rc.3 (`npm run release:local`: tsc, Vitest 409/409, dist, verify-dist 17/17 — both executables started headlessly; personal build — includes new_sfx, never upload):**
  - `release/OfflineJeopardy-Setup-0.17.0-rc.3.exe` (115 MB) — SHA-256 f244d15a85258b14b5cd26d529d3d1a39bf8fdc30bee0db6d3af50dfd1b45104
  - `release/OfflineJeopardy-Portable-0.17.0-rc.3.exe` (162 MB) — SHA-256 eac8ab0373e48872654ea2986e3c76ed5a6f477bf8b65a72732099d8e8748ddd
  - Packaging and the splash are unchanged from rc.1 / rc.2 (start-up not re-timed this session). The rc.1 / rc.2 files are still in release/; C: has ~3.5 GB free.
- **Owner to check on real hardware before v0.17.0 is published:** (1) phone: Nickname → keyboard: field, Save, Cancel visible (portrait + landscape, Safari + Home Screen app, open / close a few times); (2) iPad lobby in landscape: Wi-Fi name / password with the left column at the top and scrolled — visible above the keyboard, lobby whole after closing it; other fields (board editor, wager entry, Final answer); (3) Daily Double!: locked at first (phone says to wait), green **Unlock Wager** starts the timer, a phone / host / bot wager stops it, **Lock Wager & Show Clue** shows the clue; "Daily Double" as large as the category, embedded and full screen; (4) bots: a bot's Daily Double! (after Unlock) and Final wager; the chosen tile's glow (two blinks + hold, square); (5) Final: "Enter your wagers now" above the bubbles; contestants swipe to the screen edges; TV Daily Double! "… is wagering" lower; (6) preview: no edge, no black line around the picture during a clue, the blue zooms with the clue (embedded / full screen, portrait / landscape); (7) **remove and re-add the Home Screen icon**: the status bar should be rc.1's plain white bar with nothing pushed down (K55 stays open); (8) still unreported: TV lobby with nicknames, test-buzz glow, phone Test Buzzer back arrow; Wi-Fi PC / hotspot (K48).

### Single recommended next task (session 19)

1. Acquire the development lock. Get the owner's verdict on 0.17.0-rc.3 (record it as USER_FEEDBACK "Round 17" and fix first if needed). **Only after explicit approval:** set package.json to 0.17.0, rename CHANGELOG [Unreleased] → [0.17.0] — date, build + verify, commit, push, tag v0.17.0 (windows-release skill), verify the GitHub release assets.

## Current state (session 18, 2026-10-21 — round 15 done; 0.17.0 RELEASE CANDIDATE 2 built, NOT published; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 12bbb04 (0.17.0-rc.1, the build the owner tested), clean. Development lock owned by this clone (generation 4); **released at the end of session 18 (acquire it before you start)**.
- **Git:** `main` = `origin/main` = the round-15 commit 189429d + the handoff commit after it (round 15 + this handoff), pushed, clean tree. package.json **0.17.0-rc.2**; CHANGELOG [Unreleased] = rounds 13 + 14 + 15 (the future [0.17.0] section). No tag, no GitHub release (rc builds are local, like rc.1).
- **Owner's verdict on rc.1** (USER_FEEDBACK "Round 15"): host embedded / full screen / both orientations, centred response, Options, menu, TV scores, Final bubbles / outlines / results, host Final entry, AI bots, picture reveal, Windows start-up + splash (K56), Joy-Cons and phones all **working**; host score cards **clipped** and the iOS status bar **white** (K55); Wi-Fi credentials / admin approval / hotspot **not testable** (Ethernet, K48).
- **Round 15 (USER_FEEDBACK "Round 15" R15-4 … R15-32, plan milestone 29, FEATURE_MATRIX "User feedback round 15", D103–D107) — milestones A–G done:**
  - A host layout: score section planned with the bottom safe area (`--safe-bottom`, GameFrame `useSafeBottom`) — the clipping's root cause; navy score cards; HEAD_H 64 / BAND_H 76 / two-row minimum 95 px (+ safe area) keep the full-screen iPad picture edge to edge; centred board status; no header seams; value beside Options; timer line above the band.
  - B TV lobby keys = profile id, one card height (no column change with nicknames), one statistics size, soft rounded glow (600 ms); phone Test Buzzer portalled to the body with a back arrow.
  - C Daily Double!: no automatic wager timer (host "Start …s Timer"), wager band (who / wager / Preview Clue / Enter Wager / Lock Wager & Show Clue), engine `enterDailyWager`, shared CluePreview (picture height, minimal ×), "Daily Double" whole in the banner.
  - D Final: category stationary into wagering + "Enter your wagers now" cue; reveal = static heading / category / order with an inner swipe for the contestant only.
  - E preview fill: StageFill — board ground + clue panel layer that opens / closes with the TV's zoom (clip-path from the tile), panel grain at the preview's scale.
  - F bots: answer label under the banner; chosen tile outlined ~1 s (`pickHint`, transient, server-side).
  - G zoom: viewport helpers ignore pinch zoom (`pinchZoomed`); status bar black-translucent + navy standalone strip (`--status-bg`).
- **Tests:** tsc clean; Vitest **398/398**; full Playwright **112/112 (108 in the full run + the 4 updated specs re-run 15/15)**; new specs tests/unit/round15.test.ts, tests/e2e/round15.spec.ts.
- **Release candidate (`npm run release:local`; personal build — includes new_sfx, never upload):**
  - `release/OfflineJeopardy-Setup-0.17.0-rc.2.exe` (115 MB) — SHA-256 ceb9cfd4f075851d5a653b03fb5698bbd1a129bf735a0f05eb7ff37722a87ca9
  - `release/OfflineJeopardy-Portable-0.17.0-rc.2.exe` (162 MB) — SHA-256 f39b67e0b92aae81f07cdcc40644eed3bf14b2c91e3111e48dc489b5161b146f. verify-dist 17/17 (both executables started headlessly). Started 4× from a temp folder: unpacking 13–15 s, app start → host window 0.75–1.0 s (rc.1 in the same place: 6–29 s / 0.7–2.6 s). The splash itself was not seen this session (the PC's display was off) — splash code and packaging are unchanged from the rc.1 the owner verified. The rc.1 files are still in release/.
- **Owner to check on real hardware before v0.17.0 is published:** (1) iPad host, embedded + full screen, landscape + portrait, with 1 / 3 / 9 / 12 players: score cards whole, navy cards, centred "… is choosing a clue", no thin lines under the banners, value beside Options, timer above the band; (2) **re-add the Home Screen icon**, then the status bar in full screen / embedded and in a Safari tab (K55); (3) Daily Double!: Start timer, Preview Clue, Enter Wager, Lock Wager & Show Clue, a phone's wager; (4) Final: category not moving into wagering, "Enter your wagers now", reveals (only the contestant moves); (5) bots: the outlined tile before the zoom, the answer under the banner; (6) TV lobby with nicknames (columns, no shuffling), test-buzz glow; phone Test Buzzer back arrow; (7) pinch-zoom on the iPad (no jumping / flicker — K60), the preview fill during clue zoom; (8) Wi-Fi PC / hotspot when possible (K48).

### Single recommended next task (session 18)

1. Acquire the development lock. Get the owner's verdict on 0.17.0-rc.2. **Only after explicit approval:** set package.json to 0.17.0, rename CHANGELOG [Unreleased] → [0.17.0] — date, build + verify, commit, push, tag v0.17.0 (windows-release skill), verify the GitHub release assets.
2. If the owner reports problems: record them as USER_FEEDBACK "Round 16" and fix first.

## Current state (session 17, 2026-10-20 — round 14 done; 0.17.0 RELEASE CANDIDATE built, NOT published; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 58940e1 (round 13, unreleased), clean. Development lock acquired (generation 3), **released at the end of session 17** (acquire it before you start).
- **Git:** `main` = `origin/main` = the "Session 17 handoff" commit (after the round 14 commit 562973a), pushed, clean tree. package.json **0.17.0-rc.1**; CHANGELOG [Unreleased] = rounds 13 + 14 (the future [0.17.0] section). No tag.
- **Round 14 (USER_FEEDBACK "Round 14", plan milestone 28, FEATURE_MATRIX "User feedback round 14", D98–D102) — all milestones A–E done:** 12 players / teams; fixed-height score cards (1 row ≤ 6, 2 rows of 6) with fitted score fonts on TV and host; bot difficulty overlap; bot "delay out of range" fix; no picture flash on reveal; preview colours / no glow / centred answer / one Options menu / status-bar colour / menu slide-out / banner and band sizes; Final: Preview Clue, host bubbles to enter wagers and answers, TV verdict outlines, results like score cards; Wi-Fi password via host-approved elevation + Mobile Hotspot; TV "or open" line; lobby player sheet; Players editor without nickname; Windows splash + zip portable.
- **Layout budget (keep!):** band 80 px + minimum score section 108 px is exactly what keeps the full-screen iPad Pro 11 landscape picture edge to edge (owner-verified in round 13, asserted by round13.spec). See D99.
- **Tests:** tsc clean; Vitest **393/393**; full Playwright **100/100** (99 in the run + survival re-run after a disk-full error); new `tests/e2e/round14.spec.ts`.
- **Release candidate (`npm run release:local`: tsc, Vitest 393/393, dist, verify-dist 17/17; personal build — includes new_sfx, never upload):**
  - `release/OfflineJeopardy-Setup-0.17.0-rc.1.exe` (110 MB) — SHA-256 62075f2352170df25efd317ed8d3c85a1b4e52f53c6ea285ee666c86e721420f
  - `release/OfflineJeopardy-Portable-0.17.0-rc.1.exe` (155 MB) — SHA-256 d2163e6326ffec202d68489191b58b84c6d7f454342b9d453e3e66ea913f73ce
  - Started once here: ~7.6 s unpacking + 2.5 s to the window (~10 s; the 0.16.0 portable took ~17–19 s).
- **Note:** the owner's 0.16.0 portable from `release/` was running all session with its data in `release/OfflineJeopardyData` (left running). My one RC timing start briefly used the same data folder (no schema change in round 14; closed after 30 s).
- **Disk:** C: had < 0.5 GB free (a Playwright run failed with ENOSPC). Old local builds 0.1–0.11 were **moved** (not deleted) to `D:\OfflineJeopardy-old-builds\`; ~2.6 GB free now. Leftover portable unpack folders in %TEMP% (`3K…`, ~235 MB each, from earlier days) can be cleared by the owner when no OfflineJeopardy is running.
- **Owner to check on real hardware before v0.17.0 is published:** (1) iPad host embedded + full screen, landscape + portrait, Safari tab and Home Screen app: score cards with 1 … 12 players, centred correct response, Options menu, menu slide-out, status-bar colour (K55); (2) TV: score sizes, Final bubbles / outlines / results, lobby "or open"; (3) Final with a phone that "fails": tap its bubble on the iPad, enter wager and answer; (4) bots with an AI provider (no "delay" error); (5) a picture clue → reveal (no flash); (6) Wi-Fi PC: name, "Read it with administrator approval" (UAC), Mobile Hotspot (K48); (7) Windows: installer and portable start-up, splash, time to window (K56); (8) Joy-Cons / phones as usual.

### Single recommended next task (session 17)

1. Acquire the development lock. Get the owner's verdict on the 0.17.0 RC. **Only after explicit approval:** set package.json to 0.17.0, rename CHANGELOG [Unreleased] → [0.17.0] — date, build + verify, commit, push, tag v0.17.0 (windows-release skill), verify the GitHub release assets.
2. If the owner reports problems: record them as USER_FEEDBACK "Round 15" and fix first.

## Current state (session 16, 2026-10-20 — round 13 done, not released; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 6649f66 (v0.16.0 released), clean. Development lock acquired (generation 2), kept through a usage-limit pause, **released at the end of session 16** (acquire it before you start).
- **Git:** `main` = `origin/main` = the "Session 16 handoff" commit (after the round 13 commit 348643f), pushed, clean tree. package.json still **0.16.0**; CHANGELOG [Unreleased] = round 13 (not released — round 13 is a layout round that should first be looked at on the real iPad; release it as 0.17.0 after the owner's check, with the windows-release skill).
- **Round 13 (USER_FEEDBACK "Round 13", plan milestone 27, FEATURE_MATRIX "User feedback round 13", D94–D97) — all done and tested automatically:**
  - Host live screen (R13-1 … R13-8): one persistent `GameFrame` for the embedded view and full screen (header row with menu · stage text / red answer strip · Options · Fullscreen; TV picture as wide as the screen allows; 72 px band; score cards in the height left). Stages fill it through portals (`FrameParts`). Full screen on an iPad in landscape is edge to edge (asserted). Larger score cards with a colour ring; larger texts; introduction categories in the header.
  - Preview animations (R13-13): the host preview renders the TV's own `Stage` (board fill-in, clue zoom); `quietStart` for a preview opened mid-game; tiles are tapped through transparent `HostBoardHits` buttons placed from boxes the preview reports.
  - Lobby (R13-9 … R13-12): TV Wi-Fi in a labelled box, the join address under the QR code (measured to its width); iPad lobby in two columns of the screen's height (15 players + 15 controllers without scrolling, solo mode); compact controller cards with a settings sheet; Buzzers tab / page fits, including after a buzzer check (order folded away).
  - Fix found on the way: a Final Jeopardy! answer submitted within 0.7 s of typing could be un-submitted by the delayed draft autosave (`PlayTab.tsx`); the pending autosave is cancelled on submit.
- **Tests:** full Playwright **88/88**, Vitest **382/382**, tsc clean. New spec `tests/e2e/round13.spec.ts`. Note: Playwright empties `test-results/` when it starts — keep run logs elsewhere.
- **Local build (end of session 16, `npm run release:local`, verify-dist 17/17; personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.16.0.exe`, `release/OfflineJeopardy-Portable-0.16.0.exe`. They carry the round 13 code but still say 0.16.0 (no version bump until the release); the published v0.16.0 on GitHub is unchanged.
- **Owner to check on the real iPad (K52):** the host screen embedded and full screen (landscape + portrait, Safari tab and Home Screen app), score cards with your real player count, the lobby and Buzzers tab with real Joy-Cons, the TV lobby with Wi-Fi shown.

### Single recommended next task (session 16)

1. Acquire the development lock, then: the owner's feedback on round 13 (record it as USER_FEEDBACK "Round 14"). If the owner is happy: release 0.17.0 (windows-release skill).
2. Without new feedback: K47 / K48 / K52 real-device checks with the owner; then O9 (accessibility audit) and K42.

## Previous state (session 15, 2026-10-19 — round 12 done, v0.16.0 released; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` e1aed4d (v0.15.0 released). This computer had 6 old unpushed commits (an earlier, superseded round-7 F attempt) — kept on the local branch `archive/machine-b-r7f-unpushed` only; `main` was reset to `origin/main`.
- **Git:** `main` = `origin/main` = the "Session 15 handoff" commit (after release commit fad0766), pushed, clean tree. **Development lock: released** at the end of session 15 (acquire it before you start). package.json **0.16.0**; CHANGELOG [0.16.0] = round 12, [Unreleased] empty.
- **Round 12 (USER_FEEDBACK "Round 12", plan milestone 26, FEATURE_MATRIX "User feedback round 12") — all done and tested automatically:**
  - R12-1 development lock (66e3238) — `scripts/dev-lock.mjs`, `.githooks/`, `.claude/settings.json` hooks, `DEVELOPMENT_LOCK.md`, CLAUDE.md §36; devLock 12/12; used for real this session.
  - R12-3…8 host full screen redesign (D89) — edge-to-edge blue, top bar (menu / Options / minimise), slide-in menu, three-column answer band, button family, centred score cards, Reveal Answer in the Unlock slot while the timer runs, compact layout for phones in landscape.
  - R12-9 iPad top edge (D93, `--safe-top`) — **awaiting real-iPad check (K47)**.
  - R12-10 subheadings at 65 %. R12-11 Play as Guest (D90, migration v7). R12-12 lobby Test Buzzer (D91). R12-13 Wi-Fi details (D92) — **automatic name / password awaiting a Wi-Fi PC check (K48)**; this PC is wired.
- **Release v0.16.0:** full Playwright **73/73**, Vitest **382/382**, verify-dist **17/17**; tag v0.16.0 published: https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.16.0 (GitHub Actions run 39366260048 succeeded; installer, portable and SHA256SUMS.txt verified via the API). **Local build (personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.16.0.exe`, `release/OfflineJeopardy-Portable-0.16.0.exe`.
- **Before any Playwright run:** `npm run build:web` — the test server serves `dist/`; a stale build here once looked like a WebKit crash.
- **References** (`references/`, git-ignored, not on GitHub — they contain the owner's photo; copy by hand): `0.15.0 host fullscreen board improved.png`, `0.15.0 host fullscreen clue improved.png`, `0.15.0 host fullscreen menu open example.png`, `topedge_fadeoff_example.png`.
- **Owner to check on real devices:** the new full screen on the iPad (landscape / portrait, Home Screen app and Safari), nothing faded at the top of any page in the Home Screen app, Play as Guest + Test Buzzer on real phones, a Joy-Con press in the lobby lights its player's card, Wi-Fi name / password on the Wi-Fi game PC.

### Single recommended next task (session 15)

1. Acquire the development lock (top of this file), then: the owner's feedback on round 12 (record it as USER_FEEDBACK "Round 13").
2. Without new feedback: real-device checks of K47 / K48 with the owner; then the older open items (accessibility audit O9, reading media lengths on the server K42).

### Two development computers (from session 15)

- **DESKTOP-6HN0OQ4** (geolaudy, original machine — session 15) and the **mvanwitz** machine. Only one works at a time: the development lock decides (DEVELOPMENT_LOCK.md). Release it at the end of a session; after a crash it expires 15 minutes after the last heartbeat.
- The local branch `archive/machine-b-r7f-unpushed` on DESKTOP-6HN0OQ4 is an old, superseded round-7 F attempt — keep, don't merge.

## Current state (session 14, 2026-10-18 — rounds 10 + 11 done; v0.15.0 released)

- **Branch:** `main` = `origin/main`, clean. package.json **0.15.0** = the latest GitHub release (https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.15.0, GitHub Actions run 39171324571 succeeded; 3 assets verified via the API: installer, portable, SHA256SUMS.txt). CHANGELOG **[Unreleased]** is empty. v0.14.0 (round 10) was released earlier this session.
- **Round 11 (USER_FEEDBACK "Round 11", plan milestone 25) — done and tested:**
  - A: Buzzinga picture / sound clue text → clue text (both caption lines; no caption); one "buzzers open" glow (the whole-box shadow drew a second line above the timer); no TV "buzzed in" card on the host preview; host timer line along the top of the control band; controls centred.
  - B (D85): host full screen (Fullscreen API or window-filling layout, Esc, nothing remounts) and one fitting for full screen and the embedded preview — top strip (answer band / status) · TV area at the TV's proportions with blue around it · control band (timer line, next step, Fullscreen button).
  - C (D86): host/join web-app manifests (scope "/", standalone, icons) — the cause of Safari's bar on some pages of the iPad Home Screen app — and one safe-area rule so every host page clears the status bar (the Boards title sat under it).
  - D (D87): Final Jeopardy! answering stays open after the think time until the host closes it (rule `finalClose`, default 'host'; 'timer' = old behaviour).
- **Tests:** tsc clean, **Vitest 360/360**, **full Playwright 70/70**, verify-dist 17/17.
- **Local build (personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.15.0.exe`, `release/OfflineJeopardy-Portable-0.15.0.exe`.
- **Owner to check on real devices:** re-add the iPad Home Screen icon from the host page, then every page (K46); host full screen on the iPad (K45); the new frame in landscape / portrait; Final answering after time-up with real phones; a Buzzinga picture-clue import.
- **Code style note:** do not run Prettier with its defaults on project files — the code base uses single quotes and long lines (a default run rewrote whole files in round 10; fixed this session).

### Single recommended next task

1. Wait for the owner's feedback on 0.15.0 (record it as the next USER_FEEDBACK round).
2. Otherwise: hardware checks (Joy-Cons, iPad, TV), the accessibility audit (O9), reading media lengths on the server at upload (K42), P3 ideas (O6 workspaces, O13 plugins, profile import, a data-folder UI).

### Two developers, two machines

- Developers alternate sessions on the same repo: **geolaudy** (original machine) and **mvanwitz** (second machine, from session 10). Always `git pull` before starting and push before stopping; if both work at once, use a feature branch.
- Git-ignored folders that must be copied by hand to each machine: `new_sfx/` (owner's sounds — personal use only, never commit or upload) and `references/` (owner's reference screenshots for round 7).
- Second machine notes: no Python installed — use Node scripts for scripted edits (write the script with the Write tool into the scratchpad, not a bash heredoc, which mangles quotes); run `npx playwright install chromium webkit` once on a new machine.
- The session-9 machine stopped at the usage limit without a handoff; nothing was lost (all its work was pushed). Commit + push after every milestone so this stays true.

## Session 8 (2026-10-17) — round 6, stopped at the usage limit

- **All round-6 milestones (A–F) are done, merged and tested**; `main` pushed to origin. Version **0.11.0**, tag `v0.11.0` pushed (GitHub Actions publishes the release).
- Tests: tsc clean, Vitest 273/273, Playwright 41/41, verify-dist 17/17.
- Local artifacts (include the owner's sounds — personal use only, never upload): `release/OfflineJeopardy-Setup-0.11.0.exe`, `release/OfflineJeopardy-Portable-0.11.0.exe`, `release/win-unpacked/`.
- **Owner to check:** the GitHub release page for v0.11.0 has the installer, portable exe and SHA256SUMS.txt (the API check is blocked here). On real devices: fair buzzing with real phones on Wi-Fi (K35), TV swipe smoothness on the TV PC (K36), the new phone buzzer on real phones (K37), the new TV lobby layout on the TV.
- The milestone-C worktree `.claude/worktrees/agent-a2b32342d6c9018bf` is merged and can be removed.
- Read FEATURE_MATRIX "User feedback round 6" for per-item status.


(Older sections below are history.)

## Current state (updated 2026-10-15, session 7)

- Branch: `main`, pushed to `origin/main`. Release **v0.10.0** tagged (GitHub Actions builds the public release; see PROGRESS.md for the verified release record).
- `package.json` version: **0.10.0**. Tests at the last full run: **Vitest 226/226, Playwright 38/38**.
- Local artifacts (include the owner's sounds — personal use only, do not upload): `release/OfflineJeopardy-Setup-0.10.0.exe`, `release/OfflineJeopardy-Portable-0.10.0.exe`, `release/win-unpacked/` (verify-dist **17/17**, incl. "serves the Jeopardy!/Buzzinga sounds — 9 cues").
- Round-5 requirements: USER_FEEDBACK.md "Round 5" (R5-2 … R5-20), IMPLEMENTATION_PLAN milestone 19, FEATURE_MATRIX "User feedback round 5", decisions D55–D63.

## Round 5 status (all milestones done and tested)

| Milestone | Items | Status |
|---|---|---|
| A — critical bugs | R5-15 undo timer, R5-18 wager permissions, R5-16 picture, R5-19 Final answer submit/change, R5-20 Daily Double! on phones, R5-9 sound folders | Done, tested (U + I + E) |
| B — home + lobby | R5-2 home screens/recent games, R5-4 no setup screen, R5-3 active lobby/rules/QR/board chooser/compact teams | Done, tested |
| C — teams | R5-5 slots, Unassigned, self-selection, drag + tap, capacity, empty teams, warning, mode memory, identity, saved-team linking | Done, tested |
| D — phones | R5-17 lobby view, I'm New first, nicknames, others' stats | Done, tested |
| E — host gameplay (agent) | R5-12 intro controls + live preview, R5-13 board replica, R5-14 clue view | Done, tested (emulation) |
| F — presentation (agent) | R5-6 swipes, R5-7 score deltas, R5-8 typography, R5-10 podium + fanfare, R5-5.10 team buzz-in | Done, tested (R5-8 visual only) |
| G — AI (agent) | R5-11 Gemini + provider registry | Done, tested with a fake Gemini API only (K31) |

## Owner's assets (important)

- `new_sfx/` holds the owner's sound files + a clue background image. **Git-ignored. Never commit or publish them.**
- `npm run build:electron` copies the audio into `build/private-sfx/` (git-ignored) → a *local* `npm run dist` ships them in `resources/soundpacks/buzzinga` (personal use only). The GitHub workflow has no `new_sfx`, so public releases contain none; `verify-dist` fails in CI if any are present.
- Dev server: `npm run dev:server` passes `--sfx=new_sfx`.
- The clue background is recreated in CSS (the JPEG is not used); TV fonts are OFL look-alikes (licensed fonts plug in via Windows install or `<data>/fonts/clue|category|value.*`).

## Builds / release workflow

Unchanged from session 5: `npm run dist` + `npm run dist:verify`; release = bump version + CHANGELOG section → commit/push → `git tag -a vX.Y.Z` → push tag → GitHub Actions builds, verifies and publishes. No `gh` CLI; verify via the GitHub API with the stored git credential.

## Gotchas

- Do not leave a shell inside `test-results/` (Playwright hangs on Windows).
- Python edit scripts: write with `newline=''`; **never put regexes with `\b` in a heredoc** — write the script to a file (a heredoc turned `\b` into backspace characters once).
- Stopping a Playwright run can leave its test server on port 3210; check `netstat -ano | grep 3210` before re-running.

## After v0.8.0 (same session)

- Play-testing: engine fuzzer (`tests/unit/playtest.fuzz.test.ts`, `FUZZ_GAMES=3000` locally), browser play-test (`tests/e2e/playtest.spec.ts`), soak test (`tests/integration/soak.test.ts`). Fixed stuck states when removing players mid-game, Final with nobody eligible, input-bridge flood limit, small-screen overflows.
- Features: practice games advance by themselves, per-sound volume, leaderboard minimums, local/OpenAI-compatible AI provider, Create a board with AI, head to head on the TV, migration v5 ("Final Wager" → "Final Jeopardy!").
- E2E specs must clean up what they leave behind (lobbies, boards, settings) — game.spec restores "trust localhost" in afterEach.

## Next recommended tasks

1. Owner on real devices: try Gemini with a real key (K31); team lobby drag-and-drop and the new clue screen on the real iPad (K32, K34); scan the smaller join QR from the sofa (K33); listen to the victory fanfare and the Final swipes on the TV.
2. If the owner wants the recordings in the GitHub download: not possible without redistribution rights — keep the "Sounds folder next to the exe" route (K28).
3. Earlier open items: Joy-Con vibration on hardware (K25), local AI with a real Ollama (K30), workspaces (O6), plugin system (O13).
