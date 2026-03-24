import { WAVE_DEFINITIONS } from "./config.js";
import { formatElementLabel, formatElementList, getOfferDescription, getOfferLabel, getSkillLabel } from "./labels.js";
import {
  buildReelDistribution,
  computeCritFaces,
  computeResonance,
  getCurrentQualitySummary,
  getNextQualityGoal,
  getValueSlotSum,
  resolveLeadingElements,
} from "./reel-logic.js";
import { getCurrentSkillPoolPreview, getCurrentWave, getWaveLabel } from "./progression.js";

function renderDistributionChart(state) {
  const distribution = buildReelDistribution(state);
  if (distribution.length === 0) {
    return `<div class="distribution-empty">暂无分布</div>`;
  }
  const maxCount = Math.max(...distribution.map((entry) => entry.count), 1);
  const latestValue = state.nextValueSlotIndex > 0
    ? state.valueSlots[state.nextValueSlotIndex - 1]
    : state.valueSlots[state.valueSlots.length - 1];
  return `
    <div class="distribution-chart">
      ${distribution.map((entry) => {
        const height = Math.max(12, Math.round((entry.count / maxCount) * 100));
        const activeClass = latestValue === entry.value ? " active" : "";
        return `
          <div class="distribution-bar${activeClass}">
            <span class="distribution-fill" style="height: ${height}%"></span>
            <span class="distribution-value">${entry.value}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReelVisual(reel, selectedFaceIndex = -1) {
  const faces = Array.isArray(reel.faces) && reel.faces.length > 0
    ? reel.faces
    : Array.from({ length: reel.sides }, (_, index) => index + 1);
  if (!reel.transformLocked) {
    return `<div class="reel-face-line">${faces.map((value, index) => index === selectedFaceIndex ? `<span class="face-chip selected">${value}</span>` : `<span class="face-chip">${value}</span>`).join("")}</div>`;
  }
  const splitIndex = Math.ceil(faces.length / 2);
  const topFaces = faces.slice(0, splitIndex);
  const bottomFaces = faces.slice(splitIndex);
  return `
    <div class="reel-stack">
      <div class="reel-stack-part">${topFaces.map((value, index) => index === selectedFaceIndex ? `<span class="face-chip selected">${value}</span>` : `<span class="face-chip">${value}</span>`).join("")}</div>
      <div class="reel-stack-part">${bottomFaces.map((value, index) => index + splitIndex === selectedFaceIndex ? `<span class="face-chip selected">${value}</span>` : `<span class="face-chip">${value}</span>`).join("")}</div>
    </div>
  `;
}

function renderQualityAxis(sum) {
  const maxScore = 96;
  const pointer = Math.max(0, Math.min(100, (sum / maxScore) * 100));
  return `
    <div class="quality-axis">
      <div class="quality-track">
        <span class="quality-stop normal" style="left: 0%">普通</span>
        <span class="quality-stop rare" style="left: 46.9%">稀有</span>
        <span class="quality-stop epic" style="left: 70.8%">史诗</span>
        <span class="quality-stop perfect" style="left: 85.4%">完美</span>
        <span class="quality-pointer" style="left: ${pointer}%"></span>
      </div>
      <div class="quality-axis-labels">
        <span>0</span>
        <span>45</span>
        <span>68</span>
        <span>82+</span>
      </div>
    </div>
  `;
}

function renderSkillCard(title, skill, fallback) {
  return `<div class="skill-pill"><span class="skill-key">${title}</span><span class="skill-name">${getSkillLabel(skill) || fallback}</span></div>`;
}

export function renderHud(state) {
  const resonance = computeResonance(state);
  const sum = getValueSlotSum(state);
  const leadingElements = resolveLeadingElements(state);
  const critFaces = computeCritFaces(state);
  const resonanceText = Object.entries(resonance.counts)
    .filter(([, count]) => count > 0)
    .map(([element, count]) => `${formatElementLabel(element)}:${count}`)
    .join(" ") || "无";
  return `
    <div class="hud-cluster hud-top-left">
    <div class="hud-card hud-slim-card">
        <div class="hud-title-row hud-inline-row">
          <span class="hud-title">状态</span>
          <span class="subvalue">HP ${state.player.hp}/${state.player.maxHp}</span>
          ${(state.player.tempHp ?? 0) > 0 ? `<span class="subvalue">临时 ${state.player.tempHp}</span>` : ""}
          <span class="subvalue">金 ${state.gold}</span>
          ${state.debugNoDamage ? `<span class="subvalue">无敌</span>` : ""}
        </div>
      </div>
      <div class="hud-card hud-side-card">
        <div class="hud-title-row">
          <span class="hud-title">滚筒</span>
          <span class="chip">${resonanceText}</span>
        </div>
        <div class="grid reel-column">
          ${state.reels.map((reel, index) => `
            <div class="box compact ${(index === state.activeReelIndex ? "highlight" : "") + (index === state.selectedReelIndex && state.phase === "shop" ? " selected" : "")}">
              <span class="label">d${reel.sides}</span>
              <div class="value">${reel.lastValue ?? "..."}</div>
              <div class="subvalue">${formatElementList(reel.elements)}${reel.bias ? ` | 偏置 +${reel.bias}` : ""}${reel.transformLocked ? " | 已变构" : ""}</div>
              ${renderReelVisual(reel)}
            </div>`).join("")}
        </div>
      </div>
    </div>
    <div class="hud-cluster hud-right-side">
      <div class="hud-card hud-side-card">
        <div class="hud-title-row">
          <span class="hud-title">记录</span>
          <span class="chip">${state.kills}</span>
        </div>
        <div class="grid value-column">
          ${state.valueSlots.map((value, index) => `
            <div class="box compact ${index === state.nextValueSlotIndex ? "highlight" : ""}">
              <span class="label">槽 ${index + 1}</span>
              <div class="value">${value ?? "-"}</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="hud-card hud-side-card">
        <div class="hud-title-row">
          <span class="hud-title">结算</span>
          <span class="chip">${getCurrentQualitySummary(state)}</span>
        </div>
        <div class="info-stack">
          <div class="compact-info">
            <span class="label">当前总和</span>
            <div class="value">${sum}</div>
          </div>
          <div class="compact-info">
            <span class="label">下一目标</span>
            <div class="subvalue">${getNextQualityGoal(state)}</div>
          </div>
          <div class="compact-info">
            <span class="label">构筑结果</span>
            <div class="subvalue">${leadingElements.length > 0 ? formatElementList(leadingElements) : "待记录"}</div>
          </div>
          <div class="compact-info">
            <span class="label">暴击滚面</span>
            <div class="subvalue">d${critFaces}</div>
          </div>
        </div>
        <div class="compact-info">
          <span class="label">点数分布</span>
          ${renderDistributionChart(state)}
        </div>
        ${renderQualityAxis(sum)}
      </div>
    </div>
    <div class="hud-cluster hud-bottom-center">
      <div class="hud-card hud-bottom-strip">
        <div class="skill-strip">
          ${renderSkillCard("J", state.pendingSkillChoices?.[0], "未抽取")}
          ${renderSkillCard("K", state.pendingSkillChoices?.[1], "未抽取")}
          ${renderSkillCard("空格", state.confirmedSkill, state.confirmedSkill ? "待充能" : "空槽")}
        </div>
      </div>
    </div>
  `;
}

export function renderOverlay(state) {
  const wave = getCurrentWave(state);
  if (state.phase === "shop") {
    const possiblePool = getCurrentSkillPoolPreview(state);
    return `
      <div class="overlay-card">
        <h3>商店阶段</h3>
        <div class="info-list">
          <div class="dev-stat">
            <div class="chip">当前滚筒</div>
            <div class="offer-grid">${state.reels.map((reel, index) => `<div class="offer ${index === state.selectedReelIndex ? "selected" : ""}"><div class="value">d${reel.sides}</div><p>${formatElementList(reel.elements)}</p>${renderReelVisual(reel, index === state.selectedReelIndex ? state.selectedFaceIndex : -1)}<p>卖价：${reel.sellPrice ?? Math.max(1, Math.floor(reel.price / 2))}</p><p>${reel.transformLocked ? "已执行过分裂/裂变" : "可继续变构"}</p></div>`).join("")}</div>
          </div>
          <div class="dev-stat">
            <div class="chip">本店商品</div>
            <div class="offer-grid">${state.shopOffers.map((offer, index) => `<div class="offer"><div class="chip">${index + 1}</div><div class="value">${getOfferLabel(offer)}</div><p>价格：${offer.price}</p><p>${getOfferDescription(offer)}</p></div>`).join("")}</div>
          </div>
          <div class="dev-stat">
            <div class="chip">当前技能池</div>
            <div class="grid">${possiblePool.map((skill) => `<div class="box compact"><span class="value">${getSkillLabel(skill)}</span><div class="subvalue">${skill.quality} / ${formatElementList(skill.elements)}</div></div>`).join("")}</div>
          </div>
        </div>
        <div class="overlay-actions">
          <button type="button" class="overlay-button" data-overlay-action="advance-room">准备好了，下一关</button>
        </div>
        <div class="footer-note">按 1/2/3 购买，左右方向键切换滚筒，上下方向键选择滚面，X 售出当前滚筒，空格继续。当前金币：${state.gold}</div>
      </div>`;
  }
  if (state.phase === "reward") {
    if (wave.mode === "treasure") {
      const possiblePool = getCurrentSkillPoolPreview(state);
      return `
      <div class="overlay-card">
        <h3>${getWaveLabel(wave, state.endlessLevel)}</h3>
        <div class="info-list">
          <div class="dev-stat">
            <div class="chip">场内奖励</div>
            <div class="offer-grid">${state.roomOffers.map((offer, index) => `<div class="offer ${offer.taken ? "taken" : ""}"><div class="chip">${index + 1}</div><div class="value">${getOfferLabel(offer)}</div><p>${getOfferDescription(offer)}</p><p>${offer.taken ? "已领取" : "移动拾取"}</p></div>`).join("")}</div>
          </div>
          <div class="dev-stat">
            <div class="chip">构筑技能池</div>
            <div class="grid">${possiblePool.map((skill) => `<div class="box compact"><span class="value">${getSkillLabel(skill)}</span><div class="subvalue">${skill.quality} / ${formatElementList(skill.elements)}</div></div>`).join("")}</div>
          </div>
        </div>
        ${state.roomSelectionsLeft <= 0 ? `<div class="overlay-actions"><button type="button" class="overlay-button" data-overlay-action="advance-room">离开宝箱房</button></div>` : ""}
        <div class="footer-note">剩余可选次数：${state.roomSelectionsLeft}。用 WASD 移动拾取奖励，拿满后按空格继续。</div>
      </div>`;
    }
    return `
      <div class="overlay-card">
        <h3>${getWaveLabel(wave, state.endlessLevel)}</h3>
        <div class="offer-grid">${state.roomOffers.map((offer, index) => `<div class="offer ${offer.taken ? "taken" : ""}"><div class="chip">${index + 1}</div><div class="value">${getOfferLabel(offer)}</div><p>${getOfferDescription(offer)}</p><p>${offer.taken ? "已领取" : "可领取"}</p></div>`).join("")}</div>
        ${state.roomSelectionsLeft <= 0 ? `<div class="overlay-actions"><button type="button" class="overlay-button" data-overlay-action="advance-room">进入下一关</button></div>` : ""}
        <div class="footer-note">剩余可选次数：${state.roomSelectionsLeft}。按 1-${Math.min(5, state.roomOffers.length)} 领取奖励，完成后按空格继续。</div>
      </div>`;
  }
  if (state.phase === "gameover") {
    return `<div class="overlay-card"><h3>本局失败</h3><div class="footer-note">按 R 重新开始。本局击杀 ${state.kills} 个敌人，止步于第 ${state.waveIndex} 波。</div></div>`;
  }
  if (state.phase === "victory") {
    return `<div class="overlay-card"><h3>原型通关</h3><div class="footer-note">你已完成 ${WAVE_DEFINITIONS.length} 波流程。按 R 可以重新开始下一局测试。</div></div>`;
  }
  return "";
}
