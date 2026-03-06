import Phaser from "phaser";
import { getWeaponConfig, getConsumableConfig, MAX_HEALTH } from "shared";

const BAR_WIDTH = 200;
const BAR_HEIGHT = 14;
const SHIELD_HEIGHT = 6;
const BAR_GAP = 2;
const HUD_DEPTH = 800;

/** Vertical offset from top of screen to health bar (below test-mode label) */
const TOP_MARGIN = 40;

export class WeaponHud {
  private scene: Phaser.Scene;
  private barGraphics: Phaser.GameObjects.Graphics;
  private meleeText: Phaser.GameObjects.Text;
  private rangedText: Phaser.GameObjects.Text;
  private consumableText: Phaser.GameObjects.Text;
  private healthLabel: Phaser.GameObjects.Text;
  private lastMeleeId = "";
  private lastRangedId = "";
  private lastConsumable1 = "";
  private lastConsumable2 = "";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cam = scene.cameras.main;
    const centerX = cam.width / 2;
    const bottomY = cam.height - 16;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 6, y: 4 },
    };

    // Health/shield bar graphics (drawn every frame, top of screen)
    this.barGraphics = scene.add.graphics();
    this.barGraphics.setScrollFactor(0);
    this.barGraphics.setDepth(HUD_DEPTH);

    // Health text label (overlaid on bar)
    this.healthLabel = scene.add.text(centerX, TOP_MARGIN + BAR_HEIGHT / 2, "", {
      fontSize: "11px",
      fontFamily: "monospace",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.healthLabel.setOrigin(0.5, 0.5);
    this.healthLabel.setScrollFactor(0);
    this.healthLabel.setDepth(HUD_DEPTH + 1);

    // Consumable text (above weapon texts at bottom)
    this.consumableText = scene.add.text(centerX, bottomY - 48, "", style);
    this.consumableText.setOrigin(0.5, 1);
    this.consumableText.setScrollFactor(0);
    this.consumableText.setDepth(HUD_DEPTH);

    // Weapon texts at the bottom (name + stats on two lines)
    this.rangedText = scene.add.text(centerX - 6, bottomY, "[LMB] --", style);
    this.rangedText.setOrigin(1, 1);
    this.rangedText.setScrollFactor(0);
    this.rangedText.setDepth(HUD_DEPTH);

    this.meleeText = scene.add.text(centerX + 6, bottomY, "[RMB] Fists", style);
    this.meleeText.setOrigin(0, 1);
    this.meleeText.setScrollFactor(0);
    this.meleeText.setDepth(HUD_DEPTH);
  }

  update(
    meleeWeaponId: string,
    rangedWeaponId: string,
    consumable1 = "",
    consumable2 = "",
    health = MAX_HEALTH,
    shieldHp = 0
  ) {
    const cam = this.scene.cameras.main;
    const centerX = cam.width / 2;

    // Draw health + shield bars at top of screen
    this.drawBars(centerX, TOP_MARGIN, health, shieldHp);

    // Update weapon names + stats (combined into one text each)
    if (meleeWeaponId !== this.lastMeleeId) {
      this.lastMeleeId = meleeWeaponId;
      const config = getWeaponConfig(meleeWeaponId);
      const name = config?.name ?? "Fists";
      if (config) {
        const dmg = config.meleeDamage ?? 0;
        const cd = config.meleeCooldownMs ?? 0;
        this.meleeText.setText(`[RMB] ${name}\n ${dmg}dmg ${cd}ms`);
      } else {
        this.meleeText.setText(`[RMB] ${name}`);
      }
    }

    if (rangedWeaponId !== this.lastRangedId) {
      this.lastRangedId = rangedWeaponId;
      if (!rangedWeaponId) {
        this.rangedText.setText("[LMB] --");
      } else {
        const config = getWeaponConfig(rangedWeaponId);
        const name = config?.name ?? rangedWeaponId;
        if (config) {
          const dmg = config.damage ?? 0;
          const rate = config.fireRateMs ?? 0;
          this.rangedText.setText(`[LMB] ${name}\n ${dmg}dmg ${rate}ms`);
        } else {
          this.rangedText.setText(`[LMB] ${name}`);
        }
      }
    }

    if (consumable1 !== this.lastConsumable1 || consumable2 !== this.lastConsumable2) {
      this.lastConsumable1 = consumable1;
      this.lastConsumable2 = consumable2;

      const name1 = consumable1 ? (getConsumableConfig(consumable1)?.name ?? consumable1) : "--";
      const name2 = consumable2 ? (getConsumableConfig(consumable2)?.name ?? consumable2) : "--";

      if (!consumable1 && !consumable2) {
        this.consumableText.setText("");
      } else {
        this.consumableText.setText(`[Q] ${name1}  |  ${name2}`);
      }
    }
  }

  private drawBars(cx: number, barY: number, health: number, shieldHp: number) {
    const g = this.barGraphics;
    g.clear();

    const barX = cx - BAR_WIDTH / 2;

    // Background
    g.fillStyle(0x000000, 0.6);
    g.fillRect(barX - 1, barY - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);

    // Health fill
    const hpRatio = Math.max(0, Math.min(1, health / MAX_HEALTH));
    let hpColor = 0x00ff00;
    if (hpRatio <= 0.25) hpColor = 0xff0000;
    else if (hpRatio <= 0.5) hpColor = 0xffff00;

    g.fillStyle(hpColor, 0.9);
    g.fillRect(barX, barY, BAR_WIDTH * hpRatio, BAR_HEIGHT);

    // Health text
    this.healthLabel.setPosition(cx, barY + BAR_HEIGHT / 2);
    this.healthLabel.setText(`${Math.max(0, health)} / ${MAX_HEALTH}`);

    // Shield bar (above health bar)
    if (shieldHp > 0) {
      const shieldY = barY - SHIELD_HEIGHT - BAR_GAP;
      const shieldRatio = Math.min(1, shieldHp / 40);

      g.fillStyle(0x000000, 0.6);
      g.fillRect(barX - 1, shieldY - 1, BAR_WIDTH + 2, SHIELD_HEIGHT + 2);

      g.fillStyle(0xdd88ff, 0.9);
      g.fillRect(barX, shieldY, BAR_WIDTH * shieldRatio, SHIELD_HEIGHT);
    }
  }
}
