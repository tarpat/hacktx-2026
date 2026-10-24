# SpellCaster: Wizard Duel

Phase 0 scaffold for a real-time 1v1 browser duel. The repository uses npm workspaces with a React/Vite/TypeScript client, a Node/Express/Socket.IO server, and shared event/room types.

## Getting started

```sh
npm install
npm run dev
```

The client runs at `http://localhost:5173` and the server at `http://localhost:3001` (`/health` provides a basic health check). Set `CLIENT_ORIGIN` or `VITE_SERVER_URL` when using a different local setup.

## Current flow

The lobby creates a five-character room or joins one by code. The server assigns A/B seats, starts a three-second countdown when both players are ready, and runs a server-authoritative 60-second round with 100 HP per player, spell cooldowns, projectile travel, timed shields, damage, and winner determination. Player A stays on the left facing right; Player B stays on the right facing left. A browser session token reserves the seat for 30 seconds and lets a refreshed client restore its slot and match state. The Phaser scene receives accepted spell events and the HUD follows server HP and clock state.

## Planning documents

See [docs/](docs/README.md) for the preserved source report, game design brief, team ownership, Phase 0 record, and integration contract.

## Phase 0 boundaries

Gesture recognition and camera capture are follow-on work. The arena has keyboard and pointer fallback controls; gesture, UI, and audio modules can share `client/src/gameActions.ts` and the Socket.IO event contract in `shared/src/index.ts`.
