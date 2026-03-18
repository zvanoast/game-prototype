import type { BotPersona } from "./BotPersona";
import type { BotPerceptionData } from "./BotPerception";
import { hasLineOfSight, findPath, dist } from "./BotNavigation";
import {
  LOCKER_INTERACT_RANGE,
  MAX_HEALTH,
  MAP_WIDTH_PX,
  MAP_HEIGHT_PX,
} from "shared";
import { Button } from "shared";
import { getWeaponConfig } from "shared";
import type { PlayerSchema } from "../../state/GameState";

export interface BotContext {
  botId: string;
  self: PlayerSchema;
  persona: BotPersona;
  perception: BotPerceptionData;
  tick: number;
  /** Cached path waypoints */
  cachedPath: { x: number; y: number }[];
  /** Current waypoint index */
  waypointIdx: number;
  /** Tick when path was last computed */
  lastPathTick: number;
  /** Current wander target */
  wanderTarget: { x: number; y: number } | null;
  /** Tick when wander target was set */
  lastWanderTick: number;
  /** Ticks bot has been ~stationary */
  stuckTicks: number;
  /** Last recorded position for stuck detection */
  lastPos: { x: number; y: number };
  /** Persistent strafe direction: 1 or -1 */
  strafeDir: number;
}

export interface BotOutput {
  dx: number;
  dy: number;
  aimAngle: number;
  buttons: number;
}

export interface BotAction {
  name: string;
  score(ctx: BotContext): number;
  execute(ctx: BotContext): BotOutput;
}

// --- Helpers ---

function moveToward(
  self: PlayerSchema,
  targetX: number,
  targetY: number,
): { dx: number; dy: number } {
  const dx = targetX - self.x;
  const dy = targetY - self.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 4) return { dx: 0, dy: 0 };
  return { dx: dx / d, dy: dy / d };
}

function moveAway(
  self: PlayerSchema,
  threatX: number,
  threatY: number,
): { dx: number; dy: number } {
  const dx = self.x - threatX;
  const dy = self.y - threatY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1) return { dx: 1, dy: 0 };
  return { dx: dx / d, dy: dy / d };
}

function aimAt(
  self: PlayerSchema,
  targetX: number,
  targetY: number,
  targetVx: number,
  targetVy: number,
  projectileSpeed: number,
  accuracy: number,
): number {
  const dx = targetX - self.x;
  const dy = targetY - self.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  let aimX = targetX;
  let aimY = targetY;

  if (projectileSpeed > 0 && d > 0) {
    const travelTime = d / projectileSpeed;
    aimX += targetVx * travelTime * 0.8;
    aimY += targetVy * travelTime * 0.8;
  }

  let angle = Math.atan2(aimY - self.y, aimX - self.x);

  // Apply jitter based on accuracy (±0.5 radians at accuracy=0)
  const maxJitter = 0.5 * (1 - accuracy);
  angle += (Math.random() * 2 - 1) * maxJitter;

  return angle;
}

function followPath(ctx: BotContext): { dx: number; dy: number } {
  if (ctx.cachedPath.length === 0) return { dx: 0, dy: 0 };

  // Advance waypoint if close enough
  while (ctx.waypointIdx < ctx.cachedPath.length) {
    const wp = ctx.cachedPath[ctx.waypointIdx];
    const d = dist(ctx.self.x, ctx.self.y, wp.x, wp.y);
    if (d < 24 && ctx.waypointIdx < ctx.cachedPath.length - 1) {
      ctx.waypointIdx++;
    } else {
      break;
    }
  }

  const wp = ctx.cachedPath[Math.min(ctx.waypointIdx, ctx.cachedPath.length - 1)];
  return moveToward(ctx.self, wp.x, wp.y);
}

/** Get effective melee range for the bot's current melee weapon */
function getMeleeRange(self: PlayerSchema): number {
  const cfg = getWeaponConfig(self.meleeWeaponId);
  return cfg?.meleeRange ?? 32;
}

// --- Actions ---

