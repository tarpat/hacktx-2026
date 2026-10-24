# Audio slices 1–2: playback and confirmed combat

Open `/audio-test` on the Vite client. Click **Enable audio**, then trigger individual
cues or the overlap test. This page needs no game server, room, camera, microphone,
or permission grants. Practice and online duels now have their own **Enable duel audio**
button, mute toggle and volume slider. Each screen owns its own audio context and settings.

## Ownership and integration boundary

- `src/audio/player.ts`: engine-independent playback, loading cache, master volume,
  mute, an eight-voice cap, cancellation and disposal.
- `src/audio/backend.ts`: browser Web Audio implementation with one lazily created
  context per player, separate sources for overlapping cues, and cleanup on completion.
- `src/audio/cues.ts`: the six cue IDs, asset paths and per-cue gains.
- `public/audio/`: original deterministic placeholder WAV effects; source generator
  is `scripts/generate_audio.py`. No external samples or audio service is required.
- `AudioPlayground.tsx` and its CSS: isolated harness; only `/audio-test` is added to routing.
- `combat.ts`: a single adapter from the confirmed `DuelSource` event stream.
- `CombatAudioControls.tsx`: mounts the adapter/player, unlocks playback from a click,
  and tears both down when leaving the duel or changing sources. `DuelScreen` mounts
  these controls and disables Phaser audio so two sound engines do not run together.

Standalone player example (do not instantiate from a render loop):

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

## Confirmed combat integration

`connectCombatAudio(source, player)` subscribes once to the same confirmed stream used
by the HUD and visuals. It works with server-backed `OnlineDuel` and engine-backed
`LocalDuel`. No input, acknowledgement, health comparison, animation polling or
independent collision logic triggers audio.

| Confirmed event | Cue |
| --- | --- |
| `SPELL_CAST` / `fireball` | `cast` |
| `SPELL_CAST` / `shield` | `shield` |
| `SPELL_BLOCKED` | `block` |
| `DAMAGE_APPLIED` with positive amount | `hit` |
| Rejections, state-only updates, other events | Silent |

Ice/ultimate casts, countdown, match-end stingers, announcer lines and music are deferred.
The generic block/hit cues still reflect confirmed outcomes from any current spell.
A fully blocked fireball has no damage cue because the engine emits no damage event.
An ultimate that partly penetrates a shield correctly produces both block and hit.

Event IDs are monotonic within the existing engine, so the adapter uses a constant-memory
watermark. It sorts a copy of each batch, never changing the renderer's array. Events
older than 1.5 seconds, from before attachment, or with invalid/future times are dropped.
The player checks the same deadline after loading to prevent obsolete cues after a slow
download. Events received while sound is off/muted are consumed without a later backlog.

The current shared protocol has no match ID. Observing a new countdown (phase change or
different countdown deadline) starts a fresh event-ID epoch and cancels outstanding
audio. Older snapshots cannot rewind that epoch. This relies on the existing ordered
`MATCH_STATE` stream delivering the new countdown; if the protocol later permits skipping
it across matches, the gameplay owner should add an explicit match ID. No protocol or
combat-rule changes are included in this audio slice. Full reconnect/reset UX and match
lifecycle sounds remain slice 3 work.

For a shared-room demo, enable output on one audience-facing device and mute the other
laptop speakers. Separate headphone play can enable both devices independently.

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
npm run test:audio:combat --workspace @spellcaster/client
```

To use installed Chrome or Edge instead of downloaded Chromium, set
`PLAYWRIGHT_CHANNEL=chrome` or `PLAYWRIGHT_CHANNEL=msedge` before the browser test
command (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`). Playground browser tests start
Vite on port 4175 without a backend. Combat browser tests start Vite on 4176 and the
real game server on 3185, create two separate browser sessions, join a room, ready up,
cast/block/take damage, and observe real buffer-source playback on both clients.
Those ports must be free. `npm test` runs the engine and audio behavior suites.

Behavior tests cover disabled playback, failed/retried unlock, concurrent enable/load,
independent overlapping voices, limiting, mute/volume changes, failed assets/playback,
preloading, pending-request cancellation, teardown and subscriptions. Browser tests
exercise real WAV decoding/playback, output gains, missing/corrupt asset recovery,
blocked unlock recovery, navigation cleanup, fresh disabled state, mobile layout and
asset amplitude/edge checks. Browser tests do not prove subjective sound quality or
physical speaker output. Before a demo, listen at comfortable volume on the actual
speakers and check that cast, shield and hit are easy to distinguish.

Combat tests additionally cover event deduplication, consecutive accepted casts,
all rejection reasons, stale/future events, a new countdown with reused IDs, late
snapshot rejection, source cleanup, engine-driven blocked/unblocked exchanges,
partial ultimate blocks, muted event consumption and deadlines during slow loading.
Browser coverage includes hotseat practice, actual two-session online matches,
cooldown rejection, mute without replay, audio-disabled gameplay, missing-asset
recovery and closing the output context on leave.

The initial scaffold had two implicit-any lobby acknowledgement parameters; this
slice adds existing shared result types to those parameters so client checks pass.
No lobby behavior or server protocol changes are included.
