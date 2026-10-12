# OfflineJeopardy — Claude Code Development Instructions

## 1. PROJECT MISSION

Build OfflineJeopardy, a polished, fully offline, customizable Jeopardy-style game for Windows.

The application must provide a clean, simple, intuitive user experience while supporting advanced game-hosting features.

The primary intended setup is:

- Windows PC running OfflineJeopardy.
- Public game board displayed on a television or projector.
- iPad running the host controller through Safari.
- Players using Nintendo Switch Joy-Cons, smartphones, or keyboards as buzzers.
- All devices communicating through a local network without internet access.
- Persistent player profiles, team gameplay, and detailed statistics.

The final application must be a functional Windows desktop application, not a prototype.

Read `PROJECT_SPEC.md` for the complete feature requirements.

## 2. PRIMARY DIRECTIVES

1. Build the complete application incrementally.
2. Prioritize working functionality over mockups.
3. Make ordinary engineering decisions independently.
4. Minimize unnecessary user questions.
5. Maintain clean, modular architecture.
6. Test implemented functionality.
7. Fix recoverable errors.
8. Maintain persistent progress documentation.
9. Use Git for version control.
10. Preserve resumable progress across sessions.
11. Never claim untested functionality is complete.
12. Never bypass required permissions or security controls.

Do not stop development after creating a basic game board.

Continue toward the complete requirements in `PROJECT_SPEC.md` within the available session and authorized resources.

## 3. REQUIRED READING

At the beginning of each development session, read:

1. `CLAUDE.md`
2. `PROJECT_SPEC.md`
3. `ARCHITECTURE.md`, if present.
4. `IMPLEMENTATION_PLAN.md`, if present.
5. `FEATURE_MATRIX.md`, if present.
6. `PROGRESS.md`, if present.
7. `DECISIONS.md`, if present.
8. `KNOWN_ISSUES.md`, if present.

Inspect Git status and the existing codebase before making changes.

Do not overwrite working implementations without understanding them.

## 4. REQUIRED DEVELOPMENT DOCUMENTATION

Maintain:

- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `FEATURE_MATRIX.md`
- `PROGRESS.md`
- `DECISIONS.md`
- `KNOWN_ISSUES.md`
- `RESEARCH_NOTES.md`

Documentation must accurately reflect the current implementation.

### FEATURE_MATRIX.md

Track each requirement with:

- Feature ID.
- Description.
- Priority.
- Implementation status.
- Source files.
- Tests.
- Known limitations.

Use these statuses:

- NOT STARTED
- IN PROGRESS
- IMPLEMENTED
- TESTED
- BLOCKED

Do not mark features TESTED unless relevant tests have passed.

### PROGRESS.md

Record:

- Completed milestones.
- Current milestone.
- Recently changed files.
- Passing tests.
- Failing tests.
- Known blockers.
- Next recommended tasks.
- Git commit reference when available.

Update this file before ending a development session.

## 5. SPECIALIZED DEVELOPMENT AGENTS

Configure and use six specialized Claude Code subagents.

### Research Agent

Responsibilities:

- Research suitable implementation approaches.
- Investigate unfamiliar APIs and libraries.
- Evaluate Windows controller support.
- Investigate uncertain reference behaviors.
- Use REA selectively.
- Document findings.

### Backend Agent

Responsibilities:

- Node.js backend.
- Local server.
- WebSockets.
- SQLite.
- Database migrations.
- Profile authentication.
- Persistent game state.
- Statistics and event recording.
- Security.

### Frontend Agent

Responsibilities:

- React interfaces.
- Clean UI design.
- Board editor.
- Public game board.
- iPad host controller.
- Smartphone player portal.
- Profile dashboards.
- Theme system.
- Responsive layouts.

### Gameplay Agent

Responsibilities:

- Game-state engine.
- Scoring.
- Wagering.
- Timers.
- Buzzers.
- Team rules.
- Individual contribution tracking.
- Game modes.
- Gameplay event records.

### QA Agent

