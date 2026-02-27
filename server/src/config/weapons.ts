import type { WeaponConfig } from "shared";
import {
  PROJECTILE_SPEED,
  PROJECTILE_MAX_RANGE,
  PROJECTILE_RADIUS,
  MELEE_ARC_DEGREES,
  MELEE_RANGE,
  MELEE_ACTIVE_FRAMES,
} from "shared";

export const WEAPON_PISTOL: WeaponConfig = {
  name: "Pistol",
  damage: 15,
  fireRateMs: 200,
  projectileSpeed: PROJECTILE_SPEED,
  projectileRange: PROJECTILE_MAX_RANGE,
  projectileRadius: PROJECTILE_RADIUS,
  projectileColor: 0xffff00,
  meleeDamage: 25,
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeRange: MELEE_RANGE,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: 400,
};

export const DEFAULT_WEAPON = WEAPON_PISTOL;