export const ActionAttackEnemy: BotAction = {
  name: "AttackEnemy",

  score(ctx: BotContext): number {
    const { persona, perception } = ctx;
    if (!perception.nearestEnemy) return 0;

    const enemy = perception.nearestEnemy;
    if (enemy.distance > persona.engageMaxDistance) return 0;

    const distScore = Math.max(0, 1 - enemy.distance / persona.engageMaxDistance);

    // Weapon bonus: much higher when armed
    const weaponBonus = perception.hasRanged ? 0.3 : (perception.hasMeleeUpgrade ? 0.15 : 0);

    return persona.aggression * (distScore + 0.2) + weaponBonus;
  },

  execute(ctx: BotContext): BotOutput {
    const { self, persona, perception } = ctx;
    const enemy = perception.nearestEnemy!;
    const target = enemy.player;
    const d = enemy.distance;

    // Decide melee vs ranged based on weapon availability and preference
    const useMelee = !perception.hasRanged || (persona.meleePreference > 0.5 && d < 120);

    let buttons = 0;
    let dx = 0, dy = 0;

    // Get projectile speed for aim leading
    let projSpeed = 550;
    if (!useMelee && self.rangedWeaponId) {
      const cfg = getWeaponConfig(self.rangedWeaponId);
      if (cfg?.projectileSpeed) projSpeed = cfg.projectileSpeed;
    }

    const aimAngle = aimAt(
      self, target.x, target.y, target.vx, target.vy,
      useMelee ? 0 : projSpeed, persona.aimAccuracy,
    );

    const canSee = hasLineOfSight(self.x, self.y, target.x, target.y);

    if (useMelee) {
      const meleeRange = getMeleeRange(self);

      // Always keep closing toward the target — mix in strafe as we get closer
      const toward = canSee ? moveToward(self, target.x, target.y) : followPath(ctx);
      if (d > meleeRange * 1.5) {
        // Far away — full speed chase
        dx = toward.dx;
        dy = toward.dy;
      } else {
        // Close — mostly forward with some strafe to be harder to hit
        const perpAngle = aimAngle + (Math.PI / 2) * ctx.strafeDir;
        const strafeFactor = Math.min(0.4, persona.strafeFrequency * 0.5);
        dx = toward.dx * (1 - strafeFactor) + Math.cos(perpAngle) * strafeFactor;
        dy = toward.dy * (1 - strafeFactor) + Math.sin(perpAngle) * strafeFactor;
      }

      // Melee attack when in range and can see
      if (d < meleeRange * 1.3 && canSee) {
        buttons |= Button.MELEE;
      }
    } else {
      // Ranged: maintain preferred distance with forward/back bias in strafe
      const toward = canSee ? moveToward(self, target.x, target.y) : followPath(ctx);
      const perpAngle = aimAngle + (Math.PI / 2) * ctx.strafeDir;

      if (d < persona.preferredRange * 0.6) {
        // Too close — mostly back away, slight strafe
        const away = moveAway(self, target.x, target.y);
        dx = away.dx * 0.8 + Math.cos(perpAngle) * 0.2;
        dy = away.dy * 0.8 + Math.sin(perpAngle) * 0.2;
      } else if (d > persona.preferredRange * 1.3) {
        // Too far — chase with slight strafe
        dx = toward.dx * 0.85 + Math.cos(perpAngle) * 0.15;
        dy = toward.dy * 0.85 + Math.sin(perpAngle) * 0.15;
      } else {
        // In range band — strafe but drift inward slightly to stay aggressive
        const inwardBias = d > persona.preferredRange ? 0.3 : -0.15;
        dx = toward.dx * inwardBias + Math.cos(perpAngle) * 0.6;
        dy = toward.dy * inwardBias + Math.sin(perpAngle) * 0.6;
      }

      // Shoot when we can see the target
      if (canSee) {
        buttons |= Button.ATTACK;
      }
    }

    return { dx, dy, aimAngle, buttons };
  },
};

export const ActionFleeFromEnemy: BotAction = {
  name: "FleeFromEnemy",

  score(ctx: BotContext): number {
    const { persona, perception } = ctx;
    if (!perception.nearestEnemy) return 0;

    const hpFactor = 1 - perception.healthPct;
    const belowThreshold = perception.healthPct < persona.healthFleeThreshold ? 0.5 : 0;
    const proximityFactor = perception.nearestEnemy.distance < 200 ? 0.2 : 0;

    return persona.selfPreservation * (hpFactor + belowThreshold + proximityFactor);
  },

  execute(ctx: BotContext): BotOutput {
    const { self, perception } = ctx;
    const enemy = perception.nearestEnemy!;
    const move = moveAway(self, enemy.player.x, enemy.player.y);

    // Clamp to map bounds
    const margin = 64;
    if (self.x < margin) move.dx = Math.max(0, move.dx);
    if (self.x > MAP_WIDTH_PX - margin) move.dx = Math.min(0, move.dx);
    if (self.y < margin) move.dy = Math.max(0, move.dy);
    if (self.y > MAP_HEIGHT_PX - margin) move.dy = Math.min(0, move.dy);

    return {
      dx: move.dx,
      dy: move.dy,
      aimAngle: Math.atan2(enemy.player.y - self.y, enemy.player.x - self.x),
      buttons: 0,
    };
  },
};

export const ActionOpenLocker: BotAction = {
  name: "OpenLocker",

  score(ctx: BotContext): number {
    const { persona, perception } = ctx;
    if (perception.closedLockers.length === 0) return 0;

    // Huge priority when unarmed
    const needWeapon = (!perception.hasRanged && !perception.hasMeleeUpgrade) ? 0.6 : 0;
    const needRanged = (!perception.hasRanged) ? 0.3 : 0;
    const nearest = perception.closedLockers[0];
    const distFactor = Math.max(0, 1 - nearest.distance / 600);

    return persona.lootPriority * (0.3 + needWeapon + needRanged) * distFactor + needWeapon * 0.3;
  },

  execute(ctx: BotContext): BotOutput {
    const { self, perception } = ctx;
    const nearest = perception.closedLockers[0];
    const locker = nearest.locker;
    const d = nearest.distance;

    let buttons = 0;
    let move: { dx: number; dy: number };

    if (d <= LOCKER_INTERACT_RANGE) {
      buttons |= Button.INTERACT;
      move = { dx: 0, dy: 0 };
    } else {
      // Use pathfinding to reach locker
      move = followPath(ctx);
      // Fallback: direct move if no path
      if (move.dx === 0 && move.dy === 0) {
        move = moveToward(self, locker.x, locker.y);
      }
    }

    return {
      dx: move.dx,
      dy: move.dy,
      aimAngle: Math.atan2(locker.y - self.y, locker.x - self.x),
      buttons,
    };
  },
};

