# Joy-Cons through Apple TV + Steam Link (R7-32)

Research date: 2026-10-17. Research only: no application code was changed. None of the Apple TV / Steam Link behaviour described here has been tested on real hardware by us.

Evidence labels: **[P]** primary source (vendor docs or source code), **[S]** secondary source (press or community report), **[C]** our code, **[I]** my inference, not confirmed by a source.

## Owner's setup and what was observed

- The Windows desktop running OfflineJeopardy has **no Bluetooth**.
- Steam Link on an **Apple TV** streams that desktop to the TV.
- Joy-Cons are paired to the **Apple TV** and reach the PC through Steam Link.
- What the owner saw:
  - Both Joy-Cons showed up as **one** controller.
  - L/R and ZL/ZR could not be chosen as the buzz button.
  - OfflineJeopardy did not recognise the controllers the way it should.

## Verdict: partially feasible

Each Joy-Con can be its own buzzer through Apple TV + Steam Link **only if all of these hold**:

1. **The Joy-Cons are split on the Apple TV.**
   - By default, tvOS joins a connected L+R pair into one controller.
   - Holding **Capture (on L) + Home (on R) for a few seconds** splits them, and doing it again joins them. [S] This comes from an Apple engineer quoted by TechCrunch, and MacRumors says the same.
2. **OfflineJeopardy is started by Steam** as a "non-Steam game", with Steam Input and the Steam overlay turned on for that entry.
   - Only then does Steam show the forwarded controllers to OfflineJeopardy as emulated Xbox controllers. [P] Steamworks docs.
   - Otherwise Steam applies its **Desktop Configuration**, which turns controller presses into keyboard and mouse input. [P]
3. **There are at most 4 Joy-Cons.**
   - Apple TV supports up to 4 Bluetooth game controllers, and only 1 while a Bluetooth audio device is connected. [P]
   - XInput has 4 slots, and Chromium reads at most 4 XInput pads. [P]

Even when all of that works, there are real limits:

- **Fewer buttons.** A split Joy-Con is a sideways mini-controller: stick, 4 face buttons, SL/SR, +/−. L/ZL and R/ZR are most likely not available per Joy-Con in that mode. [I]
- **No stable identity.** OfflineJeopardy only sees "Xbox 360 Controller #n", so it can't tell which physical Joy-Con is which (no MAC address). Assignments follow the slot number, which can change on reconnect.
- **No Identify or vibration.** The lights/rumble feedback isn't available through this path.
- **Extra latency.** Each press travels Bluetooth → Apple TV → network → Steam, and fair timing (D64) can't correct for that.
- **Not officially supported.** Valve's tvOS Steam Link page doesn't list Joy-Cons. [P]
- **Steam behaviour can change.** Non-Steam-game input through Remote Play has broken before. [S]

Steps 1 and 2 are settings on the Apple TV and in Steam, not in our code. **If the owner wants each Joy-Con as a reliable buzzer with every button, the recommended setup is a USB Bluetooth adapter on the PC.** Then our existing WebHID Joy-Con support works unchanged: separate L/R Joy-Cons, every button, MAC-based identity, Identify and rumble, and it was verified with real Joy-Cons in K1.

## Where each limitation comes from

