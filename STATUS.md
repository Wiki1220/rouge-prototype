# Project Status

This document tracks what is already implemented in the prototype, what is still missing, and the recommended next steps for turning the current vertical slice into a fuller game.

## Source Documents

- Original game design requirement document: `untitled.md`
- Current browser prototype entry: `index.html`
- Runtime systems: `src/runtime/game.js`
- Configurable content data: `src/runtime/config.js`

## Current State

The project is currently a browser-based Canvas prototype focused on validating the core loop:

1. Move and survive inside a combat arena.
2. Fire automatically using the current facing direction.
3. Roll reel-based damage values.
4. Fill the value log.
5. Receive skill choices.
6. Build the run through shops and reward rooms.
7. Clear the 23-wave main route and continue into the endless trial.

The prototype is already deployed as a public static build and has also been published as an open-source GitHub repository.

## Implemented Features

### Core Combat

- Player movement in a bounded arena.
- Auto-fire based on facing direction.
- Projectile travel, collision, hit resolution, and cleanup.
- Enemy contact damage and enemy projectile damage.
- Temporary invulnerability after taking damage.
- Passive regeneration hooks.

### Reel and Damage Systems

- Multiple reels carried by the player at the same time.
- Reel cycling for attacks.
- Crit-capable reel behavior.
- Value logging into an 8-slot history.
- Skill choice generation after filling the value log.
- Sell value and bias data stored per reel.

### Skill Systems

- Two active skill slots.
- Skill choice and replacement flow.
- Skill casting with keyboard shortcuts.
- Runtime support for radial burst, forward spread, and homing-type skills.
- Active skills now support effect-descriptor execution with repeat, heal, timed modifier, and max-HP growth templates.
- Projectile-oriented effects can now carry configurable pierce, splash, slow, and chain parameters.
- Resonance hooks can add bonuses such as heal-on-cast, flat damage, pierce, splash, and slow-on-hit.

### Build and Shop Systems

- Shop rooms with purchasable offers.
- Reward rooms with free selections.
- Rest room reward flow.
- Reel selection during shop phase.
- Sell selected reel.
- Targeted reel modification items.
- Split and clone style reel growth hooks.

### Enemy and Encounter Systems

- Multiple enemy archetypes.
- Ranged enemy behavior.
- Enemy projectile bursts and spread.
- Wave/room progression driven by configuration data.
- Boss phase escalation:
  - phase 2 trigger near 66% HP
  - phase 3 trigger near 33% HP
  - increased speed, rate of fire, projectile pressure
  - reinforcement summoning during later phases
- Distinct boss mechanics:
  - Overseer telegraphed lock-on volleys
  - Crown Core radial novas and meteor-style fire drops
- Acid, fire, and spike-trap terrain hazards are supported.

### Meta Structure

- 23-wave main route matching the current design direction.
- Combat rooms, treasure room, rest room, boss flow, and post-clear endless trial.
- Endless loop that scales wave composition after the main route.
- Victory and failure states.
- Restart loop for repeated runs.

### UI and Presentation

- HUD for skills, reels, value log, combat stats, and resonance state.
- Overlay panels for shop, reward, victory, and game over.
- Canvas battle rendering for player, enemies, and projectiles.
- Boss status text and phase alerts.

### Extensibility

- Most content is driven from `src/runtime/config.js`.
- Enemy archetypes are data-defined.
- Wave definitions are data-defined.
- Shop items and reel entries are data-defined.
- Skills are stored in a library and can now be defined through reusable effect descriptors instead of one-off runtime handlers.

## What Is Still Prototype-Level

The current version is playable, but a lot of it still sits at prototype quality rather than production quality.

### Combat Feel

- Hit feedback is still minimal.
- No screen shake, strong impact flashes, or polished VFX.
- Audio is not implemented.
- Enemy readability and bullet readability need polish.

### Skill Architecture

