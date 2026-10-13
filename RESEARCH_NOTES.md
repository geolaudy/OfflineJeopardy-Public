# Research Notes

## Environment (verified 2026-10-12)

- Windows 10 Home 10.0.19045, Node v24.21.0, npm 11.19.0, Git 2.45.1, Python 3.15.
- Electron 44.7.0 → bundled Node 24.21.0. `node:sqlite` works under `ELECTRON_RUN_AS_NODE` (verified with an in-memory DB).
- `crypto.argon2Sync` exists in Node 24 but throws "Argon2 algorithm not supported" in Electron (BoringSSL) → scrypt chosen (DECISIONS D3).
- sharp 0.35 prebuilt win32-x64 binary loads in Node (N-API, so the same binary loads in Electron).
- npm 11 blocks install scripts by default; approved `esbuild` and `electron-winstaller`.

## REA (morluto/rea)

- The REA MCP server is installed and responds (tool calls return structured results; `list_browser_targets` returned `endpoint_unreachable` because no Chrome debugging target was running — expected).
- **Not used for implementation so far.** All features built so far (board, scoring, timers, profiles, teams, stats, WebSocket sync) are ordinary functionality the policy says to implement independently. Buzzer arbitration semantics were defined from the project spec (first valid buzz, team-aware lockout, arrival-order determinism), so no reference investigation was needed.
- Candidate future use: if a reference behaviour question comes up that the spec doesn't settle (e.g. exact early-buzz penalty timing in a reference product), use REA's browser observation tools on publicly accessible pages only — never to copy code, assets or branding.

## Joy-Con input on Windows

**Goal:** independent L/R Joy-Cons paired directly with Windows Bluetooth, without third-party mapping software (BetterJoy, x360ce, etc.).

Options considered:
1. **XInput / DirectInput** — Joy-Cons are not XInput devices; Windows exposes each paired Joy-Con as a generic HID device. Not usable without mapping software.
2. **node-hid** (native) — works, but adds a native module that must be rebuilt for Electron; rejected in favour of 3.
3. **WebHID in Electron** — chosen. Chromium's WebHID can open Nintendo HID devices; Electron lets the app grant permission programmatically (`setDevicePermissionHandler`, `select-hid-device`). No native code.
4. **Gamepad API** — Chromium may expose Nintendo controllers as gamepads, but may pair L+R into one combined device and offers no stable per-device identity. Kept as a fallback for *other* controllers; Nintendo gamepads are skipped while WebHID devices are active to avoid double input.

Protocol facts used (public community documentation of the Switch controller HID protocol — dekuNukem "Nintendo_Switch_Reverse_Engineering", used in many open-source projects such as joycon-webhid):
- Vendor ID `0x057E`; product IDs `0x2006` Joy-Con (L), `0x2007` Joy-Con (R), `0x2009` Pro Controller.
- Output report `0x01` = rumble data (8 bytes, neutral `00 01 40 40 00 01 40 40`) + subcommand id + args; 4-bit global packet counter.
- Subcommand `0x03 0x30` → standard full input report mode (report `0x30` at ~60 Hz).
- Report `0x30` (data excluding report id): byte 2 = right buttons (Y,X,B,A,SR,SL,R,ZR), byte 3 = shared (−,+,RStick,LStick,Home,Capture), byte 4 = left buttons (Down,Up,Right,Left,SR,SL,L,ZL).
- Subcommand `0x02` → device info reply in report `0x21`; data[13] = subcommand id (`0x02`), MAC address at data[18..23]. Used as a stable controller id (`joycon:<mac>`), so assignments survive reconnects.
- Subcommand `0x30 <bits>` sets player lights (used for "Identify").
- Before the mode switch, Joy-Cons send simple-HID report `0x3F`; we treat its set bits generically (any button buzzes).

**Unverified (needs real hardware):** whether Chromium on Windows allows WebHID to open Joy-Cons while its own gamepad backend also has them open; MAC reply offsets on all firmware versions; behaviour of Switch 2 Joy-Cons (different product IDs/protocol — not supported until investigated). See KNOWN_ISSUES.md.

## iPad Safari

- Host UI avoids hover-only interactions; buttons ≥ 44 px (primary ≥ 56 px); double-submit protection through `ActionButton`.
- Web Audio is unlocked on first user gesture (iOS requirement).
- `localStorage` may be unavailable in private browsing; tokens fall back to memory for that page session.
- Automated tests run the host UI in Playwright WebKit with the iPad Pro 11 landscape descriptor. Real-iPad validation is still required (KNOWN_ISSUES).