Responsibilities:

- Unit tests.
- Integration tests.
- End-to-end tests.
- Regression tests.
- Multiplayer synchronization tests.
- Offline testing.
- Controller input simulation.
- Packaging verification.

### Integration Agent

Responsibilities:

- Electron integration.
- Windows packaging.
- Dependency management.
- Shared interfaces.
- Agent code integration.
- Build configuration.
- Release validation.

Use agents when beneficial.

Define interfaces before parallel implementation.

Avoid concurrent modification of the same files.

Use isolated Git worktrees or branches for parallel work where practical.

## 6. REA POLICY

REA refers to morluto/rea, Reverse Engineer Anything.

Use REA selectively.

Do not reverse engineer ordinary application functionality such as:

- Board creation.
- Scoring.
- Timers.
- Themes.
- CSV importing.
- Profile creation.
- Team management.
- Statistics.
- Standard WebSocket synchronization.

Use REA only when an uncertain reference behavior justifies investigation.

Examples:

- Unusual buzzer arbitration.
- Complex host synchronization.
- Non-obvious game-state transitions.
- Specialized reference interactions.

Do not copy proprietary source code, artwork, branding, or protected assets.

Do not bypass authentication or access controls.

Implement the application independently.

Document research findings in `RESEARCH_NOTES.md`.

## 7. PREFERRED TECHNOLOGY STACK

Use:

### Frontend
- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Zustand.
- Framer Motion or an appropriate equivalent.

### Backend
- Node.js.
- TypeScript.
- Fastify or Express.
- WebSockets.
- SQLite.

### Desktop
- Electron.
- Windows installer packaging.
- Portable Windows packaging where practical.

### Testing
- Vitest.
- React Testing Library.
- Playwright.
- Backend integration tests.

Prefer established, maintained libraries.

Document significant technology changes.

Install project dependencies when authorized.

Do not introduce mandatory cloud services.

## 8. CRITICAL HOSTING ARCHITECTURE

The primary intended use is:

- Windows PC displaying the public board on a TV.
- iPad controlling the game through Safari.
- Players buzzing through Joy-Cons or phones.

The Windows application must automatically start a local server.

The server must provide separate interfaces for:

1. Public game board.
2. Host controller.
3. Player portal and buzzers.

Use server-authoritative game state.

Synchronize interfaces through WebSockets.

Do not build a single-screen application and attempt to retrofit remote host controls later.

Implement public board and host controller synchronization during the earliest playable milestone.

## 9. PUBLIC GAME BOARD

The public board must:

- Display categories and clue values.
- Display selected clues.
- Display timers.
- Display player and team scores.
- Display buzzer results.
- Display wager transitions.
- Display winner announcements.
- Support fullscreen presentation.
- Support television and projector displays.
- Show a public player-portal QR code when requested.

Do not expose private answers before reveal.

Do not expose host-only controls.

## 10. iPAD HOST CONTROLLER

The host controller must work through Safari on an iPad.

No iPad application installation should be required.

The host must be able to:

- Select categories and clues.
- Open clues on the public board.
- View correct answers privately.
- Reveal answers publicly.
- Unlock buzzers.
- Lock buzzers.
- Reset buzzers.
- Start timers.
- Pause timers.
- Reset timers.
- Mark answers correct.
- Mark answers incorrect.
- Award points.
- Deduct points.
- Undo actions.
- Manage players.
- Manage teams.
- Assign controllers.
- Control wagers.
- Save games.
- Resume games.
- End games.

The interface must be touch-friendly and optimized for tablets.

Use large buttons and contextual controls.

The host must be able to reconnect to an active game without restarting it.

Implement appropriate host authentication.

## 11. OFFLINE LAN NETWORKING

The Windows PC acts as the local server.

Support:

- Home Wi-Fi networks.
- Ethernet networks.
- LAN-connected browsers.
- QR-code joining.
- Player reconnection.
- Host reconnection.
- Real-time state synchronization.

No internet connection is required for core gameplay.

