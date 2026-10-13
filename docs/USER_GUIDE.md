# OfflineJeopardy — User Guide

## What you need
- A Windows 10/11 PC (connect the TV with HDMI and choose "Extend" with Win+P).
- A Wi-Fi router or Ethernet network (internet not required). The iPad and phones must be on the same network.
- Optional: Nintendo Switch Joy-Cons paired with the PC over Bluetooth.

## Setup (first time)
1. Install and open OfflineJeopardy. If Windows Firewall asks, allow it on **Private networks**.
2. Home → **Open game board** (choose the TV screen). The board goes full screen (F11 toggles).
3. On the iPad, scan the **host QR code** on the Home page (or type the address shown) and enter the **6-digit host code**. The iPad stays signed in.

## Running a game
1. iPad: pick a board, choose **Individuals** or **Teams**, choose rules, **Create game**.
2. Players scan the QR code on the TV, pick their profile and enter their PIN (or tap **I'm new**), then **Join game**.
3. Teams: create teams, add players, and choose for **each team**: "Each player buzzes" or "One shared buzzer".
4. Buzzers tab: tap **Assign controller** next to a player (or a shared team) and press a button on their Joy-Con or a key on the PC keyboard. Phones need no setup.
5. **Start game**. The TV introduces the round and its categories one at a time: tap **Next** for each category (or **Auto**, or **Skip**). You can replay it from the board screen ("Introduce the categories on TV"); turn it off in Menu → Rules & timers.
6. Tap a clue — it zooms out of its tile on the TV; only you see the answer (and the category/value).
7. **Unlock buzzers** → the first buzz wins → **Correct** or **Incorrect**. For shared buzzers, pick who answered (or "Team only").
8. **Nobody knows it?** When time runs out (or you tap **Nobody knows**), tap **Reveal answer** — the answer shows on the TV — then **Return to board**. No points change. **Skip** is still there for exceptional cases.
9. **Early buzzing:** the chip "Early buzz: …" in the clue panel (or Menu → Rules & timers) sets what happens when someone buzzes before you unlock: *No penalty*, *Short lockout*, *Out for this clue* or *Lose points*. It applies from the next buzz, the same for Joy-Cons, phones and keyboards. Early buzzes are listed in the clue panel; point penalties can be refunded there or in the event history.
10. Use **Undo** for mistakes; tap a score to award/deduct points.
11. When the board is cleared: **Start Final Wager** → open wagers (players enter them on their phones) → show the clue → reveal and judge → **Show the winner**.

## Players
- **Room code (optional):** in game setup tick **Require the room code**. The TV shows a 4-letter code that players type on their phone before **Join game** — only people who can see the TV can join. **↻ New code** changes it.
- Profiles keep their statistics forever — renaming, new photos or different buzzers never lose history.
- Forgot a PIN? Dashboard → Players → Edit → Reset PIN.
- On their phone, players open the **☰ menu** for: Current game (buzzer), My profile, My statistics, Game history (tap a game for every clue you buzzed on, your points and wagers), Leaderboard (Solo / Team games / Contributions, ranked by the criterion you choose), Players (other players' public stats) and Settings (buzzer preferences, privacy, PIN, sign out). The browser Back button works throughout.
- Players who tick "Keep my statistics private" are hidden from the leaderboard and their stats page shows as private.
- Edits to name, nickname, photo, avatar and color appear on the TV instantly.

## Playing alone or with computer opponents
Create a game with **Individuals** and tick **🧪 Practice game** (not counted in statistics). In setup, add yourself and one or more **🤖 Computer opponents** (Easy, Medium, Hard, Expert). On the PC the host screen is your game controller: tap a clue, the buzzers open by themselves after a moment, press **B** (or the big Buzz button) to buzz in, say your answer, then mark yourself Correct/Incorrect — the answer stays hidden until then. Computer opponents buzz, answer, wager and play the Final on their own. You can also add computer opponents to a normal solo game.

## TV themes
Dashboard → **TV themes**: pick one of the 8 built-in looks, or **Customize…** one — colors, fonts, text sizes, corners, shadows, what appears before values ($, €, nothing…), a background image and a logo. The preview shows the real TV screen; **Save & use on TV** switches the TV immediately. Share themes with **Export** / **Import theme…** (.ojtheme.json, pictures included).

## Boards
Dashboard → Boards: create, edit, duplicate, archive, import (CSV/JSON/board package) and export. **More → Export package (with media)** saves a board together with its pictures, audio and video as one `.ojboard.zip` file — import it on another PC with **Import**.
CSV columns: `round,category,value,question,answer,daily_wager,notes` (round "Final" = Final Wager).

## Troubleshooting
- **iPad/phones can't connect:** same Wi-Fi? Network set to "Private" in Windows? Firewall allowed? Some routers isolate devices (guest mode / AP isolation) — turn it off or use another network. Use the address shown on the Home page, starting with `http://`.
- **Several networks on the PC:** Home → Network → pick the address your devices use.
- **Joy-Con not showing:** pair it in Windows Bluetooth (hold the rail sync button), keep the OfflineJeopardy window open, press **Refresh devices**, press a button. Any player can switch to their phone at any time.
- **PC restarted mid-game:** open the app — the game resumes where it was (timers paused).
- **Backups:** Settings → **Download full backup** (.zip with everything, including photos and clue media). **Restore from backup…** accepts that .zip (or an older .db backup); it is applied when the app restarts, and the previous data is kept as a safety copy in the data folder.
