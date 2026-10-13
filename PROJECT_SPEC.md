# OfflineJeopardy — Complete Project Specification

## 1. PROJECT OVERVIEW

### Project Name
OfflineJeopardy

### Objective
Develop a complete, polished, customizable, fully offline Jeopardy-style game for Windows.

The application should reproduce the general functionality and user experience of modern browser-based Jeopardy game platforms, particularly Buzzinga.io, while providing greater customization, unrestricted local multiplayer, and advanced features.

### Primary Requirements

- Runs entirely offline on Windows 10 and Windows 11.
- Provides a standalone desktop application.
- Supports single-player gameplay.
- Supports local multiplayer.
- Requires no external game servers.
- Requires no cloud accounts.
- Requires no subscriptions.
- Requires no paid APIs.
- Allows unlimited game-board creation.
- Allows configurable player counts.
- Supports extensive visual customization.
- Supports configurable game rules.
- Stores application data locally.
- Includes automated testing.
- Supports future expansion through a modular architecture.
- Provides a Windows installer or portable executable.
- Requires minimal user intervention during development.

The final application must be functional, not merely a visual prototype.

---

# 2. AUTONOMOUS DEVELOPMENT

Claude Code acts as the primary development orchestrator.

It should independently plan, implement, test, debug, integrate, and package the application.

### Required Agent Roles

Create and configure specialized Claude Code subagents:

1. Research Agent
2. Backend Agent
3. Frontend Agent
4. Gameplay Agent
5. Quality Assurance Agent
6. Integration Agent

### Development Rules

- Make ordinary engineering decisions independently.
- Do not repeatedly ask the user for approval.
- Delegate suitable tasks to specialized agents.
- Use parallel development when dependencies allow.
- Avoid simultaneous modification of the same files.
- Use Git branches or worktrees for isolated development.
- Maintain persistent progress documentation.
- Automatically investigate and fix recoverable errors.
- Execute automated tests after relevant changes.
- Do not claim untested functionality is complete.
- Preserve resumable progress when sessions end.
- Do not bypass security controls or required permissions.

### Required Documentation

Maintain:

- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `FEATURE_MATRIX.md`
- `PROGRESS.md`
- `DECISIONS.md`
- `KNOWN_ISSUES.md`
- `RESEARCH_NOTES.md`

---

# 3. REFERENCE RESEARCH AND REA POLICY

REA refers to Reverse Engineer Anything by morluto.

Official repository:
https://github.com/morluto/rea

REA is available as an optional research tool.

### Core Principle

Do not waste development time reverse engineering straightforward functionality.

Implement common software features independently using established engineering practices.

### Features That Do Not Require Reverse Engineering

Examples include:

- Board creation.
- Category management.
- Question editing.
- Answer editing.
- Scoring.
- Timers.
- Themes.
- CSV importing.
- CSV exporting.
- Local database storage.
- Standard multiplayer interfaces.
- Basic user management.
- Application settings.
- File importing and exporting.

### Appropriate REA Usage

Use REA when investigating a specific uncertain behavior provides meaningful value.

Examples:

- Complex buzzer arbitration.
- Unusual host/player synchronization.
- Non-obvious wagering interactions.
- Complex game-state transitions.
- Specialized editor interactions.
- Unclear multiplayer behavior.

### Research Restrictions

- Use publicly accessible documentation and authorized observations.
- Do not copy protected artwork or branding.
- Do not attempt to obtain private server code.
- Do not access private data.
- Do not bypass authentication or access controls.
- Do not depend on unavailable proprietary APIs.
- Do not let REA research block independent implementation.

Record findings and uncertainties in `RESEARCH_NOTES.md`.

---

# 4. PREFERRED TECHNOLOGY STACK

Use the following technologies unless a clearly better alternative is justified.

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Framer Motion

### Backend
- Node.js
- TypeScript
- Fastify or Express
- WebSockets
- SQLite

### Desktop
- Electron
- Windows installer packaging
- Portable Windows packaging where practical

### Testing
- Vitest
- React Testing Library
- Playwright
- Backend integration tests

### General Requirements
- No mandatory cloud services.
- No external runtime dependencies.
- No CDN-hosted application assets.
- No mandatory online authentication.
- No remote database.
- No subscription validation.
- All essential game functionality must work offline.

Claude Code may automatically install compatible project dependencies when permitted.

---

# 5. APPLICATION MODES

## 5.1 Single-Player

Implement:

- Local gameplay.
- Keyboard controls.
- Mouse controls.
- Optional computer opponents.
- Configurable computer difficulty.
- Practice mode.
- Score tracking.
- Saved progress.
- Custom rules.

Computer opponents must function offline.

## 5.2 Local Multiplayer

Implement:

- Shared-screen gameplay.
- Multiple local players.
- Configurable keyboard mappings.
- Keyboard buzzing.
- Controller support where practical.
- Individual scores.
- Team gameplay.
- Configurable player limits.

## 5.3 LAN Multiplayer

Implement:

- Local server hosting.
- Browser-based player interfaces.
- Smartphone participation.
- Tablet participation.
- Computer participation.
- QR-code joining.
- Room-code joining.
- Direct LAN joining links.
- Real-time WebSocket synchronization.
- Player reconnection.
- Host controls.
- Team management.
- Score synchronization.
- No internet requirement.

## 5.4 Optional Remote Multiplayer

Remote multiplayer may be implemented through self-hosted networking.

It must not be required for offline gameplay.

---

# 6. BOARD CREATION AND EDITING

Implement:

1. Custom game boards.
2. Custom board titles.
3. Board descriptions.
4. Six-category traditional layouts.
5. Five clue rows per category.
6. Fewer than six categories.
7. More than six categories.
8. Configurable clue rows.
9. Custom category names.
10. Custom clues.
11. Custom answers.
12. Adjustable clue values.
13. Category rearrangement.
14. Drag-and-drop category editing.
15. Clue rearrangement.
16. Category importing.
17. Category exporting.
18. Board duplication.
19. Board deletion.
20. Board renaming.
21. Board previews.
22. Automatic draft saving.
23. Manual saving.
24. Board version history.
25. Reusable board templates.
26. Board tags.
27. Board searching.
28. Board filtering.
29. Board folders.
30. Unlimited board creation.

Provide an intuitive visual editor.

Allow users to configure board layouts without modifying source code.

---

# 7. MULTIMEDIA CLUES

Support:

- Text clues.
- Image clues.
- Audio clues.
- Video clues.
- Multiple images per clue.
- Mixed-media clues.
- Animated images.
- Rich-text formatting.
- Mathematical expressions.
- Code snippets.
- Embedded diagrams.
- Optional subtitles.
- Media previews.

### Media Sources

Support local media files.

YouTube links may be stored as optional references.

Do not require YouTube or internet access for gameplay.

Provide a mechanism to associate locally available media with clues.

### Media Management

Implement:

- Media importing.
- Media replacement.
- Media deletion.
- Media previews.
- Local media storage.
- Media validation.
- Media packaging during game export.

---

# 8. VISUAL CUSTOMIZATION

Implement an advanced theme system.

Allow customization of:

- Board backgrounds.
- Category colors.
- Clue tile colors.
- Point-value colors.
- Typography.
- Font sizes.
- Borders.
- Shadows.
- Animations.
- Background images.
- Logos.
- Sound effects.
- Transition effects.
- Answer reveal effects.
- Buzzer effects.
- Scoreboard appearance.
- Player avatars.
- Team colors.
- Timer appearance.

### Preset Themes

Include:

1. Classic Game Show
2. Modern Minimal
3. Dark Mode
4. Neon Arcade
5. Retro Television
6. Classroom
7. Corporate
8. Custom

Support theme importing and exporting.

Provide a live theme preview.

---

# 9. PLAYER MANAGEMENT

Implement:

- Player creation.
- Player names.
- Player avatars.
- Player colors.
- Guest players.
- Local player profiles.
- QR-code joining.
- Room-code joining.
- Direct LAN links.
- Player removal.
- Player reconnection.
- Player readiness indicators.
- Player connection status.
- Host-controlled permissions.
- Spectator mode.
- Configurable player limits.
- Team assignment.
- Automatic team balancing.
- Manual team assignment.

No external player account is required.

---

# 10. DIGITAL BUZZER SYSTEM

Implement:

1. Browser-based buzzers.
2. Touchscreen buzzers.
3. Keyboard buzzers.
4. Compatible physical USB buzzers.
5. Configurable keyboard mappings.
6. First-player detection.
7. Server-authoritative buzzer ordering.
8. Automatic buzzer lockouts.
9. Automatic buzzer resets.
10. Visual buzzer feedback.
11. Audio buzzer feedback.
12. Host-visible buzzer results.
13. Player-specific buzzer indicators.
14. Configurable buzzer activation.
15. Buzzer delay settings.
16. Optional early-buzz penalties.
17. Manual buzzer unlocking.
18. Manual buzzer resetting.
19. Buzzer-free gameplay.
20. Team buzzer modes.

### Reliability

Handle simultaneous buzzer presses deterministically.

Do not trust player-submitted timestamps.

Prevent disconnected clients from submitting stale buzzer events.

Provide latency diagnostics where practical.

---

# 11. SCORING SYSTEM

Implement:

