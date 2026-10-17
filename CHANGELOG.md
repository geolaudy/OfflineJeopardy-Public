# Changelog

All notable changes to OfflineJeopardy. Versions follow [semantic versioning](https://semver.org/).
GitHub Releases (with the Windows installer and portable exe) are published for major milestones;
their notes come from the matching section below (`scripts/release-notes.mjs`).

## [0.11.0] — 2026-10-17

### New Features
- **Fairer buzzing on phones**: the game computer measures each phone's connection all the time and corrects for Wi-Fi delay (at most 50 ms), waiting a few milliseconds (never more than 60 ms) so a player on slower Wi-Fi who pressed first still wins. Joy-Cons keep working as before. Host → Rules → Advanced rules → "Who buzzed first" switches between Fair timing, Fair timing for slow Wi-Fi, and plain First to arrive.
- **"How close was it?" on phones**: players who buzzed see "You buzzed in first!", "Alex buzzed 40 ms before you!" or — when it was too close to call honestly — "Very close buzz! Alex won." The host sees who else pressed and how far behind.
- **New phone buzzer**: one big button filling the screen — red when locked, yellow when you can buzz, green when you're in — with words as well as colours, and it reacts the instant your finger touches it.
- **Final Jeopardy! answer reveals start when you're ready**: when the think time runs out, the timer disappears, answers are locked and the iPad shows **Begin Answer Reveals**.
- **Score changes in the score box**: the score briefly turns into "+$600" (green) or "−$600" (red) and then shows the new total — the same for clues, Daily Doubles and Final Jeopardy!.

### Improvements
- Category introductions on the TV are smooth again (they stuttered on PCs without strong graphics); the Final Jeopardy! swipes too.
- TV lobby and menus redesigned: smaller player cards so more fit, the minimized lobby is one tidy panel in the top-right corner, menu pages use the full width (three boards per row, two or three buzzer columns), the lobby header shows the board with its rounds, clues and Final Jeopardy!, and rules, QR code and joining instructions share one panel.
- iPad: the TV preview during the category introduction no longer repeats the player cards and is bigger; Previous Category is on the left and Next Category on the right; the yellow ring around the picking player is no longer cut off.
- TV category names are as large in their boxes as on the iPad.
- The timer on the TV has no label any more and disappears when it reaches zero.
- A player who picks a clue and then buzzes in gets one highlight, not two.
- Player names no longer have the bottoms of g, j, p, q and y cut off.
- Early buzzes are judged by when the button was really pressed: a press made clearly before the buzzers opened is caught even if it arrives a little after.

### Bug Fixes
- A short "board" sound no longer plays when Final Jeopardy! begins.
- The Final Jeopardy! timer no longer stays on the TV at 0, and the reveal no longer starts by itself.

### Known Issues
- Fair timing was tested with simulated networks and local connections, not yet with real phones on your Wi-Fi. Differences between phone touch screens and Joy-Con Bluetooth (about 10–20 ms) cannot be measured by any software, so very close buzzes are shown as "Very close".
- The smoother TV animations were measured on the development PC, not on your TV computer — if it still stutters, turn on Settings → "Reduce motion on the game board" and let us know.
- The new phone buzzer was tested in phone emulation; please report anything that scrolls or misses taps on a real phone.

## [0.10.0] — 2026-10-15

### New Features
- **Home screens**: before a lobby is open the TV shows a welcome screen with your last three games (board, date, winner, winning score, players). On the iPad, tap a recent game to show its final standings on the TV.
- **Create Lobby goes straight to the lobby** — no separate "Set up a game" screen. The board, Individuals/Teams, player and team limits, rules and timers are all chosen in the lobby, with a rules summary right there. A new lobby starts with your last game's board and rules.
- **New TV lobby**: the chosen board and a live rules panel (early-buzz lockout, buzz and answer time, Daily Double! and Final Jeopardy! rules, think time). The join QR code is smaller with a tighter frame. While you pick a board, the TV shows the choices.
- **Team management**: team games start with empty teams (about two players per team); players pick, switch or leave a team on their phones and can rename and recolour their own team. On the iPad, drag players between teams (or tap a player and choose "Move to…"). Each team shows "2 / 3 Players"; a team over the limit has to be fixed before starting, empty teams sit the game out, and players without a team get a warning. Switching to Individuals and back keeps the teams.
- **Player lobby on phones**: "I'm New" comes first; after joining, phones show the lobby (players, teams, board, rules, your buzzer) — the buzzer appears only when the game starts. Tap another player to see their statistics. Pick a **nickname for this game**; it shows as *Nickname (Real name)* in the lobby and only the nickname when you buzz in.
- **Daily Double! wagers on the phone**: the player (or team) who picked it enters the wager; the host sees it and shows the clue.
- **Final Jeopardy! on the phone**: after Submit your answer is shown with a **Change Answer** button; the TV shows a green border for submitted answers and gray for not (yet). Swipes (with the swipe sound) into the reveal and between contestants.
- **iPad hosting**: a live preview of the TV during the category introduction, Previous Category, tap any category to jump to it, Stop Auto. The board on the iPad looks like the TV board ("Alex is choosing a clue"). The clue screen has the answer in a red banner (picture answers open privately), a large clue and a compact footer: Unlock Buzzers → Correct / Incorrect → Reveal Answer → Return to Board, with rarely used controls under More.
- **Score changes** show "+$400" in green or "−$400" in red beside the score, with a quicker pop. **Winner podium**: 1st in the middle, 2nd left, 3rd right, the rest listed below, with a new victory fanfare.
- **Google Gemini** for AI answers (alongside Anthropic and local AI): enter your key, load the models your key can use, test the connection. Free-tier limits are respected — when Google says "slow down", bots answer offline until the limit resets.
- **Jeopardy!/Buzzinga sounds without picking files**: put your sounds folder (named `Sounds` or `new_sfx`) next to OfflineJeopardy.exe, or use Settings → Sounds → **Add a folder** once — the files are kept when you update.

### Improvements
- Team buzz-ins show the team name big on the TV with "Buzzed by …" underneath; the host still sees exactly who buzzed (and their real name).
- Game-show fonts are used consistently for names, money amounts and labels on the TV.
- On an iPad in portrait the navigation sidebar is folded away to give the game more room.
- Teams made in the lobby are saved automatically when the game starts, so team statistics build up.

### Bug Fixes
- Undo back into Final Jeopardy! answering now restarts the think time (and the answers already given are kept).
- Players could enter Final Jeopardy! wagers before the host opened wagering — now refused, also for direct network messages.
- Choosing "Choose Default Picture" no longer deletes an uploaded profile picture; you can switch back to it, and nothing changes until you press Save.

### Known Issues
- Google Gemini has been tested with a simulated Gemini service only, not yet with a real key.
- The public download still cannot include the Jeopardy!/Buzzinga recordings (we don't have the rights to share them) — add your own folder once as described above.
- The new iPad layouts and drag-and-drop were tested in iPad emulation; please report anything odd on a real iPad.

## [0.9.0] — 2026-10-14

### New Features
- **Local AI, no internet needed**: computer opponents can now get their "AI answers" from a local model such as Ollama or LM Studio running on the game computer or your network — free and offline. Anthropic is still available.
- **Create a board with AI**: Boards → Create with AI writes a first draft from a topic (choose categories, clues each, difficulty and a Final Jeopardy! clue). The draft opens in the editor, clearly marked AI-generated, with anything it couldn't write left blank for you.
- **Head to head on the TV**: Players → Compare → Show on TV puts two players side by side with their record against each other.
- **Practice games run themselves**: when a round is played out the game moves on to the next round, then Final Jeopardy!, then the results. In practice games your own Final Jeopardy! wager and answer box is right on the screen.
- **Volume per sound** (Settings → Sounds) — for example, turn the think music down without muting the buzzer.
- **Leaderboard minimums** are now a setting: how many games before someone is ranked by win % or average, and how many answers before accuracy.

### Improvements
- Boards saved with the old round name "Final Wager" are renamed "Final Jeopardy!" automatically (finished games keep their history as it was).
- Many buttons and pressing Joy-Cons quickly from several controllers no longer risk being ignored by the game computer.
- On an iPad in portrait the score bar's Undo button and the sound-pack cards no longer overflow.
- During a game your phone shows your picture in your lobby colour.

### Bug Fixes
- Removing a player who was buzzed in, wagering a Daily Double! or waiting in the Final Jeopardy! reveal could leave the host unable to continue.
- Undo could bring a removed player back into the Final Jeopardy! reveal.
- If nobody qualified for Final Jeopardy!, the host had no button to finish the game.

### Known Issues
- Local AI has been tested with a simulated server, not yet with a real Ollama or LM Studio install. Small models on older PCs can be slow — raise "Wait at most" in Settings.
- AI-written clues can be wrong; always check a draft before playing.

## [0.8.0] — 2026-10-14

### New Features
- **Final Jeopardy! the way it's played on TV**: players enter their own wager and answer on their phones (any team member can do it for the team). Nobody — not even the host — sees them until the reveal. The 30-second think music plays while they write, and answers close when time runs out.
- **One-at-a-time reveal**, lowest score first: who it is and their score, then their wager, then their answer, then you mark it Correct or Incorrect and the score changes. Swipe or tap Next to move on.
- **Jeopardy!/Buzzinga sound pack** (the new default): plays your own game-show sound files — buzz-in, correct, wrong, Daily Double!, board fill, category swipe, time's up, Final Jeopardy! category and think music. Classic, Arcade and Soft are still there. Add your files in Settings → Sounds; any sound without a file uses the Classic tone. *The public download does not include these recordings.*
- **The TV previews the game before the lobby opens**: the boards to choose from (it follows the board you are looking at, with its categories) and the game settings. The join QR code only appears once you press Open Lobby.
- **Profile Picture**: upload a picture or choose a default one, previewed in the round frame you'll see in the lobby. **Preferred Color**: everyone in a game gets a different colour — your preferred one if it's free, otherwise your phone lets you pick from the free colours.

### Improvements
- **Simpler clue controls**: Unlock Buzzers → Correct / Incorrect → Reveal Answer → Return to Board. After a wrong answer the buzzers open again by themselves for everyone else. Lock, reset, timers and skip are tucked away under "More".
- **Categories first**: clues can't be opened until the round's categories have been presented (or skipped); the host sees a dedicated intro screen.
- The clue is now the biggest thing on the host screen; the answer sits in a red **ANSWER** banner.
- **Return to Lobby** is the first button after a game and keeps the same lobby — even if the game computer restarted during the game. "New Lobby" is the secondary option.
- Rarely used controls (next round, Final Jeopardy!, buzzers, QR code, replay intro) moved to an **Options** button.
- "Daily Wager" is now **Daily Double!** and "Final Wager" is **Final Jeopardy!** everywhere.
- TV look: game-show style clue lettering and category/value fonts (free look-alikes; your own licensed fonts are used automatically if installed), a classic deep-blue clue background, bigger score boxes, a mustard ring around the player who picks next, and a mustard **bottom glow** when buzzers open (new default).
- Lobby: smaller, framed QR code; the compact lobby stands out from the page; centred profile pictures with the player colour as a ring; tighter player cards.
- One navigation order everywhere (Home, Boards, Players, Teams, Buzzers, Leaderboards, History, Settings, Help) and a clear **Show Leaderboards on TV** in the game menu and after each game.
- The board-fill animation now runs exactly as long as its sound, and doesn't replay when the TV reconnects.

### Bug Fixes
- Clues with only a picture, sound or video were marked "Needs Question".
- After the game computer restarted mid-game, Return to Lobby led to a game without a lobby (no join QR on the TV).
- On the results screen the back arrow quietly started a new lobby.

### Known Issues
- Sounds, the think music and the board-fill timing were checked by design and automated state tests, not by listening on the TV.
- The look-alike fonts are close to, but not the same as, ITC Korinna and Swiss 911.
- Older saved boards keep the round name "Final Wager" until you rename it in the editor.

## [0.7.0] — 2026-10-14

### New Features
- **Computer opponents play like real players**: they pick a clue when it's their turn (easy bots choose at random, expert bots think about the score), buzz in, and give an answer you can see on your screen and on the TV.
- **You judge every bot answer**: when a bot answers, the timer stops and you choose Correct or Incorrect — nothing is scored automatically. You also see the expected answer privately (hidden in practice games).
- **Believable wrong answers**: when a bot gets it wrong, it guesses something related — another answer from the same category, a similar name or a nearby year — instead of nonsense. Easier bots guess further off.
- **Optional AI answers** (needs internet and your own Anthropic API key; may cost money): bots set to "AI answers" give more natural answers. The key is stored encrypted on this computer and never sent to phones or the TV. If the AI is slow or unavailable, bots answer offline and the game carries on.

### Improvements
- Each bot has its own pace, so two bots of the same difficulty don't feel identical.
- Bot answers are kept in the game history.

### Bug Fixes
- Bots were labelled "(team)" in the history of solo games.

### Known Issues
- AI answers have been tested with a simulated provider, not yet with a real API key.
- Bots don't move to the next round or start the Final — the host does.
- Joy-Con vibration has not yet been felt on real hardware.

## [0.6.0] — 2026-10-14

### New Features
- **Return to Lobby** after a game: everyone stays in — players, teams, Joy-Cons, phones, computer opponents, the board and the settings. Scores and used clues start over; the finished game is saved in History first. "Create new lobby" is still there when you want to start fresh.
- **Show Leaderboard on TV** from the new Leaderboard page on the host. Change the ranking (wins, games played, win %, points earned, average score, correct or incorrect answers, accuracy, team contributions) and the TV follows straight away. Tap a player or team to show their statistics, then go back with Previous page or Lobby.
- New **saved teams** ranking, and a team statistics page on the TV.
- **Game settings on the TV**: a clear, read-only summary of the rules (mode, board, player limit, teams, buzzers, early-buzz penalty, timers, wagers…) that updates as the host changes them — even while the host is still choosing before the lobby opens.
- **Player history in the lobby**: each card shows games played and wins (team wins are marked as such), win percentage and winning streaks. A **crown** marks whoever won the last game in this lobby and a medal marks the player with the most wins; a small legend explains both. Players who keep their statistics private show no numbers.
- Computer opponents show their **difficulty** (Easy, Medium, Hard, Expert) on the TV lobby and in the host's lobby.

### Improvements
- Board editor: separate **Add image**, **Add audio** and **Add video** buttons; each opens the file picker showing exactly those files.
- The app version is shown correctly everywhere (it was stuck at 0.2.0).

### Bug Fixes
- Adding an audio file to a clue no longer requires switching the Windows file picker to "All files".
- A phone that disconnected no longer shows as "ready" in the lobby.

### Known Issues
- Joy-Con vibration has not yet been felt on real hardware.
- Buzzinga board import is not verified against a real shared board.
- The installer and portable exe are not code-signed (SmartScreen warns on first start).

## [0.5.0] — 2026-10-13

### New Features
- Tournaments (a series of games with running standings on the host, TV and phones).
- Head-to-head player comparison on phones and the host.
- Automatic team balancing in the team lobby.
- Buzzer check with phone connection quality.
- Joy-Con vibration feedback; Identify works from the iPad.

## [0.4.0] — 2026-10-13

### New Features
- Lobby-first start screen with one-step iPad pairing by QR code; full host app on the iPad.
- Public TV lobby, compact lobby panel and host-driven presentation pages.
- Media clues: large images with captions, separate answer media, host-controlled audio/video, automatic buzzer unlock.
- Board and clue preview, board importing from links and datasets.
- Classic board intro animation, buzzer-open indicator styles and sound packs.
- Survival mode.

## [0.3.0] — 2026-10-12

### New Features
- Board packages and full backups, custom TV themes, computer opponents and practice mode, room codes.

## [0.2.0] — 2026-10-12

### New Features
- Early-buzz rules, unanswered-clue flow, category introductions, classic game-show presentation, phone portal navigation and statistics pages.
