import Phaser from "phaser";
import { CHARACTER_DEFS } from "./BootScene";

const STORAGE_KEY = "storage_wars_nickname";
const CHAR_STORAGE_KEY = "storage_wars_character";
const MAX_NICK_LENGTH = 16;
const TAKEN_POLL_MS = 2000;

export class MenuScene extends Phaser.Scene {
  private nicknameInput: Phaser.GameObjects.DOMElement | null = null;
  private playButton!: Phaser.GameObjects.Text;
  private howToPlayPanel!: Phaser.GameObjects.Container;
  private howToPlayVisible = false;
  private selectedCharIndex = 0;
  private charHighlight!: Phaser.GameObjects.Graphics;
  private charNameLabel!: Phaser.GameObjects.Text;

  // Character picker sprites + layout params (for updating taken state)
  private charSprites: Phaser.GameObjects.Sprite[] = [];
  private charStartX = 0;
  private charY = 0;
  private charPreviewSize = 48;
  private charGap = 6;
  private takenSet = new Set<number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Lobby panel
  private lobbyPlayers: { name: string; characterIndex: number }[] = [];
  private lobbyPhase = "waiting";
  private lobbyContainer!: Phaser.GameObjects.Container;
  private lobbyCountText!: Phaser.GameObjects.Text;
  private lobbyBg!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    const centerX = this.cameras.main.width / 2;

    // Restore saved character selection
    const savedCharIdx = parseInt(localStorage.getItem(CHAR_STORAGE_KEY) ?? "0", 10);
    this.selectedCharIndex = (savedCharIdx >= 0 && savedCharIdx < CHARACTER_DEFS.length)
      ? savedCharIdx : 0;

    // Reset per-scene state
    this.charSprites = [];
    this.takenSet.clear();

    // Title
    this.add.text(centerX, 60, "STORAGE WARS", {
      fontSize: "48px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5);

    // Subtitle
    this.add.text(centerX, 96, "No Relation", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    }).setOrigin(0.5, 0.5);

    // Nickname label
    this.add.text(centerX, 145, "NICKNAME", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#cccccc",
    }).setOrigin(0.5, 0.5);