- Automatic scoring.
- Manual score adjustment.
- Score undo.
- Score redo.
- Negative scores.
- Custom scoring rules.
- Custom clue values.
- Individual scoring.
- Team scoring.
- Score history.
- Scoreboard sorting.
- Leaderboards.
- Wager-based scoring.
- Score multipliers.
- Bonus points.
- Penalty points.
- Tie handling.
- Winner determination.
- Score exporting.

Record score changes in an auditable event history.

---

# 12. DAILY WAGER SYSTEM

Implement:

- Daily Wager clues.
- Manual Daily Wager placement.
- Random Daily Wager placement.
- Configurable Daily Wager counts.
- Player wager selection.
- Team wager selection.
- Wager validation.
- Hidden wager options.
- Correct-answer scoring.
- Incorrect-answer scoring.
- Host overrides.
- Custom wager rules.

---

# 13. FINAL WAGER SYSTEM

Implement:

- Final category.
- Final clue.
- Final answer.
- Player wagers.
- Team wagers.
- Hidden wagers.
- Wager limits.
- Player answer submission.
- Team answer submission.
- Answer reveal.
- Host adjudication.
- Automatic score calculations.
- Winner announcement.
- Tie resolution.
- Optional final timer.
- Custom final music.
- Final results screen.

Support traditional Jeopardy-style final rounds and configurable alternatives.

---

# 14. HOST CONTROLLER

Provide a dedicated host interface.

The host must be able to:

1. Start games.
2. Pause games.
3. Resume games.
4. End games.
5. Restart games.
6. Select clues.
7. Reveal clues.
8. Reveal answers.
9. Hide answers.
10. Activate buzzers.
11. Lock buzzers.
12. Reset buzzers.
13. Mark answers correct.
14. Mark answers incorrect.
15. Adjust scores.
16. Undo actions.
17. Skip clues.
18. Restore skipped clues.
19. Manage players.
20. Manage teams.
21. Configure timers.
22. Trigger Daily Wagers.
23. Trigger Final Wager.
24. Control audio.
25. Control animations.
26. Change display settings.
27. Open presentation mode.
28. Save progress.
29. Resume games.
30. View event history.

Support keyboard shortcuts.

Allow host control from a separate LAN-connected device.

---

# 15. GAME PRESENTATION

Implement:

- Full-screen board.
- Responsive layout.
- Large-screen optimization.
- Projector compatibility.
- Secondary-monitor support.
- Clue animations.
- Answer reveals.
- Scoreboard overlays.
- Player indicators.
- Buzzer indicators.
- Timer overlays.
- Daily Wager transitions.
- Final Wager transitions.
- Winner announcements.
- Custom backgrounds.
- Custom branding.

Presentation mode must not expose hidden answers or privileged host controls.

---

# 16. TEAM GAMEPLAY

Implement:

- Team creation.
- Team names.
- Team colors.
- Team avatars.
- Team assignments.
- Shared team scores.
- Individual contributions.
- Team buzzers.
- Individual buzzers within teams.
- Team wagering.
- Team leaderboards.
- Team balancing.
- Team switching.
- Configurable team limits.

---

# 17. TIMER SYSTEM

Implement timers for:

- Clue reading.
- Buzzing.
- Answering.
- Wager selection.
- Final Wager answers.
- Round transitions.
- Entire game duration.

### Timer Features

- Countdown display.
- Audio warnings.
- Pause.
- Resume.
- Automatic expiration.
- Configurable expiration behavior.
- Optional penalties.
- Host overrides.
- Timer disabling.
- Custom timer themes.
- LAN synchronization.

---

# 18. IMPORTING AND EXPORTING

Support:

- CSV importing.
- CSV exporting.
- JSON importing.
- JSON exporting.
- Complete game-package importing.
- Complete game-package exporting.
- Board templates.
- Category importing.
- Category exporting.
- Media packaging.
- Import validation.
- Duplicate detection.
- Import previews.
- Error reporting.

Exported game packages must work on another offline installation.

---

# 19. OPTIONAL OFFLINE AI

Implement optional AI-assisted content creation.

Possible features:

- Question generation.
- Answer generation.
- Category generation.
- Difficulty adjustment.
- Question rewriting.
- Grammar correction.
- Duplicate detection.
- Trivia validation suggestions.
- Automatic board generation.
- Theme-based board generation.

### AI Requirements

- Support locally installed models.
- Prefer compatibility with Ollama.
- No mandatory cloud APIs.
- No required paid subscriptions.
- Manual fallback for every AI operation.
- Clearly identify AI-generated content.

The application must function normally without AI.

---

# 20. GAME LIBRARY

Implement:

- Board browsing.
- Board searching.
- Board filtering.
- Board sorting.
- Board duplication.
- Board deletion.
- Board archiving.
- Archived board restoration.
- Favorite boards.
- Board tags.
- Board folders.
- Board previews.
- Board metadata.
- Board importing.
- Board exporting.
- Board-package sharing.

Support a locally managed community-style library through imported packages.

---

# 21. LOCAL WORKSPACES

Implement optional organizational workspaces.

Features:

- Workspace creation.
- Workspace naming.
- Workspace logos.
- Workspace colors.
- Member management.
- Local invitations.
- Role-based permissions.
- Owner role.
- Administrator role.
- Editor role.
- Host role.
- Viewer role.
- Shared board library.
- Private board collections.
- Workspace templates.
- Seat management without licensing restrictions.
- Shared branding.
- Reusable training games.

Support LAN collaboration.

---

# 22. GAME HISTORY AND STATISTICS

Implement:

- Completed game history.
- Player statistics.
- Team statistics.
- Win/loss records.
- Average scores.
- Correct-answer percentages.
- Incorrect-answer percentages.
- Response timing.
- Buzzer timing.
- Category performance.
- Game duration.
- Highest scores.
- Historical leaderboards.
- Statistics exporting.
- Game replay.
- Event history.

Store records locally.

Allow statistics tracking to be disabled.

---

# 23. GAME SAVE AND RESUME

Implement:

- Automatic game-state saving.
- Manual saving.
- Resume previous games.
- Restore player scores.
- Restore completed clues.
- Restore player assignments.
- Restore timers.
- Restore wagers.
- Crash recovery.
- Unexpected shutdown recovery.
- Multiple save slots.
- Save-file exporting.

Use transactional storage and event logs.

---

# 24. ACCESSIBILITY

Implement:

- Keyboard navigation.
- Screen-reader support.
- ARIA labels.
- Adjustable font sizes.
- High-contrast themes.
- Colorblind-friendly indicators.
- Reduced-motion settings.
- Adjustable sound levels.
- Optional captions.
- Accessible buzzer controls.
- Focus indicators.
- Configurable keyboard shortcuts.

Target WCAG 2.2 AA where practical.

---

# 25. OFFLINE REQUIREMENTS

The application must work without internet access.

Offline functionality must include:

- Application launch.
- Board creation.
- Board editing.
- Game hosting.
- Local multiplayer.
- LAN multiplayer.
- Scoring.
- Timers.
- Buzzers.
- Wagering.
- Media playback.
- Game saving.
- Game loading.
- Board importing.
- Board exporting.

No mandatory external service calls.

No CDN-hosted application assets.

No remote font dependencies.

No remote authentication.

No cloud-only game logic.

Optional online integrations must fail gracefully.

Test with internet access disabled.

---

# 26. WINDOWS APPLICATION

Package as a Windows desktop application.

Requirements:

- Windows 10 compatibility.
- Windows 11 compatibility.
- Installer.
- Portable build where practical.
- Desktop shortcut support.
- Local database.
- Automatic backend startup.
- Automatic backend shutdown.
- Configurable data directory.
- Configurable backup directory.
- Local logging.
- Error reporting.
- Database backup.
- Database restore.
- LAN server controls.
- Firewall guidance.

The user must not need to manually launch backend services.

---

# 27. MODULAR ARCHITECTURE

Separate:

- Game engine.
- Scoring engine.
- Buzzer engine.
- Timer engine.
- Board editor.
- Media manager.
- Player manager.
- Team manager.
- Network manager.
- Persistence layer.
- Theme engine.
- Plugin system.
- AI integration.
- Statistics engine.

Use documented interfaces.

Avoid hardcoded game rules.

Allow new modes without major rewrites.

---

# 28. ADDITIONAL GAME MODES

Implement or provide extensibility for:

- Classic Jeopardy.
- Double Jeopardy.
- Triple Jeopardy.
- Speed Trivia.
- Team Battle.
- Classroom Quiz.
- Practice Mode.
- Survival Mode.
- Tournament Mode.
- Custom Rule Mode.

Support custom rule presets.

---

# 29. SETTINGS

Implement settings for:

### General
- Language.
- Theme.
- Default board.
- Autosave.
- Data location.

### Gameplay
- Scoring.
- Timers.
- Buzzers.
- Wagering.
- Player limits.
- Team settings.

### Appearance
- Colors.
- Fonts.
- Animations.
- Backgrounds.
- Logos.
- Sounds.

### Networking
- LAN server.
- Port configuration.
- Room codes.
- Connection diagnostics.
- Network discovery.

### Storage
- Backups.
- Exports.
- Imports.
- Database maintenance.

### Advanced
- Developer settings.
- Debug logging.
- Experimental features.
- Plugin management.

---

# 30. SECURITY

Implement:

