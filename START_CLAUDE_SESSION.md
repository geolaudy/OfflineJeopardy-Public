# OfflineJeopardy — new Claude Code session startup

Paste the block below into a new Claude Code session, on any computer. It works from a fresh clone
(which starts on `main`) as well as from an existing checkout.

```text
OFFLINEJEOPARDY — NEW CLAUDE CODE SESSION STARTUP

Continue development of OfflineJeopardy using the existing GitHub repository
(https://github.com/geolaudy/OfflineJeopardy).

The repository has two primary branches:
- main — stable public releases only.
- development — all active development and Claude Code work.

Before doing anything else:
1. Inspect the current Git branch and working-tree status (git status -sb).
2. Fetch the latest remote state (git fetch origin --prune).
3. Safely switch to development without discarding local changes (git switch development, then
   git pull --ff-only). If local changes would be overwritten, stop and ask me.
4. Read CLAUDE.md (section 0 first), SESSION_HANDOFF.md (top section) and the relevant
   development documentation (PROGRESS.md, KNOWN_ISSUES.md, FEATURE_MATRIX.md, BRANCH_WORKFLOW.md).
5. Check and acquire the shared development lock (npm run dev:lock:status, then
   npm run dev:lock:acquire -- --task "<task>"); continue only when it says ACQUIRED. If another
   computer holds it, tell me who and since when and do read-only work only.
6. Continue the existing development work (SESSION_HANDOFF.md "Single recommended next task").

Do not restart the project.
Do not rewrite working functionality unnecessarily.
Do not create a replacement repository.
Do not commit, push, merge, or publish anything to main (or push a v* tag, or publish a GitHub
release) without my explicit authorization for that specific release.

Work autonomously on development.
Maintain the development documentation.
Commit and push verified development milestones to development.
Ensure another computer can resume from GitHub and SESSION_HANDOFF.md if this session ends; at the
end: tests, SESSION_HANDOFF.md, commit, push, verify, npm run dev:lock:release.
```

## Notes

- First time on a computer: clone, `git switch development`, `npm ci`. GitHub push access must work
  without prompts (Git Credential Manager). The first `dev:lock:acquire` installs the git hooks.
- Personal, git-ignored folders (`new_sfx/` for personal sound files, `references/` for mock-ups)
  only exist on the computers that have them. Never commit or upload them.
- Older, machine-specific prompts are in `CONTINUE_PROMPT_SAME_COMPUTER.txt` and
  `CONTINUE_PROMPT_OTHER_COMPUTER.txt`. This file replaces them as the general entry point.
