# Game integration contract

This contract reflects the deterministic duel engine currently on the PR branch. The PDF concept report remains design context; `shared/src/game/config.ts` is the source of truth for implemented balance.

## Shared vocabulary

- **Player A** is displayed on the left and **Player B** on the right. The duel has fixed positions; there is no avatar movement.
- Internal spell IDs are `fireball`, `shield`, `ice`, and `ultimate`; displayed incantations are Incendio, Protego, Glacius, and Fulmen.
- Power-up IDs are `empower`, `haste`, and `heal`.
- The server owns the online match engine, clock, health, cooldowns, projectiles, blocks, clashes, and match outcome. Practice uses the same engine locally.
- Keep camera media on-device. Send discrete spell or power-up intents only; microphone
  processing follows the voice settings below.
- Per the audio owner's request, voice automatically asks for microphone permission and
  listens during duels. Automatic mode prefers an installed local model, otherwise uses
  the browser speech service (disclosed in the voice UI). On-device-only mode stays local.
  Raw audio and transcripts are never sent to the game server.

## Client inputs

- `READY_STATUS(ready)` updates one player's ready state. Both ready starts the authoritative `MatchRunner`.
- `JOIN_ROOM(code, sessionToken, callback)` accepts the value in `sessionStorage` under `spellcaster:<ROOMCODE>` to reclaim the same seat during the 30-second grace period. Create and join callbacks return the session token.
- `CAST_REQUEST({ spell, clientActionId }, callback?)` submits a unique spell intent. The optional acknowledgement reports accepted/rejected status; authoritative state and events arrive through `MATCH_STATE`.
- `POWER_UP_REQUEST({ powerUp, clientActionId }, callback?)` submits an incantation power-up.
- UI, gesture, and voice code should normally use `spellInput.cast(...)` and `spellInput.powerUp(...)` from `client/src/game/input.ts`. `DuelScreen` routes those intents to the online or practice source. `client/src/gameActions.ts` is a direct socket helper for UI that explicitly needs it.

## Server state and presentation

- `ROOM_UPDATED` reports room occupancy, connectivity, readiness, and match status.
- `MATCH_STATE(state, events)` carries the authoritative snapshot plus events since the previous snapshot. `state.now` is the server timestamp; use `OnlineDuel.now()` for clock-aligned animation.
- Important event types include `SPELL_CAST`, `CAST_REJECTED`, `SPELL_BLOCKED`, `DAMAGE_APPLIED`, `FROZEN`, `SPELL_CLASH`, `POWER_UP`, `ULTIMATE_READY`, `PHASE_CHANGED`, and `MATCH_END`.
- Phaser and audio modules should react to game events from the `DuelSource` subscription. Do not independently apply damage or decide block/clash results.

### Combat audio

`DuelScreen` mounts `CombatAudioControls`, which connects `client/src/audio/combat.ts`
to the `DuelSource` stream. Confirmed fireball/shield casts, explicit blocks and positive
damage events play cues; intents and rejections are silent. IDs are deduplicated within
the current match; a newly observed countdown resets that epoch. Events older than
1.5 seconds are skipped, including after delayed asset loading. The current contract
must deliver each match's countdown because it has no explicit match ID.

Audio remains optional: the user clicks to enable output, and missing assets or muted
sound do not block combat. Phaser audio is disabled in this screen because the audio
module owns output. See [client/AUDIO.md](../client/AUDIO.md) for tests and ownership.

### Speech input

`VoiceControls` auto-starts `VoiceCaster`, mapping incendio/protego/glacius/fulmen to
`spellInput.cast(spell, source.localSlot)` on the first matching interim result.
Consumed positions and final-result IDs prevent repeat or revised transcripts from
submitting the same utterance again. Recognition remains active across phrases and
restarts after natural endpointing. Native results never apply damage, alter cooldowns
or trigger playback directly. Rejections still arrive through the authoritative stream.
See [client/VOICE.md](../client/VOICE.md) for timing, privacy and lifecycle details.

## Current balance and effects

The defaults are 100 HP, a three-second countdown, a 60-second round, 15-second sudden death, a 900 ms shield window, 1.2-second freeze, and a 350 ms clash window. Fireball deals 20 (3-second cooldown, 900 ms travel); Ice deals 10 (7-second cooldown, 700 ms travel); Shield has a 5-second cooldown; Ultimate deals 30, is meter-gated, and deals half damage through a shield. Power-ups are limited to one per 12 seconds. Treat these as testable defaults, not final balance.