- Input validation.
- Safe media handling.
- Import validation.
- Path traversal protection.
- WebSocket message validation.
- Host authorization.
- Role-based permissions.
- Database integrity checks.
- Secure local password storage.
- Safe LAN binding.
- Rate limiting.
- Crash recovery.
- Transactional score updates.

Clients must not determine authoritative scores, winners, or buzzer order.

---

# 31. USER INTERFACE

Create a polished, responsive, customizable interface using and improving on Buzzinga.io ui and themes.

Required screens:

1. Home dashboard.
2. Game library.
3. Board editor.
4. Board preview.
5. New game setup.
6. Player lobby.
7. Team setup.
8. Host controller.
9. Presentation screen.
10. Player buzzer interface.
11. Daily Wager screen.
12. Final Wager screen.
13. Results screen.
14. Statistics dashboard.
15. Theme editor.
16. Settings.
17. Workspace management.
18. Import/export manager.
19. Game history.
20. Help and documentation.

Every visible interactive control must work.

Avoid placeholder buttons and disconnected mockups.

---

# 32. DEVELOPMENT PHASES

## Phase 1 — Architecture
- Inspect repository.
- Verify environment.
- Review requirements.
- Configure agents.
- Design architecture.
- Define database.
- Define network contracts.
- Create documentation.

## Phase 2 — Core Application
- Electron.
- React.
- Local backend.
- SQLite.
- Navigation.
- Settings.
- Themes.

## Phase 3 — Board Editor
- Boards.
- Categories.
- Clues.
- Answers.
- Point values.
- Saving.
- Import/export.

## Phase 4 — Gameplay
- Game presentation.
- Clue selection.
- Scoring.
- Daily Wagers.
- Final Wager.
- Game state.

## Phase 5 — Multiplayer
- LAN server.
- Player connections.
- Room codes.
- QR joining.
- WebSockets.
- Buzzers.
- Teams.

## Phase 6 — Host Controls
- Host dashboard.
- Presentation mode.
- Answer reveals.
- Timers.
- Score corrections.

## Phase 7 — Customization
- Themes.
- Colors.
- Fonts.
- Sounds.
- Logos.
- Multimedia.

## Phase 8 — Advanced Features
- History.
- Statistics.
- Workspaces.
- Optional AI.
- Advanced game modes.
- Plugins.

## Phase 9 — Testing
- Unit tests.
- Integration tests.
- UI tests.
- Multiplayer tests.
- Offline tests.
- Recovery tests.

## Phase 10 — Packaging
- Windows installer.
- Portable build.
- Documentation.
- Example boards.
- Example themes.

---

# 33. AUTOMATED TESTING

Test:

- Board creation.
- Board editing.
- Board deletion.
- Category management.
- Question management.
- Scoring.
- Negative scores.
- Wager validation.
- Daily Wagers.
- Final Wager.
- Buzzer ordering.
- Simultaneous buzzing.
- Player disconnection.
- Player reconnection.
- Timer synchronization.
- Game saving.
- Game resuming.
- Database recovery.
- CSV importing.
- JSON importing.
- Media loading.
- LAN connectivity.
- Host permissions.
- Workspace permissions.
- Offline operation.

Tests must validate real behavior.

---

# 34. FEATURE TRACKING

Maintain `FEATURE_MATRIX.md`.

For every requirement, record:

- Feature ID.
- Feature name.
- Description.
- Priority.
- Status.
- Source files.
- Tests.
- Known limitations.

Statuses:

- NOT STARTED
- IN PROGRESS
- IMPLEMENTED
- TESTED
- BLOCKED

Do not mark features TESTED unless relevant tests have executed successfully.

---

# 35. CUSTOMIZATION REQUIREMENTS

Avoid hardcoded assumptions.

Make configurable:

- Category counts.
- Question counts.
- Point values.
- Round counts.
- Game rules.
- Buzzer rules.
- Wager rules.
- Timer rules.
- Player limits.
- Team limits.
- Scoring formulas.
- Themes.
- Fonts.
- Colors.
- Sounds.
- Animations.
- Game modes.
- Host permissions.
- Presentation layouts.

Use modular configuration systems.

---

# 36. ACCEPTANCE CRITERIA

The project is complete only when:

1. Windows application launches.
2. Offline operation works.
3. Board creation works.
4. Board editing works.
5. Board saving works.
6. Board loading works.
7. Full games can be played.
8. Scoring works.
9. Daily Wagers work.
10. Final Wagers work.
11. Digital buzzers work.
12. LAN multiplayer works.
13. QR joining works.
14. Team gameplay works.
15. Host controls work.
16. Multimedia clues work.
17. Themes work.
18. Game saving and resuming work.
19. Importing and exporting work.
20. Statistics and history work.
21. Windows packaging works.
22. Automated tests pass.
23. Every requirement is tracked.
24. No essential feature requires internet access.

Optional integrations must not prevent core functionality.

---

# 37. AUTONOMOUS EXECUTION DIRECTIVE

Claude Code must minimize unnecessary user involvement.

### Required Behavior

- Read project documentation before development.
- Make ordinary architectural decisions independently.
- Use specialized agents when beneficial.
- Use parallel development where appropriate.
- Automatically install project dependencies when permitted.
- Automatically run tests.
- Automatically investigate and repair errors.
- Maintain persistent progress documentation.
- Commit verified milestones.
- Continue through incomplete requirements.
- Preserve resumable progress when interrupted.

### Do Not

- Ask unnecessary implementation questions.
- Stop after creating a prototype.
- Claim features work without testing.
- Create nonfunctional placeholder controls.
- Spend excessive time reverse engineering straightforward features.
- Introduce mandatory online dependencies.
- Ignore failing tests.
- Bypass required permissions.
- Fabricate completion reports.

### Session Recovery

At the beginning of each session:

1. Read `CLAUDE.md`.
2. Read `PROJECT_SPEC.md`.
3. Read `PROGRESS.md`.
4. Read `IMPLEMENTATION_PLAN.md`.
5. Read `FEATURE_MATRIX.md`.
6. Inspect Git status.
7. Resume the next incomplete milestone.

At the end of each session:

1. Update progress documentation.
2. Record unresolved issues.
3. Commit verified work.
4. Record the next recommended task.
5. Preserve a resumable state.

---

# 38. FINAL DELIVERABLES

Produce:

- Complete source code.
- Windows installer.
- Portable Windows executable where practical.
- Local database implementation.
- Automated test suite.
- User documentation.
- Developer documentation.
- Example game boards.
- Example themes.
- Feature completion report.
- Known limitations report.

The final application must be a functional, polished, extensible, fully offline Jeopardy-style game.
# 39. USER INTERFACE DESIGN PHILOSOPHY

The application's interface must prioritize simplicity, clarity, ease of use, and visual consistency.

The user prefers a clean, modern, intuitive design rather than a visually cluttered or overly complicated interface.

## Core Design Principles

### 39.1 Simplicity

- Use a clean and minimal interface.
- Avoid unnecessary visual clutter.
- Avoid excessive menus, buttons, and decorative elements.
- Make important controls immediately visible.
- Organize related controls logically.
- Use consistent spacing, typography, and colors.
- Prioritize usability over decorative complexity.

### 39.2 Ease of Use

The application should be understandable to someone with no technical knowledge.

Users should be able to:

- Create a game without reading extensive instructions.
- Edit categories and questions easily.
- Start a game with minimal setup.
- Connect a host controller easily.
- Connect player buzzers easily.
- Understand what every button does.
- Identify the current game state immediately.
- Recover from mistakes without difficulty.

Avoid requiring users to navigate through multiple screens for common actions.

### 39.3 Visual Design

Use a modern, professional visual style.

Preferred characteristics:

- Clean layouts.
- Simple navigation.
- Readable typography.
- Consistent button styles.
- Subtle animations.
- Clear visual hierarchy.
- Rounded corners where appropriate.
- Balanced spacing.
- Minimal distractions.
- Responsive layouts.

Do not sacrifice usability for elaborate animations or visual effects.

### 39.4 Progressive Disclosure

Advanced options should be available without overwhelming ordinary users.

Use:

- Collapsible advanced settings.
- Clearly organized settings categories.
- Contextual controls.
- Tooltips where helpful.
- Sensible default configurations.

The default interface should expose the controls needed for normal gameplay.

### 39.5 Responsive Design

Optimize interfaces for:

- Windows desktop computers.
- Large television screens.
- iPads and other tablets.
- Smartphones.
- Projectors.

Each interface should be designed specifically for its intended purpose rather than simply shrinking the desktop interface.

### 39.6 Accessibility

Maintain:

- High-contrast text.
- Readable font sizes.
- Large touch targets.
- Keyboard navigation.
- Clear status indicators.
- Consistent control placement.
- Accessible color choices.

### 39.7 Design Validation

The frontend and QA agents must evaluate interface usability.

Automated UI tests should verify that primary gameplay actions are easy to access and function correctly.

The application should feel polished, straightforward, and intuitive.

---

# 40. SEPARATE HOST CONTROLLER AND PUBLIC GAME BOARD

This is a mandatory, high-priority feature.

The application must support separate, synchronized interfaces for the host and participants.

The primary intended setup is:

- A Windows PC runs OfflineJeopardy.
- The Windows PC displays the public game board on a television or projector.
- The host uses an iPad to control the game through Safari.
- Players optionally use smartphones as buzzers.
- All devices communicate over the same local network.
- No internet connection or external server is required.

