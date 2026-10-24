# SpellCaster: Wizard Duel

Phase 0 scaffold for a real-time 1v1 browser duel. The repository uses npm workspaces with a React/Vite/TypeScript client, a Node/Express/Socket.IO server, and shared event/room types.

## Getting started

```sh
npm install
npm run dev
```

The client runs at `http://localhost:5173` and the server at `http://localhost:3001` (`/health` provides a basic health check). Set `CLIENT_ORIGIN` or `VITE_SERVER_URL` when using a different local setup.

## Current flow

The lobby creates a five-character room or joins one by code. The server assigns A/B seats, relays ready state, and reserves a disconnected seat for 30 seconds. The lobby then leads through a camera-calibration placeholder into a Phaser arena shell with two wizard silhouettes and a HUD wireframe.

## Phase 0 boundaries

Gesture recognition, camera capture, match simulation, combat authority, and persistent session recovery are follow-on work. The recovery grace period reserves the room slot; reconnect token handoff is not implemented yet.
