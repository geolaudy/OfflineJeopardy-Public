# OfflineJeopardy — Autonomous Development Startup Instructions

## 1. PURPOSE

This document provides the initial execution instructions for Claude Code.

The goal is to begin building OfflineJeopardy, a complete, polished, fully offline Jeopardy-style Windows application.

Read `CLAUDE.md` and `PROJECT_SPEC.md` before starting implementation.

Treat these documents as the authoritative project requirements.

Do not stop after producing architecture documents.

Proceed into actual implementation and testing.

## 2. PRIMARY USER EXPERIENCE

The intended setup is:

1. Windows PC runs OfflineJeopardy.
2. Windows PC displays the public board on a TV.
3. iPad runs the host controller through Safari.
4. Players scan one QR code to access profiles.
5. Players select existing profiles or create new ones.
6. Existing profiles require four-digit PIN authentication.
7. Players customize names, pictures, avatars, and colors.
8. Changes synchronize with the public board.
9. Players use Joy-Cons, phones, or keyboards as buzzers.
10. Host creates teams and assigns player profiles.
11. Each team independently chooses individual or shared buzzers.
12. Team scores and individual contributions are tracked separately.
13. Detailed statistics and game history persist across sessions.

All essential functionality must work without internet access.

## 3. DEVELOPMENT OPERATING RULES

Work autonomously within available permissions and resources.

- Make ordinary engineering decisions independently.
- Avoid unnecessary clarification questions.
- Install project dependencies when authorized.
- Use specialized agents when beneficial.
- Run automated tests.
- Investigate recoverable errors.
- Fix broken functionality.
- Maintain documentation.
- Commit verified milestones.
- Preserve resumable progress.

Do not bypass permissions.

Do not fabricate test results.

Do not claim unsupported hardware has been verified.

Do not introduce mandatory cloud services.

## 4. INITIAL ENVIRONMENT VERIFICATION

Inspect:

- Operating system.
- Node.js installation.
- npm installation.
- Git installation.
- Claude Code environment.
- REA availability.
- Repository status.
- Existing files.

If a required tool is unavailable:

1. Determine whether it can be installed using authorized methods.
2. Install it when permitted.
3. Verify installation.
4. Record any unresolved blocker.

Do not repeatedly attempt the same failing installation without changing the approach.

## 5. CREATE PROJECT DOCUMENTATION

Create or update:

- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `FEATURE_MATRIX.md`
- `PROGRESS.md`
- `DECISIONS.md`
- `KNOWN_ISSUES.md`
- `RESEARCH_NOTES.md`

The feature matrix must include all requirements from `PROJECT_SPEC.md`.

Use accurate implementation statuses.

## 6. CONFIGURE SPECIALIZED AGENTS

Create six Claude Code subagents:

1. Research Agent.
2. Backend Agent.
3. Frontend Agent.
4. Gameplay Agent.
5. QA Agent.
6. Integration Agent.

Give each agent a clearly defined responsibility.

Create agent configuration files where supported.

Coordinate work through the primary Claude Code session.

Use parallel work only when interfaces and file ownership are sufficiently clear.

## 7. REA INTEGRATION

REA refers to morluto/rea.

Verify whether it is installed and configured.

Use it selectively.

Do not spend time reverse engineering straightforward features.

Do not copy proprietary source code or assets.

Document research findings.

Proceed with independent implementation when reference behavior is unavailable.

## 8. ARCHITECTURE DESIGN

Design the application around:

- Electron Windows desktop shell.
- React frontend.
- Node.js local server.
- WebSocket synchronization.
- SQLite persistence.
- Server-authoritative game state.
- Modular gameplay engine.
- Persistent player profiles.
- Team identities.
- Controller assignments.
- Auditable gameplay events.

Separate:

1. Player profiles.
2. Teams.
3. Controllers.
4. Game sessions.
5. Game participants.
6. Buzzer events.
7. Answer events.
8. Score events.
9. Wager events.
10. Historical game records.

Do not use display names or controller IDs as permanent player identities.

## 9. DATABASE DESIGN

Create database schemas and migrations for:

- Player profiles.
- Profile authentication.
- Profile customization.
- Uploaded profile pictures.
- Teams.
- Team memberships.
- Historical team memberships.
- Game boards.
- Categories.
- Clues.
- Game sessions.
- Game participants.
- Controller assignments.
- Buzz events.
- Answer events.
- Score events.
- Wager events.
- Statistics.
- Game history.
- Application settings.

Use stable identifiers and appropriate relationships.

Store historical clue snapshots.

Support transactional updates and recovery.

## 10. CORE NETWORK ARCHITECTURE

