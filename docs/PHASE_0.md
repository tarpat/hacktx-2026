# Phase 0 — Scaffold and core duel record

## Goal

Create the shared foundation for a two-player real-time duel so UI, gesture, spell-video, and audio work can integrate against stable room, match, and event contracts.

## Repository layout

- `client/`: React, Vite, TypeScript, routing, calibration shell, Phaser arena, socket client, and shared action bridge.
- `server/`: Express and Socket.IO server, room slots, recovery grace period, authoritative match rules.
- `shared/`: room, match, spell, and Socket.IO event types.
- `docs/`: game/design and implementation handoff material, including the original report.

## Implemented

- Five-character room codes; Player A and Player B assignments.
- Ready state, both-ready check, and three-second match countdown.
- 100 HP per player and a 60-second authoritative round.
- Incendio and Glacius projectile travel/damage, per-spell cooldowns, and Protego timed shield window.
- Duplicate action ID rejection, server timestamps, canonical damage events, timeout/knockout winner events.
- 30-second room-seat reservation with a browser session token to reclaim the same slot and restore current match state.
- Fixed opposing player presentation, Phaser spell travel placeholder, server-fed HP/timer HUD, keyboard/pointer fallback.
- Shared action helpers and typed event contract for other client modules.

## Known boundaries / next work

- Gesture inference and camera permission/calibration are not implemented; the calibration view remains a shell.
- Ice currently applies damage; a disabling/lock effect is not implemented.
- Spell-clash, ultimate meter, voice bonuses, transformation/victory sequence, and operator reset are not implemented.
- Reconnect restores a slot during the grace period, but automatic reconnect/rematch UX and pause/disconnect policy still need product decisions.
- Server state is in memory and is intended for a single hackathon process, not persistent competitive service.
- The arena art is a placeholder; visual and audio developers should replace it while preserving the fixed-side coordinates and event contract.

## Build / run

From the repository root, run `npm install`, then `npm run dev`. Use `npm run build` to build shared types, server, and client in order. The server also exposes `/health`.

