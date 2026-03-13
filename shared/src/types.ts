// --- Input ---

/** Bitfield flags for player action buttons */
export const enum Button {
  ATTACK         = 1 << 0,  // 1
  DASH           = 1 << 1,  // 2
  INTERACT       = 1 << 2,  // 4
  RELOAD         = 1 << 3,  // 8
  MELEE          = 1 << 4,  // 16
  USE_CONSUMABLE = 1 << 5,  // 32
}

/** Payload sent from client to server every frame */
export interface InputPayload {
  /** Monotonically increasing sequence number for reconciliation */
  seq: number;
  /** Server tick this input targets */
  tick: number;
  /** Horizontal movement axis: -1 (left) to 1 (right) */
  dx: number;
  /** Vertical movement axis: -1 (up) to 1 (down) */
  dy: number;
  /** Aim angle in radians */
  aimAngle: number;
  /** Bitfield of pressed buttons (see Button enum) */
  buttons: number;
  /** Frame delta time in seconds (for server to match client's actual timestep) */
  dt?: number;
}

// --- Enums ---

export enum Direction {
  Neutral    = 0,
  Up         = 1,
  UpRight    = 2,
  Right      = 3,
  DownRight  = 4,
  Down       = 5,
  DownLeft   = 6,
  Left       = 7,
  UpLeft     = 8,
}

export enum PlayerState {
  Idle            = "idle",
  Moving          = "moving",
  Attacking       = "attacking",
  Melee           = "melee",
  Dashing         = "dashing",
  ComboExecuting  = "combo_executing",
  Stunned         = "stunned",
  Dead            = "dead",
}

export enum ActionType {
  Attack    = "attack",
  Dash      = "dash",
  Interact  = "interact",
  Reload    = "reload",
  Combo     = "combo",
}

export enum WeaponType {
  Pistol  = "pistol",
  Shotgun = "shotgun",
  SMG     = "smg",
  Rifle   = "rifle",
  Melee   = "melee",
}

// --- Weapon Slot & ID ---

export type WeaponSlot = "melee" | "ranged";

export enum WeaponId {
  // Melee
  Fists            = "fists",
  Oboe             = "oboe",
  SignedBaseballBat = "signed_baseball_bat",
  CeremonialSword  = "ceremonial_sword",
  Skis             = "skis",
  Kayak            = "kayak",
  RustyPowerDrill  = "rusty_power_drill",
  IndianRug        = "indian_rug",
  // Ranged / Throwable
  Records          = "records",
  BoxOfAntiques    = "box_of_antiques",
  KnifeSet         = "knife_set",
  RareCoins        = "rare_coins",
  PaintCans        = "paint_cans",
  Microwave        = "microwave",
  BBGun            = "bb_gun",
}

// --- Consumable ---

export enum ConsumableId {
  HealthPack   = "health_pack",
  SpeedBoost   = "speed_boost",
  Shield       = "shield",
  DamageBoost  = "damage_boost",
}

export interface ConsumableConfig {
  id: ConsumableId;
  name: string;
  description: string;
  color: number;
  healAmount?: number;
  durationMs?: number;
  speedMultiplier?: number;
  damageMultiplier?: number;
  shieldHp?: number;
}

// --- Match ---

export type MatchPhase = "waiting" | "countdown" | "playing" | "ended" | "sandbox";

// --- Weapon Config ---

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  /** Tint color for the pickup sprite */
  color: number;
  // Ranged stats (only for ranged weapons)
  damage?: number;
  fireRateMs?: number;
  projectileSpeed?: number;
  projectileRange?: number;
  projectileRadius?: number;
  projectileColor?: number;
  // Melee stats (only for melee weapons)
  meleeDamage?: number;
  meleeArcDegrees?: number;
  meleeRange?: number;
  meleeActiveFrames?: number;
  meleeCooldownMs?: number;
  /** If true, melee attacks continuously while the button is held */
  meleeHoldToAttack?: boolean;
  // Ammo (ranged/throwable weapons only)
  maxAmmo?: number;
  // Knockback tuning (optional per-weapon override)
  knockback?: number;
  meleeKnockback?: number;
}
