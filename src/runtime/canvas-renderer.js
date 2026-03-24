import { GAME_CONFIG } from "./config.js";
import { formatBuffLabel } from "./labels.js";
import { clamp } from "./utils.js";

export function createCanvasRenderer({ canvas, ctx, getState, getCurrentWave, getWaveLabel, getResonanceValue }) {
  let frameUnit = 1;
  let frameCamera = { x: 0, y: 0 };

  function render() {
    frameUnit = getViewUnit();
    frameCamera = getCameraPosition();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawArena();
    drawAuras();
    drawTelegraphs();
    drawRewardPickups();
    drawHazards();
    drawProjectiles();
    drawEnemies();
    drawPlayer();
    drawStatusText();
  }

  function drawArena() {
    const unit = getViewUnit();
    const cellSize = unit * 0.98;
    for (let y = 0; y < GAME_CONFIG.arena.height; y += 1) {
      for (let x = 0; x < GAME_CONFIG.arena.width; x += 1) {
        const cellCenter = { x: x + 0.5, y: y + 0.5 };
        const position = toCanvasPosition(cellCenter);
        const isOuter = x < GAME_CONFIG.arena.playableInset || y < GAME_CONFIG.arena.playableInset || x >= GAME_CONFIG.arena.width - GAME_CONFIG.arena.playableInset || y >= GAME_CONFIG.arena.height - GAME_CONFIG.arena.playableInset;
        ctx.fillStyle = isOuter ? "#3d3114" : ((x + y) % 2 === 0 ? "#101a25" : "#132130");
        ctx.fillRect(position.x - cellSize / 2, position.y - cellSize / 2, cellSize, cellSize);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    const topLeft = toCanvasPosition({ x: 0, y: 0 });
    const bottomRight = toCanvasPosition({ x: GAME_CONFIG.arena.width, y: GAME_CONFIG.arena.height });
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    const spawnPoint = toCanvasPosition({ x: GAME_CONFIG.arena.width / 2, y: GAME_CONFIG.arena.height / 2 });
    ctx.save();
    ctx.strokeStyle = "rgba(244, 247, 251, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spawnPoint.x - 10, spawnPoint.y);
    ctx.lineTo(spawnPoint.x + 10, spawnPoint.y);
    ctx.moveTo(spawnPoint.x, spawnPoint.y - 10);
    ctx.lineTo(spawnPoint.x, spawnPoint.y + 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const state = getState();
    const position = toCanvasPosition(state.player.position);
    if ((state.player.tempHp ?? 0) > 0) {
      ctx.strokeStyle = "rgba(123, 226, 138, 0.85)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * (state.player.radius + 0.08), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.player.shield > 0) {
      ctx.strokeStyle = "rgba(116, 207, 255, 0.78)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * (state.player.radius + 0.15), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = state.player.invulnerabilityLeft > 0 ? "#9cd5ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * state.player.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemies() {
    const state = getState();
    for (const enemy of state.enemies) {
      const position = toCanvasPosition(enemy.position);
      ctx.fillStyle = enemy.frozenLeft > 0 ? "#9ee7ff" : enemy.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(position.x - 22, position.y - 30, 44, 6);
      ctx.fillStyle = enemy.isBoss ? "#ffd166" : "#7be28a";
      ctx.fillRect(position.x - 22, position.y - 30, 44 * (enemy.hp / enemy.maxHp), 6);
      if (enemy.buffTag) {
        ctx.fillStyle = "#f3f4f6";
        ctx.font = "10px Segoe UI";
        ctx.fillText(formatBuffLabel(enemy.buffTag), position.x - 5, position.y - 36);
      }
      if (enemy.frozenLeft > 0) {
        ctx.fillStyle = "#d7f4ff";
        ctx.font = "10px Segoe UI";
        ctx.fillText("冻", position.x + 8, position.y - 36);
      } else if ((enemy.rootedLeft ?? 0) > 0) {
        ctx.fillStyle = "#ffe0a6";
        ctx.font = "10px Segoe UI";
        ctx.fillText("缚", position.x + 8, position.y - 36);
      } else if ((enemy.chillStacks ?? 0) > 0) {
        ctx.fillStyle = "#b8ecff";
        ctx.font = "10px Segoe UI";
        ctx.fillText(`迟${enemy.chillStacks}`, position.x + 4, position.y - 36);
      }
    }
  }

  function drawTelegraphs() {
    const state = getState();
    for (const telegraph of state.telegraphs) {
      const alpha = 0.35 + Math.max(0, telegraph.timer) * 0.4;
      ctx.save();
      ctx.strokeStyle = telegraph.color.replace(/0\.[0-9]+|1\)/, `${Math.min(0.95, alpha)})`);
      ctx.lineWidth = 3;
      if (telegraph.kind === "line-volley") {
        const start = toCanvasPosition(telegraph.start);
        const end = toCanvasPosition(telegraph.end);
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (telegraph.kind === "meteor") {
        const position = toCanvasPosition(telegraph.position);
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * telegraph.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawAuras() {
    const state = getState();
    for (const aura of state.auras) {
      const position = toCanvasPosition(state.player.position);
      ctx.fillStyle = aura.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * aura.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = aura.color.replace("0.18", "0.42");
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawHazards() {
    const state = getState();
    for (const hazard of state.hazards) {
      const position = toCanvasPosition(hazard.position);
      if (hazard.type === "spike") {
        const active = (hazard.armLeft ?? 0) <= 0;
        ctx.strokeStyle = active ? "rgba(255, 244, 188, 0.92)" : "rgba(255, 244, 188, 0.55)";
        ctx.lineWidth = 2;
        const spikeRadius = GAME_CONFIG.arena.cellSize * hazard.radius;
        ctx.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
          const length = index % 2 === 0 ? spikeRadius : spikeRadius * 0.45;
          const x = position.x + Math.cos(angle) * length;
          const y = position.y + Math.sin(angle) * length;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = active ? "rgba(214, 200, 141, 0.42)" : "rgba(214, 200, 141, 0.22)";
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = hazard.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * hazard.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRewardPickups() {
    const state = getState();
    if (state.phase !== "reward" || getCurrentWave(state).mode !== "treasure") return;
    for (const pickup of state.roomPickups) {
      const offer = state.roomOffers[pickup.offerIndex];
      if (!offer || pickup.taken) continue;
      const position = toCanvasPosition(pickup.position);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * pickup.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "12px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(String(pickup.offerIndex + 1), position.x, position.y + 4);
      ctx.textAlign = "left";
    }
  }

  function drawProjectiles() {
    const state = getState();
    for (const projectile of state.projectiles) {
      const position = toCanvasPosition(projectile.position);
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStatusText() {
    const state = getState();
    const wave = getCurrentWave(state);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 18px Segoe UI";
    ctx.fillStyle = "rgba(230, 238, 247, 0.84)";
    ctx.fillText(getWaveLabel(wave, state.endlessLevel), canvas.width / 2, 34);
    if (state.lastCrit) {
      ctx.font = "600 14px Segoe UI";
      ctx.fillStyle = "#ffd166";
      ctx.fillText("暴击触发", canvas.width / 2, 56);
    }
    const highTierFlags = [];
    if (getResonanceValue(state, "waterFreezeEnabled")) highTierFlags.push("水6 冻结");
    if (getResonanceValue(state, "fireDoubleDamageChance") > 0) highTierFlags.push("火9 双爆");
    if (getResonanceValue(state, "tempHpPerWave") > 0) highTierFlags.push("木8 临时命");
    if (getResonanceValue(state, "extraProjectileChance") >= 0.25) highTierFlags.push("电9 追射");
    if (highTierFlags.length > 0) {
      ctx.font = "600 12px Segoe UI";
      ctx.fillStyle = "rgba(180, 214, 244, 0.84)";
      ctx.fillText(highTierFlags.join(" · "), canvas.width / 2, state.lastCrit ? 76 : 56);
    }
    ctx.restore();
  }

  function resizeCanvas() {
    const targetWidth = Math.max(1280, Math.floor(canvas.clientWidth || canvas.width));
    const targetHeight = Math.max(720, Math.floor(canvas.clientHeight || canvas.height));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  function getViewUnit() {
    const widthUnit = canvas.width / GAME_CONFIG.arena.visibleWidth;
    const heightUnit = canvas.height / GAME_CONFIG.arena.visibleHeight;
    return Math.min(widthUnit, heightUnit);
  }

  function getCameraPosition() {
    const state = getState();
    const halfWidth = GAME_CONFIG.arena.visibleWidth / 2;
    const halfHeight = GAME_CONFIG.arena.visibleHeight / 2;
    return {
      x: clamp(state.player.position.x, halfWidth, GAME_CONFIG.arena.width - halfWidth),
      y: clamp(state.player.position.y, halfHeight, GAME_CONFIG.arena.height - halfHeight),
    };
  }

  function toCanvasPosition(gridPosition) {
    return {
      x: (gridPosition.x - frameCamera.x) * frameUnit + canvas.width / 2,
      y: (gridPosition.y - frameCamera.y) * frameUnit + canvas.height / 2,
    };
  }

  return {
    render,
    resizeCanvas,
  };
}
