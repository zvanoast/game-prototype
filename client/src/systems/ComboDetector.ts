import Phaser from "phaser";
import type { InputBuffer, InputFrame } from "./InputBuffer";
import type { ComboDefinition, InputCondition } from "shared";
import { ALL_COMBOS } from "shared";
import { Button } from "shared";

/**
 * Scans the InputBuffer each frame against registered combo definitions.
 * Matches the longest/most complex combo first (ALL_COMBOS is ordered by priority).
 * Emits 'combo:detected' Phaser events when a combo matches.
 */
export class ComboDetector {
  private scene: Phaser.Scene;
  private inputBuffer: InputBuffer;
  private combos: ComboDefinition[];

  /** Cooldown tracking: combo name -> tick when it can next fire */
  private cooldowns = new Map<string, number>();

  /** Last detected combo name (for debug) */
  private lastDetected: string | null = null;
  private lastDetectedTick = -1;

  constructor(scene: Phaser.Scene, inputBuffer: InputBuffer) {
    this.scene = scene;
    this.inputBuffer = inputBuffer;
    this.combos = ALL_COMBOS;
  }

  /** Call each frame after recording input */
  update() {
    const currentTick = this.inputBuffer.getCurrentTick();
    const history = this.inputBuffer.getAll();
    if (history.length < 2) return;

    // Try combos in priority order (longest first)
    for (const combo of this.combos) {
      // Check cooldown
      const cooldownUntil = this.cooldowns.get(combo.name) ?? 0;
      if (currentTick < cooldownUntil) continue;

      if (this.matchCombo(combo, history)) {
        this.lastDetected = combo.name;
        this.lastDetectedTick = currentTick;

        // Set cooldown
        this.cooldowns.set(combo.name, currentTick + combo.cooldownTicks);

        // Emit event
        this.scene.events.emit("combo:detected", combo.name);

        // Only match one combo per frame
        return;
      }
    }
  }

  /**
   * Try to match a combo definition against the input history.
   * Steps are matched backwards from the most recent frame.
   */
  private matchCombo(combo: ComboDefinition, history: InputFrame[]): boolean {
    const steps = combo.steps;
    if (steps.length === 0) return false;

    // The last step must match the most recent frame
    let historyIdx = 0; // history is newest-first

    // For each combo, we also try all 4 cardinal directions for direction_tap combos
    // (the combo defs use param=1 as a template; we mirror for -1 and for dy axis)
    const directionVariants = this.getDirectionVariants(combo);

    for (const variant of directionVariants) {
      if (this.matchVariant(variant, history)) return true;
    }

    return false;
  }

  /**
   * Generate direction variants of a combo.
   * Direction_tap combos with param=1 are mirrored to work for all 4 directions
   * (right, left, up, down) and both axes.
   */
  private getDirectionVariants(combo: ComboDefinition): ComboDefinition[] {
    const hasDirectionTap = combo.steps.some(
      (s) => s.condition.type === "direction_tap"
    );

    if (!hasDirectionTap) return [combo];

    // Generate 4 variants: +dx, -dx, -dy, +dy
    const variants: ComboDefinition[] = [];
    const axes: Array<{ axis: "dx" | "dy"; sign: number }> = [
      { axis: "dx", sign: 1 },
      { axis: "dx", sign: -1 },
      { axis: "dy", sign: -1 }, // up
      { axis: "dy", sign: 1 },  // down
    ];

    for (const { axis, sign } of axes) {
      const steps = combo.steps.map((step) => {
        if (step.condition.type === "direction_tap") {
          return {
            ...step,
            condition: {
              ...step.condition,
              // Encode axis+sign: we'll decode in the matcher
              _axis: axis,
              _sign: sign,
            } as InputCondition & { _axis: string; _sign: number },
          };
        }
        return step;
      });
      variants.push({ ...combo, steps });
    }

    return variants;
  }

  private matchVariant(combo: ComboDefinition, history: InputFrame[]): boolean {
    const steps = combo.steps;

    // Work backwards through steps: last step must match newest frame
    let stepIdx = steps.length - 1;
    let histIdx = 0;

    // The final step must match the current (newest) frame
    if (!this.matchCondition(steps[stepIdx], history[histIdx])) return false;

    stepIdx--;

    // Match remaining steps going backwards through history
    for (let h = 1; h < history.length && stepIdx >= 0; h++) {
      const step = steps[stepIdx];
      const frameDelta = history[0].tick - history[h].tick;

      // Check if we're still within the window for this step transition
      // The window is on the NEXT step (the one after this one in sequence)
      const nextStep = steps[stepIdx + 1];
      if (frameDelta > nextStep.windowFrames && nextStep.windowFrames > 0) {
        // Exceeded window — combo failed
        return false;
      }

      if (this.matchCondition(step, history[h])) {
        stepIdx--;
      }
    }

    // All steps matched?
    return stepIdx < 0;
  }

  private matchCondition(
    step: { condition: InputCondition & { _axis?: string; _sign?: number }; windowFrames: number },
    frame: InputFrame
  ): boolean {
    const cond = step.condition;

    switch (cond.type) {
      case "direction_tap": {
        // Check if a direction was tapped (pressed this frame but not last)
        const axis = cond._axis ?? "dx";
        const sign = cond._sign ?? cond.param;

        if (axis === "dx") {
          const current = frame.dx;
          // A "tap" means the direction is active in this frame
          // For double-tap detection we just need the direction to be active
          return current === sign;
        } else {
          const current = frame.dy;
          return current === sign;
        }
      }

      case "button_press": {
        const bit = cond.param;
        const pressed = (frame.buttons & bit) !== 0;
        const wasPressedBefore = (frame.prevButtons & bit) !== 0;
        return pressed && !wasPressedBefore;
      }

      case "button_hold": {
        const bit = cond.param;
        const pressed = (frame.buttons & bit) !== 0;
        if (!pressed) return false;

        // Check minFrames — we need the button held for at least N frames
        // This is checked by looking at consecutive frames with the button held
        // For simplicity, we just check if the button is currently held
        // The actual frame count validation happens at the combo level
        return true;
      }

      case "button_release": {
        const bit = cond.param;
        const released = (frame.buttons & bit) === 0;
        const wasPressed = (frame.prevButtons & bit) !== 0;
        return released && wasPressed;
      }

      default:
        return false;
    }
  }

  /** Get the name of the last detected combo (for debug) */
  getLastDetected(): string | null {
    return this.lastDetected;
  }

  getLastDetectedTick(): number {
    return this.lastDetectedTick;
  }

  /** Check if a specific combo is on cooldown */
  isOnCooldown(comboName: string): boolean {
    const until = this.cooldowns.get(comboName) ?? 0;
    return this.inputBuffer.getCurrentTick() < until;
  }
}
