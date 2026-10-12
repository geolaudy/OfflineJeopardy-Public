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
