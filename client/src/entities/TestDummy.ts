import Phaser from "phaser";
import { MAX_HEALTH, DUMMY_RESPAWN_TIME_MS } from "shared";

const HEALTH_BAR_WIDTH = 30;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -22;

export class TestDummy extends Phaser.Physics.Arcade.Sprite {
  private hp: number;
  private maxHp: number;
  private healthBar: Phaser.GameObjects.Graphics;
  private alive = true;
  private spawnX: number;
  private spawnY: number;
  private flashTimer = 0;

  // Knockback
  private knockbackVx = 0;
  private knockbackVy = 0;
  private knockbackFramesLeft = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "dummy");
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // static body

    this.spawnX = x;
    this.spawnY = y;
    this.maxHp = MAX_HEALTH;
    this.hp = this.maxHp;

    this.setDepth(5);

    // Health bar
    this.healthBar = scene.add.graphics();
    this.healthBar.setDepth(6);
    this.drawHealthBar();
  }

  takeDamage(amount: number, knockbackAngle?: number, knockbackDist?: number): number {
    if (!this.alive) return 0;

    const actual = Math.min(this.hp, amount);
    this.hp -= actual;

    // Flash white
    this.setTint(0xffffff);
    this.flashTimer = 100;

    // Emit damage number event
    this.scene.events.emit("damage:number", this.x, this.y - 16, actual);

    // Apply knockback
    if (knockbackAngle !== undefined && knockbackDist !== undefined && knockbackDist > 0) {
      this.applyKnockback(knockbackAngle, knockbackDist);
    }

    this.drawHealthBar();

    if (this.hp <= 0) {
      this.die();
    }

    return actual;
  }

  private applyKnockback(angle: number, distance: number) {
    const frames = 10;
    const perFrame = distance / frames;
    this.knockbackVx = Math.cos(angle) * perFrame;
    this.knockbackVy = Math.sin(angle) * perFrame;
    this.knockbackFramesLeft = frames;
  }

  private die() {
    this.alive = false;

    // Emit death event for particles
    this.scene.events.emit("dummy:death", this.x, this.y);
    this.scene.events.emit("sfx:death");

    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.healthBar.setVisible(false);

    this.scene.time.delayedCall(DUMMY_RESPAWN_TIME_MS, () => {
      this.respawn();
    });
  }

  private respawn() {
    this.hp = this.maxHp;
    this.alive = true;
    this.setPosition(this.spawnX, this.spawnY);
    this.setVisible(true);
    (this.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    this.healthBar.setVisible(true);
    this.clearTint();
    this.knockbackFramesLeft = 0;
    this.drawHealthBar();
  }

  private drawHealthBar() {
    this.healthBar.clear();
    if (!this.alive) return;

    const barX = this.x - HEALTH_BAR_WIDTH / 2;
    const barY = this.y + HEALTH_BAR_OFFSET_Y;
    const ratio = this.hp / this.maxHp;

    this.healthBar.fillStyle(0x333333, 0.8);
    this.healthBar.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

    let color = 0x00ff00;
    if (ratio < 0.3) color = 0xff0000;
    else if (ratio < 0.6) color = 0xffff00;

    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(barX, barY, HEALTH_BAR_WIDTH * ratio, HEALTH_BAR_HEIGHT);
  }

  isAlive(): boolean {
    return this.alive;
  }

  update(_time: number, delta: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.clearTint();
      }
    }

    // Apply knockback movement (manual position update for static bodies)
    if (this.knockbackFramesLeft > 0) {
      this.x += this.knockbackVx;
      this.y += this.knockbackVy;
      this.knockbackFramesLeft--;

      // Decay
      this.knockbackVx *= 0.85;
      this.knockbackVy *= 0.85;

      // Update static body position
      (this.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    }

    this.drawHealthBar();
  }

  destroy(fromScene?: boolean) {
    this.healthBar.destroy();
    super.destroy(fromScene);
  }
}

/** Spawn positions for the 5 test dummies (world coordinates) */
export const DUMMY_SPAWN_POSITIONS = [
  { x: 400, y: 400 },
  { x: 1600, y: 400 },
  { x: 1024, y: 1024 },
  { x: 400, y: 1600 },
  { x: 1600, y: 1600 },
];
