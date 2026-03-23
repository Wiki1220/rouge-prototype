# Project Status

This document tracks the current browser prototype as it exists in `src/runtime/`.

## Source Of Truth

- Requirement document: `untitled.md`
- Runtime entry: `src/main.ts`
- Main game loop: `src/runtime/game.js`
- Configurable content: `src/runtime/config.js`

## Current State

The project is now a Vite-based browser prototype that runs the full main route inside the new menu/HUD shell.

Implemented high-level loop:

1. Start from the title menu and enter a run.
2. Fight through 23 main-route waves.
3. Use reel-based random damage and fill the 8-slot value log.
4. Gain random skill choices and keep one confirmed skill.
5. Buy reels and items in shop rooms.
6. Clear treasure and rest rooms.
7. Enter endless trial after the finale.

## Implemented Systems

### Core Combat

- Player movement, auto-fire, projectile travel, collision, and cleanup.
- Contact damage, enemy projectile damage, and terrain damage.
- Temporary invulnerability after getting hit.
- Configurable projectile control on hit:
  - `-1` disables control
  - `0` applies a short root
  - `>0` applies knockback distance

### Reel / Damage / Crit

- Reel faces are now explicit data, not implicit `1..n` rolls.
- Rolls are recorded on first effective hit only.
- 8-slot value log drives skill generation.
- Crit reel now uses the current reel-type count to determine crit faces.
- Reel bias, sell price, and transformation lock state are stored per reel.

### Shop / Buildcraft

- Shop rooms, treasure rooms, and rest rooms are playable.
- Reel face reroll is supported on the selected face.
- Split / clone transformations are one-time per reel.
- Inject / swap element items are supported.
- Shop UI shows reel faces and transformed reel visuals directly.

### Skills

- Candidate skill flow and single confirmed skill slot are implemented.
- Effect-driven active skills support:
  - radial burst
  - forward spread
  - homing shots
  - timed modifiers
  - healing
  - max HP growth
  - shield
  - delayed effects
  - pulse aura

### Resonance

- Water:
  - slow per 2 stacks
  - freeze after double chill at 6 stacks
- Fire:
  - flat damage per 3 stacks
  - splash and double-damage chance at 9 stacks
- Wood:
  - passive regen from 2 stacks
  - temporary HP per combat wave at 8 stacks
  - on-hit self-heal chance at 8 stacks
- Wind:
  - move speed and fire rate growth
  - pierce at 9 stacks
- Thunder:
  - extra projectile rolls
  - upgraded projectile chance and damage penalty at 9 stacks

### Encounters

- Normal waves, elite waves, bosses, treasure room, rest room, and endless trial.
- Boss telegraphs, radial novas, meteor pressure, reinforcements, and phase escalation.
- Acid, fire, and spike hazards.
- Elite enemy colored buffs with per-wave caps.

### UI / Presentation

- Title menu, help modal, developer panel, pause menu, and in-run developer tools.
- HUD for reels, values, quality thresholds, distribution chart, resonance counts, and skill state.
- Visual feedback for crit, freeze, root, shield, and temporary HP.
- Explicit next-room buttons in shop and reward overlays.
- Arena now matches the `10x10` requirement scale and shows the center spawn marker.

## Still Missing Or Prototype-Level

### Requirement Gaps Still Open

- The right-side settlement area is still simplified compared with the original mockup.
- There is no fully polished attribute/initial-value breakdown panel yet.
- Split / clone visuals are now clearer, but still not the final bespoke art direction from the mockup.

### Combat Feel

- Hit stop, camera shake, impact flashes, and stronger damage feedback are still missing.
- Audio is still not implemented.
- Enemy readability is better than before, but still prototype-grade.

### Content

- Enemy roster is still limited.
- Skill count and item count are still not enough for long-term replayability.
- Endless mode variety is still thin.

### Production

- No tests or CI.
- No release packaging pipeline.
- Deployment is still static-file replacement.

## Immediate Next Recommendations

1. Improve hit feedback and readability.
2. Expand enemy and skill content.
3. Replace prototype UI wording with final player-facing copy.
4. Add a simple deployment note once the production server path is confirmed.
