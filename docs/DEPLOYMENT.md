# Render hosting

This deployment branch starts from `main` commit `f415fbd`. Speech transcription and
automatic microphone capture are scrapped: no voice module, controls or speech-service
calls are included. Latest gestures, platform stages and spell clashes remain intact.

## One cloud service

The Render **Web Service** runs the Node game server and serves the Vite production
build. Players share one HTTPS `onrender.com` URL. Socket.IO connects to that same origin
and upgrades to WSS behind Render's TLS proxy. No laptop server, cloudflared tunnel,
signaling relay, database or separate frontend host is required.

`render.yaml` describes a free Node service with one instance, a pinned Node version,
the build/start commands and `/health` check. The `Procfile` provides the equivalent
start entry for hosts that read it, following DuckTrouble's process-based approach.
DuckTrouble's local tunnel/signaling path is intentionally unnecessary here.

## Create the service

Use the Render dashboard with `https://github.com/tarpat/hacktx-2026` as the repository.
Select **feat/render-hosting** while these changes are on that branch. A Blueprint can
use the checked-in `render.yaml`; manual Web Service settings are equivalent:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | Leave empty (repository root) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Instance type | Free |
| Health check | `/health` |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.13.1` |

Render supplies `PORT`. The server binds `0.0.0.0` on that port. Do not set
`VITE_SERVER_URL` to a laptop or localhost address. Leave it unset for same-origin
hosting. `CLIENT_ORIGIN` is only needed if a separate frontend origin is intentionally
used later; provide comma-separated allowed origins in that case.

A public-repository Web Service can be created without a Git-provider connection;
manual deploys are available in its dashboard. Provider-connected services/Blueprints
can auto-deploy according to `render.yaml`. After merging, change the service's source
branch to `main` so future team work is deployed from the main branch.

## Verify the public deployment

1. Wait for the Render deploy to show **Live** and for `/health` to return `{"status":"ok"}`.
2. Open the public URL on two devices, preferably on separate networks. Create/join a
   room, ready both players and complete a fireball/block/hit exchange.
3. Check the browser connects to the hosted `/socket.io/` endpoint rather than localhost.
4. Refresh `/practice?mode=hotseat` and `/gesture-test` directly; they should load normally.
5. Enable the camera explicitly for real gesture validation over HTTPS. There should
   be no speech panel or automatic microphone request.

Free instances may sleep after inactivity and take time to wake; open and rehearse the
app before judging. Rooms and active matches live in this one process's memory: a
redeploy, restart or sleeping instance loses them. Keep one instance until shared room
storage is implemented. Source: [Render free instances](https://render.com/docs/free),
[WebSockets](https://render.com/docs/websocket).

## Local production check

```sh
npm install
npm run build
npm start
```

Open `http://localhost:3001`; this serves the built game without Vite. Ordinary
`npm run dev` still uses Vite on 5173 with a `/socket.io` proxy to the local server.
`DEV_SERVER_URL` can change the dev proxy target if the backend uses another port.

```sh
npm test
npm run typecheck
npm run test:hosting --workspace @spellcaster/client
```

Browser tests require installed Playwright Chromium (`npx playwright install chromium`),
or `PLAYWRIGHT_CHANNEL=chrome`/`msedge` for an installed browser. Build before running
them. They start the real production server on port 4180 and verify static routing,
refreshes, absence of transcription and two-client multiplayer on the same host.

Server tests use an isolated ephemeral port and production process to verify WebSocket
create/join/ready/cast/damage, operation outside the repository working directory,
static assets/cache headers, correct API/asset 404s, and missing-build startup errors.
