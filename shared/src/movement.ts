import {
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_SPEED,
} from "./constants.js";

export interface MovementResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Pure acceleration-based movement function.
 * Shared between client prediction/replay and server tick.
 *
 * @param x   Current position x
 * @param y   Current position y
 * @param vx  Current velocity x
 * @param vy  Current velocity y
 * @param dx  Input direction x (-1 to 1)
 * @param dy  Input direction y (-1 to 1)
 * @param dt  Delta time in seconds
 * @param speedMultiplier  Optional speed multiplier (default 1.0)
 * @returns New position and velocity
 */
export function applyMovement(
  x: number,
  y: number,
  vx: number,
  vy: number,
  dx: number,
  dy: number,
  dt: number,
  speedMultiplier = 1.0,
  frictionOverride?: number,
): MovementResult {
  // Normalize input direction
  let ix = dx;
  let iy = dy;
  const inputMag = Math.sqrt(ix * ix + iy * iy);
  if (inputMag > 1) {
    ix /= inputMag;
    iy /= inputMag;
  }

  // Apply acceleration or friction
  let newVx = vx;
  let newVy = vy;

  if (inputMag > 0) {
    // Accelerate in input direction
    newVx += ix * PLAYER_ACCELERATION * dt;
    newVy += iy * PLAYER_ACCELERATION * dt;
  } else {
    // Apply friction (decelerate to zero)
    const speed = Math.sqrt(newVx * newVx + newVy * newVy);
    if (speed > 0) {
      const frictionAmount = (frictionOverride ?? PLAYER_FRICTION) * dt;
      if (frictionAmount >= speed) {
        newVx = 0;
        newVy = 0;
      } else {
        const ratio = (speed - frictionAmount) / speed;
        newVx *= ratio;
        newVy *= ratio;
      }
    }
  }

  // Clamp to max speed only when actively accelerating (has input).
  // When coasting (no input), let friction naturally bring speed down — this
  // allows momentum from vehicle dismounts or knockback to decay smoothly
  // instead of being instantly capped.
  const maxSpeed = PLAYER_SPEED * speedMultiplier;
  const currentSpeed = Math.sqrt(newVx * newVx + newVy * newVy);
  if (inputMag > 0 && currentSpeed > maxSpeed) {
    const scale = maxSpeed / currentSpeed;
    newVx *= scale;
    newVy *= scale;
  }

  // Integrate position
  const newX = x + newVx * dt;
  const newY = y + newVy * dt;

  return { x: newX, y: newY, vx: newVx, vy: newVy };
}
