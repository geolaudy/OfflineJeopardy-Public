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

GitHub Releases (major milestones only, never for small fixes):

1. Run Vitest and Playwright; bump `package.json` version (semver); write the `CHANGELOG.md` section (New Features / Improvements / Bug Fixes / Known Issues, plain language).
2. Build + verify locally, commit, push.
3. Create and push the tag `vX.Y.Z`. `.github/workflows/windows-build.yml` then tests, packages, verifies and publishes the release with the installer, portable exe and SHA256SUMS.txt.
4. Verify the release and its assets exist; record the version in `PROGRESS.md`.

Never move or delete published tags, overwrite releases, force-push, or attach unverified binaries, API keys or player databases.
