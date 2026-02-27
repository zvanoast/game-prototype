import Phaser from "phaser";
import { DEFAULT_WEAPON } from "../config/weapons";
import type { TestDummy } from "../entities/TestDummy";

export class CombatManager {
  private scene: Phaser.Scene;
  private initialized = false;
  private player!: Phaser.Physics.Arcade.Sprite;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private dummies: TestDummy[] = [];

  // Projectile pool
  private projectiles!: Phaser.Physics.Arcade.Group;
  private projectileOrigins = new Map<Phaser.GameObjects.GameObject, { x: number; y: number }>();

  // Cooldowns
  private lastShootTime = 0;
  private lastMeleeTime = 0;

  // Melee arc visual
  private meleeArcGraphics!: Phaser.GameObjects.Graphics;
  private meleeArcTimer = 0;
  private meleeArcFrames = 0;

  // Muzzle flash
  private muzzleFlash!: Phaser.GameObjects.Sprite;
  private muzzleFlashTimer = 0;

  // Aim angle (set externally)
  private aimAngle = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(
    player: Phaser.Physics.Arcade.Sprite,
    wallLayer: Phaser.Tilemaps.TilemapLayer,
    dummies: TestDummy[]
  ) {
    this.player = player;
    this.wallLayer = wallLayer;
    this.dummies = dummies;

    // Projectile group with pooling
    this.projectiles = this.scene.physics.add.group({
      defaultKey: "projectile",
      maxSize: 30,
      runChildUpdate: false,
    });

    // Melee arc visual
    this.meleeArcGraphics = this.scene.add.graphics();
    this.meleeArcGraphics.setDepth(10);
    this.meleeArcGraphics.setVisible(false);

    // Muzzle flash sprite
    this.muzzleFlash = this.scene.add.sprite(0, 0, "muzzle_flash");
    this.muzzleFlash.setDepth(15);
    this.muzzleFlash.setVisible(false);

    // Collisions: projectiles vs walls
    this.scene.physics.add.collider(this.projectiles, this.wallLayer, (obj1, _obj2) => {
      // obj1 is the projectile (group member), obj2 is the tile
      this.destroyProjectile(obj1 as Phaser.Physics.Arcade.Sprite);
    });

    // Collisions: projectiles vs dummies
    for (const dummy of this.dummies) {
      this.scene.physics.add.overlap(this.projectiles, dummy, (obj1, obj2) => {
        // Phaser may swap arg order — find which one is the projectile
        const proj = (obj1 !== dummy ? obj1 : obj2) as Phaser.Physics.Arcade.Sprite;
        this.destroyProjectile(proj);
        dummy.takeDamage(DEFAULT_WEAPON.damage);
      });
    }

    // Set up mouse input
    this.setupMouseInput();

    this.initialized = true;
  }

