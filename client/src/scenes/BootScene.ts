import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    // Generate player sprite: 32x32 colored square
    const playerGfx = this.add.graphics();
    playerGfx.fillStyle(0x00ff88, 1);
    playerGfx.fillRect(0, 0, 32, 32);
    // Add a small direction indicator (lighter triangle at top)
    playerGfx.fillStyle(0xaaffcc, 1);
    playerGfx.fillTriangle(16, 2, 10, 10, 22, 10);
    playerGfx.generateTexture("player", 32, 32);
    playerGfx.destroy();

    // Generate remote player sprite: same shape, different color
    const remoteGfx = this.add.graphics();
    remoteGfx.fillStyle(0xff4444, 1);
    remoteGfx.fillRect(0, 0, 32, 32);
    remoteGfx.fillStyle(0xff8888, 1);
    remoteGfx.fillTriangle(16, 2, 10, 10, 22, 10);
    remoteGfx.generateTexture("player_remote", 32, 32);
    remoteGfx.destroy();

    // Generate projectile sprite: 4x4 circle
    const projGfx = this.add.graphics();
    projGfx.fillStyle(0xffff00, 1);
    projGfx.fillCircle(4, 4, 4);
    projGfx.generateTexture("projectile", 8, 8);
    projGfx.destroy();

    console.log("BootScene: placeholder assets generated");
    this.scene.start("GameScene");
  }
}
