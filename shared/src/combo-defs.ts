import {
  CHARGED_SHOT_MIN_FRAMES,
  COMBO_WINDOW_FRAMES,
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
 * Dash: double-tap any movement direction within the combo window.
 * Represented here as double-tap right; the runtime mirrors for all directions.
 */
export const COMBO_DASH: ComboDefinition = {
  name: "dash",
  steps: [
    {
      condition: { type: "direction_tap", param: 1 }, // first tap
      windowFrames: 0, // starts the sequence
    },
    {
      condition: { type: "direction_tap", param: 1 }, // second tap
      windowFrames: COMBO_WINDOW_FRAMES,
    },
  ],
  cooldownTicks: 10,
};

/**
 * Charged Shot: hold attack button for 20+ frames, then release.
 */
export const COMBO_CHARGED_SHOT: ComboDefinition = {
  name: "charged_shot",
  steps: [
    {
      condition: {
        type: "button_hold",
        param: 1, // Button.ATTACK
        minFrames: CHARGED_SHOT_MIN_FRAMES,
      },
      windowFrames: 0,
    },
    {
      condition: { type: "button_release", param: 1 },
      windowFrames: 5, // release must come soon after hold threshold
    },
  ],
  cooldownTicks: 30,
};

/**
 * Dash-Strike: execute a dash, then press attack within 10 frames.
 */
export const COMBO_DASH_STRIKE: ComboDefinition = {
  name: "dash_strike",
  steps: [
    {
      condition: { type: "direction_tap", param: 1 }, // first tap of dash
      windowFrames: 0,
    },
    {
      condition: { type: "direction_tap", param: 1 }, // second tap (completes dash)
      windowFrames: COMBO_WINDOW_FRAMES,
    },
    {
      condition: { type: "button_press", param: 1 }, // attack right after
      windowFrames: DASH_STRIKE_WINDOW_FRAMES,
    },
  ],
  cooldownTicks: 40,
};

/** All registered combos. Order matters: longer combos should come first
 *  so they match before shorter sub-sequences. */
export const ALL_COMBOS: ComboDefinition[] = [
  COMBO_DASH_STRIKE,
  COMBO_CHARGED_SHOT,
  COMBO_DASH,
];
