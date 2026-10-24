# SpellCaster: Wizard Duel — AI Handoff & Living Engineering Log

> **Purpose:** This is the portable source of context for any AI coding assistant (Codex, ChatGPT, Claude, etc.) joining the project midway. Keep this file **inside the repository**, commit changes, and ask every coding assistant to read it before editing code.
>
> **Current focus:** Developer A — webcam capture, local hand tracking, gesture recognition and gesture-event emission.
>
> **Last human-confirmed baseline:** 2026-10-24 (HackTX 2026). **Code progress has NOT been verified.** All unfinished tasks below are **pending/unknown**, not claims of completion.
>
> **Important:** This file cannot update itself. The active developer/AI must update its progress sections after making changes and testing them. Each new AI must inspect the repository rather than trusting stale statements.

---

## 0. READ THIS FIRST — INSTRUCTIONS TO EVERY NEW AI

1. Read this file fully and examine the actual repository (`git status`, `git log -5 --oneline`, top-level folders, `package.json` scripts, existing types, and relevant source files).
2. **Repository code and current tests are the source of truth for what is implemented.** This file describes goals, proposals, and a handoff log. If they conflict, identify the conflict and update the document after checking with existing code/contracts; do not silently overwrite teammates' work.
3. Check **Section 13: Current Status**, **Section 14: Change Log**, and **Section 15: Next Actions** before coding. Explicitly state what is known, unknown, blocked, and about to be changed.
4. **Respect team ownership:** Developer A owns webcam/vision; another developer owns audio/incantations; another owns game rendering/visuals; another owns base integration/backend (roles may shift; check Section 4 and repository ownership first).
5. Favor small, testable increments. First make the camera display reliably, then landmarks, then gestures, then discrete gameplay events.
6. Keep gesture recognition isolated from Phaser, Socket.IO, damage calculation, and speech recognition. Export typed events/functions. A separate integration layer maps these to game commands.
7. Don't invent API signatures, dependencies, endpoints, commands, or existing files. Inspect the package versions and official library typings before changing APIs.
8. After every significant change: run relevant checks, capture exact results, update status/next steps, and summarize which files changed. Do not mark untested features as complete.
9. Do not expose API keys, upload raw webcam footage, or send camera frames across the network. Webcam inference should run locally in the player's browser.
10. The user is focused on winning **HackTX 2026 Jester's Court — Most Entertaining (PS5)**. Prioritize a polished, live, judge-playable 60–90-second duel over engineering extras.
11. The user explicitly **removed SerpApi from the game**. Do not reintroduce it unless asked.
12. Keep responses direct and practical. When working on video, avoid drifting into teammates' audio/visual/networking implementations.

### Copy/paste bootstrap prompt for a new AI

```text
Read SPELLCASTER_AI_HANDOFF.md completely. Inspect the current repository, including git status, recent commits, client/server folder structure, package scripts, and gesture-related files. Treat the code as source of truth for implementation status. I am Developer A and currently own video capture, MediaPipe hand tracking, gesture detection, calibration/debug UI, and typed action events. Do not modify teammates' audio, Phaser visuals, or Socket.IO server code except when an explicitly approved integration contract requires it. Before changing code, summarize current state and identify the next small executable milestone. Then implement it, run available checks, and update Sections 13–15 of SPELLCASTER_AI_HANDOFF.md with accurate progress, decisions, and remaining issues. Keep the scope hackathon-sized and demo-reliable.
```

---

## 1. Project Identity and Competition

- **Project:** SpellCaster: Wizard Duel (working title).
- **Game:** 1v1 browser-based, real-time PvP wizard duel. Each player uses their own laptop/device and webcam to recognize hand gestures. Voice incantations are handled by a separate teammate and should remain optional for a reliable first version.
- **Theme:** Fairytales — magic, wizards, spells, a whimsical arena, humorous defeat effects (e.g. opponent turns into frog or teapot).
- **Primary track:** HackTX 2026 **Jester's Court — Most Entertaining**.
- **Desired prize:** PS5 (listed on the HackTX 2026 opening ceremony slide 83).
- **Hackathon:** 24 hours; slides show hacking from Saturday October 24, 11:30 AM to Sunday October 25, 11:30 AM local time; Sunday judging 2–5 PM. Verify any rule changes with organizers/official notices.
- **Rules referenced in opening slides:** Submit by Sunday 11:30 AM; incomplete projects may be submitted; up to three tracks excluding Best Overall/Novice; code must be written during hacking period. The exact slides, rather than this summary, are authoritative.
- **Demo thesis:** Two people become wizards. They physically cast and block magic in real time. The moment should look exciting and be understandable in seconds.
- **Target demo:** 60–90 seconds, with cameras already permitted and both devices already connected. A team member can challenge one judge to minimize setup.

### Why this matters for engineering

**Entertainment and reliability > number of features.** A flawless two-spell duel with visible hand tracking, crisp projectiles, sound, health changes, and a comedic ending is better than six unreliable spells. The key risks are camera input jitter, audio delay/noise, networking integration, and hurried setup.

---

## 2. Confirmed Direction vs. Proposed Details

### Confirmed project direction (based on team/user discussion)

