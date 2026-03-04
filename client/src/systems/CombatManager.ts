import Phaser from "phaser";
import type { WeaponConfig } from "shared";
import { getWeaponConfig, WEAPON_FISTS } from "shared";

import type { TestDummy } from "../entities/TestDummy";
import {
  CHARGED_SHOT_SPEED,
  CHARGED_SHOT_SIZE,
  CHARGED_SHOT_DAMAGE_MULT,
  DASH_STRIKE_RANGE_MULT,
  DASH_STRIKE_DAMAGE_MULT,
  KNOCKBACK_PROJECTILE,
  KNOCKBACK_MELEE,
  KNOCKBACK_CHARGED,
} from "shared";

export class CombatManager {
  private scene: Phaser.Scene;
  private initialized = false;
  private player!: Phaser.Physics.Arcade.Sprite;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private dummies: TestDummy[] = [];

  // Multiplayer mode: when true, predicted projectiles only hit walls, melee is visual-only
  private multiplayerMode = false;

  // Dynamic weapon configs
  private meleeConfig: WeaponConfig = WEAPON_FISTS;
  private rangedConfig: WeaponConfig | null = null;

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
  private meleeArcRange = WEAPON_FISTS.meleeRange!;

  // Muzzle flash
  private muzzleFlash!: Phaser.GameObjects.Sprite;
  private muzzleFlashTimer = 0;

  // Aim angle (set externally)
  private aimAngle = 0;

  // Charging visual
  private chargeGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setMultiplayerMode(enabled: boolean) {
    this.multiplayerMode = enabled;
  }

  /** Set melee weapon by ID */
  setMeleeWeapon(id: string) {
    this.meleeConfig = getWeaponConfig(id) ?? WEAPON_FISTS;
  }

  /** Set ranged weapon by ID (empty string = no ranged weapon) */
  setRangedWeapon(id: string) {
    if (!id) {
      this.rangedConfig = null;
    } else {
      this.rangedConfig = getWeaponConfig(id) ?? null;
    }
  }

  getMeleeConfig(): WeaponConfig {
    return this.meleeConfig;
  }

  getRangedConfig(): WeaponConfig | null {
    return this.rangedConfig;
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

    // Charge visual
    this.chargeGraphics = this.scene.add.graphics();
    this.chargeGraphics.setDepth(11);

    // Muzzle flash sprite
    this.muzzleFlash = this.scene.add.sprite(0, 0, "muzzle_flash");
    this.muzzleFlash.setDepth(15);
    this.muzzleFlash.setVisible(false);

    // Collisions: projectiles vs walls
    this.scene.physics.add.collider(this.projectiles, this.wallLayer, (obj1, _obj2) => {
      const proj = obj1 as Phaser.Physics.Arcade.Sprite;
      this.scene.events.emit("sfx:impact");
      this.scene.events.emit("particle:impact", proj.x, proj.y, 0xffff00);
      this.destroyProjectile(proj);
    });

    // Collisions: projectiles vs dummies (dummies only exist in sandbox/test mode)
    this.registerDummyOverlaps();

    // Set up mouse input
    this.setupMouseInput();

    this.initialized = true;
  }

  /** Register projectile-vs-dummy overlaps. Can be called after dummies are spawned late. */
  registerDummyOverlaps() {
    if (!this.projectiles) return;
    for (const dummy of this.dummies) {
      this.scene.physics.add.overlap(this.projectiles, dummy, (obj1, obj2) => {
        const proj = (obj1 !== dummy ? obj1 : obj2) as Phaser.Physics.Arcade.Sprite;
        const damage = proj.getData("damage") ?? (this.rangedConfig?.damage ?? 15);
        const isCharged = proj.getData("charged") ?? false;
        const knockback = isCharged ? KNOCKBACK_CHARGED : KNOCKBACK_PROJECTILE;
        const color = isCharged ? 0xff8800 : 0xffff00;

        const kbAngle = Math.atan2(dummy.y - this.player.y, dummy.x - this.player.x);

        this.scene.events.emit("particle:impact", proj.x, proj.y, color);
        this.scene.events.emit("sfx:impact");

        if (isCharged) {
          this.scene.events.emit("juice:charged_hit", this.player, dummy);
        }

        this.destroyProjectile(proj);
        dummy.takeDamage(damage, kbAngle, knockback);
      });
    }
  }