| Layer | What it does | Consequence for us |
|---|---|---|
| **tvOS (GameController framework)** | Pairs each Joy-Con by Bluetooth and exposes it as a `GCController`. A connected L+R pair becomes **one** controller with product category `"Nintendo Switch Joy-Con (L/R)"`. Single Joy-Cons are `"Nintendo Switch Joy-Con (L)"` / `"(R)"` [P: SDL source, which matches these strings]. Combine/split is a system gesture (Capture+Home held) [S]. Home is reserved by tvOS and not available to apps [P: SDL tvOS code comment]. Up to 4 Bluetooth controllers [P]. Apple's public docs don't cover Joy-Con categories or the gesture [P: absence checked]. | **"Both Joy-Cons appeared as ONE controller" is tvOS's default combined mode**, not something Steam or we chose. A split Joy-Con has the reduced sideways layout [I]. |
| **Steam Link app (tvOS client)** | Reads the `GCController`s and forwards each one as a separate remote controller [I: expected; Valve doesn't document it for Joy-Cons]. Officially supported: Steam Controller, MFi, Xbox One S, DualShock 4, Razer Kishi [P]. "Setup Controller" in the app can remap or unbind buttons on the client side, and community reports say it's hard to undo (reinstalling the app resets it) [S]. | Joy-Cons work as generic controllers. Button mapping may already be altered on the Apple TV. |
| **Steam on the host PC (Steam Input / Remote Play)** | Remote Play always delivers input through Steam Input [P]. For a process Steam launched, "the Steam Overlay will hook traditional gamepad input APIs such as XInput, DirectInput, RawInput, and Windows.Gaming.Input and inject an emulated Xbox controller device" [P]. That emulated device exists **per process**: the documented RawInput path contains the game's ProcessID, `\\.\pipe\HID#VID_045E&PID_028E&IG_00#…#{Gamepad Index}#{ProcessID}` [P]. If no Steam-launched game has focus, the **Desktop Configuration** maps the controller to mouse and keyboard [P]. Steam has supported Joy-Cons individually or as pairs since the client beta of 2022-08-04 [P via S]. | **OfflineJeopardy, started normally (portable exe, Start menu), sees no gamepads at all.** It only receives whatever keys or clicks the Desktop Configuration produces. Different controllers can't be told apart that way, and buttons mapped to mouse clicks or reserved keys (Esc, Tab) never become buzzes. That is a likely cause of "not recognised" and "buttons unavailable" [I]. |
| **Electron / Chromium Gamepad API** | XInput pads get the id `"Xbox 360 Controller (XInput STANDARD GAMEPAD)"` and `mapping: "standard"`. Only 4 slots (`XUSER_MAX_COUNT`). Triggers become buttons 6/7 with `pressed = value ≥ XINPUT_GAMEPAD_TRIGGER_THRESHOLD` (30/255) [P: Chromium `xinput_data_fetcher_win.cc`]. Electron's `backgroundThrottling: false` (already set for both windows, `src/electron/main.ts:117,170`) also keeps the Page Visibility API "visible", so an occluded main window should still be polled [P: Electron docs; not tested for gamepads]. Whether Steam's hook reaches Chromium's gamepad polling inside Electron is **unverified** [I]. | Once Steam presents the pads, the Gamepad API path we already have should see them, triggers included. |
| **OfflineJeopardy** | `pollPads` (`src/web/lib/inputBridge.ts:220-242`) reads every standard gamepad and emits **every** button as `B0…B16`, triggers included (`.pressed`, line 230). Identity is `gamepad:<index>:<id>` (line 227), so identical virtual pads differ only by slot index. The label is the raw id cut to 40 characters (line 231). Server side, `ControllerRegistry.handle` (`src/server/controllers.ts:59-97`) treats gamepads like any other device. Assigning by "press a button" accepts any button. **But** the per-controller *Buzz button* dropdown offers only `any, B0, B1, B2, B3` for gamepads (`src/web/components/ControllersPanel.tsx:15`). Under "Any button", `NON_BUZZ_BUTTONS` (`src/shared/protocol.ts:104`) excludes only Joy-Con names, so Back/Start/Guide/stick clicks on a gamepad also buzz. Gamepad input has no automated or hardware tests. | **"L/R/ZL/ZR unavailable for assignment" is partly ours:** B4–B7 can't be picked individually in the dropdown, although "Any button" does accept them. Labels are cryptic, and there's no help text for streamed controllers. |

## What OfflineJeopardy sees on Windows in this setup

1. **OfflineJeopardy started normally**, with Steam Link streaming the desktop:
   - There's no gamepad and no HID device. Only keyboard/mouse events from Steam's Desktop Configuration arrive.
   - Every Joy-Con produces the same keys, so they can't become separate buzzers. [P+I]
   - Esc and Tab are reserved in our keyboard bridge (`inputBridge.ts:246`), and the keyboard bridge only listens in the board window.
2. **OfflineJeopardy started from Steam as a non-Steam game** (Steam Input on, overlay on):
   - Each controller forwarded by the Apple TV should appear as one `"Xbox 360 Controller (XInput STANDARD GAMEPAD)"` in the Gamepad API, up to 4.
   - If the Joy-Cons are combined on tvOS, the pair is **one** pad: left-half buttons are D-pad B12–B15, L B4, ZL B6, − B8; right-half buttons are face buttons B0–B3, R B5, ZR B7, + B9.
   - If split, each Joy-Con is its own pad with a reduced set (face buttons, SL/SR probably as B4/B5) [I].
   - This is unverified for Electron. Community reports conflict about non-Steam programs receiving Remote Play controllers [S].
3. **WebHID never sees these Joy-Cons.** They're connected to the Apple TV, not to the PC, so the `joycon:<mac>` path (Identify, rumble, MAC identity) doesn't apply.

Quick diagnosis for the owner:
- Open Buzzers/Controllers on the game PC and press L, R, ZL, ZR in turn.
- If rows named "Xbox 360 Controller …" appear and *Last input* shows `B4`/`B5`/`B6`/`B7`, the gamepad path works and only the dropdown limits them.
- If rows appear as "Key …", or nothing appears, Steam's Desktop Configuration is active, so start OfflineJeopardy from Steam.

## What is under our control

- Already working, as far as the code goes: any standard gamepad is read, all buttons and triggers are reported, and press-to-assign accepts any button.
- **Under our control:**
  - Offer every gamepad button in the dropdown (P1).
  - Exclude system buttons from "Any button" (P2).
  - Give friendlier labels (P3).
  - Add help text for streamed controllers (P4).
  - Optionally let one combined controller act as **two buzzers** by splitting it into a left half and a right half (P5). That would give each Joy-Con of a tvOS-combined pair its own buzzer, with all buttons on each half and no tvOS split gesture needed.
- **Not under our control:**
  - tvOS combining and button set, and the 4-controller limit.
  - Steam Link's client mapping.
  - Steam Input's per-process injection and the Desktop Configuration.
  - Virtual pads having no stable identity.
  - Streaming latency.
  - No rumble or lights through this path.

## Recommended alternatives (ranked)

1. **USB Bluetooth adapter on the desktop.** Best option, and no code changes.
   - Pair Joy-Cons directly with Windows. Our WebHID path then gives separate L/R Joy-Cons, all buttons, a stable MAC-based identity, Identify and rumble. This setup is already verified with real Joy-Cons (K1).
   - Choose a Bluetooth 5.x adapter from a known brand with a **Realtek RTL8761B/RTL8761BU** chip, e.g. TP-Link UB500, ASUS USB-BT500, UGREEN CM390. If the PC has a PCIe/M.2 slot, an **Intel AX200/AX210** Wi-Fi+BT card also works.
   - Avoid unbranded "CSR 5.0" dongles, which are often clones.
   - On Windows 10, RTL8761B adapters may need the vendor or Windows Update driver.
   - Pair Joy-Cons one at a time, and keep the PC within a few metres or use a USB extension cable. [S: community reports, e.g. xpadneo dongle list; not tested by us with these exact models]
2. **Laptop with built-in Bluetooth running OfflineJeopardy, HDMI to the TV** (owner's idea).
   - Same direct WebHID path as option 1, so no Steam Link is involved for the board.
   - Downside: the laptop has to be near the players.
3. **Phones as buzzers.** Already supported, with fair timing correction (D64), and needs no extra hardware. Joy-Cons can be mixed in later.
4. **Apple TV + Steam Link with workarounds.** Partial, unverified, at most 4 Joy-Cons.
   - In Steam, add the **installed** `OfflineJeopardy.exe` as a non-Steam game, rather than the portable exe. The portable exe unpacks and runs a child process, so Steam may track the wrong process [I].
   - Under Properties → Controller, set "Enable Steam Input". Keep the Steam overlay enabled.
   - Start OfflineJeopardy from Steam / Steam Link.
   - On the Apple TV, either split the Joy-Cons (Capture + Home held) for one buzzer per Joy-Con with reduced buttons, or keep them combined and use P5 below.
   - Don't use the Steam Link app's "Setup Controller" screen on tvOS.
5. **Moonlight (tvOS client) + Sunshine (PC host)** instead of Steam Link.
   - Sunshine emulates Xbox 360 pads system-wide (`gamepad: x360`) through the **ViGEmBus** driver, so it doesn't depend on Steam injecting into Electron.
   - Moonlight supports up to 4 controllers on Apple TV.
   - The tvOS combine and button limits still apply.
   - ViGEmBus is a signed but **retired** third-party driver (repository archived 2023-11-02). Only an option if the owner accepts that. GlosSI-style wrappers have the same dependency.

Not recommended: hacks for third-party drivers or HID filters, or forcing Joy-Cons to pair with both devices.

## Optional code-change proposal (for the lead; not implemented)

All changes are client/UI-side, except P5. None change arbitration.

**P1: list every gamepad button for assignment (small, safe).**
- File: `src/web/components/ControllersPanel.tsx:15`.
- Replace `gamepad: ['any', 'B0', 'B1', 'B2', 'B3']` with all standard-mapping buttons plus useful groups, and show friendly labels in the `<option>` (lines 103-107):

```ts
gamepad: ['any', 'B4,B5,B6,B7', 'B4,B6', 'B5,B7', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B12', 'B13', 'B14', 'B15'],
// labels: B0 "A (bottom)", B1 "B (right)", B2 "X (left)", B3 "Y (top)", B4 "LB / L", B5 "RB / R",
// B6 "LT / ZL", B7 "RT / ZR", B12–B15 "D-pad up/down/left/right",
// 'B4,B5,B6,B7' "Any shoulder or trigger", 'B4,B6' "L or ZL", 'B5,B7' "R or ZR"
```

- No server change is needed: `isBuzzButton` (`src/shared/protocol.ts:106-109`) already accepts comma lists.
- Triggers need no new threshold, because Chromium already sets `pressed` for XInput triggers at 30/255.
- Optional hardening for non-XInput pads with analog-only triggers, in `inputBridge.ts:230`: `gp.buttons.map((b) => b.pressed || b.value >= 0.5)`.

**P2: "Any button" excludes system buttons on gamepads too (small).**
- File: `src/shared/protocol.ts:104`.
- Add `'B8', 'B9', 'B10', 'B11', 'B16'` (Back/−, Start/+, stick clicks, Guide/Home) to `NON_BUZZ_BUTTONS`, matching what is excluded for Joy-Cons.
- This doesn't collide with Joy-Con or keyboard button names.
- It is a behaviour change for existing gamepads: Start no longer buzzes under "Any button". Update the help text at `ControllersPanel.tsx:150`.

**P3: readable label for virtual Xbox pads (small).**
- File: `src/web/lib/inputBridge.ts:231`.
- When `gp.mapping === 'standard'` and `/XInput/i.test(gp.id)`, use the label `Controller ${gp.index + 1} (Xbox-compatible)` instead of the raw id cut to 40 characters.
- Leave the `controllerId` format (line 227) unchanged, so saved assignments stay valid.
- Labels are stored only when a device is first seen (`controllers.ts:43-56`), so existing rows keep their old label.

**P4: help text (small).**
- File: `src/web/components/ControllersPanel.tsx:144-151` (Troubleshooting list). Add:
  - "Joy-Cons connected to an Apple TV (Steam Link) appear as 'Xbox-compatible' controllers only when OfflineJeopardy is started from Steam (add it as a non-Steam game, enable Steam Input). Apple TV joins a pair into one controller; hold Capture + Home for 3 s to split them. Up to 4. Identify and vibration don't work this way."
  - "Best: a USB Bluetooth adapter on this PC."

**P5: split one gamepad into left/right buzzers (medium; touches the DB; lead's call).**
- Effect: a tvOS-combined Joy-Con pair, or any shared pad, gives two buzzers.
- Add a per-controller `split` flag:
  - Migration: `ALTER TABLE controllers ADD COLUMN split INTEGER NOT NULL DEFAULT 0`.
  - Add `split?: boolean` to `ControllerInfo`.
  - Accept `split` in `controllerConfig`.
  - Add a toggle in the controller row, shown only for `kind === 'gamepad'`.
- In `ControllerRegistry.handle` (`src/server/controllers.ts:73-96`), before the filter, map a button event from a split device to a logical id:
  - `${id}#L` for `B4, B6, B8, B10, B12–B15`.
  - `${id}#R` for `B0–B3, B5, B7, B9, B11`.
  - Upsert both logical devices (labels "… left half" / "… right half").
- Assignment, debounce and arbitration then work unchanged on the logical ids.
- Tests: unit tests for the mapping, plus a simulated-gamepad e2e test (none exists for gamepads yet).

## Uncertainties and what to verify on real hardware

- The Capture+Home split gesture on current tvOS, and the button set of a split Joy-Con. Only secondary sources (2022) cover these.
- Whether Steam Link tvOS forwards each split Joy-Con as its own remote controller.
- Whether Steam's Xbox emulation reaches Chromium's gamepad polling in Electron, for both the installed and the portable build.
- Steam Input slot order across reconnects.
- Behaviour when the main (host) window is behind the fullscreen board window.
- Added latency of the streamed path compared with phones.

## Sources

Primary:
- Apple Support, "Connect a wireless game controller to your Apple device" (Apple TV: up to four Bluetooth game controllers; one with a Bluetooth audio accessory): https://support.apple.com/en-us/111099
- Apple Developer, GameController: `GCController` https://developer.apple.com/documentation/gamecontroller/gccontroller, `physicalInputProfile` https://developer.apple.com/documentation/gamecontroller/gccontroller/physicalinputprofile, `GCDevice.productCategory` https://developer.apple.com/documentation/gamecontroller/gcdevice/productcategory, `GCSupportedGameControllers` https://developer.apple.com/documentation/bundleresources/information-property-list/gcsupportedgamecontrollers, `GCSupportsMultipleMicroGamepads` https://developer.apple.com/documentation/bundleresources/information-property-list/gcsupportsmultiplemicrogamepads. The public docs list no Joy-Con product-category constants and no combine gesture.
- SDL source, Apple MFi joystick driver (Joy-Con product-category strings `Nintendo Switch Joy-Con (L)/(R)/(L/R)`; Home button reserved on tvOS): https://github.com/libsdl-org/SDL/blob/main/src/joystick/apple/SDL_mfijoystick.m
- Valve, Steam Support "Apple Steam Link App" (supported controllers list): https://help.steampowered.com/en/faqs/view/4C03-C8BA-3EA1-B26A
- Steamworks, "Steam Input Gamepad Emulation – Best Practices" (overlay hooks XInput/DirectInput/RawInput/WGI, injects an emulated Xbox controller, Remote Play uses Steam Input, per-process RawInput path, slots 0–3): https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices
- Steamworks, "Getting Started for Players" (Desktop Configuration): https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_players
- Valve, Steam Client Beta announcement, Aug 4 2022 ("Added support for Nintendo Joy-Con controllers, both individually as a mini-gamepad and combined into pairs", quoted by Nintendo Life): https://steamcommunity.com/groups/SteamClientBeta/announcements/detail/3387288790681635164
- Chromium `device/gamepad/xinput_data_fetcher_win.cc` (id string, standard mapping, trigger threshold, 4 slots): https://source.chromium.org/chromium/chromium/src/+/main:device/gamepad/xinput_data_fetcher_win.cc
- Electron `webPreferences.backgroundThrottling` (also affects the Page Visibility API): https://github.com/electron/electron/blob/main/docs/api/structures/web-preferences.md
- Sunshine configuration (`gamepad`: `x360`/`ds4` on Windows): https://docs.lizardbyte.dev/projects/sunshine/master/md_docs_2configuration.html
- ViGEmBus repository (retired, archived 2023-11-02): https://github.com/nefarius/ViGEmBus
- Moonlight Game Streaming, App Store listing (Apple TV, up to 4 controllers): https://apps.apple.com/us/app/moonlight-game-streaming/id1000551566

Secondary (press and community; treat with caution):
- TechCrunch, 2022-06-07, quoting Apple engineer Nat Brown on the Capture+Home combine/split gesture: https://techcrunch.com/2022/06/07/ios16-nintendo-switch-joycons/
- MacRumors how-to (two Joy-Cons appear as one unified controller; hold Capture + Home to switch): https://www.macrumors.com/how-to/pair-nintendo-joy-con-iphone-ipad-apple-tv/
- Nintendo Life on the Steam Joy-Con beta: https://www.nintendolife.com/news/2022/08/valves-steam-client-beta-adds-support-for-nintendo-switch-joy-con-controllers
- Steam Remote Play group, 2022: a non-Steam program launched from Steam receives remote controls: https://steamcommunity.com/groups/homestream/discussions/0/3415433928535931085/
- Steam Remote Play group, 2023–2024: non-Steam games stopped receiving Steam Link controllers: https://steamcommunity.com/groups/homestream/discussions/0/3784750482955714997/
- Steam Link forum, 2023: Apple TV 4K + PS4 controllers, only one controller functional, controllers hard to tell apart: https://steamcommunity.com/app/353380/discussions/0/3727324491574630759
- "Reset Controller Buttons on Steam Link for tvOS" (2021; Setup Controller remaps buttons, fixed by reinstalling): https://joshmccarty.com/reset-controller-buttons-on-steam-link-for-tvos/
- xpadneo Bluetooth dongle list (RTL8761B/BU reports, Linux): https://github.com/atar-axis/xpadneo/blob/master/docs/BT_DONGLES.md
