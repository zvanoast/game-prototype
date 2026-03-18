import type { BotPersona } from "./BotPersona";
import type { BotPerceptionData } from "./BotPerception";
import { hasLineOfSight, findPath, dist, pickRandomWalkablePoint } from "./BotNavigation";
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

/** Rough DPS score for a melee weapon */
function meleeDps(cfg: { meleeDamage?: number; meleeCooldownMs?: number }): number {
  return (cfg.meleeDamage ?? 8) / ((cfg.meleeCooldownMs ?? 300) / 1000);
}

/** Rough value score for a ranged weapon (damage * ammo) */
function rangedValue(cfg: { damage?: number; maxAmmo?: number }, ammo?: number): number {
  const a = ammo != null && ammo >= 0 ? ammo : (cfg.maxAmmo ?? 0);
  return (cfg.damage ?? 8) * a;
}

interface RatedPickup {
  nearby: import("./BotPerception").NearbyPickup;
  distance: number;
  value: number; // 0-1 desirability
}

/**
 * Evaluate all visible pickups and return the most desirable one.
 * Considers: current equipment, weapon quality, persona preferences, distance.
 */
function findBestPickup(ctx: BotContext): RatedPickup | null {
  const { self, persona, perception } = ctx;
  if (perception.pickups.length === 0) return null;

  let best: RatedPickup | null = null;

  for (const np of perception.pickups) {
    // Skip pickups too far away to consider
    if (np.distance > 600) continue;

    let value = 0;
    const pickup = np.pickup;

    if (pickup.consumableId) {
      // Consumables: only valuable if we have a free slot
      if (!perception.hasConsumable) {
        value = 0.25;
        // Health packs more valuable when hurt
        if (pickup.consumableId === "health_pack" && perception.healthPct < 0.6) {
          value = 0.5;
        }
      } else {
        value = 0; // both slots full — skip
      }
    } else if (pickup.weaponId) {
      const cfg = getWeaponConfig(pickup.weaponId);
      if (!cfg) continue;

      if (cfg.slot === "melee") {
        if (self.meleeWeaponId === "fists") {
          // Any melee weapon is a big upgrade from fists
          value = 0.5 + persona.meleePreference * 0.3;
        } else {
          // Compare to current melee
          const currentCfg = getWeaponConfig(self.meleeWeaponId);
          if (currentCfg) {
            const currentDps = meleeDps(currentCfg);
            const newDps = meleeDps(cfg);
            if (newDps > currentDps) {
              value = 0.3 * (newDps / currentDps - 1) + persona.meleePreference * 0.15;
            } else {
              value = 0; // downgrade — skip
            }
          } else {
            value = 0.3;
          }
        }
      } else if (cfg.slot === "ranged") {
        const rangedPref = 1 - persona.meleePreference; // higher = prefers ranged

        if (!perception.hasRanged) {
          // No ranged weapon — very high value, especially for ranged-focused bots
          value = 0.6 + rangedPref * 0.3;
        } else {
          // Compare to current ranged
          const currentCfg = getWeaponConfig(self.rangedWeaponId);
          if (currentCfg) {
            const currentVal = rangedValue(currentCfg, self.rangedAmmo);
            const newAmmo = pickup.ammo >= 0 ? pickup.ammo : (cfg.maxAmmo ?? 0);
            const newVal = rangedValue(cfg, newAmmo);
            if (newVal > currentVal) {
              value = 0.3 * Math.min(1, newVal / Math.max(1, currentVal) - 1) + rangedPref * 0.15;
            } else if (self.rangedAmmo <= 2) {
              // Almost out of ammo — any ranged weapon is tempting
              value = 0.3;
            } else {
              value = 0; // downgrade — skip
            }
          } else {
            value = 0.4;
          }
        }
      }
    }

    if (value <= 0) continue;

    // Weight by distance — closer pickups are more attractive
    const distWeight = Math.max(0.1, 1 - np.distance / 600);
    const finalScore = value * distWeight;

    if (!best || finalScore > best.value * Math.max(0.1, 1 - best.distance / 600)) {
      best = { nearby: np, distance: np.distance, value };
    }
  }

  return best;
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

    // Decide melee vs ranged based on weapon availability, preference, and distance
    // Always prefer ranged if we have it, unless we're a melee-focused bot AND already close
    let useMelee = true;
    if (perception.hasRanged) {
      const meleeRange = getMeleeRange(self);
      // Use melee only if: strong melee preference AND already in melee range
      useMelee = persona.meleePreference > 0.7 && d < meleeRange * 1.5;
    }

    let buttons = 0;
    let dx = 0, dy = 0;

    // Get ranged weapon stats for aim leading and range management
    let projSpeed = 550;
    let weaponRange = 500;
    if (!useMelee && self.rangedWeaponId) {
      const cfg = getWeaponConfig(self.rangedWeaponId);
      if (cfg?.projectileSpeed) projSpeed = cfg.projectileSpeed;
      if (cfg?.projectileRange) weaponRange = cfg.projectileRange;
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
      // Ranged: use weapon's actual range to determine ideal distance
      // Stay at ~60-80% of weapon range for a safety margin
      const idealRange = Math.min(weaponRange * 0.7, persona.preferredRange);
      const toward = canSee ? moveToward(self, target.x, target.y) : followPath(ctx);
      const perpAngle = aimAngle + (Math.PI / 2) * ctx.strafeDir;

      if (d < idealRange * 0.5) {
        // Too close — mostly back away, slight strafe
        const away = moveAway(self, target.x, target.y);
        dx = away.dx * 0.8 + Math.cos(perpAngle) * 0.2;
        dy = away.dy * 0.8 + Math.sin(perpAngle) * 0.2;
      } else if (d > weaponRange * 0.85) {
        // Beyond effective range — close in aggressively
        dx = toward.dx * 0.85 + Math.cos(perpAngle) * 0.15;
        dy = toward.dy * 0.85 + Math.sin(perpAngle) * 0.15;
      } else {
        // In effective range — strafe with slight inward drift
        const inwardBias = d > idealRange ? 0.25 : -0.1;
        dx = toward.dx * inwardBias + Math.cos(perpAngle) * 0.6;
        dy = toward.dy * inwardBias + Math.sin(perpAngle) * 0.6;
      }

      // Shoot when we can see the target and within weapon range
      if (canSee && d < weaponRange * 0.95) {
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
      // Press interact and step back slightly so we don't get stuck at the locker
      buttons |= Button.INTERACT;
      move = moveAway(self, locker.x, locker.y);
      // Gentle step back — don't flee at full speed
      move.dx *= 0.5;
      move.dy *= 0.5;
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

    // Find the best pickup to pursue (not just nearest)
    const best = findBestPickup(ctx);
    if (!best) return 0;

    const distFactor = Math.max(0, 1 - best.distance / 500);

    // Close pickups are almost free to grab
    const proximityBonus = best.distance < 80 ? 0.3 : 0;

    return persona.lootPriority * (0.2 + best.value) * distFactor + proximityBonus + best.value * 0.2;
  },

  execute(ctx: BotContext): BotOutput {
    const { self } = ctx;
    const best = findBestPickup(ctx);
    if (!best) return { dx: 0, dy: 0, aimAngle: self.angle, buttons: 0 };

    const pickup = best.nearby.pickup;
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
    // Q always uses slot1 first, so evaluate slot1
    if (!perception.slot1) return 0;

    return scoreConsumableUse(perception.slot1, persona, perception);
  },

  execute(ctx: BotContext): BotOutput {
    // Keep moving during consumable use (don't stand still)
    const { self, perception } = ctx;
    let dx = 0, dy = 0;
    let aimAngle = self.angle;

    // If in combat, keep facing the enemy
    if (perception.nearestEnemy) {
      const enemy = perception.nearestEnemy.player;
      aimAngle = Math.atan2(enemy.y - self.y, enemy.x - self.x);

      // Strafe while using consumable
      const perpAngle = aimAngle + (Math.PI / 2) * ctx.strafeDir;
      dx = Math.cos(perpAngle) * 0.5;
      dy = Math.sin(perpAngle) * 0.5;
    }

    return { dx, dy, aimAngle, buttons: Button.USE_CONSUMABLE };
  },
};

/**
 * Score how urgently the bot wants to use a specific consumable.
 * Since Q always uses slot1, this evaluates whether NOW is the right time
 * to consume what's in slot1. Each persona views items differently.
 */
function scoreConsumableUse(
  consumableId: string,
  persona: BotPersona,
  perception: BotPerceptionData,
): number {
  switch (consumableId) {
    case "health_pack": {
      // Health pack: use when hurt. Cautious bots use earlier, aggressive bots wait longer.
      const healThreshold = 0.35 + persona.selfPreservation * 0.35; // 0.35-0.70
      if (perception.healthPct >= healThreshold) return 0;
      // Score scales with how hurt we are
      const urgency = (healThreshold - perception.healthPct) / healThreshold;
      return 0.3 + urgency * 0.7; // 0.3-1.0 range
    }

    case "shield": {
      // Shield: use if we have no/low shield. Always use if no shield at all.
      // Don't waste if we already have significant shield HP.
      if (perception.shieldHp >= 25) return 0; // already well-shielded
      if (perception.shieldHp === 0) {
        // No shield — high priority, especially for defensive bots
        if (perception.inCombat) {
          return 0.6 + persona.selfPreservation * 0.3;
        }
        // Use proactively if enemy is nearby (within 500px)
        if (perception.nearestEnemy && perception.nearestEnemy.distance < 500) {
          return 0.4 + persona.selfPreservation * 0.2;
        }
        // Defensive bots pop shield preemptively
        if (persona.selfPreservation > 0.7) return 0.3;
        return 0;
      }
      // Low shield — only refresh in combat
      if (perception.inCombat && perception.shieldHp < 15) {
        return 0.4;
      }
      return 0;
    }

    case "speed_boost": {
      // Speed boost: use in combat for chasing or fleeing. Don't stack.
      if (perception.hasSpeedBuff) return 0; // already active
      if (perception.inCombat) {
        // Aggressive bots use for chasing, defensive for fleeing
        const combatValue = Math.max(persona.aggression, persona.selfPreservation);
        return 0.3 + combatValue * 0.3;
      }
      // Use to close distance on a far enemy
      if (perception.nearestEnemy && perception.nearestEnemy.distance > 400) {
        return persona.aggression * 0.3;
      }
      return 0;
    }

    case "damage_boost": {
      // Damage boost: only use when actively fighting. Aggressive bots love it.
      if (perception.hasDamageBuff) return 0; // already active
      if (perception.inCombat) {
        return 0.3 + persona.aggression * 0.5;
      }
      // Aggressive bots pop it when enemy is approaching
      if (perception.nearestEnemy && perception.nearestEnemy.distance < 400) {
        return persona.aggression * 0.35;
      }
      return 0;
    }

    default:
      return 0;
  }
}

export const ActionWander: BotAction = {
  name: "Wander",

  score(_ctx: BotContext): number {
    return 0.15;
  },

  execute(ctx: BotContext): BotOutput {
    const { self } = ctx;
    const BOT_WANDER_INTERVAL_TICKS = 60;

    // Pick a new wander target periodically, or when we've arrived
    const needNewTarget = !ctx.wanderTarget
      || ctx.tick - ctx.lastWanderTick > BOT_WANDER_INTERVAL_TICKS
      || dist(self.x, self.y, ctx.wanderTarget.x, ctx.wanderTarget.y) < 32;

    if (needNewTarget) {
      ctx.wanderTarget = pickRandomWalkablePoint();
      ctx.lastWanderTick = ctx.tick;
      // Clear cached path so pathfinding recalculates for the new target
      ctx.cachedPath = [];
      ctx.waypointIdx = 0;
    }

    const target = ctx.wanderTarget!;

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
