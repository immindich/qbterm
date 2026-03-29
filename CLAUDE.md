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

## Architecture

The app uses a mode system (`normal`, `sorting`, `add-torrent`, `info`) managed in `app.tsx`. Data is fetched via incremental polling (`getMainData` with RID) every 1s. The info view has its own tab system with `usePolling` for per-mode data fetching at 5s intervals.

Table columns support fixed widths (`width: number`) or variable widths (`width: { min: number }`) that grow to fit content.

## API Documentation

We connect to qBittorrent with the WebUI API. The documentation can be found [here](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).

## Conventions

- Use TypeScript with strict mode
- Use ESM (`import`/`export`)
- Entry point is `main.tsx` (compiles to `dist/main.js`)
- Run `npm test` to typecheck without emitting
