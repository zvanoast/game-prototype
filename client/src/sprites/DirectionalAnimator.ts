/**
 * DirectionalAnimator — Converts continuous angle to 4-direction animation.
 *
 * Instead of rotating sprites to face the aim direction, this system selects
 * the appropriate directional animation frame. Sprites stay upright; direction
 * is conveyed purely by the sprite art.
 *
 * When generated atlases are not available, falls back to legacy behavior
 * (single-direction sprites with rotation applied).
 */

import Phaser from "phaser";
import { SpriteRegistry } from "./SpriteRegistry";
import type { Direction4, CharacterAnimState } from "./SpriteManifest";

/**
 * Convert a radian angle to one of 4 cardinal directions.
 *
 * Angle convention (Phaser / math standard):
 *   0     = right
 *   π/2   = down
 *   π/-π  = left
 *   -π/2  = up
 */
export function angleToDir4(angle: number): Direction4 {
  // Normalize to [0, 2π)
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Quadrants (45° wedges centered on each cardinal):
  //   right: 315°-45°  (5.50 - 0.79 rad)
  //   down:  45°-135°  (0.79 - 2.36 rad)
  //   left:  135°-225° (2.36 - 3.93 rad)
  //   up:    225°-315° (3.93 - 5.50 rad)
  if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) return "right";
  if (a < (3 * Math.PI) / 4) return "down";
  if (a < (5 * Math.PI) / 4) return "left";
  return "up";
}

/**
 * Map game PlayerState strings to CharacterAnimState.
 * The game uses "idle", "moving", "attacking", "melee", "dashing", "dead" etc.
 */
export function playerStateToAnimState(playerState: string): CharacterAnimState {
  switch (playerState) {
    case "moving": return "walk";
    case "attacking": return "attack_ranged";
    case "melee": return "attack_melee";
    case "dashing": return "dash";
    case "dead": return "death";
    case "idle":
    default: return "idle";
  }
}

export class DirectionalAnimator {
  private sprite: Phaser.GameObjects.Sprite;
  private registry: SpriteRegistry;
  private charIndex: number;
  private usesDirectional: boolean;

  private currentDir: Direction4 = "down";
  private currentState: CharacterAnimState = "idle";
  private currentAnimKey = "";

  constructor(
    sprite: Phaser.GameObjects.Sprite,
    registry: SpriteRegistry,
    charIndex: number,
  ) {
    this.sprite = sprite;
    this.registry = registry;
    this.charIndex = charIndex;
    this.usesDirectional = registry.hasGeneratedCharacters;

    // If using directional sprites, ensure rotation is cleared
    if (this.usesDirectional) {
      this.sprite.setRotation(0);
    }
  }

  /**
   * Update the sprite's animation based on angle and state.
   *
   * @param angle - Aim/movement angle in radians
   * @param playerState - Game state string ("idle", "moving", "dead", etc.)
   * @param applyRotation - If true and NOT using directional sprites, apply rotation to sprite
   */
  update(angle: number, playerState: string, applyRotation = true): void {
    const animState = playerStateToAnimState(playerState);
    const dir = angleToDir4(angle);

    if (this.usesDirectional) {
      // Directional mode: pick correct animation, no rotation
      this.sprite.setRotation(0);
      this.playDirectional(animState, dir);
    } else {
      // Legacy mode: single-direction animation + rotation
      if (applyRotation) {
        this.sprite.setRotation(angle);
      }
      this.playLegacy(animState);
    }
  }

  /** Play the correct directional animation */
  private playDirectional(state: CharacterAnimState, dir: Direction4): void {
    // Only update if state or direction changed
    if (state === this.currentState && dir === this.currentDir && this.currentAnimKey) {
      return;
    }

    const animKey = this.registry.getCharacterAnimKey(this.charIndex, state, dir);

    // For non-looping animations, only restart if state changed (not direction)
    if (state === this.currentState && this.currentAnimKey === animKey) {
      return;
    }

    if (this.scene?.anims.exists(animKey)) {
      const ignoreIfPlaying = state === this.currentState;
      this.sprite.play(animKey, ignoreIfPlaying);
      this.currentAnimKey = animKey;
    }

    this.currentDir = dir;
    this.currentState = state;
  }

  /** Play legacy non-directional animation */
  private playLegacy(state: CharacterAnimState): void {
    if (state === this.currentState) return;

    const animKey = this.registry.getCharacterAnimKey(this.charIndex, state, this.currentDir);
    if (this.scene?.anims.exists(animKey)) {
      this.sprite.play(animKey, true);
      this.currentAnimKey = animKey;
    }

    this.currentState = state;
  }

  /** Get the scene from the sprite */
  private get scene(): Phaser.Scene | undefined {
    return this.sprite.scene;
  }

  /** Check if this animator uses directional sprites */
  get isDirectional(): boolean {
    return this.usesDirectional;
  }

  /** Get current facing direction */
  get direction(): Direction4 {
    return this.currentDir;
  }

  /** Reset to idle facing down */
  reset(): void {
    this.currentDir = "down";
    this.currentState = "idle";
    this.currentAnimKey = "";
  }

  /** Update character index (e.g. when server reassigns) */
  setCharacterIndex(charIndex: number): void {
    this.charIndex = charIndex;
    this.currentAnimKey = ""; // force re-evaluation
  }
}
