# SpellCaster: Wizard Duel

A real-time 1v1 browser game where two wizards cast spells with hand gestures, block attacks, and compete in camera-based collision challenges. Built for HackTX 2026 with React, Phaser, MediaPipe, and an authoritative Socket.IO server.

## Run locally

Use Node.js 24 (the deployment pins 24.13.1) and npm.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The development command builds and watches the shared package, starts the game server on port 3001, and starts Vite on port 5173.

For gesture controls, allow camera access and keep your hands visible in good lighting. Camera access requires localhost or HTTPS. Keyboard and on-screen spell buttons are available for ordinary combat; collision challenges have their own camera requirements below. The app does not request a microphone.

## Play

- **Online:** create a duel, share the five-character room code, complete calibration, and ready both players. After the match, both players request a rematch.
- **Practice** (`/practice`): duel an easy bot locally.
- **Training** (`/practice?mode=training`): control both wizards using separate key sets or spell buttons. Use **Magic charge** and **Pose race** to rehearse collision challenges. Old `?mode=hotseat` links open training.
- **Gesture test** (`/gesture-test`): inspect hand recognition and test circle tracing.

Online and bot matches select uniformly from three arenas, with a fresh independent selection on each rematch. Training uses the default arena.

### Spells and controls

| Spell | Gesture | Your keys | Training rival | Default effect |
| --- | --- | --- | --- | --- |
| Incendio | Make a fist, then open your hand | `Q` | `U` | 20 damage; 4.5 s cooldown |
| Protego | Raise both palms toward the camera | `W` | `I` | Block for 1.2 s; 4 s cooldown |
| Glacius | Hold a peace sign | `E` | `O` | 10 damage, freeze attacks for 1.2 s; 9 s cooldown |
| Taurus | Raise index and pinky fingers | `T` | `[` | 15 damage, breaks shields; 7 s cooldown |
| Fulmen | Point upward, then lower your finger | `R` | `P` | 30 damage; requires a full ultimate meter; deals half damage through shields |

Hits, blocks, and damage taken charge the ultimate meter. The engine also supports Empower (+50% on the next attack), Haste (cooldowns ×0.6 for 6 s), and Heal (+15 HP), with a shared 12 s power-up cooldown per player. These are available through the input bridge; number keys are not bound to power-ups.

### Match rules and collisions

Each wizard starts with 100 HP. A 3 s countdown precedes a 60 s round. Higher HP wins when time runs out; tied rounds enter 15 s sudden death, where the next hit wins, followed by a draw if neither player lands a hit.

Opposing fireballs and ice spells launched within 500 ms can collide; Taurus and Fulmen bypass collisions. Different spells resolve by damage: the stronger continues with the difference. Matching spells randomly select one of two challenges with equal probability:

- **Charge your magic:** point your index finger toward the screen and trace the golden circle. Your best completed trace during 15 s wins. Accuracy contributes 80% and speed 20%; rounded-score ties use accuracy, then completion time. This challenge requires the camera; keys and taps do not score. See [circle tracing rules](docs/MAGIC_CHARGE.md).
- **Pose race:** after 3 s preparation, match five reference poses in order within 25 s. The first player to finish wins the combined spell damage; if neither finishes, both spells fizzle. Combat timers pause during the race. Online play requires camera tracking; local practice offers an explicit keyboard assist. See [pose race rules](docs/POSE_RACE.md).

Combat defaults live in [`shared/src/game/config.ts`](shared/src/game/config.ts).

## Development and validation

```sh
npm test                 # shared engine, server integration, and gesture tests
npm run typecheck        # TypeScript checks across workspaces
npm run build            # production build of shared, server, and client
npm start                # serve the built app and multiplayer on :3001
```

After building, run the production hosting browser checks with:

```sh
npm run test:hosting --workspace @spellcaster/client
```

These require Playwright Chromium (`npx playwright install chromium`), or an installed browser selected with `PLAYWRIGHT_CHANNEL=chrome` or `msedge`. Automated tests cover synthetic gesture inputs; real camera recognition still needs validation with people and the intended lighting.

### Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Game server port; defaults to `3001` |
| `DEV_SERVER_URL` | Vite's development proxy target when the server runs elsewhere |
| `VITE_SERVER_URL` | Client server URL for a separate backend; leave unset for same-origin hosting |
| `CLIENT_ORIGIN` | Comma-separated allowed frontend origins when hosting the client separately |
| `NODE_ENV=production` | Require the built client when starting the server |

## Deploy

[`render.yaml`](render.yaml) configures a single Render Node Web Service that serves both the built game and Socket.IO. Deploy from `main` with:

- **Build:** `npm ci --include=dev && npm run build`
- **Start:** `npm start`
- **Health check:** `/health`

Leave `VITE_SERVER_URL` unset so clients connect to the hosted origin. Rooms and matches live in process memory, so use one server instance; restarts and redeploys clear them. See [deployment instructions](docs/DEPLOYMENT.md) for verification steps; its deployment-branch references describe the original hosting rollout, and the current source branch is `main`.

## Architecture

| Location | Responsibility |
| --- | --- |
| `shared/src/game/` | Deterministic duel engine, combat configuration, and typed game events |
| `server/src/` | Room sessions, authoritative matches, input validation, and production web hosting |
| `client/src/game/` | Local engine/bot and online socket adapters behind one duel interface |
| `client/src/gesture/` | MediaPipe tracking, gesture recognition, circle tracing, and pose matching |
| `client/src/hud/` | Health, spells, clock, collision challenges, and match results |
| `client/src/arena/` | Phaser arenas, animated wizards, and spell effects |
| `client/src/audio/` | Sound effects and audio controls |

Gesture, keyboard, and button actions share the input bridge:

```ts
import { spellInput } from "./game/input";

spellInput.cast("fireball");
spellInput.cast("taurus");
spellInput.powerUp("empower");
```

The same bridge is exposed as `window.spellcaster` for browser-console testing.

Hand and face inference runs in the browser. The face model requires a connection on first load. Camera face snapshots can be relayed to the rival for in-game portraits; challenge observations and circle paths are sent to the server for scoring. Pose observations are client-reported, so they are not an anti-cheat system. A disconnected player can reclaim their seat within 30 s using the browser's room session token.

## Project references and credits

See [docs/](docs/README.md) for the original report, game design, team assignments, implementation history, and integration contract. Historical planning documents may describe earlier behavior; the source code defines the current game.

Spell effects by [Viktor Hahn](https://v-ktor.itch.io/spell-animations) (CC BY 4.0), [TornadoGames](https://tornadogames.itch.io/magic-sparksattacks-for-the-devs), and [Kenney](https://kenney.nl/assets/particle-pack). Bull run cycle by [reivaxcorp](https://opengameart.org/content/bull-run-cycle) and gallop sound by [Alan McKinney](https://opengameart.org/node/132682) (CC BY 3.0).
