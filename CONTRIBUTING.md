# Contributing to OfflineJeopardy

Thanks for your interest in OfflineJeopardy. This page explains how the repository is organised and
how to propose a change.

## Branches

| Branch | Purpose |
|---|---|
| `main` | **Stable releases only.** It contains the source of the latest approved release (the default branch on GitHub), and every release is tagged `vX.Y.Z`. Do not use it for ordinary development. |
| `development` | **Active development.** Ongoing work, tests, development tools and the project's development documentation. |

`main` changes only when the maintainer approves a release. A release is a snapshot of a tested
`development` commit, so a fix merged into `development` reaches `main` with the next release.

To start working on the code:

```bash
git clone https://github.com/geolaudy/OfflineJeopardy.git
cd OfflineJeopardy
git switch development
npm ci
```

`development` also holds the maintainer's internal development and coordination notes. Start with
the files at its root.

## Proposing a change

1. Start from the latest `development`.
2. Create a branch for your change, for example `fix/final-wager-rounding` or `feature/new-theme`.
3. Keep the change focused. Don't modify the history of `main`, `development` or existing release tags.
4. Run the relevant checks (see [docs/BUILDING.md](docs/BUILDING.md)):
   `npm run typecheck`, `npm test`, and `npm run test:e2e` for anything visible in the browser.
5. Open a pull request **against `development`**. Describe what changed, why, and how you tested it
   (including real devices, such as an iPad, phones or Joy-Cons, if you used them).

Pull requests against `main` are not accepted, except for the maintainer's own approved release
changes.

## Guidelines

- The server is authoritative: clients never calculate scores or buzzer order.
- All buzzers (phones, Joy-Cons, keyboards) go through the one buzzer engine.
- Answers must never reach the TV or the phones before the host reveals them.
- Players, teams and controllers keep stable ids; edits must never rewrite past games.
- Core gameplay must keep working without the internet.
- Keep the interface simple, and test the tablet and phone layouts.

## Questions and bug reports

Open an issue that describes what happened, what you expected, the version (shown in Settings), and
the devices involved (PC, iPad/phone model and browser, controllers).

Opening an issue or a pull request does not grant any rights to the code. The project has no
open-source license (see the README), and the maintainer decides what is merged and released.
