import type { WallRect } from "shared";
import {
  TILE_SIZE,
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
} from "shared";

/** Navigation grid + A* pathfinding + line-of-sight */

// Shared nav grid (built once, used by all bots)
let navGrid: boolean[] | null = null; // true = walkable
const GRID_W = MAP_WIDTH_TILES;
const GRID_H = MAP_HEIGHT_TILES;

/** Build nav grid from wallRects. Call once at startup. */
export function initNavGrid(wallRects: WallRect[]): void {
  navGrid = new Array(GRID_W * GRID_H).fill(true);

  for (const rect of wallRects) {
    // Convert pixel rect to tile coords
    const tileX = Math.floor(rect.x / TILE_SIZE);
    const tileY = Math.floor(rect.y / TILE_SIZE);
    const tw = Math.max(1, Math.ceil(rect.w / TILE_SIZE));
    const th = Math.max(1, Math.ceil(rect.h / TILE_SIZE));

    for (let dy = 0; dy < th; dy++) {
      for (let dx = 0; dx < tw; dx++) {
        const gx = tileX + dx;
        const gy = tileY + dy;
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          navGrid[gy * GRID_W + gx] = false;
        }
      }
    }
  }
}

function isWalkable(gx: number, gy: number): boolean {
  if (!navGrid) return true;
  if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return false;
  return navGrid[gy * GRID_W + gx];
}

// Pre-computed list of walkable tiles for fast random selection
let walkableTiles: { gx: number; gy: number }[] | null = null;

/** Build walkable tile list after nav grid is initialized */
function ensureWalkableList(): void {
  if (walkableTiles || !navGrid) return;
  walkableTiles = [];
  // Exclude perimeter (row/col 0 and 63) — those are walls
  for (let gy = 2; gy < GRID_H - 2; gy++) {
    for (let gx = 2; gx < GRID_W - 2; gx++) {
      if (navGrid[gy * GRID_W + gx]) {
        walkableTiles.push({ gx, gy });
      }
    }
  }
}

/**
 * Pick a random walkable tile in pixel coords, biased toward the map center.
 * Uses rejection sampling with a center-weighted distribution.
 */
export function pickRandomWalkablePoint(): { x: number; y: number } {
  ensureWalkableList();
  if (!walkableTiles || walkableTiles.length === 0) {
    // Fallback
    return { x: MAP_WIDTH_TILES * TILE_SIZE / 2, y: MAP_HEIGHT_TILES * TILE_SIZE / 2 };
  }

  const centerGx = GRID_W / 2;
  const centerGy = GRID_H / 2;
  const maxDist = Math.sqrt(centerGx * centerGx + centerGy * centerGy);

  // Try up to 10 candidates, pick the one closest to center
  // This biases toward center without being deterministic
  let bestTile = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
  let bestCenterDist = Infinity;

  const candidates = Math.min(8, walkableTiles.length);
  for (let i = 0; i < candidates; i++) {
    const tile = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
    const dx = tile.gx - centerGx;
    const dy = tile.gy - centerGy;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Weight: prefer tiles in the middle 60% of the map
    const score = d + Math.random() * maxDist * 0.4; // add randomness so it's not always dead center
    if (score < bestCenterDist) {
      bestCenterDist = score;
      bestTile = tile;
    }
  }

  return gridToPixel(bestTile.gx, bestTile.gy);
}

/** Convert pixel coords to grid tile coords */
export function pixelToGrid(px: number, py: number): { gx: number; gy: number } {
  return {
    gx: Math.floor(px / TILE_SIZE),
    gy: Math.floor(py / TILE_SIZE),
  };
}

/** Convert grid tile center to pixel coords */
export function gridToPixel(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * TILE_SIZE + TILE_SIZE / 2,
    y: gy * TILE_SIZE + TILE_SIZE / 2,
  };
}

// --- A* Pathfinding ---

interface AStarNode {
  gx: number;
  gy: number;
  g: number; // cost from start
  h: number; // heuristic to goal
  f: number; // g + h
  parent: AStarNode | null;
}

// 8-directional neighbors
const DIRS = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: 1.414 },
  { dx: -1, dy: 1, cost: 1.414 },
  { dx: 1, dy: -1, cost: 1.414 },
  { dx: -1, dy: -1, cost: 1.414 },
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // Octile distance
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

