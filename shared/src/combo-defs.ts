import {
  DASH_STRIKE_WINDOW_FRAMES,
} from "./constants.js";

// --- Combo system types ---

export type InputConditionType =
  | "direction_tap"   // direction pressed this frame but not last
  | "button_press"    // button pressed this frame but not last
  | "button_hold"     // button held for N+ frames
  | "button_release"; // button released this frame

export interface InputCondition {
  type: InputConditionType;
  /** For direction_tap: which axis ('dx' | 'dy') and sign (+1/-1).
   *  For button_*: which button bit. */
  param: number;
  /** For button_hold: minimum frames held */
  minFrames?: number;
}

export interface ComboStep {
  condition: InputCondition;
  /** Max frames allowed since previous step (0 = same frame) */
  windowFrames: number;
}

export interface ComboDefinition {
  name: string;
  steps: ComboStep[];
  /** Cooldown in ticks before this combo can be used again */
  cooldownTicks: number;
}

// --- Starter combos ---

/**
 * Dash: press spacebar (Button.DASH = 2).
 * Direction is determined by current movement input or aim angle at runtime.
 */
export const COMBO_DASH: ComboDefinition = {
  name: "dash",
  steps: [
    {
      condition: { type: "button_press", param: 2 }, // Button.DASH
      windowFrames: 0,
    },
  ],
  cooldownTicks: 10,
};

/**
 * Dash-Strike: press spacebar to dash, then right-click melee within 10 frames.
 * Acts as a strong melee with damage multiplier.
 */
export const COMBO_DASH_STRIKE: ComboDefinition = {
  name: "dash_strike",
  steps: [
    {
      condition: { type: "button_press", param: 2 }, // Button.DASH (spacebar)
      windowFrames: 0,
    },
    {
      condition: { type: "button_press", param: 16 }, // Button.MELEE (right-click)
      windowFrames: DASH_STRIKE_WINDOW_FRAMES,
    },
  ],
  cooldownTicks: 40,
};

/** All registered combos. Order matters: longer combos should come first
 *  so they match before shorter sub-sequences. */
export const ALL_COMBOS: ComboDefinition[] = [
  COMBO_DASH_STRIKE,
  COMBO_DASH,
];
