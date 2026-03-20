export const GAME_CONFIG = {
  arena: {
    width: 10,
    height: 10,
    cellSize: 52,
    originX: 220,
    originY: 60,
    playableInset: 1,
  },
  player: {
    baseMaxHp: 10,
    speed: 3.1,
    fireRate: 2.7,
    projectileSpeed: 7.5,
    projectileRange: 6.2,
    radius: 0.28,
    invulnerability: 0.5,
  },
  reelSlots: 4,
  valueSlots: 8,
  maxReels: 6,
  critical: {
    baseFaces: 10,
    triggerValue: 10,
  },
  economy: {
    startingGold: 6,
  },
  damageQualityThresholds: [
    { id: "normal", min: 0, max: 44 },
    { id: "rare", min: 45, max: 67 },
    { id: "epic", min: 68, max: 81 },
    { id: "perfect", min: 82, max: Number.POSITIVE_INFINITY },
  ],
  resonanceRules: {
    fire: {
      perStack: { every: 3, stat: "flatDamage", amount: 1 },
      thresholds: [{ count: 9, effect: { stat: "splashDamage", amount: 4 } }],
    },
    wind: {
      perStack: { every: 2, stat: "speed", amount: 0.08 },
      thresholds: [{ count: 8, effect: { stat: "pierceShots", amount: 1 } }],
    },
    water: {
      perStack: { every: 2, stat: "slowOnHit", amount: 0.08 },
      thresholds: [{ count: 6, effect: { stat: "healOnCast", amount: 1 } }],
    },
    wood: {
      perStack: { every: 2, stat: "regen", amount: 0.12 },
      thresholds: [{ count: 8, effect: { stat: "bonusMaxHp", amount: 3 } }],
    },
    thunder: {
      perStack: { every: 2, stat: "chainChance", amount: 0.08 },
      thresholds: [{ count: 8, effect: { stat: "bonusProjectiles", amount: 1 } }],
    },
  },
};

export const REEL_LIBRARY = [
  { id: "d4-fire", sides: 4, price: 3, sellPrice: 2, elements: ["fire"] },
  { id: "d6-water", sides: 6, price: 4, sellPrice: 2, elements: ["water"] },
  { id: "d8-wind", sides: 8, price: 5, sellPrice: 3, elements: ["wind"] },
  { id: "d10-wood", sides: 10, price: 9, sellPrice: 4, elements: ["wood"] },
  { id: "d12-thunder", sides: 12, price: 13, sellPrice: 6, elements: ["thunder"] },
  { id: "d12-firewind", sides: 12, price: 14, sellPrice: 7, elements: ["fire", "wind"] },
  { id: "d14-waterwood", sides: 14, price: 17, sellPrice: 8, elements: ["water", "wood"] },
  { id: "d16-thunderfire", sides: 16, price: 22, sellPrice: 10, elements: ["thunder", "fire"] },
];

export const ENEMY_ARCHETYPES = {
  bruiser: { id: "bruiser", name: "Bruiser", color: "#df7d61", radius: 0.34, maxHp: 12, speed: 1.1, contactDamage: 1, rewardGold: 1, preferredRange: 0.4 },
  runner: { id: "runner", name: "Runner", color: "#f3c969", radius: 0.22, maxHp: 6, speed: 1.7, contactDamage: 1, rewardGold: 1, preferredRange: 0.2 },
  turret: {
    id: "turret", name: "Turret", color: "#7ab7ff", radius: 0.28, maxHp: 8, speed: 0.2, contactDamage: 1, rewardGold: 1, preferredRange: 4.8,
    projectile: { cooldown: 1.8, speed: 4.2, radius: 0.1, range: 6.8, damage: 1, color: "#89c2ff" },
  },
  sniper: {
    id: "sniper", name: "Sniper", color: "#c18cff", radius: 0.24, maxHp: 7, speed: 0.6, contactDamage: 1, rewardGold: 2, preferredRange: 6,
    projectile: { cooldown: 1.2, speed: 6.4, radius: 0.09, range: 8.5, damage: 1, color: "#d0b7ff" },
  },
  elite: { id: "elite", name: "Elite", color: "#ff6f91", radius: 0.36, maxHp: 24, speed: 1.15, contactDamage: 2, rewardGold: 4, preferredRange: 0.3 },
  boss: {
    id: "boss", name: "Overseer", color: "#ffb84d", radius: 0.46, maxHp: 92, speed: 0.75, contactDamage: 2, rewardGold: 12, preferredRange: 4.4,
    projectile: { cooldown: 1.5, speed: 5.2, radius: 0.1, range: 8.8, damage: 2, color: "#ffd166", burstCount: 5, spread: 0.22 },
  },
};