- Browser game; separate devices; real-time 1v1 PvP.
- React + Vite + TypeScript frontend, Phaser presentation, MediaPipe client-side gesture detection, Node.js + Socket.IO authoritative game coordination.
- Parallel team development: video/gestures (user); audio (teammate); visuals (teammate); base game/integration (teammate).
- Start with an independent camera/gesture module; integrate via small typed action events.
- No SerpApi.

### Proposals to validate with team before locking in

- **Base gestures:** fist, open palm, two-finger/V sign.
- **Fireball:** sustained fist begins charge; transitioning to open palm within a release window emits one `FIREBALL_CAST` action.
- **Shield:** stable open palm *without* a preceding charge emits `SHIELD_START`; releasing the pose emits `SHIELD_END`.
- **Ice/freeze:** stable V sign emits `FREEZE_CAST` (optional stretch feature).
- **Audio:** Voice can enhance spells but should not be required for the first fully working vertical slice.
- **Special event:** Simultaneous attacks can trigger spell clash (visual/server/integration stretch goal; video input may eventually support a `CLASH_PUSH` gesture).
- **Winning:** Health reaches zero, or highest HP when the short round timer expires.
- **Visuals:** Comedic loser transformations and exaggerated spell effects.
- **Spell names, cooldown durations, damage, charge thresholds, room code length, state machine timing, and game art are subject to team agreement.** They are not confirmed implementation facts.

### Open product decisions (keep explicit)

| Decision | Current guidance | Owner | Status |
|---|---|---|---|
| Video events shape and naming | Section 7 proposed interface | Video + integration | **Not yet verified** |
| Hand Landmarker vs Gesture Recognizer | Gesture Recognizer for quick MVP; Hand Landmarker for custom motion rules | Video | **Unconfirmed** |
| Shield activation conflict with fireball release | Resolve via gesture state/context and minimum holds | Video + game | **Proposed** |
| Voice required to cast? | Optional bonus for MVP | Audio + game | **Proposed** |
| Single hand vs both hands | Start single-hand; two-hand ultimate later | Video | **Proposed** |
| Calibration targets | Fist, palm, V sign | Video | **Proposed** |
| Authoritative cooldowns | Server is final arbiter | Base/backend | **Intended** |
| Judge participation logistics | Prejoin both laptops, one judge vs team member | Demo lead | **Proposed** |

---

## 3. Product Experience: Intended Gameplay Loop

1. Player A creates a room; Player B joins on a second laptop.
2. Each grants camera access and passes a quick webcam readiness check.
3. Countdown starts when both ready.
4. Each makes hand gestures to charge/launch spells and raise a shield. Their browser detects the gestures locally and emits semantic events.
5. The integration layer sends validated action requests over Socket.IO. The server checks room/round state, cooldowns, target, and damage. It publishes authoritative outcomes.
6. Phaser shows spell charge, projectile flight, shield impacts, health loss, and win/loss animation.
7. Optional spoken incantations add flair or bonuses. Not a hard dependency for the first playable version.
8. Round ends in approximately 60–90 seconds or at zero HP; show humorous fairy-tale result.

### Intended demo choreography

- **0–10s:** “No controllers — you are the wizard.”
- **10–25s:** Judge sees their palm/fist recognized, teammate demonstrates fireball.
- **25–55s:** Short duel with fireball + shield, visible health impact.
- **55–75s:** Big moment: simultaneous attack/spell clash if implemented; otherwise one well-staged block/counter/finisher.
- **75–90s:** Funny transformation and victory title. If clash isn't stable, do NOT make the entire demo depend on it.

---

## 4. Team Ownership and Merge Boundaries

| Track | Owner | Owns | Should not own |
|---|---|---|---|
| **A: Video / Gestures** | **User** | Camera lifecycle, MediaPipe model initialization, landmarks, gesture classifier/state machine, calibration & debug panel, typed gesture action API | Damage, socket transports, spell audio, Phaser effects |
| B: Audio | Teammate | Microphone permissions, optional word/keyword spotting, audio state, emitted incantation events | MediaPipe hand detection |
| C: Visuals / Phaser | Teammate | Arena, avatars, projectiles, HUD, particles, victory/defeat transformations | Webcam inference |
| D: Base / Integration / Networking | Teammate | Repo base, room flow, Socket.IO server, event routing, combat logic, shared contracts | Implementing gesture heuristics inside server |

> The master plan previously labeled Developer C as networking and Developer D as integration. Current user description says audio, visuals, and base-game teammates. **Actual ownership may differ.** Do not assume the names/letters above map to specific people; agree on paths and contracts before merging.

**Merge strategy:** Commit work in isolated directories/branches. Avoid editing files another teammate is actively modifying. Use narrowly scoped PRs/commits and typed interfaces. Prefer dependency-injection/callbacks rather than importing game logic into the vision module.

---

## 5. Architecture / Data Flow

