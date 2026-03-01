import { INPUT_BUFFER_SIZE } from "shared";
import { Direction } from "shared";

/** A single frame of recorded input */
export interface InputFrame {
  /** Frame number (monotonically increasing) */
  tick: number;
  /** 8-way direction enum */
  direction: Direction;
  /** Raw movement axes */
  dx: number;
  dy: number;
  /** Button bitfield (Button.ATTACK, etc.) */
  buttons: number;
  /** Previous frame's button bitfield (for press/release detection) */
  prevButtons: number;
  /** Aim angle in radians */
  aimAngle: number;
}

/**
 * Circular buffer storing the last N frames of player input.
 * Used by ComboDetector to match input patterns.
 */
export class InputBuffer {
  private buffer: InputFrame[];
  private head = 0; // next write position
  private count = 0;
  private frameCounter = 0;
  private lastButtons = 0;

  constructor(private size: number = INPUT_BUFFER_SIZE) {
    this.buffer = new Array(size);
  }

  /** Record a new frame of input */
  recordFrame(dx: number, dy: number, buttons: number, aimAngle: number) {
    const frame: InputFrame = {
      tick: this.frameCounter++,
      direction: InputBuffer.directionFromAxes(dx, dy),
      dx,
      dy,
      buttons,
      prevButtons: this.lastButtons,
      aimAngle,
    };

    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;

    this.lastButtons = buttons;
  }

  /** Get the most recent frame, or null if empty */
  getLatest(): InputFrame | null {
    if (this.count === 0) return null;
    const idx = (this.head - 1 + this.size) % this.size;
    return this.buffer[idx];
  }

  /** Get the last N frames, newest first */
  getHistory(n: number): InputFrame[] {
    const result: InputFrame[] = [];
    const limit = Math.min(n, this.count);
    for (let i = 0; i < limit; i++) {
      const idx = (this.head - 1 - i + this.size * 2) % this.size;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  /** Get all recorded frames, newest first */
  getAll(): InputFrame[] {
    return this.getHistory(this.count);
  }

  /** Current number of frames stored */
  getCount(): number {
    return this.count;
  }

  /** Current frame counter */
  getCurrentTick(): number {
    return this.frameCounter;
  }

  /** Convert dx/dy axes to 8-way Direction enum */
  static directionFromAxes(dx: number, dy: number): Direction {
    if (dx === 0 && dy === 0) return Direction.Neutral;
    if (dx > 0 && dy === 0) return Direction.Right;
    if (dx < 0 && dy === 0) return Direction.Left;
    if (dx === 0 && dy < 0) return Direction.Up;
    if (dx === 0 && dy > 0) return Direction.Down;
    if (dx > 0 && dy < 0) return Direction.UpRight;
    if (dx > 0 && dy > 0) return Direction.DownRight;
    if (dx < 0 && dy < 0) return Direction.UpLeft;
    return Direction.DownLeft;
  }
}