export const WAVE_DEFINITIONS = [
  { id: 1, type: "combat", label: "Opening Clash", budget: [{ enemyId: "bruiser", count: 5 }, { enemyId: "runner", count: 2 }], shopOffers: ["d6-water", "d8-wind", "heal-small"] },
  { id: 2, type: "combat", label: "Crossfire", budget: [{ enemyId: "bruiser", count: 5 }, { enemyId: "runner", count: 4 }, { enemyId: "turret", count: 2 }], shopOffers: ["d10-wood", "bias-chip", "inject-fire"] },
  { id: 3, type: "combat", label: "Elite Push", budget: [{ enemyId: "elite", count: 1 }, { enemyId: "runner", count: 5 }, { enemyId: "turret", count: 2 }], shopOffers: ["d12-thunder", "heal-large", "split-core"] },
  { id: 4, type: "reward", mode: "treasure", label: "Treasure Room", freeSelections: 2, roomOffers: ["d12-firewind", "reroll-core", "inject-water"] },
  { id: 5, type: "combat", label: "Siege Line", budget: [{ enemyId: "bruiser", count: 7 }, { enemyId: "runner", count: 5 }, { enemyId: "sniper", count: 2 }], shopOffers: ["d14-waterwood", "max-hp-chip", "split-core"] },
  { id: 6, type: "reward", mode: "rest", label: "Rest Chamber", freeSelections: 1, roomOffers: ["rest-heal", "rest-growth", "rest-focus"] },
  { id: 7, type: "combat", label: "Late Wave", budget: [{ enemyId: "elite", count: 1 }, { enemyId: "turret", count: 4 }, { enemyId: "sniper", count: 4 }], shopOffers: ["d16-thunderfire", "attack-chip", "clone-core"] },
  { id: 8, type: "combat", label: "Final Boss", budget: [{ enemyId: "boss", count: 1 }, { enemyId: "runner", count: 4 }], shopOffers: [] },
];

export const SHOP_ITEM_LIBRARY = {
  "heal-small": { id: "heal-small", name: "Repair Capsule", price: 4, description: "Restore 3 HP.", apply(state) { state.player.hp = Math.min(state.player.maxHp, state.player.hp + 3); } },
  "heal-large": { id: "heal-large", name: "Emergency Heal", price: 6, description: "Restore 5 HP.", apply(state) { state.player.hp = Math.min(state.player.maxHp, state.player.hp + 5); } },
  "bias-chip": { id: "bias-chip", name: "Bias Chip", price: 5, description: "Selected reel gains +1 min and max roll.", apply(state) { const reel = getSelectedReel(state); if (!reel) return false; reel.bias = (reel.bias ?? 0) + 1; return true; } },
  "reroll-core": { id: "reroll-core", name: "Reroll Core", price: 7, description: "Reroll the selected reel into another from the library.", apply(state) { const source = REEL_LIBRARY[Math.floor(Math.random() * REEL_LIBRARY.length)]; const index = getSelectedReelIndex(state); if (index < 0) return false; state.reels[index] = structuredClone(source); return true; } },
  "split-core": { id: "split-core", name: "Split Core", price: 8, description: "Split the selected reel into two smaller reels.", apply(state) { return splitSelectedReel(state); } },
  "clone-core": { id: "clone-core", name: "Clone Core", price: 9, description: "Duplicate the selected reel as a smaller copy.", apply(state) { return cloneSelectedReel(state); } },
  "max-hp-chip": { id: "max-hp-chip", name: "Vital Frame", price: 7, description: "+2 max HP and heal 2 HP.", apply(state) { state.player.permanentMaxHpBonus += 2; state.player.hp += 2; return true; } },
  "attack-chip": { id: "attack-chip", name: "Attack Servo", price: 7, description: "Permanent +12% fire rate.", apply(state) { state.player.baseFireRate *= 1.12; return true; } },
  "inject-fire": { id: "inject-fire", name: "Inject Fire", price: 6, description: "Add fire element to the selected reel.", apply(state) { return injectElement(state, "fire"); } },
  "inject-thunder": { id: "inject-thunder", name: "Inject Thunder", price: 6, description: "Add thunder element to the selected reel.", apply(state) { return injectElement(state, "thunder"); } },
  "inject-water": { id: "inject-water", name: "Inject Water", price: 6, description: "Add water element to the selected reel.", apply(state) { return injectElement(state, "water"); } },
  "inject-wood": { id: "inject-wood", name: "Inject Wood", price: 6, description: "Add wood element to the selected reel.", apply(state) { return injectElement(state, "wood"); } },
  "inject-wind": { id: "inject-wind", name: "Inject Wind", price: 6, description: "Add wind element to the selected reel.", apply(state) { return injectElement(state, "wind"); } },
  "rest-heal": { id: "rest-heal", name: "Field Medbay", price: 0, description: "Fully restore HP.", apply(state) { state.player.hp = state.player.maxHp; return true; } },
  "rest-growth": { id: "rest-growth", name: "Growth Serum", price: 0, description: "+3 permanent max HP and heal 3.", apply(state) { state.player.permanentMaxHpBonus += 3; state.player.hp += 3; return true; } },
  "rest-focus": { id: "rest-focus", name: "Focus Calibration", price: 0, description: "+18% fire rate and +10% projectile speed.", apply(state) { state.player.baseFireRate *= 1.18; state.player.baseProjectileSpeed *= 1.1; return true; } },
};

