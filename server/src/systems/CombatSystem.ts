import { Room } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { GameStateSchema, PlayerSchema, ProjectileSchema } from "../state/GameState";
import { DEFAULT_WEAPON } from "../config/weapons";
import type { InputPayload, WallRect } from "shared";
import {
  PLAYER_RADIUS,
  MAX_HEALTH,
  SHOOT_COOLDOWN_TICKS,
  MELEE_COOLDOWN_TICKS,
  RESPAWN_TIME_MS,
  MAX_SERVER_PROJECTILES,
  PROJECTILE_SPEED,
  PROJECTILE_MAX_RANGE,
  PROJECTILE_RADIUS,
  MELEE_RANGE,
  MELEE_ARC_DEGREES,
  CHARGED_SHOT_SPEED,
  CHARGED_SHOT_DAMAGE_MULT,
  CHARGED_SHOT_SIZE,
  CHARGED_SHOT_MIN_FRAMES,
} from "shared";
import { Button } from "shared";

interface PlayerCombatState {
  lastShootTick: number;
  lastMeleeTick: number;
  lastButtons: number;
  chargeFrameCount: number;
  respawnTimer: number; // ms remaining, 0 = alive
}

interface ServerProjectile {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  ownerId: string;
  charged: boolean;
  damage: number;
  radius: number;
  originX: number;
  originY: number;
  maxRange: number;
}

export class CombatSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private wallRects: WallRect[];
  private playerCombat = new Map<string, PlayerCombatState>();
  private projectiles: ServerProjectile[] = [];
  private nextProjectileId = 1;
  private findSafeSpawn: () => { x: number; y: number };

  constructor(
    room: Room<GameStateSchema>,
    state: GameStateSchema,
    wallRects: WallRect[],
    findSafeSpawn: () => { x: number; y: number }
  ) {
    this.room = room;
    this.state = state;
    this.wallRects = wallRects;
    this.findSafeSpawn = findSafeSpawn;
  }

  registerPlayer(sessionId: string) {
    this.playerCombat.set(sessionId, {
      lastShootTick: -100,
      lastMeleeTick: -100,
      lastButtons: 0,
      chargeFrameCount: 0,
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

    const attackDown = !!(buttons & Button.ATTACK);
    const attackWasDown = !!(prevButtons & Button.ATTACK);
    const attackPressed = attackDown && !attackWasDown;
    const attackReleased = !attackDown && attackWasDown;

    const meleeDown = !!(buttons & Button.MELEE);
    const meleeWasDown = !!(prevButtons & Button.MELEE);
    const meleePressed = meleeDown && !meleeWasDown;

    // Track charge frames
    if (attackDown) {
      combat.chargeFrameCount++;
    }

    // Attack pressed → fire normal projectile
    if (attackPressed && (tick - combat.lastShootTick >= SHOOT_COOLDOWN_TICKS)) {
      this.fireProjectile(sessionId, player, false);
      combat.lastShootTick = tick;
      combat.chargeFrameCount = 0;
    }

    // Attack released after charging → fire charged projectile
    if (attackReleased && combat.chargeFrameCount >= CHARGED_SHOT_MIN_FRAMES) {
      this.fireProjectile(sessionId, player, true);
      combat.lastShootTick = tick;
    }

    if (attackReleased) {
      combat.chargeFrameCount = 0;
    }

    // Melee pressed
    if (meleePressed && (tick - combat.lastMeleeTick >= MELEE_COOLDOWN_TICKS)) {
      this.performMelee(sessionId, player, tick);
      combat.lastMeleeTick = tick;
    }

    combat.lastButtons = buttons;
  }

  private fireProjectile(sessionId: string, player: PlayerSchema, charged: boolean) {
    if (this.projectiles.length >= MAX_SERVER_PROJECTILES) return;

    const speed = charged ? CHARGED_SHOT_SPEED : PROJECTILE_SPEED;
    const damage = charged
      ? DEFAULT_WEAPON.damage * CHARGED_SHOT_DAMAGE_MULT
      : DEFAULT_WEAPON.damage;
    const radius = charged ? CHARGED_SHOT_SIZE / 2 : PROJECTILE_RADIUS;
    const maxRange = charged
      ? PROJECTILE_MAX_RANGE * 1.5
      : PROJECTILE_MAX_RANGE;

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
      charged,
      damage,
      radius,
      originX: sx,
      originY: sy,
      maxRange,
    };

    this.projectiles.push(proj);
    this.addProjectileToSchema(proj);
  }

  private performMelee(sessionId: string, attacker: PlayerSchema, tick: number) {
    const arcHalf = (MELEE_ARC_DEGREES / 2) * (Math.PI / 180);
    const range = MELEE_RANGE;
    const damage = DEFAULT_WEAPON.meleeDamage;

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
        this.room.broadcast("projectile_wall", { x: proj.x, y: proj.y, charged: proj.charged });
        toRemove.push(i);
        continue;
      }

      // Check player collision (circle-vs-circle)
      let hitPlayer = false;
      this.state.players.forEach((target: PlayerSchema, targetId: string) => {
        if (hitPlayer) return;
        if (targetId === proj.ownerId) return;
        if (target.state === "dead") return;

        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_RADIUS + proj.radius) {
          this.applyDamage(targetId, target, proj.damage, proj.ownerId, proj.charged ? "charged" : "projectile");
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

  private applyDamage(
    targetId: string,
    target: PlayerSchema,
    damage: number,
    attackerId: string,
    type: "projectile" | "charged" | "melee"
  ) {
    target.health -= damage;

    this.room.broadcast("hit", {
      targetId,
      attackerId,
      damage,
      type,
      x: target.x,
      y: target.y,
      health: Math.max(0, target.health),
    });

    if (target.health <= 0) {
      target.health = 0;
      target.state = "dead";

      // Credit the kill
      const attacker = this.state.players.get(attackerId);
      if (attacker) {
        attacker.kills++;
      }

      const combat = this.playerCombat.get(targetId);
      if (combat) {
        combat.respawnTimer = RESPAWN_TIME_MS;
      }

      this.room.broadcast("kill", {
        killerId: attackerId,
        victimId: targetId,
        x: target.x,
        y: target.y,
      });
    }
  }

  updateRespawns(dtMs: number) {
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
        combat.chargeFrameCount = 0;

        this.room.broadcast("respawn", {
          sessionId,
          x: spawn.x,
          y: spawn.y,
        });
      }
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
    schema.charged = proj.charged;
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
