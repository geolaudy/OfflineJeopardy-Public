---
name: windows-release
description: Build, verify and publish OfflineJeopardy Windows builds - npm run dist / dist:verify / release:local, and the GitHub Release procedure (version bump, CHANGELOG, tag vX.Y.Z). Use when building installers, preparing a release, or at session end.
---

# Windows builds and releases

Windows builds:

- `npm run dist` builds the NSIS installer and the portable exe into `release/` (unsigned, `--publish never`).
- `npm run dist:verify` (scripts/verify-dist.mjs) checks the artifacts and the asar contents and starts both packaged executables headlessly with `--smoke-test=<report.json>`.
- `npm run release:local` = typecheck + Vitest + dist + verify.
- Before ending a session, build the latest stable version and record artifact paths in `SESSION_HANDOFF.md`.

GitHub Releases (major milestones only, never for small fixes, and **only with the owner's explicit approval of that specific release**):

Releases go from `development` to the stable `main` branch as a snapshot — follow `BRANCH_WORKFLOW.md` → "Release workflow" step by step:

1. On development: run Vitest and Playwright; bump `package.json` version (semver); write the `CHANGELOG.md` section (written for players; New Features / Improvements / Bug Fixes / Known Issues); build + verify locally; commit, push.
2. `node scripts/release-export.mjs --source <that commit> --version X.Y.Z` → verify the release worktree like a fresh clone (npm ci, typecheck, test, dist, dist:verify).
3. With approval: `OJ_RELEASE_APPROVED=vX.Y.Z git push origin release/vX.Y.Z:main` (fast-forward), tag `vX.Y.Z` on that commit and push it. `.github/workflows/windows-build.yml` then tests, packages, verifies and publishes the release with the installer, portable exe and SHA256SUMS.txt (public build, no personal sounds).
4. Verify the release and its assets exist; record it in `RELEASES.md` and `PROGRESS.md` on development.

Never move or delete published tags, overwrite releases, force-push, or attach unverified binaries, API keys or player databases.
