/**
 * Reusable system for rendering countdown circle timers at world positions.
 * Used for sandbox item respawns, but designed to be generic for any
 * timed-respawn visual (vehicles, power-ups, etc.).
 */

interface RespawnTimer {
  key: string;
  x: number;
  y: number;
  totalMs: number;
  remainingMs: number;
  radius: number;
  color: number;
}

export class RespawnOverlay {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private timers: RespawnTimer[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(15);
  }

  /** Start a countdown circle at a world position */
  addTimer(
    key: string,
    x: number,
    y: number,
    durationMs: number,
    radius: number = 18,
    color: number = 0xffaa00,
  ) {
    // Don't double-add
    const existing = this.timers.find(t => t.key === key);
    if (existing) {
      existing.remainingMs = durationMs;
      existing.totalMs = durationMs;
      return;
    }

    this.timers.push({
      key, x, y,
      totalMs: durationMs,
      remainingMs: durationMs,
      radius, color,
    });
  }

  /** Remove a timer early (e.g. item respawned before timer expired) */
  removeTimer(key: string) {
    const idx = this.timers.findIndex(t => t.key === key);
    if (idx >= 0) this.timers.splice(idx, 1);
  }

  /** Call every frame from scene update() */
  update(delta: number) {
    this.gfx.clear();

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      timer.remainingMs -= delta;

      if (timer.remainingMs <= 0) {
        this.timers.splice(i, 1);
        continue;
      }

      const pct = 1 - timer.remainingMs / timer.totalMs;

      // Background ring (dim)
      this.gfx.lineStyle(2, 0xffffff, 0.12);
      this.gfx.strokeCircle(timer.x, timer.y, timer.radius);

      // Progress arc
      this.gfx.lineStyle(2, timer.color, 0.6);
      this.gfx.beginPath();
      this.gfx.arc(
        timer.x, timer.y, timer.radius,
        -Math.PI / 2,
        -Math.PI / 2 + pct * Math.PI * 2,
        false,
      );
      this.gfx.strokePath();
    }
  }

  /** Remove all timers */
  clear() {
    this.timers.length = 0;
    this.gfx.clear();
  }

  /** Destroy the graphics object */
  destroy() {
    this.gfx.destroy();
    this.timers.length = 0;
  }
}