```text
                        PLAYER A LAPTOP                    PLAYER B LAPTOP
                    ┌──────────────────────┐           ┌──────────────────────┐
Webcam + MediaPipe ──► Video/Gesture module │           │ Video/Gesture module ◄── Webcam + MediaPipe
Mic + speech       ──► Audio input module   │           │ Audio input module   ◄── Mic + speech
                    │  Local input fusion   │           │ Local input fusion   │
                    │  Phaser renderer      │           │ Phaser renderer      │
                    └─────────┬────────────┘           └─────────┬────────────┘
                              │ semantic cast requests            │
                              └──────────────┬────────────────────┘
                                             ▼
                                  Node.js + Socket.IO server
                                   rooms, HP, cooldowns, clock
                                             │
                                   authoritative game events
                                             ▼
                                Both clients render the results
```

**Never send raw video frames to Socket.IO.** Camera frames stay local; send abstract actions such as `FIREBALL_CAST`. For the simplest MVP, the server trusts that recognized gestures came from the client but enforces valid room state/cooldowns; it cannot independently verify that a client physically made the gesture.

---

## 6. Suggested Repository Layout (NOT a claim about existing files)

```text
spellcaster/
├── SPELLCASTER_AI_HANDOFF.md       # This file, tracked in Git
├── package.json                    # Optional npm workspaces/scripts
├── client/
│   ├── package.json
│   └── src/
│       ├── app/                    # Lobby, calibration, arena routes
│       ├── features/
│       │   ├── gestures/
│       │   │   ├── CameraManager.ts
│       │   │   ├── HandTracker.ts
│       │   │   ├── GestureClassifier.ts
│       │   │   ├── GestureStateMachine.ts
│       │   │   ├── GestureController.ts
│       │   │   ├── GestureCalibration.tsx
│       │   │   ├── GestureDebugOverlay.tsx
│       │   │   └── __tests__/
│       │   ├── audio/              # teammate-owned
│       │   ├── arena/              # teammate-owned Phaser/game visual layer
│       │   └── networking/         # teammate-owned integration
│       └── shared/types/
│           └── gestures.ts         # contract: coordinate before editing
├── server/                         # teammate-owned Socket.IO/server
└── shared/                         # common types if agreed by team
```

**Do not create duplicate `shared/types` modules if the repository already has one.** Adapt to actual paths after inspection.

---

## 7. Proposed Gesture Module Public Contract

The exact names should be negotiated with the integration teammate. This is a candidate interface, **not an assertion that it currently exists**.

```ts
export type HandPose =
  | 'NONE'
  | 'FIST'
  | 'OPEN_PALM'
  | 'VICTORY'
  | 'UNKNOWN';

export type GestureAction =
  | 'FIREBALL_CHARGE_START'
  | 'FIREBALL_CAST'
  | 'SHIELD_START'
  | 'SHIELD_END'
  | 'FREEZE_CAST';

export type TrackingStatus =
  | 'CAMERA_OFF'
  | 'STARTING'
  | 'TRACKING'
  | 'NO_HAND'
  | 'ERROR';

export interface GestureActionEvent {
  action: GestureAction;
  localTimestampMs: number;      // performance.now() clock; local only
  confidence?: number;          // optional: only when meaningful
  hand?: 'Left' | 'Right';
}

export interface GestureObservation {
  pose: HandPose;
  status: TrackingStatus;
  confidence?: number;
  hand?: 'Left' | 'Right';
  timestampMs: number;
}

export interface GestureControllerAPI {
  start(video: HTMLVideoElement): Promise<void>;
  stop(): void;
  onAction(callback: (event: GestureActionEvent) => void): () => void;
  onObservation(callback: (event: GestureObservation) => void): () => void;
}
```

### Contract principles

- Distinguish **observations** (frequent, per frame) from **actions** (discrete transitions, only when intentional).
- The game integration layer listens to actions. The debug/calibration UI can listen to observations.
- Never emit a new fireball on every frame of a held fist.
- `FIREBALL_CHARGE_START` is visual anticipation; server decides whether `FIREBALL_CAST` is legal.
- A shield is an interval: `SHIELD_START` then `SHIELD_END`; on camera loss/disconnect, force `SHIELD_END` if active.
- `confidence` from a custom landmark classifier is **your heuristic**, not a model-certified probability. MediaPipe Gesture Recognizer category scores are different.
- Avoid exporting webcam `MediaStream` or raw landmark data into the game protocol. Expose additional frame data only for local debug if necessary.
- Do not use `performance.now()` timestamps for cross-device ordering. Server assigns authoritative timestamps.
- Optional freeze action is not required for the first match.

---

## 8. Developer A — Detailed Video/Gesture Implementation Plan

### Phase A0 — Camera-only spike (highest priority)

**Goal:** A standalone route/component (e.g. `/gesture-test`) shows the mirrored live camera and cleanly handles permissions/errors.

- Request `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })` from a user click.
- Assign the stream to an HTML `<video>` with `autoPlay`, `playsInline`, and `muted`; call `play()` as needed.
- Render mirrored preview (`transform: scaleX(-1)`) for user-friendly positioning. **Only mirror UI**, not geometric coordinates without an explicit transform.
- Stop all tracks and cleanup animation frame / media resources on component unmount and switching devices.
- Handle permission denied, camera unavailable, incompatible browser, and non-secure context. Camera permissions typically require localhost or HTTPS.
- Do not access microphone; audio teammate owns microphone input.

