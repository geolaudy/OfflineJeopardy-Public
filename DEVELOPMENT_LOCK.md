# Development lock — one computer at a time

OfflineJeopardy is developed on more than one Windows computer, sometimes with different Claude Code
accounts. The development lock makes sure only **one** session changes the project at a time.

**Rule for every session (human or Claude Code): check and acquire the lock before changing anything.**

```bash
npm run dev:lock:status                       # who holds it?
npm run dev:lock:acquire -- --task "what you are doing"
# ... work, commit, push ...
npm run dev:lock:release                      # when finished (after pushing)
```

## How it works

| Part | What it does |
|---|---|
| Lock storage | The branch **`dev-lock`** on the GitHub remote (`origin`). Its single file `session.json` is the lock record. The branch has its own history (no common history with `main`), is written with git plumbing only (no checkout, no working-tree or index changes), and never triggers a build (the workflow runs on `v*` tags only). Do not merge it or base work on it. |
| Atomic acquisition | Every change is a push of a new commit whose parent is the lock commit just read, with `--force-with-lease=refs/heads/dev-lock:<that commit>` (or "must not exist" for the first one). GitHub updates the ref only if it still points at the expected commit, so of two simultaneous attempts exactly one wins. The script then **reads the ref back** — a lock counts as held only when the remote shows our commit. |
| Fencing token | `generation` goes up on every acquisition / recovery. A clone keeps its `sessionId` + `generation` in `.git/oj-dev-lock.json` (never committed). Ownership = the remote record is `active`, unexpired and has the same session and generation. |
| Heartbeat | `acquire` starts a small detached Node process (`dev-lock.mjs heartbeat`) that renews the lock every **3 min**; the lock **expires 15 min** after the last heartbeat. Times come from GitHub's server clock (`Date` header of api.github.com), so wrong PC clocks don't matter. The heartbeat stops by itself when it sees it lost the lock, when the lock was released, or after **60 min without Claude Code activity** (so a crashed or abandoned session never holds the lock forever). Log: `.git/oj-dev-lock.log`. |
| Git hooks | `acquire` sets `core.hooksPath=.githooks`. `pre-commit` and `pre-push` run `dev-lock.mjs check` — a commit or push is refused unless this clone owns the unexpired lock (and refused when GitHub can't be reached). Lock pushes themselves bypass the hooks. |
| Claude Code hooks | `.claude/settings.json`: **SessionStart** prints the lock state into the session; **PreToolUse** on Edit/Write/NotebookEdit runs `dev-lock.mjs guard`, which blocks edits to files inside the project unless this clone holds a lock confirmed within the last 15 min (files outside the project — scratchpad, memory — are not affected); Bash/PowerShell calls record activity for the idle timer. Bash can still write files; the git hooks are the hard gate. |

## Commands

| Command | Purpose |
|---|---|
| `npm run dev:lock:status` | Show the lock (computer, developer, task, branch, heartbeat, expiry, generation) and whether this clone owns it. `-- --json` for machine-readable output. |
| `npm run dev:lock:acquire -- --task "…"` | Acquire a free or released lock (or re-confirm your own), install the git hooks and start the heartbeat. Prints **OFFLINEJEOPARDY DEVELOPMENT LOCKED** with the owner's details and exits 1 when another session holds it. |
| `npm run dev:lock:check` | Fencing check (used by the hooks; run it before a milestone, a release or any destructive git command). Exit 0 = you own it. |
| `npm run dev:lock:task -- "…"` | Update the "current task" shown to other computers. |
| `npm run dev:lock:release` | Release (owner only). Refuses while HEAD is not on any remote branch — push first (`-- --allow-unpushed` overrides). Stops the heartbeat and verifies the remote shows `released`. |
| `npm run dev:lock:recover` | For an **expired** lock only. An active lock is never taken over. Another computer's expired lock needs `-- --confirm` (a human checked that session has stopped); your own computer's crashed session (same session, heartbeat process gone) is recovered without it. Recovery is itself a compare-and-swap: if the old owner heartbeats at that moment, recovery aborts. |
| `node scripts/dev-lock.mjs stop-heartbeat` | Stop the heartbeat without releasing (the lock then expires). |
| `node scripts/dev-lock.mjs renew` | Send one heartbeat by hand. |

Exit codes: `0` ok, `1` refused (locked by another session, not the owner, …), `2` cannot verify (GitHub unreachable — **fail closed**).

## Setting up a computer

1. `git pull` (gets `scripts/dev-lock.mjs`, `.githooks/`, `.claude/settings.json`).
2. GitHub push access must already work (`git push` without prompts — Git Credential Manager). Nothing is stored in the repository.
3. Optional names shown to others: `git config oj.computerName "Office-PC"` and `git config oj.developerName "George"` (defaults: host name and `user.name`).
4. `npm run dev:lock:acquire -- --task "…"` — this also sets `core.hooksPath` for the clone.

The lock system initialises itself: the first `acquire` creates the `dev-lock` branch.

## Normal hand-over between computers

1. Computer A: finish or pause the task, run tests, update `SESSION_HANDOFF.md`, commit, push, verify the push, `npm run dev:lock:release`.
2. Computer B: `git pull`, `npm run dev:lock:acquire -- --task "…"`, continue from `SESSION_HANDOFF.md`.

## When something goes wrong

- **Usage limit / crash / power loss:** the heartbeat stops (or stops after 60 idle minutes), the lock expires 15 min later. On the same computer, the next session simply runs `npm run dev:lock:acquire` (its own session) or `npm run dev:lock:recover`. From another computer: make sure the first computer's Claude Code is closed or idle, then `npm run dev:lock:recover -- --confirm`.
- **GitHub unreachable:** status / acquire / check fail with exit 2; commits and pushes are refused; the edit guard blocks once the last confirmation is over 15 min old. Local files are never touched — keep them, and continue when GitHub is back. Read-only work is fine.
- **"Ownership LOST":** another session recovered the lock after yours expired. Stop changing files. Your local commits stay local; do not push them over the other session's work — talk to the other developer, then pull, rebase or move your work to a feature branch once you hold the lock again.
- **Two people really need to work at once:** one holds the lock; the other works read-only, or the owner releases. There is no "force take-over" of an active lock by design.

## Limitations

- The guarantee holds only for sessions that use the protocol. A clone that never ran `acquire` has no hooks installed, and anyone can bypass hooks with `--no-verify` or by editing files through a shell.
- An expired heartbeat does not prove the other session stopped; that is why recovering another computer's lock needs a human `--confirm`.
- The heartbeat process relies on the computer staying awake; a sleeping laptop lets its lock expire (re-acquire on wake).
- `dev-lock` grows by one tiny commit per heartbeat (~20 per hour) on its own branch only.

## Tests

`tests/integration/devLock.test.ts` (Vitest) runs the real script against a temporary bare repository — never against the project's lock: free acquisition, rejection, simultaneous attempts (exactly one winner, repeated), heartbeat renewal, expiry detection, confirmed and same-computer recovery, owner-only release, unpushed-work refusal, network failure (fail closed), different branches, stale session blocked by the commit and push hooks, the Claude Code edit guard, and the background heartbeat.
