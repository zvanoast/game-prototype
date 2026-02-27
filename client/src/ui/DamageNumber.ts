import Phaser from "phaser";

const FLOAT_SPEED = 40;    // pixels per second upward
const FADE_DURATION = 800; // ms
const RANDOM_OFFSET_X = 20;

export class DamageNumberManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Listen for damage events
    scene.events.on("damage:number", this.spawn, this);
    scene.events.once("shutdown", () => {
      scene.events.off("damage:number", this.spawn, this);
    });
  }

  private spawn(x: number, y: number, amount: number) {
    const offsetX = (Math.random() - 0.5) * RANDOM_OFFSET_X;
    const text = this.scene.add.text(x + offsetX, y, `-${amount}`, {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ff4444",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(800);

    this.scene.tweens.add({
      targets: text,
      y: y - FLOAT_SPEED * (FADE_DURATION / 1000),
      alpha: 0,
      duration: FADE_DURATION,
      ease: "Linear",
      onComplete: () => {
        text.destroy();
      },
    });
  }
}
