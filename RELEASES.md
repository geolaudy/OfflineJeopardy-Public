# Stable releases — mapping to development

Each stable release on `main` is a snapshot of one tested `development` commit
(BRANCH_WORKFLOW.md). This table traces every release back to its source. The `Release-Source:`
trailer of the release commit says the same thing.

| Version | Tag | `main` commit | Source (`development`) | Date | Notes |
|---|---|---|---|---|---|
| 1.0.0 | `v1.0.0` (annotated, object cc09087) | `fcc7433` | `4e45a06` | 2026-10-22 | First stable release; = 0.17.0-rc.6 (owner-tested on real hardware, code unchanged) + version, CHANGELOG, README, screenshots and docs. Built and published by Actions run 39895749820. https://github.com/geolaudy/OfflineJeopardy/releases/tag/v1.0.0 |

Earlier 0.x releases (`v0.2.0 … v0.16.0`) were tagged directly on the old single `main` branch
(now the history of both branches). Their GitHub releases are unchanged.

## GitHub settings

- Default branch: `main` (verified with `gh repo view`, 2026-10-22).
- Branch protection / rulesets on `main`: **not available** (private repository on the Free plan →
  HTTP 403). See KNOWN_ISSUES K69 and BRANCH_WORKFLOW.md "GitHub settings".
- Visibility: private (unchanged; making it public is the owner's decision).
