import {
  ENEMY_ARCHETYPES,
  GAME_CONFIG,
  REEL_LIBRARY,
  SHOP_ITEM_LIBRARY,
  SKILL_LIBRARY,
  WAVE_DEFINITIONS,
} from "./config.js";
import { clamp, distance, normalize, pickUnique, randomInt } from "./utils.js";

export function createGame({ canvas, hudRoot, overlayRoot }) {
  const ctx = canvas.getContext("2d");
  const input = createInput();
  let state = createInitialState();
  let lastTime = performance.now();

  const game = {
    start,
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

  beginWave(state, 1);
  updateHud();

  function start() {
    window.addEventListener("keydown", input.onKeyDown);
    window.addEventListener("keyup", input.onKeyUp);
    requestAnimationFrame(loop);
  }

  function loop(time) {
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
      state = createInitialState();
      beginWave(state, 1);
    }

    if (state.phase === "battle") {
      if (state.pendingSkillChoices && input.consume("KeyQ")) equipSkill(state.pendingSkillChoices[0]);
      if (state.pendingSkillChoices && input.consume("KeyE")) equipSkill(state.pendingSkillChoices[1]);
      if (input.consume("KeyZ")) castEquippedSkill(0);
      if (input.consume("KeyC")) castEquippedSkill(1);
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
    const speed = getStat("speed", state.player.baseSpeed) + getResonanceValue("speed");

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
    const fireRate = getStat("fireRate", state.player.baseFireRate) + getResonanceValue("fireRateFlat");
    if (state.player.fireCooldown > 0) return;

    const reel = state.reels[state.activeReelIndex];
    const rolledValue = randomInt(1 + (reel.bias ?? 0), reel.sides + (reel.bias ?? 0));
    const critFaces = computeCritFaces();
    const isCrit = randomInt(1, critFaces) === Math.min(GAME_CONFIG.critical.triggerValue, critFaces);
    const damage = Math.max(1, rolledValue + getResonanceValue("flatDamage") + (isCrit ? rolledValue : 0));
    const projectileCount = 1 + getResonanceValue("bonusProjectiles");

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
        color: isCrit ? "#ffd166" : "#f3f4f6",
      });
    }

    recordRoll(rolledValue, isCrit);
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
          announceBossPhase(enemy.name);
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

      enemy.slowLeft = Math.max(0, (enemy.slowLeft ?? 0) - dt);
      enemy.speed = enemy.baseSpeed * (enemy.slowLeft > 0 ? 0.75 : 1);
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
    announceBossPhase(`${enemy.name} 释放环形爆发`);
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
    announceBossPhase(`${enemy.name} 锁定齐射`);
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
    announceBossPhase(`${enemy.name} 呼唤落火`);
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
      announceBossPhase(`${enemy.name} 进入第二阶段`);
    } else if (enemy.phase === 2 && hpRatio <= 0.33) {
      enemy.phase = 3;
      enemy.speedScale = enemy.id === "finalBoss" ? 1.3 : 1.24;
      enemy.fireRateScale = enemy.id === "finalBoss" ? 1.7 : 1.55;
      enemy.projectileSpeedScale = enemy.id === "finalBoss" ? 1.28 : 1.22;
      enemy.projectileDamageBonus = enemy.id === "finalBoss" ? 3 : 2;
      enemy.pendingSummons = Math.max(enemy.pendingSummons ?? 0, enemy.id === "finalBoss" ? 4 : 3);
      enemy.summonCooldown = 0.45;
      announceBossPhase(`${enemy.name} 进入最终阶段`);
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
            enemy.hp -= projectile.damage;
            if (projectile.slowOnHit) enemy.slowLeft = Math.max(enemy.slowLeft ?? 0, 1 + projectile.slowOnHit);
            if (projectile.splashDamage) splashHit(enemy.position, projectile.splashDamage, enemy);
            if (projectile.chainChance && Math.random() < projectile.chainChance) chainHit(enemy, Math.max(1, Math.floor(projectile.damage * 0.5)));
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
      }
    }
  }

  function splashHit(center, damage, primaryTarget) {
    for (const enemy of state.enemies) {
      if (enemy !== primaryTarget && distance(enemy.position, center) <= 0.9) enemy.hp -= damage;
    }
  }

  function chainHit(sourceEnemy, damage) {
    const next = state.enemies
      .filter((enemy) => enemy !== sourceEnemy)
      .sort((a, b) => distance(a.position, sourceEnemy.position) - distance(b.position, sourceEnemy.position))[0];
    if (next && distance(next.position, sourceEnemy.position) <= 2.6) next.hp -= damage;
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
        enemy.hp -= aura.damage;
        if (aura.slowOnHit) enemy.slowLeft = Math.max(enemy.slowLeft ?? 0, 0.6 + aura.slowOnHit);
      }
      if (aura.healPerPulse) healPlayer(aura.healPerPulse);
    }
    state.auras = state.auras.filter((aura) => aura.remaining > 0);
  }

  function recordRoll(value, isCrit) {
    state.reels[state.activeReelIndex].lastValue = value;
    state.lastCrit = isCrit;
    if (!state.pendingSkillChoices) {
      state.valueSlots[state.nextValueSlotIndex] = value;
      state.nextValueSlotIndex = (state.nextValueSlotIndex + 1) % GAME_CONFIG.valueSlots;
      if (state.valueSlots.every((entry) => entry !== null)) {
        state.pendingSkillChoices = generateSkillChoices();
      }
    }
    state.activeReelIndex = (state.activeReelIndex + 1) % state.reels.length;
  }

  function computeCritFaces() {
    return Math.max(4, GAME_CONFIG.critical.baseFaces - new Set(state.reels.map((reel) => reel.sides)).size + 1);
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

  function resolveLeadingElements() {
    return [...new Set([...state.reels].sort((a, b) => b.sides - a.sides).slice(0, 2).flatMap((reel) => reel.elements))];
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
    const bonuses = { flatDamage: 0, speed: 0, slowOnHit: 0, regen: 0, chainChance: 0, splashDamage: 0, pierceShots: 0, bonusMaxHp: 0, bonusProjectiles: 0, healOnCast: 0, fireRateFlat: 0 };
    for (const [element, rules] of Object.entries(GAME_CONFIG.resonanceRules)) {
      const count = counts[element] ?? 0;
      if (rules.perStack && count >= rules.perStack.every) bonuses[rules.perStack.stat] += Math.floor(count / rules.perStack.every) * rules.perStack.amount;
      for (const threshold of rules.thresholds ?? []) if (count >= threshold.count) bonuses[threshold.effect.stat] += threshold.effect.amount;
    }
    return { counts, bonuses };
  }

  function getResonanceValue(stat) {
    return computeResonance().bonuses[stat] ?? 0;
  }

  function equipSkill(skill) {
    if (!skill) return;
    const slotIndex = state.skillReplaceCursor % state.equippedSkills.length;
    state.equippedSkills[slotIndex] = skill;
    state.skillReplaceCursor += 1;
    state.pendingSkillChoices = null;
  }

  function castEquippedSkill(index) {
    const skill = state.equippedSkills[index];
    if (!skill || state.phase !== "battle") return;
    castSkill(skill);
    const healOnCast = getResonanceValue("healOnCast");
    if (healOnCast > 0) healPlayer(healOnCast);
    state.pendingSkillChoices = null;
    state.valueSlots = Array(GAME_CONFIG.valueSlots).fill(null);
    state.nextValueSlotIndex = 0;
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
    ["Digit1", "Digit2", "Digit3"].forEach((key, index) => {
      if (!input.consume(key)) return;
      const offer = state.shopOffers[index];
      if (!offer || state.gold < offer.price) return;
      const success = offer.apply?.(state);
      if (success === false) return;
      state.gold -= offer.price;
      syncResonanceDerivedStats();
      clampSelectedReel();
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
      syncResonanceDerivedStats();
      clampSelectedReel();
    });
    if (input.consume("Space") && state.roomSelectionsLeft <= 0) advanceFromRoom();
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
        syncResonanceDerivedStats();
        clampSelectedReel();
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
    targetState.player.position = { x: 5, y: 5 };
    targetState.pendingSkillChoices = null;
    if (wave.type === "combat") {
      targetState.phase = "battle";
      const budget = wave.endless ? buildEndlessBudget(targetState.endlessLevel) : wave.budget;
      targetState.spawnQueue = budget.flatMap((entry) => Array.from({ length: entry.count }, () => entry.enemyId));
    } else {
      targetState.phase = "reward";
      targetState.roomOffers = wave.roomOffers.map((id) => ({ ...buildOfferFromId(id), taken: false }));
      targetState.roomSelectionsLeft = wave.freeSelections ?? 1;
      if (wave.mode === "treasure") {
        const pickupPositions = [
          { x: 5, y: 2.2 },
          { x: 7.1, y: 3.4 },
          { x: 6.3, y: 6.6 },
          { x: 3.7, y: 6.6 },
          { x: 2.9, y: 3.4 },
        ];
        targetState.roomPickups = targetState.roomOffers.map((offer, index) => ({
          offerIndex: index,
          position: pickupPositions[index] ?? { x: 5, y: 5 },
          radius: 0.34,
          taken: false,
        }));
      }
    }
    syncResonanceDerivedStats();
    clampSelectedReel();
  }

  function getCurrentWave() {
    return WAVE_DEFINITIONS[state.waveIndex - 1];
  }

  function getWaveLabel(wave = getCurrentWave()) {
    if (wave.endless) return `?24?????? ${state.endlessLevel}`;
    return wave.label;
  }

  function getMainWaveCount() {
    const endlessIndex = WAVE_DEFINITIONS.findIndex((entry) => entry.endless);
    return endlessIndex === -1 ? WAVE_DEFINITIONS.length : endlessIndex;
  }

  function getWaveProgressText() {
    const wave = getCurrentWave();
    if (wave.endless) return `???? / ?? ${state.endlessLevel}`;
    return `${state.waveIndex}/${getMainWaveCount()}`;
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
  }

  function clampSelectedReel() {
    state.selectedReelIndex = Math.max(0, Math.min(state.selectedReelIndex, Math.max(0, state.reels.length - 1)));
  }

  function sellSelectedReel() {
    if (state.phase !== "shop" || state.reels.length <= 1) return;
    const reel = state.reels[state.selectedReelIndex];
    state.gold += reel.sellPrice ?? Math.max(1, Math.floor(reel.price / 2));
    state.reels.splice(state.selectedReelIndex, 1);
    clampSelectedReel();
    if (state.activeReelIndex >= state.reels.length) state.activeReelIndex = 0;
    syncResonanceDerivedStats();
  }

  function syncResonanceDerivedStats() {
    const bonusMaxHp = getResonanceValue("bonusMaxHp");
    const targetMax = state.player.baseMaxHp + state.player.permanentMaxHpBonus + bonusMaxHp;
    if (targetMax > state.player.maxHp) state.player.hp += targetMax - state.player.maxHp;
    state.player.resonanceBonusMaxHp = bonusMaxHp;
    state.player.maxHp = targetMax;
    state.player.hp = Math.min(state.player.hp, state.player.maxHp);
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
    if (damage <= 0) {
      state.player.invulnerabilityLeft = Math.max(state.player.invulnerabilityLeft, 0.08);
      return;
    }
    state.player.hp -= damage;
    state.player.invulnerabilityLeft = state.player.baseInvulnerability;
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
    syncResonanceDerivedStats();
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

  function addTimedModifier(stat, multiplier, duration) {
    state.modifiers.push({ stat, multiplier, remaining: duration });
  }

  function getStat(stat, baseValue) {
    return state.modifiers.filter((entry) => entry.stat === stat).reduce((value, entry) => value * entry.multiplier, baseValue);
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
        radius: options.radius ?? 0.1,
      }));
    }
  }

  function makePlayerProjectile({ velocity, speedScale = 1, damage, color, slowOnHit = 0, chainChance = 0, rangeScale = 1, splashDamage = 0, pierceLeft = 0, radius = 0.1 }) {
    return {
      team: "player",
      position: { ...state.player.position },
      velocity,
      speed: getStat("projectileSpeed", state.player.baseProjectileSpeed) * speedScale,
      remainingRange: state.player.baseProjectileRange * rangeScale,
      radius,
      damage,
      pierceLeft,
      splashDamage,
      slowOnHit,
      chainChance,
      color,
    };
  }

  function updateHud() {
    const resonance = computeResonance();
    const wave = getCurrentWave();
    const leadingElements = resolveLeadingElements();
    const resonanceText = Object.entries(resonance.counts).filter(([, count]) => count > 0).map(([element, count]) => `${formatElementLabel(element)}:${count}`).join(" | ") || "无";
    hudRoot.innerHTML = `
      <div class="section">
        <h2>技能与候选</h2>
        <div class="grid skill-row">
          ${renderSkillCard("候选 Q", state.pendingSkillChoices?.[0], "按 Q 装备此候选技能")}
          ${renderSkillCard("候选 E", state.pendingSkillChoices?.[1], "按 E 装备此候选技能")}
          ${renderSkillCard("槽位 Z", state.equippedSkills[0], "按 Z 释放槽位技能")}
          ${renderSkillCard("槽位 C", state.equippedSkills[1], "按 C 释放槽位技能")}
        </div>
      </div>
      <div class="section">
        <h2>滚筒阵列</h2>
        <div class="grid reel-row">
          ${state.reels.map((reel, index) => `
            <div class="box ${(index === state.activeReelIndex ? "highlight" : "") + (index === state.selectedReelIndex && state.phase === "shop" ? " selected" : "")}">
              <span class="label">d${reel.sides}</span>
              <div class="value">${reel.lastValue ?? "..."}</div>
              <div class="subvalue">${formatElementList(reel.elements)}${reel.bias ? ` | 偏置 +${reel.bias}` : ""}</div>
              <div class="subvalue">售价 ${reel.sellPrice ?? "-"}</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="section">
        <h2>数值记录</h2>
        <div class="grid value-row">
          ${state.valueSlots.map((value, index) => `
            <div class="box ${index === state.nextValueSlotIndex ? "highlight" : ""}">
              <span class="label">槽 ${index + 1}</span>
              <div class="value">${value ?? "-"}</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="section">
        <h2>战斗状态</h2>
        <div class="grid stats">
          <div class="box"><span class="label">生命</span><div class="value">${state.player.hp}/${state.player.maxHp}</div></div>
          <div class="box"><span class="label">金币</span><div class="value">${state.gold}</div></div>
          <div class="box"><span class="label">波次</span><div class="value">${getWaveProgressText()}</div></div>
          <div class="box"><span class="label">房间</span><div class="value">${getWaveLabel(wave)}</div></div>
          <div class="box"><span class="label">首领</span><div class="value">${(() => { const boss = state.enemies.find((enemy) => enemy.isBoss); return boss ? `${boss.name} 第${boss.phase}阶段 ${Math.max(0, Math.ceil(boss.hp))}/${boss.maxHp}` : "无"; })()}</div></div>
          <div class="box"><span class="label">测试</span><div class="value">${state.debugNoDamage ? "无敌开启" : "关闭"}</div></div>
        </div>
        <div class="box" style="margin-top:8px;">
          <span class="label">共鸣</span>
          <div class="subvalue">${resonanceText}</div>
        </div>
        <div class="box" style="margin-top:8px;">
          <span class="label">技能池元素</span>
          <div class="subvalue">${leadingElements.length > 0 ? formatElementList(leadingElements) : "无"}</div>
        </div>
        ${state.bossAnnouncement ? `<div class="box" style="margin-top:8px; border-color:#ffd166;"><span class="label">提示</span><div class="subvalue">${state.bossAnnouncement}</div></div>` : ""}
      </div>
    `;
  }

  function renderSkillCard(title, skill, fallback) {
    return `<div class="box skill"><span class="label">${title}</span><div class="value">${skill?.name ?? "空"}</div><div class="subvalue">${skill?.description ?? fallback}</div></div>`;
  }

  function updateOverlay() {
    const wave = getCurrentWave();
    if (state.phase === "shop") {
      overlayRoot.innerHTML = `
        <div class="overlay-card">
          <h3>商店阶段</h3>
          <div class="offer-grid">${state.shopOffers.map((offer, index) => `<div class="offer"><div class="chip">${index + 1}</div><div class="value">${offer.name}</div><p>价格：${offer.price}</p><p>${offer.description}</p></div>`).join("")}</div>
          <div class="footer-note">按 1/2/3 购买，左右方向键切换滚筒，X 售出当前滚筒，空格继续。当前金币：${state.gold}</div>
        </div>`;
      return;
    }
    if (state.phase === "reward") {
      if (wave.mode === "treasure") {
        overlayRoot.innerHTML = `
        <div class="overlay-card">
          <h3>${getWaveLabel(wave)}</h3>
          <div class="offer-grid">${state.roomOffers.map((offer, index) => `<div class="offer ${offer.taken ? "taken" : ""}"><div class="chip">${index + 1}</div><div class="value">${offer.name}</div><p>${offer.description}</p><p>${offer.taken ? "已领取" : "移动拾取"}</p></div>`).join("")}</div>
          <div class="footer-note">剩余可选次数：${state.roomSelectionsLeft}。用 WASD 移动拾取奖励，拿满后按空格继续。</div>
        </div>`;
        return;
      }
      overlayRoot.innerHTML = `
        <div class="overlay-card">
          <h3>${getWaveLabel(wave)}</h3>
          <div class="offer-grid">${state.roomOffers.map((offer, index) => `<div class="offer ${offer.taken ? "taken" : ""}"><div class="chip">${index + 1}</div><div class="value">${offer.name}</div><p>${offer.description}</p><p>${offer.taken ? "已领取" : "可领取"}</p></div>`).join("")}</div>
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
    for (let y = 0; y < GAME_CONFIG.arena.height; y += 1) {
      for (let x = 0; x < GAME_CONFIG.arena.width; x += 1) {
        const isOuter = x < GAME_CONFIG.arena.playableInset || y < GAME_CONFIG.arena.playableInset || x >= GAME_CONFIG.arena.width - GAME_CONFIG.arena.playableInset || y >= GAME_CONFIG.arena.height - GAME_CONFIG.arena.playableInset;
        ctx.fillStyle = isOuter ? "#52461d" : "#1f2a36";
        ctx.fillRect(GAME_CONFIG.arena.originX + x * GAME_CONFIG.arena.cellSize, GAME_CONFIG.arena.originY + y * GAME_CONFIG.arena.cellSize, GAME_CONFIG.arena.cellSize - 2, GAME_CONFIG.arena.cellSize - 2);
      }
    }
  }

  function drawPlayer() {
    const position = toCanvasPosition(state.player.position);
    ctx.fillStyle = state.player.invulnerabilityLeft > 0 ? "#9cd5ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(position.x, position.y, GAME_CONFIG.arena.cellSize * state.player.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      const position = toCanvasPosition(enemy.position);
      ctx.fillStyle = enemy.color;
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
    const wave = getCurrentWave();
    const boss = state.enemies.find((enemy) => enemy.isBoss);
    ctx.fillStyle = "#aeb8c6";
    ctx.font = "16px Segoe UI";
    ctx.fillText(`房间：${wave.label}`, 24, 36);
    ctx.fillText(`击杀：${state.kills} | 阶段：${formatPhaseLabel(state.phase)}`, 24, 60);
    if (boss) {
      ctx.fillStyle = "#ffd166";
      ctx.fillText(`首领生命：${Math.max(0, Math.ceil(boss.hp))}/${boss.maxHp} | 第${boss.phase ?? 1}阶段`, 24, 84);
      if (state.bossAnnouncement) ctx.fillText(state.bossAnnouncement, 24, 108);
    } else if (state.lastCrit) {
      ctx.fillStyle = "#ffd166";
      ctx.fillText("上一发触发了暴击", 24, 84);
    }
  }

  function toCanvasPosition(gridPosition) {
    return { x: GAME_CONFIG.arena.originX + gridPosition.x * GAME_CONFIG.arena.cellSize, y: GAME_CONFIG.arena.originY + gridPosition.y * GAME_CONFIG.arena.cellSize };
  }

  return game;
}

function createInitialState() {
  return {
    clock: 0,
    phase: "battle",
    waveIndex: 1,
    gold: GAME_CONFIG.economy.startingGold,
    kills: 0,
    reels: [structuredClone(REEL_LIBRARY[0]), structuredClone(REEL_LIBRARY[1]), structuredClone(REEL_LIBRARY[2]), structuredClone(REEL_LIBRARY[3])],
    selectedReelIndex: 0,
    activeReelIndex: 0,
    valueSlots: Array(GAME_CONFIG.valueSlots).fill(null),
    nextValueSlotIndex: 0,
    pendingSkillChoices: null,
    equippedSkills: [null, null],
    skillReplaceCursor: 0,
    lastCrit: false,
    roomOffers: [],
    roomSelectionsLeft: 0,
    roomPickups: [],
    bossAnnouncement: "",
    telegraphs: [],
    hazards: [],
    waveBuffUsage: { red: 0, blue: 0, green: 0 },
    bossAnnouncementTimer: 0,
    debugNoDamage: false,
    endlessLevel: 0,
    mainRunCleared: false,
    scheduledEffects: [],
    auras: [],
    player: {
      position: { x: 5, y: 5 },
      direction: { x: 1, y: 0 },
      hp: GAME_CONFIG.player.baseMaxHp,
      maxHp: GAME_CONFIG.player.baseMaxHp,
      baseMaxHp: GAME_CONFIG.player.baseMaxHp,
      permanentMaxHpBonus: 0,
      resonanceBonusMaxHp: 0,
      regenBuffer: 0,
      shield: 0,
      maxShield: 8,
      shieldDecayLeft: 0,
      radius: GAME_CONFIG.player.radius,
      baseSpeed: GAME_CONFIG.player.speed,
      baseFireRate: GAME_CONFIG.player.fireRate,
      baseProjectileSpeed: GAME_CONFIG.player.projectileSpeed,
      baseProjectileRange: GAME_CONFIG.player.projectileRange,
      baseInvulnerability: GAME_CONFIG.player.invulnerability,
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
