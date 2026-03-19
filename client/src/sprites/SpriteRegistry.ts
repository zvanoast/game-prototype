/**
 * SpriteRegistry — Runtime texture/frame lookup with procedural fallback.
 *
 * Centralizes all sprite lookups. When generated atlases are loaded, returns
 * atlas frame references. When they're missing, falls back to the existing
 * procedural textures (pickup_X, proj_default, vehicle_X, player_sheet, etc).
 */

import Phaser from "phaser";
import {
  type Direction4,
  type CharacterAnimState,
  ATLAS_KEYS,
  charFrameName,
  pickupFrameName,
  projectileFrameName,
  vehicleFrameName,
  envFrameName,
  ANIM_FRAME_COUNTS,
  ANIM_FRAME_RATES,
  ANIM_REPEATS,
  ALL_DIRECTIONS,
  CHARACTER_SPRITE_DEFS,
} from "./SpriteManifest";

/** Return type for frame lookups */
export interface FrameRef {
  /** Texture key */
  key: string;
  /** Frame name within atlas (undefined = use entire texture) */
  frame?: string | number;
}

export class SpriteRegistry {
  private scene: Phaser.Scene;

  /** Which atlas categories loaded successfully */
  private atlasLoaded = {
    characters: false,
    items: false,
    vehicles: false,
    environment: false,
  };

