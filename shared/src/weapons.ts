import { WeaponId, type WeaponConfig } from "./types.js";

// ─── Tier-to-value mappings (1-3 scale) ─────────────────────────────
// These define what a tier of 1, 2, or 3 means in actual game values.

/** Melee damage per hit:        tier 1 = light, tier 3 = heavy */
export const DAMAGE_TIERS:   Record<number, number> = { 1: 12, 2: 22, 3: 32 };
/** Melee reach in pixels:       tier 1 = close, tier 3 = long */
export const RANGE_TIERS:    Record<number, number> = { 1: 36, 2: 50, 3: 64 };
/** Attack cooldown in ms:       tier 1 = slow,  tier 3 = fast */
export const SPEED_TIERS:    Record<number, number> = { 1: 700, 2: 450, 3: 250 };

// Fixed melee constants (same for all weapons)
const MELEE_ARC_DEGREES = 80;
const MELEE_ACTIVE_FRAMES = 5;

// ─── Helper functions ────────────────────────────────────────────────

export function getMeleeDamage(tier: number): number   { return DAMAGE_TIERS[tier] ?? 12; }
export function getMeleeRange(tier: number): number    { return RANGE_TIERS[tier] ?? 36; }
export function getMeleeCooldown(tier: number): number  { return SPEED_TIERS[tier] ?? 450; }

// ─── Default weapon (Fists) ─────────────────────────────────────────

export const WEAPON_FISTS: WeaponConfig = {
  id: WeaponId.Fists,
  name: "Fists",
  slot: "melee",
  color: 0xcccccc,
  meleeDamage: 8,
  meleeRange: 32,
  meleeArcDegrees: 90,
  meleeActiveFrames: 4,
  meleeCooldownMs: 300,
};

// ─── Lootable weapons (1-3 tier scale) ──────────────────────────────

export const WEAPON_OBOE: WeaponConfig = {
  id: WeaponId.Oboe,
  name: "Oboe",
  slot: "melee",
  color: 0x2B1B0E,
  // DMG 2 | Range 3 | Speed 1
  meleeDamage: getMeleeDamage(2),
  meleeRange: getMeleeRange(3),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(1),
};

export const WEAPON_SIGNED_BASEBALL_BAT: WeaponConfig = {
  id: WeaponId.SignedBaseballBat,
  name: "Signed Baseball Bat",
  slot: "melee",
  color: 0xCD853F,
  // DMG 2 | Range 2 | Speed 2
  meleeDamage: getMeleeDamage(2),
  meleeRange: getMeleeRange(2),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(2),
};

export const WEAPON_CEREMONIAL_SWORD: WeaponConfig = {
  id: WeaponId.CeremonialSword,
  name: "Ceremonial Sword",
  slot: "melee",
  color: 0xC0C0C0,
  // DMG 3 | Range 2 | Speed 2
  meleeDamage: getMeleeDamage(3),
  meleeRange: getMeleeRange(2),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(2),
};

export const WEAPON_SKIS: WeaponConfig = {
  id: WeaponId.Skis,
  name: "Skis",
  slot: "melee",
  color: 0x4488FF,
  // DMG 1 | Range 2 | Speed 2
  meleeDamage: getMeleeDamage(1),
  meleeRange: getMeleeRange(2),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(2),
};

export const WEAPON_KAYAK: WeaponConfig = {
  id: WeaponId.Kayak,
  name: "Kayak",
  slot: "melee",
  color: 0xFF6600,
  // DMG 3 | Range 3 | Speed 1
  meleeDamage: getMeleeDamage(3),
  meleeRange: getMeleeRange(3),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(1),
};

export const WEAPON_RUSTY_POWER_DRILL: WeaponConfig = {
  id: WeaponId.RustyPowerDrill,
  name: "Rusty Power Drill",
  slot: "melee",
  color: 0x884422,
  // DMG 3 | Range 1 | Speed 3 — continuous hold weapon
  // Overrides: fast tick rate (100ms = 2 server ticks), lower per-hit damage to keep DPS ~130
  meleeDamage: 13,
  meleeRange: getMeleeRange(1),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: 2,
  meleeCooldownMs: 100,
  meleeHoldToAttack: true,
};

