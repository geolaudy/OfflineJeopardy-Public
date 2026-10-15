# Known Issues & Limitations

| ID | Area | Issue | Impact / workaround |
|---|---|---|---|
| K1 | Joy-Con | ~~Not verified with real hardware~~ — **verified by the user with real Joy-Cons on Windows (2026-10-13).** Remaining: Switch 2 Joy-Cons use different device ids (unsupported); other firmware revisions untested. | Required before claiming compatibility. If WebHID can't open devices, fallback ids are `joycon:L-1` etc. (assignments may not survive reconnects). Players can always switch to phone buzzers. |
| K2 | iPad | ~~Not on a real iPad~~ — **verified by the user on a real iPad (2026-10-13).** | — |
| K3 | Packaging | Installer/portable exe are **unsigned** → Windows SmartScreen warning. The NSIS firewall rule hasn't been exercised on a clean machine. | Click "More info → Run anyway"; allow on private networks when Windows asks. |
| K4 | Packaging | electron-builder's WASM icon converter fails on this dev machine ("WebAssembly.Memory(): could not allocate memory"); we ship a pre-built `build/icon.ico` (`node scripts/make-icon.mjs`). | None for users. |
| K5 | Editor | ~~Drag-and-drop, version restore and media upload not browser-tested~~ — **all covered now** (editor.spec drag-and-drop + arrow buttons with saved order; library.spec version restore; media.spec upload buttons). | — |
| K6 | Backup | ~~Backups excluded media~~ — resolved in session 3: full backups are a .zip with database + pictures + media. Whole archive is built in memory (fine for typical sizes; very large media libraries need RAM). | — |
| K7 | Media | Plain JSON/CSV board export still references media by URL only. | Use **Export package (with media)** (L9, session 3). |
| K8 | Images | HEIC images are not decoded by the bundled sharp build. | iOS Safari normally converts to JPEG on upload. |
| K9 | Timers | A timer that was running when the app crashed is restored paused (by design). | Host taps Resume. |
| K10 | Sessions | Bearer tokens live in localStorage; private browsing may lose them per page session. | Sign in again. |
| K11 | Board editor | No in-app navigation blocker for an unsaved *new* board except the Boards back link (existing boards autosave). | Save new boards once before navigating away. |
| K12 | Profiles | Profile preferences (preferred buzzer/button) are informational; the host still assigns controllers explicitly (by design, to avoid wrong assignments). | — |
| K13 | Spec gaps | Not started: computer opponents, theme editor/import, workspaces, offline AI, room codes, tournament/survival modes, plugins, game-package export. (Host keyboard shortcuts done in session 2.) | See FEATURE_MATRIX.md. |
| K14 | Mobile | Layout fixes (dvh, safe areas, dialogs) verified with Playwright WebKit device emulation only; emulation has no Safari toolbars or notch insets. | Validate on a real iPhone + iPad (portrait/landscape, Home-Screen mode). |
| K15 | TV | Clue zoom / intro animations judged from screenshots; not measured for frame rate on TV hardware or 16:10 / non-classic themes. | Watch a round on the real TV; Settings → reduced motion falls back to fades. |
| K16 | Early buzz | Early detection is by arrival at the server: a press sent just before the host unlocks but arriving just after counts as on time (and vice versa). Inherent to server-authoritative timing (D15). | Use "Short lockout" rather than "Out for this clue" for latency-tolerant play. |
| K17 | Leaderboard | ~~Ranking thresholds fixed~~ — **configurable in Settings (session 6)**; defaults 3 games / 10 answers. | — |
| K18 | Navigation | Host back arrow appears only on setup/results (returns to the game list); during live play the drawer is the navigation (deliberately no accidental exit). | — |
| K19 | Lobby pairing | ~~QR scan not verified~~ — **verified by the user with a real iPad camera (2026-10-13).** | Typing the 6-digit code always works. |
| K20 | TV lobby | Shared-buzzer team members on the TV lobby come from the game projection matched by team name (the server roster row has no member list); two teams with the same name would merge. | Give teams distinct names. |
| K21 | TV lobby | Reduced-motion and light-theme variants of the lobby/presentation pages were not checked visually. | Report if anything looks off. |
| K22 | Presentation | Leaderboard/player TV pages were verified with injected sample data and the live empty state, not with a long real history. | — |
| K23 | Sounds | Sound cues are synthesised in the browser; automated tests check settings and triggers, not what is heard. Browsers may block audio on the TV until the page is clicked once (the Electron TV window allows autoplay). | Click the TV page once in a browser; use Settings → Test. |
| K24 | Sounds | Custom sound files are kept in full backups but are not part of board packages (they are app settings, not board content). | Re-upload on another computer. |
| K25 | Joy-Con rumble | Vibration feedback (first buzz / too early / Identify / Vibrate test) follows the documented HD-rumble encoding but has **not been felt on real Joy-Cons yet**. | Try Buzzers → Vibrate; turn off "Joy-Cons vibrate…" on the Buzzers page if it misbehaves. |
| K26 | AI answers | The optional AI answers (R3-14) are tested with a fake provider client only — **not yet against the real Anthropic API** (no key was available in development). Request shape follows the official SDK. | Leave it off, or use Settings → Test connection; any failure falls back to offline answers. |
| K27 | Bots | ~~Bots do not advance rounds~~ — **practice games now move to the next round / Final Jeopardy! / results by themselves (session 6)**; in ordinary games the host decides. On boards with very few clues an offline wrong answer may be "Pass". | — |
| K28 | Sound pack | The Jeopardy!/Buzzinga recordings in `new_sfx/` are the owner's files: git-ignored, never in public releases. A **local** `npm run dist` copies them into the build (`resources/soundpacks/buzzinga`) — such builds are for personal use only and must not be uploaded. Public builds play the Classic tone for every cue until files are added in Settings. | Settings → Sounds → Jeopardy!/Buzzinga → Add sound files. |
| K29 | Final Jeopardy! | Wagers/answers are hidden from the host until the reveal (by design). A player without a working device can tell the host privately; the host enters it under "A player can't use their device?". | — |
| K30 | Local AI | The local / OpenAI-compatible provider is tested against a fake HTTP server only — not yet with a real Ollama or LM Studio install. Small local models may answer slowly on older PCs (raise "Wait at most"). | Settings → AI answers → Test connection; any failure falls back to offline answers. |
