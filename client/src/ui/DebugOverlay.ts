import Phaser from "phaser";
import type { Room } from "colyseus.js";

export interface DebugData {
  room: Room | null;
  localSprite: Phaser.GameObjects.Sprite | null;
  velocityX?: number;
  velocityY?: number;
  speed?: number;
  activeProjectiles?: number;
  shootCooldown?: number;
  meleeCooldown?: number;
  aimAngle?: number;
}

export class DebugOverlay {
  private scene: Phaser.Scene;
  private texts: Phaser.GameObjects.Text[] = [];
  private visible = false;
  private container: Phaser.GameObjects.Container;

  // Data to display
  private serverTick = 0;
  private playerCount = 0;
  private localPos = { x: 0, y: 0 };
  private serverPos = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(10, 10);
    this.container.setScrollFactor(0); // fixed to camera
    this.container.setDepth(1000);

    // Create text lines
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#00ff00",
      backgroundColor: "#000000aa",
      padding: { x: 4, y: 2 },
    };

    for (let i = 0; i < 10; i++) {
      const text = scene.add.text(0, i * 18, "", style);
      this.texts.push(text);
      this.container.add(text);
    }

    this.container.setVisible(false);

    // Toggle with backtick
    scene.input.keyboard!.on("keydown-BACKQUOTE", () => {
      this.visible = !this.visible;
      this.container.setVisible(this.visible);
    });
  }

  update(data: DebugData) {
    if (!this.visible) return;

    const { room, localSprite } = data;

    if (room) {
      this.serverTick = (room.state as any)?.tick ?? 0;
      this.playerCount = (room.state as any)?.players?.size ?? 0;
    }

    if (localSprite) {
      this.localPos.x = localSprite.x;
      this.localPos.y = localSprite.y;
    }

    const vx = data.velocityX ?? 0;
    const vy = data.velocityY ?? 0;
    const speed = data.speed ?? 0;
    const projCount = data.activeProjectiles ?? 0;
    const shootCD = data.shootCooldown ?? 0;
    const meleeCD = data.meleeCooldown ?? 0;
    const aim = data.aimAngle ?? 0;

    this.texts[0].setText(`[DEBUG OVERLAY]`);
    this.texts[1].setText(`Server Tick: ${this.serverTick}`);
    this.texts[2].setText(`Players: ${this.playerCount}`);
    this.texts[3].setText(`Local Pos: (${this.localPos.x.toFixed(1)}, ${this.localPos.y.toFixed(1)})`);
    this.texts[4].setText(`Server Pos: (${this.serverPos.x.toFixed(1)}, ${this.serverPos.y.toFixed(1)})`);
    this.texts[5].setText(`Prediction Δ: (${(this.localPos.x - this.serverPos.x).toFixed(1)}, ${(this.localPos.y - this.serverPos.y).toFixed(1)})`);
    this.texts[6].setText(`Velocity: (${vx.toFixed(0)}, ${vy.toFixed(0)})  Speed: ${speed.toFixed(0)}`);
    this.texts[7].setText(`Projectiles: ${projCount}`);
    this.texts[8].setText(`Shoot CD: ${shootCD.toFixed(0)}ms  Melee CD: ${meleeCD.toFixed(0)}ms`);
    this.texts[9].setText(`Aim: ${Phaser.Math.RadToDeg(aim).toFixed(1)}°`);
  }

  setServerPos(x: number, y: number) {
    this.serverPos.x = x;
    this.serverPos.y = y;
  }
}