**Acceptance test:** Starts on localhost/HTTPS; preview works; camera indicator turns off after Stop/unmount; a denied permission shows a visible recovery message.

### Phase A1 — Hand tracking with MediaPipe

**Goal:** Render stable 21-point hand skeleton and classify hand presence.

- Install the package/version used by the actual repo: `@mediapipe/tasks-vision` (unless an existing compatible integration is present).
- Choose one initialization path; avoid loading model repeatedly inside React rerenders.
- Load MediaPipe WASM and model assets from reliable URLs or bundled local assets; test actual production/dev path.
- Use Hand Landmarker if you need custom landmark geometry; Gesture Recognizer if built-in fist/palm/V recognition saves time. It is possible to access landmarks through Gesture Recognizer as well.
- Set `runningMode: 'VIDEO'` and `numHands: 1` for the initial MVP unless choosing two-hand abilities.
- Process webcam frames in a `requestAnimationFrame` loop; skip duplicate `video.currentTime` frames and prevent overlapping inference calls.
- Convert normalized landmark positions to overlay dimensions; account for mirrored preview and canvas dimensions.
- Overlay hand points and connections in the local debug view.
- Track fps/inference time approximately; lower input resolution or throttle inference if the main game becomes laggy.

**Acceptance test:** Fist, open palm, and V sign all display stable tracked landmarks; no repeating model initialization; CPU load remains usable while Phaser is active.

### Phase A2 — Pose classifier

**Goal:** Stable semantic pose labels, not raw 21-point landmark arrays.

- Start with MediaPipe's standard gesture categories if available; otherwise implement geometry-based classification using joint angles, tip-to-palm distances, finger extension ratios, and palm-relative normalization.
- Avoid relying on a single raw image-coordinate threshold; hand scale and camera distance vary.
- If using category scores, impose a threshold and label low-confidence outputs `UNKNOWN`.
- Smooth across a short time window (e.g. majority of 5 recent valid frames or stable 150–250 ms; **tune experimentally**).
- Decide behavior for missing hand and ambiguity; use `NONE` and `UNKNOWN` instead of pretending a gesture is stable.
- Prevent left/right hand identity from accidentally flipping gesture semantics. Start one hand unless product explicitly needs two.

**Acceptance test:** Can repeatedly transition `FIST → OPEN_PALM → FIST` without rapid flicker; non-hand frames never cast.

### Phase A3 — Gesture state machine

**Goal:** Convert detected poses into single gameplay actions.

**Proposed state graph:**

```text
NO_HAND / IDLE
    │ sustained FIST
    ▼
FIST_STABLE ── held ──► CHARGING
    │                      │
    └──── cancel on loss   ├── OPEN_PALM in release window ─► FIREBALL_CAST ─► RECOVERY
                           └── lost hand / timeout ──────────► IDLE

IDLE ── sustained OPEN_PALM, no preceding charge ─► SHIELD_ACTIVE
SHIELD_ACTIVE ── palm gone / camera lost ─────────► SHIELD_END ─► IDLE
```

**Design details:**

- Proposed initial thresholds (not fixed): `FIST_STABLE=200ms`, `MIN_CHARGE=300ms`, `MAX_CHARGE=1800ms`, `RELEASE_WINDOW=600ms`, `SHIELD_HOLD=350ms`, `LOCAL_RECOVERY=300ms`.
- Use elapsed monotonic timestamps, not `setTimeout` per frame. Thresholds must be configurable.
- Shield must not accidentally activate when the player opens a palm to release a charged fireball.
- After a cast, require a new fist-to-open transition; do not repeatedly cast while palm stays open.
- `SHIELD_END` must fire on tracking loss, Stop, or state reset if shield is currently active.
- Distinguish local input debouncing from **server-authoritative cooldowns**. Server may reject actions even if locally recognized.
- If freeze is implemented, add a separate recognized pose with its own held-state and re-arm behavior. Do not make it a blocker for fireball/shield.

**Acceptance test:** Ten consecutive fist-release sequences produce exactly ten cast events and no surprise shield events; open-palm-only hold activates/deactivates shield exactly once.

### Phase A4 — Calibration and local debug view

**Goal:** Judge can get started without manual code changes.

- Camera permission button + visible preview.
- Guidance for distance and lighting; confirm one hand visible.
- Simple three-step calibration: show fist, open palm, V sign (last step optional for MVP). Calibration initially checks stability; don't over-promise personalized model training.
- Overlay: current pose, stable duration, hand presence, fps, action log (latest 10), model status, optional confidence.
- Debug keyboard fallback to *simulate gesture actions* for developer/testing only, clearly labeled; coordinate shortcut bindings with teammate so they don't conflict with gameplay keys.
- Add a “Start/Stop Tracking” button and clear error messages.

**Acceptance test:** A teammate unfamiliar with the code can open the route, allow camera, and fire an event within one minute.

### Phase A5 — Integration

- Share event names/payloads with base-game developer; negotiate types before merge.
- Create a small `useGestureController` hook or `GestureInputProvider` if React integration requires it, but keep core classifier and state machine as testable pure TypeScript where possible.
- Demonstrate events in a standalone debug page first, then connect event callback to integration-owned dispatcher (`submitLocalInput` or equivalent, depending on existing repo).
- Do **not** import Phaser sprites or directly call Socket.IO in classifier/state machine.
- Validate camera lifecycle on room navigation, tab switching, browser backgrounding, and reconnect.
- If tracking drops mid-spell, cancel charge safely; if shield is active, close it.

