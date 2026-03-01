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

/** Color theme for warehouse tileset */
export interface MapTheme {
  floorColor: number;
  floorAccentColor: number;
  wallColor: number;
  wallHighlight: number;
  wallShadow: number;
}

export const WAREHOUSE_THEME: MapTheme = {
  floorColor: 0x2a2a3e,      // dark concrete
  floorAccentColor: 0x333348, // slightly lighter concrete
  wallColor: 0x667788,        // storage unit walls
  wallHighlight: 0x889aab,    // top edge
  wallShadow: 0x445566,       // bottom edge
};

/**
 * Symmetrical storage warehouse layout on a 64×64 tile grid.
 *
 * Layout (approximate):
 *   - Perimeter walls handled separately (row/col 0 and 63)
 *   - 4 columns of storage units, symmetrical left/right of center aisle
 *   - Center aisle at x=30..33 (clear vertical lane)
 *   - Horizontal aisles between unit rows for combat
 *   - Open spawn zones at top (rows 2-4) and bottom (rows 59-61)
 *
 * Left half columns at x=4..7 and x=12..15
 * Right half mirrored at x=48..51 and x=56..59
 * (mirror formula: mirrorX = 63 - x - w)
 */
function buildSymmetricObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];

  // Define left-half storage units (will be mirrored for right half)
  // Each unit is a 4-wide × 6-tall block
  const leftUnits: Obstacle[] = [
    // Column 1 (x=4..7)
    { x: 4, y: 6, w: 4, h: 6 },
    { x: 4, y: 16, w: 4, h: 6 },
    { x: 4, y: 26, w: 4, h: 6 },
    { x: 4, y: 36, w: 4, h: 6 },
    { x: 4, y: 46, w: 4, h: 6 },

    // Column 2 (x=12..15)
    { x: 12, y: 6, w: 4, h: 6 },
    { x: 12, y: 16, w: 4, h: 6 },
    { x: 12, y: 26, w: 4, h: 6 },
    { x: 12, y: 36, w: 4, h: 6 },
    { x: 12, y: 46, w: 4, h: 6 },
  ];

  // Add center obstacles (small crates near the center aisle for cover)
  const centerObstacles: Obstacle[] = [
    { x: 22, y: 10, w: 3, h: 3 },
    { x: 22, y: 30, w: 3, h: 3 },
    { x: 22, y: 50, w: 3, h: 3 },
    { x: 39, y: 10, w: 3, h: 3 },
    { x: 39, y: 30, w: 3, h: 3 },
    { x: 39, y: 50, w: 3, h: 3 },
  ];

  // Add left-half units
  for (const unit of leftUnits) {
    obstacles.push(unit);
  }

  // Mirror left-half to right-half
  for (const unit of leftUnits) {
    obstacles.push({
      x: MAP_WIDTH_TILES - 1 - unit.x - unit.w + 1,
      y: unit.y,
      w: unit.w,
      h: unit.h,
    });
  }

  // Add center obstacles (already placed symmetrically)
  for (const obs of centerObstacles) {
    obstacles.push(obs);
  }

  return obstacles;
}

/** Interior obstacles — symmetrical storage warehouse layout */
export const OBSTACLES: Obstacle[] = buildSymmetricObstacles();

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