This functionality must be implemented early in development.

## 40.1 Local Server Architecture

The Windows application must automatically start a local game server.

The server is responsible for:

- Game sessions.
- Current board state.
- Clue selection.
- Clue presentation.
- Answer visibility.
- Player scores.
- Buzzer states.
- Timer synchronization.
- Wagering.
- Player connections.
- Host connections.
- Game persistence.

Use WebSockets for real-time communication.

The server must be authoritative.

Clients must not independently determine scores, winners, or buzzer order.

## 40.2 Separate Interfaces

Implement three primary interfaces.

### Interface A — Public Game Board

Designed for the Windows PC, television, or projector.

This interface is visible to participants.

It must display:

- Categories.
- Clue values.
- Selected clues.
- Questions.
- Relevant multimedia.
- Countdown timers.
- Player scores.
- Team scores.
- Buzzer results.
- Daily Wager transitions.
- Final Wager transitions.
- Winner announcements.

The public board must not expose:

- Correct answers before reveal.
- Host-only controls.
- Hidden wagers.
- Administrative settings.
- Private player information.

### Interface B — Host Controller

Designed primarily for iPad Safari.

This interface must provide complete control over gameplay.

The host must be able to:

1. View the current game board.
2. Select a category.
3. Select a clue value.
4. Open the selected clue on the public board.
5. View the correct answer privately.
6. Reveal the correct answer publicly when desired.
7. Unlock player buzzers.
8. Lock player buzzers.
9. Reset buzzers.
10. Start countdown timers.
11. Pause countdown timers.
12. Reset countdown timers.
13. Mark answers correct.
14. Mark answers incorrect.
15. Award points.
16. Deduct points.
17. Undo scoring changes.
18. Skip clues.
19. Return to the board.
20. View player scores.
21. Manage players.
22. Manage teams.
23. Control Daily Wagers.
24. Control Final Wager.
25. Pause gameplay.
26. Resume gameplay.
27. End the game.
28. Save the current session.
29. Resume an interrupted session.
30. Access game settings.

The host controller must remain synchronized with the public board.

### Interface C — Player Buzzer

Designed primarily for smartphones.

Features:

- Join through QR code.
- Join through a room code.
- Enter player name.
- Display a large buzzer button.
- Show whether buzzing is enabled.
- Provide immediate feedback when buzzing.
- Show who buzzed first.
- Display relevant player status.
- Reconnect after temporary disconnection.

## 40.3 iPad Host Controller Requirements

The host controller must work through a standard browser.

Do not require:

- An iPad application installation.
- An Apple developer account.
- An App Store download.
- Internet access.
- A cloud account.
- A subscription.

The interface must work in Safari on modern iPads.

Optimize the layout for landscape orientation while supporting portrait orientation.

Use large touch-friendly buttons.

Prevent accidental double submissions.

Avoid controls that require mouse hovering.

Ensure that the host can comfortably operate the game while standing or sitting away from the Windows computer.

## 40.4 Connecting the iPad

The Windows application must provide a simple connection process.

When hosting a game, display:

- Local server status.
- Local IP address.
- Host controller URL.
- Host controller QR code.
- Player joining URL.
- Player joining QR code.
- Current game session status.

Example:

Host Controller:
http://192.168.1.100:3000/host

Player Joining:
http://192.168.1.100:3000/join

These addresses are illustrative.

The application must automatically detect the actual local network address.

If multiple network interfaces exist, allow the user to select the correct interface.

Provide understandable connection troubleshooting.

## 40.5 Host Authentication

Host controls must be protected from unauthorized participants.

Implement a local host authentication mechanism.

Acceptable approaches include:

- Host PIN.
- Temporary host access token.
- Pairing code.
- Device pairing.

The host should be able to reconnect without repeating the entire setup unnecessarily.

Player connections must not grant host privileges.

Do not expose privileged host actions through unauthenticated WebSocket messages.

## 40.6 Current Game Synchronization

The host controller must automatically connect to the active game session.

When the host opens the controller on the iPad:

1. Establish a local connection.
2. Authenticate the host.
3. Identify the active game.
4. Retrieve the current game state.
5. Display the current board.
6. Synchronize scores.
7. Synchronize timers.
8. Synchronize buzzer states.
9. Resume normal host control.

The host should not need to restart the game.

If multiple saved games exist, provide a simple game-selection screen.

## 40.7 Real-Time Synchronization

Actions performed on the iPad must update the public board automatically.

Examples:

### Selecting a Clue

Host taps:

History → 400

Expected behavior:

- Host controller selects the clue.
- Server updates the game state.
- Public board displays the selected clue.
- Host controller displays the correct answer privately.
- Player buzzers remain in the appropriate state.

### Unlocking Buzzers

Host taps:

Unlock Buzzers

Expected behavior:

- Server activates buzzing.
- Player devices display active buzzers.
- Public board reflects the appropriate state.
- First valid buzzer press is recorded.
- Other buzzers are locked according to game rules.
- Host sees which player buzzed first.

### Starting a Timer

Host taps:

Start Timer

Expected behavior:

- Server starts the authoritative timer.
- Public board displays the countdown.
- Host controller displays the same countdown.
- Connected player interfaces receive relevant updates.

### Awarding Points

Host taps:

Correct Answer

Expected behavior:

- Server validates the action.
- Score is updated.
- Public scoreboard updates.
- Host controller updates.
- Score history records the event.

## 40.8 Private Answer Visibility

This feature is mandatory.

The host must be able to view correct answers privately on the iPad while the television displays only the question.

The host controller should display:

- Current category.
- Current clue value.
- Question.
- Correct answer.
- Optional host notes.
- Timer controls.
- Buzzer controls.
- Scoring controls.

Correct answers must not be transmitted to unauthorized player or public-display clients before reveal.

Use server-side authorization and role-specific state projections.

Do not merely hide answers using CSS.

## 40.9 Game State Recovery

If the iPad disconnects:

- The Windows game must continue running.
- The public board must remain active.
- Player scores must be preserved.
- The host must be able to reconnect.
- The host controller must retrieve the current state.
- The game must not restart automatically.

If the Windows application restarts:

- Restore the most recently saved game state.
- Preserve completed clues.
- Preserve player scores.
- Preserve team assignments.
- Restore wagering state where appropriate.
- Restore the current game phase safely.

Timers and active buzzers should recover according to documented safety rules.

## 40.10 Multiple Displays

Support:

- Public board on the Windows PC.
- Public board on a connected television.
- Public board on a projector.
- Host controller on an iPad.
- Host controller on another computer.
- Player buzzers on smartphones.

Allow the public board to run in a dedicated full-screen window.

Support secondary-monitor placement.

Do not require the host controller to be visible on the television.

## 40.11 Offline Network Requirements

The system must work with:

- A normal home Wi-Fi router without internet.
- A local Ethernet network.
- A compatible local wireless network.

Do not require cloud services for device discovery or communication.

The Windows PC acts as the local server.

Provide firewall configuration guidance.

Explain when devices must be on the same network.

Handle network disconnections gracefully.

## 40.12 User Experience

The host controller should be clean, simple, and immediately understandable.

Suggested layout:

Top:
- Current game title.
- Connection status.
- Current game phase.

Main area:
- Interactive category and clue grid.

Selected clue panel:
- Question.
- Correct answer.
- Host notes.

Controls:
- Reveal clue.
- Unlock buzzers.
- Lock buzzers.
- Start timer.
- Pause timer.
- Correct.
- Incorrect.
- Return to board.

Bottom:
- Player scores.
- Team scores.
- Undo action.
- Game settings.

Avoid overcrowding the interface.

Use contextual controls so that only relevant actions are emphasized during each game phase.

## 40.13 Required Testing

Create automated tests verifying:

1. Windows server starts.
2. iPad-compatible browser can connect.
3. Host authentication works.
4. Host can reconnect.
5. Public board connects.
6. Player devices connect.
7. Host can select clues.
8. Selected clues appear publicly.
9. Host sees private answers.
10. Public clients cannot access hidden answers.
11. Host can unlock buzzers.
12. Player buzzing works.
13. First buzzer wins.
14. Timer synchronization works.
15. Score updates synchronize.
16. Game state survives host disconnection.
17. Game state survives application restart.
18. LAN gameplay works without internet.
19. Unauthorized clients cannot perform host actions.
20. Full gameplay can be completed using the iPad host controller.

Use Playwright with tablet-sized browser viewports for automated host-interface testing.

Also verify functionality in Safari on a real iPad when hardware is available.

## 40.14 Acceptance Criteria

This feature is complete only when:

- The Windows application hosts a game locally.
- The public board can be displayed on a television.
- An iPad can connect through Safari.
- The iPad can control the game.
- The host can privately view correct answers.
- Clue selection updates the public board.
- Buzzer controls work.
- Timers synchronize.
- Scores synchronize.
- The host can reconnect to an active session.
- No internet connection is required.
- The interface is clean, responsive, and easy to use.

This is a critical requirement and must be prioritized during core development.

# 41. NINTENDO SWITCH JOY-CON PHYSICAL BUZZER SUPPORT

## Priority: HIGH — REQUIRED CORE FEATURE

The application must support Nintendo Switch Joy-Con controllers as wireless physical buzzers.

Joy-Con support is a mandatory feature and must not be treated as an optional enhancement.

