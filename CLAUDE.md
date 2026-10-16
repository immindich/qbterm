# qbtui

Terminal-based qBittorrent interface.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
- **Module System**: ESM

## Nix Setup

To have access to Node, you need to first run `nix-shell`.

## Getting Started

```bash
npm install
npm run build
node dist/main.js
```

## Configuration

Copy `config.example.toml` to `config.toml` in the project directory and fill in your settings.

## Project Structure

- `main.tsx` — Entry point; config loading, auto-login, session management
- `app.tsx` — Main application component; data polling, mode switching, keyboard handling
- `api.ts` — qBittorrent WebUI API client and types
- `table.tsx` — Torrent list table rendering and scrolling, plus column definitions and sort helpers (sort and selection state live in `app.tsx`)
- `info.tsx` — Torrent detail view with tabs (Properties, Content, Peers)
- `format.ts` — Display formatting utilities (bytes, duration, progress, state)
- `search.ts` — Search matching: names and queries are compared with case, accents and separators removed; every query word must appear in the name
- `search-bar.tsx` — Search input line and the "Filter" indicator shown while a search is applied
- `add-torrent-form.tsx` — Form for adding torrents by URL, magnet link or local `.torrent` file (local files are read and uploaded, so they work with a remote qBittorrent)
- `file-chooser.tsx` — Built-in file browser opened from the add-torrent form; lists folders and `.torrent` files, filtered as you type
- `files.ts` — Path handling for the add-torrent form: telling URLs from paths, unquoting and unescaping pasted or dragged paths, listing folders for the file chooser
- `login.tsx` — Login form
- `form.tsx` — Reusable form component (text inputs, checkboxes and buttons)
- `checkbox.tsx` — Checkbox input component
- `config.example.toml` — Example configuration file
- `bench/` — Performance benchmarks (see Benchmarking)

## Architecture

The app uses a mode system (`normal`, `sorting`, `search`, `add-torrent`, `info`, `confirm-delete`) managed in `app.tsx`. The search query is separate from the mode: `search` mode is only for editing it, and the filter stays applied in the other modes. `App` derives the visible list as torrents → filter → sort → selection. Data is fetched via incremental polling (`getMainData` with RID) every 1s. The info view has its own tab system with `usePolling` for per-mode data fetching at 5s intervals.

Table columns support fixed widths (`width: number`) or variable widths (`width: { min: number }`) that grow to fit content.

## Benchmarking

`bench/` measures the TUI against a fake qBittorrent server (`bench/fake-qbt.mjs`) that serves N torrents, about a third of which change speed on every poll. It also serves the info view's endpoints (properties, files, peers) with fake data that's the same on every run, so it's useful for manual testing too: `node bench/fake-qbt.mjs <torrents> <port>`. The scripts run the built app (`dist/main.js`) in a detached tmux session and clean up after themselves.

When a change could affect performance (polling, the `setState` merge in `app.tsx`, sorting or rendering in `table.tsx`, anything that runs per torrent or per poll), run `npm run build`, then `bench/cpu.sh` before and after the change and compare:

```bash
bench/cpu.sh                    # CPU time over 20s at 0, 500 and 2000 torrents
bench/cpu.sh 10 100 5000        # custom duration (seconds) and torrent counts
bench/profile.sh 2000 20        # V8 CPU profile; prints hottest functions, keeps raw profile in bench/profiles/
bench/terminal-output.sh 500 10 # bytes written to the terminal and number of full-screen clears
bench/scroll.sh 10 30 500 2000  # CPU while holding an arrow key (30 keys/s) vs. idle, at 500 and 2000 torrents
bench/search.sh 10 10 500 2000  # CPU while typing a search query (10 keys/s) vs. idle
```

The scripts use a 200x50 terminal; set `BENCH_COLS`/`BENCH_ROWS` to change it. Ink redraws the whole frame on every render, so rendering cost grows with terminal size.

To compare against an older commit, build it in a worktree and point the scripts at it with `QBT_MAIN`:

```bash
git worktree add --detach bench/tmp/old <commit>
ln -s ../../../node_modules bench/tmp/old/node_modules
(cd bench/tmp/old && npx tsc)
QBT_MAIN=$PWD/bench/tmp/old/dist/main.js bench/cpu.sh
git worktree remove --force bench/tmp/old
```

What to look for:
- CPU should stay roughly flat as the torrent count grows. A jump between 500 and 2000 torrents usually means something is O(n²) per poll; use `bench/profile.sh` to find it.
- For reference, after the merge fix: about 2–3% CPU at 0–2000 torrents (about 0.4–0.7 CPU-s over 20s), and about 13% while scrolling at 30 keys/s (about 9% with `NODE_ENV=production`). Scrolling cost should not depend on the torrent count; most of it is Ink redrawing the full screen on each keypress.
- The scripts use React's development build unless you set `NODE_ENV=production`. That cut total CPU by about a third at 2000 torrents, so compare runs with the same setting.
- The scripts must run from inside the project, because the mise `node` shim only resolves there.

## API Documentation

We connect to qBittorrent with the WebUI API. The documentation can be found [here](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).

## Conventions

- Use TypeScript with strict mode
- Use ESM (`import`/`export`)
- Entry point is `main.tsx` (compiles to `dist/main.js`)
- Run `npm test` to typecheck without emitting
- Run `npm run test:unit` to build and run the unit tests in `test/` (TypeScript, using Node's built-in test runner; compiled to `dist/test/`)
