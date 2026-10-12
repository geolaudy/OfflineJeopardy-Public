# OfflineJeopardy

A fully offline, customizable Jeopardy-style game for Windows. The PC shows the board on a TV,
the host runs the game from an iPad (Safari, no app), and players buzz with phones, Joy-Cons or
keyboard keys — all over your local network, no internet or accounts needed.

## Use it
- Install `release/OfflineJeopardy-Setup-<version>.exe` (or run the portable exe).
- See [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## Develop
```bash
npm install
npm run dev          # server on :3000 (data in ./data) + Vite on :5173
npm start            # build + run the Electron app
npm test             # unit + integration (Vitest)
npm run build && npm run test:e2e   # Playwright (Chromium + WebKit)
npm run dist         # Windows installer + portable exe in ./release
```
Docs: ARCHITECTURE.md · DECISIONS.md · FEATURE_MATRIX.md · PROGRESS.md · KNOWN_ISSUES.md · RESEARCH_NOTES.md · IMPLEMENTATION_PLAN.md
