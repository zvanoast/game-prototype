import { WeaponId, type WeaponConfig } from "./types.js";

// --- Melee Weapons ---

export const WEAPON_FISTS: WeaponConfig = {
  id: WeaponId.Fists,
  name: "Fists",
  slot: "melee",
  color: 0xcccccc,
  meleeDamage: 10,
  meleeRange: 36,
  meleeArcDegrees: 90,
  meleeActiveFrames: 4,
  meleeCooldownMs: 350,
};

export const WEAPON_HAMMER: WeaponConfig = {
  id: WeaponId.Hammer,
  name: "Hammer",
  slot: "melee",
  color: 0x8B4513,
  meleeDamage: 40,
  meleeRange: 44,
  meleeArcDegrees: 80,
  meleeActiveFrames: 6,
  meleeCooldownMs: 700,
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
  meleeDamage: 30,
  meleeRange: 40,
  meleeArcDegrees: 100,
  meleeActiveFrames: 5,
  meleeCooldownMs: 500,
};

// --- Ranged Weapons ---

export const WEAPON_DARTS: WeaponConfig = {
  id: WeaponId.Darts,
  name: "Darts",
  slot: "ranged",
  color: 0xFF4444,
  damage: 12,
  fireRateMs: 150,
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
  damage: 8,
  fireRateMs: 100,
  projectileSpeed: 800,
  projectileRange: 550,
  projectileRadius: 1,
  projectileColor: 0xFF8800,
};

// --- Registry ---

export const WEAPON_REGISTRY: Record<string, WeaponConfig> = {
  [WeaponId.Fists]: WEAPON_FISTS,
  [WeaponId.Hammer]: WEAPON_HAMMER,
  [WeaponId.Lamp]: WEAPON_LAMP,
  [WeaponId.FryingPan]: WEAPON_FRYING_PAN,
  [WeaponId.Darts]: WEAPON_DARTS,
  [WeaponId.Plates]: WEAPON_PLATES,
  [WeaponId.StapleGun]: WEAPON_STAPLE_GUN,
};

/** IDs of weapons that can appear in lockers (excludes Fists) */
export const LOOTABLE_WEAPON_IDS: WeaponId[] = [
  WeaponId.Hammer,
  WeaponId.Lamp,
  WeaponId.FryingPan,
  WeaponId.Darts,
  WeaponId.Plates,
  WeaponId.StapleGun,
];

/** Get a weapon config by ID. Returns undefined if not found. */
export function getWeaponConfig(id: string): WeaponConfig | undefined {
  return WEAPON_REGISTRY[id];
}