export const WEAPON_INDIAN_RUG: WeaponConfig = {
  id: WeaponId.IndianRug,
  name: "Indian Rug",
  slot: "melee",
  color: 0xCC3366,
  // DMG 1 | Range 3 | Speed 1
  meleeDamage: getMeleeDamage(1),
  meleeRange: getMeleeRange(3),
  meleeArcDegrees: MELEE_ARC_DEGREES,
  meleeActiveFrames: MELEE_ACTIVE_FRAMES,
  meleeCooldownMs: getMeleeCooldown(1),
};

// ─── Ranged / Throwable tier mappings ─────────────────────────────────
/** Ranged damage per hit:          tier 1 = light, tier 3 = heavy */
export const RANGED_DAMAGE_TIERS: Record<number, number> = { 1: 8, 2: 16, 3: 28 };
/** Projectile max travel distance:  tier 1 = short, tier 3 = long */
export const RANGED_RANGE_TIERS:  Record<number, number> = { 1: 350, 2: 500, 3: 700 };
/** Projectile speed in px/s:       tier 2 = medium, tier 3 = fast */
export const RANGED_SPEED_TIERS:  Record<number, number> = { 1: 400, 2: 550, 3: 700 };

export function getRangedDamage(tier: number): number { return RANGED_DAMAGE_TIERS[tier] ?? 8; }
export function getRangedRange(tier: number): number  { return RANGED_RANGE_TIERS[tier] ?? 500; }
export function getRangedSpeed(tier: number): number  { return RANGED_SPEED_TIERS[tier] ?? 550; }

// Fixed ranged constant
const RANGED_PROJECTILE_RADIUS = 3;

// ─── Ranged / Throwable weapons ──────────────────────────────────────

export const WEAPON_RECORDS: WeaponConfig = {
  id: WeaponId.Records,
  name: "Records",
  slot: "ranged",
  color: 0x222222,
  // DMG 1 | Range 2 | Amount 20
  damage: getRangedDamage(1),
  fireRateMs: 180,
  projectileSpeed: getRangedSpeed(2),
  projectileRange: getRangedRange(2),
  projectileRadius: RANGED_PROJECTILE_RADIUS,
  projectileColor: 0x111111,
  maxAmmo: 20,
};

export const WEAPON_BOX_OF_ANTIQUES: WeaponConfig = {
  id: WeaponId.BoxOfAntiques,
  name: "Box of Antiques",
  slot: "ranged",
  color: 0xAA7733,
  // DMG 2 | Range 2 | Amount 10
  damage: getRangedDamage(2),
  fireRateMs: 350,
  projectileSpeed: getRangedSpeed(2),
  projectileRange: getRangedRange(2),
  projectileRadius: RANGED_PROJECTILE_RADIUS,
  projectileColor: 0xCC9944,
  maxAmmo: 10,
};

export const WEAPON_KNIFE_SET: WeaponConfig = {
  id: WeaponId.KnifeSet,
  name: "Knife Set",
  slot: "ranged",
  color: 0xCCCCCC,
  // DMG 3 | Range 2 | Amount 5
  damage: getRangedDamage(3),
  fireRateMs: 500,
  projectileSpeed: getRangedSpeed(2),
  projectileRange: getRangedRange(2),
  projectileRadius: RANGED_PROJECTILE_RADIUS,
  projectileColor: 0xDDDDDD,
  maxAmmo: 5,
};

export const WEAPON_RARE_COINS: WeaponConfig = {
  id: WeaponId.RareCoins,
  name: "Rare Coins",
  slot: "ranged",
  color: 0xFFD700,
  // DMG 1 | Range 3 | Amount 25
  damage: getRangedDamage(1),
  fireRateMs: 150,
  projectileSpeed: getRangedSpeed(3),
  projectileRange: getRangedRange(3),
  projectileRadius: 2,
  projectileColor: 0xFFD700,
  maxAmmo: 25,
};