**Acceptance test:** One local input event becomes one game animation/action via the existing integration code; non-video modules work unchanged.

---

## 9. Specific Video API and Algorithm Notes

### Browser safety/compatibility

- `getUserMedia` generally needs secure context (`localhost` or HTTPS).
- `videoWidth/videoHeight` are zero before video metadata is available; guard before inference.
- Inference should not run on multiple parallel animation loops. Use ref/instance lifecycle protections for React Strict Mode development remounts.
- Stop camera tracks when not in use. Don't retain or upload webcam recordings unless the team explicitly designs and consents to such a feature.
- Browser tab backgrounding can throttle animation frames; reset stale gesture state instead of replaying old poses.
- Mirror video for UI. If drawing landmarks over a mirrored preview, mirror the overlay or convert x consistently (`1 - x`); do not double-mirror.
- Early debugging should show inferred pose and landmark skeleton visually so false positives are diagnosable.

### Classifier implementation choice

- **Fast MVP:** MediaPipe Gesture Recognizer's built-in categories for fist, open palm, victory, etc.; tune stable-window behavior yourself.
- **If needed:** Hand Landmarker + custom angle/distance features for finer movement/combos.
- Built-in recognizer scores apply to recognized category; custom geometry thresholds do not produce calibrated probabilities by default.
- Evaluate false detections under bright/dim lighting, various distances, occluded fingers, left/right hand, and camera motion.

### Example pure state-machine signature

```ts
interface PoseSample {
  pose: HandPose;
  tMs: number;
  isTracked: boolean;
}

interface GestureMachine {
  update(sample: PoseSample): GestureActionEvent[];
  reset(tMs: number): GestureActionEvent[];
}
```

Pure state machines enable deterministic replay tests without a webcam or MediaPipe model. Use actual repo interfaces where present.

---

## 10. Cross-Team Integration Agreements to Request

Before wiring final output, ask the teammates to confirm:

1. **Event contract**: exact action names/payload types and which layer emits network messages.
2. **Gesture-to-spell mapping**: fireball/shield/freeze/ultimate final controls; who owns charging VFX.
3. **State timing**: server cooldowns, shield duration, optional charged damage calculation; video state machine just recognizes motions.
4. **UI handoff**: which React route renders camera preview/calibration; how it mounts alongside Phaser.
5. **Mic conflicts**: camera module must request audio `false`; audio teammate handles mic separately. Combined audio+gesture matching belongs in integration, not vision module.
6. **Progress callback**: whether visuals needs a `chargeProgress` observation in addition to action events; keep it local and throttled.
7. **Fallback**: demo operator keyboard simulation; must be explicit and not masquerade as successful gesture tracking.
8. **Devices**: actual laptops, browsers, cameras, lighting, network, and projection plan.
9. **Deployment**: secure origin for webcam; dev server/production asset path for MediaPipe WASM/model assets.

---

## 11. MVP Scope, Stretch Goals, and Cut List

### P0 — Must work before any feature expansion

- Two laptops can load a duel and join the same room.
- Local webcam hand-tracking works on each laptop.
- Fist-to-open-palm triggers one intentional fireball event.
- Open-palm-only shield is recognized without double-triggering fireball.
- Server recognizes valid action; both clients see the result; HP/match result are synchronized.
- Short, repeatable demo with clear sound and visual feedback.

### P1 — Entertainment polish

- Fireball charging glow, projectile/impact effects, shield shatter, hit feedback.
- Voice incantation bonus or shout for theatrics, only if reliable.
- Frog/teapot transformation and victory title.
- Calibration/loading screen with helpful messages; polished spectator view.

### P2 — Only when P0/P1 are stable

- Two-finger freeze spell.
- Two-hand ultimate.
- Simultaneous beam/spell-clash tug-of-war.
- Advanced user-specific calibration.
- Additional arenas, ranked matchmaking, accounts, persistent statistics.

### Hard cuts under deadline pressure

Cut **advanced pose combos, ranked matchmaking, replay recording, arbitrary AI spell generation, extra combat classes, database work, and complex reconnection** before compromising a reliable duel. No SerpApi.

---

## 12. Verification Matrix / Definition of Done

Mark these only after actually testing them; record environment and commands in the log.

| Check | Pass criteria | Status |
|---|---|---|
| Camera grant | User interaction opens live preview | Not verified |
| Camera denied | Clear error/retry UX, no crash | Not verified |
| Camera cleanup | LED/track stops after Stop or route leave | Not verified |
| Landmark overlay | Tracks a hand continuously for 30s | Not verified |
| Pose recognition | FIST/PALM identified repeatedly | Not verified |
| Debounce | No rapid alternating classifications at rest | Not verified |
| Charge/cast | 10 valid release sequences → 10 casts | Not verified |
| Shield lifecycle | One start/end per deliberate hold | Not verified |
| Loss/recovery | Losing tracked hand cancels actions safely | Not verified |
| Two-laptop test | Actions visibly synchronize on both machines | Not verified |
| Audio coexistence | Camera module does not seize mic/input from audio module | Not verified |
| Demo | Judge can join or prejoined play for 60–90 seconds | Not verified |
| Typecheck/build | Team's documented commands pass | Not verified |