## Board importing (R2-20/R2-21)

Investigated 2026-10-13. Code: `src/server/importers/**`, `src/server/importRoutes.ts`, `src/web/pages/desk/ImportFromSource.tsx`. Tests: `tests/unit/importers.test.ts`, `tests/integration/import.test.ts`, fixtures in `tests/fixtures/import/`.

### Architecture

Separate stages, one module each: the source plugin parses its input (`sources/*.ts`) → normalised `NormalizedBoard` (media kept as source URLs, plus attribution) → `pipeline.applyLimits` clamps to app limits with warnings → `media.acquireMedia` downloads permitted media (`net.safeGet`: http(s) only, SSRF checks, 50 MB per file, 500 MB per import, 300 files, 60 s per file, only `image/*` (no SVG), `audio/*`, `video/*`, octet-stream) and hands the bytes to the server's `storeClueMedia`, which validates them again by content → `pipeline.buildContent` + `validateContent` (`boardContentSchema` + `validateBoard`) → `saveBoard`. A registry (`registry.ts`) holds `ImportSource` plugins (`id`, `label`, `detect`, `parse`); the first plugin whose `detect` matches wins. Site-specific logic exists only inside its plugin.

Routes (host-only): `POST /api/import/inspect` (keeps the parsed result for 10 min, max 5 pending), `GET /api/import/:id/preview?key=`, `POST /api/import/commit`, `DELETE /api/import/:id`. Commit validates every board before saving any; on failure all media stored during that commit are deleted (and boards already saved in a multi-board commit, via `deleteBoard`).

**Media rule (decision):** media that can never be imported (YouTube, local file names, non-links) is listed in the preview as missing. Media that fails to *download* at commit time (HTTP error, wrong type, too large, timeout, rejected by validation) is skipped and reported in the commit response; the board is still created with the clue text. `requireAllMedia: true` makes any media failure roll the whole import back (API only, not exposed in the UI). Reason: a preview cannot know whether a download will succeed without downloading everything twice.

**SSRF / offline:** only http/https without credentials; `localhost`, `*.local`, `*.internal`, `*.lan`, single-label hosts and every loopback/private/link-local/CGNAT/multicast/reserved address (including IPv4-mapped IPv6) are refused. The address check also runs inside the DNS lookup used for the actual connection (defeats DNS rebinding) and on every redirect hop (max 5). Tests may set `testing.allowPrivateNetworks` to reach the local fixture server; production code never sets it. Without internet a URL import fails with "No internet connection — importing from a link works only online; playing stays offline." File imports and gameplay never touch the network.

### Show content (decision)

OfflineJeopardy bundles no show content and never downloads or scrapes archive sites (j-archive or similar). The dataset plugin only parses a file the user chose; links inside clue text (archive pictures) are stripped and not followed — the preview says how many clues had them. The UI reminds users to use only content they have the right to use. The generic "link to a file" plugin accepts only `.csv`/`.json` text and refuses HTML pages, so it cannot be used as a page scraper.

Supported formats: (a) JSON array of clue objects (`category`, `value` "$200"/null, `question`, `answer`, `round` "Jeopardy!"/"Double Jeopardy!"/"Final Jeopardy!", `show_number`, `air_date`) — grouped by show, one board per selected show (up to 10 per commit), HTML stripped, surrounding quotes removed. The value ladder is rebuilt per round (200–1000/400–2000, or 100–500/200–1000 for older shows); off-ladder aired values (Daily Double wagers) take the free ladder slot and are marked as Daily Wagers; tie-breakers are skipped. Rounds are renamed "Round 1/2" and "Final Wager" (no show branding). (b) Generic CSV `round,category,value,question,answer[,daily_wager,notes,image,answer_image,caption,answer_caption]`; image columns accept http(s) links ("|"-separated); local file names are reported as missing (board packages remain the way to bring local media). Not done: user media folders, TSV variants of community datasets.

### Buzzinga.io (R2-20)

Sources: https://buzzinga.io/robots.txt, https://buzzinga.io/terms (effective 08/29/2025), https://buzzinga.io/help/sharing-a-board/, https://buzzinga.io/help/import-export-csv/, https://buzzinga.io/help/embedding-a-board/, https://buzzinga.io/sitemap-0.xml, and the public HTML/JS of https://play.buzzinga.io/ (static reading of the shipped bundle to learn URL formats; no REA, no login, no automation of the site).

