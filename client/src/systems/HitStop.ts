import Phaser from "phaser";

/**
 * Freeze-frame system. Briefly pauses physics and flashes sprites white.
 */
export class HitStop {
  private scene: Phaser.Scene;
  private frozen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Freeze the game for a duration. Flash specified sprites white.
   * @param durationMs How long to freeze (e.g. 50ms = ~3 frames)
   * @param sprites Sprites to flash white during freeze
   */
  freeze(durationMs: number, sprites: Phaser.GameObjects.Sprite[]) {
    if (this.frozen) return;
    this.frozen = true;

    // Pause physics
    this.scene.physics.pause();

    // Flash sprites white
    for (const sprite of sprites) {
      if (sprite.active) {
        sprite.setTint(0xffffff);
      }
    }

    // Resume after duration
    this.scene.time.delayedCall(durationMs, () => {
      this.scene.physics.resume();

      // Clear tint
      for (const sprite of sprites) {
        if (sprite.active) {
          sprite.clearTint();
        }
      }

      this.frozen = false;
    });
  }

  isFrozen(): boolean {
    return this.frozen;
  }
}