Display the local connection address and QR code.

Provide understandable firewall and connection troubleshooting.

Do not assume every local network allows device-to-device communication.

## 12. NINTENDO JOY-CON SUPPORT

Nintendo Switch Joy-Con support is mandatory.

Support independently paired compatible Joy-Con controllers through Windows Bluetooth.

Requirements:

- Multiple Joy-Cons.
- Left Joy-Cons.
- Right Joy-Cons.
- Controller detection.
- Controller assignment.
- Button mapping.
- Controller testing.
- Disconnection handling.
- Reconnection handling.
- Mixed-device buzzing.

Prefer established Windows-compatible input APIs and libraries.

Investigate HID or other appropriate mechanisms.

Do not assume Joy-Cons behave like standard Xbox controllers.

Do not require external controller-mapping software unless direct integration proves impractical.

Joy-Con inputs must feed into the centralized buzzer engine.

Use simulated input for automated testing.

Do not claim physical compatibility is verified without real hardware testing.

## 13. UNIFIED BUZZER ENGINE

All buzzers must use one authoritative engine.

Supported sources:

- Joy-Cons.
- Smartphones.
- Keyboards.
- Other compatible controllers.

The engine must handle:

- First valid buzz.
- Simultaneous buzzes.
- Duplicate prevention.
- Button debouncing.
- Held buttons.
- Buzzer lockouts.
- Buzzer resets.
- Team-aware arbitration.
- Early-buzz rules.
- Disconnections.

Do not create separate arbitration systems for different device types.

## 14. PERSISTENT PLAYER PROFILES

Every player must have a stable profile ID.

Profiles must support:

- Display name.
- Nickname.
- Profile picture.
- Built-in avatar.
- Player color.
- Preferred buzzer.
- Preferred button mapping.
- Lifetime statistics.
- Solo statistics.
- Team statistics.
- Game history.
- Category performance.

Do not identify players solely by display name.

Changing a player's name, picture, color, or controller must not erase historical records.

## 15. SINGLE QR-CODE PLAYER PORTAL

The public game board must display one primary QR code.

Scanning it opens the local player portal.

The portal must allow:

1. Selecting an existing profile.
2. Entering the profile PIN.
3. Creating a new profile.
4. Accessing the profile dashboard.
5. Editing the profile.
6. Viewing statistics.
7. Viewing game history.
8. Joining the current game.

Do not require separate public QR codes for individual profiles.

The QR code must not contain authentication credentials.

## 16. FOUR-DIGIT PROFILE PINs

Every profile must support a four-digit numeric PIN.

Requirements:

- PIN creation.
- PIN confirmation.
- PIN authentication.
- PIN changes.
- Host-assisted PIN reset.
- Secure session management.
- Failed-attempt rate limiting.
- Temporary lockouts.

Store PINs using an appropriate salted password-hashing algorithm.

Never store plaintext PINs.

A four-digit PIN is convenient local access control, not high-security authentication.

Do not allow unauthorized profile editing.

## 17. PROFILE CUSTOMIZATION

Players must be able to change:

- Name.
- Nickname.
- Profile picture.
- Avatar.
- Player color.
- Buzzer preferences.

Support picture uploads from:

- Windows computers.
- iPads.
- iPhones.
- Android phones.

Validate image uploads.

Resize and store images locally.

When a player saves changes:

1. Validate the update.
2. Save it to SQLite or managed local media storage.
3. Broadcast the update.
4. Update the public board.
5. Update the host controller.
6. Update the player portal.

Do not require a game restart or manual refresh.

## 18. TEAM MODE

Support team gameplay.

The host must be able to:

- Create teams.
- Name teams.
- Choose team colors.
- Choose team avatars.
- Assign profiles.
- Remove profiles.
- Reassign profiles.
- Save teams for future games.
- Configure team-specific buzzer modes.

Support two or more profiles per team.

Do not hardcode team size to two.

Preserve historical team membership.

## 19. PER-TEAM BUZZER CONFIGURATION

