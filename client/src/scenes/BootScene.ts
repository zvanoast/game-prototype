import Phaser from "phaser";
import { TILE_SIZE, PLAYER_RADIUS } from "shared";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    // --- Player sprite: circle with right-facing arrow (rotatable) ---
    const size = PLAYER_RADIUS * 2; // 32
    const cx = size / 2;
    const cy = size / 2;

    const playerGfx = this.add.graphics();
    playerGfx.fillStyle(0x00ff88, 1);
    playerGfx.fillCircle(cx, cy, PLAYER_RADIUS - 1);
    // Direction arrow pointing right
    playerGfx.fillStyle(0xaaffcc, 1);
    playerGfx.fillTriangle(
      size - 4, cy,      // tip (right)
      cx + 2, cy - 6,    // upper base
      cx + 2, cy + 6     // lower base
    );
    playerGfx.generateTexture("player", size, size);
    playerGfx.destroy();

    // --- Remote player sprite: same shape, red ---
    const remoteGfx = this.add.graphics();
    remoteGfx.fillStyle(0xff4444, 1);
    remoteGfx.fillCircle(cx, cy, PLAYER_RADIUS - 1);
    remoteGfx.fillStyle(0xff8888, 1);
    remoteGfx.fillTriangle(
      size - 4, cy,
      cx + 2, cy - 6,
      cx + 2, cy + 6
    );
    remoteGfx.generateTexture("player_remote", size, size);
    remoteGfx.destroy();

    // --- Projectile sprite: 4x4 yellow circle ---
    const projGfx = this.add.graphics();
    projGfx.fillStyle(0xffff00, 1);
    projGfx.fillCircle(2, 2, 2);
    projGfx.generateTexture("projectile", 4, 4);
    projGfx.destroy();

    // --- Combined tileset texture: floor (index 0) + wall (index 1) side by side ---
    const tsGfx = this.add.graphics();
    // Floor tile (index 0) — dark gray with subtle grid lines
    tsGfx.fillStyle(0x2a2a3e, 1);
    tsGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    tsGfx.lineStyle(1, 0x333355, 0.3);
    tsGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Wall tile (index 1) — lighter, solid
    tsGfx.fillStyle(0x667788, 1);
    tsGfx.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    tsGfx.lineStyle(1, 0x889aab, 0.6);
    tsGfx.strokeRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    // Darker inner border for depth
    tsGfx.lineStyle(1, 0x556677, 0.4);
    tsGfx.strokeRect(TILE_SIZE + 2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
    tsGfx.generateTexture("tileset", TILE_SIZE * 2, TILE_SIZE);
    tsGfx.destroy();

    // --- Dummy sprite: 32x32 red circle ---
    const dummyGfx = this.add.graphics();
    dummyGfx.fillStyle(0xcc3333, 1);
    dummyGfx.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE / 2 - 2);
    // X marks the spot
    dummyGfx.lineStyle(2, 0xff6666, 1);
    dummyGfx.lineBetween(8, 8, 24, 24);
    dummyGfx.lineBetween(24, 8, 8, 24);
    dummyGfx.generateTexture("dummy", TILE_SIZE, TILE_SIZE);
    dummyGfx.destroy();

    // --- Muzzle flash: 12x12 white circle ---
    const flashGfx = this.add.graphics();
    flashGfx.fillStyle(0xffffff, 1);
    flashGfx.fillCircle(6, 6, 6);
    flashGfx.generateTexture("muzzle_flash", 12, 12);
    flashGfx.destroy();

    console.log("BootScene: placeholder assets generated");
    this.scene.start("GameScene");
  }
}
