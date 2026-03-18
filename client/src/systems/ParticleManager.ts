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
    emitter.setDepth(2100);
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
    emitter.setDepth(2100);
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
    emitter.setDepth(2100);
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
    emitter.setDepth(2100);
    emitter.explode(20);
    this.scene.time.delayedCall(600, () => emitter.destroy());
  }

  /** Per-weapon trail tuning */
  private static readonly TRAIL_CONFIGS: Record<string, {
    scaleStart: number; frequency: number; lifespan: number; speed?: { min: number; max: number };
  }> = {
    darts:           { scaleStart: 0.2,  frequency: 40, lifespan: 150 },
    plates:          { scaleStart: 0.5,  frequency: 20, lifespan: 200, speed: { min: 10, max: 30 } },
    staple_gun:      { scaleStart: 0.15, frequency: 50, lifespan: 120 },
    vase:            { scaleStart: 0.6,  frequency: 15, lifespan: 300 },
    rubber_band_gun: { scaleStart: 0.2,  frequency: 60, lifespan: 150 },
  };

  /** Projectile trail: continuous emitter following a sprite. Returns cleanup function. */
  projectileTrail(sprite: Phaser.GameObjects.Sprite, color: number, weaponId?: string): () => void {
    const cfg = weaponId ? ParticleManager.TRAIL_CONFIGS[weaponId] : undefined;
    const scaleStart = cfg?.scaleStart ?? 0.4;
    const frequency = cfg?.frequency ?? 30;
    const lifespan = cfg?.lifespan ?? 200;
    const speed = cfg?.speed ?? { min: 5, max: 20 };

    const emitter = this.scene.add.particles(0, 0, "particle", {
      speed,
      scale: { start: scaleStart, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan,
      frequency,
      tint: color,
      follow: sprite,
      emitting: true,
    });
    emitter.setDepth(2100);

    return () => {
      emitter.stop();
      // Let remaining particles fade out, then destroy
      this.scene.time.delayedCall(lifespan + 100, () => emitter.destroy());
    };
  }

}
