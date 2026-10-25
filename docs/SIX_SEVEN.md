# 6–7 collision challenge

Matching fireballs or ice spells randomly start either the 6–7 challenge or the existing five-pose race. The 6–7 challenge replaces opening and closing a fist, using the same authoritative struggle scoring, bot, networking, winners, draws, and combined-damage projectile.

Rock your forearms up and down with palms facing upward. A wrist moving from below its elbow to above it scores one beat. Either arm works; lifting both together scores one beat. The hand shape is a visual cue: the detector uses elbow and wrist positions. The first observed position establishes a baseline. Keep both elbows and wrists in frame, and step back when the live feedback asks.

The panel includes an animated guide, a camera preview with the game's glowing golden hand/finger skeleton extended through the wrists, elbows, and shoulders, framing feedback, beat counts, advantage bar, and a 6.7-second timer. At the limit, the leading player wins; a lead under the existing draw margin fizzles both spells. Pushing the advantage to the far end wins early. The winner's spell absorbs both attacks and continues toward the loser.

## Controls and recovery

- Camera gestures score the local wizard; in training that is the left wizard.
- SPACE and the local tap button score the local wizard. ENTER and the rival button score the other wizard in training. Each press/tap is a beat; holding a key does not repeat.
- Camera off, blocked access, unavailable tracking, and model loading all leave keyboard and tap controls available.
- Retry 6–7 tracking retries a failed model load. Turning the camera off/on restarts a stopped stream. The counter resets on mode changes, camera restart/loss, hidden tabs, missing landmarks, or gaps over 250 ms.
- Spell gestures are suspended during the challenge. On exit, hands must relax before a spell pose can arm again.

## Tracking

The approach is inspired by [mannygonzalezj7/67counter](https://github.com/mannygonzalezj7/67counter/blob/main/src/PoseCounter.jsx), which uses MediaPipe Pose to compare wrist and elbow height. This integration uses the project's installed `@mediapipe/tasks-vision` version, a preloaded Pose Landmarker Lite, either-arm rising-edge detection, confidence/in-frame checks, a body-scaled dead band, and confirmation over at least two frames and 45 ms. Beats are separated by at least 120 ms; simultaneous lifts cannot double-count. Pose scoring and the hand overlay run at most 20 times per second. Hand detections only draw the skeleton during the challenge; elbow/wrist crossings supply all gesture beats. Pose scoring continues while a hand-overlay detection is in flight.

The model and WASM are served by the app, including in production. Model source: [Google MediaPipe Pose Landmarker Lite, float16, version 1](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task). The face model used by the separate pose race retains its existing loading behavior. Landmark/video processing stays in the browser; only a `STRUGGLE_PUSH` input is transmitted, alongside the game's existing face snapshots.

The wire kind remains `pump` for compatibility with existing clients, event consumers, and the pose-race selection logic. Its player-facing name and motion are 6–7 throughout the collision UI. Server rate limiting remains authoritative.

## Verification

Open `/gesture-test`, enable **Test the 6–7 collision gesture**, and start the camera to try the detector with a live beat counter without needing an opponent or a collision.

`npm test` covers crossings, either arm, simultaneous lifts, jitter, confidence, framing, dropout/reset behavior, timestamp ordering, controller mode routing, model retry, and gestures feeding real engine wins/damage. `npm run test:hosting --workspace @spellcaster/client` covers tap/keyboard scoring, desktop/mobile layouts, wins/draws, pose-race regressions, production model serving, and real model inference on a synthetic camera. Physical webcam accuracy should also be checked in normal room lighting at the intended camera distance.