The primary intended setup is:

- Windows PC runs OfflineJeopardy.
- Public game board is displayed on a television.
- Host controls the game from an iPad.
- Players use Nintendo Switch Joy-Cons as physical buzzers.
- Other players may simultaneously use smartphone or keyboard buzzers.
- All gameplay works without internet access.

## 41.1 Controller Compatibility

Support:

- Original Nintendo Switch Joy-Con (L).
- Original Nintendo Switch Joy-Con (R).
- Multiple Joy-Cons connected simultaneously.
- Individual Joy-Cons used independently.
- Mixed left and right Joy-Con configurations.

Each Joy-Con should function as an independent buzzer device.

Investigate support for newer Joy-Con models separately and document compatibility rather than assuming identical behavior.

Use existing Windows-compatible controller input libraries when practical.

Do not reverse engineer Nintendo's controller protocols unless necessary.

## 41.2 Bluetooth Connection

Joy-Cons should connect directly to the Windows PC using Bluetooth.

The application must:

1. Detect supported connected Joy-Cons.
2. Identify individual controllers.
3. Display controller connection status.
4. Allow assigning controllers to players.
5. Allow assigning controllers to teams.
6. Detect controller disconnections.
7. Detect controller reconnections.
8. Restore player assignments when reliably identifiable.
9. Display troubleshooting information.
10. Support multiple connected controllers.

The application should provide instructions for pairing Joy-Cons through Windows Bluetooth settings.

Do not require a Nintendo Switch console.

Do not require an internet connection.

## 41.3 Player Assignment

Provide a dedicated controller management screen.

Example:

| Player | Assigned Buzzer |
|---|---|
| Player 1 | Joy-Con (L) |
| Player 2 | Joy-Con (R) |
| Player 3 | Joy-Con (L) |
| Player 4 | Smartphone |
| Player 5 | Keyboard |

Allow the host to:

- Assign a Joy-Con to a player.
- Assign a Joy-Con to a team.
- Remove an assignment.
- Reassign a controller.
- Test a controller.
- Identify which physical controller belongs to which player.

Provide an easy assignment process:

1. Select a player.
2. Click "Assign Controller."
3. Ask the player to press a button on their Joy-Con.
4. Detect the input.
5. Associate that controller with the selected player.
6. Confirm the assignment.

Avoid requiring manual device IDs or configuration files.

## 41.4 Buzzer Button Mapping

Allow configurable Joy-Con button mappings.

Support common face buttons and shoulder buttons where available.

Default to a comfortable, easily accessible button.

The host must be able to change the buzzer button.

Provide a button-testing interface.

Allow optional alternative buttons for accessibility.

Prevent repeated input events from a single held button.

Implement debouncing and edge-triggered input handling.

## 41.5 Buzzer Arbitration

All Joy-Con inputs must use the same authoritative buzzer engine as smartphone and keyboard buzzers.

Requirements:

- First valid buzz wins.
- Server-authoritative ordering.
- Automatic buzzer lockout.
- Configurable early-buzz behavior.
- Configurable buzzer reset.
- Support mixed input devices.
- Prevent duplicate buzz events.
- Prevent held buttons from triggering repeated buzzes.
- Handle simultaneous buzzes deterministically.

Do not implement separate scoring or buzzer-ordering systems for Joy-Cons.

Joy-Con input must feed into the existing centralized buzzer engine.

## 41.6 Feedback

When a Joy-Con successfully buzzes:

- Display the winning player on the public board.
- Display the winning player on the host controller.
- Play the configured buzzer sound.
- Lock out other players according to game rules.

If controller vibration is supported reliably by the selected Windows input implementation, provide optional vibration feedback.

Do not make vibration a requirement for basic functionality.

## 41.7 Controller Management Interface

Create a clean, simple controller-management screen.

Display:

- Connected controllers.
- Controller type.
- Connection status.
- Assigned player.
- Assigned team.
- Configured buzzer button.
- Last detected input.
- Controller test status.

Provide:

- Assign.
- Unassign.
- Test.
- Change button.
- Refresh devices.
- Troubleshooting.

The interface should be usable without technical knowledge.

## 41.8 Offline Operation

Joy-Con buzzing must work without:

- Internet access.
- Nintendo accounts.
- Nintendo Switch Online.
- Cloud services.
- External servers.

Any required input libraries must be installed or packaged with the application.

The finished Windows application must not require the user to install Node.js, Python, or developer tools to use Joy-Cons.

If a third-party driver or companion application is unavoidable, document the limitation clearly and provide the simplest supported setup.

Prefer native or bundled controller support.

## 41.9 Reliability

Handle:

- Multiple simultaneous Joy-Cons.
- Controller disconnections.
- Controller reconnections.
- Bluetooth signal interruptions.
- Duplicate input events.
- Held buttons.
- Rapid repeated button presses.
- Controller reassignment.
- Mixed Joy-Con and smartphone buzzing.

A disconnected Joy-Con must not prevent other players from buzzing.

The host must be able to switch a player to a phone or keyboard buzzer during a game.

## 41.10 Testing

Create automated tests for:

1. Controller registration.
2. Controller assignment.
3. Controller reassignment.
4. Button mapping.
5. Button debouncing.
6. First-buzz arbitration.
7. Simultaneous buzzes.
8. Controller disconnection.
9. Controller reconnection.
10. Mixed-device buzzing.
11. Buzzer lockouts.
12. Host buzzer resets.
13. Game-state synchronization.

Use simulated controller inputs for automated testing.

Perform real Joy-Con hardware validation when compatible controllers are available.

Do not claim physical Joy-Con compatibility has been verified unless actual hardware testing has been performed.

## 41.11 Acceptance Criteria

Joy-Con support is complete when:

- Compatible Joy-Cons can connect to Windows through Bluetooth.
- The application detects individual Joy-Cons.
- Multiple Joy-Cons can be assigned to different players.
- A Joy-Con button can trigger a buzz.
- The first valid buzz is registered correctly.
- Other buzzers lock out.
- The public board displays the winning player.
- The iPad host controller displays the winning player.
- The host can reset buzzers.
- Joy-Cons work alongside smartphone buzzers.
- Joy-Con buzzing works offline.
- Real hardware compatibility has been validated.

This feature must be prioritized during core multiplayer development.

# 42. PERSISTENT PLAYER PROFILES AND PERSONAL DASHBOARDS

## Priority: HIGH — REQUIRED CORE FEATURE

Implement a comprehensive, persistent player profile system.

Every player must be able to create and maintain a personal profile that stores their identity, customization preferences, gameplay statistics, controller assignments, and historical game performance.

Player profiles must integrate with:

- The public game board.
- The iPad host controller.
- Nintendo Joy-Con buzzers.
- Smartphone buzzers.
- Keyboard buzzers.
- Game history.
- Statistics.
- Local multiplayer.
- LAN multiplayer.

Profiles must persist between application restarts and game sessions.

The entire system must function without internet access.

## 42.1 Profile Creation

Players must be able to create profiles through:

1. The Windows desktop application.
2. The host controller.
3. Their smartphone browser.
4. Their tablet browser.
5. A QR code displayed on the public game board.

Profile creation must be simple and intuitive.

Required fields:

- Player name.
- Unique profile identifier.
- Profile picture or avatar.
- Player color.

Optional fields:

- Display nickname.
- Preferred buzzer.
- Preferred Joy-Con button.
- Preferred team.
- Personalization settings.

Do not require an email address, cloud account, or subscription.

## 42.2 QR Code Profile Access

The public game board must support displaying a QR code that opens the local player portal.

The QR code should direct players to a local network address.

Example:

http://192.168.1.100:3000/players

This address is illustrative.

The application must automatically generate the correct address for the active local server.

When a player scans the QR code:

1. Their phone opens the local player portal.
2. They can create a profile or sign in.
3. They can view their dashboard.
4. They can edit their profile.
5. They can join the current game.
6. They can access their permitted statistics and history.

The QR code must not grant access to another player's private profile.

The public board must allow the host to show or hide the QR code.

Provide a dedicated pre-game joining screen with a large QR code.

## 42.3 Profile Authentication

Implement a lightweight offline authentication system.

Requirements:

- No cloud authentication.
- No email requirement.
- No external identity provider.
- No internet requirement.
- Persistent browser sessions.
- Secure local session management.
- Optional player PIN.
- Profile recovery through host authorization.

Players must not be able to edit another player's profile merely by selecting their name.

Use a secure pairing or authentication process.

A public QR code should grant access to the player portal, not ownership of an existing profile.

The host must be able to recover or reassign profiles when necessary.

## 42.4 Profile Customization

Players must be able to customize:

- Display name.
- Nickname.
- Profile picture.
- Avatar.
- Player color.
- Preferred buzzer.
- Preferred Joy-Con button.
- Optional profile background.
- Optional profile accent color.

Changes must be saved persistently.

Provide sensible defaults.

## 42.5 Profile Picture Uploading

Support uploading profile pictures from:

- Windows computers.
- iPhones.
- Android phones.
- iPads.
- Other compatible devices.

Players must be able to select an existing image from their device.

Supported formats should include:

- JPEG.
- PNG.
- WebP.

Additional formats may be supported when practical.

Implement:

- Image preview.
- Image cropping.
- Image resizing.
- Image validation.
- File-size limits.
- Safe image processing.
- Profile picture replacement.
- Profile picture removal.

