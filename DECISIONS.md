# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-10-12 | **Single package** (not a monorepo); `src/shared`, `src/server`, `src/web`, `src/electron`. | Simplest build; shared types imported directly; esbuild/vite handle each target. |
| D2 | 2026-10-12 | **SQLite via built-in `node:sqlite`** instead of better-sqlite3. | Electron 44 ships Node 24.21 (same as dev Node); `node:sqlite` works in both, so no native module ABI rebuilds between tests and the packaged app. Verified in-session. |
| D3 | 2026-10-12 | **scrypt** for PIN hashing (N=16384, r=8, p=1, 16-byte salt) instead of Argon2id. | Node 24 has `crypto.argon2Sync`, but Electron's BoringSSL reports "Argon2 algorithm not supported" (verified). scrypt is a salted, memory-hard KDF built into both runtimes. |
| D4 | 2026-10-12 | **Fastify + @fastify/websocket**, server runs **in the Electron main process**. | No separate Node runtime to ship; automatic start/stop with the app. |
| D5 | 2026-10-12 | **Pure engine + derived scores**: scores are the sum of non-voided events. | Auditable, no double-counting, undo/corrections by voiding events. |
| D6 | 2026-10-12 | **Competitor abstraction** (solo player or team) owns game points. Contributions are statistics-only deltas. | Meets team-scoring rules (no duplicated points) with one code path for solo and team games. |
| D7 | 2026-10-12 | Boards stored as **JSON documents** (`boards.content_json`) + `board_versions`; history uses normalized `game_clues` snapshots. | Editor works on whole documents (rearranging, import/export) easily; history still has relational, immutable clue snapshots. |
| D8 | 2026-10-12 | Undo snapshots only **gameplay fields** (phase, clue, buzzer, final, timer, …) — not roster/bindings/rules. | Undoing a judgement should not revert unrelated setup edits made later. |
| D9 | 2026-10-12 | Host authentication by **pairing code** shown on the desktop + long-lived host session; loopback may self-authenticate (toggle). | iPad reconnects without repeating setup; nothing secret in public QR codes. |
| D10 | 2026-10-12 | **Joy-Cons via WebHID** in the Electron renderer (no node-hid). | No native module; Chromium WebHID is maintained; Electron can auto-grant device permissions; same code testable in Chrome. |
| D11 | 2026-10-12 | Default Joy-Con mapping = **any button** except Home/Capture/+/−/stick clicks; per-controller override. | Easiest for non-technical players; held/edge handling prevents repeats. |
| D12 | 2026-10-12 | Shared-buzzer teams buzz **only** through a device bound to the team; members' phones are rejected. | "One buzzer represents the team"; prevents accidental multi-device buzzing. |
| D13 | 2026-10-12 | Phones are implicit controllers (`phone:<profileId>`), no assignment needed. | Minimal setup for the common case. |
| D14 | 2026-10-12 | Built-in avatars use **system emoji**; sounds are **synthesised with Web Audio**. | No third-party artwork or audio files to license; works offline. |
| D15 | 2026-10-12 | Simultaneous buzzes resolved by **server arrival order** (no tie window). | Deterministic; client timestamps are untrusted per spec. |
| D16 | 2026-10-12 | Statistics count only **completed** games. | Avoids partial/abandoned games skewing averages. |
| D17 | 2026-10-12 | Profile deletion is a **soft delete** that clears personal data but keeps the id. | Other players' history stays consistent. |
| D18 | 2026-10-12 | Restore-from-backup is applied **on next start**. | Avoids swapping the live DB under open connections. |