export const SKILL_LIBRARY = [
  { id: "flare-burst", name: "Flare Burst", quality: "normal", elements: ["fire"], description: "Emit 6 short-range fire shots.", cast(game) { game.spawnRadialBurst(6, 0.28, "#ff8a5b"); } },
  { id: "gale-step", name: "Gale Step", quality: "normal", elements: ["wind"], description: "Gain major move speed for 4s.", cast(game) { game.addTimedModifier("speed", 1.6, 4); } },
  { id: "tidal-shell", name: "Tidal Shell", quality: "rare", elements: ["water", "wood"], description: "Heal 2 HP and gain 4s damage reduction.", cast(game) { game.healPlayer(2); game.addTimedModifier("damageReduction", 0.5, 4); } },
  { id: "spark-link", name: "Spark Link", quality: "rare", elements: ["thunder"], description: "Instantly fire 3 extra homing shots.", cast(game) { game.spawnHomingShots(3); } },
  { id: "verdant-pulse", name: "Verdant Pulse", quality: "epic", elements: ["wood"], description: "Restore 4 HP and increase max HP by 1.", cast(game) { game.increaseMaxHp(1); game.healPlayer(4); } },
  { id: "monsoon-drive", name: "Monsoon Drive", quality: "epic", elements: ["water", "wind"], description: "Dash shots: 8 fast projectiles in a spread.", cast(game) { game.spawnForwardSpread(8, 0.32, "#7ad7ff"); } },
  { id: "voltaic-lattice", name: "Voltaic Lattice", quality: "epic", elements: ["thunder", "fire"], description: "Gain chain chance and fire rate for 8s.", cast(game) { game.addTimedModifier("fireRate", 1.35, 8); game.addTimedModifier("chainChance", 1.8, 8); } },
  { id: "perfect-overdrive", name: "Perfect Overdrive", quality: "perfect", elements: ["fire", "thunder"], description: "Boost fire rate and projectile speed for 10s.", cast(game) { game.addTimedModifier("fireRate", 1.8, 10); game.addTimedModifier("projectileSpeed", 1.5, 10); } },
];

function getSelectedReel(state) {
  return state.reels[state.selectedReelIndex] ?? null;
}

function getSelectedReelIndex(state) {
  if (state.reels.length === 0) return -1;
  state.selectedReelIndex = Math.max(0, Math.min(state.selectedReelIndex, state.reels.length - 1));
  return state.selectedReelIndex;
}

function injectElement(state, element) {
  const reel = getSelectedReel(state);
  if (!reel) return false;
  if (!reel.elements.includes(element) && reel.elements.length < 2) {
    reel.elements.push(element);
  }
  return true;
}

function splitSelectedReel(state) {
  const index = getSelectedReelIndex(state);
  if (index < 0 || state.reels.length >= GAME_CONFIG.maxReels) return false;
  const reel = state.reels[index];
  if (reel.sides <= 4) return false;
  const leftSides = Math.max(4, Math.floor(reel.sides / 2));
  const rightSides = Math.max(4, reel.sides - leftSides);
  const left = { ...structuredClone(reel), id: `${reel.id}-split-a-${Date.now()}`, sides: leftSides, sellPrice: Math.max(1, Math.floor(reel.sellPrice / 2)) };
  const right = { ...structuredClone(reel), id: `${reel.id}-split-b-${Date.now()}`, sides: rightSides, sellPrice: Math.max(1, Math.ceil(reel.sellPrice / 2)) };
  state.reels.splice(index, 1, left, right);
  return true;
}

function cloneSelectedReel(state) {
  const index = getSelectedReelIndex(state);
  if (index < 0 || state.reels.length >= GAME_CONFIG.maxReels) return false;
  const reel = state.reels[index];
  const cloneSides = Math.max(4, Math.floor(reel.sides / 2));
  const clone = { ...structuredClone(reel), id: `${reel.id}-clone-${Date.now()}`, sides: cloneSides, sellPrice: Math.max(1, Math.floor(reel.sellPrice / 2)), bias: Math.max(0, (reel.bias ?? 0) - 1) };
  state.reels.splice(index + 1, 0, clone);
  return true;
}