### Suggested tests

- Pure state-machine unit tests with timestamped pose samples: normal fireball, open-palm shield, dropout while charging, dropout while shielding, rapid pose jitter, repeated static fist, change of tracking hand.
- Browser manual tests: webcam on/off, permissions denied, reload, route change, Chrome/Safari if relevant, second laptop, bright/dim room.
- Performance: FPS and input latency on the slowest actual demo device; maintain usable responsiveness while Phaser renders.

---

## 13. Current Status — UPDATE AFTER EVERY WORK SESSION

**Status as of creation (2026-10-24):** The user supplied a *master engineering plan* and assigned video work to themselves. No current codebase or Git commit was provided in this chat; this document does **not** attest that Phase 0 scaffolding or Phase A0–A5 exists.

| Area | State | Evidence / next verification |
|---|---|---|
| Repo initialized | **Unknown** | Inspect repo; identify remote/branch |
| Phase 0 scaffold | **Unknown** | Inspect `client/`, `server/`, scripts |
| Multiplayer room flow | **Unknown** | Ask integration teammate or run app |
| Gesture module | **Implemented; manually tested by user; not wired to arena** | `client/src/gesture/`, route `/gesture-test` on branch `video-testing` |
| Camera preview | **Not verified** | Manual browser test |
| MediaPipe model | **Not verified** | Inspect dependencies and live recognition |
| Gesture state machine | **Not verified** | Inspect implementation and unit tests |
| Voice track | **Implemented on `feat/voice-casting`; live microphone accuracy unknown** | User in the audio chat owns transcription-to-attack mapping. See `client/VOICE.md`; automated tests use synthetic speech callbacks. |
| Phaser visuals | **Owned by teammate; unknown** | Don't edit without agreement |
| Deployment/demo | **Unknown** | Test live two-device setup |

**Active developer:** Developer A (video/gestures; user).

**Current branch:** `UNKNOWN — fill in`

**Current commit:** `UNKNOWN — fill in using git rev-parse --short HEAD`

**Build/test commands:** `UNKNOWN — inspect package.json`

**Known blockers:** Repo contents, available installed dependencies, actual event contract, and teammate merge status have not been provided to this handoff file.

### Audio-owner session update (2026-10-24)

The earlier Developer A status above is historical. In the audio chat the user explicitly
confirmed ownership of speech transcription and mapping it to an attack, in addition
to sound output. This branch combines `origin/main` through `8246b87` (gesture arena)
with the audio slices. Existing game types and `spellInput.cast` remain canonical.
Voice is implemented in `client/src/voice/`, mounted in `DuelScreen`, and isolated from
camera code and server combat rules. The later user request enables automatic microphone
permission/setup and continuous listening, with immediate interim-command dispatch for
incendio/protego/glacius/fulmen. Automatic processing prefers an installed local model
and otherwise uses the browser service, disclosed in the UI. On-device-only mode stays
local. No real microphone recording or live provider latency/accuracy was tested.

---

## 14. Append-Only Engineering Change Log

> Use newest entry at top. Every AI coding session should add a dated entry after implementation, even if incomplete. Never fabricate tests, commits, or results.

### [2026-10-24] Automatic listening and interim-command latency fix

- **Branch:** `feat/voice-casting`, following `e0cfa3c`. User requested automatic mic
  permission and listening, only incendio/protego/glacius/fulmen, and removal of roughly
  10-second perceived command delay. This supersedes the earlier one-utterance/opt-in default.
- **Cause addressed:** Old code ignored interim results, waited for browser-finalized text,
  then aborted recognition after each phrase. New continuous/interim mode dispatches in the
  first matching callback, deduplicates consumed word positions/final indexes, and restarts
  ended sessions without another permission request. Same-spell recovery is 400 ms and
  never delays the first request. Combat cooldowns, travel time and authority are unchanged.
- **Files:** `client/src/voice/` (including new `browser.ts`), voice behavior/native-adapter
  tests and combat-browser fixtures, `client/VOICE.md`, README, integration contract, this log.
- **Lifecycle:** Coalesced microphone-permission request with track release; local model
  availability capped at 250 ms; installed-local preference and automatic browser fallback;
  visible Stop/Resume and processing settings; no permission-denial loops, three bounded
  network retries, pause on tab hiding/match end, cleanup on source change/leave.
- **Verification:** `npm test`: 19 engine + 45 audio/voice tests pass. Chrome combat/voice:
  12/12 pass. Edge voice: 8/8 pass. Tests prove same-turn interim dispatch, delayed-final
  deduplication, automatic restarts, permission cleanup and real two-client server HP updates
  before a final transcript. Voice UI screenshot inspected. Type checks and production build
  pass; the existing large-bundle warning remains.
- **Limitations:** All microphone/recognition integration tests are synthetic; actual speech
  provider accuracy and microphone-to-text latency are unmeasured. Early interim matches
  can be wrong and cannot undo an already-submitted attack. Use the actual demo device to
  test incantations and ambient noise.