- Skill effects are now partially template-driven, but several advanced patterns still depend on runtime helpers.
- Delayed casts, summon-type skills, shield layers, and persistent aura skills still need reusable descriptors.
- There is no richer keyword system yet for conditional chaining, cooldown-sharing, or proc-based triggers.

### Boss Depth

- Boss phases are currently stat escalation plus summons.
- There are no fully distinct scripted mechanics yet.
- No phase intro animation, arena changes, or dramatic transitions.

### Content Volume

- The full long-form run now exists, but endless scaling, variety, and economy depth are still prototype-level.
- Enemy pool is still limited, though hazard-focused variants now include acid, fire, and spike trap threats.
- Skill pool and item pool need significant expansion.
- Element combinations and resonance outcomes are still early.

### UX and Accessibility

- There is no settings screen.
- No pause menu or rebinding.
- No proper tutorial onboarding.
- The UI text is still very prototype-oriented.

### Production Readiness

- Static hosting works, but deployment is still very lightweight.
- No CI pipeline yet.
- No automated test coverage.
- No formal release process.

## Confirmed Repository Status

- The original requirement document `untitled.md` is already committed and published.
- The repository is public.
- Current GitHub repository: `https://github.com/Wiki1220/rouge-prototype`

## Recommended Next Milestones

### Milestone 1: Boss Mechanic Upgrade

Goal: make the boss memorable instead of only harder.

Suggested work:

- Add unique boss attack patterns per phase.
- Add telegraphs before dangerous attacks.
- Add one movement or area-control mechanic.
- Add clearer boss phase transition messaging and visuals.

### Milestone 2: Data-Driven Skill Templates

Goal: reduce runtime hard-coding and improve expansion speed.

Suggested work:

- Introduce reusable skill effect descriptors.
- Separate targeting, projectile shape, and impact effects.
- Move more skill definitions into config-only content.
- Support composable effects such as splash, pierce, chain, buff, and summon.

### Milestone 3: Full Buildcraft Loop

Goal: make runs feel strategically different.

Suggested work:

- Add more reel transformation items.
- Add better shop economy rules.
- Add more resonance thresholds and interactions.
- Add more meaningful tradeoffs between offense, defense, and utility.

### Milestone 4: Content Expansion

Goal: turn the vertical slice into a fuller run.

Suggested work:

- Expand endless content variety and special event rooms.
- Add more enemy archetypes and elite behaviors.
- Add more skills, reels, and shop items.
- Add at least one additional boss or boss variant.

### Milestone 5: Presentation and Packaging

Goal: make the prototype easier to share and evaluate.

Suggested work:

- Add title screen and short gameplay guide.
- Add sound effects and basic music.
- Improve HUD layout and visual hierarchy.
- Add screenshots and gameplay GIFs to the repository README.

## Detailed TODO List

### High Priority

- Implement distinct boss mechanics instead of phase-only stat ramps.
- Refactor skill logic into reusable effect templates.
- Expand the content pool for skills, reels, and enemies.
- Improve shop and reward balancing.
- Add clearer onboarding for controls and progression.

### Medium Priority

- Add elite enemies and room modifiers.
- Add better projectile readability and damage feedback.
- Add more resonance effects and element identity.
- Add pause/settings flow.
- Add saveable run stats or summary output.

### Lower Priority

- Add richer environment art and arena themes.
- Add localization pass for polished Chinese UI.
- Replace prototype wording with player-facing language.
- Add analytics/debug panels for balancing sessions.

## Known Technical Notes

- The project currently runs without a build step.
- Node-based validation is not available on the current deployment server.
- Server deployment currently uses static hosting through a lightweight Python HTTP service.
- GitHub CLI was configured locally through a portable installation stored under `.tools/`, and that folder is intentionally ignored by git.

## Immediate Next Recommendation

If development continues from the current branch, the best next step is:

1. Refactor skills into a more modular data-driven template system.
2. Deepen endless mode with rotating modifiers, elite packs, and reward rules.
3. Improve presentation, onboarding, and balance once those systems settle.
