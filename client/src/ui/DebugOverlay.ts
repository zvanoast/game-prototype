import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type { InputFrame } from "../systems/InputBuffer";

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
  comboState?: string;
  lastCombo?: string | null;
  chargeFrames?: number;
  inputBufferHistory?: InputFrame[];
  pendingInputCount?: number;
  artificialLatency?: number;
}

export class DebugOverlay {
  private scene: Phaser.Scene;
  private texts: Phaser.GameObjects.Text[] = [];
  private visible = false;
  private container: Phaser.GameObjects.Container;

  // Input buffer visual
  private bufferGraphics: Phaser.GameObjects.Graphics;

  // Data to display
  private serverTick = 0;
  private playerCount = 0;
  private localPos = { x: 0, y: 0 };
  private serverPos = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(10, 10);
    this.container.setScrollFactor(0);
    this.container.setDepth(1000);

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#00ff00",
      backgroundColor: "#000000aa",
      padding: { x: 4, y: 2 },
    };

    for (let i = 0; i < 16; i++) {
      const text = scene.add.text(0, i * 18, "", style);
      this.texts.push(text);
      this.container.add(text);
    }

    // Input buffer visualization (below text)
    this.bufferGraphics = scene.add.graphics();
    this.bufferGraphics.setScrollFactor(0);
    this.bufferGraphics.setDepth(1000);
    this.container.add(this.bufferGraphics);

    this.container.setVisible(false);

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
    const comboState = data.comboState ?? "?";
    const lastCombo = data.lastCombo ?? "none";
    const chargeFrames = data.chargeFrames ?? 0;
    const pendingInputs = data.pendingInputCount ?? 0;
    const artLatency = data.artificialLatency ?? 0;

    // Position delta (distance between server-confirmed and local predicted)
    const posDeltaX = this.localPos.x - this.serverPos.x;
    const posDeltaY = this.localPos.y - this.serverPos.y;
    const posDelta = Math.sqrt(posDeltaX * posDeltaX + posDeltaY * posDeltaY);

    this.texts[0].setText(`[DEBUG OVERLAY]`);
    this.texts[1].setText(`Server Tick: ${this.serverTick}`);
    this.texts[2].setText(`Players: ${this.playerCount}`);
    this.texts[3].setText(`Local Pos: (${this.localPos.x.toFixed(1)}, ${this.localPos.y.toFixed(1)})`);
    this.texts[4].setText(`Server Pos: (${this.serverPos.x.toFixed(1)}, ${this.serverPos.y.toFixed(1)})`);
    this.texts[5].setText(`Prediction Δ: (${posDeltaX.toFixed(1)}, ${posDeltaY.toFixed(1)}) dist: ${posDelta.toFixed(1)}`);
    this.texts[6].setText(`Pending Inputs: ${pendingInputs}  Art. Latency: ${artLatency}ms [keys 1-5]`);
    this.texts[7].setText(`Velocity: (${vx.toFixed(0)}, ${vy.toFixed(0)})  Speed: ${speed.toFixed(0)}`);
    this.texts[8].setText(`Projectiles: ${projCount}`);
    this.texts[9].setText(`Shoot CD: ${shootCD.toFixed(0)}ms  Melee CD: ${meleeCD.toFixed(0)}ms`);
    this.texts[10].setText(`Aim: ${Phaser.Math.RadToDeg(aim).toFixed(1)}°`);
    this.texts[11].setText(`State: ${comboState}`);
    this.texts[12].setText(`Last Combo: ${lastCombo}  Charge: ${chargeFrames}`);
    this.texts[13].setText(`Input Buffer (30 frames):`);

    // Draw input buffer timeline
    this.drawInputBuffer(data.inputBufferHistory ?? []);
  }

  private drawInputBuffer(history: InputFrame[]) {
    const g = this.bufferGraphics;
    g.clear();

    const startY = 14 * 18 + 4;
    const cellW = 8;
    const cellH = 20;
    const maxFrames = 30;

    // Background
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, startY, cellW * maxFrames, cellH);

    // Draw each frame (history is newest-first, we draw left=oldest right=newest)
    for (let i = 0; i < Math.min(history.length, maxFrames); i++) {
      const frame = history[history.length - 1 - i]; // oldest first for drawing
      if (!frame) continue;

      const x = i * cellW;

      // Movement indicator (direction)
      if (frame.dx !== 0 || frame.dy !== 0) {
        g.fillStyle(0x00ff88, 0.8);
        g.fillRect(x + 1, startY + 1, cellW - 2, cellH / 2 - 1);
      }

      // Button indicator (attack)
      if (frame.buttons & 1) { // Button.ATTACK
        g.fillStyle(0xff4444, 0.8);
        g.fillRect(x + 1, startY + cellH / 2, cellW - 2, cellH / 2 - 1);
      }

      // Frame separator
      g.lineStyle(1, 0x333333, 0.3);
      g.lineBetween(x, startY, x, startY + cellH);
    }

    // Border
    g.lineStyle(1, 0x555555, 0.8);
    g.strokeRect(0, startY, cellW * maxFrames, cellH);
  }

  setServerPos(x: number, y: number) {
    this.serverPos.x = x;
    this.serverPos.y = y;
  }
}
