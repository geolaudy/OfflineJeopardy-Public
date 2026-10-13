# Known Issues & Limitations

| ID | Area | Issue | Impact / workaround |
|---|---|---|---|
| K1 | Joy-Con | **Not verified with real hardware.** Implementation follows the documented Switch HID protocol and is tested only with simulated input. Unknowns: Chromium on Windows letting WebHID open Joy-Cons while its gamepad backend also uses them; device-info (MAC) reply offsets on all firmware; Switch 2 Joy-Cons (different IDs — unsupported). | Required before claiming compatibility. If WebHID can't open devices, fallback ids are `joycon:L-1` etc. (assignments may not survive reconnects). Players can always switch to phone buzzers. |
| K2 | iPad | Host UI tested in Playwright WebKit with an iPad descriptor, **not on a real iPad**. | Validate in Safari on a real iPad (touch, audio unlock, rotation). |
| K3 | Packaging | Installer/portable exe are **unsigned** → Windows SmartScreen warning. The NSIS firewall rule hasn't been exercised on a clean machine. | Click "More info → Run anyway"; allow on private networks when Windows asks. |
| K4 | Packaging | electron-builder's WASM icon converter fails on this dev machine ("WebAssembly.Memory(): could not allocate memory"); we ship a pre-built `build/icon.ico` (`node scripts/make-icon.mjs`). | None for users. |
| K5 | Editor | Library import and clue editing are E2E-tested; drag-and-drop, version restore, duplicate/archive and media upload in the editor are not yet browser-tested. | Next E2E task. |
| K6 | Backup | Backups contain the database only, not uploaded pictures/media. | Copy the data folder (Settings → Open data folder) for a full backup. |
| K7 | Media | Board JSON export references media URLs but does not package media files. | Game-package export with media is NOT STARTED (L9). |
| K8 | Images | HEIC images are not decoded by the bundled sharp build. | iOS Safari normally converts to JPEG on upload. |
| K9 | Timers | A timer that was running when the app crashed is restored paused (by design). | Host taps Resume. |
| K10 | Sessions | Bearer tokens live in localStorage; private browsing may lose them per page session. | Sign in again. |
| K11 | Board editor | No in-app navigation blocker for an unsaved *new* board except the "← Library" link (existing boards autosave). | Save new boards once before navigating away. |
| K12 | Profiles | Profile preferences (preferred buzzer/button) are informational; the host still assigns controllers explicitly (by design, to avoid wrong assignments). | — |
| K13 | Spec gaps | Not started: computer opponents, theme editor/import, workspaces, offline AI, room codes, tournament/survival modes, plugins, game-package export. (Host keyboard shortcuts done in session 2.) | See FEATURE_MATRIX.md. |
| K14 | Mobile | Layout fixes (dvh, safe areas, dialogs) verified with Playwright WebKit device emulation only; emulation has no Safari toolbars or notch insets. | Validate on a real iPhone + iPad (portrait/landscape, Home-Screen mode). |
| K15 | TV | Clue zoom / intro animations judged from screenshots; not measured for frame rate on TV hardware or 16:10 / non-classic themes. | Watch a round on the real TV; Settings → reduced motion falls back to fades. |
| K16 | Early buzz | Early detection is by arrival at the server: a press sent just before the host unlocks but arriving just after counts as on time (and vice versa). Inherent to server-authoritative timing (D15). | Use "Short lockout" rather than "Out for this clue" for latency-tolerant play. |
| K17 | Leaderboard | Ranking thresholds are fixed (3 games for win %/average, 10 answers for accuracy). | Configurable thresholds not implemented. |
| K18 | Navigation | Host back arrow appears only on setup/results (returns to the game list); during live play the drawer is the navigation (deliberately no accidental exit). | — |
