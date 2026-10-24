# Automatic voice casting

Voice starts with the duel, including its countdown. The browser requests microphone
permission automatically. Allow it once; recognition keeps listening across phrases.
If browser policy requires an explicit interaction or permission was denied, press
**Resume voice** after allowing the microphone. **Stop voice** stops listening and
cancels automatic restarts until explicitly resumed.

| Spoken incantation | Canonical attack request |
| --- | --- |
| incendio | `fireball` |
| protego | `shield` |
| glacius | `ice` |
| fulmen | `ultimate` |

Only these four incantations are recognized (case/punctuation insensitive; optional
`cast` prefix). Ordinary names such as `fireball`/`ice`, fuzzy guesses, substrings,
negation and conversational sentences do not match. A growing transcript containing
only successive incantations can submit each new word once.

## Delay fix

The earlier version waited for a **final** result, then aborted the recognizer after
every command. Browser endpointing could therefore hold a recognized spell until well
after the player stopped speaking. This version uses `continuous=true` and
`interimResults=true`, and submits an exact incantation **inside the first matching
result callback**. It does not wait for silence, a final result, another click, a
network acknowledgement or a timer before dispatching.

Each native result index tracks already-consumed word positions. Repeated interim
updates, a later final, or a revised word at that position cannot fire it again.
Different utterances can cast again; a 400 ms same-spell recovery guard prevents quick
restart echoes without delaying the first request. Server cooldowns remain authoritative.
Words heard during countdown are consumed without becoming delayed attacks after start.

Natural speech-session endings restart automatically (initially 100 ms), retaining the
microphone permission and processing choice. Silence retries back off to at most 2 s;
network errors retry three times with 250/500/1000 ms delays, then require Resume.
Permission/device/policy errors never trigger repeated permission prompts.

`getSnapshot().lastDispatchMs` measures only text-callback-to-request overhead. It does
**not** measure spoken-onset-to-transcript latency. Synthetic tests assert synchronous
dispatch and a delayed final cannot double-cast; these are not live microphone timings.
Cloud/browser recognition may still be slow or inaccurate. Existing projectile travel
time (e.g. 900 ms for fireball) is unchanged.

Early action is provisional: if the browser first recognizes the wrong incantation,
the request cannot be undone when the text is later corrected. Restricting the vocabulary
to four uncommon words, avoiding fuzzy matches, and using local phrase hints where
supported limits that risk. Real venue-noise testing is still required.

## Processing and privacy

The user requested automatic permission/setup and listening. **Automatic** is now the
default: use an already-installed on-device English model when the browser reports one,
otherwise use its speech service. A model-availability lookup is capped at 250 ms and
cached for restarts. No model download blocks the game. Local mode gets incantation
phrase hints when the browser supports them; a failed local engine falls back once
in Automatic mode. **On-device only** never falls back remotely.

The voice panel discloses that Automatic/Browser service modes may send microphone
audio to the browser's provider. No audio or transcripts are recorded, stored or sent
to the game server. The permission-only `getUserMedia` stream releases every track
before recognition starts. Concurrent React Strict Mode setups share the permission
request. The speech service owns its own capture and is aborted on Stop/cleanup.

Use **Speech settings** to choose Automatic, On-device only, or Browser service.
Permission is required on localhost/HTTPS. Support, local models, browser policy and
provider latency vary. API references: [continuous recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous),
[interim results](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/interimResults),
[local model availability](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).

## Integration and lifetime

- `commands.ts`: exact incantations and streaming command parsing.
- `browser.ts`: standard/prefixed native adapter, bounded local availability lookup,
  optional phrase hints and coalesced permission acquisition with track cleanup.
- `recognition.ts`: persistent listening, immediate dispatch, deduplication, restart
  policy, Stop/pause/resume and late-callback guards. Dependencies are injectable.
- `VoiceControls.tsx`: auto-starts during countdown and routes requests through
  `spellInput.cast(spell, source.localSlot)`; it owns no combat rules.

Tab hiding and match end pause listening. Returning to the tab or entering a rematch
resumes it unless the user stopped it. Leaving the screen or changing sources disposes
the old instance. The local wizard is the only voice-controlled slot, including hotseat.
Gesture and output modules remain independent.

## Verification

`npm test` includes engine and audio/voice behavior tests. Run the integration checks
with `npm run test:audio:combat --workspace @spellcaster/client` (set
`PLAYWRIGHT_CHANNEL=chrome` or `msedge` for an installed browser).

Tests use synthetic microphone streams and native speech callbacks: automatic setup,
track release, streaming/interim commands, repeated/final/revised results, a simulated
10-second-late final, same-turn dispatch, restart without another permission request,
model fallback, denied/unsupported cases, Stop/visibility/leave cleanup and actual
two-client online HP updates before a final transcript. They do not use a real speech
provider or establish live recognition accuracy/latency.

Before the demo, rehearse all four incantations on the real browser/microphone. Check
recognized text, speech-to-first-result delay, wrong/duplicate attacks, permission
recovery, microphone indicator cleanup, speaker cross-talk and two-device agreement.