/**
 * A* pathfinding on the nav grid.
 * Returns array of pixel waypoints, or empty array if no path.
 * Max search limit to keep it cheap.
 */
export function findPath(
  fromX: number, fromY: number,
  toX: number, toY: number,
  maxNodes: number = 500,
): { x: number; y: number }[] {
  if (!navGrid) return [];

  const start = pixelToGrid(fromX, fromY);
  const end = pixelToGrid(toX, toY);

  // Clamp to grid
  start.gx = Math.max(0, Math.min(GRID_W - 1, start.gx));
  start.gy = Math.max(0, Math.min(GRID_H - 1, start.gy));
  end.gx = Math.max(0, Math.min(GRID_W - 1, end.gx));
  end.gy = Math.max(0, Math.min(GRID_H - 1, end.gy));

  // If target is in a wall, find nearest walkable tile
  if (!isWalkable(end.gx, end.gy)) {
    const alt = findNearestWalkable(end.gx, end.gy);
    if (!alt) return [];
    end.gx = alt.gx;
    end.gy = alt.gy;
  }

  if (!isWalkable(start.gx, start.gy)) {
    const alt = findNearestWalkable(start.gx, start.gy);
    if (!alt) return [];
    start.gx = alt.gx;
    start.gy = alt.gy;
  }

  if (start.gx === end.gx && start.gy === end.gy) {
    return [gridToPixel(end.gx, end.gy)];
  }

  // Simple open list (not a heap, but grid is small enough)
  const open: AStarNode[] = [];
  const closed = new Set<number>();
  const key = (gx: number, gy: number) => gy * GRID_W + gx;

  const startNode: AStarNode = {
    gx: start.gx, gy: start.gy,
    g: 0,
    h: heuristic(start.gx, start.gy, end.gx, end.gy),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  open.push(startNode);

  let nodesSearched = 0;

  while (open.length > 0 && nodesSearched < maxNodes) {
    // Find lowest f in open list
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    const ck = key(current.gx, current.gy);
    if (closed.has(ck)) continue;
    closed.add(ck);
    nodesSearched++;

    // Goal reached
    if (current.gx === end.gx && current.gy === end.gy) {
      return reconstructPath(current);
    }

    // Expand neighbors
    for (const dir of DIRS) {
      const nx = current.gx + dir.dx;
      const ny = current.gy + dir.dy;
      const nk = key(nx, ny);

      if (closed.has(nk) || !isWalkable(nx, ny)) continue;

      // For diagonal moves, check that both cardinal neighbors are walkable
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!isWalkable(current.gx + dir.dx, current.gy) ||
            !isWalkable(current.gx, current.gy + dir.dy)) {
          continue;
        }
      }

      const g = current.g + dir.cost;
      const h = heuristic(nx, ny, end.gx, end.gy);
      const node: AStarNode = {
        gx: nx, gy: ny,
        g, h, f: g + h,
        parent: current,
      };
      open.push(node);
    }
  }

  // No path found — return direct line (bot will slide along walls)
  return [{ x: toX, y: toY }];
}

function reconstructPath(node: AStarNode): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let current: AStarNode | null = node;
  while (current) {
    path.push(gridToPixel(current.gx, current.gy));
    current = current.parent;
  }
  path.reverse();

  // Simplify: remove collinear waypoints
  if (path.length <= 2) return path;
  const simplified: { x: number; y: number }[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    // Keep if direction changes
    if (dx1 !== dx2 || dy1 !== dy2) {
      simplified.push(curr);
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function findNearestWalkable(gx: number, gy: number): { gx: number; gy: number } | null {
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only check ring
        const nx = gx + dx;
        const ny = gy + dy;
        if (isWalkable(nx, ny)) return { gx: nx, gy: ny };
      }
    }
  }
  return null;
}

/** Line-of-sight check using DDA ray march on nav grid */
export function hasLineOfSight(
  fromX: number, fromY: number,
  toX: number, toY: number,
): boolean {
  if (!navGrid) return true;

  const from = pixelToGrid(fromX, fromY);
  const to = pixelToGrid(toX, toY);

  let x = from.gx;
  let y = from.gy;
  const dx = Math.abs(to.gx - x);
  const dy = Math.abs(to.gy - y);
  const sx = x < to.gx ? 1 : -1;
  const sy = y < to.gy ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (!isWalkable(x, y)) return false;
    if (x === to.gx && y === to.gy) return true;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Distance between two points */
export function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
