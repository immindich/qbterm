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
- `table.tsx` — Torrent list table with sorting, scrolling, and selection
- `info.tsx` — Torrent detail view with tabs (Properties, Content, Peers)
- `format.ts` — Display formatting utilities (bytes, duration, progress, state)
- `add-torrent-form.tsx` — Form for adding torrents by URL
- `login.tsx` — Login form
- `form.tsx` — Reusable form component (text inputs and checkboxes)
- `checkbox.tsx` — Checkbox input component
- `config.example.toml` — Example configuration file
- `bench/` — Performance benchmarks (see Benchmarking)

## Architecture

The app uses a mode system (`normal`, `sorting`, `add-torrent`, `info`) managed in `app.tsx`. Data is fetched via incremental polling (`getMainData` with RID) every 1s. The info view has its own tab system with `usePolling` for per-mode data fetching at 5s intervals.

Table columns support fixed widths (`width: number`) or variable widths (`width: { min: number }`) that grow to fit content.

## Benchmarking

`bench/` measures the TUI against a fake qBittorrent server (`bench/fake-qbt.mjs`) that serves N torrents, about a third of which change speed on every poll. The scripts run the built app (`dist/main.js`) in a detached tmux session and clean up after themselves.

When a change could affect performance (polling, the `setState` merge in `app.tsx`, sorting or rendering in `table.tsx`, anything that runs per torrent or per poll), run `npm run build`, then `bench/cpu.sh` before and after the change and compare:

```bash
bench/cpu.sh                    # CPU time over 20s at 0, 500 and 2000 torrents
bench/cpu.sh 10 100 5000        # custom duration (seconds) and torrent counts
bench/profile.sh 2000 20        # V8 CPU profile; prints hottest functions, keeps raw profile in bench/profiles/
bench/terminal-output.sh 500 10 # bytes written to the terminal and number of full-screen clears
```

What to look for:
- CPU should stay roughly flat as the torrent count grows. A jump between 500 and 2000 torrents usually means something is O(n²) per poll; use `bench/profile.sh` to find it.
- For reference, after the merge fix: about 2–3% CPU at 0–2000 torrents (about 0.4–0.7 CPU-s over 20s).
- The scripts use React's development build unless you set `NODE_ENV=production`. That cut total CPU by about a third at 2000 torrents, so compare runs with the same setting.
- The scripts must run from inside the project, because the mise `node` shim only resolves there.

## API Documentation

We connect to qBittorrent with the WebUI API. The documentation can be found [here](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).

## Conventions

- Use TypeScript with strict mode
- Use ESM (`import`/`export`)
- Entry point is `main.tsx` (compiles to `dist/main.js`)
- Run `npm test` to typecheck without emitting
