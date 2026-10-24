# Core scaffold and duel implementation record

## Goal

Create a shared foundation for a two-player real-time duel and a playable online/practice loop so UI, gesture, spell-visual, and audio work can integrate against stable room, match, and event contracts.

## Repository layout

- `client/`: React, Vite, TypeScript, routing, online/practice views, React HUD, Phaser arena, Socket.IO client, and input bridge.
- `server/`: Express and Socket.IO server, room slots, recovery grace period, per-room authoritative match runner.
- `shared/`: room and network event types, deterministic game engine, config, and training bot.
- `docs/`: game/design and implementation handoff material, including the original report.

## Implemented

- Five-character room codes; Player A and Player B assignments.
- Five-character room codes, A/B seat assignment, ready state, and match countdown.
- Deterministic shared engine for HP, clock, cooldowns, shields, freezing, projectiles, clashes, ultimate, power-ups, timeout, and sudden death.
- Server-authoritative per-room runners with 50 ms simulation ticks, unique client action ID de-duplication, event batches, and server timestamps.
- 30-second seat reservation and browser session-token recovery after refresh/reconnect.
- Opposing player layout, Phaser spell/arena effects, React HUD, keyboard fallback, local training bot, and hotseat practice mode.
- Shared event/types, plus a `spellInput` bridge for UI, gestures, and optional voice input.

## Known boundaries / next work

- Gesture inference/camera permission are not yet integrated on this branch; camera calibration is still a shell.
- Voice, production audio, operator reset, and the report's held-pose beam-clash tug-of-war remain follow-on work. Current projectile clashes use a deterministic launch window.
- Seat token recovery works when the player rejoins with the same room code during the grace period; automatic reconnect and disconnect/pause policy still need UX decisions.
- The arena art/effects are functional placeholders and will be replaced or polished by the visual work while preserving engine events and fixed player sides.
- Server state is in memory and is intended for a single hackathon process, not persistent competitive service.
- The arena art is a placeholder; visual and audio developers should replace it while preserving the fixed-side coordinates and event contract.

## Build / run

From the repository root, run `npm install`, then `npm run dev`. Use `npm run build` to build shared types, server, and client in order. The server also exposes `/health`.

