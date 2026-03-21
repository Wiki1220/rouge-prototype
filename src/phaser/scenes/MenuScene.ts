import Phaser from "phaser";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { SessionState } from "../session";

type PanelMode = "none" | "help" | "developer";

export class MenuScene extends Phaser.Scene {
  private panelMode: PanelMode = "none";

  constructor() {
    super("menu");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x13263a, 0x13263a, 0x08111d, 0x08111d, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(0xf0b64d, 0.08);
    bg.fillCircle(250, 180, 240);
    bg.fillStyle(0x4b93ff, 0.08);
    bg.fillCircle(1340, 170, 220);
    bg.fillStyle(0xffffff, 0.02);
    bg.fillRoundedRect(72, 72, GAME_WIDTH - 144, GAME_HEIGHT - 144, 28);
    bg.lineStyle(2, 0xffffff, 0.06);
    bg.strokeRoundedRect(72, 72, GAME_WIDTH - 144, GAME_HEIGHT - 144, 28);

    this.add
      .text(128, 140, "轮骰生存", {
        fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontSize: "68px",
        fontStyle: "700",
        color: "#f8fbff",
      })
      .setShadow(0, 10, "#000000", 20, true, true);

    this.add.text(132, 224, "弹幕生存、滚筒伤害与技能构筑的实验场", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "24px",
      color: "#9ab1ca",
    });

    this.add.text(132, 286, "第一阶段重构目标：先把整个页面收束为真正的游戏界面，再把战斗循环迁入 Phaser。", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "18px",
      color: "#7f93ab",
      wordWrap: { width: 720 },
      lineSpacing: 8,
    });

    this.createButton(132, 420, 300, 72, "开始测试", () => {
      this.scene.start("game");
      this.scene.launch("hud");
    });
    this.createButton(132, 512, 300, 72, "操作说明", () => this.togglePanel("help"));
    this.createButton(132, 604, 300, 72, "开发者面板", () => this.togglePanel("developer"));

    this.add.text(1100, 590, "当前已接入", {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "22px",
      fontStyle: "700",
      color: "#f4f7fb",
    });

    const features = [
      "全屏游戏窗口与内置 HUD",
      "主菜单、操作说明与开发者入口",
      "20x20 战场与居中跟随镜头",
      "空格键不再触发网页滚动",
      "生命/法力条与主动技能耗蓝基础",
    ];

    features.forEach((feature, index) => {
      this.add.text(1100, 640 + index * 38, `• ${feature}`, {
        fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontSize: "20px",
        color: "#9ab1ca",
      });
    });

    this.renderPanel();
  }

  private togglePanel(mode: PanelMode): void {
    this.panelMode = this.panelMode === mode ? "none" : mode;
    this.renderPanel();
  }

  private renderPanel(): void {
    this.children.getAll().filter((child) => child.name === "modal").forEach((child) => child.destroy());
    if (this.panelMode === "none") {
      return;
    }

    const container = this.add.container(0, 0).setName("modal");
    const blocker = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.46).setOrigin(0);
    blocker.setInteractive();
    blocker.on("pointerdown", () => {
      this.panelMode = "none";
      this.renderPanel();
    });
    container.add(blocker);

    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.96);
    panel.lineStyle(2, COLORS.panelEdge, 1);
    panel.fillRoundedRect(920, 164, 540, 520, 26);
    panel.strokeRoundedRect(920, 164, 540, 520, 26);
    container.add(panel);

    if (this.panelMode === "help") {
      container.add(
        this.add.text(972, 212, "操作说明", {
          fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
          fontSize: "34px",
          fontStyle: "700",
          color: "#f6f8fc",
        }),
      );

      const lines = [
        "WASD：移动",
        "鼠标：当前版本主要用于菜单交互",
        "Z / C：释放主动技能，默认每次消耗 8 法力",
        "命中敌人：回复 1 点法力",
        "ESC：返回主菜单",
      ];

      lines.forEach((line, index) => {
        container.add(
          this.add.text(972, 280 + index * 52, line, {
            fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
            fontSize: "24px",
            color: "#9eb2ca",
          }),
        );
      });
    }

    if (this.panelMode === "developer") {
      const session = this.registry.get("session") as SessionState;
      container.add(
        this.add.text(972, 212, "开发者面板", {
          fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
          fontSize: "34px",
          fontStyle: "700",
          color: "#f6f8fc",
        }),
      );

      container.add(
        this.add.text(972, 282, "这些开关会写进本轮会话状态，方便后续联动菜单与战斗场景。", {
          fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
          fontSize: "18px",
          color: "#7f93ab",
          wordWrap: { width: 420 },
          lineSpacing: 6,
        }),
      );

      this.createInlineButton(container, 972, 384, 200, 56, session.developer.invincible ? "无敌：开启" : "无敌：关闭", () => {
        session.developer.invincible = !session.developer.invincible;
        this.registry.set("session", session);
        this.renderPanel();
      });

      this.createInlineButton(container, 1196, 384, 200, 56, session.developer.showHitboxes ? "碰撞框：开启" : "碰撞框：关闭", () => {
        session.developer.showHitboxes = !session.developer.showHitboxes;
        this.registry.set("session", session);
        this.renderPanel();
      });

      container.add(
        this.add.text(972, 472, `测试起始波次：${session.developer.startWave}`, {
          fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
          fontSize: "24px",
          color: "#d7dfe8",
        }),
      );

      this.createInlineButton(container, 972, 520, 92, 52, "-1", () => {
        session.developer.startWave = Math.max(1, session.developer.startWave - 1);
        session.wave = session.developer.startWave;
        this.registry.set("session", session);
        this.renderPanel();
      });
      this.createInlineButton(container, 1080, 520, 92, 52, "+1", () => {
        session.developer.startWave = Math.min(23, session.developer.startWave + 1);
        session.wave = session.developer.startWave;
        this.registry.set("session", session);
        this.renderPanel();
      });
    }

    const closeButton = this.createInlineButton(container, 1220, 620, 180, 56, "关闭面板", () => {
      this.panelMode = "none";
      this.renderPanel();
    });
    closeButton.setName("modal");
  }

  private createButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void): void {
    const button = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x132130, 0.96);
    bg.lineStyle(2, 0x36516d, 1);
    bg.fillRoundedRect(0, 0, width, height, 20);
    bg.strokeRoundedRect(0, 0, width, height, 20);
    const text = this.add.text(width / 2, height / 2, label, {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "26px",
      fontStyle: "700",
      color: "#f4f7fb",
    }).setOrigin(0.5);
    button.add([bg, text]);
    const hitbox = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0xffffff, 0.001);
    hitbox.setInteractive({ useHandCursor: true });
    hitbox.on("pointerover", () => button.setScale(1.02));
    hitbox.on("pointerout", () => button.setScale(1));
    hitbox.on("pointerdown", onClick);
  }

  private createInlineButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x18283a, 1);
    bg.lineStyle(2, 0x3e5874, 1);
    bg.fillRoundedRect(0, 0, width, height, 18);
    bg.strokeRoundedRect(0, 0, width, height, 18);
    const text = this.add.text(width / 2, height / 2, label, {
      fontFamily: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
      fontSize: "22px",
      color: "#f6f8fc",
    }).setOrigin(0.5);
    button.add([bg, text]);
    const hitbox = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0xffffff, 0.001);
    hitbox.setInteractive({ useHandCursor: true });
    hitbox.on("pointerdown", onClick);
    hitbox.on("pointerover", () => button.setScale(1.03));
    hitbox.on("pointerout", () => button.setScale(1));
    container.add([button, hitbox]);
    return button;
  }
}
