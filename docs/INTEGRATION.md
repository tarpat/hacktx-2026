# Game integration contract

The PDF concept report is design context. The current implementation provides the first authoritative gameplay slice described by the team: fixed opposing sides, 100 HP, a 60-second round, ready gate/countdown, accepted spell events, server damage, cooldown timestamps, and match end.

## Shared vocabulary

- **Player A** is always the left-side wizard and faces right.
- **Player B** is always the right-side wizard and faces left.
- Spell IDs are `incendio`, `protego`, and `glacius`.
- The server is authoritative for match phase, HP, cooldowns, spell travel resolution, and winner.
- Camera and microphone media remain local; send discrete actions only.

## Client to server

- `READY_STATUS(ready)` participates in the both-ready gate. The server emits a three-second countdown and starts the round.
- `JOIN_ROOM(code, sessionToken, callback)` accepts the token kept in `sessionStorage` under `spellcaster:<ROOMCODE>` to reclaim the same seat for 30 seconds after disconnect/refresh.
- `CAST_REQUEST({ spell, clientActionId })` submits one spell attempt. Use a new `crypto.randomUUID()` for every attempt. The server rejects duplicate IDs and cooldown violations.
- `DEFEND_START()` / `DEFEND_END()` open and close a short shield window; the server enforces a five-second guard cooldown.
- `client/src/gameActions.ts` exports `castSpell(spell)` and `setShieldHeld(held)` as the shared input bridge for gesture recognition, keyboard fallback, and UI buttons.

## Server to clients

- `MATCH_STATE` / `MATCH_START`: canonical HP, phase, cooldown end timestamps, and server clock timestamp.
- `SPELL_ACCEPTED`: accepted spell, player slot, action ID, and expected resolve time. Use this to trigger Phaser visuals and audio.
- `SPELL_REJECTED`: action ID and human-readable reason.
- `DAMAGE_APPLIED`: canonical resulting HP and damage source/target. Use this for impact, hit reaction, and sound.
- `MATCH_END`: winner (`A`, `B`, or `draw`) and end reason (`knockout` or `timeout`).

## Starter balance

Incendio deals 20 after 850 ms and cools down for 3 seconds. Glacius deals 10 after 500 ms and cools down for 7 seconds. Protego blocks attacks during a 900 ms guard window and cools down for 5 seconds. These are initial values from the report and should be adjusted after two-device play.