  /** Registered directional animation keys (to avoid re-registering) */
  private registeredAnims = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.detectLoadedAtlases();
  }

  /** Check which generated atlases are available */
  private detectLoadedAtlases(): void {
    const textures = this.scene.textures;
    this.atlasLoaded.characters = textures.exists(ATLAS_KEYS.characters);
    this.atlasLoaded.items = textures.exists(ATLAS_KEYS.items);
    this.atlasLoaded.vehicles = textures.exists(ATLAS_KEYS.vehicles);
    this.atlasLoaded.environment = textures.exists(ATLAS_KEYS.environment);
  }

  // ─── Characters ────────────────────────────────────────────────────

  get hasGeneratedCharacters(): boolean {
    return this.atlasLoaded.characters;
  }

  /**
   * Get the animation key for a character in a given state and direction.
   * If generated atlas is loaded, returns a directional anim key.
   * Otherwise falls back to legacy non-directional anim keys.
   */
  getCharacterAnimKey(charIndex: number, state: CharacterAnimState, dir: Direction4): string {
    if (this.atlasLoaded.characters) {
      const key = `gen_${charIndex}_${state}_${dir}`;
      this.ensureDirectionalAnim(charIndex, state, dir, key);
      return key;
    }
    // Fallback: legacy animation keys (non-directional)
    return this.getLegacyAnimKey(charIndex, state);
  }

  /** Map CharacterAnimState → legacy animation state name */
  private getLegacyAnimKey(charIndex: number, state: CharacterAnimState): string {
    const legacyState = this.mapToLegacyState(state);
    // Check if per-character anim exists, else use generic
    const perChar = `player_${legacyState}_${charIndex}`;
    if (this.scene.anims.exists(perChar)) return perChar;
    return `player_${legacyState}`;
  }

  private mapToLegacyState(state: CharacterAnimState): string {
    switch (state) {
      case "idle": return "idle";
      case "walk": return "walk";
      case "attack_melee":
      case "attack_ranged": return "attack";
      case "death": return "death";
      case "dash": return "walk"; // no dash anim in legacy
    }
  }

  /** Create and cache a directional animation from atlas frames */
  private ensureDirectionalAnim(
    charIndex: number,
    state: CharacterAnimState,
    dir: Direction4,
    animKey: string,
  ): void {
    if (this.registeredAnims.has(animKey)) return;
    if (this.scene.anims.exists(animKey)) {
      this.registeredAnims.add(animKey);
      return;
    }

    const atlas = ATLAS_KEYS.characters;
    const frameCount = ANIM_FRAME_COUNTS[state];
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];

    for (let f = 0; f < frameCount; f++) {
      const frameName = charFrameName(charIndex, state, dir, f);
      // Verify frame exists in atlas before adding
      if (this.scene.textures.get(atlas).has(frameName)) {
        frames.push({ key: atlas, frame: frameName });
      }
    }

    // If no valid frames found, don't register (will fall back to legacy)
    if (frames.length === 0) return;

    this.scene.anims.create({
      key: animKey,
      frames,
      frameRate: ANIM_FRAME_RATES[state],
      repeat: ANIM_REPEATS[state] ? -1 : 0,
    });

    this.registeredAnims.add(animKey);
  }

  /**
   * Register all directional animations for a character.
   * Call this once per character to pre-register all anims.
   */
  registerAllCharacterAnims(charIndex: number): void {
    if (!this.atlasLoaded.characters) return;

    const states: CharacterAnimState[] = ["idle", "walk", "attack_melee", "attack_ranged", "death", "dash"];
    for (const state of states) {
      for (const dir of ALL_DIRECTIONS) {
        const key = `gen_${charIndex}_${state}_${dir}`;
        this.ensureDirectionalAnim(charIndex, state, dir, key);
      }
    }
  }

  /**
   * Get the sprite creation info for a character.
   * Returns atlas key + initial frame if generated, or legacy sheet key.
   */
  getCharacterSprite(charIndex: number): FrameRef {
    if (this.atlasLoaded.characters) {
      const frameName = charFrameName(charIndex, "idle", "down", 0);
      if (this.scene.textures.get(ATLAS_KEYS.characters).has(frameName)) {
        return { key: ATLAS_KEYS.characters, frame: frameName };
      }
    }
    // Fallback: legacy spritesheet
    const sheetKey = `player_sheet_${charIndex}`;
    if (this.scene.textures.exists(sheetKey)) {
      return { key: sheetKey, frame: 0 };
    }
    return { key: "player_sheet", frame: 0 };
  }

  /** Get preview frame for menu character picker */
  getPreviewFrame(charIndex: number): FrameRef {
    if (this.atlasLoaded.characters) {
      const frameName = `char_preview_${charIndex}`;
      if (this.scene.textures.get(ATLAS_KEYS.characters).has(frameName)) {
        return { key: ATLAS_KEYS.characters, frame: frameName };
      }
    }
    // Fallback: procedural preview texture
    return { key: `char_preview_${charIndex}` };
  }

  // ─── Pickups (weapons + consumables) ───────────────────────────────

  /** Get pickup sprite frame for a weapon */
  getPickupFrame(weaponId: string): FrameRef {
    if (this.atlasLoaded.items) {
      const frameName = pickupFrameName(weaponId);
      if (this.scene.textures.get(ATLAS_KEYS.items).has(frameName)) {
        return { key: ATLAS_KEYS.items, frame: frameName };
      }
    }
    // Fallback: procedural pickup texture
    const key = `pickup_${weaponId}`;
    if (this.scene.textures.exists(key)) return { key };
    return { key: "pickup" };
  }

  /** Get pickup sprite frame for a consumable */
  getConsumablePickupFrame(consumableId: string): FrameRef {
    if (this.atlasLoaded.items) {
      const frameName = pickupFrameName(consumableId);
      if (this.scene.textures.get(ATLAS_KEYS.items).has(frameName)) {
        return { key: ATLAS_KEYS.items, frame: frameName };
      }
    }
    // Fallback: procedural consumable texture
    const key = `pickup_${consumableId}`;
    if (this.scene.textures.exists(key)) return { key };
    return { key: "pickup" };
  }

  // ─── Projectiles ──────────────────────────────────────────────────

  getProjectileFrame(weaponId: string): FrameRef {
    if (this.atlasLoaded.items) {
      const frameName = projectileFrameName(weaponId);
      if (this.scene.textures.get(ATLAS_KEYS.items).has(frameName)) {
        return { key: ATLAS_KEYS.items, frame: frameName };
      }
    }
    // Fallback: procedural projectile
    return { key: "proj_default" };
  }

  // ─── Vehicles ─────────────────────────────────────────────────────

  get hasGeneratedVehicles(): boolean {
    return this.atlasLoaded.vehicles;
  }

  getVehicleFrame(vehicleId: string, dir: Direction4): FrameRef {
    if (this.atlasLoaded.vehicles) {
      const frameName = vehicleFrameName(vehicleId, dir);
      if (this.scene.textures.get(ATLAS_KEYS.vehicles).has(frameName)) {
        return { key: ATLAS_KEYS.vehicles, frame: frameName };
      }
    }
    // Fallback: procedural vehicle texture
    const key = `vehicle_${vehicleId}`;
    if (this.scene.textures.exists(key)) return { key };
    return { key: "pickup" };
  }

  // ─── Environment ──────────────────────────────────────────────────

  get hasGeneratedEnvironment(): boolean {
    return this.atlasLoaded.environment;
  }

  getEnvironmentFrame(name: string): FrameRef {
    if (this.atlasLoaded.environment) {
      const frameName = envFrameName(name);
      if (this.scene.textures.get(ATLAS_KEYS.environment).has(frameName)) {
        return { key: ATLAS_KEYS.environment, frame: frameName };
      }
    }
    // Fallback: existing tileset/locker textures
    switch (name) {
      case "locker_closed": return { key: "locker_closed" };
      case "locker_open": return { key: "locker_open" };
      default: return { key: "tileset" };
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────

  /** Check if any generated atlas is loaded */
  get hasAnyGeneratedAtlas(): boolean {
    return Object.values(this.atlasLoaded).some(Boolean);
  }

  /** Get status of all atlas loads (for debug) */
  getAtlasStatus(): Record<string, boolean> {
    return { ...this.atlasLoaded };
  }
}
