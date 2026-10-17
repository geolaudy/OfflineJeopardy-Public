# Buzzer Latency Fairness: Research and Recommended Architecture

Research for R6-16…R6-21 (input to R6-22…R6-24). Researched 2026-10-17. Internet access worked; the exceptions are listed in §2.

Labels used throughout:

- **[Confirmed]**: stated by a cited public source (quoted or closely paraphrased).
- **[Code]**: read in public open-source code (MIT or otherwise public), or in this repository.
- **[Inference]**: my engineering reasoning from confirmed facts.
- **[General]**: general engineering knowledge with no specific source fetched in this session.
- **[Unknown]**: not publicly documented. Not guessed.

---

## 1. Applications researched

| Application | Type | What could be learned |
|---|---|---|
| BuzzIn.live | Commercial web buzzer (free; phones; "Up to 200 players") | Marketing feature list and public changelog only |
| Buzzinga.io | Commercial Jeopardy-style web game (phones + keyboard-type physical buzzers) | Help centre, FAQ, blog, CSV docs |
| Factile | Commercial Jeopardy-style web game with "Buzzer Mode" | One blog post |
| Multibuzzer (`Notunderscore/multibuzzer`, MIT) | Open-source web buzzer (boardgame.io) | Source code |
| Protobowl (`neotenic/protobowl`) | Open-source real-time online quizbowl | Source code |
| Friendly-Feud (`joshzcold/Friendly-Feud`, MIT, Go backend) | Open-source self-hosted Feud game with phone buzzers | Source code |
| BuzzCast (`bacoinz/buzzcast`) | Phone-browser buzzers for Buzz! emulation | Release notes |
| Jeopardy! (TV show) | Reference for early-buzz lockout semantics | Press coverage citing the show's blog |

## 2. Sources and links

Apps:
- BuzzIn.live home page: https://buzzin.live (feature list) and changelog: https://buzzin.live/updates
- Buzzinga: https://buzzinga.io, https://buzzinga.io/faqs, https://buzzinga.io/help/, https://buzzinga.io/help/hosting-a-game/, https://buzzinga.io/help/host-controller/, https://buzzinga.io/help/physical-buzzers/, https://buzzinga.io/help/playing-without-buzzers/, https://buzzinga.io/help/large-events/, https://buzzinga.io/help/import-export-csv/, https://buzzinga.io/how-to-play, https://buzzinga.io/blog/physical-buttons-and-buzzers
- Factile: https://www.playfactile.com/blog/why-we-built-buzzer-mode/
- QBWiki "Buzzer" (redirect from "Buzzed"): https://www.qbwiki.com/wiki/Buzzed
- Multibuzzer: https://github.com/Notunderscore/multibuzzer (`src/lib/store.js`)
- Protobowl: https://github.com/neotenic/protobowl (`client/app.coffee`, `shared/room.coffee`)
- Friendly-Feud: https://github.com/joshzcold/Friendly-Feud (`backend/api/buzzer.go`, `backend/api/ping.go`, `backend/api/room.go`)
- BuzzCast releases: https://github.com/bacoinz/buzzcast/releases
- Jeopardy! lockout: https://www.mentalfloss.com/entertainment/game-shows/why-those-jeopardy-buzzers-are-even-more-anxiety-producing-they-look (cites the show's own blog)

Techniques:
- RFC 5905 (NTPv4), §8 on-wire protocol, §10 clock filter: https://www.rfc-editor.org/rfc/rfc5905
- RFC 3550 (RTP), §6.4.1 interarrival jitter: https://www.rfc-editor.org/rfc/rfc3550
- Cristian's algorithm: https://en.wikipedia.org/wiki/Cristian%27s_algorithm
- Valve Developer Community, "Lag Compensation" and "Latency Compensating Methods…" (Bernier, GDC 2001): https://developer.valvesoftware.com/wiki/Lag_Compensation, https://developer.valvesoftware.com/wiki/Latency_Compensating_Methods_in_Client/Server_In-game_Protocol_Design_and_Optimization. **Both returned HTTP 403 to the fetch tool.** Only the search-engine summary was available; I did not try to work around the block.
- GGPO README: https://github.com/pond3r/ggpo
- MDN `performance.now()`: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
- MDN `Event.timeStamp`: https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- Chrome blog, high-resolution event timestamps: https://developer.chrome.com/blog/high-res-timestamps
- W3C Event Timing API: https://w3c.github.io/event-timing/
- Li, Wu, Chang, Mok, "Demystifying and puncturing the inflated delay in smartphone-based WiFi network measurement", ACM CoNEXT 2016, DOI 10.1145/2999572.2999595: https://research.polyu.edu.hk/en/publications/demystifying-and-puncturing-the-inflated-delay-in-smartphone-base/
- Wi-Fi beacon/listen-interval arithmetic (patent, illustrative only): US 9210656; DTIM defaults: US 9072050
- Touch latency (Agawi TouchMarks 2013, vendor benchmark): https://newatlas.com/smartphone-screen-latency/29144/
- Joy-Con HID report modes (dekuNukem): https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/bluetooth_hid_subcommands_notes.md
- Joy-Con Bluetooth button latency on Windows 11 (Gamepadla, marked "Not verified yet"): https://gamepadla.com/nintendo-switch-joy-con.html
- iOS Safari WebSocket/suspension behaviour (bug reports and forums, not official documentation): https://bugs.webkit.org/show_bug.cgi?id=247943, https://developer.apple.com/forums/thread/696310
- Crystal drift conversion (Silicon Labs RTC drift table): https://docs.silabs.com/wiseconnect/4.1.0/wifi-siwg917-rtc-management/rtc-drift-management

