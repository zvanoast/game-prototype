// --- Input ---

/** Bitfield flags for player action buttons */
export const enum Button {
  ATTACK   = 1 << 0,  // 1
  DASH     = 1 << 1,  // 2
  INTERACT = 1 << 2,  // 4
  RELOAD   = 1 << 3,  // 8
  MELEE    = 1 << 4,  // 16
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

// --- Weapon Config ---

export interface WeaponConfig {
  name: string;
  damage: number;
  fireRateMs: number;
  projectileSpeed: number;
  projectileRange: number;
  projectileRadius: number;
  projectileColor: number;
  meleeDamage: number;
  meleeArcDegrees: number;
  meleeRange: number;
  meleeActiveFrames: number;
  meleeCooldownMs: number;
}
