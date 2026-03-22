import { Room } from "colyseus";
import { GameStateSchema, PlayerSchema, ProjectileSchema } from "../state/GameState";
import { LootSystem } from "./LootSystem";
import { BuffSystem } from "./BuffSystem";
import type { MatchSystem } from "./MatchSystem";
import type { VehicleSystem } from "./VehicleSystem";
import type { InputPayload, WallRect } from "shared";
import {
  PLAYER_RADIUS,
  MAX_HEALTH,
  RESPAWN_TIME_MS,
  MAX_SERVER_PROJECTILES,
  DASH_STRIKE_RANGE_MULT,
  DASH_STRIKE_DAMAGE_MULT,
  TICK_RATE,
} from "shared";
import { Button } from "shared";

interface PlayerCombatState {
  lastShootTick: number;
  lastMeleeTick: number;
  lastButtons: number;
  respawnTimer: number; // ms remaining, 0 = alive
}

interface ServerProjectile {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  ownerId: string;
  damage: number;
  radius: number;
  originX: number;
  originY: number;
  maxRange: number;
  weaponId: string;
}

export class CombatSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private wallRects: WallRect[];
  private lootSystem: LootSystem;
  private buffSystem: BuffSystem | null = null;
  private matchSystem: MatchSystem | null = null;
  private vehicleSystem: VehicleSystem | null = null;
  private playerCombat = new Map<string, PlayerCombatState>();
  private projectiles: ServerProjectile[] = [];
  private nextProjectileId = 1;
  private findSafeSpawn: () => { x: number; y: number };

  constructor(
    room: Room<GameStateSchema>,
    state: GameStateSchema,
    wallRects: WallRect[],
    findSafeSpawn: () => { x: number; y: number },
    lootSystem: LootSystem
  ) {
    this.room = room;
    this.state = state;
    this.wallRects = wallRects;
    this.findSafeSpawn = findSafeSpawn;
    this.lootSystem = lootSystem;
  }

  setBuffSystem(buffSystem: BuffSystem) {
    this.buffSystem = buffSystem;
  }

  setMatchSystem(matchSystem: MatchSystem) {
    this.matchSystem = matchSystem;
  }

  setVehicleSystem(vehicleSystem: VehicleSystem) {
    this.vehicleSystem = vehicleSystem;
  }

  registerPlayer(sessionId: string) {
    this.playerCombat.set(sessionId, {
      lastShootTick: -100,
      lastMeleeTick: -100,
      lastButtons: 0,
      respawnTimer: 0,
    });
  }

  unregisterPlayer(sessionId: string) {
    this.playerCombat.delete(sessionId);
    // Remove projectiles owned by this player
    this.projectiles = this.projectiles.filter(p => p.ownerId !== sessionId);
    this.syncProjectilesToSchema();
  }

  processInput(sessionId: string, input: InputPayload, tick: number) {
    const player = this.state.players.get(sessionId);
    const combat = this.playerCombat.get(sessionId);
    if (!player || !combat || player.state === "dead") return;

    const buttons = input.buttons;
    const prevButtons = combat.lastButtons;

    // If combat is not allowed (waiting, countdown, ended), just track buttons
    if (this.matchSystem && !this.matchSystem.canAttack()) {
      combat.lastButtons = buttons;
      return;
    }

    const attackDown = !!(buttons & Button.ATTACK);
    const attackWasDown = !!(prevButtons & Button.ATTACK);
    const attackReleased = !attackDown && attackWasDown;

    const meleeDown = !!(buttons & Button.MELEE);
    const meleeWasDown = !!(prevButtons & Button.MELEE);
    const meleePressed = meleeDown && !meleeWasDown;

    // Get per-player weapon configs
    const rangedConfig = this.lootSystem.getPlayerRangedConfig(sessionId);
    const meleeConfig = this.lootSystem.getPlayerMeleeConfig(sessionId);

    // Shoot cooldown in ticks (derived from weapon's fireRateMs)
    const shootCooldownTicks = rangedConfig
      ? Math.max(1, Math.round((rangedConfig.fireRateMs ?? 200) / (1000 / TICK_RATE)))
      : 999;

    // Melee cooldown in ticks
    const meleeCooldownTicks = Math.max(1, Math.round(
      (meleeConfig.meleeCooldownMs ?? 400) / (1000 / TICK_RATE)
    ));

    // Fire on release (consumes ammo)
    if (attackReleased && rangedConfig && (tick - combat.lastShootTick >= shootCooldownTicks)) {
      if (this.lootSystem.consumeRangedAmmo(sessionId)) {
        this.fireProjectile(sessionId, player, rangedConfig);
        combat.lastShootTick = tick;
      }
    }

    // Melee: press to attack, or hold for continuous-attack weapons
    const meleeTriggered = meleeConfig.meleeHoldToAttack ? meleeDown : meleePressed;
    if (meleeTriggered && (tick - combat.lastMeleeTick >= meleeCooldownTicks)) {
      const isDashing = player.state === "dashing";
      const rangeMult = isDashing ? DASH_STRIKE_RANGE_MULT : 1;
      const damageMult = isDashing ? DASH_STRIKE_DAMAGE_MULT : 1;
      this.performMelee(sessionId, player, tick, meleeConfig, rangeMult, damageMult);
      combat.lastMeleeTick = tick;
    }

    combat.lastButtons = buttons;
  }

  private fireProjectile(
    sessionId: string,
    player: PlayerSchema,
    rangedConfig: import("shared").WeaponConfig
  ) {
    if (this.projectiles.length >= MAX_SERVER_PROJECTILES) return;

    const damageMult = this.buffSystem?.getDamageMultiplier(sessionId) ?? 1.0;
    const baseDamage = rangedConfig.damage ?? 15;
    const speed = rangedConfig.projectileSpeed ?? 600;
    const radius = rangedConfig.projectileRadius ?? 2;
    const maxRange = rangedConfig.projectileRange ?? 800;
    const damage = Math.round(baseDamage * damageMult);

    const spawnDist = 20;
    const sx = player.x + Math.cos(player.angle) * spawnDist;
    const sy = player.y + Math.sin(player.angle) * spawnDist;

    const id = this.nextProjectileId++;
    if (this.nextProjectileId > 65535) this.nextProjectileId = 1;

    const proj: ServerProjectile = {
      id,
      x: sx,
      y: sy,
      angle: player.angle,
      speed,
      ownerId: sessionId,
      damage,
      radius,
      originX: sx,
      originY: sy,
      maxRange,
      weaponId: rangedConfig.id,
    };

    this.projectiles.push(proj);
    this.addProjectileToSchema(proj);
  }

  private performMelee(
    sessionId: string,
    attacker: PlayerSchema,
    _tick: number,
    meleeConfig: import("shared").WeaponConfig,
    rangeMult = 1,
    damageMult = 1
  ) {
    const buffDamageMult = this.buffSystem?.getDamageMultiplier(sessionId) ?? 1.0;
    const arcDeg = meleeConfig.meleeArcDegrees ?? 90;
    const arcHalf = (arcDeg / 2) * (Math.PI / 180);
    const range = (meleeConfig.meleeRange ?? 36) * rangeMult;
    const damage = Math.round((meleeConfig.meleeDamage ?? 10) * damageMult * buffDamageMult);

    let hitAny = false;

    this.state.players.forEach((target: PlayerSchema, targetId: string) => {
      if (targetId === sessionId) return;
      if (target.state === "dead") return;

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > range + PLAYER_RADIUS) return;

      const angleToTarget = Math.atan2(dy, dx);
      let angleDiff = angleToTarget - attacker.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (Math.abs(angleDiff) <= arcHalf) {
        this.applyDamage(targetId, target, damage, sessionId, "melee");
        hitAny = true;
      }
    });

    if (hitAny) {
      this.room.broadcast("melee_hit", {
        attackerId: sessionId,
        x: attacker.x,
        y: attacker.y,
        angle: attacker.angle,
      });
    }
  }

  tickProjectiles(dtMs: number) {
    const dt = dtMs / 1000;
    const toRemove: number[] = [];

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      // Store previous position for swept collision
      const prevX = proj.x;
      const prevY = proj.y;

      // Advance position
      proj.x += Math.cos(proj.angle) * proj.speed * dt;
      proj.y += Math.sin(proj.angle) * proj.speed * dt;

      // Check range
      const travelDx = proj.x - proj.originX;
      const travelDy = proj.y - proj.originY;
      const traveled = Math.sqrt(travelDx * travelDx + travelDy * travelDy);
      if (traveled >= proj.maxRange) {
        toRemove.push(i);
        continue;
      }

      // Check wall collision (point-in-AABB with radius)
      let hitWall = false;
      for (const wall of this.wallRects) {
        if (
          proj.x + proj.radius > wall.x &&
          proj.x - proj.radius < wall.x + wall.w &&
          proj.y + proj.radius > wall.y &&
          proj.y - proj.radius < wall.y + wall.h
        ) {
          hitWall = true;
          break;
        }
      }
      if (hitWall) {
        this.room.broadcast("projectile_wall", { x: proj.x, y: proj.y });
        toRemove.push(i);
        continue;
      }

      // Check player collision — swept (line segment vs circle) to prevent tunneling
      let hitPlayer = false;
      this.state.players.forEach((target: PlayerSchema, targetId: string) => {
        if (hitPlayer) return;
        if (targetId === proj.ownerId) return;
        if (target.state === "dead") return;

        const hitRadius = PLAYER_RADIUS + proj.radius;

        if (this.lineCircleIntersect(prevX, prevY, proj.x, proj.y, target.x, target.y, hitRadius)) {
          this.applyDamage(targetId, target, proj.damage, proj.ownerId, "projectile");
          hitPlayer = true;
        }
      });

      if (hitPlayer) {
        toRemove.push(i);
        continue;
      }
    }

    // Remove hit/expired projectiles
    if (toRemove.length > 0) {
      // Sort descending to remove from end first
      toRemove.sort((a, b) => b - a);
      for (const idx of toRemove) {
        this.projectiles.splice(idx, 1);
      }
      this.syncProjectilesToSchema();
    } else {
      // Still update positions in schema
      this.updateProjectilePositions();
    }
  }

  applyDamage(
    targetId: string,
    target: PlayerSchema,
    damage: number,
    attackerId: string,
    type: "projectile" | "melee" | "vehicle",
    vehicleName?: string
  ) {
    // Route through shield first
    let actualDamage = damage;
    let shieldAbsorbed = 0;
    if (this.buffSystem) {
      const result = this.buffSystem.applyShieldDamage(targetId, damage, target);
      actualDamage = result.remaining;
      shieldAbsorbed = result.absorbed;
    }

    target.health -= actualDamage;

    this.room.broadcast("hit", {
      targetId,
      attackerId,
      damage: actualDamage,
      shieldAbsorbed,
      type,
      x: target.x,
      y: target.y,
      health: Math.max(0, target.health),
    });

    if (target.health <= 0) {
      target.health = 0;
      target.state = "dead";

      // Force dismount if riding a vehicle
      this.vehicleSystem?.onPlayerDeath(targetId);

      // Credit the kill
      const attacker = this.state.players.get(attackerId);
      if (attacker) {
        attacker.kills++;
      }

      // Drop weapons at death location
      this.lootSystem.onPlayerRespawn(targetId, target.x, target.y);

      // Determine weapon name for kill feed
      const weaponName = type === "vehicle"
        ? (vehicleName ?? "Vehicle")
        : type === "melee"
          ? (this.lootSystem.getPlayerMeleeConfig(attackerId)?.name ?? "Fists")
          : (this.lootSystem.getPlayerRangedConfig(attackerId)?.name ?? "Ranged");

      // During match play, eliminate instead of respawning
      if (this.matchSystem && this.matchSystem.getPhase() === "playing") {
        this.matchSystem.onPlayerKilled(targetId, attackerId, weaponName);
      } else {
        // Sandbox/waiting/countdown: normal respawn
        const combat = this.playerCombat.get(targetId);
        if (combat) {
          combat.respawnTimer = RESPAWN_TIME_MS;
        }
      }

      this.room.broadcast("kill", {
        killerId: attackerId,
        victimId: targetId,
        weaponName,
        type,
        x: target.x,
        y: target.y,
      });
    }
  }

  updateRespawns(dtMs: number) {
    // During "playing" phase, dead players stay dead (eliminated)
    if (this.matchSystem && this.matchSystem.getPhase() === "playing") return;

    this.playerCombat.forEach((combat, sessionId) => {
      if (combat.respawnTimer <= 0) return;

      combat.respawnTimer -= dtMs;
      if (combat.respawnTimer <= 0) {
        combat.respawnTimer = 0;

        const player = this.state.players.get(sessionId);
        if (!player) return;

        const spawn = this.findSafeSpawn();
        player.x = spawn.x;
        player.y = spawn.y;
        player.vx = 0;
        player.vy = 0;
        player.health = MAX_HEALTH;
        player.state = "idle";

        // Reset combat state
        combat.lastButtons = 0;

        this.room.broadcast("respawn", {
          sessionId,
          x: spawn.x,
          y: spawn.y,
        });
      }
    });
  }

  /** Clear all projectiles and reset all player combat state for a new match */
  resetForNewMatch() {
    this.projectiles = [];
    this.syncProjectilesToSchema();

    this.playerCombat.forEach((combat) => {
      combat.lastShootTick = -100;
      combat.lastMeleeTick = -100;
      combat.lastButtons = 0;
      combat.respawnTimer = 0;
    });
  }

  getProjectileCount(): number {
    return this.projectiles.length;
  }

  private addProjectileToSchema(proj: ServerProjectile) {
    const schema = new ProjectileSchema();
    schema.id = proj.id;
    schema.x = proj.x;
    schema.y = proj.y;
    schema.angle = proj.angle;
    schema.speed = proj.speed;
    schema.ownerId = proj.ownerId;
    schema.weaponId = proj.weaponId;
    this.state.projectiles.push(schema);
  }

  private updateProjectilePositions() {
    // Update schema positions to match internal state
    for (let i = 0; i < this.state.projectiles.length; i++) {
      const schema = this.state.projectiles.at(i);
      if (!schema) continue;
      const proj = this.projectiles.find(p => p.id === schema.id);
      if (proj) {
        schema.x = proj.x;
        schema.y = proj.y;
      }
    }
  }

  /** Check if line segment (x1,y1)→(x2,y2) intersects circle at (cx,cy) with radius r */
  private lineCircleIntersect(
    x1: number, y1: number, x2: number, y2: number,
    cx: number, cy: number, r: number
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    // If segment has zero length, do point-in-circle check
    if (a < 0.0001) {
      return c <= 0;
    }

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    // Check if either intersection point is on the segment [0, 1]
    if (t1 >= 0 && t1 <= 1) return true;
    if (t2 >= 0 && t2 <= 1) return true;

    // Check if circle contains start or end point (segment fully inside circle)
    if (t1 < 0 && t2 > 1) return true;

    return false;
  }

  private syncProjectilesToSchema() {
    // Rebuild the schema array from internal state
    // Clear existing
    while (this.state.projectiles.length > 0) {
      this.state.projectiles.pop();
    }
    // Re-add all
    for (const proj of this.projectiles) {
      this.addProjectileToSchema(proj);
    }
  }
}