  private setupMouseInput() {
    // Disable right-click context menu on canvas
    this.scene.game.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Left click: shoot
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.tryShoot();
      }
      if (pointer.rightButtonDown()) {
        this.tryMelee();
      }
    });
  }

  setAimAngle(angle: number) {
    this.aimAngle = angle;
  }

  getAimAngle(): number {
    return this.aimAngle;
  }

  private tryShoot() {
    if (!this.initialized) return;
    const now = this.scene.time.now;
    if (now - this.lastShootTime < DEFAULT_WEAPON.fireRateMs) return;
    this.lastShootTime = now;

    const speed = DEFAULT_WEAPON.projectileSpeed;
    const vx = Math.cos(this.aimAngle) * speed;
    const vy = Math.sin(this.aimAngle) * speed;

    // Spawn offset from player center
    const spawnDist = 20;
    const sx = this.player.x + Math.cos(this.aimAngle) * spawnDist;
    const sy = this.player.y + Math.sin(this.aimAngle) * spawnDist;

    const proj = this.projectiles.get(sx, sy, "projectile") as Phaser.Physics.Arcade.Sprite | null;
    if (!proj) return; // pool exhausted

    proj.setActive(true);
    proj.setVisible(true);
    proj.setPosition(sx, sy);
    proj.body!.enable = true;
    (proj.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    (proj.body as Phaser.Physics.Arcade.Body).setCircle(DEFAULT_WEAPON.projectileRadius);

    // Track origin for range check
    this.projectileOrigins.set(proj, { x: sx, y: sy });

    // Muzzle flash
    this.muzzleFlash.setPosition(sx, sy);
    this.muzzleFlash.setVisible(true);
    this.muzzleFlashTimer = 2; // frames
  }

  private tryMelee() {
    if (!this.initialized) return;
    const now = this.scene.time.now;
    if (now - this.lastMeleeTime < DEFAULT_WEAPON.meleeCooldownMs) return;
    this.lastMeleeTime = now;

    const arcHalf = Phaser.Math.DegToRad(DEFAULT_WEAPON.meleeArcDegrees / 2);
    const range = DEFAULT_WEAPON.meleeRange;

    // Check each dummy
    for (const dummy of this.dummies) {
      if (!dummy.isAlive()) continue;

      const dx = dummy.x - this.player.x;
      const dy = dummy.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > range) continue;

      // Angle check
      const angleToDummy = Math.atan2(dy, dx);
      let angleDiff = angleToDummy - this.aimAngle;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (Math.abs(angleDiff) <= arcHalf) {
        dummy.takeDamage(DEFAULT_WEAPON.meleeDamage);
      }
    }

    // Show melee arc visual
    this.meleeArcFrames = DEFAULT_WEAPON.meleeActiveFrames;
    this.meleeArcTimer = this.meleeArcFrames;
  }

  private destroyProjectile(proj: Phaser.Physics.Arcade.Sprite) {
    proj.setActive(false);
    proj.setVisible(false);
    if (proj.body) {
      proj.body.enable = false;
      if ("setVelocity" in proj.body) {
        (proj.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    }
    this.projectileOrigins.delete(proj);
  }

  update(_time: number, _delta: number) {
    if (!this.initialized) return;

    // Range-check active projectiles
    this.projectiles.getChildren().forEach((child) => {
      const proj = child as Phaser.Physics.Arcade.Sprite;
      if (!proj.active) return;

      const origin = this.projectileOrigins.get(proj);
      if (origin) {
        const dx = proj.x - origin.x;
        const dy = proj.y - origin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= DEFAULT_WEAPON.projectileRange) {
          this.destroyProjectile(proj);
        }
      }
    });

    // Muzzle flash countdown
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer--;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.setVisible(false);
      }
    }

    // Melee arc visual
    if (this.meleeArcTimer > 0) {
      this.drawMeleeArc();
      this.meleeArcTimer--;
      if (this.meleeArcTimer <= 0) {
        this.meleeArcGraphics.setVisible(false);
      }
    }
  }

  private drawMeleeArc() {
    const arcHalf = Phaser.Math.DegToRad(DEFAULT_WEAPON.meleeArcDegrees / 2);
    const range = DEFAULT_WEAPON.meleeRange;

    this.meleeArcGraphics.clear();
    this.meleeArcGraphics.setVisible(true);

    // Semi-transparent arc
    this.meleeArcGraphics.fillStyle(0xffffff, 0.2);
    this.meleeArcGraphics.lineStyle(2, 0xffffff, 0.5);

    this.meleeArcGraphics.beginPath();
    this.meleeArcGraphics.moveTo(this.player.x, this.player.y);
    this.meleeArcGraphics.arc(
      this.player.x,
      this.player.y,
      range,
      this.aimAngle - arcHalf,
      this.aimAngle + arcHalf,
      false
    );
    this.meleeArcGraphics.closePath();
    this.meleeArcGraphics.fillPath();
    this.meleeArcGraphics.strokePath();
  }

  /** Number of active projectiles (for debug overlay) */
  getActiveProjectileCount(): number {
    if (!this.initialized) return 0;
    let count = 0;
    this.projectiles.getChildren().forEach((child) => {
      if ((child as Phaser.Physics.Arcade.Sprite).active) count++;
    });
    return count;
  }

  getShootCooldownRemaining(): number {
    const elapsed = this.scene.time.now - this.lastShootTime;
    return Math.max(0, DEFAULT_WEAPON.fireRateMs - elapsed);
  }

  getMeleeCooldownRemaining(): number {
    const elapsed = this.scene.time.now - this.lastMeleeTime;
    return Math.max(0, DEFAULT_WEAPON.meleeCooldownMs - elapsed);
  }
}
