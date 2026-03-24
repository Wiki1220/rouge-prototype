import { GAME_CONFIG, REEL_LIBRARY, SHOP_ITEM_LIBRARY, SKILL_LIBRARY, WAVE_DEFINITIONS } from "./config.js";
import { formatElementList, getReadableText, getSkillLabel } from "./labels.js";
import { resolveLeadingElements } from "./reel-logic.js";

export function getCurrentWave(state) {
  return WAVE_DEFINITIONS[state.waveIndex - 1];
}

export function getWaveLabel(wave, endlessLevel) {
  if (wave.endless) {
    const endlessStartIndex = WAVE_DEFINITIONS.findIndex((entry) => entry.endless);
    const endlessWaveNumber = endlessStartIndex === -1 ? WAVE_DEFINITIONS.length : endlessStartIndex + 1;
    return `第${endlessWaveNumber}波之后 · 无尽 ${endlessLevel}`;
  }
  const fallback = wave.type === "combat"
    ? `第${wave.id}波 战斗`
    : wave.mode === "treasure"
      ? `第${wave.id}波 宝箱房`
      : wave.mode === "rest"
        ? `第${wave.id}波 休息房`
        : `第${wave.id}波`;
  return getReadableText(wave.label, fallback);
}

export function buildOfferFromId(id) {
  const reel = REEL_LIBRARY.find((entry) => entry.id === id);
  if (reel) {
    return {
      id: reel.id,
      name: `新增 d${reel.sides} 滚筒`,
      price: reel.price,
      description: `获得一个 d${reel.sides} 滚筒，属性为 ${formatElementList(reel.elements)}。`,
      apply(targetState) {
        if (targetState.reels.length >= GAME_CONFIG.maxReels) return false;
        targetState.reels.push(structuredClone(reel));
        return true;
      },
    };
  }
  return SHOP_ITEM_LIBRARY[id];
}

export function getCurrentSkillPoolPreview(state) {
  const elements = resolveLeadingElements(state);
  const pool = SKILL_LIBRARY
    .filter((skill) => elements.length === 0 || skill.elements.some((element) => elements.includes(element)))
    .sort((a, b) => getSkillLabel(a).localeCompare(getSkillLabel(b), "zh-CN"))
    .slice(0, 8);
  return pool.length > 0 ? pool : SKILL_LIBRARY.slice(0, 8);
}

export function buildEndlessBudget(level) {
  const pool = ["bruiser", "runner", "turret", "sniper", "trail", "ember"];
  const primary = pool[level % pool.length];
  const secondary = pool[(level + 2) % pool.length];
  const budget = [
    { enemyId: primary, count: 5 + Math.min(8, level) },
    { enemyId: secondary, count: 3 + Math.floor(level / 2) },
  ];
  if (level >= 2) budget.push({ enemyId: "eliteDash", count: 1 });
  if (level >= 3) budget.push({ enemyId: level % 2 === 0 ? "eliteNest" : "eliteRevive", count: 1 });
  if (level >= 5) budget.push({ enemyId: "turret", count: 1 + Math.floor(level / 3) });
  return budget;
}

export function buildEndlessShopOffers(level) {
  const reelOffers = ["d18-windthunder", "d20-firewood", "d16-thunderfire"];
  const utilityOffers = ["clone-core", "split-core", "reroll-core", "heal-large", "attack-chip", "max-hp-chip", "swap-element"];
  const base = reelOffers[level % reelOffers.length];
  const first = utilityOffers[level % utilityOffers.length];
  const second = utilityOffers[(level + 3) % utilityOffers.length];
  return [base, first, second];
}
