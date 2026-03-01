import Phaser from "phaser";
import { getWeaponConfig } from "shared";

export class WeaponHud {
  private meleeText: Phaser.GameObjects.Text;
  private rangedText: Phaser.GameObjects.Text;
  private lastMeleeId = "";
  private lastRangedId = "";

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    const centerX = cam.width / 2;
    const bottomY = cam.height - 16;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 6, y: 4 },
    };

    this.meleeText = scene.add.text(centerX - 80, bottomY, "[RMB] Fists", style);
    this.meleeText.setOrigin(1, 1);
    this.meleeText.setScrollFactor(0);
    this.meleeText.setDepth(800);

    this.rangedText = scene.add.text(centerX + 80, bottomY, "[LMB] --", style);
    this.rangedText.setOrigin(0, 1);
    this.rangedText.setScrollFactor(0);
    this.rangedText.setDepth(800);
  }

  update(meleeWeaponId: string, rangedWeaponId: string) {
    if (meleeWeaponId !== this.lastMeleeId) {
      this.lastMeleeId = meleeWeaponId;
      const config = getWeaponConfig(meleeWeaponId);
      this.meleeText.setText(`[RMB] ${config?.name ?? "Fists"}`);
    }

    if (rangedWeaponId !== this.lastRangedId) {
      this.lastRangedId = rangedWeaponId;
      if (!rangedWeaponId) {
        this.rangedText.setText("[LMB] --");
      } else {
        const config = getWeaponConfig(rangedWeaponId);
        this.rangedText.setText(`[LMB] ${config?.name ?? rangedWeaponId}`);
      }
    }
  }
}
