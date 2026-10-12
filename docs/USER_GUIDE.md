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
5. **Start game**. Tap a clue — it appears on the TV; only you see the answer.
6. **Unlock buzzers** → the first buzz wins → **Correct** or **Incorrect**. For shared buzzers, pick who answered (or "Team only").
7. Use **Undo** for mistakes; tap a score to award/deduct points.
8. When the board is cleared: **Start Final Wager** → open wagers (players enter them on their phones) → show the clue → reveal and judge → **Show the winner**.

## Players
- Profiles keep their statistics forever — renaming, new photos or different buzzers never lose history.
- Forgot a PIN? Dashboard → Players → Edit → Reset PIN.
- Players can see their stats (solo and team separately), past games clue by clue, and edit their name, nickname, photo, avatar and color — changes appear on the TV instantly.

## Boards
Dashboard → Boards: create, edit, duplicate, archive, import (CSV/JSON) and export.
CSV columns: `round,category,value,question,answer,daily_wager,notes` (round "Final" = Final Wager).

## Troubleshooting
- **iPad/phones can't connect:** same Wi-Fi? Network set to "Private" in Windows? Firewall allowed? Some routers isolate devices (guest mode / AP isolation) — turn it off or use another network. Use the address shown on the Home page, starting with `http://`.
- **Several networks on the PC:** Home → Network → pick the address your devices use.
- **Joy-Con not showing:** pair it in Windows Bluetooth (hold the rail sync button), keep the OfflineJeopardy window open, press **Refresh devices**, press a button. Any player can switch to their phone at any time.
- **PC restarted mid-game:** open the app — the game resumes where it was (timers paused).
- **Backups:** Settings → Download backup. Photos/media live in the data folder (Settings → Open data folder).
