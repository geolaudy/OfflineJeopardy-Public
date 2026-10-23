# Branch and release workflow

OfflineJeopardy has two permanent branches:

| Branch | Purpose | Who changes it |
|---|---|---|
| `main` | **Stable public releases.** GitHub's default branch: the public README, screenshots, CONTRIBUTING, user and build docs, and everything needed to build, test and package the app. No internal development files. | Only a release that the owner explicitly approved, one at a time. |
| `development` | **All active work.** Source, tests, tools, Claude Code instructions (`CLAUDE.md`, `.claude/`), session handoffs, progress, known issues, feedback, the development lock. | Every development session, under the development lock. |

Other refs: `dev-lock` (the development lock record, see DEVELOPMENT_LOCK.md — never merge it), tags
`v0.2.0 … v0.16.0` (published 0.x releases, unchanged), `v1.0.0` onwards (stable releases, on
`main`), `pre-restructure-main` (the last commit before this split — rollback anchor, never move it).

> **Explicit owner approval is required before anything updates `main`, before any `v*` tag is pushed
> and before any GitHub release is published.** The owner's approval of one release never covers the
> next one. Claude Code sessions must ask, every time.

## Why main shares history with development (and is not an orphan branch)

The 1.0.0 restructuring (2026-10-22) kept `main`'s existing history and added one **release snapshot
commit** on top of it. `development` was created from the same tip (`4ac0d77`) and keeps all
development files.

An orphan `main` (a new root commit) was considered and rejected:

- Replacing the existing `main` with unrelated history would need a force-push or deleting the default
  branch. Both are destructive, and the restructuring rules forbid them.
- With shared history, pull requests from a release branch into `main` work normally, GitHub's branch
  protection and compare views behave as usual, and every release commit can be traced to its source.
- Existing tags `v0.x` stay reachable from `main`.

The cost: `main`'s *history* still contains the old development files (deleting files from the latest
snapshot never removes them from earlier commits). `main`'s current tree, which GitHub shows and every
clone checks out, is clean.

**Consequence: never merge `development` into `main`.** A merge would bring back development-only
files that changed since the last release. `main` only receives snapshot commits made by
`scripts/release-export.mjs`: the tree of one approved `development` commit minus the development-only
paths. That keeps `main` clean by construction, makes every release reproducible, and traces it back
through its `Release-Source:` trailer.

Nothing ever flows from `main` back to `development`. Public files (README.md, CONTRIBUTING.md,
docs/BUILDING.md, docs/screenshots/) are edited **on development** and reach `main` with the next
release.

## Development-only paths

The list lives in `scripts/release-export.mjs` (`DEVELOPMENT_ONLY`; `node scripts/release-export.mjs --list`).
The script also removes the `dev:lock:*` npm scripts from `main`'s package.json, because the lock
script itself is development-only.

`.claude/`, `.githooks/`, CLAUDE.md, START_CLAUDE_SESSION.md, BRANCH_WORKFLOW.md, RELEASES.md,
SESSION_HANDOFF.md, PROGRESS.md, KNOWN_ISSUES.md, USER_FEEDBACK.md, FEATURE_MATRIX.md,
IMPLEMENTATION_PLAN.md, DECISIONS.md, RESEARCH_NOTES.md, ARCHITECTURE.md, PROJECT_SPEC.md,
START_PROJECT.md, DEVELOPMENT_LOCK.md, CONTINUE_PROMPT_*.txt, setup_parts.json,
scripts/dev-lock.mjs, scripts/release-export.mjs, tests/integration/devLock.test.ts.

Everything else goes to `main`, including all tests (the release workflow runs them), the Playwright
configs, `docs/`, `.github/workflows/`, build resources and the lockfile. A new file is public by
default: if it is internal, add it to `DEVELOPMENT_ONLY` in the same commit. Source comments may refer
to development documents (for example RESEARCH_NOTES.md); that is fine, since nothing reads them at
build or run time.

## Development workflow (every session)

1. **Start**: inspect the branch and the working tree (`git status -sb`), then `git fetch origin --prune`.
   If you are not on `development`, switch safely with `git switch development`. If local changes would be
   overwritten, stop and ask; never reset or discard them. Then update with `git pull --ff-only`.
2. **Read**: CLAUDE.md (§0 first), SESSION_HANDOFF.md (top), PROGRESS.md (top), KNOWN_ISSUES.md,
   FEATURE_MATRIX.md.
3. **Lock**: run `npm run dev:lock:status`, then `npm run dev:lock:acquire -- --task "…"`. It must report
   ACQUIRED. If another computer holds the lock, do read-only work only (DEVELOPMENT_LOCK.md).
4. **Work** on `development` (or a short-lived feature branch from it that is merged back into
   `development`). Run the relevant tests: `npm run typecheck`, `npm test`, and `npm run build:web &&
   npm run test:e2e` for UI work.
5. **Commit and push** each verified milestone to `origin/development`. The git hooks check the lock,
   and pushes to `main` / `v*` tags are refused.
