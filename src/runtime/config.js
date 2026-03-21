export const GAME_CONFIG = {
  arena: {
    width: 20,
    height: 20,
    cellSize: 64,
    originX: 0,
    originY: 0,
    playableInset: 1,
    visibleWidth: 10,
    visibleHeight: 6.6,
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
  terrain: {
    hazardLifetime: 2,
    hazardRadius: 0.22,
    acidTickInterval: 0.5,
    acidDamage: 1,
    fireTickInterval: 0.35,
    fireDamage: 1,
    fireRadius: 0.26,
    spikeTickInterval: 0.7,
    spikeDamage: 1,
    spikeRadius: 0.2,
    spikeArmDelay: 0.45,
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
  { id: "d18-windthunder", sides: 18, price: 27, sellPrice: 12, elements: ["wind", "thunder"] },
  { id: "d20-firewood", sides: 20, price: 32, sellPrice: 14, elements: ["fire", "wood"] },
];

export const ENEMY_ARCHETYPES = {
  bruiser: { id: "bruiser", name: "重甲怪", color: "#df7d61", radius: 0.34, maxHp: 12, speed: 1.1, contactDamage: 1, rewardGold: 1, preferredRange: 0.4 },
  runner: { id: "runner", name: "迅行怪", color: "#f3c969", radius: 0.22, maxHp: 6, speed: 1.7, contactDamage: 1, rewardGold: 1, preferredRange: 0.2 },
  turret: {
    id: "turret", name: "炮台怪", color: "#7ab7ff", radius: 0.28, maxHp: 8, speed: 0.2, contactDamage: 1, rewardGold: 1, preferredRange: 4.8,
    projectile: { cooldown: 1.8, speed: 4.2, radius: 0.1, range: 6.8, damage: 1, color: "#89c2ff" },
  },
  sniper: {
    id: "sniper", name: "狙击怪", color: "#c18cff", radius: 0.24, maxHp: 7, speed: 0.6, contactDamage: 1, rewardGold: 2, preferredRange: 6,
    projectile: { cooldown: 1.2, speed: 6.4, radius: 0.09, range: 8.5, damage: 1, color: "#d0b7ff" },
  },
  trail: {
    id: "trail", name: "蚀痕怪", color: "#6bd18c", radius: 0.26, maxHp: 9, speed: 1.0, contactDamage: 1, rewardGold: 1, preferredRange: 0.25,
    trailHazard: { color: "rgba(98, 214, 146, 0.42)", tickInterval: 0.5, lifetime: 2, damage: 1, spawnInterval: 0.24 },
  },
  ember: {
    id: "ember", name: "余烬怪", color: "#ff935c", radius: 0.28, maxHp: 10, speed: 0.95, contactDamage: 1, rewardGold: 1, preferredRange: 2.1,
    trailHazard: { color: "rgba(255, 124, 79, 0.4)", tickInterval: 0.35, lifetime: 1.8, damage: 1, spawnInterval: 0.28, radius: 0.26, type: "fire" },
  },
  eliteDash: {
    id: "eliteDash", name: "冲锋精英", color: "#ff8c61", radius: 0.34, maxHp: 22, speed: 1.2, contactDamage: 1, rewardGold: 4, preferredRange: 0.35,
    dash: { cooldown: 1.6, duration: 0.2, speed: 5.6 },
  },
  eliteNest: {
    id: "eliteNest", name: "裂巢精英", color: "#b37dff", radius: 0.38, maxHp: 26, speed: 0.85, contactDamage: 1, rewardGold: 4, preferredRange: 0.4,
    deathSpawn: [{ enemyId: "runner", count: 2 }, { enemyId: "trail", count: 1 }],
  },
  eliteRevive: {
    id: "eliteRevive", name: "复生精英", color: "#7fd9a8", radius: 0.36, maxHp: 20, speed: 1.0, contactDamage: 1, rewardGold: 4, preferredRange: 0.3,
    reviveOnce: { hpRatio: 0.45, color: "#d8f7b8" },
  },
  elite: { id: "elite", name: "精英卫士", color: "#ff6f91", radius: 0.36, maxHp: 24, speed: 1.15, contactDamage: 2, rewardGold: 4, preferredRange: 0.3 },
  boss: {
    id: "boss", name: "监察者", color: "#ffb84d", radius: 0.46, maxHp: 92, speed: 0.75, contactDamage: 1, rewardGold: 12, preferredRange: 4.4, isBoss: true,
    projectile: { cooldown: 1.5, speed: 5.2, radius: 0.1, range: 8.8, damage: 2, color: "#ffd166", burstCount: 5, spread: 0.22 },
  },
  finalBoss: {
    id: "finalBoss", name: "王冠核心", color: "#ff5d73", radius: 0.52, maxHp: 148, speed: 0.82, contactDamage: 2, rewardGold: 20, preferredRange: 5.2, isBoss: true,
    projectile: { cooldown: 1.25, speed: 5.8, radius: 0.11, range: 9.2, damage: 2, color: "#ff8ca1", burstCount: 7, spread: 0.18 },
  },
};

export const WAVE_DEFINITIONS = [
  { id: 1, type: "combat", label: "第1波：开局冲突", budget: [{ enemyId: "bruiser", count: 4 }, { enemyId: "runner", count: 2 }], shopOffers: ["d6-water", "d8-wind", "heal-small"] },
  { id: 2, type: "combat", label: "第2波：试探压迫", budget: [{ enemyId: "bruiser", count: 5 }, { enemyId: "runner", count: 3 }], shopOffers: ["d8-wind", "bias-chip", "inject-fire"] },
  { id: 3, type: "combat", label: "第3波：远程介入", budget: [{ enemyId: "bruiser", count: 4 }, { enemyId: "runner", count: 4 }, { enemyId: "turret", count: 1 }], shopOffers: ["d10-wood", "heal-small", "inject-water"] },
  { id: 4, type: "combat", label: "第4波：火力试炼", budget: [{ enemyId: "bruiser", count: 6 }, { enemyId: "runner", count: 4 }, { enemyId: "turret", count: 2 }], shopOffers: ["d12-thunder", "attack-chip", "inject-wind"] },
  { id: 5, type: "combat", label: "第5波：首个精英", budget: [{ enemyId: "eliteDash", count: 1 }, { enemyId: "runner", count: 5 }, { enemyId: "turret", count: 2 }], shopOffers: ["d12-firewind", "heal-large", "bias-chip"] },
  { id: 6, type: "combat", label: "第6波：酸蚀追猎", budget: [{ enemyId: "bruiser", count: 6 }, { enemyId: "runner", count: 4 }, { enemyId: "trail", count: 2 }, { enemyId: "sniper", count: 1 }], shopOffers: ["d14-waterwood", "inject-wood", "reroll-core"] },
  { id: 7, type: "combat", label: "第7波：多线火网", budget: [{ enemyId: "bruiser", count: 5 }, { enemyId: "runner", count: 4 }, { enemyId: "turret", count: 2 }, { enemyId: "sniper", count: 1 }], shopOffers: ["d14-waterwood", "max-hp-chip", "inject-thunder"] },
  { id: 8, type: "combat", label: "第8波：正面碾压", budget: [{ enemyId: "bruiser", count: 8 }, { enemyId: "runner", count: 6 }, { enemyId: "turret", count: 2 }], shopOffers: ["d16-thunderfire", "heal-large", "reroll-core"] },
  { id: 9, type: "combat", label: "第9波：狙击压制", budget: [{ enemyId: "bruiser", count: 6 }, { enemyId: "runner", count: 6 }, { enemyId: "sniper", count: 2 }], shopOffers: ["d16-thunderfire", "inject-fire", "swap-element"] },
  { id: 10, type: "combat", label: "第10波：裂巢来袭", budget: [{ enemyId: "eliteNest", count: 1 }, { enemyId: "turret", count: 3 }, { enemyId: "sniper", count: 2 }, { enemyId: "runner", count: 4 }], shopOffers: ["d18-windthunder", "split-core", "attack-chip"] },
  { id: 11, type: "combat", label: "第11波：重压推进", budget: [{ enemyId: "bruiser", count: 9 }, { enemyId: "runner", count: 5 }, { enemyId: "turret", count: 2 }], shopOffers: ["d18-windthunder", "max-hp-chip", "inject-water"] },
  { id: 12, type: "combat", label: "第12波：酸雾缠斗", budget: [{ enemyId: "bruiser", count: 5 }, { enemyId: "runner", count: 5 }, { enemyId: "trail", count: 3 }, { enemyId: "sniper", count: 3 }], shopOffers: ["d20-firewood", "clone-core", "swap-element"] },
  { id: 13, type: "combat", label: "第13波：复生围猎", budget: [{ enemyId: "eliteRevive", count: 1 }, { enemyId: "bruiser", count: 6 }, { enemyId: "runner", count: 6 }], shopOffers: ["d20-firewood", "split-core", "clone-core"] },
  { id: 14, type: "combat", label: "第14波：总攻前夜", budget: [{ enemyId: "bruiser", count: 8 }, { enemyId: "runner", count: 6 }, { enemyId: "turret", count: 3 }, { enemyId: "sniper", count: 2 }, { enemyId: "ember", count: 2 }], shopOffers: ["d20-firewood", "heal-large", "inject-thunder"] },
  { id: 15, type: "combat", label: "第15波：监察者降临", budget: [{ enemyId: "boss", count: 1 }, { enemyId: "runner", count: 4 }], shopOffers: [] },
  { id: 16, type: "reward", mode: "treasure", label: "第16波：宝箱回廊", freeSelections: 2, roomOffers: ["d16-thunderfire", "d18-windthunder", "split-core", "clone-core", "swap-element"] },
  { id: 17, type: "combat", label: "第17波：余烬反扑", budget: [{ enemyId: "bruiser", count: 9 }, { enemyId: "runner", count: 7 }, { enemyId: "turret", count: 2 }], shopOffers: ["d18-windthunder", "attack-chip", "inject-wood"] },
  { id: 18, type: "combat", label: "第18波：蚀地风暴", budget: [{ enemyId: "bruiser", count: 6 }, { enemyId: "runner", count: 6 }, { enemyId: "trail", count: 4 }, { enemyId: "ember", count: 3 }, { enemyId: "sniper", count: 3 }, { enemyId: "turret", count: 2 }], shopOffers: ["d20-firewood", "heal-large", "reroll-core"] },
  { id: 19, type: "combat", label: "第19波：双精英会战", budget: [{ enemyId: "eliteDash", count: 1 }, { enemyId: "eliteRevive", count: 1 }, { enemyId: "runner", count: 6 }, { enemyId: "sniper", count: 2 }], shopOffers: ["d20-firewood", "max-hp-chip", "swap-element"] },
  { id: 20, type: "combat", label: "第20波：火网封锁", budget: [{ enemyId: "bruiser", count: 10 }, { enemyId: "runner", count: 7 }, { enemyId: "ember", count: 4 }, { enemyId: "turret", count: 3 }], shopOffers: ["d20-firewood", "attack-chip", "inject-fire"] },
  { id: 21, type: "combat", label: "第21波：混沌裂阵", budget: [{ enemyId: "eliteDash", count: 1 }, { enemyId: "eliteNest", count: 1 }, { enemyId: "turret", count: 4 }, { enemyId: "sniper", count: 3 }], shopOffers: ["d20-firewood", "clone-core", "split-core"] },
  { id: 22, type: "reward", mode: "rest", label: "第22波：营地整备", freeSelections: 1, roomOffers: ["rest-heal", "rest-growth", "rest-focus"] },
  { id: 23, type: "combat", label: "第23波：王冠核心", budget: [{ enemyId: "finalBoss", count: 1 }, { enemyId: "elite", count: 1 }, { enemyId: "runner", count: 5 }], shopOffers: [] },
];

export const SHOP_ITEM_LIBRARY = {
  "heal-small": { id: "heal-small", name: "修复胶囊", price: 4, description: "恢复 3 点生命。", apply(state) { state.player.hp = Math.min(state.player.maxHp, state.player.hp + 3); } },
  "heal-large": { id: "heal-large", name: "紧急治疗", price: 6, description: "恢复 5 点生命。", apply(state) { state.player.hp = Math.min(state.player.maxHp, state.player.hp + 5); } },
  "bias-chip": { id: "bias-chip", name: "偏置芯片", price: 5, description: "当前选中滚筒的点数偏置 +1。", apply(state) { const reel = getSelectedReel(state); if (!reel) return false; reel.bias = (reel.bias ?? 0) + 1; return true; } },
  "reroll-core": { id: "reroll-core", name: "重铸核心", price: 7, description: "将当前选中滚筒重铸为随机新滚筒。", apply(state) { const source = REEL_LIBRARY[Math.floor(Math.random() * REEL_LIBRARY.length)]; const index = getSelectedReelIndex(state); if (index < 0) return false; state.reels[index] = structuredClone(source); return true; } },
  "split-core": { id: "split-core", name: "分裂核心", price: 8, description: "将当前选中滚筒拆分成两个较小滚筒。", apply(state) { return splitSelectedReel(state); } },
  "clone-core": { id: "clone-core", name: "裂变核心", price: 9, description: "复制当前选中滚筒的一半规模副本。", apply(state) { return cloneSelectedReel(state); } },
  "swap-element": { id: "swap-element", name: "属性改写", price: 4, description: "替换当前选中滚筒的首个元素属性。", apply(state) { return swapSelectedElement(state); } },
  "max-hp-chip": { id: "max-hp-chip", name: "生命框架", price: 7, description: "最大生命 +2，并立即恢复 2 点生命。", apply(state) { state.player.permanentMaxHpBonus += 2; state.player.hp += 2; return true; } },
  "attack-chip": { id: "attack-chip", name: "攻击伺服", price: 7, description: "基础攻速提升 12%。", apply(state) { state.player.baseFireRate *= 1.12; return true; } },
  "inject-fire": { id: "inject-fire", name: "火元素注入", price: 6, description: "向当前选中滚筒注入火元素。", apply(state) { return injectElement(state, "fire"); } },
  "inject-thunder": { id: "inject-thunder", name: "雷元素注入", price: 6, description: "向当前选中滚筒注入雷元素。", apply(state) { return injectElement(state, "thunder"); } },
  "inject-water": { id: "inject-water", name: "水元素注入", price: 6, description: "向当前选中滚筒注入水元素。", apply(state) { return injectElement(state, "water"); } },
  "inject-wood": { id: "inject-wood", name: "木元素注入", price: 6, description: "向当前选中滚筒注入木元素。", apply(state) { return injectElement(state, "wood"); } },
  "inject-wind": { id: "inject-wind", name: "风元素注入", price: 6, description: "向当前选中滚筒注入风元素。", apply(state) { return injectElement(state, "wind"); } },
  "rest-heal": { id: "rest-heal", name: "野战医疗舱", price: 0, description: "完全恢复生命。", apply(state) { state.player.hp = state.player.maxHp; return true; } },
  "rest-growth": { id: "rest-growth", name: "成长血清", price: 0, description: "最大生命 +3，并立即恢复 3 点生命。", apply(state) { state.player.permanentMaxHpBonus += 3; state.player.hp += 3; return true; } },
  "rest-focus": { id: "rest-focus", name: "聚焦校准", price: 0, description: "基础攻速 +18%，弹速 +10%。", apply(state) { state.player.baseFireRate *= 1.18; state.player.baseProjectileSpeed *= 1.1; return true; } },
};

export const SKILL_LIBRARY = [
  { id: "flare-burst", name: "灼焰迸发", quality: "normal", elements: ["fire"], description: "向周身释放 6 枚火焰爆裂弹。", effects: [{ type: "radialBurst", count: 6, speedScale: 0.28, color: "#ff8a5b", damage: 2 }] },
  { id: "gale-step", name: "疾风步", quality: "normal", elements: ["wind"], description: "4 秒内移动速度提升 60%。", effects: [{ type: "timedModifier", stat: "speed", multiplier: 1.6, duration: 4 }] },
  { id: "tidal-shell", name: "潮汐护壳", quality: "rare", elements: ["water", "wood"], description: "恢复 2 点生命，并在 4 秒内减伤 50%。", effects: [{ type: "heal", amount: 2 }, { type: "timedModifier", stat: "damageReduction", multiplier: 0.5, duration: 4 }] },
  { id: "spark-link", name: "雷链追击", quality: "rare", elements: ["thunder"], description: "释放 3 枚追踪雷弹，可触发连锁。", effects: [{ type: "homingShots", count: 3, damage: 3, speedScale: 1.15, color: "#d0b7ff", chainChance: 0.25 }] },
  { id: "verdant-pulse", name: "青木脉冲", quality: "epic", elements: ["wood"], description: "最大生命 +1，并恢复 4 点生命。", effects: [{ type: "increaseMaxHp", amount: 1 }, { type: "heal", amount: 4 }] },
  { id: "monsoon-drive", name: "季风驱动", quality: "epic", elements: ["water", "wind"], description: "朝前方泼洒 8 枚季风弹幕。", effects: [{ type: "forwardSpread", count: 8, speedScale: 0.32, color: "#7ad7ff", damage: 2 }] },
  { id: "voltaic-lattice", name: "伏特矩阵", quality: "epic", elements: ["thunder", "fire"], description: "8 秒内攻速提升，并强化连锁概率。", effects: [{ type: "timedModifier", stat: "fireRate", multiplier: 1.35, duration: 8 }, { type: "timedModifier", stat: "chainChance", multiplier: 1.8, duration: 8 }] },
  { id: "perfect-overdrive", name: "极限超载", quality: "perfect", elements: ["fire", "thunder"], description: "10 秒内大幅提升攻速与弹速。", effects: [{ type: "timedModifier", stat: "fireRate", multiplier: 1.8, duration: 10 }, { type: "timedModifier", stat: "projectileSpeed", multiplier: 1.5, duration: 10 }] },
  { id: "ember-echo", name: "余烬回响", quality: "rare", elements: ["fire", "wind"], description: "连续两次释放环形余烬爆裂。", effects: [{ type: "repeat", count: 2, effects: [{ type: "radialBurst", count: 5, speedScale: 0.26, color: "#ff9b67", damage: 2, splashDamage: 1, radius: 0.11 }] }] },
  { id: "torrent-lance", name: "洪流穿枪", quality: "epic", elements: ["water", "thunder"], description: "射出可穿透并减速的洪流长枪。", effects: [{ type: "forwardSpread", count: 4, speedScale: 0.36, color: "#86e0ff", damage: 3, pierceLeft: 1, slowOnHit: 0.2, rangeScale: 1.1, spreadStep: 0.08 }] },
  { id: "storm-recital", name: "风暴咏叹", quality: "epic", elements: ["wind", "thunder"], description: "连续生成多轮追踪风雷弹。", effects: [{ type: "repeat", count: 3, effects: [{ type: "homingShots", count: 2, damage: 2, speedScale: 1.2, color: "#c6c3ff", chainChance: 0.15 }] }] },
  { id: "evergreen-oath", name: "常青誓约", quality: "perfect", elements: ["wood", "water"], description: "提升生命上限、恢复生命并短暂加速。", effects: [{ type: "increaseMaxHp", amount: 2 }, { type: "heal", amount: 5 }, { type: "timedModifier", stat: "speed", multiplier: 1.35, duration: 8 }] },
  { id: "frost-ward", name: "霜镜护场", quality: "rare", elements: ["water", "wind"], description: "获得护盾，并在周围形成减速冰环。", effects: [{ type: "grantShield", amount: 4, duration: 5 }, { type: "pulseAura", duration: 4, interval: 0.45, radius: 1.6, damage: 1, slowOnHit: 0.3, color: "rgba(140, 225, 255, 0.18)" }] },
  { id: "delayed-sunburst", name: "迟滞日珥", quality: "epic", elements: ["fire", "thunder"], description: "短暂延迟后爆发一圈高伤日珥。", effects: [{ type: "delayedEffects", delay: 0.55, effects: [{ type: "radialBurst", count: 10, speedScale: 0.34, color: "#ffb26b", damage: 4, splashDamage: 1 }] }] },
  { id: "sanctuary-ring", name: "回春圣环", quality: "perfect", elements: ["wood", "water"], description: "生成护盾与持续回复光环。", effects: [{ type: "grantShield", amount: 5, duration: 6 }, { type: "pulseAura", duration: 6, interval: 0.75, radius: 1.9, damage: 1, healPerPulse: 1, color: "rgba(132, 222, 148, 0.18)" }] },
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

function swapSelectedElement(state) {
  const reel = getSelectedReel(state);
  if (!reel || reel.elements.length === 0) return false;
  const pool = ["fire", "water", "wood", "wind", "thunder"].filter((element) => !reel.elements.includes(element));
  if (pool.length === 0) return false;
  reel.elements[0] = pool[Math.floor(Math.random() * pool.length)];
  return true;
}
