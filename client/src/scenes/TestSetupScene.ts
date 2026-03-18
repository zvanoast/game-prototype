import Phaser from "phaser";
import { BOT_PERSONA_METAS } from "shared";
import type { BotPersonaMeta } from "shared";

const STORAGE_KEY_BOTS = "storage_wars_test_bots";

interface BotEntry {
  personaId: string;
  enabled: boolean;
}

/**
 * Test Mode setup menu. Allows configuring bots before entering sandbox.
 * Extensible — more options can be added below the bot section.
 */
export class TestSetupScene extends Phaser.Scene {
  private nickname = "";
  private characterIndex = 0;

  private botEntries: BotEntry[] = [];
  private botRows: Phaser.GameObjects.Container[] = [];
  private countLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TestSetupScene" });
  }

  init(data: { nickname?: string; characterIndex?: number } = {}) {
    this.nickname = data.nickname ?? "Dev";
    this.characterIndex = data.characterIndex ?? 0;
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    this.botRows = [];

    // Load saved bot config or default to all enabled
    const saved = localStorage.getItem(STORAGE_KEY_BOTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BotEntry[];
        // Merge with current persona list (handles additions/removals)
        this.botEntries = BOT_PERSONA_METAS.map(meta => {
          const existing = parsed.find(e => e.personaId === meta.id);
          return { personaId: meta.id, enabled: existing ? existing.enabled : true };
        });
      } catch {
        this.botEntries = BOT_PERSONA_METAS.map(m => ({ personaId: m.id, enabled: true }));
      }
    } else {
      this.botEntries = BOT_PERSONA_METAS.map(m => ({ personaId: m.id, enabled: true }));
    }

    // Title
    this.add.text(centerX, 40, "TEST MODE SETUP", {
      fontSize: "32px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5);

    // ─── Bot Configuration Section ───────────────────────────────────
    this.add.text(centerX, 85, "BOTS", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#cccccc",
    }).setOrigin(0.5, 0.5);

    // Bot count label
    this.countLabel = this.add.text(centerX, 108, "", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#888888",
    }).setOrigin(0.5, 0.5);

    // Bot persona rows
    const rowStartY = 135;
    const rowHeight = 44;

    for (let i = 0; i < BOT_PERSONA_METAS.length; i++) {
      const meta = BOT_PERSONA_METAS[i];
      const y = rowStartY + i * rowHeight;
      this.createBotRow(meta, i, centerX, y);
    }

    this.updateCountLabel();

    // Quick toggle buttons
    const toggleY = rowStartY + BOT_PERSONA_METAS.length * rowHeight + 10;

    const allBtn = this.add.text(centerX - 50, toggleY, "ALL", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#aaaaaa",
      backgroundColor: "#333348",
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    allBtn.on("pointerover", () => allBtn.setColor("#ffffff"));
    allBtn.on("pointerout", () => allBtn.setColor("#aaaaaa"));
    allBtn.on("pointerup", () => {
      this.botEntries.forEach(e => e.enabled = true);
      this.refreshAllRows();
    });

    const noneBtn = this.add.text(centerX + 50, toggleY, "NONE", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#aaaaaa",
      backgroundColor: "#333348",
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    noneBtn.on("pointerover", () => noneBtn.setColor("#ffffff"));
    noneBtn.on("pointerout", () => noneBtn.setColor("#aaaaaa"));
    noneBtn.on("pointerup", () => {
      this.botEntries.forEach(e => e.enabled = false);
      this.refreshAllRows();
    });

    // ─── Start / Back Buttons ────────────────────────────────────────
    const btnY = toggleY + 50;

    const startBtn = this.add.text(centerX, btnY, "START", {
      fontSize: "24px",
      fontFamily: "monospace",
      color: "#000000",
      backgroundColor: "#ffcc00",
      padding: { x: 36, y: 8 },
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });

    startBtn.on("pointerover", () => startBtn.setStyle({ backgroundColor: "#ffdd44", color: "#000000" }));
    startBtn.on("pointerout", () => startBtn.setStyle({ backgroundColor: "#ffcc00", color: "#000000" }));
    startBtn.on("pointerdown", () => startBtn.setStyle({ backgroundColor: "#cc9900", color: "#000000" }));
    startBtn.on("pointerup", () => this.onStart());

    const backBtn = this.add.text(centerX, btnY + 50, "BACK", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#ffffff"));
    backBtn.on("pointerout", () => backBtn.setColor("#aaaaaa"));
    backBtn.on("pointerup", () => this.scene.start("MenuScene"));

    // ESC to go back
    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.start("MenuScene");
    });

    // Enter to start
    this.input.keyboard!.on("keydown-ENTER", () => {
      this.onStart();
    });
  }

  private createBotRow(meta: BotPersonaMeta, index: number, centerX: number, y: number) {
    const entry = this.botEntries[index];
    const rowW = 320;
    const leftX = centerX - rowW / 2;

    // Background
    const bg = this.add.rectangle(centerX, y, rowW, 38, 0x000000, 0.4);
    bg.setStrokeStyle(1, 0x444466);

    // Character preview
    const previewKey = `char_preview_${meta.characterIndex}`;
    let preview: Phaser.GameObjects.Sprite | null = null;
    if (this.textures.exists(previewKey)) {
      preview = this.add.sprite(leftX + 22, y, previewKey);
      preview.setDisplaySize(28, 28).setOrigin(0.5, 0.5);
    }

    // Name
    const nameText = this.add.text(leftX + 44, y - 6, meta.name, {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#ffffff",
    }).setOrigin(0, 0.5);

    // Description
    const descText = this.add.text(leftX + 44, y + 10, meta.description, {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#888888",
    }).setOrigin(0, 0.5);

    // Toggle button
    const toggleText = entry.enabled ? "ON" : "OFF";
    const toggleColor = entry.enabled ? "#44ff44" : "#ff4444";
    const toggle = this.add.text(centerX + rowW / 2 - 16, y, toggleText, {
      fontSize: "13px",
      fontFamily: "monospace",
      color: toggleColor,
      fontStyle: "bold",
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

    toggle.on("pointerup", () => {
      entry.enabled = !entry.enabled;
      toggle.setText(entry.enabled ? "ON" : "OFF");
      toggle.setColor(entry.enabled ? "#44ff44" : "#ff4444");
      this.updateRowVisuals(index, entry.enabled, nameText, descText, preview);
      this.updateCountLabel();
      this.saveBotConfig();
    });

    // Make entire row clickable
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerup", () => {
      entry.enabled = !entry.enabled;
      toggle.setText(entry.enabled ? "ON" : "OFF");
      toggle.setColor(entry.enabled ? "#44ff44" : "#ff4444");
      this.updateRowVisuals(index, entry.enabled, nameText, descText, preview);
      this.updateCountLabel();
      this.saveBotConfig();
    });

    // Apply initial visual state
    this.updateRowVisuals(index, entry.enabled, nameText, descText, preview);

    // Store references for ALL/NONE refresh
    this.botRows.push(
      this.add.container(0, 0, []).setData("toggle", toggle)
        .setData("name", nameText)
        .setData("desc", descText)
        .setData("preview", preview)
        .setData("index", index)
    );
  }

  private updateRowVisuals(
    _index: number,
    enabled: boolean,
    nameText: Phaser.GameObjects.Text,
    descText: Phaser.GameObjects.Text,
    preview: Phaser.GameObjects.Sprite | null,
  ) {
    nameText.setAlpha(enabled ? 1 : 0.4);
    descText.setAlpha(enabled ? 1 : 0.4);
    if (preview) preview.setAlpha(enabled ? 1 : 0.3);
  }

  private refreshAllRows() {
    for (const row of this.botRows) {
      const idx = row.getData("index") as number;
      const entry = this.botEntries[idx];
      const toggle = row.getData("toggle") as Phaser.GameObjects.Text;
      const nameText = row.getData("name") as Phaser.GameObjects.Text;
      const descText = row.getData("desc") as Phaser.GameObjects.Text;
      const preview = row.getData("preview") as Phaser.GameObjects.Sprite | null;

      toggle.setText(entry.enabled ? "ON" : "OFF");
      toggle.setColor(entry.enabled ? "#44ff44" : "#ff4444");
      this.updateRowVisuals(idx, entry.enabled, nameText, descText, preview);
    }
    this.updateCountLabel();
    this.saveBotConfig();
  }

  private updateCountLabel() {
    const count = this.botEntries.filter(e => e.enabled).length;
    this.countLabel.setText(`${count} bot${count !== 1 ? "s" : ""} selected`);
  }

  private saveBotConfig() {
    localStorage.setItem(STORAGE_KEY_BOTS, JSON.stringify(this.botEntries));
  }

  private onStart() {
    this.saveBotConfig();

    const enabledPersonas = this.botEntries
      .filter(e => e.enabled)
      .map(e => e.personaId);

    this.scene.start("GameScene", {
      nickname: this.nickname,
      testMode: true,
      characterIndex: this.characterIndex,
      botPersonas: enabledPersonas,
    });
  }
}
