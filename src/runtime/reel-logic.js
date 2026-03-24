import { GAME_CONFIG } from "./config.js";
import { formatElementLabel } from "./labels.js";

export function computeCritFaces(state) {
  return Math.max(1, GAME_CONFIG.critical.baseFaces - new Set(state.reels.map((reel) => reel.sides)).size);
}

export function resolveQualities(sum) {
  if (sum === 69) return ["epic", "rare"];
  if (sum === 90) return ["epic", "perfect"];
  if (sum === 46) return ["rare", "normal"];
  return GAME_CONFIG.damageQualityThresholds.filter((entry) => sum >= entry.min && sum <= entry.max).map((entry) => entry.id);
}

export function getValueSlotSum(state) {
  return state.valueSlots.reduce((acc, value) => acc + (value ?? 0), 0);
}

export function formatQualityLabel(quality) {
  return {
    normal: "普通",
    rare: "稀有",
    epic: "史诗",
    perfect: "完美",
  }[quality] ?? quality;
}

export function getCurrentQualitySummary(state) {
  const sum = getValueSlotSum(state);
  const qualities = resolveQualities(sum);
  return qualities.map((quality) => formatQualityLabel(quality)).join(" / ") || "未定";
}

export function getNextQualityGoal(state) {
  const sum = getValueSlotSum(state);
  if (sum < 45) return "稀有 45";
  if (sum < 68) return "史诗 68";
  if (sum < 82) return "完美 82";
  return "已达完美";
}

export function buildReelDistribution(state) {
  const counts = new Map();
  for (const reel of state.reels) {
    const faces = Array.isArray(reel.faces) && reel.faces.length > 0
      ? reel.faces
      : Array.from({ length: reel.sides }, (_, index) => index + 1);
    for (const face of faces) {
      const value = face + (reel.bias ?? 0);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
}

export function resolveLeadingElements(state) {
  const ranked = state.reels
    .map((reel, index) => {
      const faces = Array.isArray(reel.faces) && reel.faces.length > 0
        ? reel.faces
        : Array.from({ length: reel.sides }, (_, faceIndex) => faceIndex + 1);
      const maxFaceValue = faces.reduce((maxValue, value) => Math.max(maxValue, value), 0);
      return {
        reelIndex: index,
        maxValue: maxFaceValue + (reel.bias ?? 0),
      };
    })
    .sort((a, b) => b.maxValue - a.maxValue)
    .slice(0, 2);
  const leading = new Set();
  for (const entry of ranked) {
    const reel = state.reels[entry.reelIndex];
    for (const element of reel?.elements ?? []) leading.add(element);
  }
  return [...leading];
}

export function countElements(state) {
  const counts = { fire: 0, water: 0, wood: 0, wind: 0, thunder: 0 };
  for (const reel of state.reels) {
    for (const element of reel.elements) counts[element] = (counts[element] ?? 0) + 1;
  }
  return counts;
}

export function computeResonance(state) {
  const counts = countElements(state);
  const bonuses = {
    flatDamage: Math.floor((counts.fire ?? 0) / 3),
    speed: Math.floor((counts.wind ?? 0) / 2) * 0.05,
    slowOnHit: Math.floor((counts.water ?? 0) / 2) * 0.05,
    regen: 0,
    chainChance: 0,
    splashDamage: counts.fire >= 9 ? 4 : 0,
    pierceShots: counts.wind >= 9 ? 1 : 0,
    bonusMaxHp: 0,
    bonusProjectiles: 0,
    healOnCast: 0,
    fireRateFlat: Math.floor((counts.wind ?? 0) / 2) * 0.5,
    waterFreezeEnabled: counts.water >= 6 ? 1 : 0,
    fireDoubleDamageChance: counts.fire >= 9 ? 0.3 : 0,
    woodWaveHeal: counts.wood >= 2 ? 1 : 0,
    woodOnHitHealChance: counts.wood >= 8 ? 0.1 : 0,
    woodOverflowHealingEnabled: counts.wood >= 8 ? 1 : 0,
    tempHpPerWave: counts.wood >= 8 ? 2 : 0,
    extraProjectileChance: counts.thunder >= 9 ? 0.25 : counts.thunder > 0 ? 0.1 : 0,
    thunderRollCount: counts.thunder ?? 0,
    thunderDamagePenalty: counts.thunder >= 9 ? 2 : 0,
  };
  return { counts, bonuses };
}

export function getResonanceValue(state, stat) {
  return computeResonance(state).bonuses[stat] ?? 0;
}

export function formatResonanceCounts(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([element, count]) => `${formatElementLabel(element)}:${count}`)
    .join(" ") || "无";
}
