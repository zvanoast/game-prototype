import type { WallRect } from "./map-data.js";

/**
 * Resolve circle-vs-AABB collisions. Pushes the circle out of any overlapping walls.
 * Pure function — no Phaser dependency.
 *
 * @param x   Circle center x
 * @param y   Circle center y
 * @param radius  Circle radius
 * @param walls   Array of pixel-coordinate AABBs
 * @returns Resolved position { x, y }
 */
export function resolveWallCollisions(
  x: number,
  y: number,
  radius: number,
  walls: WallRect[]
): { x: number; y: number } {
  let cx = x;
  let cy = y;

  for (const wall of walls) {
    // Find closest point on the AABB to the circle center
    const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.h));

    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius && distSq > 0) {
      // Circle overlaps this wall — push out along penetration normal
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      cx += nx * overlap;
      cy += ny * overlap;
    } else if (distSq === 0) {
      // Circle center is exactly on/inside the wall edge — push out in +y as fallback
      // This handles the degenerate case where center is inside the rect
      // Find the shortest axis to push out
      const leftDist = cx - wall.x;
      const rightDist = wall.x + wall.w - cx;
      const topDist = cy - wall.y;
      const bottomDist = wall.y + wall.h - cy;

      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

      if (minDist === leftDist) {
        cx = wall.x - radius;
      } else if (minDist === rightDist) {
        cx = wall.x + wall.w + radius;
      } else if (minDist === topDist) {
        cy = wall.y - radius;
      } else {
        cy = wall.y + wall.h + radius;
      }
    }
  }

  return { x: cx, y: cy };
}
