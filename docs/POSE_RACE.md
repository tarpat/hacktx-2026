# Collision pose race

Matching airborne spells use one server-side random draw per collision: below 0.5 starts the [6–7 forearm challenge](SIX_SEVEN.md); 0.5 and above starts a pose race. Different spell collisions retain their damage-based resolution. Both online players receive the same event and sequence.

The race has a three-second preparation period and 25 seconds to finish all five supplied images in order: finger to mouth, tongue out, finger to mouth again, hands together with a gasp, one raised finger with a grin. The grin accepts either an index or middle finger. The first and third images intentionally appear separately. Either hand works. First to finish wins the combined spell damage; if neither finishes, both spells fizzle, even if one player has a partial lead. Online ordering uses server receipt time, so network latency can affect a close finish.

The round clock, existing projectiles, pending collisions, cooldowns and temporary effects pause during the race. Casting and power-ups are disabled. The clock and pending actions resume after the actual race duration, including early finishes.

The race UI shows the current reference beside the camera, a timer, compact player progress, and one changing instruction with a hold indicator. An Options menu contains camera controls, face-tracking retry, hotseat camera assignment and local keyboard assist. Only the current reference image is displayed; all five are still required in order. Camera-off recovery has a direct Enable camera button. The UI also works with the worker-based hand tracker and independent arena clock from main.

## How a monkey reference is matched to a human

These images are visual prompts, not training examples or pixel-similarity templates. Each reference is transcribed into a geometric rule in `client/src/gesture/racePoseMatcher.ts`. MediaPipe Hand Landmarker supplies 21 points per hand; Face Landmarker supplies the face mesh and jaw/smile blendshape scores. Face and hand x/y coordinates share the same unmirrored camera coordinate system, with aspect-ratio correction. Distances are divided by face width, and finger extension uses wrist-to-tip / wrist-to-joint ratios. This tolerates changes in body size, distance and position; it does not require matching the monkey's appearance, background or anatomy. The preview is mirrored only for display.

| Reference | Measurements |
| --- | --- |
| Thinker / Think again | Index fingertip within 0.24 face widths of mouth center, index farther from wrist than middle fingertip, other fingers curled, jaw score below 0.28 and small lip gap. |
| Tongue out | Jaw score above 0.32, lip gap above 0.23 mouth widths, hands clear of the mouth, plus a red/pink region in the lower central mouth crop. |
| Gasp | Open mouth plus two palm centers close together below the mouth and within the chin/chest region. This approximates clasped hands; it cannot verify interlaced fingers under occlusion. |
| Cheeky grin | One index or middle finger with wrist-to-tip / wrist-to-joint distance ratio at least 1.12; other fingers may bend naturally (ratios below 1.25 and at least 0.12 less than the raised finger). Hand-relative depth is included for angled palms. The finger points upward and its tip is near the face, with tolerance below mouth level and above the forehead. Average left/right smile score at least 0.18 accepts a small smile. Open palms, victory signs, fists, ring/pinky-only gestures and neutral expressions do not qualify. |

The grin feedback separately identifies missing hands, extra raised fingers, hand direction, hand position, and a missing smile. If the camera already matches but the server still needs a release, the UI tells the player to lower their hand and try again instead of contradictorily asking them to keep holding. This step intentionally accepts a broad single-finger silhouette instead of requiring an exact anatomical copy. Its server hold/release timing remains the same as the other steps.

The tongue check is a **color heuristic**, not a trained tongue detector. MediaPipe's current 52-expression output has no tongue-out score. The local crop checks how much of the mouth is redder than nearby skin and requires coverage across multiple rows; plain dark open mouths and white teeth do not satisfy it. Red lighting, lipstick, lip occlusion and individual anatomy can still cause false positives/negatives. Bright neutral light and facing the camera help. These thresholds need real participant testing; synthetic tests validate rules, not real-world recognition accuracy.

MediaPipe reference: [Web Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js); [official blendshape list](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc).

## Timing and privacy

Face detection runs at most every 100ms during a race; the face model preloads when the gesture camera starts. GPU initialization falls back to CPU. Camera permission failures, unavailable tracking and model failures show instructions and a retry control. Face and hand tracking use the locally served MediaPipe WASM files. The hand model is self-hosted; the face model still loads from Google's model hosting and requires a connection on first load. Inference, landmarks and mouth pixel checks stay in the browser.

Clients send only `{ struggleId, step, matched: boolean | null }`. The server assigns the player's slot from the socket session, rejects stale events, skipped steps and excessively frequent samples, requires at least 180ms of tracked neutral before each step, then at least 450ms of matching observations. A gap over 350ms or tracking loss resets the hold. Camera loss cannot award points. A new pose requires a fresh release. The winner, progress and spell resolution are authoritative server state. The server trusts the client's match observation; this is not an anti-cheat system and a modified client could fabricate it.

Practice has an explicit keyboard assist (hold/release Space, and Enter for the second hotseat wizard). Assist follows the same timing and sequence rules, disables camera scoring, and is labeled in the UI. Online play never exposes assist. A single hotseat camera can be assigned to either wizard. The local practice bot simulates timed observations; it does not analyze video.

## Validation

`npm test` covers event selection, all five steps, full-sequence victories, stale/skipped/malformed input, release/hold timing, tracking gaps, timeouts, combat pause/resume, and synthetic landmark/color fixtures. `npm run build` checks production compilation. `npm run test:hosting --workspace @spellcaster/client` exercises the built UI and production multiplayer hosting. A physical camera session remains necessary to measure recognition accuracy across people and lighting.
