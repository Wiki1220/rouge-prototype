# Rouge Prototype

This prototype now includes a full 23-wave main run, reward rooms, rest flow, boss encounters, and an endless trial unlocked after the finale.

## Docs

- Original requirement document: `untitled.md`
- Current implementation progress and roadmap: `STATUS.md`

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
  - elite enemies, acid hazards, fire trail hazards, and spike traps
  - multi-phase boss mechanics with telegraphed attacks
  - 23-wave main route plus wave 24 endless trial
  - template-driven active skills with extensible effect descriptors

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