    // DOM input for nickname
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    const inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.maxLength = MAX_NICK_LENGTH;
    inputEl.value = saved;
    inputEl.placeholder = "Enter name...";
    inputEl.style.cssText = [
      "width: 200px",
      "padding: 8px 12px",
      "font-size: 16px",
      "font-family: monospace",
      "text-align: center",
      "background: #2a2a3e",
      "color: #ffffff",
      "border: 2px solid #555577",
      "border-radius: 4px",
      "outline: none",
    ].join(";");
    inputEl.addEventListener("focus", () => {
      inputEl.style.borderColor = "#ffcc00";
    });
    inputEl.addEventListener("blur", () => {
      inputEl.style.borderColor = "#555577";
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.onPlay();
      }
    });

    this.nicknameInput = this.add.dom(centerX, 175, inputEl);

    // ─── Character selection ────────────────────────────────────────────
    this.add.text(centerX, 220, "CHARACTER", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#cccccc",
    }).setOrigin(0.5, 0.5);

    const previewSize = this.charPreviewSize;
    const gap = this.charGap;
    const totalWidth = CHARACTER_DEFS.length * previewSize + (CHARACTER_DEFS.length - 1) * gap;
    const startX = centerX - totalWidth / 2 + previewSize / 2;
    const charY = 260;
    this.charStartX = startX;
    this.charY = charY;

    // Yellow highlight border (drawn behind the selected character)
    this.charHighlight = this.add.graphics();
    this.charHighlight.setDepth(0);

    // Character name label below the row
    this.charNameLabel = this.add.text(centerX, charY + previewSize / 2 + 14, "", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#ffcc00",
    }).setOrigin(0.5, 0.5);

    for (let i = 0; i < CHARACTER_DEFS.length; i++) {
      const px = startX + i * (previewSize + gap);
      const texKey = `char_preview_${i}`;
      if (!this.textures.exists(texKey)) {
        this.charSprites.push(null as any); // placeholder to keep index alignment
        continue;
      }

      const sprite = this.add.sprite(px, charY, texKey);
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(1);
      sprite.setInteractive({ useHandCursor: true });

      sprite.on("pointerup", () => {
        if (this.takenSet.has(i)) return; // can't select taken characters
        this.selectedCharIndex = i;
        localStorage.setItem(CHAR_STORAGE_KEY, String(i));
        this.refreshCharacterRow();
      });

      sprite.on("pointerover", () => {
        if (this.takenSet.has(i)) return;
        if (i !== this.selectedCharIndex) {
          sprite.setAlpha(0.8);
        }
      });
      sprite.on("pointerout", () => {
        if (this.takenSet.has(i)) return;
        sprite.setAlpha(1);
      });

      this.charSprites.push(sprite);
    }

    // Draw initial highlight
    this.refreshCharacterRow();

    // ─── Play button ────────────────────────────────────────────────────
    this.playButton = this.add.text(centerX, 340, "PLAY", {
      fontSize: "28px",
      fontFamily: "monospace",
      color: "#000000",
      backgroundColor: "#ffcc00",
      padding: { x: 40, y: 10 },
      fontStyle: "bold",
    });
    this.playButton.setOrigin(0.5, 0.5);
    this.playButton.setInteractive({ useHandCursor: true });

    this.playButton.on("pointerover", () => {
      this.playButton.setStyle({ backgroundColor: "#ffdd44", color: "#000000" });
    });
    this.playButton.on("pointerout", () => {
      this.playButton.setStyle({ backgroundColor: "#ffcc00", color: "#000000" });
    });
    this.playButton.on("pointerdown", () => {
      this.playButton.setStyle({ backgroundColor: "#cc9900", color: "#000000" });
    });
    this.playButton.on("pointerup", () => {
      this.onPlay();
    });

    // How to Play toggle button
    const howBtn = this.add.text(centerX, 400, "HOW TO PLAY", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    });
    howBtn.setOrigin(0.5, 0.5);
    howBtn.setInteractive({ useHandCursor: true });
    howBtn.on("pointerover", () => howBtn.setColor("#ffffff"));
    howBtn.on("pointerout", () => howBtn.setColor("#aaaaaa"));
    howBtn.on("pointerup", () => this.toggleHowToPlay());

    // How to Play panel (hidden by default)
    const panelBg = this.add.rectangle(0, 0, 340, 180, 0x000000, 0.85);
    panelBg.setStrokeStyle(1, 0x555577);

    const controls = [
      "WASD         Move",
      "LMB          Shoot",
      "RMB          Melee",
      "E            Interact (lockers)",
      "SPACE        Dash",
    ];

    const controlsText = this.add.text(0, 0, controls.join("\n"), {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
      lineSpacing: 6,
    });
    controlsText.setOrigin(0.5, 0.5);

    this.howToPlayPanel = this.add.container(centerX, 510, [panelBg, controlsText]);
    this.howToPlayPanel.setVisible(false);

    // Test Mode button (small, bottom-right)
    const testBtn = this.add.text(this.cameras.main.width - 16, this.cameras.main.height - 20, "TEST MODE", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#666666",
    });
    testBtn.setOrigin(1, 0.5);
    testBtn.setInteractive({ useHandCursor: true });
    testBtn.on("pointerover", () => testBtn.setColor("#ffcc00"));
    testBtn.on("pointerout", () => testBtn.setColor("#666666"));
    testBtn.on("pointerup", () => this.onTestMode());

    // Version/footer
    this.add.text(centerX, this.cameras.main.height - 20, "Prototype Build", {
      fontSize: "11px",
      fontFamily: "monospace",
      color: "#555555",
    }).setOrigin(0.5, 0.5);

    // ─── Lobby panel (right side) ───────────────────────────────────────
    const lobbyX = 660;
    const lobbyY = 60;
    const lobbyW = 160;

    this.lobbyBg = this.add.rectangle(lobbyX, lobbyY, lobbyW, 50, 0x000000, 0.6);
    this.lobbyBg.setOrigin(0.5, 0);
    this.lobbyBg.setStrokeStyle(1, 0x555577);

    this.add.text(lobbyX, lobbyY, "IN GAME", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5);

    this.lobbyCountText = this.add.text(lobbyX, lobbyY + 22, "No players yet", {
      fontSize: "11px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    }).setOrigin(0.5, 0.5);

    this.lobbyContainer = this.add.container(lobbyX - lobbyW / 2 + 10, lobbyY + 44);

    // Fetch taken characters immediately, then poll
    this.fetchTakenCharacters();
    this.pollTimer = setInterval(() => this.fetchTakenCharacters(), TAKEN_POLL_MS);

    // Clean up DOM + poll timer on scene shutdown
    this.events.on("shutdown", () => {
      if (this.nicknameInput) {
        this.nicknameInput.destroy();
        this.nicknameInput = null;
      }
      if (this.pollTimer !== null) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    });
  }

  // ─── Taken character polling ──────────────────────────────────────────

  private async fetchTakenCharacters() {
    try {
      const isDev = window.location.port === "5173" || window.location.hostname === "localhost";
      const apiBase = isDev ? "http://localhost:3001" : "";
      const resp = await fetch(`${apiBase}/api/taken-characters`);
      const data = await resp.json();
      const arr: number[] = Array.isArray(data.taken) ? data.taken : [];
      this.takenSet = new Set(arr);
      this.lobbyPlayers = Array.isArray(data.players) ? data.players : [];
      this.lobbyPhase = typeof data.phase === "string" ? data.phase : "waiting";
    } catch {
      // Server unreachable — treat all as available
      this.takenSet.clear();
      this.lobbyPlayers = [];
      this.lobbyPhase = "waiting";
    }
    this.refreshCharacterRow();
    this.refreshLobbyPanel();
  }

  // ─── Character row rendering ──────────────────────────────────────────

  private refreshCharacterRow() {
    // If current selection is taken, auto-select first available
    if (this.takenSet.has(this.selectedCharIndex)) {
      for (let i = 0; i < CHARACTER_DEFS.length; i++) {
        if (!this.takenSet.has(i)) {
          this.selectedCharIndex = i;
          localStorage.setItem(CHAR_STORAGE_KEY, String(i));
          break;
        }
      }
    }

    // Update sprite appearances
    for (let i = 0; i < this.charSprites.length; i++) {
      const sprite = this.charSprites[i];
      if (!sprite) continue;

      if (this.takenSet.has(i)) {
        // Taken: grayed out, semi-transparent, no hand cursor
        sprite.setTint(0x444444);
        sprite.setAlpha(0.4);
        sprite.disableInteractive();
        sprite.setInteractive({ useHandCursor: false });
      } else {
        // Available: full color
        sprite.clearTint();
        sprite.setAlpha(1);
        sprite.disableInteractive();
        sprite.setInteractive({ useHandCursor: true });
      }
    }

    // Redraw highlight on selected character
    this.charHighlight.clear();
    if (!this.takenSet.has(this.selectedCharIndex)) {
      const px = this.charStartX + this.selectedCharIndex * (this.charPreviewSize + this.charGap);
      const half = this.charPreviewSize / 2 + 3;
      this.charHighlight.lineStyle(2, 0xffcc00, 1);
      this.charHighlight.strokeRect(px - half, this.charY - half, half * 2, half * 2);
    }
    this.charNameLabel.setText(CHARACTER_DEFS[this.selectedCharIndex].name);
  }

  private refreshLobbyPanel() {
    this.lobbyContainer.removeAll(true);

    const count = this.lobbyPlayers.length;
    if (this.lobbyPhase === "playing" || this.lobbyPhase === "ended") {
      this.lobbyCountText.setText("Match in progress");
    } else if (count === 0) {
      this.lobbyCountText.setText("No players yet");
    } else {
      this.lobbyCountText.setText(`${count} player${count > 1 ? "s" : ""} waiting`);
    }

    for (let i = 0; i < this.lobbyPlayers.length; i++) {
      const p = this.lobbyPlayers[i];
      const y = i * 30;

      const texKey = `char_preview_${p.characterIndex}`;
      if (this.textures.exists(texKey)) {
        const icon = this.add.sprite(12, y, texKey).setDisplaySize(24, 24).setOrigin(0.5, 0.5);
        this.lobbyContainer.add(icon);
      }

      const name = this.add.text(28, y, p.name, {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#cccccc",
      }).setOrigin(0, 0.5);
      this.lobbyContainer.add(name);
    }

    // Resize background to fit content: header (22px) + count text (22px) + player rows
    const contentH = 44 + Math.max(count, 0) * 30 + 10;
    this.lobbyBg.setSize(this.lobbyBg.width, contentH);
  }

  private onPlay() {
    if (!this.nicknameInput) return;
    const inputEl = this.nicknameInput.node as HTMLInputElement;
    const nickname = inputEl.value.trim().substring(0, MAX_NICK_LENGTH);

    // Save to localStorage (even if empty — will get server fallback)
    localStorage.setItem(STORAGE_KEY, nickname);

    // Destroy DOM element before scene transition
    this.nicknameInput.destroy();
    this.nicknameInput = null;

    this.scene.start("GameScene", { nickname, characterIndex: this.selectedCharIndex });
  }

  private onTestMode() {
    // Clean up DOM input
    if (this.nicknameInput) {
      this.nicknameInput.destroy();
      this.nicknameInput = null;
    }
    this.scene.start("GameScene", { nickname: "Dev", testMode: true, characterIndex: this.selectedCharIndex });
  }

  private toggleHowToPlay() {
    this.howToPlayVisible = !this.howToPlayVisible;
    this.howToPlayPanel.setVisible(this.howToPlayVisible);
  }

}
