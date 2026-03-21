import Phaser from "phaser";
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  PLAYER_SPEED,
  SKILL_MANA_COST,
  TILE_SIZE,
  WORLD_SIZE,
} from "../config";
import type { SessionState } from "../session";

interface EnemyData {
  hp: number;
  speed: number;
  contactDamage: number;
}

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private skillKeys!: Record<"skill1" | "skill2" | "menu", Phaser.Input.Keyboard.Key>;
  private player!: Phaser.Physics.Arcade.Image;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private arenaDebug?: Phaser.GameObjects.Graphics;
  private skillNotice?: Phaser.GameObjects.Text;
  private shootTimer = 0;
  private enemyTimer = 0;
  private session!: SessionState;

  constructor() {
    super("game");
  }

  create(): void {
    this.session = structuredClone(this.registry.get("session") as SessionState);
    this.session.player.hp = PLAYER_MAX_HP;
    this.session.player.maxHp = PLAYER_MAX_HP;
    this.session.player.mana = 0;
    this.session.player.maxMana = PLAYER_MAX_MANA;
    this.session.wave = this.session.developer.startWave;

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.image(WORLD_SIZE / 2, WORLD_SIZE / 2, "arena-grid");

    this.player = this.physics.add.image(WORLD_SIZE / 2, WORLD_SIZE / 2, "player-orb");
    this.player.setCircle(18);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 64,
      runChildUpdate: false,
    });

    this.enemies = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 32,
      runChildUpdate: false,
    });

    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(this.computeCameraZoom());

    this.scale.on("resize", this.handleResize, this);
    this.handleResize();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.moveKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
    this.skillKeys = this.input.keyboard!.addKeys({
      skill1: Phaser.Input.Keyboard.KeyCodes.Z,
      skill2: Phaser.Input.Keyboard.KeyCodes.C,
      menu: Phaser.Input.Keyboard.KeyCodes.ESC,
    }) as Record<"skill1" | "skill2" | "menu", Phaser.Input.Keyboard.Key>;

    this.physics.add.overlap(this.bullets, this.enemies, (first, second) => {
      this.handleBulletHit(first as Phaser.Physics.Arcade.Image, second as Phaser.Physics.Arcade.Image);
    });
    this.physics.add.overlap(this.player, this.enemies, (first, second) => {
      this.handlePlayerContact(first as Phaser.Physics.Arcade.Image, second as Phaser.Physics.Arcade.Image);
    });

    this.skillNotice = this.add
      .text(0, 0, "", {
        fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontSize: "26px",
        color: "#f6f8fc",
        backgroundColor: "rgba(5, 10, 15, 0.7)",
        padding: { x: 16, y: 10 },
      })
      .setScrollFactor(0)
      .setDepth(60)
      .setVisible(false);

    this.events.emit("hud:update", this.session);
    this.spawnWave(this.session.wave);
  }

  update(_: number, deltaMs: number): void {
    const delta = deltaMs / 1000;
    this.updateMovement();
    this.updateCombat(delta);
    this.updateEnemies();
    this.updateDebug();

    if (Phaser.Input.Keyboard.JustDown(this.skillKeys.skill1)) {
      this.castSkill("天火轮冲");
    }

    if (Phaser.Input.Keyboard.JustDown(this.skillKeys.skill2)) {
      this.castSkill("回流脉冲");
    }

    if (Phaser.Input.Keyboard.JustDown(this.skillKeys.menu)) {
      this.registry.set("session", this.session);
      this.scene.stop("hud");
      this.scene.start("menu");
    }
  }

  private updateMovement(): void {
    let moveX = 0;
    let moveY = 0;

    if (this.moveKeys.left.isDown || this.cursors.left.isDown) {
      moveX -= 1;
    }
    if (this.moveKeys.right.isDown || this.cursors.right.isDown) {
      moveX += 1;
    }
    if (this.moveKeys.up.isDown || this.cursors.up.isDown) {
      moveY -= 1;
    }
    if (this.moveKeys.down.isDown || this.cursors.down.isDown) {
      moveY += 1;
    }

    const vector = new Phaser.Math.Vector2(moveX, moveY).normalize().scale(PLAYER_SPEED);
    this.player.setVelocity(vector.x, vector.y);
  }

  private updateCombat(delta: number): void {
    this.shootTimer += delta;
    this.enemyTimer += delta;

    if (this.shootTimer >= 0.18) {
      this.shootTimer = 0;
      this.fireAtNearestEnemy();
    }

    if (this.enemyTimer >= 1.25 && this.enemies.countActive(true) < 12) {
      this.enemyTimer = 0;
      this.spawnEnemy();
    }

    for (const child of this.bullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) {
        continue;
      }
      if (bullet.x < -100 || bullet.x > WORLD_SIZE + 100 || bullet.y < -100 || bullet.y > WORLD_SIZE + 100) {
        bullet.disableBody(true, true);
      }
    }
  }

  private updateEnemies(): void {
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) {
        continue;
      }
      const direction = new Phaser.Math.Vector2(this.player.x - enemy.x, this.player.y - enemy.y).normalize();
      const speed = enemy.getData("speed") as number;
      enemy.setVelocity(direction.x * speed, direction.y * speed);
    }
  }

  private fireAtNearestEnemy(): void {
    const target = this.enemies.getChildren().find((entry) => (entry as Phaser.Physics.Arcade.Image).active) as
      | Phaser.Physics.Arcade.Image
      | undefined;
    if (!target) {
      return;
    }

    const bullet = this.bullets.get(this.player.x, this.player.y, "bullet-orb") as Phaser.Physics.Arcade.Image | null;
    if (!bullet) {
      return;
    }

    bullet.setActive(true).setVisible(true);
    bullet.setDepth(8);
    bullet.body?.reset(this.player.x, this.player.y);
    const direction = new Phaser.Math.Vector2(target.x - this.player.x, target.y - this.player.y).normalize();
    bullet.setVelocity(direction.x * 760, direction.y * 760);
  }

  private spawnWave(wave: number): void {
    const count = Math.min(4 + wave, 12);
    for (let index = 0; index < count; index += 1) {
      this.spawnEnemy();
    }
    this.events.emit("hud:wave", wave);
  }

  private spawnEnemy(): void {
    const edge = Phaser.Math.Between(0, 3);
    const padding = 120;
    let x = WORLD_SIZE / 2;
    let y = WORLD_SIZE / 2;

    if (edge === 0) {
      x = Phaser.Math.Between(padding, WORLD_SIZE - padding);
      y = padding;
    } else if (edge === 1) {
      x = WORLD_SIZE - padding;
      y = Phaser.Math.Between(padding, WORLD_SIZE - padding);
    } else if (edge === 2) {
      x = Phaser.Math.Between(padding, WORLD_SIZE - padding);
      y = WORLD_SIZE - padding;
    } else {
      x = padding;
      y = Phaser.Math.Between(padding, WORLD_SIZE - padding);
    }

    const enemy = this.enemies.get(x, y, "enemy-orb") as Phaser.Physics.Arcade.Image | null;
    if (!enemy) {
      return;
    }

    enemy.setActive(true).setVisible(true);
    enemy.body?.reset(x, y);
    enemy.setCircle(16);
    enemy.setDataEnabled();
    const waveFactor = 1 + Math.floor(this.session.wave / 4) * 0.12;
    const data: EnemyData = {
      hp: Math.round(4 * waveFactor),
      speed: 120 + this.session.wave * 4,
      contactDamage: 8 + Math.floor(this.session.wave / 3),
    };
    enemy.setData("hp", data.hp);
    enemy.setData("speed", data.speed);
    enemy.setData("contactDamage", data.contactDamage);
  }

  private handleBulletHit(bullet: Phaser.Physics.Arcade.Image, enemy: Phaser.Physics.Arcade.Image): void {
    bullet.disableBody(true, true);

    const nextHp = (enemy.getData("hp") as number) - 1;
    enemy.setData("hp", nextHp);
    this.addMana(1);

    if (nextHp <= 0) {
      enemy.disableBody(true, true);
      if (this.enemies.countActive(true) === 0) {
        this.session.wave += 1;
        this.events.emit("hud:wave", this.session.wave);
        this.spawnWave(this.session.wave);
      }
    }
  }

  private handlePlayerContact(player: Phaser.Physics.Arcade.Image, enemy: Phaser.Physics.Arcade.Image): void {
    const damage = (enemy.getData("contactDamage") as number) ?? 6;

    if (!this.session.developer.invincible) {
      this.session.player.hp = Math.max(0, this.session.player.hp - damage * 0.05);
      this.events.emit("hud:update", this.session);
    }

    const knockback = new Phaser.Math.Vector2(player.x - enemy.x, player.y - enemy.y).normalize().scale(32);
    player.x += knockback.x;
    player.y += knockback.y;

    if (this.session.player.hp <= 0) {
      this.registry.set("session", this.session);
      this.scene.stop("hud");
      this.scene.start("menu");
    }
  }

  private castSkill(skillName: string): void {
    if (this.session.player.mana < SKILL_MANA_COST) {
      this.showNotice("法力不足");
      return;
    }

    this.session.player.mana -= SKILL_MANA_COST;
    this.events.emit("hud:update", this.session);
    this.showNotice(`${skillName} 已释放`);

    let affected = 0;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active || affected >= 4) {
        continue;
      }
      affected += 1;
      enemy.setData("hp", (enemy.getData("hp") as number) - 2);
      if ((enemy.getData("hp") as number) <= 0) {
        enemy.disableBody(true, true);
      }
    }
  }

  private addMana(amount: number): void {
    this.session.player.mana = Phaser.Math.Clamp(this.session.player.mana + amount, 0, this.session.player.maxMana);
    this.events.emit("hud:update", this.session);
  }

  private showNotice(content: string): void {
    if (!this.skillNotice) {
      return;
    }
    this.skillNotice.setText(content);
    this.skillNotice.setPosition(GAME_WIDTH / 2 - this.skillNotice.width / 2, GAME_HEIGHT - 120);
    this.skillNotice.setVisible(true);
    this.tweens.killTweensOf(this.skillNotice);
    this.skillNotice.setAlpha(1);
    this.tweens.add({
      targets: this.skillNotice,
      alpha: 0,
      delay: 450,
      duration: 700,
      onComplete: () => this.skillNotice?.setVisible(false),
    });
  }

  private updateDebug(): void {
    if (!this.session.developer.showHitboxes) {
      this.arenaDebug?.clear();
      return;
    }

    if (!this.arenaDebug) {
      this.arenaDebug = this.add.graphics().setDepth(1000);
    }

    this.arenaDebug.clear();
    this.arenaDebug.lineStyle(1, 0x8cffd6, 0.7);
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) {
        continue;
      }
      this.arenaDebug.strokeCircle(enemy.x, enemy.y, 18);
    }
    this.arenaDebug.strokeCircle(this.player.x, this.player.y, 20);
  }

  private computeCameraZoom(): number {
    const widthZoom = GAME_WIDTH / (TILE_SIZE * 6.5);
    const heightZoom = GAME_HEIGHT / (TILE_SIZE * 4);
    return Math.min(widthZoom, heightZoom);
  }

  private handleResize(): void {
    this.cameras.main.setZoom(this.computeCameraZoom());
  }
}