Each team independently chooses its buzzer mode.

Supported modes:

### Individual Buzzers

Every member may have their own buzzer.

Example:

Team A:
- Alex: Joy-Con (L).
- Jordan: Joy-Con (R).

### Shared Team Buzzer

One buzzer represents the team.

Example:

Team B:
- Taylor.
- Sam.
- Shared Joy-Con (L).

Different teams in the same game may use different modes.

Do not implement one global team buzzer mode.

Support mixed Joy-Con, smartphone, and keyboard input.

## 20. PLAYER, TEAM, AND CONTROLLER SEPARATION

Treat these as separate entities:

### Player Profiles

Persistent individual identities.

### Teams

Groups of player profiles competing together.

### Controllers

Interchangeable input devices.

Controllers must never be used as permanent player identifiers.

Changing controllers must not affect player statistics.

Changing team membership must not rewrite historical results.

Use stable IDs and documented database relationships.

## 21. TEAM SCORING

During team games, game points belong to the team.

Example:

Alex answers a 600-point clue correctly.

- Team score: +600.
- Alex correct answers: +1.
- Alex contribution: +600.
- Jordan contribution: 0.

Do not award another 600 game points to Alex.

Individual contributions are statistical records.

They must not inflate team scores.

Incorrect answers must follow the same principle.

## 22. SHARED BUZZER ATTRIBUTION

When a team uses a shared buzzer, the application may not know which person answered.

The host controller must allow the host to select:

- A specific team member.
- Team Only / Unknown.

If a player is identified, record their contribution.

If no player is identified:

- Update the team score.
- Update team statistics.
- Leave individual attribution unknown.

Do not invent individual statistics.

Support authorized corrections with an audit trail.

## 23. WAGERING

Implement:

- Daily Wagers.
- Final Wagers.
- Configurable wager rules.
- Wager validation.
- Host adjudication.
- Correct and incorrect wager outcomes.

During team games, wagers affect team scores.

Individual wager attribution is optional and statistical only.

Do not duplicate wager points.

## 24. STATISTICS

Track:

### Solo Statistics
- Games played.
- Wins.
- Losses.
- Average score.
- Correct answers.
- Incorrect answers.
- Answer accuracy.
- Category performance.
- Buzzer statistics.

### Individual Team Contributions
- Team games played.
- Team wins.
- Correct answers personally given.
- Incorrect answers personally given.
- Individual buzzes.
- Contribution points earned.
- Contribution points lost.
- Net contribution.
- Category performance.

### Team Statistics
- Games played.
- Wins.
- Losses.
- Average score.
- Correct answers.
- Incorrect answers.
- Category performance.
- Buzzer performance.
- Wager performance.

Keep these categories separate.

Avoid misleading combined averages.

## 25. GAME HISTORY

Store detailed historical game records.

Include:

- Game title.
- Date.
- Participating profiles.
- Participating teams.
- Historical team membership.
- Categories.
- Clues.
- Correct answers.
- Buzz events.
- Answer outcomes.
- Score changes.
- Wagers.
- Final scores.
- Winners.

Preserve historical clue snapshots.

Editing an original game board must not change completed game records.

Players must be able to review their own historical performances.

## 26. GAMEPLAY EVENT RECORDING

Use authoritative gameplay events.

Record:

- Game session.
- Clue.
- Player profile.
- Team.
- Controller input source.
- Buzz result.
- Answer result.
- Score change.
- Individual contribution.
- Timestamp.
- Host corrections.

Events must support accurate statistics and auditing.

Prevent double-counting.

## 27. USER INTERFACE DESIGN

The application must prioritize:

- Clean layouts.
- Simple navigation.
- Minimal clutter.
- Readable typography.
- Consistent spacing.
- Clear buttons.
- Large touch targets.
- Responsive layouts.
- Accessible colors.
- Subtle animations.
- Intuitive workflows.

Do not overwhelm users with advanced settings.

Use progressive disclosure.

The application should be understandable without technical knowledge.

