# Team plan and handoff notes

## Current ownership

Based on the team's current assignment, with four people total:

| Owner | Focus | Integration boundary |
| --- | --- | --- |
| Core/gameplay owner (user) | Fixed-side duel, room and match authority, HP/cooldowns/clock, network protocol, integration and demo flow | Owns canonical match state and event names; coordinates a playable end-to-end slice |
| Developer: UI | Lobby, calibration and in-game UI/HUD elements | Reads canonical room/match events; emits ready state and UI actions through the shared client bridge |
| Developer: audio | Spell sounds and regular/game output | Listens to accepted spell, damage/block, and match-end events; does not infer or apply damage |
| Developer: spell video/visuals | Spell video/visual effects | Listens to accepted spell and damage events; uses fixed A-left/B-right orientation and server resolve timing |

The source report contains an earlier role breakdown with gesture processing, presentation, server authority, and integration. The current ownership above reflects the later team assignment supplied in the project conversation and supersedes that earlier split.

## Integration rules

1. Agree on spell IDs and event payloads before separate modules implement them. Use the types in `shared/src/index.ts` and [INTEGRATION.md](INTEGRATION.md).
2. Each device runs its own camera/gesture inference. Send one discrete action with a unique `clientActionId`; never send camera frames.
3. Use `spellInput.cast(...)` and `spellInput.powerUp(...)` from `client/src/game/input.ts` so online and practice modes share one entry point. Subscribe through `DuelSource` and use its `GameEvent[]` for visual/audio reactions.
4. Keep A on the left facing right and B on the right facing left across the arena, spell trajectories, HUD, and sound/video cues.
5. Integrate a single spell-versus-defense exchange early. Add ice, voice, clash, and show polish after that slice is stable on two devices.

## Suggested sequencing

1. Confirm the end-to-end room, ready countdown, spell request, authoritative damage, and match-end flow.
2. Integrate gestures and local camera calibration with the existing input bridge.
3. Connect spell video and audio to server-confirmed events.
4. Finish onboarding, error/reconnect states, and spectator-friendly readability.
5. Rehearse the short demo repeatedly on the actual devices and venue network; keep fallback behavior clearly labeled.