  private setupMouseInput() {
    this.scene.game.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
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

  /** Normal shot — returns false if no ranged weapon equipped */
  tryShoot(): boolean {
    if (!this.initialized) return false;
    if (!this.rangedConfig) return false;

    const now = this.scene.time.now;
    if (now - this.lastShootTime < (this.rangedConfig.fireRateMs ?? 200)) return false;
    this.lastShootTime = now;

    this.fireProjectile(
      this.rangedConfig.projectileSpeed ?? 600,
      this.rangedConfig.damage ?? 15,
      this.rangedConfig.projectileRadius ?? 2,
      this.rangedConfig.projectileRange ?? 800,
      false
    );

    this.scene.events.emit("sfx:shoot_weapon", this.rangedConfig?.id ?? "");
    this.scene.events.emit("juice:shoot", this.aimAngle);
    return true;
  }

  /** Charged shot */
  fireChargedShot() {
    if (!this.initialized) return;
    if (!this.rangedConfig) return;

    this.lastShootTime = this.scene.time.now;

    const baseDamage = this.rangedConfig.damage ?? 15;
    const baseRange = this.rangedConfig.projectileRange ?? 800;

    this.fireProjectile(
      CHARGED_SHOT_SPEED,
      baseDamage * CHARGED_SHOT_DAMAGE_MULT,
      CHARGED_SHOT_SIZE / 2,
      baseRange * 1.5,
      true,
      0xff8800
    );

    this.scene.events.emit("sfx:charged_shot");
    this.scene.events.emit("juice:charged_shot", this.aimAngle);
  }

  private fireProjectile(
    speed: number,
    damage: number,
    radius: number,
    range: number,
    charged: boolean,
    tint?: number
  ) {
    const vx = Math.cos(this.aimAngle) * speed;
    const vy = Math.sin(this.aimAngle) * speed;

    const spawnDist = 20;
    const sx = this.player.x + Math.cos(this.aimAngle) * spawnDist;
    const sy = this.player.y + Math.sin(this.aimAngle) * spawnDist;

    const proj = this.projectiles.get(sx, sy, "projectile") as Phaser.Physics.Arcade.Sprite | null;
    if (!proj) return;

    proj.setActive(true);
    proj.setVisible(true);
    proj.setPosition(sx, sy);
    proj.setData("damage", damage);
    proj.setData("range", range);
    proj.setData("charged", charged);
    if (tint) {
      proj.setTint(tint);
      proj.setScale(2);
    } else {
      // Tint projectile with weapon color
      const color = this.rangedConfig?.projectileColor;
      if (color !== undefined) {
        proj.setTint(color);
      } else {
        proj.clearTint();
      }
      proj.setScale(1);
    }
    proj.body!.enable = true;
    (proj.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    (proj.body as Phaser.Physics.Arcade.Body).setCircle(radius);

    this.projectileOrigins.set(proj, { x: sx, y: sy });

    // Muzzle flash
    this.muzzleFlash.setPosition(sx, sy);
    this.muzzleFlash.setVisible(true);
    this.muzzleFlashTimer = 2;

    // Muzzle particles
    this.scene.events.emit("particle:muzzle", sx, sy, this.aimAngle);
  }

  tryMelee(rangeMult = 1, damageMult = 1, knockbackMult = 1) {
    if (!this.initialized) return;
    const now = this.scene.time.now;
    if (now - this.lastMeleeTime < (this.meleeConfig.meleeCooldownMs ?? 400)) return;
    this.lastMeleeTime = now;

    const range = (this.meleeConfig.meleeRange ?? 36) * rangeMult;

    this.scene.events.emit("sfx:melee_weapon", this.meleeConfig.id);

    // Hit dummies locally (dummies only exist in sandbox/test mode)
    if (this.dummies.length > 0) {
      const arcHalf = Phaser.Math.DegToRad((this.meleeConfig.meleeArcDegrees ?? 90) / 2);
      const damage = (this.meleeConfig.meleeDamage ?? 10) * damageMult;
      const knockback = KNOCKBACK_MELEE * knockbackMult;

      let hitSomething = false;

      for (const dummy of this.dummies) {
        if (!dummy.isAlive()) continue;

        const dx = dummy.x - this.player.x;
        const dy = dummy.y - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > range) continue;

        const angleToDummy = Math.atan2(dy, dx);
        let angleDiff = angleToDummy - this.aimAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= arcHalf) {
          const kbAngle = Math.atan2(dy, dx);
          dummy.takeDamage(damage, kbAngle, knockback);
          hitSomething = true;

          this.scene.events.emit("particle:impact", dummy.x, dummy.y, 0xffffff);
        }
      }

      if (hitSomething) {
        this.scene.events.emit("sfx:melee_hit");
        this.scene.events.emit("juice:melee_hit", this.player, this.dummies);
      }
    }

    // Show melee arc visual
    this.meleeArcFrames = this.meleeConfig.meleeActiveFrames ?? 4;
    this.meleeArcTimer = this.meleeArcFrames;
    this.meleeArcRange = range;
  }

