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

The six subagents (research, backend, frontend, gameplay, QA, integration) are defined in `.claude/agents/`; each file defines its responsibilities.

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

The chosen stack is in `package.json`.

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

## 9–30. PRODUCT REQUIREMENTS AND HARD RULES

The full feature requirements (public board, iPad host controller, LAN, Joy-Cons, buzzer engine, profiles, QR portal, PINs, customization, teams, per-team buzzer modes, scoring, attribution, wagering, statistics, history, events, UI, persistence, security, testing) live in `PROJECT_SPEC.md`, which every session reads first (section 3). These rules are non-negotiable:

- Never expose private answers to public clients before reveal, and never expose host-only controls on the public board.
- The server is authoritative: never trust clients to calculate scores or buzzer order.
- All buzzer sources (Joy-Cons, phones, keyboards, other controllers) go through one buzzer engine. Never build separate arbitration per device type.
- Joy-Cons are not Xbox controllers. Do not require external controller-mapping software unless direct integration proves impractical. Use simulated input for automated tests.
- Never claim Joy-Con or iPad compatibility is verified without real hardware testing.
- Do not assume every local network allows device-to-device communication. Core gameplay must never need the internet.
- Players, teams and controllers are separate entities with stable IDs. Never identify a player by display name or by controller. Renaming, re-picturing, recoloring, changing controllers or changing team membership must never erase or rewrite historical records.
- One public QR code opens the player portal. It must not contain credentials, and there are no per-profile public QR codes.
- PINs are four digits, stored only as salted password hashes, never in plaintext, with failed-attempt rate limiting and temporary lockouts. A PIN is convenient local access control, not high-security authentication. Never allow unauthorized profile editing.
- Validate, resize and store uploaded images locally. Profile changes save to SQLite or managed media storage and broadcast live to board, host and portal with no restart or refresh.
- Do not hardcode team size to two. Each team chooses its own buzzer mode (individual or shared). Never implement one global team buzzer mode.
- In team games, points belong to the team. Individual contributions are statistics only and must never inflate team scores; incorrect answers follow the same rule. Never duplicate wager points.
- With a shared buzzer, the host picks a member or "Team Only / Unknown". Never invent individual statistics. Corrections need an audit trail.
- Keep solo, individual-team-contribution and team statistics separate. Avoid misleading combined averages.
- Preserve historical clue snapshots. Editing a board must never change completed game records. Prevent double-counting in gameplay events.
- Use SQLite with migrations, transactions and referential integrity. Avoid data loss during crashes or interrupted sessions.
- Keep the UI simple. Use progressive disclosure and do not overwhelm users with advanced settings.
- Use Playwright for browser workflows and test tablet and smartphone layouts.

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
## 35. WINDOWS BUILDS AND RELEASES (permanent)

Every stable milestone: run tests, build, update docs, commit and push to `origin/main`.

Before ending a session, build the latest stable version (`npm run release:local`) and record artifact paths in `SESSION_HANDOFF.md`.

GitHub Releases are for major milestones only, never for small fixes. Build commands and the release procedure are in the `windows-release` skill (`.claude/skills/windows-release/SKILL.md`).

Never move or delete published tags, overwrite releases, force-push, or attach unverified binaries, API keys or player databases.

## 36. DEVELOPMENT LOCK — ONE COMPUTER AT A TIME (permanent)

Before changing anything in a session, run `npm run dev:lock:status` and then
`npm run dev:lock:acquire -- --task "<task>"`. Continue only when it reports ACQUIRED (exit 0).

If it prints OFFLINEJEOPARDY DEVELOPMENT LOCKED, another computer is developing: tell the user who
holds it and since when, and do read-only work only (no file changes, commits, pushes or releases).
Never take over an active lock. Recover an expired lock from another computer only after the user
confirms that session has stopped (`npm run dev:lock:recover -- --confirm`).

Run `npm run dev:lock:check` before each milestone, commit, push, release or destructive git
command (the git hooks also enforce it). If ownership is lost or cannot be verified, stop changing
files, keep local work, do not push, and tell the user. GitHub unreachable = fail closed.

At the end of a session: tests, handoff docs, commit, push, verify, then `npm run dev:lock:release`.
Details and recovery: `DEVELOPMENT_LOCK.md`.
