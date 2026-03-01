import {
  TILE_SIZE,
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
} from "./constants.js";

/** Rectangular obstacle in tile coordinates */
export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounding box in pixel coordinates */
export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 18 interior obstacles (tile coordinates) */
export const OBSTACLES: Obstacle[] = [
  // Top-left quadrant
  { x: 8, y: 8, w: 3, h: 1 },
  { x: 5, y: 14, w: 1, h: 4 },
  { x: 12, y: 5, w: 2, h: 2 },
  { x: 15, y: 12, w: 4, h: 1 },
  // Top-right quadrant
  { x: 40, y: 6, w: 2, h: 3 },
  { x: 50, y: 10, w: 3, h: 1 },
  { x: 55, y: 5, w: 1, h: 5 },
  { x: 45, y: 15, w: 5, h: 1 },
  // Bottom-left quadrant
  { x: 6, y: 45, w: 4, h: 1 },
  { x: 10, y: 50, w: 1, h: 3 },
  { x: 15, y: 48, w: 2, h: 2 },
  { x: 20, y: 55, w: 3, h: 1 },
  // Bottom-right quadrant
  { x: 48, y: 48, w: 2, h: 2 },
  { x: 42, y: 52, w: 1, h: 4 },
  { x: 55, y: 45, w: 3, h: 1 },
  { x: 50, y: 55, w: 4, h: 1 },
  // Center area
  { x: 30, y: 30, w: 4, h: 4 },
  { x: 28, y: 25, w: 1, h: 3 },
];

/**
 * Convert tile-coordinate obstacles + perimeter walls into pixel-coordinate AABBs.
 * Run once at startup on both client and server.
 */
export function buildWallRects(): WallRect[] {
  const rects: WallRect[] = [];

  // Perimeter walls (4 edges as individual tile-sized rects)
  // Top edge
  for (let col = 0; col < MAP_WIDTH_TILES; col++) {
    rects.push({ x: col * TILE_SIZE, y: 0, w: TILE_SIZE, h: TILE_SIZE });
  }
  // Bottom edge
  for (let col = 0; col < MAP_WIDTH_TILES; col++) {
    rects.push({
      x: col * TILE_SIZE,
      y: (MAP_HEIGHT_TILES - 1) * TILE_SIZE,
      w: TILE_SIZE,
      h: TILE_SIZE,
    });
  }
  // Left edge (excluding corners already added)
  for (let row = 1; row < MAP_HEIGHT_TILES - 1; row++) {
    rects.push({ x: 0, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
  }
  // Right edge (excluding corners already added)
  for (let row = 1; row < MAP_HEIGHT_TILES - 1; row++) {
    rects.push({
      x: (MAP_WIDTH_TILES - 1) * TILE_SIZE,
      y: row * TILE_SIZE,
      w: TILE_SIZE,
      h: TILE_SIZE,
    });
  }

  // Interior obstacles — convert each obstacle into individual tile rects
  for (const obs of OBSTACLES) {
    for (let row = obs.y; row < obs.y + obs.h && row < MAP_HEIGHT_TILES; row++) {
      for (let col = obs.x; col < obs.x + obs.w && col < MAP_WIDTH_TILES; col++) {
        rects.push({
          x: col * TILE_SIZE,
          y: row * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
        });
      }
    }
  }

  return rects;
}
