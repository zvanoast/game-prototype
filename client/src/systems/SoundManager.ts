import Phaser from "phaser";
import { ProceduralAudio } from "../audio/ProceduralAudio";

/**
 * Sound manager using Web Audio API with procedurally generated sounds.
 * Handles browser autoplay policy by resuming AudioContext on first user input.
 */
export class SoundManager {
  private scene: Phaser.Scene;
  private audioCtx: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private resumed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Create AudioContext
    this.audioCtx = new AudioContext();

    // Generate all sound buffers
    const gen = new ProceduralAudio(this.audioCtx);

    // Generic sounds (fallbacks)
    this.buffers.set("shoot", gen.generateShoot());
    this.buffers.set("melee_swing", gen.generateMeleeSwing());
    this.buffers.set("melee_hit", gen.generateMeleeHit());
    this.buffers.set("charged_shot", gen.generateChargedShot());
    this.buffers.set("dash", gen.generateDash());
    this.buffers.set("dash_strike", gen.generateDashStrike());
    this.buffers.set("impact", gen.generateImpact());
    this.buffers.set("death", gen.generateDeath());
    this.buffers.set("damage", gen.generateDamage());
    this.buffers.set("pickup", gen.generatePickup());
    this.buffers.set("locker_open", gen.generateLockerOpen());
    this.buffers.set("countdown_beep", gen.generateCountdownBeep());
    this.buffers.set("match_start", gen.generateMatchStart());

    // Per-weapon shoot sounds
    this.buffers.set("shoot_darts", gen.generateShoot_darts());
    this.buffers.set("shoot_plates", gen.generateShoot_plates());
    this.buffers.set("shoot_staple_gun", gen.generateShoot_staple_gun());
    this.buffers.set("shoot_vase", gen.generateShoot_vase());
    this.buffers.set("shoot_rubber_band_gun", gen.generateShoot_rubber_band_gun());

    // Per-weapon melee sounds
    this.buffers.set("melee_fists", gen.generateMelee_fists());
    this.buffers.set("melee_hammer", gen.generateMelee_hammer());
    this.buffers.set("melee_lamp", gen.generateMelee_lamp());
    this.buffers.set("melee_frying_pan", gen.generateMelee_frying_pan());
    this.buffers.set("melee_baseball_bat", gen.generateMelee_baseball_bat());
    this.buffers.set("melee_golf_club", gen.generateMelee_golf_club());

    // Consumable/buff sounds
    this.buffers.set("consumable_use", gen.generateConsumableUse());
    this.buffers.set("shield_hit", gen.generateShieldHit());
    this.buffers.set("buff_expired", gen.generateBuffExpired());

    // Handle browser autoplay policy
    const resumeAudio = () => {
      if (!this.resumed && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
        this.resumed = true;
      }
    };
    scene.input.on("pointerdown", resumeAudio);
    scene.input.keyboard?.on("keydown", resumeAudio);

    // Wire up scene events — generic
    scene.events.on("sfx:shoot", () => this.play("shoot", 0.4), this);
    scene.events.on("sfx:melee_hit", () => this.play("melee_hit", 0.5), this);
    scene.events.on("sfx:melee_swing", () => this.play("melee_swing", 0.3), this);
    scene.events.on("sfx:charged_shot", () => this.play("charged_shot", 0.5), this);
    scene.events.on("sfx:dash", () => this.play("dash", 0.3), this);
    scene.events.on("sfx:dash_strike", () => this.play("dash_strike", 0.4), this);
    scene.events.on("sfx:impact", () => this.play("impact", 0.3), this);
    scene.events.on("sfx:death", () => this.play("death", 0.5), this);
    scene.events.on("sfx:damage", () => this.play("damage", 0.3), this);
    scene.events.on("sfx:pickup", () => this.play("pickup", 0.4), this);
    scene.events.on("sfx:locker_open", () => this.play("locker_open", 0.4), this);
    scene.events.on("sfx:countdown_beep", () => this.play("countdown_beep", 0.4), this);
    scene.events.on("sfx:match_start", () => this.play("match_start", 0.5), this);

    // Weapon-specific shoot events (fall back to generic)
    scene.events.on("sfx:shoot_weapon", (weaponId: string) => {
      const key = `shoot_${weaponId}`;
      this.play(this.buffers.has(key) ? key : "shoot", 0.4);
    }, this);

    // Weapon-specific melee events (fall back to generic melee_swing)
    scene.events.on("sfx:melee_weapon", (weaponId: string) => {
      const key = `melee_${weaponId}`;
      this.play(this.buffers.has(key) ? key : "melee_swing", 0.3);
    }, this);

    // Consumable/buff events
    scene.events.on("sfx:consumable_use", () => this.play("consumable_use", 0.4), this);
    scene.events.on("sfx:shield_hit", () => this.play("shield_hit", 0.4), this);
    scene.events.on("sfx:buff_expired", () => this.play("buff_expired", 0.3), this);

    scene.events.once("shutdown", () => {
      scene.events.off("sfx:shoot", undefined, this);
      scene.events.off("sfx:melee_hit", undefined, this);
      scene.events.off("sfx:melee_swing", undefined, this);
      scene.events.off("sfx:charged_shot", undefined, this);
      scene.events.off("sfx:dash", undefined, this);
      scene.events.off("sfx:dash_strike", undefined, this);
      scene.events.off("sfx:impact", undefined, this);
      scene.events.off("sfx:death", undefined, this);
      scene.events.off("sfx:damage", undefined, this);
      scene.events.off("sfx:pickup", undefined, this);
      scene.events.off("sfx:locker_open", undefined, this);
      scene.events.off("sfx:countdown_beep", undefined, this);
      scene.events.off("sfx:match_start", undefined, this);
      scene.events.off("sfx:shoot_weapon", undefined, this);
      scene.events.off("sfx:melee_weapon", undefined, this);
      scene.events.off("sfx:consumable_use", undefined, this);
      scene.events.off("sfx:shield_hit", undefined, this);
      scene.events.off("sfx:buff_expired", undefined, this);
      this.audioCtx.close();
    });
  }

  private play(key: string, volume = 1) {
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    if (this.audioCtx.state === "suspended") return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const gain = this.audioCtx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.audioCtx.destination);
    source.start();
  }
}
