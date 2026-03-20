# Rouge Prototype

This prototype now includes combat rooms, reward rooms, a rest room, and a boss finale.

## Current slice

- Pure browser Canvas prototype, no build tool required
- Data-driven configuration in `src/runtime/config.js`
- Playable systems:
  - player movement and auto fire
  - rotating reel damage rolls and crit reel
  - 8-slot value log and skill choices
  - two equipped skill slots
  - ranged enemies and enemy bullets
  - elemental resonance bonuses
  - shop rooms, treasure rooms, and a rest room
  - boss wave with burst projectile pattern
  - 8-room vertical slice

## Run locally

```powershell
cd D:\Projects\Rouge
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Current assumptions

- The player auto-fires in the current facing direction
- `Q/E` equip skill choices, `Z/C` cast equipped skills
- `1/2/3` selects shop or reward offers
- `Space` advances after shop/reward phases
- Undefined rules from the document stay configurable instead of hard-coded