The Windows application must automatically run a local game server.

Provide three interfaces:

### Public Board

Displayed on the TV or projector.

### Host Controller

Opened through Safari on an iPad.

### Player Portal

Opened through a smartphone browser.

Use WebSockets to synchronize game state.

Protect host-only actions.

Keep correct answers private until reveal.

Support reconnecting clients.

## 11. INITIAL PLAYABLE MILESTONE

The first major milestone must demonstrate:

1. Windows application launches.
2. Local server starts.
3. Public board displays.
4. iPad-compatible host controller connects.
5. Host selects a clue.
6. Public board displays the clue.
7. Host privately sees the answer.
8. Host reveals the answer.
9. Host adjusts a score.
10. Public scoreboard updates.
11. Game state can be saved.
12. Game state can be restored.

Do not postpone separate host and public interfaces.

## 12. PLAYER PROFILE IMPLEMENTATION

Implement:

- Persistent profile IDs.
- Profile creation.
- Profile selection.
- Four-digit PIN creation.
- PIN authentication.
- PIN changes.
- Secure sessions.
- Profile picture uploads.
- Avatar selection.
- Player colors.
- Profile editing.
- Real-time synchronization.

Create one public QR code that opens the player portal.

Players must be able to select existing profiles or create new ones.

Do not require separate QR codes per player.

## 13. PROFILE SECURITY

Implement:

- Salted PIN hashing.
- Failed-attempt rate limiting.
- Temporary lockouts.
- Secure session management.
- Host-assisted PIN reset.
- Role-based authorization.
- Image upload validation.

Never store PINs in plaintext.

Never place authentication credentials in public QR codes.

## 14. BOARD EDITOR AND LIBRARY

Implement:

- Board creation.
- Category editing.
- Clue editing.
- Answer editing.
- Custom clue values.
- Board saving.
- Board loading.
- Board duplication.
- Board deletion.
- Board previews.
- Board searching.
- Board importing.
- Board exporting.

Provide a clean, intuitive interface.

## 15. CORE GAMEPLAY

Implement:

- Clue selection.
- Question presentation.
- Answer reveal.
- Scoring.
- Negative scores.
- Score corrections.
- Undo.
- Timers.
- Daily Wagers.
- Final Wagers.
- Game completion.
- Winner determination.
- Game saving.
- Game resuming.

Use authoritative state transitions.

Record gameplay events.

## 16. UNIFIED BUZZER ENGINE

Create one buzzer engine supporting:

- Joy-Cons.
- Smartphones.
- Keyboards.
- Other compatible controllers.

Implement:

- First valid buzz.
- Buzzer locking.
- Buzzer resetting.
- Duplicate prevention.
- Debouncing.
- Held-button handling.
- Early-buzz rules.
- Team-aware arbitration.
- Disconnection handling.

All input sources must use the same arbitration rules.

## 17. NINTENDO JOY-CON INTEGRATION

Research reliable Windows Joy-Con input support.

Implement:

1. Controller detection.
2. Individual Joy-Con recognition.
3. Controller assignment.
4. Controller testing.
5. Button mapping.
6. Input handling.
7. Disconnection handling.
8. Reconnection handling.
9. Integration with the buzzer engine.

Prefer direct support without requiring external mapping software.

Use simulated controller events for automated tests.

Require actual Joy-Con hardware testing before marking compatibility verified.

## 18. TEAM MODE

Implement:

- Team creation.
- Team naming.
- Team colors.
- Team avatars.
- Profile assignment.
- Team saving.
- Historical membership.

Support multiple profiles per team.

Each team must independently choose:

### Individual Buzzer Mode

Every member may have a separate buzzer.

### Shared Buzzer Mode

One buzzer represents the entire team.

Different teams in the same game must support different modes.

Do not implement a global team buzzer setting.

## 19. TEAM SCORING AND ATTRIBUTION

During team games:

- Points affect the team score.
- Individual contributions are statistical records.
- Individual contributions do not create extra game points.
- Shared-buzzer answers may be attributed by the host.
- Unknown attribution remains team-only.
- Wagers affect team scores.
- Historical attribution must be preserved.

Implement automated tests preventing double-counting.

## 20. STATISTICS AND GAME HISTORY

Implement:

### Solo Statistics
- Games played.
- Wins.
- Losses.
- Correct answers.
- Incorrect answers.
- Scores.
- Category performance.

### Individual Team Contributions
- Team games played.
- Team wins.
- Individual buzzes.
- Correct answers.
- Incorrect answers.
- Contribution points.
- Category performance.

### Team Statistics
- Games played.
- Wins.
- Losses.
- Scores.
- Category performance.
- Wager performance.

