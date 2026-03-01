import Phaser from "phaser";

/**
 * Camera shake utility supporting magnitude, duration, and direction.
 */
export class ScreenShake {
  private camera: Phaser.Cameras.Scene2D.Camera;

  constructor(private scene: Phaser.Scene) {
    this.camera = scene.cameras.main;
  }

  /** Omnidirectional shake */
  shake(magnitude: number, durationMs: number) {
    // Phaser shake intensity is relative to camera size, convert pixel magnitude
    const intensity = magnitude / Math.max(this.camera.width, this.camera.height);
    this.camera.shake(durationMs, intensity);
  }

  /** Directional shake — biased toward a direction (angle in radians) */
  shakeDirectional(magnitude: number, durationMs: number, angle: number) {
    // Use camera scroll offset to simulate directional shake
    const ox = Math.cos(angle) * magnitude;
    const oy = Math.sin(angle) * magnitude;

    // Brief offset then shake back
    this.camera.setScroll(
      this.camera.scrollX + ox * 0.5,
      this.camera.scrollY + oy * 0.5
    );

    // Normal shake on top
    const intensity = magnitude / Math.max(this.camera.width, this.camera.height);
    this.camera.shake(durationMs, intensity);
  }
}
