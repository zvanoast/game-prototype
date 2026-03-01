import Phaser from "phaser";

/**
 * Manages particle effects for combat juice.
 * Creates short-lived emitters per burst since Phaser 3.60+
 * emitter configs are set at creation time.
 */
export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Muzzle flash: burst of 5 small yellow particles in a cone */
  muzzleFlash(x: number, y: number, angle: number) {
    const spread = 30;
    const emitter = this.scene.add.particles(x, y, "particle", {
      speed: { min: 80, max: 200 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 200,
      angle: {
        min: Phaser.Math.RadToDeg(angle) - spread,
        max: Phaser.Math.RadToDeg(angle) + spread,
      },
      tint: 0xffff00,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(5);
    this.scene.time.delayedCall(300, () => emitter.destroy());
  }

  /** Impact: burst of 8 particles at hit location */
  impact(x: number, y: number, color: number = 0xffff00) {
    const emitter = this.scene.add.particles(x, y, "particle", {
      speed: { min: 40, max: 120 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      angle: { min: 0, max: 360 },
      tint: color,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(8);
    this.scene.time.delayedCall(400, () => emitter.destroy());
  }

  /** Dash trail: small burst of particles at player position */
  dashTrail(x: number, y: number) {
    const emitter = this.scene.add.particles(x, y, "particle", {
      speed: { min: 10, max: 30 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 300,
      angle: { min: 0, max: 360 },
      tint: 0x00ff88,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(2);
    this.scene.time.delayedCall(400, () => emitter.destroy());
  }

  /** Death explosion: 20 red particles */
  deathExplosion(x: number, y: number) {
    const emitter = this.scene.add.particles(x, y, "particle", {
      speed: { min: 60, max: 200 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      angle: { min: 0, max: 360 },
      tint: 0xff4444,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(20);
    this.scene.time.delayedCall(600, () => emitter.destroy());
  }

  /** Charged shot impact: larger, brighter burst */
  chargedImpact(x: number, y: number) {
    const emitter = this.scene.add.particles(x, y, "particle", {
      speed: { min: 80, max: 250 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 400,
      angle: { min: 0, max: 360 },
      tint: 0xff8800,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(12);
    this.scene.time.delayedCall(500, () => emitter.destroy());
  }
}
