import { WeaponId, type WeaponConfig } from "./types.js";

// --- Melee Weapons ---

export const WEAPON_FISTS: WeaponConfig = {
  id: WeaponId.Fists,
  name: "Fists",
  slot: "melee",
  color: 0xcccccc,
  meleeDamage: 8,
  meleeRange: 36,
  meleeArcDegrees: 90,
  meleeActiveFrames: 4,
  meleeCooldownMs: 300,
};

export const WEAPON_HAMMER: WeaponConfig = {
  id: WeaponId.Hammer,
  name: "Hammer",
  slot: "melee",
  color: 0x8B4513,
  meleeDamage: 35,
  meleeRange: 44,
  meleeArcDegrees: 80,
  meleeActiveFrames: 6,
  meleeCooldownMs: 750,
};

export const WEAPON_LAMP: WeaponConfig = {
  id: WeaponId.Lamp,
  name: "Lamp",
  slot: "melee",
  color: 0xFFD700,
  meleeDamage: 20,
  meleeRange: 56,
  meleeArcDegrees: 70,
  meleeActiveFrames: 5,
  meleeCooldownMs: 450,
};

export const WEAPON_FRYING_PAN: WeaponConfig = {
  id: WeaponId.FryingPan,
  name: "Frying Pan",
  slot: "melee",
  color: 0x444444,
  meleeDamage: 28,
  meleeRange: 40,
  meleeArcDegrees: 95,
  meleeActiveFrames: 5,
  meleeCooldownMs: 500,
};

export const WEAPON_BASEBALL_BAT: WeaponConfig = {
  id: WeaponId.BaseballBat,
  name: "Baseball Bat",
  slot: "melee",
  color: 0xCD853F,
  meleeDamage: 25,
  meleeRange: 52,
  meleeArcDegrees: 85,
  meleeActiveFrames: 4,
  meleeCooldownMs: 350,
};

export const WEAPON_GOLF_CLUB: WeaponConfig = {
  id: WeaponId.GolfClub,
  name: "Golf Club",
  slot: "melee",
  color: 0xC0C0C0,
  meleeDamage: 30,
  meleeRange: 64,
  meleeArcDegrees: 50,
  meleeActiveFrames: 5,
  meleeCooldownMs: 600,
  meleeKnockback: 120,
};

// --- Ranged Weapons ---

export const WEAPON_DARTS: WeaponConfig = {
  id: WeaponId.Darts,
  name: "Darts",
  slot: "ranged",
  color: 0xFF4444,
  damage: 10,
  fireRateMs: 140,
  projectileSpeed: 700,
  projectileRange: 600,
  projectileRadius: 2,
  projectileColor: 0xFF4444,
};

export const WEAPON_PLATES: WeaponConfig = {
  id: WeaponId.Plates,
  name: "Plates",
  slot: "ranged",
  color: 0xEEEEFF,
  damage: 25,
  fireRateMs: 500,
  projectileSpeed: 400,
  projectileRange: 500,
  projectileRadius: 4,
  projectileColor: 0xEEEEFF,
};

export const WEAPON_STAPLE_GUN: WeaponConfig = {
  id: WeaponId.StapleGun,
  name: "Staple Gun",
  slot: "ranged",
  color: 0xFF8800,
  damage: 7,
  fireRateMs: 100,
  projectileSpeed: 800,
  projectileRange: 500,
  projectileRadius: 1,
  projectileColor: 0xFF8800,
};

export const WEAPON_VASE: WeaponConfig = {
  id: WeaponId.Vase,
  name: "Vase",
  slot: "ranged",
  color: 0x8844AA,
  damage: 35,
  fireRateMs: 800,
  projectileSpeed: 300,
  projectileRange: 350,
  projectileRadius: 5,
  projectileColor: 0x8844AA,
};

export const WEAPON_RUBBER_BAND_GUN: WeaponConfig = {
  id: WeaponId.RubberBandGun,
  name: "Rubber Band Gun",
  slot: "ranged",
  color: 0xFFDD44,
  damage: 4,
  fireRateMs: 80,
  projectileSpeed: 900,
  projectileRange: 700,
  projectileRadius: 1,
  projectileColor: 0xFFDD44,
};

// --- Registry ---

export const WEAPON_REGISTRY: Record<string, WeaponConfig> = {
  [WeaponId.Fists]: WEAPON_FISTS,
  [WeaponId.Hammer]: WEAPON_HAMMER,
  [WeaponId.Lamp]: WEAPON_LAMP,
  [WeaponId.FryingPan]: WEAPON_FRYING_PAN,
  [WeaponId.BaseballBat]: WEAPON_BASEBALL_BAT,
  [WeaponId.GolfClub]: WEAPON_GOLF_CLUB,
  [WeaponId.Darts]: WEAPON_DARTS,
  [WeaponId.Plates]: WEAPON_PLATES,
  [WeaponId.StapleGun]: WEAPON_STAPLE_GUN,
  [WeaponId.Vase]: WEAPON_VASE,
  [WeaponId.RubberBandGun]: WEAPON_RUBBER_BAND_GUN,
};

/** IDs of weapons that can appear in lockers (excludes Fists) */
export const LOOTABLE_WEAPON_IDS: WeaponId[] = [
  WeaponId.Hammer,
  WeaponId.Lamp,
  WeaponId.FryingPan,
  WeaponId.BaseballBat,
  WeaponId.GolfClub,
  WeaponId.Darts,
  WeaponId.Plates,
  WeaponId.StapleGun,
  WeaponId.Vase,
  WeaponId.RubberBandGun,
];

/** Get a weapon config by ID. Returns undefined if not found. */
export function getWeaponConfig(id: string): WeaponConfig | undefined {
  return WEAPON_REGISTRY[id];
}
