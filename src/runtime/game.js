import {
  ENEMY_ARCHETYPES,
  GAME_CONFIG,
  SKILL_LIBRARY,
  WAVE_DEFINITIONS,
  getLuckMultiplier,
} from "./config.js";
import { getEnemyLabel } from "./labels.js";
import {
  buildEndlessBudget,
  buildEndlessShopOffers,
  buildOfferFromId,
  getCurrentWave,
  getWaveLabel,
} from "./progression.js";
import {
  computeCritFaces,
  getResonanceValue,
  resolveLeadingElements,
  resolveQualities,
} from "./reel-logic.js";
import { clampSelectedFace, clampSelectedReel, moveSelectedFace, moveSelectedReel } from "./selection.js";
import { createDefaultStatTuning, createInitialState, createInput, rotateVector } from "./state.js";
import { createCanvasRenderer } from "./canvas-renderer.js";
import { renderHud, renderOverlay } from "./ui.js";
import { clamp, distance, normalize, pickUnique, randomInt } from "./utils.js";

export function createGame({ canvas, hudRoot, overlayRoot, options = {} }) {
  const ctx = canvas.getContext("2d");
  const input = createInput();
  let state = createInitialState(options);
  let lastTime = performance.now();
  let running = false;
  let lastHudMarkup = "";
  let lastOverlayMarkup = "";
  const renderer = createCanvasRenderer({
    canvas,
    ctx,
    getState: () => state,
    getCurrentWave,
    getWaveLabel,
    getResonanceValue,
  });

  renderer.resizeCanvas();
  overlayRoot.addEventListener("click", handleOverlayClick);

  const game = {
    start,
    stop,
    restart,
    toggleDebugNoDamage,
    addGold,
    healFull,
    skipRoom,
    forceSkillChoices,
    spawnRadialBurst,
    spawnForwardSpread,
    spawnHomingShots,
    healPlayer,
    addTimedModifier,
    increaseMaxHp,
    addShield,
    queueDelayedEffects,
    addPulseAura,
  };

  beginWave(state, options.startWave ?? 1);
  updateHud();

  function start() {
    if (running) return;
    running = true;
    window.addEventListener("keydown", input.onKeyDown);
    window.addEventListener("keyup", input.onKeyUp);
    window.addEventListener("resize", renderer.resizeCanvas);
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    window.removeEventListener("keydown", input.onKeyDown);
    window.removeEventListener("keyup", input.onKeyUp);
    window.removeEventListener("resize", renderer.resizeCanvas);
  }

  function restart() {
    state = createInitialState(options);
    lastHudMarkup = "";
    lastOverlayMarkup = "";
    beginWave(state, options.startWave ?? 1);
  }

  function toggleDebugNoDamage(force) {
    state.debugNoDamage = typeof force === "boolean" ? force : !state.debugNoDamage;
    announceBossPhase(state.debugNoDamage ? "测试无敌已开启" : "测试无敌已关闭");
  }

  function addGold(amount) {
    state.gold = Math.max(0, state.gold + amount);
  }

  function healFull() {
    state.player.hp = state.player.maxHp;
  }

  function skipRoom() {
    if (state.phase === "battle") {
      state.spawnQueue = [];
      state.enemies = [];
      state.projectiles = [];
      state.hazards = [];
      state.telegraphs = [];
      completeCurrentBattle();
      return;
    }
    if (state.phase === "shop" || state.phase === "reward") {
      advanceFromRoom();
    }
  }

  function forceSkillChoices() {
    if (state.phase !== "battle") return;
    state.pendingSkillChoices = getSkillChoicesFromCurrentRecord();
  }

  function getSkillChoicesFromCurrentRecord() {
    const filled = state.valueSlots.filter((entry) => entry !== null).length;
    if (filled === 0) return pickUnique(SKILL_LIBRARY, 2);
    return generateSkillChoices();
  }

  function loop(time) {
    if (!running) return;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    update(dt);
    renderer.render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.clock += dt;
    updateModifiers(dt);
    applyPassiveRegen(dt);
    updateBossAnnouncement(dt);
    if (input.consume("Equal")) {
      state.debugNoDamage = !state.debugNoDamage;
      announceBossPhase(state.debugNoDamage ? "测试无敌已开启" : "测试无敌已关闭");
    }

    if (state.phase === "battle") {
      updateScheduledEffects(dt);
      updateAuras(dt);
      updateBattle(dt);
    } else if (state.phase === "shop") {
      handleShopInput();
    } else if (state.phase === "reward") {
      if (getCurrentWave(state).mode === "treasure") {
        updateTreasureRoom(dt);
      } else {
        handleRewardInput();
      }
    } else if ((state.phase === "gameover" || state.phase === "victory") && input.consume("KeyR")) {
      state = createInitialState(options);
      lastHudMarkup = "";
      lastOverlayMarkup = "";
      beginWave(state, options.startWave ?? 1);
    }

    if (state.phase === "battle") {
      if (state.pendingSkillChoices && input.consume("KeyJ")) castPendingSkill(state.pendingSkillChoices[0]);
      if (state.pendingSkillChoices && input.consume("KeyK")) castPendingSkill(state.pendingSkillChoices[1]);
      if (state.pendingSkillChoices && input.consume("Space")) castConfirmedSkill();
    }

    if (state.phase === "shop") {
      if (input.consume("ArrowLeft")) moveSelectedReel(state, -1);
      if (input.consume("ArrowRight")) moveSelectedReel(state, 1);
      if (input.consume("KeyX")) sellSelectedReel();
    }

    updateHud();
    updateOverlay();
  }

  function updateBattle(dt) {
    movePlayer(dt);
    firePlayerProjectiles(dt);
    updateProjectiles(dt);
    updateEnemies(dt);
    updateHazards(dt);
    updateTelegraphs(dt);
    resolveCollisions();
    cleanupEntities();

    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = 0.45;
      }
    }

    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      completeCurrentBattle();
    }
  }

  function completeCurrentBattle() {
    const wave = getCurrentWave(state);
    if (wave.shopOffers && wave.shopOffers.length > 0) {
      openShop();
    } else {
      advanceFromRoom();
    }
  }

  function movePlayer(dt) {
    const moveX = (input.isDown("KeyD") ? 1 : 0) - (input.isDown("KeyA") ? 1 : 0);
    const moveY = (input.isDown("KeyS") ? 1 : 0) - (input.isDown("KeyW") ? 1 : 0);
    const hasMove = moveX !== 0 || moveY !== 0;
    const direction = hasMove ? normalize(moveX, moveY) : { x: 0, y: 0 };
    const speed = getStat("speed", state.player.baseSpeed);

    if (hasMove) state.player.direction = direction;

    state.player.position.x = clamp(
      state.player.position.x + direction.x * speed * dt,
      GAME_CONFIG.arena.playableInset + state.player.radius,
      GAME_CONFIG.arena.width - GAME_CONFIG.arena.playableInset - state.player.radius,
    );
    state.player.position.y = clamp(
      state.player.position.y + direction.y * speed * dt,
      GAME_CONFIG.arena.playableInset + state.player.radius,
      GAME_CONFIG.arena.height - GAME_CONFIG.arena.playableInset - state.player.radius,
    );
    state.player.invulnerabilityLeft = Math.max(0, state.player.invulnerabilityLeft - dt);
  }

  function firePlayerProjectiles(dt) {
    state.player.fireCooldown -= dt;
    const fireRate = getStat("fireRate", state.player.baseFireRate);
    if (state.player.fireCooldown > 0) return;

    const reel = state.reels[state.activeReelIndex];
    const reelFaces = Array.isArray(reel.faces) && reel.faces.length > 0
      ? reel.faces
      : Array.from({ length: reel.sides }, (_, index) => index + 1);
    const rolledFace = reelFaces[randomInt(0, reelFaces.length - 1)];
    const rolledValue = rolledFace + (reel.bias ?? 0);
    const critFaces = computeCritFaces(state);
    const isCrit = randomInt(1, critFaces) === 1;
    const fireDoubleDamageChance = getResonanceValue(state, "fireDoubleDamageChance");
    const doubledByFire = fireDoubleDamageChance > 0 && Math.random() < fireDoubleDamageChance;
    const damagePenalty = getResonanceValue(state, "thunderDamagePenalty");
    const damage = Math.max(1, rolledValue + getResonanceValue(state, "flatDamage") + (isCrit ? rolledValue : 0) + (doubledByFire ? rolledValue : 0) - damagePenalty);
    let projectileCount = 1;
    const thunderRolls = getResonanceValue(state, "thunderRollCount");
    const thunderShotChance = getResonanceValue(state, "extraProjectileChance");
    for (let rollIndex = 0; rollIndex < thunderRolls; rollIndex += 1) {
      if (thunderShotChance > 0 && Math.random() < thunderShotChance) {
        projectileCount += 1;
      }
    }
    const attackToken = `${state.waveIndex}-${state.clock.toFixed(4)}-${state.activeReelIndex}`;

    for (let index = 0; index < projectileCount; index += 1) {
      const angleOffset = projectileCount === 1 ? 0 : (index - (projectileCount - 1) / 2) * 0.16;
      const velocity = rotateVector(state.player.direction, angleOffset);
      state.projectiles.push({
        team: "player",
        position: { ...state.player.position },
        velocity,
        speed: getStat("projectileSpeed", state.player.baseProjectileSpeed),
        remainingRange: state.player.baseProjectileRange,
        radius: 0.11,
        damage,
        pierceLeft: getResonanceValue(state, "pierceShots"),
        splashDamage: getResonanceValue(state, "splashDamage"),
        slowOnHit: getResonanceValue(state, "slowOnHit"),
        chainChance: Math.min(0.95, getResonanceValue(state, "chainChance") * getStat("chainChance", 1)),
        controlPower: GAME_CONFIG.player.projectileControlPower,
        color: isCrit ? "#ffd166" : "#f3f4f6",
        sourceReelIndex: state.activeReelIndex,
        rolledValue,
        isCrit,
        attackToken,
        canRecordRoll: true,
      });
    }
    state.player.fireCooldown = 1 / Math.max(0.2, fireRate);
  }

  function updateProjectiles(dt) {
    for (const projectile of state.projectiles) {
      projectile.position.x += projectile.velocity.x * projectile.speed * dt;
      projectile.position.y += projectile.velocity.y * projectile.speed * dt;
      projectile.remainingRange -= projectile.speed * dt;
    }
  }

  function updateEnemies(dt) {
    for (const enemy of state.enemies) {
      enemy.frozenLeft = Math.max(0, (enemy.frozenLeft ?? 0) - dt);
      enemy.rootedLeft = Math.max(0, (enemy.rootedLeft ?? 0) - dt);
      enemy.slowLeft = Math.max(0, (enemy.slowLeft ?? 0) - dt);
      enemy.chillWindowLeft = Math.max(0, (enemy.chillWindowLeft ?? 0) - dt);
      if (enemy.chillWindowLeft <= 0) enemy.chillStacks = 0;
      enemy.speed = enemy.baseSpeed * (enemy.slowLeft > 0 ? 0.75 : 1);
      if (enemy.frozenLeft > 0 || enemy.rootedLeft > 0) {
        continue;
      }

      const toPlayer = {
        x: state.player.position.x - enemy.position.x,
        y: state.player.position.y - enemy.position.y,
      };
      const dist = Math.hypot(toPlayer.x, toPlayer.y) || 1;
      const dir = { x: toPlayer.x / dist, y: toPlayer.y / dist };
      const preferredRange = enemy.preferredRange ?? 0;
      const moveIntent = dist > preferredRange + 0.25 ? 1 : dist < preferredRange - 0.25 ? -0.5 : 0;

      if (enemy.isBoss) updateBossPhase(enemy);

      let moveSpeed = enemy.speed * (enemy.speedScale ?? 1);
      if (enemy.dash) {
        enemy.dashCooldown = Math.max(0, (enemy.dashCooldown ?? enemy.dash.cooldown) - dt);
        if ((enemy.dashTimeLeft ?? 0) > 0) {
          enemy.dashTimeLeft -= dt;
          moveSpeed = enemy.dash.speed;
        } else if (enemy.dashCooldown <= 0 && dist > 1.4) {
          enemy.dashTimeLeft = enemy.dash.duration;
          enemy.dashCooldown = enemy.dash.cooldown;
          announceBossPhase(getEnemyLabel(enemy));
        }
      }
      enemy.position.x = clamp(enemy.position.x + dir.x * moveSpeed * moveIntent * dt, 0.4, GAME_CONFIG.arena.width - 0.4);
      enemy.position.y = clamp(enemy.position.y + dir.y * moveSpeed * moveIntent * dt, 0.4, GAME_CONFIG.arena.height - 0.4);

      if (enemy.isBoss && (enemy.pendingSummons ?? 0) > 0) {
        enemy.summonCooldown -= dt;
        if (enemy.summonCooldown <= 0) {
          spawnBossReinforcements(1);
          enemy.pendingSummons -= 1;
          enemy.summonCooldown = enemy.phase >= 3 ? 1.1 : 1.6;
        }
      }

      if (enemy.id === "boss") {
        updateOverseerPattern(enemy, dir, dt);
      }

      if (enemy.id === "finalBoss") {
        enemy.novaCooldown = Math.max(0, (enemy.novaCooldown ?? 2.2) - dt);
        if (enemy.novaCooldown <= 0) {
          spawnBossNova(enemy);
          enemy.novaCooldown = enemy.phase >= 3 ? 1.6 : enemy.phase === 2 ? 2 : 2.6;
        }
        updateCrownCorePattern(enemy, dt);
      }

      if (enemy.trailHazard) {
        enemy.trailCooldown = Math.max(0, (enemy.trailCooldown ?? 0) - dt);
        if (enemy.trailCooldown <= 0) {
          spawnTrailHazard(enemy);
          enemy.trailCooldown = enemy.trailHazard.spawnInterval;
        }
      }

      if (enemy.trapHazard) {
        enemy.trapCooldown = Math.max(0, (enemy.trapCooldown ?? 0) - dt);
        if (enemy.trapCooldown <= 0) {
          spawnTrapHazard(enemy);
          enemy.trapCooldown = enemy.trapHazard.spawnInterval;
        }
      }

      if (enemy.projectile) {
        enemy.shotCooldown -= dt;
        if (enemy.shotCooldown <= 0 && dist <= enemy.projectile.range) {
          fireEnemyProjectile(enemy, dir);
          enemy.shotCooldown = enemy.projectile.cooldown / (enemy.fireRateScale ?? 1);
        }
      }

    }
  }

  function fireEnemyProjectile(enemy, direction) {
    const burstCount = enemy.projectile.burstCount ?? 1;
    const spread = enemy.projectile.spread ?? 0;
    const projectileSpeed = enemy.projectile.speed * (enemy.projectileSpeedScale ?? 1);
    const projectileDamage = enemy.projectile.damage + (enemy.projectileDamageBonus ?? 0);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = burstCount === 1 ? 0 : (index - (burstCount - 1) / 2) * spread;
      state.projectiles.push({
        team: "enemy",
        position: { ...enemy.position },
        velocity: rotateVector(direction, angle),
        speed: projectileSpeed,
        remainingRange: enemy.projectile.range,
        radius: enemy.projectile.radius,
        damage: projectileDamage,
        color: enemy.projectile.color,
      });
    }
  }

  function spawnBossNova(enemy) {
    const burstCount = enemy.phase >= 3 ? 16 : enemy.phase === 2 ? 12 : 8;
    const speed = (enemy.projectile?.speed ?? 5) * (enemy.phase >= 3 ? 1.18 : 1);
    const damage = (enemy.projectile?.damage ?? 1) + (enemy.phase >= 3 ? 1 : 0);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index) / burstCount;
      state.projectiles.push({
        team: "enemy",
        position: { ...enemy.position },
        velocity: { x: Math.cos(angle), y: Math.sin(angle) },
        speed,
        remainingRange: 7.5,
        radius: 0.1,
        damage,
        color: "#ff8ca1",
      });
    }
    announceBossPhase(`${getEnemyLabel(enemy)} 释放环形爆发`);
  }

  function updateOverseerPattern(enemy, direction, dt) {
    enemy.barrageCooldown = Math.max(0, (enemy.barrageCooldown ?? 3.8) - dt);
    if ((enemy.barrageWindup ?? 0) > 0) {
      enemy.barrageWindup -= dt;
      if (enemy.barrageWindup <= 0 && enemy.lockedDirection) {
        fireLockedVolley(enemy);
      }
      return;
    }
    if (enemy.barrageCooldown <= 0) {
      queueLockedVolley(enemy, direction);
      enemy.barrageCooldown = enemy.phase >= 3 ? 2.2 : enemy.phase === 2 ? 2.8 : 3.6;
    }
  }

  function queueLockedVolley(enemy, direction) {
    const reach = 7.4;
    enemy.barrageWindup = 0.68;
    enemy.lockedDirection = { ...direction };
    const start = { ...enemy.position };
    const end = {
      x: start.x + direction.x * reach,
      y: start.y + direction.y * reach,
    };
    state.telegraphs.push({
      kind: "line-volley",
      timer: enemy.barrageWindup,
      color: "rgba(255, 209, 102, 0.8)",
      start,
      end,
      direction: { ...direction },
      burstCount: enemy.phase >= 3 ? 5 : 3,
      spread: enemy.phase >= 3 ? 0.18 : 0.12,
      speed: (enemy.projectile?.speed ?? 5) * 1.25,
      range: 8.8,
      radius: enemy.projectile?.radius ?? 0.1,
      damage: (enemy.projectile?.damage ?? 1) + (enemy.phase >= 3 ? 1 : 0),
      colorShot: "#ffe29a",
    });
    announceBossPhase(`${getEnemyLabel(enemy)} 锁定齐射`);
  }

  function fireLockedVolley(enemy) {
    if (!enemy.lockedDirection) return;
    const burstCount = enemy.phase >= 3 ? 5 : 3;
    const spread = enemy.phase >= 3 ? 0.18 : 0.12;
    const projectileSpeed = (enemy.projectile?.speed ?? 5) * 1.25;
    const projectileDamage = (enemy.projectile?.damage ?? 1) + (enemy.phase >= 3 ? 1 : 0);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = burstCount === 1 ? 0 : (index - (burstCount - 1) / 2) * spread;
      state.projectiles.push({
        team: "enemy",
        position: { ...enemy.position },
        velocity: rotateVector(enemy.lockedDirection, angle),
        speed: projectileSpeed,
        remainingRange: 8.8,
        radius: enemy.projectile?.radius ?? 0.1,
        damage: projectileDamage,
        color: "#ffe29a",
      });
    }
    enemy.lockedDirection = null;
  }

  function updateCrownCorePattern(enemy, dt) {
    enemy.meteorCooldown = Math.max(0, (enemy.meteorCooldown ?? 4.8) - dt);
    if (enemy.meteorCooldown > 0) return;
    queueMeteorRain(enemy);
    enemy.meteorCooldown = enemy.phase >= 3 ? 2.4 : enemy.phase === 2 ? 3.1 : 4.1;
  }

  function queueMeteorRain(enemy) {
    const impactCount = enemy.phase >= 3 ? 5 : enemy.phase === 2 ? 4 : 3;
    const base = state.player.position;
    for (let index = 0; index < impactCount; index += 1) {
      const offsetAngle = (Math.PI * 2 * index) / impactCount + Math.random() * 0.35;
      const offsetDistance = 0.45 + index * 0.22;
      const position = {
        x: clamp(base.x + Math.cos(offsetAngle) * offsetDistance, 1.2, GAME_CONFIG.arena.width - 1.2),
        y: clamp(base.y + Math.sin(offsetAngle) * offsetDistance, 1.2, GAME_CONFIG.arena.height - 1.2),
      };
      state.telegraphs.push({
        kind: "meteor",
        timer: 0.82,
        color: "rgba(255, 120, 89, 0.75)",
        position,
        radius: enemy.phase >= 3 ? 0.72 : 0.62,
        burstCount: enemy.phase >= 3 ? 8 : 6,
        damage: enemy.phase >= 3 ? 2 : 1,
      });
    }
    announceBossPhase(`${getEnemyLabel(enemy)} 呼唤落火`);
  }

  function updateTelegraphs(dt) {
    for (const telegraph of state.telegraphs) {
      telegraph.timer -= dt;
    }
    const ready = state.telegraphs.filter((telegraph) => telegraph.timer <= 0);
    state.telegraphs = state.telegraphs.filter((telegraph) => telegraph.timer > 0);
    for (const telegraph of ready) resolveTelegraph(telegraph);
  }

  function resolveTelegraph(telegraph) {
    if (telegraph.kind === "line-volley") {
      for (let index = 0; index < telegraph.burstCount; index += 1) {
        const angle = telegraph.burstCount === 1 ? 0 : (index - (telegraph.burstCount - 1) / 2) * telegraph.spread;
        state.projectiles.push({
          team: "enemy",
          position: { ...telegraph.start },
          velocity: rotateVector(telegraph.direction, angle),
          speed: telegraph.speed,
          remainingRange: telegraph.range,
          radius: telegraph.radius,
          damage: telegraph.damage,
          color: telegraph.colorShot,
        });
      }
      return;
    }
    if (telegraph.kind === "meteor") {
      spawnAreaHazard({
        position: telegraph.position,
        radius: telegraph.radius,
        lifetime: 2.2,
        damage: telegraph.damage,
        tickInterval: GAME_CONFIG.terrain.fireTickInterval,
        color: "rgba(255, 120, 89, 0.42)",
      });
      for (let index = 0; index < telegraph.burstCount; index += 1) {
        const angle = (Math.PI * 2 * index) / telegraph.burstCount;
        state.projectiles.push({
          team: "enemy",
          position: { ...telegraph.position },
          velocity: { x: Math.cos(angle), y: Math.sin(angle) },
          speed: 3.6,
          remainingRange: 4.2,
          radius: 0.08,
          damage: telegraph.damage,
          color: "#ff9e7a",
        });
      }
    }
  }

  function updateBossPhase(enemy) {
    if (!enemy.isBoss || enemy.hp <= 0) return;
    const hpRatio = enemy.hp / enemy.maxHp;

    if (enemy.phase === 1 && hpRatio <= 0.66) {
      enemy.phase = 2;
      enemy.speedScale = 1.12;
      enemy.fireRateScale = 1.3;
      enemy.projectileSpeedScale = 1.12;
      enemy.projectileDamageBonus = 1;
      enemy.pendingSummons = Math.max(enemy.pendingSummons ?? 0, enemy.id === "finalBoss" ? 3 : 2);
      enemy.summonCooldown = 0.7;
      announceBossPhase(`${getEnemyLabel(enemy)} 进入第二阶段`);
    } else if (enemy.phase === 2 && hpRatio <= 0.33) {
      enemy.phase = 3;
      enemy.speedScale = enemy.id === "finalBoss" ? 1.3 : 1.24;
      enemy.fireRateScale = enemy.id === "finalBoss" ? 1.7 : 1.55;
      enemy.projectileSpeedScale = enemy.id === "finalBoss" ? 1.28 : 1.22;
      enemy.projectileDamageBonus = enemy.id === "finalBoss" ? 3 : 2;
      enemy.pendingSummons = Math.max(enemy.pendingSummons ?? 0, enemy.id === "finalBoss" ? 4 : 3);
      enemy.summonCooldown = 0.45;
      announceBossPhase(`${getEnemyLabel(enemy)} 进入最终阶段`);
    }
  }

  function spawnBossReinforcements(count) {
    const supportPool = ['runner', 'turret', 'sniper'];
    for (let index = 0; index < count; index += 1) {
      spawnEnemy(supportPool[index % supportPool.length]);
    }
  }

  function announceBossPhase(message) {
    state.bossAnnouncement = message;
    state.bossAnnouncementTimer = 2.8;
  }

  function updateBossAnnouncement(dt) {
    if (state.bossAnnouncementTimer <= 0) return;
    state.bossAnnouncementTimer = Math.max(0, state.bossAnnouncementTimer - dt);
    if (state.bossAnnouncementTimer === 0) state.bossAnnouncement = '';
  }


  function spawnTrailHazard(enemy) {
    const hazard = enemy.trailHazard;
    spawnAreaHazard({
      position: { ...enemy.position },
      radius: hazard.radius ?? GAME_CONFIG.terrain.hazardRadius,
      lifetime: hazard.lifetime ?? GAME_CONFIG.terrain.hazardLifetime,
      damage: hazard.damage ?? (hazard.type === "fire" ? GAME_CONFIG.terrain.fireDamage : GAME_CONFIG.terrain.acidDamage),
      tickInterval: hazard.tickInterval ?? (hazard.type === "fire" ? GAME_CONFIG.terrain.fireTickInterval : GAME_CONFIG.terrain.acidTickInterval),
      color: hazard.color,
      type: hazard.type ?? "acid",
    });
  }

  function spawnTrapHazard(enemy) {
    const hazard = enemy.trapHazard;
    spawnAreaHazard({
      position: { ...enemy.position },
      radius: hazard.radius ?? GAME_CONFIG.terrain.spikeRadius,
      lifetime: hazard.lifetime ?? 3,
      damage: hazard.damage ?? GAME_CONFIG.terrain.spikeDamage,
      tickInterval: hazard.tickInterval ?? GAME_CONFIG.terrain.spikeTickInterval,
      color: hazard.color,
      type: hazard.type ?? "spike",
      armDelay: hazard.armDelay ?? GAME_CONFIG.terrain.spikeArmDelay,
    });
  }

  function spawnAreaHazard({ position, radius, lifetime, damage, tickInterval, color, type = "acid", armDelay = 0 }) {
    state.hazards.push({
      position: { ...position },
      radius,
      lifetime,
      damage,
      tickInterval,
      tickLeft: 0,
      color,
      type,
      armLeft: armDelay,
    });
  }

  function updateHazards(dt) {
    for (const hazard of state.hazards) {
      hazard.lifetime -= dt;
      hazard.tickLeft = Math.max(0, hazard.tickLeft - dt);
      hazard.armLeft = Math.max(0, (hazard.armLeft ?? 0) - dt);
      if (hazard.lifetime <= 0) continue;
      if ((hazard.armLeft ?? 0) > 0) continue;
      if (hazard.tickLeft <= 0) {
        let enemyHit = false;
        for (const enemy of state.enemies) {
          if (distance(hazard.position, enemy.position) <= hazard.radius + enemy.radius) {
            damageEnemy(enemy, hazard.damage);
            enemyHit = true;
          }
        }
        if (enemyHit) {
          hazard.tickLeft = hazard.tickInterval;
        }
      }
      if (state.player.invulnerabilityLeft <= 0 && distance(hazard.position, state.player.position) <= hazard.radius + state.player.radius && hazard.tickLeft <= 0) {
        damagePlayer(hazard.damage);
        hazard.tickLeft = hazard.tickInterval;
      }
    }
  }

  function resolveCollisions() {
    for (const projectile of state.projectiles) {
      if (projectile.team === "player") {
        for (const enemy of state.enemies) {
          if (distance(projectile.position, enemy.position) <= projectile.radius + enemy.radius) {
            damageEnemy(enemy, projectile.damage, { slowOnHit: projectile.slowOnHit });
            applyProjectileControl(enemy, projectile.controlPower, projectile.velocity);
            tryRecordEffectiveHit(projectile);
            if (projectile.splashDamage) splashHit(enemy.position, projectile.splashDamage, enemy);
            if (projectile.chainChance && passesLuckCheck(projectile.chainChance)) chainHit(enemy, Math.max(1, Math.floor(projectile.damage * 0.5)));
            if ((projectile.pierceLeft ?? 0) > 0) projectile.pierceLeft -= 1; else projectile.remainingRange = 0;
            break;
          }
        }
      } else if (state.player.invulnerabilityLeft <= 0 && distance(projectile.position, state.player.position) <= projectile.radius + state.player.radius) {
        damagePlayer(projectile.damage);
        projectile.remainingRange = 0;
      }
    }

    for (const enemy of state.enemies) {
      if (state.player.invulnerabilityLeft <= 0 && distance(enemy.position, state.player.position) <= enemy.radius + state.player.radius) {
        damagePlayer(enemy.contactDamage);
        damageEnemy(enemy, state.player.contactDamage ?? 1);
      }
    }
  }

  function tryRecordEffectiveHit(projectile) {
    if (!projectile.canRecordRoll || state.pendingSkillChoices) return;
    const reelIndex = projectile.sourceReelIndex;
    if (reelIndex == null || state.reelCycleMarks[reelIndex]) return;
    recordRoll(reelIndex, projectile.rolledValue, projectile.isCrit);
    projectile.canRecordRoll = false;
  }

  function splashHit(center, damage, primaryTarget) {
    for (const enemy of state.enemies) {
      if (enemy !== primaryTarget && distance(enemy.position, center) <= 0.9) damageEnemy(enemy, damage, { slowOnHit: getResonanceValue(state, "slowOnHit") });
    }
  }

  function chainHit(sourceEnemy, damage) {
    const next = state.enemies
      .filter((enemy) => enemy !== sourceEnemy)
      .sort((a, b) => distance(a.position, sourceEnemy.position) - distance(b.position, sourceEnemy.position))[0];
    if (next && distance(next.position, sourceEnemy.position) <= 2.6) damageEnemy(next, damage, { slowOnHit: getResonanceValue(state, "slowOnHit") });
  }

  function applyWaterControl(enemy, slowOnHit = 0) {
    const waterSlow = slowOnHit > 0 ? slowOnHit : getResonanceValue(state, "slowOnHit");
    if (waterSlow > 0) {
      enemy.slowLeft = Math.max(enemy.slowLeft ?? 0, 1 + waterSlow);
    }
    if (!getResonanceValue(state, "waterFreezeEnabled")) return;
    enemy.chillWindowLeft = Math.max(enemy.chillWindowLeft ?? 0, 2);
    enemy.chillStacks = (enemy.chillStacks ?? 0) + 1;
    if (enemy.chillStacks >= 2) {
      enemy.frozenLeft = Math.max(enemy.frozenLeft ?? 0, 3);
      enemy.chillStacks = 0;
      enemy.chillWindowLeft = 0;
    }
  }

  // Interprets projectile control power with three explicit modes:
  // -1 disables control, 0 applies a short root, and positive values knock back on hit.
  function applyProjectileControl(enemy, controlPower, velocity) {
    if (controlPower == null || controlPower < 0) return;
    if (controlPower === 0) {
      enemy.rootedLeft = Math.max(enemy.rootedLeft ?? 0, 0.2);
      return;
    }
    const direction = normalize(velocity?.x ?? 0, velocity?.y ?? 0);
    enemy.position.x = clamp(enemy.position.x + direction.x * controlPower, 0.4, GAME_CONFIG.arena.width - 0.4);
    enemy.position.y = clamp(enemy.position.y + direction.y * controlPower, 0.4, GAME_CONFIG.arena.height - 0.4);
  }

  function damageEnemy(enemy, damage, options = {}) {
    enemy.hp -= damage;
    applyWaterControl(enemy, options.slowOnHit ?? 0);
  }

  function cleanupEntities() {
    state.enemies = state.enemies.filter((enemy) => {
      if (enemy.hp > 0) return true;
      if (enemy.reviveOnce && !enemy.hasRevived) {
        enemy.hasRevived = true;
        enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * enemy.reviveOnce.hpRatio));
        enemy.maxHp = enemy.hp;
        enemy.color = enemy.reviveOnce.color;
        return true;
      }
      if (enemy.deathSpawn) {
        for (const spawn of enemy.deathSpawn) {
          for (let index = 0; index < spawn.count; index += 1) {
            spawnEnemyAt(spawn.enemyId, { ...enemy.position });
          }
        }
      }
      if (enemy.buffTag === "green") {
        state.hazards.push({
          position: { ...enemy.position },
          radius: 0.42,
          lifetime: 3,
          damage: 1,
          tickInterval: GAME_CONFIG.terrain.acidTickInterval,
          tickLeft: 0,
          color: "rgba(113, 201, 120, 0.45)",
        });
      }
      state.gold += enemy.rewardGold;
      state.kills += 1;
      return false;
    });

    state.projectiles = state.projectiles.filter((projectile) => {
      const inBounds = projectile.position.x >= -1 && projectile.position.x <= GAME_CONFIG.arena.width + 1 && projectile.position.y >= -1 && projectile.position.y <= GAME_CONFIG.arena.height + 1;
      return projectile.remainingRange > 0 && inBounds;
    });

    state.hazards = state.hazards.filter((hazard) => hazard.lifetime > 0);
  }

  function updateModifiers(dt) {
    state.modifiers = state.modifiers.filter((modifier) => {
      modifier.remaining -= dt;
      return modifier.remaining > 0;
    });
    state.player.shieldDecayLeft = Math.max(0, state.player.shieldDecayLeft - dt);
    if (state.player.shieldDecayLeft <= 0) state.player.shield = 0;
  }

  function applyPassiveRegen(dt) {
    const regenPerSecond = getResonanceValue(state, "regen");
    if (regenPerSecond <= 0 || state.phase !== "battle") return;
    state.player.regenBuffer += regenPerSecond * dt;
    while (state.player.regenBuffer >= 1) {
      healPlayer(1);
      state.player.regenBuffer -= 1;
    }
  }


  function updateScheduledEffects(dt) {
    state.scheduledEffects = state.scheduledEffects.filter((entry) => {
      entry.delayLeft -= dt;
      if (entry.delayLeft > 0) return true;
      executeSkillEffects(entry.effects ?? []);
      return false;
    });
  }

  function updateAuras(dt) {
    for (const aura of state.auras) {
      aura.remaining -= dt;
      aura.tickLeft -= dt;
      if (aura.tickLeft > 0) continue;
      aura.tickLeft = aura.interval;
      for (const enemy of state.enemies) {
        if (distance(enemy.position, state.player.position) > aura.radius + enemy.radius) continue;
        damageEnemy(enemy, aura.damage, { slowOnHit: aura.slowOnHit });
      }
      if (aura.healPerPulse) healPlayer(aura.healPerPulse);
    }
    state.auras = state.auras.filter((aura) => aura.remaining > 0);
  }

  function recordRoll(reelIndex, value, isCrit) {
    state.reels[reelIndex].lastValue = value;
    state.lastCrit = isCrit;
    if (!state.pendingSkillChoices) {
      state.valueSlots[state.nextValueSlotIndex] = value;
      state.valueSlotSources[state.nextValueSlotIndex] = reelIndex;
      state.nextValueSlotIndex = (state.nextValueSlotIndex + 1) % GAME_CONFIG.valueSlots;
      if (state.valueSlots.every((entry) => entry !== null)) {
        state.pendingSkillChoices = generateSkillChoices();
      }
    }
    state.reelCycleMarks[reelIndex] = true;
    if (state.reelCycleMarks.every(Boolean)) {
      state.reelCycleMarks = Array(state.reels.length).fill(false);
      state.activeReelIndex = 0;
      return;
    }
    state.activeReelIndex = findNextPendingReel(reelIndex);
  }

  function findNextPendingReel(startIndex) {
    for (let offset = 1; offset <= state.reels.length; offset += 1) {
      const candidate = (startIndex + offset) % state.reels.length;
      if (!state.reelCycleMarks[candidate]) return candidate;
    }
    return 0;
  }

  function normalizeReelCycleState(resetCycle = false) {
    if (resetCycle || state.reelCycleMarks.length !== state.reels.length) {
      state.reelCycleMarks = Array(state.reels.length).fill(false);
      state.activeReelIndex = 0;
      state.valueSlots = Array(GAME_CONFIG.valueSlots).fill(null);
      state.valueSlotSources = Array(GAME_CONFIG.valueSlots).fill(null);
      state.nextValueSlotIndex = 0;
      state.pendingSkillChoices = null;
      return;
    }
    state.activeReelIndex = clamp(state.activeReelIndex, 0, Math.max(0, state.reels.length - 1));
  }

  function passesLuckCheck(baseChance) {
    if (baseChance <= 0) return false;
    const effectiveChance = Math.min(0.98, baseChance * getLuckMultiplier(getStat("luck", state.player.baseLuck)));
    return Math.random() < effectiveChance;
  }

  function generateSkillChoices() {
    const sum = state.valueSlots.reduce((acc, value) => acc + value, 0);
    const qualities = resolveQualities(sum);
    const elements = resolveLeadingElements(state);
    const filtered = SKILL_LIBRARY.filter((skill) => qualities.includes(skill.quality) && (elements.length === 0 || skill.elements.some((element) => elements.includes(element))));
    const fallbackPool = SKILL_LIBRARY.filter((skill) => qualities.includes(skill.quality));
    return pickUnique((filtered.length >= 2 ? filtered : fallbackPool.length >= 2 ? fallbackPool : SKILL_LIBRARY), 2);
  }

  function castPendingSkill(skill) {
    if (!skill || state.phase !== "battle") return;
    castSkill(skill);
    state.confirmedSkill = skill;
    clearSkillCycleProgress();
  }

  function castConfirmedSkill() {
    const skill = state.confirmedSkill;
    if (!skill || !state.pendingSkillChoices || state.phase !== "battle") return;
    castSkill(skill);
    clearSkillCycleProgress();
  }

  function clearSkillCycleProgress() {
    const healOnCast = getResonanceValue(state, "healOnCast");
    if (healOnCast > 0) healPlayer(healOnCast);
    state.pendingSkillChoices = null;
    state.valueSlots = Array(GAME_CONFIG.valueSlots).fill(null);
    state.valueSlotSources = Array(GAME_CONFIG.valueSlots).fill(null);
    state.nextValueSlotIndex = 0;
    state.reelCycleMarks = Array(state.reels.length).fill(false);
    state.activeReelIndex = 0;
  }

  function castSkill(skill) {
    if (Array.isArray(skill.effects) && skill.effects.length > 0) {
      executeSkillEffects(skill.effects);
      return;
    }
    if (typeof skill.cast === "function") skill.cast(game);
  }

  function executeSkillEffects(effects) {
    for (const effect of effects) executeSkillEffect(effect);
  }

  function executeSkillEffect(effect) {
    if (!effect?.type) return;
    if (effect.type === "radialBurst") {
      spawnRadialBurst(effect.count ?? 6, effect.speedScale ?? 0.3, effect.color ?? "#ff8a5b", effect);
      return;
    }
    if (effect.type === "forwardSpread") {
      spawnForwardSpread(effect.count ?? 6, effect.speedScale ?? 0.3, effect.color ?? "#7ad7ff", effect);
      return;
    }
    if (effect.type === "homingShots") {
      spawnHomingShots(effect.count ?? 3, effect);
      return;
    }
    if (effect.type === "timedModifier") {
      addTimedModifier(effect.stat, effect.multiplier ?? 1, effect.duration ?? 1);
      return;
    }
    if (effect.type === "heal") {
      healPlayer(effect.amount ?? 0);
      return;
    }
    if (effect.type === "increaseMaxHp") {
      increaseMaxHp(effect.amount ?? 0);
      return;
    }
    if (effect.type === "grantShield") {
      addShield(effect.amount ?? 0, effect.duration ?? 0);
      return;
    }
    if (effect.type === "delayedEffects") {
      queueDelayedEffects(effect.delay ?? 0.3, effect.effects ?? []);
      return;
    }
    if (effect.type === "pulseAura") {
      addPulseAura(effect);
      return;
    }
    if (effect.type === "repeat") {
      const repeatCount = Math.max(1, effect.count ?? 1);
      for (let index = 0; index < repeatCount; index += 1) {
        executeSkillEffects(effect.effects ?? []);
      }
    }
  }

  function spawnEnemy(enemyId) {
    return spawnEnemyAt(enemyId, null);
  }

  function spawnEnemyAt(enemyId, forcedPosition = null) {
    const template = ENEMY_ARCHETYPES[enemyId];
    const edge = Math.floor(Math.random() * 4);
    const margin = 0.8;
    const position = forcedPosition ?? (edge === 0 ? { x: margin, y: randomInt(1, 9) } : edge === 1 ? { x: GAME_CONFIG.arena.width - margin, y: randomInt(1, 9) } : edge === 2 ? { x: randomInt(1, 9), y: margin } : { x: randomInt(1, 9), y: GAME_CONFIG.arena.height - margin });
    const growth = template.isBoss ? 0 : state.waveIndex;
    const enemy = {
      ...structuredClone(template),
      hp: template.maxHp + growth,
      maxHp: template.maxHp + growth,
      baseSpeed: template.speed,
      speed: template.speed,
      shotCooldown: template.projectile?.cooldown ?? 0,
      slowLeft: 0,
      position,
      trailCooldown: template.trailHazard?.spawnInterval ?? 0,
      dashCooldown: template.dash?.cooldown ?? 0,
      dashTimeLeft: 0,
      hasRevived: false,
      novaCooldown: template.id === "finalBoss" ? 2.2 : 0,
      meteorCooldown: template.id === "finalBoss" ? 3.4 : 0,
      barrageCooldown: template.id === "boss" ? 2.6 : 0,
      barrageWindup: 0,
      lockedDirection: null,
      isBoss: template.isBoss === true,
      phase: 1,
      speedScale: 1,
      fireRateScale: 1,
      projectileSpeedScale: 1,
      projectileDamageBonus: 0,
      pendingSummons: 0,
      summonCooldown: 0,
      buffTag: null,
    };
    applyWaveBuff(enemy);
    state.enemies.push(enemy);
  }

  function applyWaveBuff(enemy) {
    if (state.waveIndex < 5 || enemy.isBoss || enemy.id.startsWith("elite") || enemy.rewardGold > 2) return;
    const availableBuffs = [];
    if ((state.waveBuffUsage.red ?? 0) < 2) availableBuffs.push("red");
    if ((state.waveBuffUsage.blue ?? 0) < 3) availableBuffs.push("blue");
    if ((state.waveBuffUsage.green ?? 0) < 2) availableBuffs.push("green");
    if (availableBuffs.length === 0 || Math.random() > 0.45) return;
    const buff = availableBuffs[Math.floor(Math.random() * availableBuffs.length)];
    enemy.buffTag = buff;
    state.waveBuffUsage[buff] = (state.waveBuffUsage[buff] ?? 0) + 1;

    if (buff === "red") {
      enemy.maxHp = Math.ceil(enemy.maxHp * 1.5);
      enemy.hp = enemy.maxHp;
      enemy.rewardGold += 1;
      enemy.color = "#ff6f61";
    } else if (buff === "blue") {
      enemy.baseSpeed += 0.18;
      enemy.speed = enemy.baseSpeed;
      enemy.rewardGold += 1;
      enemy.color = "#61a7ff";
    } else if (buff === "green") {
      enemy.rewardGold += 1;
      enemy.color = "#71c978";
    }
  }

  function openShop() {
    if (state.phase !== "battle") return;
    state.phase = "shop";
    const wave = getCurrentWave(state);
    const offerIds = wave.endless ? buildEndlessShopOffers(state.endlessLevel) : (wave.shopOffers ?? []);
    state.shopOffers = offerIds.map(buildOfferFromId);
    state.selectedReelIndex = Math.min(state.selectedReelIndex, state.reels.length - 1);
  }

  function handleShopInput() {
    if (input.consume("ArrowLeft")) moveSelectedReel(state, -1);
    if (input.consume("ArrowRight")) moveSelectedReel(state, 1);
    if (input.consume("ArrowUp")) moveSelectedFace(state, -1);
    if (input.consume("ArrowDown")) moveSelectedFace(state, 1);
    ["Digit1", "Digit2", "Digit3"].forEach((key, index) => {
      if (!input.consume(key)) return;
      const offer = state.shopOffers[index];
      if (!offer || state.gold < offer.price) return;
      const success = offer.apply?.(state);
      if (success === false) return;
      state.gold -= offer.price;
      syncDerivedPlayerState();
      clampSelectedReel(state);
      clampSelectedFace(state);
      normalizeReelCycleState(true);
    });
    if (input.consume("Space")) advanceFromRoom();
  }

  function handleRewardInput() {
    ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].forEach((key, index) => {
      if (!input.consume(key) || state.roomSelectionsLeft <= 0) return;
      const offer = state.roomOffers[index];
      if (!offer || offer.taken) return;
      const success = offer.apply?.(state);
      if (success === false) return;
      offer.taken = true;
      state.roomSelectionsLeft -= 1;
      syncDerivedPlayerState();
      clampSelectedReel(state);
      normalizeReelCycleState(true);
    });
    if (input.consume("Space") && state.roomSelectionsLeft <= 0) advanceFromRoom();
  }

  function canAdvanceCurrentRoom() {
    if (state.phase === "shop") return true;
    if (state.phase !== "reward") return false;
    return state.roomSelectionsLeft <= 0;
  }

  function handleOverlayClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest("[data-overlay-action]")?.getAttribute("data-overlay-action");
    if (action !== "advance-room" || !canAdvanceCurrentRoom()) return;
    advanceFromRoom();
  }

  function updateTreasureRoom(dt) {
    movePlayer(dt);
    for (const pickup of state.roomPickups) {
      if (pickup.taken || state.roomSelectionsLeft <= 0) continue;
      if (distance(state.player.position, pickup.position) <= pickup.radius + state.player.radius) {
        const offer = state.roomOffers[pickup.offerIndex];
        if (!offer || offer.taken) continue;
        const success = offer.apply?.(state);
        if (success === false) continue;
        offer.taken = true;
        pickup.taken = true;
        state.roomSelectionsLeft -= 1;
        syncDerivedPlayerState();
        clampSelectedReel(state);
        normalizeReelCycleState(true);
      }
    }
    if (input.consume("Space") && state.roomSelectionsLeft <= 0) advanceFromRoom();
  }

  function advanceFromRoom() {
    const currentWave = getCurrentWave(state);
    if (currentWave.endless) {
      state.endlessLevel += 1;
      beginWave(state, currentWave.id);
      return;
    }
    const nextWave = state.waveIndex + 1;
    if (nextWave > WAVE_DEFINITIONS.length) {
      state.phase = "victory";
      return;
    }
    if (nextWave === 24) {
      state.mainRunCleared = true;
      state.endlessLevel = 1;
      announceBossPhase("\u4e3b\u7ebf\u901a\u5173\uff0c\u8fdb\u5165\u65e0\u5c3d\u8bd5\u70bc");
    }
    beginWave(state, nextWave);
  }

  function beginWave(targetState, waveIndex) {
    const wave = WAVE_DEFINITIONS[waveIndex - 1];
    targetState.waveIndex = waveIndex;
    targetState.shopOffers = [];
    targetState.roomOffers = [];
    targetState.roomSelectionsLeft = 0;
    targetState.roomPickups = [];
    targetState.spawnQueue = [];
    targetState.spawnTimer = 0.3;
    targetState.enemies = [];
    targetState.projectiles = [];
    targetState.telegraphs = [];
    targetState.hazards = [];
    targetState.waveBuffUsage = { red: 0, blue: 0, green: 0 };
    targetState.player.position = { x: GAME_CONFIG.arena.width / 2, y: GAME_CONFIG.arena.height / 2 };
    targetState.pendingSkillChoices = null;
    if (wave.type === "combat") {
      targetState.phase = "battle";
      targetState.player.tempHp = getResonanceValue(targetState, "tempHpPerWave");
      applyHealing(targetState, getResonanceValue(targetState, "woodWaveHeal"));
      const budget = wave.endless ? buildEndlessBudget(targetState.endlessLevel) : wave.budget;
      targetState.spawnQueue = budget.flatMap((entry) => Array.from({ length: entry.count }, () => entry.enemyId));
    } else {
      targetState.player.tempHp = 0;
      targetState.phase = "reward";
      targetState.roomOffers = wave.roomOffers.map((id) => ({ ...buildOfferFromId(id), taken: false }));
      targetState.roomSelectionsLeft = wave.freeSelections ?? 1;
      if (wave.mode === "treasure") {
        const centerX = GAME_CONFIG.arena.width / 2;
        const centerY = GAME_CONFIG.arena.height / 2;
        const pickupPositions = [
          { x: centerX, y: centerY - 4.2 },
          { x: centerX + 3.4, y: centerY - 1.8 },
          { x: centerX + 2.2, y: centerY + 2.8 },
          { x: centerX - 2.2, y: centerY + 2.8 },
          { x: centerX - 3.4, y: centerY - 1.8 },
        ];
        targetState.roomPickups = targetState.roomOffers.map((offer, index) => ({
          offerIndex: index,
          position: pickupPositions[index] ?? { x: 5, y: 5 },
          radius: 0.34,
          taken: false,
        }));
      }
    }
    syncDerivedPlayerState();
    clampSelectedReel(targetState);
    normalizeReelCycleState(true);
  }

  function sellSelectedReel() {
    if (state.phase !== "shop" || state.reels.length <= 1) return;
    const reel = state.reels[state.selectedReelIndex];
    state.gold += reel.sellPrice ?? Math.max(1, Math.floor(reel.price / 2));
    state.reels.splice(state.selectedReelIndex, 1);
    clampSelectedReel(state);
    if (state.activeReelIndex >= state.reels.length) state.activeReelIndex = 0;
    syncDerivedPlayerState();
    normalizeReelCycleState(true);
  }

  function syncDerivedPlayerState() {
    const bonusMaxHp = getResonanceValue(state, "bonusMaxHp");
    const targetMax = state.player.baseMaxHp + state.player.permanentMaxHpBonus + bonusMaxHp;
    if (targetMax > state.player.maxHp) state.player.hp += targetMax - state.player.maxHp;
    state.player.resonanceBonusMaxHp = bonusMaxHp;
    state.player.maxHp = targetMax;
    state.player.hp = Math.min(state.player.hp, state.player.maxHp);
    state.player.runtimeFlatBonuses.speed = getResonanceValue(state, "speed");
    state.player.runtimeFlatBonuses.fireRate = getResonanceValue(state, "fireRateFlat");
    state.player.runtimeFlatBonuses.chainChance = getResonanceValue(state, "chainChance");
    state.player.runtimeFlatBonuses.luck = 0;
  }

  function damagePlayer(rawDamage) {
    if (state.debugNoDamage) {
      state.player.invulnerabilityLeft = Math.max(state.player.invulnerabilityLeft, 0.1);
      return;
    }
    let damage = Math.max(1, Math.round(rawDamage * getStat("damageReduction", 1)));
    if (state.player.shield > 0) {
      const absorbed = Math.min(state.player.shield, damage);
      state.player.shield -= absorbed;
      damage -= absorbed;
    }
    if ((state.player.tempHp ?? 0) > 0 && damage > 0) {
      const absorbed = Math.min(state.player.tempHp, damage);
      state.player.tempHp -= absorbed;
      damage -= absorbed;
    }
    if (damage <= 0) {
      state.player.invulnerabilityLeft = Math.max(state.player.invulnerabilityLeft, 0.08);
      return;
    }
    state.player.hp -= damage;
    const woodOnHitHealChance = getResonanceValue(state, "woodOnHitHealChance");
    if (woodOnHitHealChance > 0 && Math.random() < woodOnHitHealChance) {
      applyHealing(state, 1);
    }
    state.player.invulnerabilityLeft = getStat("invulnerability", state.player.baseInvulnerability);
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.phase = "gameover";
    }
  }

  function healPlayer(amount) {
    applyHealing(state, amount);
  }

  function applyHealing(targetState, amount) {
    if (amount <= 0) return;
    const missingHp = Math.max(0, targetState.player.maxHp - targetState.player.hp);
    const hpGain = Math.min(missingHp, amount);
    targetState.player.hp += hpGain;

    const overflow = amount - hpGain;
    // High wood resonance allows healing to overflow into temporary HP.
    if (overflow > 0 && getResonanceValue(targetState, "woodOverflowHealingEnabled")) {
      targetState.player.tempHp = (targetState.player.tempHp ?? 0) + overflow;
    }
  }

  function increaseMaxHp(amount) {
    state.player.permanentMaxHpBonus += amount;
    syncDerivedPlayerState();
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
  }

  function addShield(amount, duration = 0) {
    state.player.shield = Math.min(state.player.maxShield, state.player.shield + amount);
    if (duration > 0) {
      state.player.shieldDecayLeft = Math.max(state.player.shieldDecayLeft, duration);
    }
  }

  function queueDelayedEffects(delay, effects) {
    state.scheduledEffects.push({ delayLeft: delay, effects: structuredClone(effects) });
  }

  function addPulseAura(effect) {
    state.auras.push({
      radius: effect.radius ?? 1.8,
      damage: effect.damage ?? 1,
      interval: effect.interval ?? 0.5,
      tickLeft: effect.interval ?? 0.5,
      remaining: effect.duration ?? 3,
      slowOnHit: effect.slowOnHit ?? 0,
      healPerPulse: effect.healPerPulse ?? 0,
      color: effect.color ?? "rgba(122, 215, 255, 0.18)",
    });
  }

  function addTimedModifier(stat, multiplier, duration, mode = "baseMultiplier") {
    state.modifiers.push({ stat, multiplier, remaining: duration, mode });
  }

  function getStat(stat, baseValue) {
    const tuning = state.player.statTuning[stat] ?? createDefaultStatTuning();
    const modifiers = state.modifiers.filter((entry) => entry.stat === stat);
    let baseMultiplier = tuning.baseMultiplier;
    let extraMultiplier = tuning.extraMultiplier;
    let globalMultiplier = tuning.globalMultiplier;
    for (const modifier of modifiers) {
      if (modifier.mode === "extraMultiplier") extraMultiplier *= modifier.multiplier;
      else if (modifier.mode === "globalMultiplier") globalMultiplier *= modifier.multiplier;
      else baseMultiplier *= modifier.multiplier;
    }
    const runtimeFlat = state.player.runtimeFlatBonuses[stat] ?? 0;
    return (baseValue * baseMultiplier + (tuning.flatAdd + tuning.runtimeFlatAdd + runtimeFlat) * extraMultiplier) * globalMultiplier;
  }

  function spawnRadialBurst(count, speedScale, color, options = {}) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      state.projectiles.push(makePlayerProjectile({
        velocity: { x: Math.cos(angle), y: Math.sin(angle) },
        speedScale,
        damage: (options.damage ?? 2) + getResonanceValue(state, "flatDamage"),
        color,
        slowOnHit: options.slowOnHit ?? 0,
        chainChance: options.chainChance ?? 0,
        rangeScale: options.rangeScale ?? 1,
        splashDamage: options.splashDamage ?? 0,
        pierceLeft: options.pierceLeft ?? 0,
        controlPower: options.controlPower,
        radius: options.radius ?? 0.1,
      }));
    }
  }

  function spawnForwardSpread(count, speedScale, color, options = {}) {
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * (options.spreadStep ?? 0.12);
      state.projectiles.push(makePlayerProjectile({
        velocity: rotateVector(state.player.direction, offset),
        speedScale,
        damage: (options.damage ?? 2) + getResonanceValue(state, "flatDamage"),
        color,
        slowOnHit: options.slowOnHit ?? 0.1,
        chainChance: options.chainChance ?? 0,
        rangeScale: options.rangeScale ?? 0.85,
        splashDamage: options.splashDamage ?? 0,
        pierceLeft: options.pierceLeft ?? 0,
        controlPower: options.controlPower,
        radius: options.radius ?? 0.1,
      }));
    }
  }

  function spawnHomingShots(count, options = {}) {
    const target = state.enemies[0];
    if (!target) return;
    for (let index = 0; index < count; index += 1) {
      const direction = normalize(target.position.x - state.player.position.x + (index - 1) * 0.25, target.position.y - state.player.position.y);
      state.projectiles.push(makePlayerProjectile({
        velocity: direction,
        speedScale: options.speedScale ?? 1.15,
        damage: (options.damage ?? 3) + getResonanceValue(state, "flatDamage"),
        color: options.color ?? "#d0b7ff",
        chainChance: options.chainChance ?? 0.25,
        slowOnHit: options.slowOnHit ?? 0,
        rangeScale: options.rangeScale ?? 1,
        splashDamage: options.splashDamage ?? 0,
        pierceLeft: options.pierceLeft ?? 0,
        controlPower: options.controlPower,
        radius: options.radius ?? 0.1,
      }));
    }
  }

  function makePlayerProjectile({ velocity, speedScale = 1, damage, color, slowOnHit = 0, chainChance = 0, rangeScale = 1, splashDamage = 0, pierceLeft = 0, controlPower = GAME_CONFIG.player.projectileControlPower, radius = 0.1 }) {
    return {
      team: "player",
      position: { ...state.player.position },
      velocity,
      speed: getStat("projectileSpeed", state.player.baseProjectileSpeed) * speedScale,
      remainingRange: getStat("projectileRange", state.player.baseProjectileRange) * rangeScale,
      radius,
      damage,
      pierceLeft,
      splashDamage,
      slowOnHit,
      chainChance,
      // Defaults to the global projectile control tuning unless a skill overrides it.
      controlPower,
      color,
    };
  }

  function updateHud() {
    const nextMarkup = renderHud(state);
    if (nextMarkup === lastHudMarkup) return;
    lastHudMarkup = nextMarkup;
    hudRoot.innerHTML = nextMarkup;
  }

  function updateOverlay() {
    const nextMarkup = renderOverlay(state);
    if (nextMarkup === lastOverlayMarkup) return;
    lastOverlayMarkup = nextMarkup;
    overlayRoot.innerHTML = nextMarkup;
  }

  return game;
}
