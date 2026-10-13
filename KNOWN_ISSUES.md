# Known Issues & Limitations

| ID | Area | Issue | Impact / workaround |
|---|---|---|---|
| K1 | Joy-Con | **Not verified with real hardware.** Implementation follows the documented Switch HID protocol and is tested only with simulated input. Unknowns: Chromium on Windows letting WebHID open Joy-Cons while its gamepad backend also uses them; device-info (MAC) reply offsets on all firmware; Switch 2 Joy-Cons (different IDs — unsupported). | Required before claiming compatibility. If WebHID can't open devices, fallback ids are `joycon:L-1` etc. (assignments may not survive reconnects). Players can always switch to phone buzzers. |
| K2 | iPad | Host UI tested in Playwright WebKit with an iPad descriptor, **not on a real iPad**. | Validate in Safari on a real iPad (touch, audio unlock, rotation). |
| K3 | Packaging | Installer/portable exe are **unsigned** → Windows SmartScreen warning. The NSIS firewall rule hasn't been exercised on a clean machine. | Click "More info → Run anyway"; allow on private networks when Windows asks. |
| K4 | Packaging | electron-builder's WASM icon converter fails on this dev machine ("WebAssembly.Memory(): could not allocate memory"); we ship a pre-built `build/icon.ico` (`node scripts/make-icon.mjs`). | None for users. |
| K5 | Editor | Library import, clue editing, package export/import, duplicate and archive/restore are E2E-tested; drag-and-drop, the version-restore button and the editor media-upload button are not yet browser-tested. | Next E2E task. |
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
| K17 | Leaderboard | Ranking thresholds are fixed (3 games for win %/average, 10 answers for accuracy). | Configurable thresholds not implemented. |
| K18 | Navigation | Host back arrow appears only on setup/results (returns to the game list); during live play the drawer is the navigation (deliberately no accidental exit). | — |
| K19 | Lobby pairing | One-step pairing from the host QR (`/host#pair=…`) is tested in Playwright WebKit only; scanning with a real iPad camera is **not verified**. | Typing the 6-digit code always works. |
| K20 | TV lobby | Shared-buzzer team members on the TV lobby come from the game projection matched by team name (the server roster row has no member list); two teams with the same name would merge. | Give teams distinct names. |
| K21 | TV lobby | Reduced-motion and light-theme variants of the lobby/presentation pages were not checked visually. | Report if anything looks off. |
| K22 | Presentation | Leaderboard/player TV pages were verified with injected sample data and the live empty state, not with a long real history. | — |
| K23 | Sounds | Sound cues are synthesised in the browser; automated tests check settings and triggers, not what is heard. Browsers may block audio on the TV until the page is clicked once (the Electron TV window allows autoplay). | Click the TV page once in a browser; use Settings → Test. |
| K24 | Sounds | Custom sound files are kept in full backups but are not part of board packages (they are app settings, not board content). | Re-upload on another computer. |
