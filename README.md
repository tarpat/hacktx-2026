# SpellCaster: Wizard Duel

A real-time 1v1 browser duel. npm workspaces: a React/Vite/TypeScript + Phaser client, a Node/Express/Socket.IO server, and a `shared` package holding the event contract and the duel engine.

Matching spell collisions choose 50/50 between fist pumping and a five-image pose race. See [pose matching, rules and limitations](docs/POSE_RACE.md).

Online, bot and training matches choose uniformly from all three arenas (1/3 each), with a fresh independent draw on every rematch. Hotseat keeps a map picker for testing; its saved choice never affects other modes.

## Getting started

```sh
npm install
npm run dev     # shared (watch), server :3001, client :5173
npm test        # duel engine unit tests
npm run typecheck
```

Set `CLIENT_ORIGIN` or `VITE_SERVER_URL` when using a different local setup (for example two laptops on the same Wi-Fi).

## Deploy on Render

The app can run entirely on a Render Web Service: one public URL serves the game and
its multiplayer server. `render.yaml` contains the deployment settings. Build with
`npm ci --include=dev && npm run build`, start with `npm start`, and use `/health` as
the health check. Leave `VITE_SERVER_URL` unset so clients connect to the hosted origin.
See [deployment instructions](docs/DEPLOYMENT.md) for branch selection and verification.

Speech transcription has been dropped. This branch uses the latest game from `main`
and does not automatically request a microphone.

## Playing

- **Online**: lobby → Create a duel / join by code → calibration → ready room → 3-2-1 → duel. After the match both players press Request rematch.
- **Practice** (`/practice`): you versus the training dummy, or `?mode=hotseat` for two players on one keyboard. Also the demo fallback if the network or camera fails.

| Action | Local wizard | Hotseat wizard |
| --- | --- | --- |
| Incendio (fireball) | `Q` | `U` |
| Protego (shield) | `W` | `I` |
| Glacius (ice) | `E` | `O` |
| Fulmen (ultimate) | `R` | `P` |
| Empower / Haste / Heal power-ups | `1` / `2` / `3` | |

## Rules (defaults in `shared/src/game/config.ts`)

- 100 HP each, 3 s countdown, 60 s round. Higher HP wins on time; a tie goes to 15 s sudden death where the next hit wins, then a draw.
- Incendio 20 dmg, 3 s cooldown. Glacius 10 dmg and freezes attacks for 1.2 s, 7 s cooldown. Protego blocks one spell arriving within its 0.9 s window, 5 s cooldown.
- Hits, blocks and damage taken charge the Fulmen meter; Fulmen deals 30 and breaks through shields at half damage.
- Opposing attacks launched within 350 ms clash mid-arena: the stronger spell continues with the difference, equal spells fizzle.
- Power-ups: one per 12 s. Empower (+50% on the next attack), Haste (cooldowns x0.6 for 6 s), Heal (+15 HP).

## Architecture

- `shared/src/game/engine.ts`: deterministic `DuelEngine`. Every call takes the current time, so the same rules run on the server (authoritative) and in the browser (practice). It emits typed `GameEvent`s (`SPELL_CAST`, `DAMAGE_APPLIED`, `SPELL_BLOCKED`, `SPELL_CLASH`, `MATCH_END`, ...).
- `server/src/match.ts`: one `MatchRunner` per room. Starts when both players are ready, ticks every 50 ms, de-duplicates `CAST_REQUEST`s by `clientActionId`, and broadcasts `MATCH_STATE` with a server timestamp.
- `client/src/game/duelSource.ts`: `LocalDuel` (engine + bot in the browser) and `OnlineDuel` (socket, server clock offset) behind one interface.
- `client/src/hud/`: React HUD (health bars, clock, spell tray, power-ups, narrator banner, victory screen).
- `client/src/arena/ArenaScene.ts`: Phaser scene that only renders state and reacts to events.
- `client/src/theme.css` + `client/src/theme.ts`: the fairy-tale palette. Swap hex values there to restyle everything.

## Input integration

Gesture, keyboard and button actions use the shared input bridge:

```ts
import { spellInput } from "./game/input";

spellInput.cast("fireball"); // fist held, then open palm release
spellInput.cast("shield");   // open palm
spellInput.cast("ice");      // two fingers
spellInput.powerUp("empower"); // explicit power-up input
```

It is also exposed as `window.spellcaster` for quick console testing.

## Not done yet

Gesture/camera integration, production audio, automatic reconnect UX, operator demo controls, and the report's sustained-pose beam-clash feature remain follow-on work. Rejoining within the 30-second grace period can reclaim the same seat using the browser's room session token.

## Planning documents

See [docs/](docs/README.md) for the original report, game design, team assignments, implementation record, and current integration contract.