export const WEAPON_PAINT_CANS: WeaponConfig = {
  id: WeaponId.PaintCans,
  name: "Paint Cans",
  slot: "ranged",
  color: 0xFF4466,
  // DMG 2 | Range 2 | Amount 5
  damage: getRangedDamage(2),
  fireRateMs: 500,
  projectileSpeed: getRangedSpeed(2),
  projectileRange: getRangedRange(2),
  projectileRadius: 4,
  projectileColor: 0xFF4466,
  maxAmmo: 5,
};

export const WEAPON_MICROWAVE: WeaponConfig = {
  id: WeaponId.Microwave,
  name: "Microwave",
  slot: "ranged",
  color: 0x666666,
  // DMG 3 | Range 2 | Amount 1
  damage: getRangedDamage(3),
  fireRateMs: 800,
  projectileSpeed: getRangedSpeed(1),
  projectileRange: getRangedRange(2),
  projectileRadius: 6,
  projectileColor: 0x888888,
  maxAmmo: 1,
};

export const WEAPON_BB_GUN: WeaponConfig = {
  id: WeaponId.BBGun,
  name: "BB Gun",
  slot: "ranged",
  color: 0xCC6622,
  // DMG 1 | Range 3 | Amount 15
  damage: getRangedDamage(1),
  fireRateMs: 200,
  projectileSpeed: getRangedSpeed(3),
  projectileRange: getRangedRange(3),
  projectileRadius: 2,
  projectileColor: 0xFFAA33,
  maxAmmo: 15,
};

// ─── Registry ────────────────────────────────────────────────────────

export const WEAPON_REGISTRY: Record<string, WeaponConfig> = {
  [WeaponId.Fists]: WEAPON_FISTS,
  // Melee
  [WeaponId.Oboe]: WEAPON_OBOE,
  [WeaponId.SignedBaseballBat]: WEAPON_SIGNED_BASEBALL_BAT,
  [WeaponId.CeremonialSword]: WEAPON_CEREMONIAL_SWORD,
  [WeaponId.Skis]: WEAPON_SKIS,
  [WeaponId.Kayak]: WEAPON_KAYAK,
  [WeaponId.RustyPowerDrill]: WEAPON_RUSTY_POWER_DRILL,
  [WeaponId.IndianRug]: WEAPON_INDIAN_RUG,
  // Ranged
  [WeaponId.Records]: WEAPON_RECORDS,
  [WeaponId.BoxOfAntiques]: WEAPON_BOX_OF_ANTIQUES,
  [WeaponId.KnifeSet]: WEAPON_KNIFE_SET,
  [WeaponId.RareCoins]: WEAPON_RARE_COINS,
  [WeaponId.PaintCans]: WEAPON_PAINT_CANS,
  [WeaponId.Microwave]: WEAPON_MICROWAVE,
  [WeaponId.BBGun]: WEAPON_BB_GUN,
};

/** IDs of weapons that can appear in lockers (excludes Fists) */
export const LOOTABLE_WEAPON_IDS: WeaponId[] = [
  // Melee
  WeaponId.Oboe,
  WeaponId.SignedBaseballBat,
  WeaponId.CeremonialSword,
  WeaponId.Skis,
  WeaponId.Kayak,
  WeaponId.RustyPowerDrill,
  WeaponId.IndianRug,
  // Ranged
  WeaponId.Records,
  WeaponId.BoxOfAntiques,
  WeaponId.KnifeSet,
  WeaponId.RareCoins,
  WeaponId.PaintCans,
  WeaponId.Microwave,
  WeaponId.BBGun,
];

/** Get a weapon config by ID. Returns undefined if not found. */
export function getWeaponConfig(id: string): WeaponConfig | undefined {
  return WEAPON_REGISTRY[id];
}
