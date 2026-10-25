# Game Features Track: Plan

Owner track: core game features (health, clock, combat rules, HUD, win flow).
Gesture input and audio/voice power-ups are owned by teammates; this track exposes
clean hooks for both so they can plug in without touching combat code.

## Tech stack

Keep what Phase 0 already scaffolded. It fits a 24 to 36 hour build well.

| Layer | Choice | Why |
| --- | --- | --- |
| UI, routing, HUD overlays | React 18 + Vite + TypeScript | Fast HMR, typed props, HUD is easier as DOM than canvas text |
| Arena rendering | Phaser 3 | Sprites, tweens, particles, camera shake out of the box |
| Realtime | Node + Socket.IO | Rooms already built; server stays authoritative |
| Game rules | Pure TypeScript engine in `shared/` | Same code runs on the server (authority) and in the browser (practice mode, bot) |
| Tests | Vitest (shared workspace only) | Rules are deterministic, so they are cheap to unit test |
| Styling | Plain CSS with theme tokens (`client/src/theme.css`, mirrored in `client/src/theme.ts` for Phaser) | No Tailwind setup cost; palette lives in one place |

## Features

1. **Duel engine (`shared/src/game`)**: deterministic, clock-injected rules. Spells, cooldowns,
   projectile travel, shields, freeze, ultimate meter, power-ups, win conditions, event stream.
2. **Health bars**: 100 HP each, smooth drain with a lagging "ghost" bar, color shifts
   (healthy, wounded, critical), low-HP pulse, floating damage numbers.
3. **Match clock**: 3-2-1 countdown, 60 s round, urgent styling in the last 10 s,
   sudden death on tied HP, draw if sudden death also times out.
4. **Spell cooldown tray**: radial cooldown per spell (Fireball, Shield, Ice, Fulmen) with key hints.
5. **Ultimate meter**: charges from hits landed, successful blocks and damage taken; Fulmen unlocks at full.
6. **Status effects**: shield bubble (0.9 s guard), frozen (1.2 s attack lock), empowered, haste.
7. **Spell clash (simple)**: offensive spells launched within a short window collide mid-arena;
   stronger spell pushes through with the difference, equal spells fizzle.
8. **Power-up hooks**: `empower` (next attack +50%), `haste` (shorter cooldowns for a few seconds),
   `heal` (potion, +15 HP). Voice and gesture tracks call one function to grant them.
9. **Announcer banner**: short comedic fairy-tale narrator lines on big moments.
10. **Victory screen**: winner title, loser transforms into a frog or teapot, rematch button.
11. **Practice mode** (`/practice`): an easy bot, or training: drive both wizards from one keyboard and start any collision challenge on demand.
    Doubles as a demo fallback if the network or camera fails.
12. **Online match**: server runs the engine per room, starts on both-ready, validates
    `CAST_REQUEST` with client action IDs (duplicate-safe), broadcasts state with server timestamps.

## Integration points for teammates

```ts
import { spellInput } from "./game/input";
spellInput.cast("fireball");      // gesture track: fist -> open palm release
spellInput.cast("shield");        // open palm hold
spellInput.cast("ice");           // two fingers
spellInput.powerUp("empower");    // voice track: incantation bonus
```

Keyboard fallback: `Q` Fireball, `W` Shield, `E` Ice, `R` Fulmen (training opponent: `U I O P`).
Power-ups: `1` Empower, `2` Haste, `3` Heal (stand-ins until the voice track calls `spellInput.powerUp`).
Power-ups are limited to one per player every 12 s so they cannot be spammed.

## Balance (starting values from the design doc)

| Spell | Damage | Cooldown | Travel | Notes |
| --- | --- | --- | --- | --- |
| Fireball | 20 | 3 s | 0.9 s | Blockable |
| Shield | - | 5 s | - | 0.9 s guard window |
| Ice | 10 | 7 s | 0.7 s | Freezes attacks 1.2 s |
| Fulmen | 30 | meter | 1.2 s | Shield halves it |

All values live in `shared/src/game/config.ts`.

## Status

All twelve features above are implemented. Engine behavior is covered by unit tests in `shared/test`.
Palette is a placeholder storybook night theme; swap the hex values in `client/src/theme.css` and
`client/src/theme.ts` to match the HackTX opening ceremony slides.