### Game History
- Historical categories.
- Historical clues.
- Buzz events.
- Answer outcomes.
- Score changes.
- Wagers.
- Final scores.
- Winners.
- Historical team membership.

Provide a mobile-friendly player statistics dashboard.

## 21. REAL-TIME PROFILE SYNCHRONIZATION

When a player changes their:

- Name.
- Picture.
- Avatar.
- Color.

The server must:

1. Validate the update.
2. Persist the update.
3. Broadcast the change.
4. Update the public board.
5. Update the host controller.
6. Update the player portal.

No restart or manual refresh should be required.

## 22. USER INTERFACE DESIGN

Use a clean, simple, modern design.

Prioritize:

- Intuitive navigation.
- Readable text.
- Minimal clutter.
- Large touch controls.
- Consistent colors.
- Consistent spacing.
- Responsive layouts.
- Accessible contrast.
- Clear feedback.
- Simple setup workflows.

Avoid unnecessary complexity.

Advanced settings should be accessible without overwhelming normal users.

## 23. ADVANCED FEATURES

After core functionality is stable, implement remaining features from `PROJECT_SPEC.md`.

Examples:

- Multimedia clues.
- Advanced themes.
- Additional game modes.
- Statistics comparisons.
- Workspaces.
- Optional offline AI.
- Tournament support.
- Advanced importing and exporting.

Do not neglect mandatory core features.

## 24. AUTOMATED TESTING

Create and run tests throughout development.

Required areas:

- Game engine.
- Scoring.
- Wagering.
- Timers.
- WebSocket synchronization.
- Host authorization.
- Profile PIN authentication.
- Profile customization.
- Image uploading.
- QR-code joining.
- Controller assignments.
- Joy-Con input simulation.
- Team-specific buzzer modes.
- Shared-buzzer attribution.
- Individual contribution tracking.
- Statistics.
- Historical game records.
- Game saving.
- Game resuming.
- Offline operation.

Use Playwright for end-to-end browser testing.

Test tablet and smartphone viewport sizes.

Record actual test results.

## 25. WINDOWS PACKAGING

Configure Electron packaging.

Produce:

- Windows installer.
- Portable executable where practical.
- Bundled local server.
- Bundled required dependencies.
- Local data storage.
- User documentation.
- Setup instructions.
- Troubleshooting guidance.

The finished application must not require users to manually launch Node.js services.

## 26. FEATURE TRACKING

Maintain `FEATURE_MATRIX.md`.

Track every requirement.

Do not mark a feature TESTED unless appropriate tests pass.

Record limitations.

Record hardware validation requirements.

Update progress after meaningful milestones.

## 27. GIT WORKFLOW

Use Git for version control.

After verified milestones:

1. Run tests.
2. Review changes.
3. Update documentation.
4. Commit with a descriptive message.

Push when authorized and authentication is available.

Do not commit secrets or private user data.

## 28. AUTONOMOUS CONTINUATION

After completing a task:

1. Inspect the implementation plan.
2. Identify the next incomplete dependency-ready task.
3. Delegate when beneficial.
4. Implement.
5. Test.
6. Fix issues.
7. Update documentation.
8. Commit verified work.
9. Continue within the active session.

Do not repeatedly ask what to do next.

If blocked:

1. Investigate.
2. Attempt reasonable recovery.
3. Document the blocker.
4. Continue another independent task when possible.

Do not bypass permissions.

Do not claim that a session will continue automatically after termination.

## 29. SESSION HANDOFF

Before ending:

1. Update `PROGRESS.md`.
2. Update `FEATURE_MATRIX.md`.
3. Update `KNOWN_ISSUES.md`.
4. Record passing and failing tests.
5. Record the next implementation task.
6. Commit verified changes when appropriate.

Leave the project in a state that another Claude Code session can resume.

## 30. FINAL COMPLETION CRITERIA

The project is complete when:

- Windows application launches.
- Offline gameplay works.
- Public board and iPad host controller synchronize.
- Player portal works.
- One QR code supports profile selection and creation.
- Four-digit PIN authentication works.
- Profile customization works.
- Profile changes synchronize.
- Joy-Con buzzers work with hardware verification.
- Smartphone buzzers work.
- Team-specific buzzer modes work.
- Team scoring works.
- Individual contributions are accurate.
- Statistics persist.
- Detailed game history works.
- Games can be saved and resumed.
- Windows packaging succeeds.
- Required tests pass.
- Known limitations are documented.

Begin implementation immediately after completing essential architecture and planning.

Do not stop at documentation or a nonfunctional prototype.