Store uploaded images locally on the Windows host computer.

Generate appropriately sized images for scoreboards and player dashboards.

Do not require external image-hosting services.

## 42.6 Built-In Avatar System

Provide a selection of built-in avatars.

Allow players to:

- Select a preset avatar.
- Upload a custom picture.
- Return to a default avatar.
- Change avatars at any time.

Use original or appropriately licensed avatar assets.

Do not copy protected third-party character artwork.

## 42.7 Player Color Customization

Allow each player to select a custom color.

Provide:

- Preset color palette.
- Optional custom color picker.
- Color preview.
- Contrast validation.
- Accessible default colors.

Player colors should appear consistently in:

- Public scoreboards.
- Host controller.
- Player dashboards.
- Buzzer indicators.
- Game results.
- Statistics.
- Relevant animations.

Ensure text remains readable regardless of the selected color.

## 42.8 Real-Time Profile Synchronization

When a player saves profile changes, the application must immediately synchronize the changes across all connected interfaces.

Example:

A player changes their name from Alex to AlexTheWizard.

Expected behavior:

1. Player saves the change.
2. Server validates the update.
3. Server writes the change to the local database.
4. Server broadcasts a profile update.
5. Public scoreboard displays the new name.
6. Host controller displays the new name.
7. Player dashboard displays the new name.
8. Future games use the updated name.

The same behavior must apply to:

- Profile pictures.
- Avatars.
- Player colors.
- Display names.
- Nicknames.

Do not require restarting the game or refreshing the public board.

## 42.9 Persistent Player Identity

Each player must have a stable, unique profile ID.

Do not identify players solely by their display names.

Profile IDs must remain stable when players:

- Change names.
- Change pictures.
- Change colors.
- Change controllers.
- Join different games.
- Disconnect.
- Reconnect.

All statistics and game history must reference the stable profile ID.

Changing a player's display name must not erase or disconnect their historical statistics.

## 42.10 Joy-Con Profile Assignment

Integrate player profiles with Nintendo Joy-Con controllers.

The host must be able to assign a connected Joy-Con directly to a player profile.

Example:

Profile: AlexTheWizard

Controller: Joy-Con (L)

Buzzer Button: SL

When the assigned controller buzzes:

1. Identify the physical controller.
2. Resolve its current profile assignment.
3. Submit the buzz through the centralized buzzer engine.
4. Record the resulting event against the player's profile ID.
5. Display the player's current name and picture.
6. Update statistics as appropriate.

Do not attach statistics permanently to a controller.

Controllers are input devices.

Profiles represent player identities.

A player must be able to switch between Joy-Con, smartphone, and keyboard buzzing without losing statistics.

## 42.11 Controller Preferences

Store preferred controller settings in the player profile.

Examples:

- Preferred input method.
- Preferred Joy-Con side.
- Preferred buzzer button.
- Preferred keyboard shortcut.

When a player joins a game, attempt to restore compatible preferences.

Do not automatically assign a controller to the wrong player.

Use an explicit confirmation or controller-identification process when device identity is uncertain.

## 42.12 Personal Statistics Dashboard

Every profile must have a personal statistics dashboard.

Track:

- Total games played.
- Total games won.
- Total games lost.
- Win percentage.
- Total points earned.
- Average final score.
- Highest score.
- Lowest score.
- Correct answers.
- Incorrect answers.
- Correct-answer percentage.
- Total buzzer attempts.
- Successful buzzer attempts.
- Average buzzer response time.
- Daily Wagers attempted.
- Daily Wagers won.
- Daily Wagers lost.
- Final Wagers attempted.
- Final Wagers won.
- Final Wagers lost.
- Team games played.
- Team games won.
- Favorite categories.
- Strongest categories.
- Weakest categories.

Clearly define how each statistic is calculated.

Statistics must be derived from authoritative gameplay events.

Do not count a buzzer press as a correct answer.

Do not count a correct answer unless it was adjudicated correctly.

## 42.13 Detailed Game History

Every player must be able to view previous games associated with their profile.

Display:

- Game title.
- Date played.
- Game duration.
- Participating players.
- Participating teams.
- Final scores.
- Winning player or team.
- Player placement.
- Player's final score.
- Categories included.
- Number of clues answered.
- Correct answers.
- Incorrect answers.
- Wager results.

Allow players to open an individual historical game for additional details.

## 42.14 Historical Game Detail View

For each completed game, store and display:

- Game title.
- Game date.
- Board used.
- Categories.
- Clue values.
- Clue questions.
- Correct answers.
- Player buzz-in events.
- Winning buzzer for each clue.
- Player answer outcomes.
- Points gained.
- Points lost.
- Wager amounts.
- Wager results.
- Final scores.
- Game winner.

Provide a chronological event history.

Players should be able to see which clues they buzzed into and whether their answers were correct.

Example:

Category: History

Clue Value: 400

Question: Which ancient civilization built Machu Picchu?

Player: AlexTheWizard

Buzz Result: First

Answer Result: Correct

Points Earned: +400

Store a historical snapshot of the question and category so that editing the original board later does not change past game records.

## 42.15 Category Performance

Track performance by category.

Examples:

History:
- 28 correct.
- 9 incorrect.
- 75.7% accuracy.

Science:
- 15 correct.
- 12 incorrect.
- 55.6% accuracy.

Sports:
- 22 correct.
- 4 incorrect.
- 84.6% accuracy.

Provide:

- Category accuracy.
- Points earned per category.
- Total attempts.
- Correct answers.
- Incorrect answers.
- Historical performance trends.

Support category normalization or aliases when appropriate.

Do not incorrectly combine unrelated categories merely because they have similar names.

## 42.16 Player Comparison

Allow players to compare statistics.

Possible comparisons:

- Games won.
- Average scores.
- Correct-answer percentages.
- Buzzer performance.
- Category strengths.
- Head-to-head results.

Provide local leaderboards.

Allow the host to enable or disable public statistics displays.

## 42.17 Profile Dashboard Interface

Create a clean, mobile-friendly dashboard.

Suggested sections:

### Overview
- Profile picture.
- Player name.
- Player color.
- Games played.
- Games won.
- Average score.
- Answer accuracy.

### Statistics
- Lifetime statistics.
- Category performance.
- Buzzer statistics.
- Wager statistics.

### Game History
- Recent games.
- Historical game details.
- Results.
- Individual clue performance.

### Customization
- Change name.
- Change picture.
- Change avatar.
- Change color.
- Buzzer preferences.

### Current Game
- Join active game.
- View assigned controller.
- View player status.
- Open smartphone buzzer when enabled.

The dashboard must be easy to use on smartphones.

## 42.18 Host Profile Management

The iPad host controller must include player profile management.

The host must be able to:

- View registered profiles.
- Add profiles.
- Assign profiles to games.
- Remove players from active games.
- Assign Joy-Cons to profiles.
- Change player teams.
- View player connection status.
- View player statistics.
- Resolve duplicate profile names.
- Assist with profile recovery.
- Correct incorrectly attributed game events through audited administrative actions.

Host actions must be authorized.

Do not allow arbitrary players to modify other profiles.

## 42.19 Game Joining

When a player scans the public QR code:

1. Open the local player portal.
2. Authenticate or create a profile.
3. Display the current available game.
4. Allow the player to join.
5. Notify the host.
6. Associate the player's profile with the game session.
7. Update the public lobby.
8. Display the player's current name, avatar, and color.

The host may configure whether joining requires approval.

## 42.20 Offline Data Storage

Store all profile data locally.

Use SQLite for structured data.

Store uploaded images in a managed local media directory.

Maintain relationships between:

- Profiles.
- Game sessions.
- Game participants.
- Controller assignments.
- Buzz events.
- Answer events.
- Score events.
- Wager events.
- Historical clue snapshots.

Use database migrations.

Maintain referential integrity.

Support backup and restore.

## 42.21 Privacy and Security

Implement:

- Profile authentication.
- Secure session tokens.
- Role-based permissions.
- Host-only administrative actions.
- Image validation.
- Upload size limits.
- File type validation.
- Path traversal protection.
- Secure image storage.
- Rate limiting where appropriate.
- Profile deletion.
- Optional statistics privacy settings.

Do not expose private profile data to unauthenticated users.

A QR code displayed publicly must not function as a permanent profile authentication credential.

## 42.22 Data Portability

Support:

- Profile exporting.
- Profile importing.
- Profile backup.
- Profile restoration.
- Game history exporting.
- Statistics exporting.

Use portable formats such as JSON where appropriate.

Allow users to migrate profiles to another OfflineJeopardy installation.

Do not require cloud synchronization.

## 42.23 Testing

Create automated tests for:

1. Profile creation.
2. Profile authentication.
3. Profile editing.
4. Profile deletion.
5. Profile picture uploading.
6. Avatar selection.
7. Player color selection.
8. Real-time profile updates.
9. Public scoreboard synchronization.
10. Host controller synchronization.
11. Joy-Con profile assignment.
12. Controller reassignment.
13. Stable profile identity.
14. Game history recording.
15. Category statistics.
16. Correct-answer statistics.
17. Incorrect-answer statistics.
18. Wager statistics.
19. Profile reconnection.
20. Game-session reconnection.
21. Profile backup and restore.
22. Unauthorized profile modification prevention.
23. Historical question preservation.
24. Offline functionality.

