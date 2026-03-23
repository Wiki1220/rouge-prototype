import {
  ENEMY_ARCHETYPES,
  GAME_CONFIG,
  REEL_LIBRARY,
  SHOP_ITEM_LIBRARY,
  SKILL_LIBRARY,
  WAVE_DEFINITIONS,
  getLuckMultiplier,
  getPlayerAttributeBase,
} from "./config.js";
import { clamp, distance, normalize, pickUnique, randomInt } from "./utils.js";

export function createGame({ canvas, hudRoot, overlayRoot, options = {} }) {
  const ctx = canvas.getContext("2d");
  const input = createInput();
  let state = createInitialState(options);
  let lastTime = performance.now();
  let running = false;

  resizeCanvas();
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
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    window.removeEventListener("keydown", input.onKeyDown);
    window.removeEventListener("keyup", input.onKeyUp);
    window.removeEventListener("resize", resizeCanvas);
  }

  function restart() {
    state = createInitialState(options);
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
    render();
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
      if (getCurrentWave().mode === "treasure") {
        updateTreasureRoom(dt);
      } else {
        handleRewardInput();
      }
    } else if ((state.phase === "gameover" || state.phase === "victory") && input.consume("KeyR")) {
      state = createInitialState(options);
      beginWave(state, options.startWave ?? 1);
    }

    if (state.phase === "battle") {
      if (state.pendingSkillChoices && input.consume("KeyJ")) castPendingSkill(state.pendingSkillChoices[0]);
      if (state.pendingSkillChoices && input.consume("KeyK")) castPendingSkill(state.pendingSkillChoices[1]);
      if (state.pendingSkillChoices && input.consume("Space")) castConfirmedSkill();
    }

    if (state.phase === "shop") {
      if (input.consume("ArrowLeft")) moveSelectedReel(-1);
      if (input.consume("ArrowRight")) moveSelectedReel(1);
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
    const wave = getCurrentWave();
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
    const critFaces = computeCritFaces();
    const isCrit = randomInt(1, critFaces) === 1;
    const fireDoubleDamageChance = getResonanceValue("fireDoubleDamageChance");
    const doubledByFire = fireDoubleDamageChance > 0 && Math.random() < fireDoubleDamageChance;
    const damagePenalty = getResonanceValue("thunderDamagePenalty");
    const damage = Math.max(1, rolledValue + getResonanceValue("flatDamage") + (isCrit ? rolledValue : 0) + (doubledByFire ? rolledValue : 0) - damagePenalty);
    let projectileCount = 1;
    const thunderRolls = getResonanceValue("thunderRollCount");
    const thunderShotChance = getResonanceValue("extraProjectileChance");
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
        pierceLeft: getResonanceValue("pierceShots"),
        splashDamage: getResonanceValue("splashDamage"),
        slowOnHit: getResonanceValue("slowOnHit"),
        chainChance: Math.min(0.95, getResonanceValue("chainChance") * getStat("chainChance", 1)),
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
      if (enemy !== primaryTarget && distance(enemy.position, center) <= 0.9) damageEnemy(enemy, damage, { slowOnHit: getResonanceValue("slowOnHit") });
    }
  }

  function chainHit(sourceEnemy, damage) {
    const next = state.enemies
      .filter((enemy) => enemy !== sourceEnemy)
      .sort((a, b) => distance(a.position, sourceEnemy.position) - distance(b.position, sourceEnemy.position))[0];
    if (next && distance(next.position, sourceEnemy.position) <= 2.6) damageEnemy(next, damage, { slowOnHit: getResonanceValue("slowOnHit") });
  }

  function applyWaterControl(enemy, slowOnHit = 0) {
    const waterSlow = slowOnHit > 0 ? slowOnHit : getResonanceValue("slowOnHit");
    if (waterSlow > 0) {
      enemy.slowLeft = Math.max(enemy.slowLeft ?? 0, 1 + waterSlow);
    }
    if (!getResonanceValue("waterFreezeEnabled")) return;
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
    const regenPerSecond = getResonanceValue("regen");
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

  function computeCritFaces() {
    return Math.max(1, GAME_CONFIG.critical.baseFaces - new Set(state.reels.map((reel) => reel.sides)).size);
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
    const elements = resolveLeadingElements();
    const filtered = SKILL_LIBRARY.filter((skill) => qualities.includes(skill.quality) && (elements.length === 0 || skill.elements.some((element) => elements.includes(element))));
    const fallbackPool = SKILL_LIBRARY.filter((skill) => qualities.includes(skill.quality));
    return pickUnique((filtered.length >= 2 ? filtered : fallbackPool.length >= 2 ? fallbackPool : SKILL_LIBRARY), 2);
  }

  function resolveQualities(sum) {
    if (sum === 69) return ["epic", "rare"];
    if (sum === 90) return ["epic", "perfect"];
    if (sum === 46) return ["rare", "normal"];
    return GAME_CONFIG.damageQualityThresholds.filter((entry) => sum >= entry.min && sum <= entry.max).map((entry) => entry.id);
  }

  function getValueSlotSum() {
    return state.valueSlots.reduce((acc, value) => acc + (value ?? 0), 0);
  }

  function formatQualityLabel(quality) {
    return {
      normal: "普通",
      rare: "稀有",
      epic: "史诗",
      perfect: "完美",
    }[quality] ?? quality;
  }

  function getCurrentQualitySummary() {
    const sum = getValueSlotSum();
    const qualities = resolveQualities(sum);
    return qualities.map((quality) => formatQualityLabel(quality)).join(" / ") || "未定";
  }

  function getNextQualityGoal() {
    const sum = getValueSlotSum();
    if (sum < 45) return "稀有 45";
    if (sum < 68) return "史诗 68";
    if (sum < 82) return "完美 82";
    return "已达完美";
  }

  function buildReelDistribution() {
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

  function renderDistributionChart() {
    const distribution = buildReelDistribution();
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

  function resolveLeadingElements() {
    const ranked = state.valueSlots
      .map((value, index) => ({ value, reelIndex: state.valueSlotSources[index] }))
      .filter((entry) => entry.value !== null && entry.reelIndex !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    return [...new Set(ranked.flatMap((entry) => state.reels[entry.reelIndex]?.elements ?? []))];
  }

  function formatElementLabel(element) {
    return {
      fire: "火",
      water: "水",
      wood: "木",
      wind: "风",
      thunder: "雷",
    }[element] ?? element;
  }

  function formatElementList(elements) {
    return elements.map((element) => formatElementLabel(element)).join(" / ");
  }


  function hasUnreadableText(text) {
    return typeof text === "string" && /[?�]/.test(text);
  }

  function getReadableText(value, fallback) {
    if (typeof value !== "string" || value.trim().length === 0 || hasUnreadableText(value)) return fallback;
    return value;
  }

  function getEnemyLabel(enemy) {
    const fallbackById = {
      bruiser: "重甲怪",
      runner: "迅行怪",
      turret: "炮台怪",
      sniper: "狙击怪",
      trail: "酸痕怪",
      ember: "余烬怪",
      eliteDash: "冲锋精英",
      eliteNest: "裂巢精英",
      eliteRevive: "复生精英",
      elite: "精英卫士",
      boss: "监察者",
      finalBoss: "王冠核心",
    };
    return getReadableText(enemy?.name, fallbackById[enemy?.id] ?? enemy?.id ?? "敌人");
  }

  function getOfferLabel(offer) {
    return getReadableText(offer?.name, offer?.id ?? "未命名条目");
  }

  function getOfferDescription(offer) {
    return getReadableText(offer?.description, offer?.id ? `配置项：${offer.id}` : "暂无说明");
  }

  function getSkillLabel(skill) {
    const fallbackById = {
      "flare-burst": "灼焰迸发",
      "gale-step": "疾风步",
      "tidal-shell": "潮汐护壳",
      "spark-link": "雷链追击",
      "verdant-pulse": "青木脉冲",
      "monsoon-drive": "季风驱动",
      "voltaic-lattice": "伏特矩阵",
      "perfect-overdrive": "极限超载",
      "ember-echo": "余烬回响",
      "torrent-lance": "洪流穿枪",
      "storm-recital": "风暴咏叹",
      "evergreen-oath": "常青誓约",
      "frost-ward": "霜镜护场",
      "delayed-sunburst": "迟滞日珥",
      "sanctuary-ring": "回春圣环",
    };
    return getReadableText(skill?.name, fallbackById[skill?.id] ?? skill?.id ?? "空");
  }

  function getSkillDescription(skill, fallback) {
    const fallbackById = {
      "flare-burst": "向周身释放 6 枚火焰爆裂弹。",
      "gale-step": "4 秒内移动速度提升 60%。",
      "tidal-shell": "恢复 2 点生命，并在 4 秒内减伤 50%。",
      "spark-link": "释放 3 枚追踪雷弹，可触发连锁。",
      "verdant-pulse": "最大生命 +1，并恢复 4 点生命。",
      "monsoon-drive": "朝前方泼洒 8 枚季风弹幕。",
      "voltaic-lattice": "8 秒内攻速提升并强化连锁概率。",
      "perfect-overdrive": "10 秒内大幅提升攻速与弹速。",
      "ember-echo": "连续两次释放环形余烬爆裂。",
      "torrent-lance": "射出可穿透并减速的洪流长枪。",
      "storm-recital": "连续生成多轮追踪风雷弹。",
      "evergreen-oath": "提升生命上限、恢复生命并短暂加速。",
      "frost-ward": "获得护盾，并在周围形成减速冰环。",
      "delayed-sunburst": "短暂延迟后爆发一圈高伤日珥。",
      "sanctuary-ring": "生成护盾与持续回复光环。",
    };
    return getReadableText(skill?.description, fallbackById[skill?.id] ?? fallback);
  }

  function formatPhaseLabel(phase) {
    return {
      battle: "战斗",
      shop: "商店",
      reward: "奖励",
      gameover: "失败",
      victory: "胜利",
    }[phase] ?? phase;
  }

  function formatBuffLabel(buffTag) {
    return {
      red: "红",
      blue: "蓝",
      green: "绿",
    }[buffTag] ?? buffTag;
  }

  function countElements() {
    const counts = { fire: 0, water: 0, wood: 0, wind: 0, thunder: 0 };
    for (const reel of state.reels) {
      for (const element of reel.elements) counts[element] = (counts[element] ?? 0) + 1;
    }
    return counts;
  }

  function computeResonance() {
    const counts = countElements();
    const bonuses = {
      flatDamage: Math.floor((counts.fire ?? 0) / 3),
      speed: Math.floor((counts.wind ?? 0) / 2) * 0.05,
      slowOnHit: Math.floor((counts.water ?? 0) / 2) * 0.05,
      regen: counts.wood >= 2 ? 1 : 0,
      chainChance: 0,
      splashDamage: counts.fire >= 9 ? 4 : 0,
      pierceShots: counts.wind >= 9 ? 1 : 0,
      bonusMaxHp: 0,
      bonusProjectiles: 0,
      healOnCast: 0,
      fireRateFlat: Math.floor((counts.wind ?? 0) / 2) * 0.5,
      waterFreezeEnabled: counts.water >= 6 ? 1 : 0,
      fireDoubleDamageChance: counts.fire >= 9 ? 0.3 : 0,
      woodOnHitHealChance: counts.wood >= 8 ? 0.1 : 0,
      tempHpPerWave: counts.wood >= 8 ? 2 : 0,
      extraProjectileChance: counts.thunder >= 9 ? 0.25 : counts.thunder > 0 ? 0.1 : 0,
      thunderRollCount: counts.thunder ?? 0,
      thunderDamagePenalty: counts.thunder >= 9 ? 2 : 0,
    };
    return { counts, bonuses };
  }

  function getResonanceValue(stat) {
    return computeResonance().bonuses[stat] ?? 0;
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
    const healOnCast = getResonanceValue("healOnCast");
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
    const wave = getCurrentWave();
    const offerIds = wave.endless ? buildEndlessShopOffers() : (wave.shopOffers ?? []);
    state.shopOffers = offerIds.map(buildOfferFromId);
    state.selectedReelIndex = Math.min(state.selectedReelIndex, state.reels.length - 1);
  }

  function buildOfferFromId(id) {
    const reel = REEL_LIBRARY.find((entry) => entry.id === id);
    if (reel) {
      return { id: reel.id, name: `新增 d${reel.sides} 滚筒`, price: reel.price, description: `获得一个 d${reel.sides} 滚筒，属性为 ${formatElementList(reel.elements)}。`, apply(targetState) { if (targetState.reels.length >= GAME_CONFIG.maxReels) return false; targetState.reels.push(structuredClone(reel)); return true; } };
    }
    return SHOP_ITEM_LIBRARY[id];
  }

  function handleShopInput() {
    if (input.consume("ArrowLeft")) moveSelectedReel(-1);
    if (input.consume("ArrowRight")) moveSelectedReel(1);
    if (input.consume("ArrowUp")) moveSelectedFace(-1);
    if (input.consume("ArrowDown")) moveSelectedFace(1);
    ["Digit1", "Digit2", "Digit3"].forEach((key, index) => {
      if (!input.consume(key)) return;
      const offer = state.shopOffers[index];
      if (!offer || state.gold < offer.price) return;
      const success = offer.apply?.(state);
      if (success === false) return;
      state.gold -= offer.price;
      syncDerivedPlayerState();
      clampSelectedReel();
      clampSelectedFace();
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
      clampSelectedReel();
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
        clampSelectedReel();
        normalizeReelCycleState(true);
      }
    }
    if (input.consume("Space") && state.roomSelectionsLeft <= 0) advanceFromRoom();
  }

  function advanceFromRoom() {
    const currentWave = getCurrentWave();
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
      targetState.player.tempHp = getResonanceValue("tempHpPerWave");
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
    clampSelectedReel();
    normalizeReelCycleState(true);
  }

  function getCurrentWave() {
    return WAVE_DEFINITIONS[state.waveIndex - 1];
  }

  function getWaveLabel(wave = getCurrentWave()) {
    if (wave.endless) return `第24波之后 · 无尽 ${state.endlessLevel}`;
    const fallback = wave.type === "combat" ? `第${wave.id}波 战斗` : wave.mode === "treasure" ? `第${wave.id}波 宝箱房` : wave.mode === "rest" ? `第${wave.id}波 休息房` : `第${wave.id}波`;
    return getReadableText(wave.label, fallback);
  }

  function getMainWaveCount() {
    const endlessIndex = WAVE_DEFINITIONS.findIndex((entry) => entry.endless);
    return endlessIndex === -1 ? WAVE_DEFINITIONS.length : endlessIndex;
  }

  function getWaveProgressText() {
    const wave = getCurrentWave();
    if (wave.endless) return `主线完成 / 无尽 ${state.endlessLevel}`;
    return `${state.waveIndex}/${getMainWaveCount()}`;
  }

  function getCurrentSkillPoolPreview() {
    const elements = resolveLeadingElements();
    const pool = SKILL_LIBRARY
      .filter((skill) => elements.length === 0 || skill.elements.some((element) => elements.includes(element)))
      .sort((a, b) => getSkillLabel(a).localeCompare(getSkillLabel(b), "zh-CN"))
      .slice(0, 8);
    return pool.length > 0 ? pool : SKILL_LIBRARY.slice(0, 8);
  }

  function buildEndlessBudget(level) {
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

  function buildEndlessShopOffers() {
    const reelOffers = ["d18-windthunder", "d20-firewood", "d16-thunderfire"];
    const utilityOffers = ["clone-core", "split-core", "reroll-core", "heal-large", "attack-chip", "max-hp-chip", "swap-element"];
    const base = reelOffers[state.endlessLevel % reelOffers.length];
    const first = utilityOffers[state.endlessLevel % utilityOffers.length];
    const second = utilityOffers[(state.endlessLevel + 3) % utilityOffers.length];
    return [base, first, second];
  }

  function moveSelectedReel(delta) {
    if (state.reels.length === 0) return;
    state.selectedReelIndex = (state.selectedReelIndex + delta + state.reels.length) % state.reels.length;
    clampSelectedFace();
  }

  function moveSelectedFace(delta) {
    const reel = state.reels[state.selectedReelIndex];
    const faceCount = reel?.faces?.length ?? reel?.sides ?? 0;
    if (faceCount <= 0) return;
    state.selectedFaceIndex = (state.selectedFaceIndex + delta + faceCount) % faceCount;
  }

  function clampSelectedReel() {
    state.selectedReelIndex = Math.max(0, Math.min(state.selectedReelIndex, Math.max(0, state.reels.length - 1)));
    clampSelectedFace();
  }

  function clampSelectedFace() {
    const reel = state.reels[state.selectedReelIndex];
    const faceCount = reel?.faces?.length ?? reel?.sides ?? 0;
    if (faceCount <= 0) {
      state.selectedFaceIndex = 0;
      return;
    }
    state.selectedFaceIndex = Math.max(0, Math.min(state.selectedFaceIndex, faceCount - 1));
  }

  function sellSelectedReel() {
    if (state.phase !== "shop" || state.reels.length <= 1) return;
    const reel = state.reels[state.selectedReelIndex];
    state.gold += reel.sellPrice ?? Math.max(1, Math.floor(reel.price / 2));
    state.reels.splice(state.selectedReelIndex, 1);
    clampSelectedReel();
    if (state.activeReelIndex >= state.reels.length) state.activeReelIndex = 0;
    syncDerivedPlayerState();
    normalizeReelCycleState(true);
  }

  function syncDerivedPlayerState() {
    const bonusMaxHp = getResonanceValue("bonusMaxHp");
    const targetMax = state.player.baseMaxHp + state.player.permanentMaxHpBonus + bonusMaxHp;
    if (targetMax > state.player.maxHp) state.player.hp += targetMax - state.player.maxHp;
    state.player.resonanceBonusMaxHp = bonusMaxHp;
    state.player.maxHp = targetMax;
    state.player.hp = Math.min(state.player.hp, state.player.maxHp);
    state.player.runtimeFlatBonuses.speed = getResonanceValue("speed");
    state.player.runtimeFlatBonuses.fireRate = getResonanceValue("fireRateFlat");
    state.player.runtimeFlatBonuses.chainChance = getResonanceValue("chainChance");
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
    const woodOnHitHealChance = getResonanceValue("woodOnHitHealChance");
    if (woodOnHitHealChance > 0 && Math.random() < woodOnHitHealChance) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
    }
    state.player.invulnerabilityLeft = getStat("invulnerability", state.player.baseInvulnerability);
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.phase = "gameover";
    }
  }

  function healPlayer(amount) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
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
        damage: (options.damage ?? 2) + getResonanceValue("flatDamage"),
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
        damage: (options.damage ?? 2) + getResonanceValue("flatDamage"),
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
        damage: (options.damage ?? 3) + getResonanceValue("flatDamage"),
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
    const resonance = computeResonance();
    const sum = getValueSlotSum();
    const leadingElements = resolveLeadingElements();
    const critFaces = computeCritFaces();
    const resonanceText = Object.entries(resonance.counts)
      .filter(([, count]) => count > 0)
      .map(([element, count]) => `${formatElementLabel(element)}:${count}`)
      .join(" ") || "无";
    hudRoot.innerHTML = `
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
            <span class="chip">${getCurrentQualitySummary()}</span>
          </div>
          <div class="info-stack">
            <div class="compact-info">
              <span class="label">当前总和</span>
              <div class="value">${sum}</div>
            </div>
            <div class="compact-info">
              <span class="label">下一目标</span>
              <div class="subvalue">${getNextQualityGoal()}</div>
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
            ${renderDistributionChart()}
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

  function renderSkillCard(title, skill, fallback) {
    return `<div class="skill-pill"><span class="skill-key">${title}</span><span class="skill-name">${getSkillLabel(skill) || fallback}</span></div>`;
  }

  function updateOverlay() {
    const wave = getCurrentWave();
    if (state.phase === "shop") {
      const possiblePool = getCurrentSkillPoolPreview();
      overlayRoot.innerHTML = `
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
      return;
    }
    if (state.phase === "reward") {
      if (wave.mode === "treasure") {
        const possiblePool = getCurrentSkillPoolPreview();
        overlayRoot.innerHTML = `
        <div class="overlay-card">
          <h3>${getWaveLabel(wave)}</h3>
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
        return;
      }
      overlayRoot.innerHTML = `
        <div class="overlay-card">
          <h3>${getWaveLabel(wave)}</h3>
          <div class="offer-grid">${state.roomOffers.map((offer, index) => `<div class="offer ${offer.taken ? "taken" : ""}"><div class="chip">${index + 1}</div><div class="value">${getOfferLabel(offer)}</div><p>${getOfferDescription(offer)}</p><p>${offer.taken ? "已领取" : "可领取"}</p></div>`).join("")}</div>
          ${state.roomSelectionsLeft <= 0 ? `<div class="overlay-actions"><button type="button" class="overlay-button" data-overlay-action="advance-room">进入下一关</button></div>` : ""}
          <div class="footer-note">剩余可选次数：${state.roomSelectionsLeft}。按 1-${Math.min(5, state.roomOffers.length)} 领取奖励，完成后按空格继续。</div>
        </div>`;
      return;
    }
    if (state.phase === "gameover") {
      overlayRoot.innerHTML = `<div class="overlay-card"><h3>本局失败</h3><div class="footer-note">按 R 重新开始。本局击杀 ${state.kills} 个敌人，止步于第 ${state.waveIndex} 波。</div></div>`;
      return;
    }
    if (state.phase === "victory") {
      overlayRoot.innerHTML = `<div class="overlay-card"><h3>原型通关</h3><div class="footer-note">你已完成 ${WAVE_DEFINITIONS.length} 波流程。按 R 可以重新开始下一局测试。</div></div>`;
      return;
    }
    overlayRoot.innerHTML = "";
  }

  function render() {
    resizeCanvas();
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
    for (const aura of state.auras) {
      const position = toCanvasPosition(state.player.position);
      ctx.fillStyle = aura.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * aura.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = aura.color.replace('0.18', '0.42');
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawHazards() {
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
    if (state.phase !== "reward" || getCurrentWave().mode !== "treasure") return;
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
    for (const projectile of state.projectiles) {
      const position = toCanvasPosition(projectile.position);
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStatusText() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 18px Segoe UI";
    ctx.fillStyle = "rgba(230, 238, 247, 0.84)";
    ctx.fillText(getWaveLabel(getCurrentWave()), canvas.width / 2, 34);
    if (state.lastCrit) {
      ctx.font = "600 14px Segoe UI";
      ctx.fillStyle = "#ffd166";
      ctx.fillText("暴击触发", canvas.width / 2, 56);
    }
    const highTierFlags = [];
    if (getResonanceValue("waterFreezeEnabled")) highTierFlags.push("水6 冻结");
    if (getResonanceValue("fireDoubleDamageChance") > 0) highTierFlags.push("火9 双爆");
    if (getResonanceValue("tempHpPerWave") > 0) highTierFlags.push("木8 临时命");
    if (getResonanceValue("extraProjectileChance") >= 0.25) highTierFlags.push("电9 追射");
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
    const halfWidth = GAME_CONFIG.arena.visibleWidth / 2;
    const halfHeight = GAME_CONFIG.arena.visibleHeight / 2;
    return {
      x: clamp(state.player.position.x, halfWidth, GAME_CONFIG.arena.width - halfWidth),
      y: clamp(state.player.position.y, halfHeight, GAME_CONFIG.arena.height - halfHeight),
    };
  }

  function toCanvasPosition(gridPosition) {
    const camera = getCameraPosition();
    const unit = getViewUnit();
    return {
      x: (gridPosition.x - camera.x) * unit + canvas.width / 2,
      y: (gridPosition.y - camera.y) * unit + canvas.height / 2,
    };
  }

  return game;
}

function createDefaultStatTuning() {
  return {
    flatAdd: 0,
    runtimeFlatAdd: 0,
    baseMultiplier: 1,
    extraMultiplier: 1,
    globalMultiplier: 1,
  };
}

function createInitialState(options = {}) {
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

function createInput() {
  const pressed = new Set();
  const consumed = new Set();
  return {
    onKeyDown(event) { pressed.add(event.code); },
    onKeyUp(event) { pressed.delete(event.code); consumed.delete(event.code); },
    isDown(code) { return pressed.has(code); },
    consume(code) { if (!pressed.has(code) || consumed.has(code)) return false; consumed.add(code); return true; },
  };
}

function rotateVector(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}
