import Phaser from "phaser";
import { PlayerState } from "shared";
import {
  DASH_DISTANCE,
  DASH_DURATION_FRAMES,
  MELEE_ACTIVE_FRAMES,
} from "shared";

export interface DashState {
  /** Direction angle in radians */
  angle: number;
  /** Remaining frames */
  framesLeft: number;
  /** Speed per frame (px) */
  speedPerFrame: number;
}

/**
 * Manages player combat state transitions.
 * Consumes 'combo:detected' events and transitions between states.
 */
export class CombatStateMachine {
  private scene: Phaser.Scene;
  private state: PlayerState = PlayerState.Idle;
  private stateTimer = 0; // frames remaining in timed state

  // Dash
  private dashState: DashState | null = null;

  // Callbacks for combo execution
  private onDash: ((angle: number, speed: number) => void) | null = null;
  private onDashStrike: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Listen for combo events
    scene.events.on("combo:detected", this.handleCombo, this);
    scene.events.once("shutdown", () => {
      scene.events.off("combo:detected", this.handleCombo, this);
    });
  }

  /** Register callbacks for combo execution */
  setCallbacks(callbacks: {
    onDash: (angle: number, speed: number) => void;
    onDashStrike: () => void;
  }) {
    this.onDash = callbacks.onDash;
    this.onDashStrike = callbacks.onDashStrike;
  }

  private handleCombo(comboName: string) {
    switch (comboName) {
      case "dash":
        this.tryDash();
        break;
      case "dash_strike":
        this.tryDashStrike();
        break;
    }
  }

  private tryDash() {
    // Can dash from idle or moving
    if (
      this.state !== PlayerState.Idle &&
      this.state !== PlayerState.Moving
    ) {
      return;
    }

    this.state = PlayerState.Dashing;
    this.stateTimer = DASH_DURATION_FRAMES;

    // Dash direction: use the current movement direction from the combo input
    // The GameScene will supply the actual angle
    this.dashState = {
      angle: 0, // set by GameScene before use
      framesLeft: DASH_DURATION_FRAMES,
      speedPerFrame: DASH_DISTANCE / DASH_DURATION_FRAMES,
    };

    this.scene.events.emit("state:dash_start");
  }

  private tryDashStrike() {
    // Dash strike can trigger from dashing or idle/moving (combo includes the dash)
    this.state = PlayerState.ComboExecuting;
    this.stateTimer = MELEE_ACTIVE_FRAMES;

    // End any active dash
    this.dashState = null;

    if (this.onDashStrike) this.onDashStrike();

    this.scene.events.emit("state:dash_strike");
  }

  /** Set the dash direction angle (called by GameScene based on movement input) */
  setDashAngle(angle: number) {
    if (this.dashState) {
      this.dashState.angle = angle;
    }
  }

  /** Call each frame to tick state timers */
  update(): DashState | null {
    if (this.stateTimer > 0) {
      this.stateTimer--;

      if (this.dashState) {
        this.dashState.framesLeft = this.stateTimer;

        if (this.stateTimer <= 0) {
          // Dash ended
          const dash = this.dashState;
          this.dashState = null;
          this.state = PlayerState.Idle;
          this.scene.events.emit("state:dash_end");
          return null;
        }

        return this.dashState;
      }

      if (this.stateTimer <= 0) {
        this.state = PlayerState.Idle;
      }
    }

    return this.dashState;
  }

  getState(): PlayerState {
    return this.state;
  }

  isDashing(): boolean {
    return this.state === PlayerState.Dashing && this.dashState !== null;
  }

  isLocked(): boolean {
    return (
      this.state === PlayerState.Dashing ||
      this.state === PlayerState.ComboExecuting ||
      this.state === PlayerState.Stunned
    );
  }

  canShoot(): boolean {
    return (
      this.state === PlayerState.Idle ||
      this.state === PlayerState.Moving
    );
  }

  canMelee(): boolean {
    return (
      this.state === PlayerState.Idle ||
      this.state === PlayerState.Moving
    );
  }

  /** Reset to idle (e.g., on respawn) */
  reset() {
    this.state = PlayerState.Idle;
    this.stateTimer = 0;
    this.dashState = null;
  }

  /** Transition to moving state (called by GameScene when player has input) */
  setMoving(isMoving: boolean) {
    if (this.isLocked()) return;
    this.state = isMoving ? PlayerState.Moving : PlayerState.Idle;
  }
}
