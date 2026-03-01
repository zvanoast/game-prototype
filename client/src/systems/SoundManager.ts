import Phaser from "phaser";

/**
 * Placeholder sound manager. Logs all sound events to console.
 * Wire actual audio files in Phase 6.
 */
export class SoundManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Listen for combat events
    scene.events.on("sfx:shoot", this.playShoot, this);
    scene.events.on("sfx:melee_hit", this.playMeleeHit, this);
    scene.events.on("sfx:melee_swing", this.playMeleeSwing, this);
    scene.events.on("sfx:charged_shot", this.playChargedShot, this);
    scene.events.on("sfx:dash", this.playDash, this);
    scene.events.on("sfx:dash_strike", this.playDashStrike, this);
    scene.events.on("sfx:impact", this.playImpact, this);
    scene.events.on("sfx:death", this.playDeath, this);
    scene.events.on("sfx:damage", this.playDamage, this);

    scene.events.once("shutdown", () => {
      scene.events.off("sfx:shoot", this.playShoot, this);
      scene.events.off("sfx:melee_hit", this.playMeleeHit, this);
      scene.events.off("sfx:melee_swing", this.playMeleeSwing, this);
      scene.events.off("sfx:charged_shot", this.playChargedShot, this);
      scene.events.off("sfx:dash", this.playDash, this);
      scene.events.off("sfx:dash_strike", this.playDashStrike, this);
      scene.events.off("sfx:impact", this.playImpact, this);
      scene.events.off("sfx:death", this.playDeath, this);
      scene.events.off("sfx:damage", this.playDamage, this);
    });
  }

  private playShoot() {
    console.log("SFX: shoot");
  }

  private playMeleeHit() {
    console.log("SFX: melee_hit");
  }

  private playMeleeSwing() {
    console.log("SFX: melee_swing");
  }

  private playChargedShot() {
    console.log("SFX: charged_shot");
  }

  private playDash() {
    console.log("SFX: dash");
  }

  private playDashStrike() {
    console.log("SFX: dash_strike");
  }

  private playImpact() {
    console.log("SFX: impact");
  }

  private playDeath() {
    console.log("SFX: death");
  }

  private playDamage() {
    console.log("SFX: damage");
  }
}
