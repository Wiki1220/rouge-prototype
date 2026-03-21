import Phaser from "phaser";
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SKILL_MANA_COST } from "../config";
import type { SessionState } from "../session";

export class HudScene extends Phaser.Scene {
  private hpFill?: Phaser.GameObjects.Graphics;
  private manaFill?: Phaser.GameObjects.Graphics;
  private hpLabel?: Phaser.GameObjects.Text;
  private manaLabel?: Phaser.GameObjects.Text;
  private waveLabel?: Phaser.GameObjects.Text;
  private devLabel?: Phaser.GameObjects.Text;

  constructor() {
    super("hud");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this.drawFrame();
    this.bindGameEvents();
    const session = this.registry.get("session") as SessionState;
    this.renderSession(session);
    this.renderWave(session.wave);
  }

  private drawFrame(): void {
    const frame = this.add.graphics().setDepth(200);
    frame.fillStyle(0x09111a, 0.22);
    frame.lineStyle(2, 0xffffff, 0.08);
    frame.fillRoundedRect(28, 28, GAME_WIDTH - 56, GAME_HEIGHT - 56, 24);
    frame.strokeRoundedRect(28, 28, GAME_WIDTH - 56, GAME_HEIGHT - 56, 24);

    const leftPanel = this.add.graphics().setDepth(210);
    leftPanel.fillStyle(0x081019, 0.78);
    leftPanel.lineStyle(2, 0x27405b, 1);
    leftPanel.fillRoundedRect(46, 46, 380, 146, 22);
    leftPanel.strokeRoundedRect(46, 46, 380, 146, 22);

    const rightPanel = this.add.graphics().setDepth(210);
    rightPanel.fillStyle(0x081019, 0.72);
    rightPanel.lineStyle(2, 0x27405b, 1);
    rightPanel.fillRoundedRect(GAME_WIDTH - 392, 46, 346, 182, 22);
    rightPanel.strokeRoundedRect(GAME_WIDTH - 392, 46, 346, 182, 22);

    this.add.text(72, 62, "生存状态", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "22px",
      fontStyle: "700",
      color: "#f4f7fb",
    }).setDepth(220);

    this.hpFill = this.add.graphics().setDepth(220);
    this.manaFill = this.add.graphics().setDepth(220);

    this.hpLabel = this.add.text(72, 98, "生命 0 / 0", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#f4f7fb",
    }).setDepth(220);

    this.manaLabel = this.add.text(72, 142, "法力 0 / 0", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#f4f7fb",
    }).setDepth(220);

    this.waveLabel = this.add.text(GAME_WIDTH - 364, 66, "第 1 波", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "30px",
      fontStyle: "700",
      color: "#f6f8fc",
    }).setDepth(220);

    this.add.text(GAME_WIDTH - 364, 114, "主动技能", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#9fb1c8",
    }).setDepth(220);

    this.add.text(GAME_WIDTH - 364, 148, `Z：天火轮冲  (${SKILL_MANA_COST} 法力)`, {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#f4c86a",
    }).setDepth(220);

    this.add.text(GAME_WIDTH - 364, 178, `C：回流脉冲  (${SKILL_MANA_COST} 法力)`, {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#80d5ff",
    }).setDepth(220);

    this.devLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 54, "", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#89b2d7",
    }).setOrigin(0.5).setDepth(220);
  }

  private bindGameEvents(): void {
    const gameScene = this.scene.get("game");
    gameScene.events.on("hud:update", this.renderSession, this);
    gameScene.events.on("hud:wave", this.renderWave, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameScene.events.off("hud:update", this.renderSession, this);
      gameScene.events.off("hud:wave", this.renderWave, this);
    });
  }

  private renderSession(session: SessionState): void {
    if (!this.hpFill || !this.manaFill || !this.hpLabel || !this.manaLabel || !this.devLabel) {
      return;
    }

    this.hpFill.clear();
    this.manaFill.clear();

    this.drawBar(this.hpFill, 72, 122, 300, 14, session.player.hp / session.player.maxHp, COLORS.hp);
    this.drawBar(this.manaFill, 72, 166, 300, 14, session.player.mana / session.player.maxMana, COLORS.mana);

    this.hpLabel.setText(`生命 ${Math.ceil(session.player.hp)} / ${session.player.maxHp}`);
    this.manaLabel.setText(`法力 ${Math.floor(session.player.mana)} / ${session.player.maxMana}`);

    const tags = [];
    if (session.developer.invincible) {
      tags.push("无敌测试已开启");
    }
    if (session.developer.showHitboxes) {
      tags.push("碰撞框显示中");
    }
    this.devLabel.setText(tags.length > 0 ? tags.join("  ·  ") : "ESC 返回主菜单");
  }

  private renderWave(wave: number): void {
    this.waveLabel?.setText(`第 ${wave} 波`);
  }

  private drawBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: number,
  ): void {
    graphics.fillStyle(0xffffff, 0.08);
    graphics.fillRoundedRect(x, y, width, height, 7);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(x, y, Math.max(0, width * Phaser.Math.Clamp(ratio, 0, 1)), height, 7);
    graphics.lineStyle(1, 0xffffff, 0.08);
    graphics.strokeRoundedRect(x, y, width, height, 7);
  }
}