### [2026-10-24] Audio owner: speech transcription mapped to attack requests

- **Branch:** `feat/voice-casting`; includes the first two audio slices and latest gesture integration.
- **Files:** `client/src/voice/{commands,recognition,VoiceControls,voice.css}`, the narrow mount in
  `client/src/hud/DuelScreen.tsx`, `client/tests/audio/voice.test.ts`,
  `client/tests/combat-browser/voice.spec.ts`, `client/VOICE.md`, README/integration notes and this log.
- **Behavior:** Explicit one-utterance listening, displayed interim/final text, one final command
  mapped to fireball/shield/ice/ultimate through `spellInput.cast`. Rejections and damage remain
  authoritative. Unknown/ambiguous speech does not cast. Stop, hidden tab and source cleanup abort
  listening. Browser-service processing is opt-in; no silent remote fallback.
- **Final checks:** `npm test` passes 19 engine + 43 audio/voice behavior tests. `npm run typecheck`
  and `npm run build` pass (existing large-bundle warning). Chrome combat/voice suite passes 10/10,
  including actual two-session online HP updates from synthetic transcripts; the Chrome playground
  regression suite passes 9/9. Edge speech integration passes 6/6. The voice panel was visually
  inspected. No live microphone or external speech service was used by these tests.
- **Corrections during testing:** Resolved route merge conflicts while retaining `/audio-test` and
  `/gesture-test`; fixed unsupported-browser messaging being replaced by idle cleanup, and named
  the voice status separately from the transcript's implicit output status.
- **Remaining:** Native speech-service/language-pack availability, real microphone permissions,
  recognition accuracy, cross-talk and physical microphone release need demo-device validation.

### [2026-10-24] Initial portable handoff created

- **Actor:** AI planning assistant, no codebase examined.
- **Scope:** Consolidated user-approved game direction, HackTX prize constraints, video-track plan, interfaces, acceptance criteria, and handoff procedures.
- **Files changed:** `SPELLCASTER_AI_HANDOFF.md` (document only, initially outside repo).
- **Tests run:** None; no repository was supplied.
- **Open items:** Inspect actual repository; confirm shared event contract and video implementation path.

### [2026-10-24] Phase A0–A3 gesture module + /gesture-test page (branch `video-testing`)

- **Files:** `client/src/gesture/{types,poseClassifier,gestureStateMachine,GestureController}.ts`, `client/src/views/GestureTestView.tsx`, route in `client/src/App.tsx`, styles appended to `client/src/styles.css`, dependency `@mediapipe/tasks-vision@0.10.21` (exact).
- **Decisions:** Hand Landmarker (not Gesture Recognizer) + custom scale-invariant classifier (tip-vs-PIP distance from wrist). 5-frame majority smoothing. Added `FIREBALL_CHARGE_CANCEL` action to the Section 7 contract so the game never shows a dangling charge. Shield has 150 ms grace for flicker. WASM loads from jsDelivr and the model from Google storage, so a network connection is needed at first load. Vendor both into `client/public` before the demo.
- **Tests/commands actually run + outcomes:** Pure state-machine scenario script: 10 fist→palm cycles = 10 casts / 0 shields; palm-only hold = exactly one SHIELD_START/SHIELD_END; quick fist tap = no actions; over-long charge = START+CANCEL and no shield; noise only = no actions. `vite build` OK. `tsc -b` shows 3 pre-existing errors in `App.tsx` lobby / `socket.ts` (also on `main`), none in gesture code.
- **NOT verified:** anything with a real camera: permissions, denied-permission UX, LED turning off on Stop, classifier accuracy/lighting, fps.
- **Next small actionable step:** Open `http://localhost:5173/gesture-test`, run the Section 12 camera checks, tune `EXTENDED_RATIO`/timings from real data.

### [2026-10-24] Spell preview mock + merged teammates' main (PR #1, #2) into `video-testing`