Use automated browser testing for mobile profile interfaces.

## 42.24 Acceptance Criteria

This feature is complete only when:

- Players can create persistent profiles.
- Players can access profiles from smartphones.
- A public QR code opens the player portal.
- Existing profiles require appropriate authentication.
- Players can change names.
- Players can upload profile pictures.
- Players can select avatars.
- Players can customize colors.
- Changes appear on the public board immediately.
- Changes appear on the host controller immediately.
- Joy-Cons can be assigned to profiles.
- Statistics follow profiles rather than controllers.
- Game results persist after restarting the application.
- Players can view historical games.
- Players can view categories from historical games.
- Players can view clues they buzzed into.
- Players can view correct and incorrect results.
- Players can view their statistics.
- All essential functionality works offline.

This is a mandatory high-priority feature.

Design the database and game-state architecture around persistent player identities from the beginning.

# 43. PROFILE PIN AUTHENTICATION AND ADVANCED TEAM GAMEPLAY

## Priority: HIGH — REQUIRED CORE FEATURE

Implement four-digit player profile PINs and an advanced team gameplay system that supports individual player statistics, team statistics, and independently configurable buzzer modes for each team.

These features must integrate with:

- Persistent player profiles.
- Nintendo Joy-Con controllers.
- Smartphone buzzers.
- Keyboard buzzers.
- The iPad host controller.
- The public television game board.
- Game history.
- Statistics.
- Local multiplayer.
- LAN multiplayer.

All functionality must work without internet access.

---

## 43.1 Single Public QR Code

The public game board must display one primary QR code for player access.

Scanning the QR code opens the local player portal.

The portal must allow users to:

1. Select an existing player profile.
2. Enter the selected profile's four-digit PIN.
3. Create a new player profile.
4. Choose a four-digit PIN when creating a profile.
5. Access their personal dashboard.
6. Edit their profile.
7. View statistics.
8. View game history.
9. Join the current game.

Do not require separate QR codes for individual profiles.

Do not require a separate QR code for team membership.

The host may show or hide the public QR code.

The QR code must not contain profile authentication credentials.

---

## 43.2 Four-Digit Profile PINs

Every player profile must have a four-digit numeric PIN.

PINs must be created during profile registration.

Requirements:

- Exactly four digits.
- Leading zeros are valid.
- PIN confirmation during creation.
- PIN entry when accessing an existing profile.
- Ability to change PIN after authentication.
- Host-assisted PIN reset.
- No email requirement.
- No cloud authentication.
- No internet requirement.

Never display existing PINs.

Never store PINs in plaintext.

Use an appropriate salted password-hashing algorithm such as Argon2id.

Implement failed-attempt rate limiting and temporary lockouts.

Use secure browser session management.

A four-digit PIN is intended for convenient access control on a trusted local network, not high-security authentication.

---

## 43.3 Profile Sessions

After successful PIN authentication:

- Create a secure browser session.
- Allow the player to access their dashboard.
- Allow the player to edit their own profile.
- Allow the player to join the active game.
- Preserve the session across ordinary page refreshes.
- Provide a logout option.
- Provide an option to forget the device.

Do not allow one player to modify another player's profile.

The host must have separately authenticated administrative privileges.

---

## 43.4 Team Creation

During game setup, the host must be able to enable Team Mode.

The host must be able to:

1. Create teams.
2. Name teams.
3. Choose team colors.
4. Choose team avatars or logos.
5. Assign player profiles to teams.
6. Remove player profiles from teams.
7. Move players between teams.
8. Configure each team's buzzer mode.
9. Assign controllers.
10. Preview the team configuration.

Support two or more profiles per team.

Do not hardcode a maximum team size of two.

Allow team sizes to be configured.

A player profile may belong to only one competing team within a single game session unless a custom game mode explicitly allows otherwise.

---

## 43.5 Per-Team Buzzer Configuration

Each team must have its own independent buzzer configuration.

Do not use a single global team buzzer mode.

Support at least two modes.

### Mode A — Individual Buzzers

Every team member may have their own buzzer.

Example:

Team: The Wizards

Members:
- Alex
- Jordan

Buzzers:
- Alex: Joy-Con (L)
- Jordan: Joy-Con (R)

When Alex buzzes:

1. Identify Alex's controller.
2. Resolve Alex's player profile.
3. Identify Alex's team.
4. Register a buzz for The Wizards.
5. Record Alex as the individual who buzzed.
6. Lock out competing teams according to game rules.
7. Display The Wizards as the winning team.
8. Display Alex as the buzzing player when appropriate.

Both individual and team statistics must be updated from the authoritative gameplay event.

### Mode B — Shared Team Buzzer

A team uses one shared buzzer.

Example:

Team: The Dragons

Members:
- Taylor
- Sam

Shared buzzer:
- Joy-Con (L)

When the shared buzzer is pressed:

1. Identify the assigned team.
2. Register a team buzz.
3. Lock out competing teams according to game rules.
4. Display the winning team.
5. Allow the host to identify the answering player when necessary.

Do not automatically attribute the buzz or answer to an arbitrary team member.

### Mixed Configuration

Different teams in the same game must be allowed to use different modes.

Example:

- Team A: Individual Buzzers.
- Team B: Shared Team Buzzer.
- Team C: Individual Buzzers.
- Team D: Shared Team Buzzer.

Changing Team A's configuration must not alter Team B's configuration.

---

## 43.6 Supported Buzzer Devices

Each individual or shared team buzzer may use:

- Nintendo Switch Joy-Con.
- Smartphone buzzer.
- Keyboard buzzer.
- Other supported controller input.

Allow mixed input devices within the same team.

Example:

Team: The Knights

Members:
- Chris: Joy-Con (R)
- Morgan: Smartphone

Both devices must feed into the same centralized buzzer engine.

---

## 43.7 Team Buzzer Arbitration

The centralized buzzer engine must support team-aware arbitration.

When one member of a team buzzes successfully:

- That team becomes the active responding team.
- Other members of that team cannot create duplicate winning buzzes.
- Competing teams are locked out according to the configured rules.
- The winning individual is recorded when identifiable.

Provide configurable rules for:

- Reopening buzzers after an incorrect answer.
- Preventing the same team from buzzing again on the same clue.
- Allowing another member of the same team to attempt an answer.
- Early buzzing penalties.
- Buzzer resets.

Default to one successful buzz opportunity per team per clue unless the host selects a different rule preset.

Use server-authoritative ordering for all buzzer inputs.

---

## 43.8 Individual Statistics During Team Games

Track individual performance separately from team performance.

For every player profile, record:

- Team games played.
- Team games won.
- Team games lost.
- Individual buzzer attempts.
- Successful individual buzzes.
- Questions answered.
- Correct answers.
- Incorrect answers.
- Points personally earned.
- Points personally lost.
- Contribution to team score.
- Category performance.
- Wager participation when attributable.

Do not automatically credit every team member with every correct answer.

Distinguish individual contributions from team outcomes.

---

## 43.9 Shared Buzzer Attribution

When a team uses a shared buzzer, the system must not assume which member physically pressed it.

The host controller must provide a simple attribution interface.

Example:

Team: The Dragons

Who answered?

- Taylor
- Sam
- Team Only / Unknown

The host may select the answering player before recording the answer result.

If no individual is selected:

- Record the event against the team.
- Update team statistics.
- Do not fabricate individual answer statistics.

Allow the host to correct attribution through an audited action.

---

## 43.10 Separate Solo and Team Statistics

Every player profile must distinguish between:

### Solo Statistics

- Solo games played.
- Solo games won.
- Solo games lost.
- Solo average score.
- Solo correct answers.
- Solo incorrect answers.
- Solo answer accuracy.
- Solo category performance.
- Solo buzzer statistics.

### Team Statistics

- Team games played.
- Team games won.
- Team games lost.
- Team win percentage.
- Individual contributions during team games.
- Correct answers personally given.
- Incorrect answers personally given.
- Successful individual buzzes.
- Team category performance.
- Team game history.

### Combined Statistics

Provide an optional combined overview.

Do not merge solo and team scoring in a way that produces misleading averages.

Clearly label each statistic.

---

## 43.11 Persistent Team Statistics

Track statistics for teams as well as individual profiles.

Support:

- Team games played.
- Team wins.
- Team losses.
- Team average score.
- Team highest score.
- Team correct answers.
- Team incorrect answers.
- Team category performance.
- Team buzzer performance.
- Team wagering performance.
- Team game history.

Allow teams to be saved and reused across multiple games.

Use stable team identifiers.

Changing a team name must not erase historical records.

Preserve historical team membership for each game.

---

## 43.12 Team Game History

For completed team games, store:

- Game title.
- Date played.
- Participating teams.
- Team membership at the time.
- Team buzzer configuration.
- Final team scores.
- Winning team.
- Categories.
- Clues.
- Individual buzz events.
- Shared buzzer events.
- Individual answer outcomes.
- Team answer outcomes.
- Points earned.
- Points lost.
- Wager results.

Historical records must remain accurate even if players later change teams.

---

## 43.13 Host Controller Integration

The iPad host controller must support team gameplay.

During setup, the host can:

- Create teams.
- Assign profiles.
- Select each team's buzzer mode.
- Assign Joy-Cons.
- Assign phone buzzers.
- Test all buzzers.

During gameplay, the host can:

