import { TILE_SIZE } from "./constants.js";

export interface LockerSpawn {
  x: number;
  y: number;
}

/**
 * 18 locker positions in pixel coordinates, placed near obstacles.
 * Each is offset 1-2 tiles from an obstacle so players can walk to it.
 */
export const LOCKER_SPAWNS: LockerSpawn[] = [
  // Near top-left obstacles
  { x: 11 * TILE_SIZE + 16, y: 8 * TILE_SIZE - 16 },   // above horizontal wall
  { x: 5 * TILE_SIZE - 16,  y: 16 * TILE_SIZE + 16 },   // left of vertical wall
  { x: 14 * TILE_SIZE + 16, y: 5 * TILE_SIZE - 16 },    // above 2x2 block
  { x: 17 * TILE_SIZE + 16, y: 12 * TILE_SIZE - 16 },   // above horizontal wall

  // Near top-right obstacles
  { x: 40 * TILE_SIZE - 16, y: 7 * TILE_SIZE + 16 },    // left of vertical block
  { x: 52 * TILE_SIZE + 16, y: 10 * TILE_SIZE - 16 },   // above horizontal wall
  { x: 55 * TILE_SIZE + 16, y: 10 * TILE_SIZE + 16 },   // right of vertical wall
  { x: 48 * TILE_SIZE + 16, y: 15 * TILE_SIZE - 16 },   // above horizontal wall

  // Near bottom-left obstacles
  { x: 8 * TILE_SIZE + 16,  y: 45 * TILE_SIZE + 48 },   // below horizontal wall
  { x: 10 * TILE_SIZE + 48, y: 51 * TILE_SIZE + 16 },   // right of vertical wall
  { x: 16 * TILE_SIZE + 16, y: 48 * TILE_SIZE - 16 },   // above 2x2 block
  { x: 22 * TILE_SIZE + 16, y: 55 * TILE_SIZE + 48 },   // below horizontal wall

  // Near bottom-right obstacles
  { x: 48 * TILE_SIZE - 16, y: 49 * TILE_SIZE + 16 },   // left of 2x2 block
  { x: 42 * TILE_SIZE + 48, y: 54 * TILE_SIZE + 16 },   // right of vertical wall
  { x: 57 * TILE_SIZE + 16, y: 45 * TILE_SIZE + 48 },   // below horizontal wall
  { x: 53 * TILE_SIZE + 16, y: 55 * TILE_SIZE + 48 },   // below horizontal wall

  // Near center obstacles
  { x: 30 * TILE_SIZE - 16, y: 31 * TILE_SIZE + 16 },   // left of center block
  { x: 34 * TILE_SIZE + 16, y: 32 * TILE_SIZE + 16 },   // right of center block
];
