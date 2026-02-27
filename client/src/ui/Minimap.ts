import Phaser from "phaser";
import { MAP_WIDTH_PX, MAP_HEIGHT_PX, TILE_SIZE } from "shared";

const MINIMAP_SIZE = 150;
const MINIMAP_MARGIN = 10;

export class Minimap {
  private graphics: Phaser.GameObjects.Graphics;
  private scaleX: number;
  private scaleY: number;

  constructor(
    private scene: Phaser.Scene,
    private wallPositions: { x: number; y: number }[]
  ) {
    this.scaleX = MINIMAP_SIZE / MAP_WIDTH_PX;
    this.scaleY = MINIMAP_SIZE / MAP_HEIGHT_PX;

    const cam = scene.cameras.main;
    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(900);
    this.graphics.setPosition(
      cam.width - MINIMAP_SIZE - MINIMAP_MARGIN,
      MINIMAP_MARGIN
    );

    this.drawStatic();
  }

  private drawStatic() {
    // Background
    this.graphics.fillStyle(0x000000, 0.6);
    this.graphics.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Border
    this.graphics.lineStyle(1, 0x555555, 1);
    this.graphics.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Walls
    this.graphics.fillStyle(0x667788, 0.8);
    const tileScaleW = TILE_SIZE * this.scaleX;
    const tileScaleH = TILE_SIZE * this.scaleY;
    for (const wall of this.wallPositions) {
      this.graphics.fillRect(
        (wall.x - TILE_SIZE / 2) * this.scaleX,
        (wall.y - TILE_SIZE / 2) * this.scaleY,
        tileScaleW,
        tileScaleH
      );
    }
  }

  update(playerX: number, playerY: number) {
    // Redraw: clear dynamic elements only by redrawing everything
    this.graphics.clear();
    this.drawStatic();

    // Player dot
    this.graphics.fillStyle(0x00ff88, 1);
    this.graphics.fillCircle(
      playerX * this.scaleX,
      playerY * this.scaleY,
      3
    );
  }

  destroy() {
    this.graphics.destroy();
  }
}
