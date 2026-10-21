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

#### Buzzinga media (R7-30.1, 2026-10-18)

Why imported boards lost their pictures and sounds: Buzzinga stores *uploaded* media as a key in its public storage bucket, not as a web link. Static reading of the shipped client (https://play.buzzinga.io/assets/index-*.js, one download, no sign-in, no automation) shows the player rendering images and audio as `https://buzzinga.s3.us-east-2.amazonaws.com/${key}` (`<img src>` / `<source src>`), while media pasted from elsewhere stays a full URL; the client also preloads `clue.text` / `clue.answer` for IMAGE/AUDIO clues (so those fields carry the media, as the parser assumed). Our importer only accepted http(s) links, so every uploaded file was skipped as "Not a downloadable web link". Fix: a key (letters, digits, `._~%/-`, no spaces, no `..`) is resolved against that bucket; full links are used as they are; YouTube stays a host note. A clue whose media still fails shows "(The image for this clue could not be imported — see the host notes.)" with the original reference in its notes (never a blank clue). Not verified against a live board (no public share id was used).

## Joy-Con rumble (Z12, 2026-10-13)

- Vibration must be enabled once with subcommand **0x48, arg 0x01** (sent after the 0x03 input-mode and 0x30 player-light subcommands).
- Rumble-only output report **0x10**: `[packet counter (0-15), 4 bytes left, 4 bytes right]`. A single Joy-Con uses its own half; we send the same 4 bytes in both halves.
- Each half encodes a high band (81.75–1252 Hz) and a low band (40.875–626 Hz) plus amplitude. Encoding (community documentation, dekuNukem *Nintendo_Switch_Reverse_Engineering* `rumble_data_table.md`, also used by JoyconLib): `hf = (round(32·log2(f/10)) − 0x60)·4`, `lf = round(32·log2(f/10)) − 0x40`, amplitude piecewise from `log2(amp·1000)·32 − 0x60`. Neutral = `00 01 40 40` (320 Hz / 160 Hz, amplitude 0); amplitude 1.0 → high-band amplitude code `0xC8`. Implemented in `src/shared/joyconRumble.ts` with unit tests for these documented values.
- Joy-Cons stop vibrating after a short time without new rumble data, so patterns resend every ≤80 ms and always end with the neutral packet.
- Not verified on hardware yet (see KNOWN_ISSUES K25).

## Google Gemini API (R5-11, 2026-10-15)

Sources (fetched 2026-10-15 as Markdown from ai.google.dev): API reference `api/models`, `api/generate-content`; guides `gemini-api/docs/structured-output`, `rate-limits`, `troubleshooting`, `api-errors`, `thinking`, `api-key`, `pricing`, `gemini-api/terms`; `google/rpc/error_details.proto` (googleapis on GitHub) for RetryInfo / QuotaFailure.

- Base URL `https://generativelanguage.googleapis.com/v1beta`. Auth: header `x-goog-api-key: <key>` (the docs' curl examples also show `?key=` — we never use it, so the key cannot end up in a URL, log or error).
- `GET /models?pageSize=&pageToken=` → `{ models: Model[], nextPageToken? }` (default 50 per page, max 1000; no token = last page). `Model`: `name` ("models/…"), `baseModelId`, `displayName`, `description`, `inputTokenLimit`, `outputTokenLimit`, `supportedGenerationMethods[]` (e.g. "generateContent", "embedContent", "predict"), `thinking` (bool), `temperature`, … We keep only models with "generateContent" and show `displayName (id)`. No model name is hardcoded: the docs' own examples now use names like `gemini-3.8-flash` / `gemini-4-argon`, older names are marked deprecated, and the free tier covers only some models (e.g. Gemini 4 Argon is "not available on the Free tier").
- `POST /models/{model}:generateContent` body: `systemInstruction: { parts: [{ text }] }`, `contents: [{ role: "user", parts: [{ text }] }]`, `generationConfig: { maxOutputTokens, responseMimeType: "application/json", responseSchema, thinkingConfig }`.
  - `responseSchema` (OpenAPI subset: `type` enum STRING/NUMBER/INTEGER/BOOLEAN/ARRAY/OBJECT, `properties`, `required`, `items`, `propertyOrdering`; no `additionalProperties`) is marked **deprecated** in the current reference in favour of `responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } }` (and `responseJsonSchema`). We still send `responseMimeType` + `responseSchema` because it is the form supported across all current and older generateContent models; if a model rejects an optional setting (HTTP 400 INVALID_ARGUMENT mentioning schema/thinking/unknown field) we retry once without the optional settings and remember that model (prompts also ask for JSON, and the parser tolerates prose).
  - `maxOutputTokens` includes thinking tokens on thinking models (a reply can come back empty with `finishReason: MAX_TOKENS`), so budgets match the Anthropic ones (512 test / 1024 answer / 2048 clue / 16000 board).
  - `thinkingConfig.thinkingLevel` (MINIMAL/LOW/MEDIUM/HIGH) — "recommended for Gemini 3 or later; use with earlier models results in an error"; "an error will be returned if [thinkingConfig] is set for models that don't support thinking". We send `LOW` for quick requests (test/answer/clue) unless models.list said `thinking: false`; the retry above covers models that reject it. Board generation keeps the model default.
  - `temperature` is not sent: Google recommends keeping defaults for Gemini 3.x ("setting the temperature below 1.0 can cause … looping") and it is "silently ignored on Gemini 3.6 Flash and newer".
  - Response: `candidates[0].content.parts[].text` (skip parts with `thought: true`), `candidates[0].finishReason` (STOP, MAX_TOKENS, SAFETY, RECITATION, BLOCKLIST, PROHIBITED_CONTENT, SPII, …), `promptFeedback.blockReason` when the prompt was blocked (no candidates). Blocked → treated as a refusal (offline fallback).
- Errors (generateContent uses the standard Google API error body): `{ "error": { "code": 429, "message": "...", "status": "RESOURCE_EXHAUSTED", "details": [ { "@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [ { "quotaMetric": "…generate_content_free_tier_requests", "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", … } ] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "43s" } ] } }`. `retryDelay` is a protobuf Duration in JSON ("43s", "1.5s"). Bad key: 400 INVALID_ARGUMENT, ErrorInfo `reason: API_KEY_INVALID`. 403 PERMISSION_DENIED, 404 model not found, 402 prepaid credit depleted ("don't retry"), 400 FAILED_PRECONDITION (e.g. billing/region), 500/503/504 transient. (The newer Interactions API uses a different snake_case error shape; we do not use that API.)
- Rate limits: per project (not per key), measured as RPM, TPM and RPD; RPD resets at midnight Pacific time; preview models are more limited; actual limits are shown in AI Studio, not in the docs. Google recommends backoff on 429/503 and no retry on 400/402/403.
  - Our handling: a 429 puts the provider into a cooldown for `retryDelay` (else `Retry-After`, else 60 s; at least 5 s). A per-day quota (`quotaId` containing "PerDay") pauses until midnight Pacific. During a cooldown bots answer offline immediately and no request is sent; "Test connection" still sends one request (the host's way to check again) and ends the cooldown when it works; saving a new key also ends it.
- Free tier and data use (terms "Unpaid Services"): with unpaid quota Google uses submitted content and responses "to provide, improve, and develop Google products", and human reviewers may read it; "do not submit sensitive, confidential, or personal information". We send only the clue, category and expected answer (nothing about players). Paid tier: content not used to improve products. Usage beyond the free tier / with billing costs money.
- Keys: created in Google AI Studio (`aistudio.google.com/apikey`).
- SDK decision: plain `fetch` (no `@google/genai` dependency) — the two REST calls are small, the request/response shapes above are stable, and plain fetch lets tests inject a fake and assert the key is only in the header.
- Not verified against the real service (no Gemini key available during development): exact current model names, whether `thinkingLevel: LOW` is accepted by every listed model, and the exact 429 body for daily-quota exhaustion.

## Buzzer latency fairness (R6-16…R6-21, 2026-10-17)

Full write-up: [`docs/BUZZER_FAIRNESS_RESEARCH.md`](docs/BUZZER_FAIRNESS_RESEARCH.md). Sources, confirmed findings, unknowns, comparison of approaches A–E and the recommended design are all there.

- **Commercial apps:** BuzzIn.live lists "Latency correction" and shows "+0.18s" gaps; Buzzinga says it "does its best to handle … latency". **Neither documents how it works.** Nothing about their internals is assumed.
- **Open-source apps:** Multibuzzer and Protobowl decide by server arrival. Protobowl syncs clocks for display only. Friendly-Feud subtracts the full mean RTT, uncapped. BuzzCast only displays ping.
- **Recommendation (approach E):** server-initiated sync probes, with server-measured RTT and min-half-width offset selection. Phones send `pointerdown` `Event.timeStamp`. Compensation is clamped to `[0, min(50 ms, rttMedian + 2·jitter + 25 ms)]`. An adaptive arbitration window of at most 60 ms ends early once no eligible device could still be earlier. Early buzzes are judged by corrected press time, penalised only when confident (fixes K16). "N ms before you" is shown only when the gap exceeds the combined uncertainty and 25 ms.
- **Joy-Con and keyboard bridge:** no network compensation. Only the TV-renderer dispatch delay is compensated (via `timeStamp`, cap 30 ms). Bluetooth and 60 Hz report latency are treated as uncertainty.
- **Needs a DECISIONS entry superseding D15.** Client timestamps become bounded hints, and the server stays authoritative.
- **Not fetched:** the Valve wiki returned HTTP 403, so only its search summary was used; there was no workaround attempt. Unverified: per-platform semantics of touch and WebHID `timeStamp`, and inter-model touch-pipeline bias (needs a slow-motion video check).

## Board reference (R7-5, session 9)

Source: Wikimedia Commons `Jeopardy!_game_board_US.svg` (viewBox 324.86 × 192.13; text is outlined
as paths, each drawn twice — a black copy and an offset coloured copy, i.e. a hard shadow). Rendered
with sharp at 5000 px and measured:

| Property | Value |
|---|---|
| Background / gutters | black `#000` |
| Tile | `#071277`, 50.574 × 28.287 (aspect 1.79) |
| Column gap | 3.08 (6.1 % of tile width); outer margin 3.0 |
| Row gap | 2.83 between clue rows (10 % of tile height); 4.77 between the category row and the first clue row |
| Value text | gold `#d69f4c`, glyph height ("$" incl. bars) 53 % of tile height, centre at 49 %; "$1000" fills 72 % of the tile width |
| Value shadow | black, no blur, offset ≈ +0.80 x / +0.74 y = **2.8 % / 2.6 % of tile height** |
| Category text | white `#fff`, cap height 25 % of tile height per line, line pitch ≈ 1.22 × cap height, max width ≈ 86–88 % of the tile |
| Category shadow | black, no blur, offset ≈ +0.31 x / +0.34 y = **1.1 % / 1.2 % of tile height** (subtler than the values) |

Typeface: condensed heavy grotesque (Swiss 911 Compressed look); we keep the bundled OFL Anton
(already used) — no commercial font is downloaded (spec §5.6).

## Joy-Cons through Apple TV + Steam Link (R7-32, session 9)

Full write-up with sources: docs/JOYCON_APPLETV_STEAMLINK.md. Verdict **partially feasible**: tvOS
combines a left+right pair into one "Joy-Con (L/R)" controller (split with Capture + Home, per press
reports); Steam Link forwards controllers only into a process Steam launched (Steam Input injects
emulated Xbox pads; otherwise the Desktop Configuration turns presses into keys/mouse); Joy-Cons are
not on Valve's supported list for Steam Link on tvOS. Our side: gamepad buttons B4–B7 (shoulders,
triggers) are now selectable, menu buttons never buzz, XInput pads get numbered labels. Best
practical option: Bluetooth adapter on the PC (existing WebHID path, verified K1).

## Sign-in-based AI connections (R7-30.4, 2026-10-18)

Question: could the host connect Claude, Gemini or ChatGPT by signing in with an existing account instead of pasting an API key? Official methods only. Desk research (web searches, 2026-10-18); nothing was implemented or tried with real accounts.

- **Claude (Anthropic): not allowed.** Anthropic's consumer terms reserve the OAuth tokens of Free / Pro / Max plans for Claude Code and Claude.ai; third-party apps must use an API key from the Claude Console (or a supported cloud provider). Secondary coverage of the February 2026 documentation update and its enforcement (gigazine.net, winbuzzer.com, docs.moltis.org); the official Legal and Compliance page should be re-checked before any change. → Keep the API key.
- **Gemini (Google): possible, but heavy.** The Gemini API has an official OAuth 2.0 path (https://ai.google.dev/gemini-api/docs/oauth): a Google Cloud project with the Generative Language API, an OAuth consent screen, a *desktop* client ID (one per platform) and user credentials. The quickstart is a testing setup (test users); distributing it to everyone needs a published, Google-verified OAuth app owned by us, and usage then counts against the signing-in user's project. → Feasible later as "Sign in with Google" (loopback/desktop flow, token stored like the key), not worth it now: a free-tier API key from AI Studio is simpler and does the same.
- **ChatGPT (OpenAI): not available to us.** "Sign in with ChatGPT" was announced in 2025 (first in Codex CLI) and is reported as a beta for named partner apps (techcrunch.com 2025-05-27; later reports list Airtable, GitLab, HubSpot, Notion, Supabase, Vercel). No open developer programme was found; OpenAI's own docs were not reached in this search. → Use an OpenAI API key with the "OpenAI-compatible" provider.
- **Local AI (Ollama / LM Studio)** needs no sign-in, no key and no internet — the recommended offline option.

Decision: no sign-in connection now; API keys (Gemini's free tier for the easiest start) and local AI stay. Revisit Google OAuth if the owner wants "Sign in with Google", and ChatGPT sign-in if OpenAI opens it to developers.

## iPadOS status bar in a Home Screen web app (round 16, R16-16, 2026-10-21)

Question: can the host controller's Home Screen app show a navy status bar on iPadOS 26 (as the owner has seen elsewhere), with supported mechanisms only? Desk research by the research agent (about five searches and two page fetches; moderate confidence). No Apple documentation or Safari 26.x release note covers it.

- `apple-mobile-web-app-status-bar-style`: `default` = opaque bar with dark text (what the owner sees: white); `black` = opaque black bar, white text; `black-translucent` = clear bar, white text, the page drawn underneath (the classic way to a coloured bar: the header's background under the bar with `padding-top: env(safe-area-inset-top)`).
- theme-color (meta or manifest) is reported as **not applied** to a Home Screen app's bar on iOS 26 (zenn.dev/timelab/articles/b471d6beed9f6e; older Apple forum thread 649131). One Glide community thread claims the colour still changes on 26.1 without saying how (community.glideapps.com/t/85272).
- **WebKit bug 301994** (bugs.webkit.org/show_bug.cgi?id=301994): since iOS 26.1 Home Screen apps no longer draw under the status bar — `env(safe-area-inset-top)` reports 0 and the system draws its own rectangle there, even with `viewport-fit=cover` and `display: standalone`; fixed in 26.2, **regressed again in 26.5.x and the iOS 27 beta, reopened 2026-08-04 (P2)**. This matches what the owner saw with rc.2 (a strip / gradient and content pushed down).
- The colour is reported as cached and updated after a relaunch; the status-bar style is read when the app starts from its icon — **remove and re-add the Home Screen icon after any change**.
- Nothing web-specific was found on the iOS 26 top-edge fade's colour (only SwiftUI's scrollEdgeEffectStyle).

Decision (D112): keep the plain `default` bar (white) — the only predictable result. A future attempt, once 301994 is fixed on the owner's iPadOS: `black-translucent`, html / body and the header in navy, `padding-top: env(safe-area-inset-top)` only (no extra 2.75rem, no painted strip), checked on the device with a temporary inset readout. K55 stays open.
