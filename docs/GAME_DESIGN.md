# SpellCaster: Wizard Duel — Game design brief

## Product summary

SpellCaster is a browser-based, real-time 1v1 wizard duel. Two players use local webcam gesture recognition to cast attacks and defenses. The server sends discrete game events and owns shared outcomes. The presentation is a readable, fixed-side 2D arena designed for two laptops and a spectator/projector view.

The game should be understandable quickly: two wizards face each other, spells travel across the arena, the HUD makes health and time obvious, and the winner has a clear payoff. The main entertainment is the players' physical performance and reactions.

## Core match rules

- Player A is fixed on the left and faces right. Player B is fixed on the right and faces left. There is no free movement in the MVP.
- Each player starts with 100 HP. A normal round lasts 60 seconds; the original report also considered 90-second rounds for a longer format.
- Both players must be ready before the server starts a three-second countdown.
- The server is authoritative for match phase, HP, cooldowns, spell timing, damage, and victory.
- At 0 HP, the match ends by knockout. At timeout, higher HP wins; equal HP is a draw in the current implementation. Sudden death remains a design option.
- Clients may play a responsive local cast cue, then reconcile the result with server acceptance/rejection. Do not calculate damage independently on clients.

## Starter spells

These are initial tuning values from the concept report, not final balance decisions.

| Spell | Gesture concept | Effect | Initial value |
| --- | --- | --- | --- |
| Incendio / Fireball | Hold fist, then release to open palm | Medium projectile attack | 20 damage, 850 ms travel, 3 s cooldown |
| Protego / Shield | Hold open palm | Brief block window | 900 ms guard, 5 s cooldown |
| Glacius / Ice | Hold two fingers steadily | Light attack / short input lock concept | 10 damage, 500 ms travel, 7 s cooldown |

The exact recognition state machine belongs to the gesture implementation. Prefer stable poses, hysteresis, and a neutral reset to avoid repeated casts from one held gesture. Keep voice optional; the original report recommends it as a possible small bonus rather than a combat dependency.

## Presentation and spectator needs

- Large, high-contrast wizard silhouettes on opposite sides of the arena.
- HP bars, readable timer, cooldown/readiness cues, projectile direction, and obvious hit/block feedback.
- Distinct spell visuals and audio for cast, impact, shield, clash, and victory.
- A fun losing transformation (frog or teapot) is a polish goal after the complete match loop works.
- Keep the camera preview and gesture diagnostics compact so the shared arena remains the visual focus.

## Optional/stretch mechanics

- Spell clash: near-simultaneous attacks meet in the center and begin a shared palm-hold tug-of-war. This is a post-MVP feature because it adds synchronization and balance risk.
- Ultimate attack, incantation bonuses, announcer lines, extra arenas, achievements, and spectator links are stretch scope.
- Do not prioritize accounts, persistence, 3D environments, ranked matchmaking, complex movement, or generative dialogue for the hackathon MVP.

## Demo flow and resilience

The report proposes a 90-second presentation: explain the no-controller premise, bring two judges into a room, show a fireball/block exchange, follow with a counter, then land a decisive visual payoff and short technical explanation. Rehearse on two separate devices. Prepare an explicitly labeled software-input fallback and a recorded backup; never present a recording as live play.

Keep the first exciting interaction close to the start. Prefer a reliable fireball-versus-shield vertical slice over adding optional spells or voice before the core exchange is dependable.

## Privacy and browser constraints

Camera frames and microphone audio should remain local in the MVP; only discrete actions should be sent to the server. Do not record or upload raw media. Camera/microphone access on non-localhost deployments generally requires HTTPS. Voice recognition should remain optional and its processing model disclosed if introduced.

## Success checks

- Two browsers on separate devices join the same room and see consistent match phase, HP, clock, and result.
- A player cannot deal damage locally or bypass server cooldown checks by replaying a request.
- The first attack and a defensive response are understandable to a bystander.
- A full round can finish without developer intervention; reconnect, rematch, permissions, and network failures have clear UX.
- New gesture, visual, audio, and UI work uses the shared vocabulary in [the integration contract](INTEGRATION.md).

## Source

The full original feasibility report is preserved unchanged at [docs/source/SpellCaster_Wizard_Duel_Report.pdf](source/SpellCaster_Wizard_Duel_Report.pdf). Its timings and balance values are hypotheses to validate through play, not established measurements.