Optimize each interface for its intended device.

## 28. DATABASE AND PERSISTENCE

Use SQLite for structured data.

Use managed local storage for uploaded images and media.

Implement:

- Database migrations.
- Transactional updates.
- Referential integrity.
- Automatic saving.
- Game restoration.
- Profile persistence.
- Team persistence.
- Historical records.
- Backup and restore.

Avoid data loss during crashes or interrupted sessions.

## 29. SECURITY

Implement:

- Input validation.
- Profile authentication.
- Host authentication.
- Role-based permissions.
- Secure session handling.
- PIN hashing.
- Rate limiting.
- Image validation.
- Safe file storage.
- WebSocket authorization.
- LAN connection controls.
- Database integrity checks.

Do not expose private answers to public clients before reveal.

Do not trust clients to calculate authoritative scores or buzzer order.

## 30. TESTING REQUIREMENTS

Use automated testing throughout development.

Test:

- Board creation.
- Board editing.
- Game setup.
- Game state.
- Scoring.
- Wagering.
- Timers.
- Public board synchronization.
- iPad host controls.
- Smartphone joining.
- QR-code access.
- Profile authentication.
- Profile customization.
- Image uploading.
- Real-time profile updates.
- Joy-Con input simulation.
- Controller assignments.
- Team-specific buzzer modes.
- Shared buzzer attribution.
- Individual contributions.
- Team scoring.
- Statistics.
- Game history.
- Game saving.
- Game resuming.
- Offline operation.

Use Playwright for browser workflows.

Test tablet and smartphone layouts.

Require real hardware validation before claiming actual Joy-Con or iPad compatibility.

## 31. DEVELOPMENT PRIORITIES

Implement in this order:

1. Architecture and persistent identity model.
2. Electron application and local server.
3. Public board and iPad host controller.
4. Profile portal, QR joining, and PIN authentication.
5. Board editor and game library.
6. Core gameplay, scoring, timers, and wagers.
7. Unified buzzer engine.
8. Joy-Con, phone, and keyboard buzzers.
9. Team mode and per-team buzzer configuration.
10. Individual contribution tracking.
11. Statistics and detailed history.
12. Themes, multimedia, and customization.
13. Advanced game modes.
14. Comprehensive testing and packaging.

Implement event recording and database foundations early, even if advanced dashboards are built later.

## 32. GIT WORKFLOW

Use Git throughout development.

Before changes:

- Inspect status.
- Understand existing changes.
- Avoid overwriting unrelated work.

After a verified milestone:

- Run relevant tests.
- Update documentation.
- Commit changes with a descriptive message.

Do not commit secrets, credentials, databases containing personal data, or unnecessary generated artifacts.

Do not force-push or rewrite shared history without authorization.

Push to GitHub when authorized and authentication is available.

## 33. SESSION CONTINUITY

At the beginning of each session:

1. Read project instructions.
2. Inspect the repository.
3. Read progress documentation.
4. Identify the next incomplete milestone.
5. Continue implementation.

Before ending a session:

1. Run available tests.
2. Record completed work.
3. Record unresolved issues.
4. Update the feature matrix.
5. Update progress documentation.
6. Commit verified changes when appropriate.
7. Record the next task.

Do not assume another session will automatically start.

Leave the repository in a resumable state.

## 34. COMPLETION STANDARD

Do not declare the project complete until:

- The Windows application launches.
- Offline gameplay works.
- Public board and iPad host controller synchronize.
- Profiles and PINs work.
- QR joining works.
- Profile customization synchronizes.
- Joy-Con buzzers work with verified hardware.
- Smartphone buzzers work.
- Team-specific buzzer modes work.
- Team scoring is accurate.
- Individual contributions are accurate.
- Statistics and game history persist.
- Game saving and resuming work.
- Windows packaging succeeds.
- Required tests pass.
- Remaining limitations are documented.

Continue working toward these requirements within authorized session limits.

The primary goal is a polished, reliable, fully offline game with minimal unnecessary user involvement.