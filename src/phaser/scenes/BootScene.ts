import Phaser from "phaser";
import { COLORS, MAP_TILES, TILE_SIZE, WORLD_SIZE } from "../config";
import { createDefaultSession } from "../session";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    const graphics = this.add.graphics({ x: 0, y: 0 });

    graphics.fillStyle(COLORS.player, 1);
    graphics.fillCircle(18, 18, 18);
    graphics.generateTexture("player-orb", 36, 36);
    graphics.clear();

    graphics.fillStyle(COLORS.enemy, 1);
    graphics.fillCircle(16, 16, 16);
    graphics.generateTexture("enemy-orb", 32, 32);
    graphics.clear();

    graphics.fillStyle(COLORS.bullet, 1);
    graphics.fillCircle(6, 6, 6);
    graphics.generateTexture("bullet-orb", 12, 12);
    graphics.clear();

    graphics.lineStyle(2, COLORS.grid, 1);
    graphics.fillStyle(COLORS.bg, 1);
    graphics.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    for (let x = 0; x <= MAP_TILES; x += 1) {
      const position = x * TILE_SIZE;
      graphics.lineBetween(position, 0, position, WORLD_SIZE);
      graphics.lineBetween(0, position, WORLD_SIZE, position);
    }
    graphics.lineStyle(4, COLORS.gridBright, 1);
    graphics.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    graphics.generateTexture("arena-grid", WORLD_SIZE, WORLD_SIZE);
    graphics.destroy();

    this.registry.set("session", createDefaultSession());
    this.scene.start("menu");
  }
}
