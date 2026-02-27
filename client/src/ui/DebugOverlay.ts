import Phaser from "phaser";
import type { Room } from "colyseus.js";

export class DebugOverlay {
  private scene: Phaser.Scene;
  private texts: Phaser.GameObjects.Text[] = [];
  private visible = false;
  private container: Phaser.GameObjects.Container;

  // Data to display
  private latency = 0;
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

    for (let i = 0; i < 6; i++) {
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

  update(room: Room | null, localSprite: Phaser.GameObjects.Sprite | null) {
    if (!this.visible) return;

    if (room) {
      this.serverTick = (room.state as any)?.tick ?? 0;
      this.playerCount = (room.state as any)?.players?.size ?? 0;

      // Estimate latency from Colyseus room
      // Colyseus doesn't expose ping directly; we use a simple heuristic
      // In production, implement proper ping measurement
    }

    if (localSprite) {
      this.localPos.x = localSprite.x;
      this.localPos.y = localSprite.y;
    }

    this.texts[0].setText(`[DEBUG OVERLAY]`);
    this.texts[1].setText(`Server Tick: ${this.serverTick}`);
    this.texts[2].setText(`Players: ${this.playerCount}`);
    this.texts[3].setText(`Local Pos: (${this.localPos.x.toFixed(1)}, ${this.localPos.y.toFixed(1)})`);
    this.texts[4].setText(`Server Pos: (${this.serverPos.x.toFixed(1)}, ${this.serverPos.y.toFixed(1)})`);
    this.texts[5].setText(`Prediction Δ: (${(this.localPos.x - this.serverPos.x).toFixed(1)}, ${(this.localPos.y - this.serverPos.y).toFixed(1)})`);
  }

  setServerPos(x: number, y: number) {
    this.serverPos.x = x;
    this.serverPos.y = y;
  }
}
