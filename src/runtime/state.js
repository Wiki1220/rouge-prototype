import { GAME_CONFIG, REEL_LIBRARY, getPlayerAttributeBase } from "./config.js";

export function createDefaultStatTuning() {
  return {
    flatAdd: 0,
    runtimeFlatAdd: 0,
    baseMultiplier: 1,
    extraMultiplier: 1,
    globalMultiplier: 1,
  };
}

export function createInitialState(options = {}) {
  return {
    clock: 0,
    phase: "battle",
    waveIndex: 1,
    gold: GAME_CONFIG.economy.startingGold,
    kills: 0,
    reels: [structuredClone(REEL_LIBRARY[0]), structuredClone(REEL_LIBRARY[1]), structuredClone(REEL_LIBRARY[2]), structuredClone(REEL_LIBRARY[3])],
    selectedReelIndex: 0,
    selectedFaceIndex: 0,
    activeReelIndex: 0,
    valueSlots: Array(GAME_CONFIG.valueSlots).fill(null),
    valueSlotSources: Array(GAME_CONFIG.valueSlots).fill(null),
    nextValueSlotIndex: 0,
    pendingSkillChoices: null,
    confirmedSkill: null,
    reelCycleMarks: Array(GAME_CONFIG.reelSlots).fill(false),
    lastCrit: false,
    roomOffers: [],
    roomSelectionsLeft: 0,
    roomPickups: [],
    bossAnnouncement: "",
    telegraphs: [],
    hazards: [],
    waveBuffUsage: { red: 0, blue: 0, green: 0 },
    bossAnnouncementTimer: 0,
    debugNoDamage: Boolean(options.debugNoDamage),
    endlessLevel: 0,
    mainRunCleared: false,
    scheduledEffects: [],
    auras: [],
    player: {
      position: { x: GAME_CONFIG.arena.width / 2, y: GAME_CONFIG.arena.height / 2 },
      direction: { x: 1, y: 0 },
      hp: GAME_CONFIG.player.baseMaxHp,
      maxHp: GAME_CONFIG.player.baseMaxHp,
      baseMaxHp: GAME_CONFIG.player.baseMaxHp,
      permanentMaxHpBonus: 0,
      resonanceBonusMaxHp: 0,
      regenBuffer: 0,
      tempHp: 0,
      shield: 0,
      maxShield: 8,
      shieldDecayLeft: 0,
      radius: GAME_CONFIG.player.radius,
      baseSpeed: getPlayerAttributeBase("moveSpeed"),
      baseFireRate: getPlayerAttributeBase("fireRate"),
      baseProjectileSpeed: getPlayerAttributeBase("projectileSpeed"),
      baseProjectileRange: getPlayerAttributeBase("attackRange"),
      baseInvulnerability: getPlayerAttributeBase("hitInvulnerability"),
      baseLuck: getPlayerAttributeBase("luck"),
      contactDamage: 1,
      runtimeFlatBonuses: { speed: 0, fireRate: 0, chainChance: 0, luck: 0 },
      statTuning: {
        speed: createDefaultStatTuning(),
        fireRate: createDefaultStatTuning(),
        projectileSpeed: createDefaultStatTuning(),
        projectileRange: createDefaultStatTuning(),
        invulnerability: createDefaultStatTuning(),
        damageReduction: createDefaultStatTuning(),
        chainChance: createDefaultStatTuning(),
        luck: createDefaultStatTuning(),
      },
      invulnerabilityLeft: 0,
      fireCooldown: 0,
    },
    enemies: [],
    projectiles: [],
    spawnQueue: [],
    spawnTimer: 0,
    shopOffers: [],
    modifiers: [],
  };
}

export function createInput() {
  const pressed = new Set();
  const consumed = new Set();
  return {
    onKeyDown(event) { pressed.add(event.code); },
    onKeyUp(event) { pressed.delete(event.code); consumed.delete(event.code); },
    isDown(code) { return pressed.has(code); },
    consume(code) { if (!pressed.has(code) || consumed.has(code)) return false; consumed.add(code); return true; },
  };
}

export function rotateVector(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}