- **Files:** `client/src/views/SpellPreview.tsx` (throwaway CSS duel mock on `/gesture-test`, driven by gesture actions). Merge conflicts resolved in `client/src/App.tsx` (kept `/practice` and `/gesture-test` routes) and `client/src/styles.css` (took teammate's theme rewrite, re-appended `.gesture-test`/`.spell-preview` rules). Untracked generated `client/tsconfig.tsbuildinfo` (already in `.gitignore`).
- **Tests/commands actually run + outcomes:** `npm run typecheck` clean; `npm test` 19/19 engine tests pass; `npm run build` OK. Two-client socket smoke test (before PR #1) passed: create/join/ready/countdown, cast dealt 20, immediate recast rejected for cooldown. User manually confirmed gestures work on `/gesture-test`.
- **Integration findings:** Teammates' single input entry point is `spellInput.cast(spell)` in `client/src/game/input.ts`. Spell IDs are now `fireball | shield | ice | ultimate`. The **shield is a one-shot cast** (900 ms guard, 5 s cooldown), not a held interval, so the gesture shield should become a quick palm "pop" instead of a hold.
- **NOT done:** gestures are not yet wired into the arena; calibration not built; MediaPipe assets not vendored.
- **Next small actionable step:** Wire `FIREBALL_CAST` → `spellInput.cast("fireball")`, palm pop → `spellInput.cast("shield")`, peace sign → `spellInput.cast("ice")`, and mount the camera alongside the duel screen.

### Template — duplicate below on each work session

```md
### [YYYY-MM-DD HH:MM TZ] <brief milestone>
- Actor / AI:
- Git branch / commit (before → after):
- Files changed:
- What was implemented:
- Decisions made / contract changes:
- Tests/commands actually run + outcomes:
- Manual demo checks + outcomes:
- Known bugs / limitations:
- Remaining blockers:
- Next small actionable step:
```

---

## 15. Next Actions — KEEP CURRENT

### Audio / speech owner

1. On the actual demo laptop, allow the automatic microphone request. Automatic mode uses
   an installed local English model or the browser speech service. Verify that the local
   model is actually selected if low provider latency is essential; no download blocks startup.
2. Rehearse incendio/protego/glacius/fulmen continuously and record speech-to-first-text delay,
   command dispatch, accuracy and duplicates. Test Stop/Resume, denied permissions, tab hiding,
   rematch, route leave and microphone indicator behavior. Use headphones or one room output.
3. Continuous recognition and early interim dispatch are implemented; live provider behavior,
   noise/cross-talk and provisional-word errors still need validation. Voice power-ups and
   gesture-plus-voice bonuses remain separate integration work.
4. Playback countdown/victory cues remain the next output slice; do not confuse it with speech input.

### For the next Developer A work session

1. Check out current repo and read this handoff.
2. Inspect actual `client` structure and dependencies. Read the interface that the integration teammate wants.
3. If absent, add a **standalone camera test page** with `getUserMedia`, permission handling, mirrored preview, Start/Stop, and cleanup. Do not modify game/network/audio modules.
4. Test locally; capture exact errors/commands; log progress.
5. Then add MediaPipe landmarks; keep gesture events mocked/disabled until tracking works.
6. Send the integration teammate proposed `GestureActionEvent` interface before wiring spells.

### For the team integrator

- Confirm event names, room code contract, how gesture actions enter the shared game loop, and route ownership; do not force Developer A to import Socket.IO directly.
- Make a playable two-device vertical slice before adding extra spells.

### Next-session summary template (fill in, don't guess)

```text
Project: SpellCaster: Wizard Duel (HackTX Jester's Court / PS5)
Current owner/task: Developer A — video/gestures
Repo path + branch + commit:
Current working features (verified):
Current failure/blocker (actual logs):
Files most relevant:
Event contract agreed with teammates:
Commands run + results:
One next step I want you to do:
Constraints: no edits to audio/Phaser/backend ownership without approval; no SerpApi; update SPELLCASTER_AI_HANDOFF.md afterward.
```

---

## 16. How to Keep This File Useful While Switching AIs

### At the start of each session

- Paste the bootstrap prompt from Section 0 or tell the coding assistant: “Read `SPELLCASTER_AI_HANDOFF.md` first.”
- Ask it to inspect actual code status and name any contradictions with the handoff.
- Choose **one** milestone. Don't let the assistant rewrite the entire architecture.

### At the end of each coding session

- Update **Section 13** from actual source files and test runs.
- Append a brief entry to **Section 14**, with exact changed files and any failed commands.
- Replace **Section 15** with next actionable work and blockers.
- Commit the file with the associated code. Suggested commit: `docs: sync handoff after gesture tracking milestone`.
- If no code was changed, still note investigation results without implying implementation.

### After teammates push changes

Run the repo's normal update flow, then have the AI inspect differences before modifying overlapping files. Example commands (only if appropriate for current branch/worktree):

```bash
git status
git log -5 --oneline
git fetch --all --prune
git diff --name-status HEAD..origin/main  # replace origin/main with actual target
```

Do **not** blindly run `git pull` over uncommitted work. First save/commit/stash intentionally. Check whether the shared types, Phaser entry points, audio integration, or networking events changed. Update Section 13 accordingly and flag contract conflicts.

### Document discipline

- Use `DONE / IN PROGRESS / BLOCKED / NOT STARTED / UNKNOWN` and attach evidence for DONE.
- No imaginary benchmarks or “tests passed” without running them.
- If the architecture changes, update affected sections, not just the latest log entry.
- The team should establish a single canonical copy in the repository; avoid parallel conflicting copies.
- This is a **living manual checkpoint**, not a background agent or automatically synchronized document.

---

## 17. External Reference Pointers

- HackTX 2026 Opening Ceremony PDF (user-provided source, especially slides 4, 15–17, 83, 88). Keep the document in your own accessible project materials if needed.
- MediaPipe Tasks Vision (web): <https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js>
- Hand Landmarker (web): <https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js>
- `getUserMedia` (MDN): <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>
- Socket.IO rooms (for the integration teammate): <https://socket.io/docs/v4/rooms/>

**Source caveat:** These are reference URLs; the coding assistant should confirm the API version matching the project's installed dependencies. The provided HackTX slide deck defines competition-specific facts; everything else in this file that isn't observed code is a recommendation or design assumption.
