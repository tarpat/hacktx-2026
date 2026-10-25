# VFX Revamp Plan

Goal: every effect in the arena moves, reacts and feels hand-made. No static PNGs popping in and out, no AI-generated art. Rendering only — the engine and game rules don't change.

## Where the effects come from

| Source | Used for | Why |
|---|---|---|
| **Procedural (Phaser Graphics, particles, tweens)** | Shields, auras, runes, shockwaves, frost, trails | Crisp at any size, player-tinted, no licensing. Same approach as `StruggleBeams.ts`. |
| **Phaser 3.88 built-in FX** (`preFX` / `postFX`: glow, bloom, shine, color matrix; camera shake / flash) | Bloom pass, hit flash, glow on projectiles and wizards | Cheapest big jump in polish. |
| **CC0 / CC-BY sprite sheets** (itch.io, Kenney, OpenGameArt) | Smoke puffs, a better ultimate burst — only where hand-drawn frames beat code | Same sources as today; every file credited in `client/public/assets/fx/CREDITS.txt`. |
| **Existing sheets** (fireball, frostbolt, freeze, explosion, sparkle, lightning, bull) | Kept, layered with the new effects | Already animated and licensed. |

Rule: no AI-generated images. If a sheet can't be found with a clear license, draw it in code.

## Current state

- **Animated:** fireball/frostbolt flight, explosion, freeze, sparkle, lightning, bull run, lightning storm (code), Taurus rune (code), struggle beams (code).
- **Static PNGs (to replace):** `shield.png`, `frozen.png`, `ultimate-aura.png`, `empower.png`, `haste.png`, `shield-shatter.png`, `clash.png`, `hit-sparks.png`, `frog.png` / `teapot.png` transforms.
- **Missing:** impact weight (shake, hit-stop, hit flash, knockback) and a global glow.

## Work items (priority order)

### PR 1 — Impact, shield, casting
1. **Impact weight** — 40–80 ms hit-stop, camera shake scaled to damage, white tint flash + small knockback on the hit wizard, ground shockwave ring and debris particles. New `client/src/arena/fx/Impact.ts`.
2. **Shield** — procedural bubble (layered arcs + hex shimmer in player color): grows in with an overshoot, ripples at the point a spell hits, breaks into shards on `SHIELD_SHATTERED`. Replaces `shield.png` and `shield-shatter.png`. New `fx/ShieldBubble.ts`.
3. **Casting** — rune circle gathers at the wand while charging (reads the existing charge state), muzzle flash + recoil on release, smoke/frost trails with glow on fireball and ice in place of the plain particle stream.

### PR 2 — Status effects and transforms
4. **Frozen** — ice crawls up the body over ~200 ms with frost particles, cracks and shatters on thaw. Replaces `frozen.png`.
5. **Buffs** — empower: flickering ember aura in player color; haste: afterimage trail behind the wizard; ultimate: swirling energy column with rising motes. Replaces `empower.png`, `haste.png`, `ultimate-aura.png`.
6. **Frog / teapot** — smoke puff, squash-and-stretch pop-in, sparkle burst on transform and revert.

### PR 3 — Arena and finish
7. **Ambience** — slow parallax on the background, drifting fireflies/dust, light bloom `postFX` on the camera (with a quality toggle for weak laptops).
8. **Clash** — animated shockwave ring + light streak instead of `clash.png`.
9. **KO** — slow-motion final blow, zoom punch, victory burst.

## Constraints

- Keep 60 fps on a laptop running the webcam tracker: pool particle emitters, cap live particles, no per-frame texture generation.
- Everything scales with `unit` like the existing code.
- Player colors come from `theme.ts` (`playerColor`).
- Effects listen to existing `GameEvent`s (`SPELL_CAST`, `DAMAGE_APPLIED`, `SPELL_BLOCKED`, `SHIELD_SHATTERED`, `FROZEN`, `SPELL_CLASH`, …); no engine changes.

## Verification

Each PR: typecheck, then drive `/practice?mode=bot` and hotseat with Playwright, screenshot each effect mid-animation, and check the frame time in the Phaser debug overlay.
