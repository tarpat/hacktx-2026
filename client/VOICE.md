# Voice input: transcription to attack requests

The audio track includes microphone input and transcription as well as playback.
`src/voice/` handles speech; `src/audio/` still handles output independently.

## Try it

1. Run `npm run dev` and open `/practice?mode=hotseat` or join an online duel.
2. After the countdown, expand **Voice casting** and click **Speak a spell**.
3. Allow microphone access if prompted. Say one command, then wait for its final text.
4. The recognized text is displayed, and a recognized command requests the local
   wizard's spell through `spellInput.cast(spell, source.localSlot)`.

| Say | Requested action |
| --- | --- |
| Fireball, fire ball, Incendio | `fireball` |
| Shield, Protego | `shield` |
| Ice, Glacius | `ice` |
| Ultimate, Fulmen | `ultimate` |

An optional `cast` prefix or `please` suffix is accepted. Case, punctuation and spacing
are normalized. Only a whole, single command matches: conversation, negation, multiple
spells, and partial/substrings do not trigger an attack. Ordinary English spell names
are the fallback when the browser mishears fantasy incantations. No fuzzy matching.

One click listens for one utterance and can request at most one spell. Interim text is
shown but never casts. The recognizer aborts after the final result. Click again for
another utterance. There is no automatic microphone restart or always-listening mode.
The server (or local practice engine) still validates cooldowns, freezes, meter and
phase. The status says **Requested**, never claims that an attack was accepted.

## Browser processing and privacy

Voice is off until explicitly started. Local processing is requested by default using
`processLocally = true`; a compatible browser and installed English language pack are
required. If the browser lacks local recognition, no microphone session starts in that
mode. There is no silent fallback to remote recognition or automatic language download.

The user can check **Use browser speech service** before starting. That allows the
browser's provider to process microphone audio, possibly remotely and requiring network
access. The UI discloses this before the microphone starts. The game adds no recording,
transcript storage or transcript upload: only canonical spell intents enter the game
bridge. Chrome/Edge speech availability varies by device, browser policies and provider.

Implementation reference: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Ownership and lifecycle

- `commands.ts`: pure transcript-to-spell mapping.
- `recognition.ts`: injectable recognition interface; browser standard/prefixed
  constructor detection, one-session/one-final semantics, errors, abort and late-event guards.
- `VoiceControls.tsx`: optional React UI and connection to the existing input bridge.
- `DuelScreen.tsx`: mounts voice controls alongside output controls and gesture input.

Stop, closing the voice panel, hiding the tab, leaving the screen, changing sources,
or entering countdown/finished phases aborts recognition. Queued results from an old
session are ignored. Voice controls the local slot only, including hotseat mode; the
other wizard remains controlled by the second keyboard. Camera/MediaPipe ownership
and server combat rules are unchanged. Combined gesture-and-voice bonuses, continuous
listening, speech power-ups and final audio production remain separate future slices.

## Tests and live acceptance

`npm test` includes the engine, playback, combat adapter and voice behavior tests.
`npm run test:audio:combat --workspace @spellcaster/client` includes browser voice
integration tests using **synthetic recognition callbacks**, not a real microphone or
provider. These verify interim/final handling, duplicate finals, command mapping,
local-only default, explicit remote opt-in, permission/unsupported errors, cleanup,
server meter rejection and HP changes on two online browser sessions.

Before the demo, manually verify on the actual laptop/browser/microphone:

- Local language-pack availability or explicit provider opt-in, permission grant/deny.
- Ten intentional phrases per core command, noting transcription accuracy and delay.
- Unknown speech and nearby player/audio output do not accidentally cast during a listen.
- Stop, tab hiding and navigation end the browser's microphone indicator.
- A transcript becomes one accepted/rejected attack on both devices. Use headphones
  or one audience output to reduce speaker/microphone cross-talk.

Automated tests cannot establish live speech-service accuracy or physical microphone
behavior. No live microphone recording or remote transcription was performed by the tests.
