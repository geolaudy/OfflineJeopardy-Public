# Building OfflineJeopardy from source

## Requirements

- Windows 10 or 11 (64-bit). The packaging targets Windows. The web app and server also run in
  development on other systems, but only Windows builds are supported.
- [Node.js 24](https://nodejs.org/) with npm (the release workflow uses Node 24).
- Git.

## Install

```bash
git clone https://github.com/geolaudy/OfflineJeopardy.git
cd OfflineJeopardy
npm ci
```

`npm ci` installs the exact versions from `package-lock.json`, including Electron, the Playwright test
runner and the native image library sharp.

## Run

| Command | What it does |
|---|---|
| `npm start` | Builds the web app and the Electron main process, then starts the desktop app. |
| `npm run dev` | Development mode: the server on port 3000 (data in `./data`) and Vite with hot reload on port 5173. Open `http://localhost:5173/host`, `/board` and `/join`. |
| `npm run serve` | Runs only the game server (no Electron window) with the web app built by `npm run build:web`, for example `npm run serve -- --port=3000 --data=data`. |

The data of a source build is kept in `%APPDATA%\OfflineJeopardy\data` (the desktop app) or in the
folder passed with `--data` (the server). `data/`, `release/`, `dist/` and test output are ignored by Git.

## Test

```bash
npm run typecheck      # TypeScript
npm test               # unit and integration tests (Vitest)
npm run build
npx playwright install chromium webkit   # once
npm run test:e2e       # browser tests: TV, iPad and phone layouts (Chromium and WebKit)
```

The end-to-end tests start their own server on port 3210 with a temporary data folder. Run several
checkouts side by side with `E2E_PORT=3220 npm run test:e2e`.

`npm run screenshots` captures the README screenshots from a demo game into `docs/screenshots/`.

## Package for Windows

```bash
npm run dist           # installer + portable exe in release/
npm run dist:verify    # checks both packages and starts them headlessly
npm run release:local  # typecheck + tests + dist + verify, in one go
```

This produces:

- `release/OfflineJeopardy-Setup-<version>.exe`: NSIS installer (per machine, with shortcuts and a
  firewall rule for private networks).
- `release/OfflineJeopardy-Portable-<version>.exe`: portable build, which keeps its data in
  `OfflineJeopardyData` next to the exe.

The builds are unsigned (`CSC_IDENTITY_AUTO_DISCOVERY=false` in the release workflow). The icon is
pre-built in `build/icon.ico` (`node scripts/make-icon.mjs` regenerates it from `build/icon.png`).

### Optional sound pack

Sound cues are synthesised by default. A local build copies any `.mp3`, `.wav`, `.ogg` or `.m4a` files
from `build/private-sfx/` (ignored by Git) into the app as a sound pack. Only include files you have
the right to use, and never publish such a build. Official releases are built by GitHub Actions without it.

## Release builds

Official releases are built by `.github/workflows/windows-build.yml` when a version tag `vX.Y.Z` is
pushed to `main`. The workflow runs the type check and the unit tests, packages and verifies both
executables, and publishes them with their SHA-256 checksums and the matching `CHANGELOG.md` section.
It can also be started by hand (Actions → Windows build → Run workflow) to get the build files without
a release.