  /** Dash strike: 2x range, 2x damage melee */
  executeDashStrike() {
    this.lastMeleeTime = 0; // bypass cooldown
    this.scene.events.emit("sfx:dash_strike");
    this.tryMelee(DASH_STRIKE_RANGE_MULT, DASH_STRIKE_DAMAGE_MULT, DASH_STRIKE_DAMAGE_MULT);
  }

  private destroyProjectile(proj: Phaser.Physics.Arcade.Sprite) {
    proj.setActive(false);
    proj.setVisible(false);
    proj.clearTint();
    proj.setScale(1);
    if (proj.body) {
      proj.body.enable = false;
      if ("setVelocity" in proj.body) {
        (proj.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    }
    this.projectileOrigins.delete(proj);
  }

  updateChargeVisual(isCharging: boolean, chargeFrames: number, minFrames: number) {
    this.chargeGraphics.clear();
    if (!this.initialized || !isCharging || chargeFrames < 5) return;
    if (!this.rangedConfig) return; // Can't charge without ranged weapon

    const progress = Math.min(chargeFrames / minFrames, 1);
    const radius = 20 + progress * 10;
    const alpha = 0.2 + progress * 0.4;
    const color = progress >= 1 ? 0xff8800 : 0xffff00;

    this.chargeGraphics.lineStyle(2, color, alpha);
    this.chargeGraphics.strokeCircle(this.player.x, this.player.y, radius);

    if (progress >= 1) {
      const pulse = Math.sin(this.scene.time.now / 80) * 0.15 + 0.35;
      this.chargeGraphics.fillStyle(color, pulse);
      this.chargeGraphics.fillCircle(this.player.x, this.player.y, radius - 2);
    }
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
        const range = proj.getData("range") ?? (this.rangedConfig?.projectileRange ?? 800);
        if (dist >= range) {
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
    const arcHalf = Phaser.Math.DegToRad((this.meleeConfig.meleeArcDegrees ?? 90) / 2);
    const range = this.meleeArcRange;

    this.meleeArcGraphics.clear();
    this.meleeArcGraphics.setVisible(true);

    const arcColor = this.meleeConfig.color ?? 0xffffff;
    this.meleeArcGraphics.fillStyle(arcColor, 0.2);
    this.meleeArcGraphics.lineStyle(2, arcColor, 0.5);

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

  getActiveProjectileCount(): number {
    if (!this.initialized) return 0;
    let count = 0;
    this.projectiles.getChildren().forEach((child) => {
      if ((child as Phaser.Physics.Arcade.Sprite).active) count++;
    });
    return count;
  }

  getShootCooldownRemaining(): number {
    if (!this.rangedConfig) return 0;
    const elapsed = this.scene.time.now - this.lastShootTime;
    return Math.max(0, (this.rangedConfig.fireRateMs ?? 200) - elapsed);
  }

  getMeleeCooldownRemaining(): number {
    const elapsed = this.scene.time.now - this.lastMeleeTime;
    return Math.max(0, (this.meleeConfig.meleeCooldownMs ?? 400) - elapsed);
  }
}