6. **Hand off**: update SESSION_HANDOFF.md (top), PROGRESS.md, KNOWN_ISSUES.md and FEATURE_MATRIX.md;
   commit; push; verify the push; then `npm run dev:lock:release`.

Release candidates (`X.Y.Z-rc.N`) are built locally with `npm run release:local` for the owner's
real-hardware tests. They are never published as GitHub releases.

## Release workflow (development → main)

Only after the owner says, in so many words, that version X.Y.Z may be released:

1. **Pick the exact commit** on `origin/development` that the owner tested (normally the rc build's
   commit plus documentation-only commits). Record its SHA.
2. **Prepare it on development**: set `package.json` to `X.Y.Z` (`npm version X.Y.Z --no-git-tag-version`),
   turn CHANGELOG `[Unreleased]` into `## [X.Y.Z] — date` (written for players, not a bug list), update
   README.md / CONTRIBUTING.md / docs if needed, and `npm run screenshots` if the UI changed visibly.
   Run the full checks (`npm run release:local`, plus `npm run test:e2e`). Commit, push and verify. This
   commit is the **release source**.
3. **Export the snapshot**:
   ```bash
   node scripts/release-export.mjs --source <release source SHA> --version X.Y.Z \
     --trailer "Co-Authored-By: …"        # optional
   ```
   This creates `release/vX.Y.Z` in a separate worktree (`../OfflineJeopardy-release-vX.Y.Z`) from
   `origin/main`, with one snapshot commit (single parent, the previous `main`), and checks that every
   required file is present, no development-only file is left, and nothing else differs from the source.
4. **Verify from that worktree, as a fresh clone would**: run `npm ci`, `npm run typecheck`, `npm test`,
   `npm run dist`, `npm run dist:verify`. Review the diff with `git diff --stat origin/main HEAD`.
5. **Integrate** (same approval):
   ```bash
   # from the development checkout (the pre-push hook asks for the variable)
   OJ_RELEASE_APPROVED=vX.Y.Z git push origin release/vX.Y.Z:main      # fast-forward only, never --force
   ```
   In PowerShell: `$env:OJ_RELEASE_APPROVED='vX.Y.Z'; git push …; Remove-Item Env:OJ_RELEASE_APPROVED`.
   If branch protection requires pull requests, push `release/vX.Y.Z` instead, open a pull request into
   `main`, wait for the **Checks** workflow, and merge with **"Create a merge commit" or "Rebase"**
   (a squash would drop the `Release-Source:` trailer).
6. **Tag and publish**:
   ```bash
   git fetch origin
   git tag -a vX.Y.Z origin/main -m "OfflineJeopardy vX.Y.Z (source: development <SHA>)"
   OJ_RELEASE_APPROVED=vX.Y.Z git push origin refs/tags/vX.Y.Z
   ```
   `.github/workflows/windows-build.yml` checks that the tag matches package.json, runs the type check and
   tests, builds and verifies the installer and portable exe **without** personal sound files, and
   publishes the GitHub release with the `[X.Y.Z]` CHANGELOG section and SHA256SUMS.txt.
7. **Verify**: the workflow run succeeded; the release exists with its 3 assets; `main`'s README and
   screenshots render; `git ls-remote origin refs/tags/vX.Y.Z` points at the release commit.
8. **Record** the release in RELEASES.md (version, tag, `main` commit, source commit, date, workflow
   run) on `development`; remove the worktree (`git worktree remove ../OfflineJeopardy-release-vX.Y.Z`)
   and delete the local `release/vX.Y.Z` branch.

Never: force-push, move or delete a published tag, overwrite a release, merge `development` into
`main`, reset `main`, attach locally built binaries (they may contain personal sounds), or publish
without approval.

## GitHub settings

- Default branch: `main` (verified 2026-10-22).
- Branch protection: **not available** while the repository is private on GitHub's Free plan (the API
  answers HTTP 403 "Upgrade to GitHub Pro or make this repository public"; KNOWN_ISSUES K69). Until
  then, `main` is protected by the owner-approval rule and the local pre-push hook only.
- If the repository becomes public (the owner's decision) or the account gets GitHub Pro, protect
  `main` with: no force pushes, no deletion, changes through a pull request, required status check
  **Checks / test** (`.github/workflows/checks.yml`), with administrators allowed to bypass so an
  approved release can still be completed. Then use the pull-request variant of step 5. With `gh`:
  ```bash
  gh api -X PUT repos/geolaudy/OfflineJeopardy/branches/main/protection --input protection.json
  # protection.json: {"required_status_checks":{"strict":true,"contexts":["test"]},
  #   "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},
  #   "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
  ```
- No automation merges into `main`: tests passing is never a reason to release.

## Rollback

- A bad release commit on `main`: do **not** reset or force-push. Make a new snapshot from a good
  development commit (or `git revert` the release commit on a release branch) and release it with
  approval as a new patch version.
- The restructuring itself: `pre-restructure-main` and `development` both keep the original tip
  (`4ac0d77`). The old layout can be restored by making a new commit on `main` with that tree
  (`git checkout pre-restructure-main -- .` on a release branch), without rewriting anything.
