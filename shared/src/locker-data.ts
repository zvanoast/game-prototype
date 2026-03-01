import { TILE_SIZE } from "./constants.js";

export interface LockerSlot {
  x: number;
  y: number;
}

/** @deprecated Use LOCKER_SLOTS and pickActiveLockers() instead */
export type LockerSpawn = LockerSlot;

/**
 * ~30 potential locker positions placed adjacent to storage units.
 * Each match randomly activates 15–20 of them.
 *
 * Positions are in pixel coordinates, placed at the edge of storage unit blocks
 * so players can walk up and interact.
 */
export const LOCKER_SLOTS: LockerSlot[] = [
  // === Left Column 1 (units at tile x=4..7) ===
  // Unit at y=6..11: lockers on right side (x=8) and left side (x=3)
  { x: 8 * TILE_SIZE + 16, y: 8 * TILE_SIZE },      // right of unit, mid-height
  { x: 3 * TILE_SIZE + 16, y: 9 * TILE_SIZE },       // left of unit

  // Unit at y=16..21
  { x: 8 * TILE_SIZE + 16, y: 18 * TILE_SIZE },
  { x: 3 * TILE_SIZE + 16, y: 19 * TILE_SIZE },

  // Unit at y=26..31
  { x: 8 * TILE_SIZE + 16, y: 28 * TILE_SIZE },
  { x: 3 * TILE_SIZE + 16, y: 29 * TILE_SIZE },

  // Unit at y=36..41
  { x: 8 * TILE_SIZE + 16, y: 38 * TILE_SIZE },
  { x: 3 * TILE_SIZE + 16, y: 39 * TILE_SIZE },

  // Unit at y=46..51
  { x: 8 * TILE_SIZE + 16, y: 48 * TILE_SIZE },
  { x: 3 * TILE_SIZE + 16, y: 49 * TILE_SIZE },

  // === Left Column 2 (units at tile x=12..15) ===
  // Unit at y=6..11
  { x: 16 * TILE_SIZE + 16, y: 8 * TILE_SIZE },      // right of unit
  { x: 11 * TILE_SIZE + 16, y: 9 * TILE_SIZE },       // left of unit

  // Unit at y=16..21
  { x: 16 * TILE_SIZE + 16, y: 18 * TILE_SIZE },
  { x: 11 * TILE_SIZE + 16, y: 19 * TILE_SIZE },

  // Unit at y=26..31
  { x: 16 * TILE_SIZE + 16, y: 28 * TILE_SIZE },

  // Unit at y=36..41
  { x: 16 * TILE_SIZE + 16, y: 38 * TILE_SIZE },

  // Unit at y=46..51
  { x: 11 * TILE_SIZE + 16, y: 48 * TILE_SIZE },

  // === Right Column 1 (mirrored from left col 1, units at tile x=56..59) ===
  // Unit at y=6..11
  { x: 55 * TILE_SIZE + 16, y: 8 * TILE_SIZE },
  { x: 60 * TILE_SIZE + 16, y: 9 * TILE_SIZE },

  // Unit at y=16..21
  { x: 55 * TILE_SIZE + 16, y: 18 * TILE_SIZE },
  { x: 60 * TILE_SIZE + 16, y: 19 * TILE_SIZE },

  // Unit at y=26..31
  { x: 55 * TILE_SIZE + 16, y: 28 * TILE_SIZE },
  { x: 60 * TILE_SIZE + 16, y: 29 * TILE_SIZE },

  // Unit at y=36..41
  { x: 55 * TILE_SIZE + 16, y: 38 * TILE_SIZE },

  // Unit at y=46..51
  { x: 55 * TILE_SIZE + 16, y: 48 * TILE_SIZE },
  { x: 60 * TILE_SIZE + 16, y: 49 * TILE_SIZE },

  // === Right Column 2 (mirrored from left col 2, units at tile x=48..51) ===
  // Unit at y=6..11
  { x: 47 * TILE_SIZE + 16, y: 8 * TILE_SIZE },

  // Unit at y=16..21
  { x: 47 * TILE_SIZE + 16, y: 18 * TILE_SIZE },
  { x: 52 * TILE_SIZE + 16, y: 19 * TILE_SIZE },

  // Unit at y=36..41
  { x: 52 * TILE_SIZE + 16, y: 38 * TILE_SIZE },

  // Unit at y=46..51
  { x: 47 * TILE_SIZE + 16, y: 48 * TILE_SIZE },
];

/** @deprecated Alias for backward compat — use LOCKER_SLOTS */
export const LOCKER_SPAWNS = LOCKER_SLOTS;

/**
 * Randomly select a subset of locker slots for a match.
 * Uses Fisher-Yates shuffle then slices.
 */
export function pickActiveLockers(
  slots: LockerSlot[],
  min: number,
  max: number
): LockerSlot[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...slots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
