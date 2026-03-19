/**
 * SpriteManifest — Types and data mapping entity IDs → atlas frame names.
 *
 * This is the single source of truth for how generated sprite assets map to
 * game entities. When AI-generated art is placed in assets/generated/ and
 * packed into atlases, the frame names here tell the engine which frames to use.
 *
 * Frame naming convention:
 *   characters: "char_{index}_{state}_{dir}_{frame}"
 *   pickups:    "pickup_{weaponId}" or "pickup_{consumableId}"
 *   projectiles: "proj_{weaponId}"
 *   vehicles:   "vehicle_{vehicleId}_{dir}"
 *   environment: "env_{name}"
 */

// ─── Direction ──────────────────────────────────────────────────────

export type Direction4 = "down" | "up" | "left" | "right";

export const ALL_DIRECTIONS: Direction4[] = ["down", "up", "left", "right"];

// ─── Animation definitions ─────────────────────────────────────────

export interface DirectionalAnim {
  /** Frame name arrays per direction (each entry is a frame key in the atlas) */
  down: string[];
  up: string[];
  left: string[];
  right: string[];
  frameRate: number;
  repeat: boolean;
}

/** All animation states a character can be in */
export type CharacterAnimState = "idle" | "walk" | "attack_melee" | "attack_ranged" | "death" | "dash";

/** Frame counts per animation state */
export const ANIM_FRAME_COUNTS: Record<CharacterAnimState, number> = {
  idle: 2,
  walk: 4,
  attack_melee: 3,
  attack_ranged: 2,
  death: 3,
  dash: 2,
};

export const ANIM_FRAME_RATES: Record<CharacterAnimState, number> = {
  idle: 2,
  walk: 8,
  attack_melee: 12,
  attack_ranged: 12,
  death: 6,
  dash: 10,
};

export const ANIM_REPEATS: Record<CharacterAnimState, boolean> = {
  idle: true,
  walk: true,
  attack_melee: false,
  attack_ranged: false,
  death: false,
  dash: false,
};

// ─── Character sprite definitions ──────────────────────────────────

export interface CharacterSpriteDef {
  /** Index matching CHARACTER_DEFS in BootScene (0-8) */
  id: number;
  /** Display name */
  name: string;
  /** Atlas key where frames live */
  atlas: string;
  /** Animation definitions per state */
  anims: Record<CharacterAnimState, DirectionalAnim>;
  /** Frame name for 48×48 menu preview */
  preview: string;
}

/** Character names matching CHARACTER_DEFS order */
const CHARACTER_NAMES = [
  "Blue", "Hitman", "Soldier", "Survivor", "Brown",
  "Veteran", "Green", "Robot", "Zombie",
];

/**
 * Build frame name for a character animation frame.
 * Convention: char_{charIndex}_{state}_{direction}_{frameNum}
 */
export function charFrameName(charIndex: number, state: CharacterAnimState, dir: Direction4, frame: number): string {
  return `char_${charIndex}_${state}_${dir}_${frame}`;
}

/** Build the directional animation definition for a character + state */
function buildDirectionalAnim(charIndex: number, state: CharacterAnimState): DirectionalAnim {
  const count = ANIM_FRAME_COUNTS[state];
  const result: DirectionalAnim = {
    down: [],
    up: [],
    left: [],
    right: [],
    frameRate: ANIM_FRAME_RATES[state],
    repeat: ANIM_REPEATS[state],
  };
  for (const dir of ALL_DIRECTIONS) {
    for (let f = 0; f < count; f++) {
      result[dir].push(charFrameName(charIndex, state, dir, f));
    }
  }
  return result;
}

/** Build full character sprite definition for a given index */
export function buildCharacterDef(charIndex: number): CharacterSpriteDef {
  const anims = {} as Record<CharacterAnimState, DirectionalAnim>;
  const states: CharacterAnimState[] = ["idle", "walk", "attack_melee", "attack_ranged", "death", "dash"];
  for (const state of states) {
    anims[state] = buildDirectionalAnim(charIndex, state);
  }
  return {
    id: charIndex,
    name: CHARACTER_NAMES[charIndex] ?? `Char ${charIndex}`,
    atlas: "atlas_characters",
    anims,
    preview: `char_preview_${charIndex}`,
  };
}

// ─── All character definitions ─────────────────────────────────────

export const CHARACTER_SPRITE_DEFS: CharacterSpriteDef[] =
  Array.from({ length: 9 }, (_, i) => buildCharacterDef(i));

// ─── Item sprite definitions ───────────────────────────────────────

export interface ItemSpriteDef {
  /** Entity ID (WeaponId string or ConsumableId string) */
  id: string;
  /** Atlas key */
  atlas: string;
  /** Frame name for pickup sprite */
  pickupFrame: string;
  /** Frame name for projectile sprite (ranged weapons only) */
  projectileFrame?: string;
}

/**
 * Build pickup frame name.
 * Convention: pickup_{id}
 */
export function pickupFrameName(id: string): string {
  return `pickup_${id}`;
}

/**
 * Build projectile frame name.
 * Convention: proj_{id}
 */
export function projectileFrameName(id: string): string {
  return `proj_${id}`;
}

// ─── Vehicle sprite definitions ────────────────────────────────────

export interface VehicleSpriteDef {
  id: string;
  atlas: string;
  /** Frame names per direction */
  frames: Record<Direction4, string>;
}

export function vehicleFrameName(vehicleId: string, dir: Direction4): string {
  return `vehicle_${vehicleId}_${dir}`;
}

// ─── Environment sprite definitions ────────────────────────────────

export interface EnvironmentSpriteDef {
  id: string;
  atlas: string;
  frame: string;
}

export function envFrameName(name: string): string {
  return `env_${name}`;
}

// ─── Atlas keys ────────────────────────────────────────────────────

/** Atlas texture keys used for loading */
export const ATLAS_KEYS = {
  characters: "atlas_characters",
  items: "atlas_items",
  vehicles: "atlas_vehicles",
  environment: "atlas_environment",
} as const;

/** Paths to atlas files (relative to public root) */
export const ATLAS_PATHS = {
  characters: {
    image: "assets/generated/atlases/characters.png",
    json: "assets/generated/atlases/characters.json",
  },
  items: {
    image: "assets/generated/atlases/items.png",
    json: "assets/generated/atlases/items.json",
  },
  vehicles: {
    image: "assets/generated/atlases/vehicles.png",
    json: "assets/generated/atlases/vehicles.json",
  },
  environment: {
    image: "assets/generated/atlases/environment.png",
    json: "assets/generated/atlases/environment.json",
  },
} as const;
