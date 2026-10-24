# Audio slice 1: standalone playback

Open `/audio-test` on the Vite client. Click **Enable audio**, then trigger individual
cues or the overlap test. This page needs no game server, room, camera, microphone,
or permission grants. It does not yet connect to combat or change arena audio.

## Ownership and integration boundary

- `src/audio/player.ts`: engine-independent playback, loading cache, master volume,
  mute, an eight-voice cap, cancellation and disposal.
- `src/audio/backend.ts`: browser Web Audio implementation with one lazily created
  context per player, separate sources for overlapping cues, and cleanup on completion.
- `src/audio/cues.ts`: the six cue IDs, asset paths and per-cue gains.
- `public/audio/`: original deterministic placeholder WAV effects; source generator
  is `scripts/generate_audio.py`. No external samples or audio service is required.
- `AudioPlayground.tsx` and its CSS: isolated harness; only `/audio-test` is added to routing.

Example for the next slice (do not instantiate from a render loop):

```ts
import { AudioPlayer } from "./audio/player";

const audio = new AudioPlayer({ baseUrl: `${import.meta.env.BASE_URL}audio/` });
// Call directly from a click/tap handler; camera gestures do not unlock browser audio.
await audio.enable();
await audio.preload();
await audio.play("cast");
audio.setVolume(0.5);
audio.setMuted(true); // affects currently playing voices too
audio.stopAll();      // also cancels requests still waiting for loading
audio.dispose();      // final teardown: stop, abort fetches, close context
```

`enable()` and `preload()` resolve booleans. `play()` resolves `played`, `disabled`,
`muted`, `cancelled`, `limited`, or `failed`; browser and asset failures are contained
and exposed in `getSnapshot().error`. Retry enable after browser suspension; failed
asset requests are evicted so individual cues can be retried. No sound backlog is
created while disabled or muted. Stop/dispose invalidates pending play requests.
Successful preload clears previous loading errors. Volume is session-local.

The next slice should map confirmed game events to these cue IDs through one adapter.
Event IDs, match IDs, deduplication and stale-event policies belong at that integration
boundary. Do not trigger effects by polling animation state or assume a missing damage
event means a shield block. The module does not request or monitor microphone input.
If Phaser audio is adopted later, replace the backend rather than running two sound
systems for the same event. Music, voice, persistence, and game-event wiring are deferred.

## Verification

Use Node 22.18+ (or Node 24) for the dependency-free TypeScript behavior tests.
From the repository root:

```sh
npm ci
npm run build --workspace @spellcaster/shared
npm run test:audio --workspace @spellcaster/client
npm run typecheck
npm run build
npx playwright install chromium
npm run test:audio:browser --workspace @spellcaster/client
```

To use installed Chrome or Edge instead of downloaded Chromium, set
`PLAYWRIGHT_CHANNEL=chrome` or `PLAYWRIGHT_CHANNEL=msedge` before the browser test
command (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`). Browser tests start their
own local Vite server on port 4175; no backend is needed.

Behavior tests cover disabled playback, failed/retried unlock, concurrent enable/load,
independent overlapping voices, limiting, mute/volume changes, failed assets/playback,
preloading, pending-request cancellation, teardown and subscriptions. Browser tests
exercise real WAV decoding/playback, output gains, missing/corrupt asset recovery,
blocked unlock recovery, navigation cleanup, fresh disabled state, mobile layout and
asset amplitude/edge checks. Browser tests do not prove subjective sound quality or
physical speaker output. Before a demo, listen at comfortable volume on the actual
speakers and check that cast, shield and hit are easy to distinguish.

The initial scaffold had two implicit-any lobby acknowledgement parameters; this
slice adds existing shared result types to those parameters so client checks pass.
No lobby behavior or server protocol changes are included.
