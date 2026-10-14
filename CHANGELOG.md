# Changelog

All notable changes to OfflineJeopardy. Versions follow [semantic versioning](https://semver.org/).
GitHub Releases (with the Windows installer and portable exe) are published for major milestones;
their notes come from the matching section below (`scripts/release-notes.mjs`).

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