Repository files read: `src/server/hub.ts`, `src/server/buzzCheck.ts`, `src/shared/buzzCheck.ts`, `src/server/engine/engine.ts` (`handleBuzz`, `handleEarlyBuzz`, `buzzBlockReason`, `openBuzzers`), `src/server/engine/buzzer.ts` (`InputFilter`, `resolveInput`), `src/server/controllers.ts`, `src/server/gameManager.ts` (`buzz`), `src/web/lib/socket.ts`, `src/web/lib/inputBridge.ts`, `src/web/pages/join/PlayTab.tsx`, `src/electron/main.ts`, DECISIONS D15/D19–D21, KNOWN_ISSUES K16, PROJECT_SPEC "Reliability".

## 3. Confirmed findings

### 3.1 Commercial apps

- **[Confirmed] BuzzIn.live** lists "Latency correction" and "Early-buzz penalty" as bare feature-list items with no description. It says "First buzz wins, every time." (https://buzzin.live)
- **[Confirmed] BuzzIn.live changelog, 9/27/2026:** "Added how far behind the first buzz each later buzz was (such as +0.18s). Can be turned off in Settings", and "Fixed the buzz order sometimes showing differently on the host and player screens". 9/28/2020: "Fixed a bug where a player could hold spacebar to buzz very fast". The changelog has **no** entry about ping, clock sync, latency correction or ties. (https://buzzin.live/updates)
- **[Confirmed] Buzzinga** blog: "Although Buzzinga does its best to handle network issues and latency between players' devices…", and with physical buzzers "the issues with latency and network conditions are almost entirely eliminated". (https://buzzinga.io/blog/physical-buttons-and-buzzers)
- **[Confirmed] Buzzinga** FAQ: "The host automatically sees who buzzed first." The service requires internet: "Buzzinga is real-time, so all hosts and players need an internet connection." Hosting help: "When buzzing opens, Buzzinga identifies the first player or team to buzz in." Physical buzzers are keyboard-type devices ("Buzzinga listens for their assigned keypresses").
- **[Confirmed] Buzzinga** CSV: "`buzzerActivationMode` accepts `none`, `default`, `automatic`, or `manual`." The meanings of the values are not documented. (https://buzzinga.io/help/import-export-csv/)
- **[Confirmed] Factile** calls it a major challenge to "track millisecond-level timing across different devices and connections". The moderator screen "shows exactly who buzzed in first, second, and third". No method is described.
- **[Confirmed] QBWiki:** online systems "must account for varying Internet speed/lag through various approaches", with the goal of deciding "who has buzzed first in real time rather than who has the best connection to the server". No approach is named.

### 3.2 Open-source implementations

- **[Code] Multibuzzer:** `buzz()` stores `timestamp: new Date().getTime()` with the comment "buzz on server will overwrite the client provided timestamp". This is pure **server arrival order (A)**.
- **[Code] Protobowl:** the client estimates a clock offset from `echo` round trips every 30 s. It keeps the last 20 offsets and averages those below the mean in two passes, a lower-half filter. A comment explains this counters iOS, where "screen drags pause the recieving of sockets/xhrs meaning that the sync might be artificially inflated". The **buzz race itself is decided by the server**, though: `room.buzz` uses `@serverTime()` at arrival, and later buzzers are logged as "lost the buzzer race". The offset only drives the reading and timer display. Result: **A for arbitration, clock sync for UI only.**
- **[Code] Friendly-Feud:** the server pings each registered buzzer every 5 s and stores the **mean of the last 5 RTTs**. On a buzz it stamps `time.Now() - latency`, subtracting the **full** mean RTT rather than half, with no cap, and re-sorts the buzz list. This is **B (ping compensation), uncapped and with no arbitration window**. A spike or a deliberately slow pong directly buys priority.
- **[Code] BuzzCast:** the release notes show "each player's ping … on the controller … and on the host screen" (v1.1). v1.4 says "the press itself is still sent instantly, so buzz-in order is unchanged". This is **A plus latency display**.

### 3.3 Reference rule (TV show)

- **[Confirmed]** In Jeopardy!, a staffer enables the buzzers when the host finishes reading. An early ring-in triggers "a quarter-second wait period where you're locked out" (Mental Floss, citing the show's blog). The early rule is about the **press time relative to enablement**, which arrival order only approximates (K16).

### 3.4 Timing techniques

- **[Confirmed] NTP on-wire (RFC 5905 §8):** offset θ = ½[(T2−T1)+(T3−T4)] and delay δ = (T4−T1)−(T3−T2). Maximum error ("synchronization distance") is ε + δ/2 (§4), so error grows with half the round-trip delay.
- **[Confirmed] NTP clock filter (RFC 5905 §10):** keeps an "8-stage shift register" of samples, sorts by increasing delay and uses the lowest-delay sample's offset (θ₀). Jitter is the RMS of the other samples' offsets against θ₀.
- **[Confirmed] Cristian's algorithm:** the client sets its time to T + RTT/2. This is error-free only with symmetric delays, an assumption that "is regularly not true". Offset and jitter "are thus minimised by selecting suitable RTT" from many request/response pairs.
- **[Confirmed] RFC 3550 §6.4.1 jitter:** J(i) = J(i−1) + (|D(i−1,i)| − J(i−1))/16; "the gain parameter 1/16 gives a good noise reduction ratio while maintaining a reasonable rate of convergence".
- **[Confirmed via search summary only; page 403] Valve/Source lag compensation:** the server rewinds state to when the client issued the command, using that client's latency plus interpolation. `sv_maxunlag` caps how far back it rewinds (default and maximum 1 s). This is the "favour the actor, but bounded" principle.
- **[Confirmed] GGPO:** "Traditional techniques account for network transmission time by adding delay to a players input"; rollback "uses input prediction and speculative execution". (Delay-based netcode is analogous to an arbitration window. Rollback is not needed here because a buzz decision has no prediction phase.)
- **[Confirmed] `performance.now()`** is relative to `timeOrigin`, a monotonic clock that "never decreases and isn't subject to adjustments". `Date.now()` "may have been impacted by system and user clock adjustments". Resolution is coarsened to 100 µs (5 µs when cross-origin isolated). The spec says it should tick during OS sleep, but "it appears that only browsers on Windows keep ticking during sleep". (MDN)
- **[Confirmed] `Event.timeStamp`** is a `DOMHighResTimeStamp` from the time origin "until the event was created", so it shares a time base with `performance.now()`. Rounding: Chrome 0.1 ms, **Safari 1 ms**, Firefox 1 ms (16.67 ms with resistFingerprinting). (MDN)
- **[Confirmed] W3C Event Timing:** input delay = `processingStart − startTime`, where `startTime` is the event's `timeStamp`. The spec calls subtracting `timeStamp` from `performance.now()` at handler start "subtracting the hardware timestamp". So `timeStamp` is set **before** main-thread queuing, and using it removes main-thread delay from the press time.
- **[Confirmed] Wi-Fi on phones (CoNEXT 2016):** periodic SDIO bus sleep and Power Saving Mode "can inflate and unstablize network delay". Sending "just enough warm-up and background traffic" keeps median overhead "within 3ms".
- **[Confirmed, illustrative] Beacon arithmetic (patents):** a 100 ms beacon interval with a listen interval of 5 can buffer downlink frames for up to 500 ms. Routers commonly default to a 100 ms beacon and DTIM 1.
- **[Confirmed, vendor benchmark, old hardware] Touch-to-display latency (Agawi 2013):** iPhone 5 about 55 ms; Android phones about 110–120 ms; iPad mini 75 ms. This includes display latency, so touch-to-event is smaller. The point that matters here: **devices differ systematically by tens of ms**, and no network measurement can see it.
- **[Confirmed] Joy-Con reports:** mode `0x30` "Pushes current state @60Hz"; `0x3F` simple HID "Pushes updates with every button press". This app switches to `0x30` ([Code] `inputBridge.ts`), so button state is quantized to about 16.7 ms.
- **[Confirmed, marked "Not verified yet" by the site] Joy-Con Bluetooth button latency on Windows 11:** average 14.47 ms, min 6.81, max 24.33, jitter 4.29 ms, about 66.8 Hz polling (Gamepadla).
- **[Confirmed, bug reports/forums] iOS Safari** suspends pages on lock or app switch. `onclose` and `visibilitychange` may not fire reliably, and a heartbeat with a timeout is the recommended liveness check.
- **[Confirmed] Crystal drift:** ±20 ppm ≈ 72 ms per hour (Silicon Labs table); 1 ppm = 3.6 ms/h.

### 3.5 Facts about this repository [Code]

- Phones send `{t:'buzz'}` with no timestamp, on `pointerdown` (`PlayTab.tsx`). The server stamps arrival with `Date.now()` and the engine awards the first arrival immediately (`handleBuzz` sets `status='buzzed'`). Later arrivals are queued as `late` in arrival order.
- Early detection (`handleEarlyBuzz`) means "arrived while buzzers were locked", which is K16.
- Existing ping: client-initiated every 10 s, `{t:'ping', c: Date.now(), rtt}`. The server replies `{t:'pong', c, s: Date.now()}` and **stores the RTT the client reports** (`c.rtt = m.rtt`). That RTT is shown in the buzzer check and is not verified by the server.
- Joy-Cons and keyboards are read in the TV renderer and sent as `{t:'controller', ev}` with no timestamp. The server stamps `at = Date.now()` in `ControllerRegistry.handle`. The Gamepad API is polled with `setInterval(…, 16)`. `backgroundThrottling: false` is set on the windows.
- `ws` 8.22 calls `socket.setNoDelay()`, so Nagle does not delay server sends.
- PROJECT_SPEC "Reliability" says: "Do not trust player-submitted timestamps." DECISIONS D15 chose arrival order for that reason. **Any client-timestamp design must keep the server authoritative and treat client times as bounded hints** (§9). D15 needs a superseding decision.

## 4. Unknown implementation details

- **[Unknown] BuzzIn.live:** what "Latency correction" does: ping-based offset, client timestamps, a window, or something else. It is also unknown whether "+0.18s" gaps are corrected or raw arrival differences, how ties are handled, and what the early-buzz penalty does. Nothing is documented beyond the feature names and changelog lines above. The changelog fix "buzz order sometimes showing differently on the host and player screens" suggests order was once derived or rendered per client, but that is only a hint ([Inference], weak).
- **[Unknown] Buzzinga:** how "who buzzed first" is decided, what "does its best to handle … latency" means technically, whether there is any arbitration window, and what `buzzerActivationMode` `default/automatic/manual` mean exactly. Nothing is published.
- **[Unknown] Factile:** the method behind "millisecond-level timing".
- No commercial app publishes ping intervals, caps, windows or confidence rules. **Nothing in this document describes their internals.** The recommended design is derived independently from public techniques.
- **[Unknown] Platform internals:** whether Safari/WebKit and Chrome-Android set touch `Event.timeStamp` from the OS event time or at renderer dispatch. The Event Timing spec implies a pre-queue "hardware timestamp", but per-platform behaviour is not documented on the pages read. Also unknown: whether Chromium's WebHID `inputreport` `timeStamp` reflects the OS report time or renderer dispatch time. The design must hold up either way.

## 5. Comparison of approaches

Notation: `r` = server receive time, `p` = client press time (client clock), `θ` = estimated clock offset, `P` = press time converted to server time.

| | A. Server arrival order (current) | B. Ping / half-RTT compensation | C. Clock sync + client press timestamps | D. Arbitration window | E. Hybrid (C + D + bounds + fallback) |
|---|---|---|---|---|---|
| Rule | earliest `r` | earliest `r − RTT/2` (RTT averaged) | earliest `P = p − θ` | collect for W ms after the first arrival, then decide (needs an ordering key) | `P` clamped to `[r − cap, r]`, adaptive window, confidence |
| Corrects average path delay | No | Yes (approximately) | Yes | No (alone) | Yes |
| Corrects **per-press** spikes (PSM wake, contention, phone main-thread jank) | No | No: uses a historical average | Yes: the press time travels with the message | No | Yes, up to the cap |
| Asymmetry error | n/a | Up to RTT/2. Phone downlink buffering (PSM) inflates RTT while uplink stays fast, so it **over-compensates** sleepy phones | Bounded by the sync sample's RTT/2. Min-RTT selection keeps it small | n/a | Same as C, plus clamping |
| Trust needed | None | Low; a client can inflate RTT by delaying pongs (Friendly-Feud: unbounded gain) | High without bounds: a client can claim any time | None | Bounded: worst-case gain ≤ cap |
| Added decision delay | 0 | 0 (but re-ranking after the fact is confusing) | Needs a window, otherwise late but earlier presses can't win | W | Adaptive 0–60 ms |
| Early-buzz accuracy (K16) | Arrival-based | Approximate | Press-based | n/a | Press-based, penalises only when confident |
| Complexity | Trivial | Low | Medium | Low | Medium |
| Seen in the wild | Multibuzzer, Protobowl, BuzzCast, this app | Friendly-Feud | [Unknown] for commercial apps | GGPO's "input delay" is the analogue | [Unknown] for commercial apps |

**[Inference] Key points:**
- B corrects the **mean** path, but unfairness is felt in the **outliers**: "I clearly pressed first". Those come from the specific packet being delayed. Only C addresses that.
- C without D is useless for arbitration. If the server awards at the first arrival, a later-arriving but earlier press can only re-rank afterwards (Friendly-Feud style), which breaks a live game.
- D without C or B only creates "ties" and does not improve ordering. A tie-window with random choice is fair in expectation but unsatisfying for Jeopardy-style play.
- E is C made safe: bounded, with a short adaptive D and an A fallback.

## 6. Fairness

- **[Inference]** For phones on one LAN, the fairness errors of A, by size:
  1. Wi-Fi power-save and SDIO wake on the buzz packet (tens to hundreds of ms, intermittent).
  2. Phone main-thread delay at the exact moment buzzers open. Every phone receives a `state` broadcast and re-renders React at that instant, which can mean 5–50 ms on slow phones.
  3. Airtime contention (ms to tens of ms).
  4. Touch digitizer and OS pipeline differences between models (systematic, roughly 10–30 ms, not measurable by software).

  C with `Event.timeStamp` removes 1–3 up to the cap. Nothing removes 4, so it must show up as **uncertainty** (§11), not as a fake precise number.
- **[Inference]** Compensation must only **restore** delay that plausibly happened. It must never create an advantage. Clamping `P ∈ [r − cap, r]` guarantees that no device is ranked more than `cap` earlier than it arrived. A device that is not synced gets no compensation, which is exactly today's behaviour for it.
- **[Inference]** Choose one failure direction: when unsure, **under-compensate**. The result then degrades toward A (today's behaviour), never beyond.
- **Early buzzes:** penalise an arrival after unlock as early only when the *latest plausible* press time (`P + u`) is before `openedAt`. When ambiguous, clamp `P` to `openedAt`: on time, but no ranking advantage from anticipation. This fixes K16's real direction: a press made before the light that arrived after it currently counts as on time and can even win. Presses arriving before `openedAt` stay early as today (causality: `P ≤ r < openedAt`).
- **Teams:** arbitration stays per competitor and per person exactly as `buzzBlockReason` defines. The window only changes *which* eligible candidate wins. The rebound queue should be ordered by `P`, not by arrival.

## 7. Responsiveness

- **[Inference]** The window adds at most `W_MAX` (60 ms) between the first arrival and the announcement, and usually much less:
  - The deadline is `P_lead + max cap of the other eligible devices`, and `P_lead ≤ r1`, so the leader's own compensation shortens the wait.
  - It resolves immediately when every other eligible device has already pressed or none exists.
  - In an all-Joy-Con or keyboard game the wait is at most about 30 ms.
- The phone already gives instant local feedback on `pointerdown` (R6-14). Only the *win* confirmation waits. The TV's own render and display latency (typically 30–100 ms, [General]) is the same order, so 60 ms is hard to notice.
- **Pings while a clue is showing also improve responsiveness.** Regular small traffic keeps the phone's Wi-Fi out of power-save (CoNEXT 2016), so the buzz packet itself arrives sooner.

## 8. Reliability

- **Monotonic server time:** stamp `r` with `performance.now()` (Node, monotonic) at the very start of the `message` handler, before JSON parsing. Do the sync and compensation math in that time base. Windows time sync can step `Date.now()` ([General]). Convert to wall time only for records and display.
- **Sleep and resume:** phone `performance.now()` may stop during sleep (MDN). The client keeps an **epoch** counter, incremented on `visibilitychange→visible`, `pageshow`, `online` and reconnect. The server discards sync samples and rejects buzz timestamps from an older epoch (the buzz is then treated as uncompensated). A new socket always starts a new sync state.
- **Clock jumps or inconsistent samples:** if a new min-RTT sample's offset interval does not overlap the current estimate's (after drift allowance), reset the sync state. The device is "unsynced" until 3 fresh samples arrive.
- **Stale buzzes:** the buzz carries the opportunity key `k` from the last state. If it does not match the current answering opportunity, the press is ignored as stale. This covers the spec rule "Prevent disconnected clients from submitting stale buzzer events".
- **Determinism:** the reducer stays pure. The GameManager schedules a `buzzResolve` action at the deadline, as it already does for `timerExpire`. Candidates are stored in `s.buzzer.pending`. On crash restore, pending candidates are discarded and buzzers stay open (consistent with K9's spirit).
- **Host actions during the window:** `lockBuzzers` resolves the pending candidates first; they were valid presses. `resetBuzzers` discards them.
- **Duplicates:** per-connection press id plus the existing 150 ms debounce and held-button `InputFilter`. Only one candidate per person or shared team.
- **Fallback switch:** a game rule "Latency compensation: Off / Standard / Generous". Off means pure A, identical to today, and is useful if something misbehaves on site.

## 9. Security (forged timestamps, inflated latency)

- **Threat [Inference]:** a modified client reports `p` early, or offsets every sync reply by a constant K. A constant offset lie is **undetectable** from timestamps alone, because sync and press are shifted together. Delaying pongs inflates RTT, and with it any RTT-based cap. Therefore:
  1. **Absolute cap:** compensation `r − P ≤ CAP_ABS` (50 ms Standard, 100 ms Generous, 0 Off). The worst-case unfair gain is `CAP_ABS − true delay` for every device class.
  2. **Plausibility cap:** `cap = min(CAP_ABS, rttMedian8 + 2·J + 25 ms)`, where the RTT is **server-measured** from server-initiated probes (`s2 − s1`). A client can only make it larger by delaying replies, never smaller, so an honest fast phone's forged timestamp gains little. The 25 ms term covers phone main-thread delay, which `timeStamp` legitimately removes.
  3. **Causality clamps:** `P ≤ r` (no future presses). `P ≥ openedAt` unless confidently early, in which case it is penalised, so claiming earlier than the open is self-defeating.
  4. **Server measures RTT itself.** Stop trusting the client-reported `rtt` (`hub.ts` `c.rtt = m.rtt`) even for display.
  5. **Validation:** zod-check `p` as a finite number within ±10 min of the connection's current time base; otherwise drop the timestamp and use `P = r`. Keep the existing per-connection flood limit (sync replies count against it; 120/s is ample).
  6. **Audit:** record `r`, `P`, `comp`, `u`, synced flag and epoch on every buzz event. The host can review a disputed buzz, and statistics can detect a device that is always maximally compensated.
- **[Inference] Residual:** a determined cheater on the LAN can gain at most about `CAP_ABS` (≤ 50 ms Standard) in close races. That is a bounded, documented trade-off. PROJECT_SPEC's "Do not trust player-submitted timestamps" is honoured in the sense that **the server never accepts a timestamp beyond what its own measurements make plausible**. This needs an explicit DECISIONS entry superseding D15.
- The bridge connection (Joy-Cons, keyboards) is already a trusted host-token socket. Still clamp it (cap 30 ms) so a buggy renderer cannot distort results.

## 10. Joy-Con compatibility

- **Different path [Code]:** Joy-Con → Bluetooth → Windows HID → Chromium WebHID `inputreport` in the **TV renderer** → `{t:'controller'}` over a loopback WebSocket → server. There is no Wi-Fi hop; loopback RTT is sub-millisecond.
- **What is not compensable [Confirmed/Inference]:**
  - Bluetooth latency (Gamepadla: about 14.5 ms average, 7–24 ms range).
  - 60 Hz report quantization (0–16.7 ms).
  - Neither is visible to any ping. **Do not apply phone network compensation or a guessed constant to Joy-Cons.** Model these as uncertainty (±9 ms) instead.
- **What is compensable [Inference]:** **TV renderer main-thread delay.** The TV window runs animations (R6-15 notes choppy presentation). A busy main thread delays `inputreport` and `keydown` dispatch and the `send`, so Joy-Con presses currently lose time to TV jank under A. Fix:
  - Send `at = e.timeStamp` for `inputreport` and `keydown`, and `gamepad.timestamp` for Gamepad API pads instead of the 16 ms poll time.
  - Run the same sync on the bridge socket. Offset uncertainty is about ±0.2 ms.
  - Cap compensation at 30 ms.
- **[Unknown]** Whether WebHID `inputreport.timeStamp` predates main-thread queuing. If it does not, the timestamp equals dispatch time and compensation is about 0, which is harmless.
- **Optional structural improvement [Inference]:** read controllers in a separate hidden Electron renderer (own process and main thread) so TV animations cannot delay input at all. Worth doing if bridge compensation often reaches its cap in measurements.
- Mixed games: cross-kind comparisons (Joy-Con vs phone) get an extra systematic-bias allowance in the confidence test (§12.6), because touch and Bluetooth pipelines differ by an unknown 10–20 ms.

## 11. Expected timing uncertainty

Order-of-magnitude figures, with reasoning. Hardware figures come from the cited sources; the rest are [Inference] or [General].

| Component | Typical | Bad case | Comment |
|---|---|---|---|
| Phone RTT on home Wi-Fi, radio awake | 3–15 ms | 50–300 ms spikes (PSM/SDIO, contention) | min-RTT filtering rejects the spikes |
| Offset uncertainty (half of best RTT + drift) | ±2–8 ms | ±15–20 ms (then "not synced" above 20) | drift of 100 ppm adds 0.1 ms/s since the sample; pinging every ≤ 1 s keeps it < 0.5 ms |
| Safari timestamp rounding | ±0.5–1 ms | — | 1 ms rounding (MDN) |
| Touch sampling quantization (120–240 Hz digitizers) | ±2–4 ms | ±8 ms (60 Hz) | [General] |
| Touch pipeline **bias between phone models** | 0–20 ms | ~30+ ms | Agawi: tens of ms between devices; **not correctable** |
| Phone main-thread delay at buzzer open | 1–10 ms | 30–100 ms (slow phone, re-render) | removed by `timeStamp` (up to the cap) |
| Joy-Con Bluetooth + 60 Hz report | ~7–24 ms (avg 14.5) | more at range / interference | not compensable; ±9 ms modelled |
| TV renderer dispatch (Joy-Con, keyboard) | 0–5 ms | 20–50 ms (jank) | compensable via `timeStamp` (≤ 30 ms cap) |
| Keyboard USB polling | 0–8 ms | — | 125 Hz [General] |
| Server event-loop delay before stamping `r` | < 1 ms | 5–20 ms (sync SQLite write during dispatch) | harms A; mostly neutral for C |

**Net:**
- **Phone vs phone under A:** ordering error typically 0–20 ms, with intermittent 50–300 ms outliers.
- **Under E:** random error about ±5–10 ms per press, outliers removed up to the cap, plus an unknown inter-model bias of about 10–20 ms.
- Practical resolution: **gaps under about 20–25 ms cannot be called reliably by any software design.** Human temporal-order judgement is of the same order ([General]). Show those as "Very close buzz!".

## 12. Recommended architecture (approach E)

Server-authoritative. Client timestamps are bounded hints, and the server decides.

### 12.1 Per-connection sync (phones and the bridge)

- **Server-initiated probes**, so the server measures RTT itself:
  - Server → client `{t:'sync', n}`. The server stores `s1[n] = performance.now()` (bounded map, max 8 outstanding, 2 s timeout).
  - Client → server, immediately in `onmessage`: `{t:'syncR', n, c, e}`, where `c = performance.now()` at receipt and `e` = epoch.
  - The server stamps `s2` on arrival.
  - Per sample: `rtt = s2 − s1`, `θ = c − (s1 + s2)/2`, half-width `h = rtt/2 + 1 ms`. By causality the true offset lies in `[c − s2, c − s1]` regardless of path asymmetry.
- **Schedule:**
  - On connect, resume (new epoch), and when a clue is selected: a **burst of 5 probes 100 ms apart**.
  - While a clue is showing and buzzers can open: **every 500 ms**. This also keeps phone Wi-Fi out of power-save.
  - Otherwise: **every 3 s**.
  - Cost: 10 phones at 2 Hz is about 40 small messages per second, which is negligible.
- **Estimator:**
  - Keep the last **32 samples or 60 s** of the current epoch.
  - Pick the sample minimizing **aged half-width** `h + 0.1 ms/s × age` (100 ppm drift allowance, like NTP's dispersion growth). That sample's `θ` is the offset and its aged half-width is `u_sync`.
  - **Synced** = at least 3 samples in the epoch and `u_sync ≤ 20 ms`.
  - Reset the state if a new low-RTT sample's interval does not overlap the current estimate's interval.
- **Jitter:** RFC 3550 EWMA over successive RTTs, `J += (|rtt_i − rtt_{i−1}| − J)/16`. `rttMedian8` is the median of the last 8 server-measured RTTs. Both are shown in the buzzer check, replacing the client-reported `rtt`.
- **Bridge socket:** same protocol. The renderer's `c` and the button `at` both use its `performance.now()` base.

### 12.2 Buzz message shapes

- Phone: `{t:'buzz', p: number /* pointerdown Event.timeStamp, ms */, e: number /* epoch */, k: string /* opportunity key */, id: number /* press counter */}`.
  - Client-side guard: if `|e.timeStamp − performance.now()| > 1000`, send `performance.now()` instead (defends against a non-high-res `timeStamp` on old engines; [Inference]).
- Bridge: `ControllerEvent` `button` gains `at?: number` (renderer time base: `inputreport`/`keydown` `timeStamp`, `gamepad.timestamp`) and the connection's `e`.
- Server → phone result: `{t:'buzzResult', ok, info, place?: number, gapMs?: number, confident?: boolean, winner?: string}`, sent only to devices that pressed (R6-23).
- Engine action `buzz` gains `arrivalAt`, `pressAt` (`P`), `compMs`, `uncertaintyMs` and `synced`. All are recorded on the `buzz` event.

### 12.3 Compensation

```
P_raw = p − θ                                      // server monotonic time
cap   = synced ? min(CAP_ABS, rttMedian8 + 2·J + 25) : 0     // phones
cap   = synced ? min(30, rttMedian8 + 2·J + 25) : 0          // bridge (Joy-Con/keyboard/gamepad)
comp  = clamp(r − P_raw, 0, cap);   P = r − comp
u     = (synced ? u_sync : cap_equiv=CAP_ABS) + 1 + floor(kind)
floor: phone 4, joycon 9, keyboard 4, gamepad 8 (ms)
```

- `CAP_ABS`: **50 ms Standard (default)**, 100 ms Generous, 0 Off (Off = pure arrival order).
- Host buzz (`hostBuzz`) and bots: `comp = 0`.

### 12.4 Arbitration window

- First valid candidate (not early, eligible): enter `pending`.
- `deadline = clamp(P_lead + max_{j ∈ eligible others} cap_j + 2 ms, r1, r1 + W_MAX)`, with **`W_MAX = 60 ms`**.
  - "Eligible others": connected phones and controllers bound to competitors or people for whom `buzzBlockReason` is null, excluding the leader's competitor (shared buzzer) or person (individual).
- Recompute the deadline when a new candidate takes the lead.
- Resolve immediately if no eligible other exists or all of them have pressed.
- At the deadline (GameManager-scheduled `buzzResolve`), the winner is the minimum `P`. Ties within 1 ms go to the earlier `r`, then the lower sequence number.
- The remaining candidates become `late`, queued **by `P`**, with `gapMs = P_i − P_winner`.
- Events and stats: `reactionMs = P − openedAt` (corrected).

### 12.5 Early-buzz rule (fixes K16)

- `r < openedAt` → early (unchanged).
- Else if `P + u_sync + 2 < openedAt` → **early** (confidently pressed before unlock). Audit note: `early-corrected`. The host refund (`refundEarly`) still applies.
- Else if `P < openedAt` → clamp `P = openedAt`: valid, no anticipation advantage.

### 12.6 Confidence and display (R6-23)

- Gap `g = P_loser − P_winner`. **Confident** iff `g > u_w + u_l + bias`, where `bias = 0` for the same device kind and `10 ms` for different kinds. Additionally require `g ≥ 25 ms`.
- Confident: "Alex buzzed {round to 10 ms} ms before you". Otherwise: "Very close buzz! Alex won."
- Unsynced devices get a large `u`, so they show "Very close" unless the gap is big.
- The host view may show the corrected gap list (like BuzzIn.live's "+0.18s") with a "≈" marker when not confident.

### 12.7 Parameter summary

| Parameter | Value |
|---|---|
| Probe interval | burst 5 × 100 ms; 500 ms during clues; 3 s otherwise |
| Sample window | last 32 samples / 60 s, current epoch only |
| Offset choice | min aged half-width (rtt/2 + 1 ms + 0.1 ms/s × age) |
| Synced when | ≥ 3 samples and `u_sync` ≤ 20 ms |
| Jitter | RFC 3550 EWMA, gain 1/16 |
| CAP_ABS (phones) | 50 ms default (100 Generous, 0 Off) |
| Phone cap | min(CAP_ABS, rttMedian8 + 2J + 25) |
| Bridge cap | min(30, rttMedian8 + 2J + 25) |
| W_MAX | 60 ms (adaptive; usually less) |
| Tie tolerance | 1 ms → arrival order |
| Early confidence | `P + u_sync + 2 ms < openedAt` |
| Display confidence | gap > u_w + u_l (+10 ms cross-kind) and ≥ 25 ms; round to 10 ms |
| Device floors | phone 4, Joy-Con 9, keyboard 4, gamepad 8 ms |

### 12.8 Validation plan (feeds R6-24)

Simulate 2, 5 and 10 phones with:
- per-device uplink and downlink distributions (lognormal base 3–10 ms);
- PSM spikes (10% of packets +50–300 ms on downlink, 3% on uplink);
- main-thread delay at open (0–60 ms);
- reordering, duplicates, disconnects mid-window, constant-offset liars and pong-delaying liars;
- Joy-Cons on the bridge with TV jank.

Compare A vs E on:
- correct-winner rate against ground-truth press time;
- bias by device class;
- added decision delay (p50/p99);
- false early penalties and missed early penalties;
- maximum cheat gain, which must be ≤ cap.

Real-hardware check: two phones, slow-motion video of simultaneous presses, comparing the logged `P` gap with the video gap (gives the touch-pipeline bias, which is currently unknown).

### 12.9 Code touch points (for the implementer; no code changed by this research)

- `src/shared/protocol.ts`: `sync`, `syncR`, extended `buzz`, `ControllerEvent.at`, `buzzResult` fields.
- `src/server/hub.ts`: new `src/server/clockSync.ts` (per-connection estimator, pure and unit-testable). Stamp `r` first thing in `onMessage`. Server-measured RTT in `connections()`.
- `src/server/controllers.ts`: carry `at` and the bridge offset through `onPress`.
- `src/server/engine/engine.ts`: `pending` candidates, `buzzResolve` action, corrected early rule, queue by `P`. `src/server/gameManager.ts`: schedule `buzzResolve`.
- `src/web/lib/socket.ts`: answer `sync`, epoch handling. `PlayTab.tsx`: send `e.timeStamp`. `inputBridge.ts`: send `timeStamp` / `gamepad.timestamp`.
- DECISIONS: supersede D15; amend D19 (early detection by corrected press time). KNOWN_ISSUES: K16 resolved, plus a new residual "inter-device touch/Bluetooth pipeline bias ≈ 10–20 ms is not measurable; gaps < 25 ms shown as very close".

---

## 13. Implementation and measured results (2026-10-17, session 8)

Implemented as recommended in §12, with one parameter changed after simulation (below).

| Piece | Where |
|---|---|
| Server-initiated clock probes (burst 5 × 100 ms on connect / new clue, 500 ms while a clue is up, 3 s otherwise), estimator | `src/server/clockSync.ts`, `src/server/hub.ts` (`probe`, `syncR`) |
| Bounded correction `[0, min(cap, rttMedian + 2·jitter + 25)]`, phones 50 ms (Generous 100, Off 0), TV-window bridge 30 ms; uncertainty; suspicious timestamps ignored | `src/server/buzzTiming.ts` |
| Window: wait until the leader's press + the largest cap of another eligible connected device + 2 ms, at most 60 ms; resolves at once when everyone eligible pressed | `GameManager.buzz` / `otherDevicesCap`, engine `pending` + `buzzResolve` |
| Earliest corrected press wins (≤ 1 ms tie → arrival), others queued by press time; any other action settles a pending window first | engine `handleBuzz`, `resolvePendingBuzz` |
| Early only when certain (`pressAt + uncertainty + 2 < unlock`), otherwise counted at the unlock | engine `handleBuzz` → `handleEarlyBuzz(…, corrected)` |
| Phones: `pointerdown` `Event.timeStamp` + epoch; the TV window stamps Joy-Con `inputreport`, keyboard and gamepad timestamps | `src/web/lib/socket.ts` (`pressStamp`, sync replies), `PlayTab.tsx`, `inputBridge.ts` |
| "How close was it": phones that pressed (`PlayerContext.buzzTiming`), host gap list (`buzzer.timing`, host only) | `projection.ts`, `PlayTab.tsx` `buzzTimingText`, `HostClue.tsx` `BuzzGaps` |
| Host setting "Who buzzed first" (Fair timing / Fair timing — slow Wi-Fi / First to arrive) | rule `buzzFairness`, `RulesEditor.tsx`, rules summary |

**Parameter change:** "synced" now requires `u_sync ≤ 60 ms` (was 20 ms). With 20 ms, a phone on
ordinary-but-slower Wi-Fi (one-way ≈ 35–40 ms, best round trip ≈ 55–70 ms) never counted as
synced, so only the *fast* phones were corrected — which made the result **more** biased than
arrival order in simulation (2 phones: 74 % vs 83 % correct on callable gaps). `u_sync` stays the
rigorous bound (half the best round trip) for the early-buzz and display decisions, so a larger
threshold only enables correction; it never makes a timing claim more confident.

### Simulation results (`tests/unit/buzzFairness.sim.test.ts`, 400 clues per row, seeded)

Model: per-device lognormal one-way delays (σ 0.35–0.5), asymmetric links, 3 % uplink and 10 %
downlink Wi-Fi power-save spikes (+50–300 ms), 0–25 ms phone main-thread delay, random clock
offsets and ±100 ppm drift; Joy-Cons with 7–24 ms Bluetooth (not compensable) and 0–40 ms TV
jank. Presses within 60–150 ms of each other, 180–300 ms after the unlock. "≥ 25 ms" = clues where
the true gap between the first two presses is at least 25 ms (callable in principle).

| Scenario | A correct | E correct | A correct (≥ 25 ms) | E correct (≥ 25 ms) | E added wait p50 / p99 | false early (A / E) |
|---|---|---|---|---|---|---|
| 2 phones, 3 ms vs 35 ms | 68.8 % | 87.5 % | 82.9 % | **97.7 %** | 27 / 48 ms | 0 / 0 |
| 5 phones, 3–40 ms | 62.5 % | 85.3 % | 83.2 % | **96.3 %** | 27 / 48 ms | 0 / 0 |
| 10 phones, jitter + spikes | 66.3 % | 81.5 % | 88.6 % | **95.7 %** | 25 / 46 ms | 0 / 0 |
| 4 equal phones, 6 ms | 72.8 % | 92.5 % | 100 % | 100 % | 31 / 47 ms | 0 / 0 |
| 3 phones, every message duplicated | 65.5 % | 86.0 % | 87.0 % | **100 %** | 28 / 45 ms | 0 / 0 |
| Joy-Con vs phone (30 ms Wi-Fi) | 79.8 % | 84.5 % | 94.3 % | **97.4 %** | 12 / 50 ms | 0 / 0 |

Other checks (all in the same file): a press made 5–60 ms before the unlock on slow Wi-Fi that
arrives after it is penalised 23 % of the time (only when clearly early) vs 15 % by arrival, with
**no** on-time press ever penalised (10 phones pressing 0–40 ms after the unlock); a forged
timestamp (−500 ms) never beats a press made more than cap + 30 ms earlier; holding sync replies
to look slow cannot raise the cap above 50 / 100 ms (the device does not even count as synced); a
phone that just reconnected counts by arrival and makes nobody wait; one winner and one queue entry
per competitor with duplicated messages. Real sockets: `tests/integration/round6.test.ts`.

**Limits (not solvable in software):** differences between phone models' touch pipelines and the
Bluetooth path (≈ 10–20 ms) are invisible to the server; gaps under ~25 ms are shown as "Very
close". The simulation's delay model is an assumption, not a measurement of a real home network;
**no physical phones or Joy-Cons were used for these numbers.**