export const ActionCollectPickup: BotAction = {
  name: "CollectPickup",

  score(ctx: BotContext): number {
    const { persona, perception } = ctx;
    if (perception.pickups.length === 0) return 0;

    const nearest = perception.pickups[0];
    const distFactor = Math.max(0, 1 - nearest.distance / 500);

    // Very high value for ranged weapons when we don't have one
    const isRangedWeapon = !!nearest.pickup.weaponId && getWeaponConfig(nearest.pickup.weaponId)?.slot === "ranged";
    const isMeleeWeapon = !!nearest.pickup.weaponId && getWeaponConfig(nearest.pickup.weaponId)?.slot === "melee";
    const isConsumable = !!nearest.pickup.consumableId;

    let upgradeBonus = 0;
    if (isRangedWeapon && !perception.hasRanged) {
      upgradeBonus = 0.7; // Ranged weapon when unarmed — very high priority
    } else if (isMeleeWeapon && !perception.hasMeleeUpgrade) {
      upgradeBonus = 0.4;
    } else if (isConsumable && !perception.hasConsumable) {
      upgradeBonus = 0.2;
    }

    // Close pickups are almost free to grab
    const proximityBonus = nearest.distance < 80 ? 0.3 : 0;

    return persona.lootPriority * (0.2 + upgradeBonus) * distFactor + proximityBonus + upgradeBonus * 0.2;
  },

  execute(ctx: BotContext): BotOutput {
    const { self, perception } = ctx;
    const nearest = perception.pickups[0];
    const pickup = nearest.pickup;

    const move = moveToward(self, pickup.x, pickup.y);

    return {
      dx: move.dx,
      dy: move.dy,
      aimAngle: Math.atan2(pickup.y - self.y, pickup.x - self.x),
      buttons: 0,
    };
  },
};

export const ActionUseConsumable: BotAction = {
  name: "UseConsumable",

  score(ctx: BotContext): number {
    const { persona, perception } = ctx;
    if (!perception.hasConsumable) return 0;

    const self = ctx.self;
    const hasHealthPack = self.consumableSlot1 === "health_pack" || self.consumableSlot2 === "health_pack";
    const hasBuff = self.consumableSlot1 === "speed_boost" || self.consumableSlot2 === "speed_boost" ||
                    self.consumableSlot1 === "damage_boost" || self.consumableSlot2 === "damage_boost" ||
                    self.consumableSlot1 === "shield" || self.consumableSlot2 === "shield";

    // Use health pack when hurt
    if (hasHealthPack && perception.healthPct < 0.6) {
      return persona.selfPreservation * (1 - perception.healthPct) + 0.2;
    }

    // Use buffs when in combat
    if (hasBuff && perception.nearestEnemy && perception.nearestEnemy.distance < 400) {
      return persona.aggression * 0.5;
    }

    return 0;
  },

  execute(ctx: BotContext): BotOutput {
    return {
      dx: 0,
      dy: 0,
      aimAngle: ctx.self.angle,
      buttons: Button.USE_CONSUMABLE,
    };
  },
};

export const ActionWander: BotAction = {
  name: "Wander",

  score(_ctx: BotContext): number {
    return 0.15;
  },

  execute(ctx: BotContext): BotOutput {
    const { self } = ctx;
    const BOT_WANDER_INTERVAL_TICKS = 60;

    if (!ctx.wanderTarget || ctx.tick - ctx.lastWanderTick > BOT_WANDER_INTERVAL_TICKS) {
      const margin = 128;
      ctx.wanderTarget = {
        x: margin + Math.random() * (MAP_WIDTH_PX - margin * 2),
        y: margin + Math.random() * (MAP_HEIGHT_PX - margin * 2),
      };
      ctx.lastWanderTick = ctx.tick;
    }

    const target = ctx.wanderTarget!;
    const d = dist(self.x, self.y, target.x, target.y);

    if (d < 32) {
      return { dx: 0, dy: 0, aimAngle: self.angle, buttons: 0 };
    }

    // Use pathfinding
    const move = followPath(ctx);
    const fallback = (move.dx === 0 && move.dy === 0)
      ? moveToward(self, target.x, target.y)
      : move;

    return {
      dx: fallback.dx,
      dy: fallback.dy,
      aimAngle: Math.atan2(target.y - self.y, target.x - self.x),
      buttons: 0,
    };
  },
};

/** All available bot actions */
export const ALL_ACTIONS: BotAction[] = [
  ActionAttackEnemy,
  ActionFleeFromEnemy,
  ActionOpenLocker,
  ActionCollectPickup,
  ActionUseConsumable,
  ActionWander,
];