- See which team buzzed.
- See which player buzzed when identifiable.
- Identify the answering player.
- Mark answers correct.
- Mark answers incorrect.
- Award or deduct team points.
- Correct individual attribution.
- View team scores.
- View individual contributions.
- Reset buzzers.

The host interface must remain clean and touch-friendly.

Do not overcrowd the interface with advanced statistics during ordinary gameplay.

---

## 43.14 Public Board Integration

During team games, the public board should display:

- Team names.
- Team colors.
- Team scores.
- Team avatars or logos.
- Winning team when buzzing.
- Winning player when identifiable.
- Relevant animations.

Provide an optional expanded scoreboard showing team members.

Do not expose private profile information.

---

## 43.15 Database Requirements

Design database relationships for:

- Player profiles.
- Teams.
- Team memberships.
- Game sessions.
- Game participants.
- Historical team membership.
- Controller assignments.
- Buzzer events.
- Answer events.
- Score events.
- Wager events.
- Statistics.

Use stable identifiers.

Store historical team membership as part of the game record.

Do not derive historical membership solely from a team's current roster.

Use database migrations.

---

## 43.16 Testing

Create automated tests for:

1. Four-digit PIN creation.
2. PIN authentication.
3. PIN changes.
4. Incorrect PIN handling.
5. Rate limiting.
6. Profile session persistence.
7. Unauthorized profile access prevention.
8. Team creation.
9. Team member assignment.
10. Per-team buzzer configuration.
11. Individual team buzzers.
12. Shared team buzzers.
13. Mixed team buzzer modes.
14. Mixed Joy-Con and smartphone buzzing.
15. Team-aware buzzer arbitration.
16. Individual answer attribution.
17. Shared buzzer attribution.
18. Team scoring.
19. Individual contribution tracking.
20. Solo statistics.
21. Team statistics.
22. Historical team membership.
23. Team game history.
24. Profile synchronization.
25. Offline operation.

---

## 43.17 Acceptance Criteria

This feature is complete only when:

- Players can create profiles with four-digit PINs.
- Existing profiles require PIN authentication.
- The public QR code opens one player portal.
- Players can create or select profiles.
- Players can join games using authenticated profiles.
- The host can create teams.
- The host can assign multiple profiles to a team.
- Every team can independently select its buzzer mode.
- Individual team members can have separate Joy-Cons.
- Other teams can use one shared buzzer.
- Different buzzer modes work in the same game.
- Team scores update correctly.
- Individual contributions are recorded accurately.
- Solo and team statistics are separated.
- Team statistics are preserved.
- Historical team membership is preserved.
- Game history identifies individual and team outcomes.
- All functionality works offline.

This is a mandatory core feature.

The database, game engine, profile system, and buzzer architecture must support these requirements from the beginning.

# 44. INDIVIDUAL CONTRIBUTIONS AND TEAM SCORING

## Priority: HIGH — REQUIRED CORE FEATURE

Implement individual contribution tracking during team games without splitting, duplicating, or inflating team scores.

The system must distinguish between:

1. Player profiles — persistent individual identities.
2. Teams — groups of player profiles competing together.
3. Controllers — interchangeable input devices assigned to players or teams.

These concepts must remain separate throughout the application architecture.

## 44.1 Team Scoring

During team gameplay, points earned or lost must affect the team's score.

Example:

Team: The Wizards

Members:
- Alex
- Jordan

Clue Value: 600

Alex buzzes and answers correctly.

Expected result:

- The Wizards receive +600 points.
- Alex receives credit for one correct answer.
- Alex receives +600 individual contribution points.
- Jordan receives no individual answer credit.
- The team's score increases by exactly 600 points.

Do not award 600 additional game points to Alex separately.

Individual contribution points are statistical records, not independent game scores.

## 44.2 Incorrect Answers

Example:

Alex answers a 400-point clue incorrectly.

Expected result:

- The Wizards lose 400 points.
- Alex receives one incorrect answer.
- Alex's individual contribution decreases by 400 points.
- Jordan's individual contribution remains unchanged.

The team's score decreases by exactly 400 points.

## 44.3 Shared Team Buzzers

When a team uses one shared buzzer, the system may not know which member answered.

The iPad host controller must allow the host to select:

- A specific team member.
- Team Only / Unknown.

If a specific member is selected, record the answer outcome against that profile.

If Team Only / Unknown is selected:

- Update the team score.
- Update team-level statistics.
- Record the event as unattributed.
- Do not assign individual contribution points.
- Do not invent individual answer statistics.

Allow authorized corrections to attribution after the event.

## 44.4 Separate Statistics

Track the following independently.

### Solo Statistics

- Solo games played.
- Solo games won.
- Solo correct answers.
- Solo incorrect answers.
- Solo points earned.
- Solo points lost.
- Solo average score.
- Solo category performance.

### Individual Team Contributions

- Team games played.
- Team games won.
- Correct answers personally given.
- Incorrect answers personally given.
- Successful individual buzzes.
- Individual contribution points earned.
- Individual contribution points lost.
- Net individual contribution.
- Category performance during team games.

### Team Statistics

- Team games played.
- Team games won.
- Team games lost.
- Team correct answers.
- Team incorrect answers.
- Team points earned.
- Team points lost.
- Team average score.
- Team category performance.
- Team wagering performance.

Do not combine these statistics in ways that produce misleading results.

## 44.5 Team Wagers

Daily Wagers and Final Wagers must affect the team score.

By default, wager results are recorded as team-level events.

The host may optionally attribute a wager result to a specific team member for statistical purposes.

Do not divide wager points automatically among team members.

Do not award additional game points when individual attribution is recorded.

## 44.6 Stable Identity Relationships

All game records must reference stable identifiers.

Use:

- PlayerProfileID
- TeamID
- GameSessionID
- ControllerID
- GameplayEventID

A controller must never serve as a permanent player identity.

Changing a controller must not affect player statistics.

Changing a player name must not affect historical records.

Changing team membership must not rewrite previous game results.

## 44.7 Auditable Event Records

Every scoring event must record:

- Game session.
- Clue.
- Team.
- Individual player, when identifiable.
- Controller input source, when applicable.
- Answer result.
- Score change.
- Individual contribution change.
- Timestamp.
- Host correction history.

Use authoritative event records to calculate statistics.

Prevent double-counting.

## 44.8 Acceptance Criteria

This feature is complete when:

- Team scores are calculated correctly.
- Individual contributions are recorded separately.
- Team points are never duplicated.
- Incorrect answers affect the correct team and player statistics.
- Shared-buzzer answers can be attributed by the host.
- Unattributed answers remain team-only.
- Wagers affect team scores without duplicating points.
- Solo and team statistics remain separate.
- Player history remains accurate after controller changes.
- Team history remains accurate after membership changes.
- Automated tests verify all scoring and attribution behavior.

This is a mandatory feature and must be included in the core gameplay architecture.
**PRIMARY DIRECTIVE: Build the complete application independently, use REA selectively, coordinate specialized development agents, test real functionality, and minimize unnecessary user involvement.**
---

# 43. USER FEEDBACK REQUIREMENTS — ROUND 1 (added 2026-10-12)

These requirements were added by the user after the first playable release. They are
binding project requirements with the same weight as the sections above. Full details,
acceptance criteria and audit findings: **USER_FEEDBACK.md** (IDs FB-x.y). Tracking:
FEATURE_MATRIX.md → "User feedback round 1".

Must keep working (user-confirmed): Joy-Cons, Bluetooth controller connectivity, iPad host
controller, existing profiles / saved games / DB records / controller assignments, LAN play.

1. **Mobile & tablet (P1)** — no top clipping on iPhone/iPad (safe areas, `dvh`, dialogs that
   fit the visible viewport); smooth, non-jittery UI (no focus stealing, GPU-friendly animation,
   minimal re-renders); consistent navigation everywhere (back arrow, hamburger drawer, page
   titles, working browser Back, current page indicated).
2. **Player stats on phones (P2)** — leaderboard (solo / team / contribution views kept separate,
   clear ranking criteria); other players' permitted public profiles and statistics (never PINs
   or private data); personal game history with a detailed per-game page built from historical
   snapshots; drawer links: My Profile, My Statistics, Leaderboard, Players, Game History,
   Current Game, Settings.
3. **Early buzz-in penalties (P3)** — configurable before and during a game (no penalty, short
   lockout, lockout for the rest of the clue, point deduction), effective from the next buzz,
   never retroactive; server-side detection consistent for Joy-Cons, phones and keyboards,
   including shared and individual team buzzers; feedback on host, TV and phone.
4. **Classic game-show presentation (P4, public board only)** — classic blue board with gold
   values and bold category headings; selected clue zooms from its tile to full screen (FLIP,
   transform/opacity, reduced-motion aware) and back; full-screen question shows **no category
   and no value**; subtle buzzers-open indicator; per-round category introduction (round title,
   categories slide in one at a time; host start/next/skip/replay, optional auto-advance).
5. **Unanswered clues (P5)** — when nobody answers, the host is guided to **Reveal answer**, then
   **Return to board**; skip is secondary; the engine distinguishes answering-ended, revealed and
   completed; no accidental double completion.
6. **Presentation polish (P6)** — consistent, deliberate transitions for board, clue open/close,
   reveals, score updates, buzzer indicators, rounds, Final Wager and winner announcement.