Verified:
- `buzzinga.io/robots.txt`: `User-agent: *` / `Allow: /`. `api.buzzinga.io/robots.txt` returns 404 (no rules). `play.buzzinga.io/robots.txt` returns the app page (no rules).
- Terms: users keep ownership of their content; acceptable use forbids unlawful use, interfering with operation and uploading harmful material. No clause about automated access, scraping or API use was found. Software, design and trademarks belong to Buzzinga Games Inc. (we copy none of them).
- Sharing (help page): the owner switches a board to "Shareable" and copies a share link; recipients can view the board and must sign in only to "Save a copy". Turning "Shareable" off disables the link.
- Official export: Buzzinga Pro has "Download CSV" (board editor > gear icon). Columns (help page + the client's export function): `round,col,cat,catDescription,row,customValue,clueText,correctResponse,isDailyDouble,clueType,topCaption,bottomCaption,answerType,answerTopCaption,answerBottomCaption,buzzerActivationMode,isAudioOnly,isAnswerAudioOnly`; `round` is 1–3 or `final`; image/audio clues carry a media URL in `clueText`/`correctResponse`; video is a YouTube URL; the CSV holds links, not files.
- Share link format (client router): `https://play.buzzinga.io/share/<gameId>` (also `/embed/<gameId>`). The share page loads its data with an unauthenticated `GET https://api.buzzinga.io/api/getSharedBoard/<gameId>` (the client attaches a bearer token only when the visitor happens to be signed in). The API answers with `Access-Control-Allow-Origin: *`, a published rate limit header (`x-ratelimit-limit: 2000`), and `404 {"error":"Game board not found"}` for unknown or non-shareable ids (checked with a made-up id, also end-to-end through the importer).
- Board JSON shape as used by the client: `{ name, rounds: [ [ { category, description, clues: [ { text, answer, type: TEXT|IMAGE|AUDIO|VIDEO, answerType, value?, isDailyDouble, topCaption, bottomCaption, answerTopCaption, answerBottomCaption, ... } ] } ] ], finalRound: { categoryName, clue: {...} } }`.

Assumed / NOT verified (no real shareable board was available):
- That `getSharedBoard` returns exactly this shape for a real shareable board (inferred from client code; the parser is defensive and fails with a message recommending the CSV export).
- That `name` is the title field in that response; default values for clues without `value` (row × 200 × round number); where uploaded media is hosted (any http(s) media URL the board references is downloaded, subject to the SSRF rules).
- The endpoint is undocumented and may change without notice.

Decision: implement the `buzzinga` plugin for public share links, because the access is public, unauthenticated, authorised by the owner ("Shareable"), allowed by robots.txt and not restricted by the Terms we read. It makes one request per user action, sends no cookies or credentials, identifies itself in the User-Agent, never retries, and stops on 401/403/404/429 with an explanation. Private boards and anything behind a sign-in or paid plan are never accessed — the user is told to ask the owner to make the board shareable or to export it as CSV. The plugin also imports the official CSV export (and a saved board JSON), which is the recommended path when links fail. YouTube videos are not downloaded (the link is kept in the host notes).

## Joy-Con rumble (Z12, 2026-10-13)

- Vibration must be enabled once with subcommand **0x48, arg 0x01** (sent after the 0x03 input-mode and 0x30 player-light subcommands).
- Rumble-only output report **0x10**: `[packet counter (0-15), 4 bytes left, 4 bytes right]`. A single Joy-Con uses its own half; we send the same 4 bytes in both halves.
- Each half encodes a high band (81.75–1252 Hz) and a low band (40.875–626 Hz) plus amplitude. Encoding (community documentation, dekuNukem *Nintendo_Switch_Reverse_Engineering* `rumble_data_table.md`, also used by JoyconLib): `hf = (round(32·log2(f/10)) − 0x60)·4`, `lf = round(32·log2(f/10)) − 0x40`, amplitude piecewise from `log2(amp·1000)·32 − 0x60`. Neutral = `00 01 40 40` (320 Hz / 160 Hz, amplitude 0); amplitude 1.0 → high-band amplitude code `0xC8`. Implemented in `src/shared/joyconRumble.ts` with unit tests for these documented values.
- Joy-Cons stop vibrating after a short time without new rumble data, so patterns resend every ≤80 ms and always end with the neutral packet.
- Not verified on hardware yet (see KNOWN_ISSUES K25).
