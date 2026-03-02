import Phaser from "phaser";

const STORAGE_KEY = "storage_wars_nickname";
const MAX_NICK_LENGTH = 16;

export class MenuScene extends Phaser.Scene {
  private nicknameInput: Phaser.GameObjects.DOMElement | null = null;
  private playButton!: Phaser.GameObjects.Text;
  private howToPlayPanel!: Phaser.GameObjects.Container;
  private howToPlayVisible = false;

  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Title
    this.add.text(centerX, 80, "STORAGE WARS", {
      fontSize: "48px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5);

    // Subtitle
    this.add.text(centerX, 120, "No Relation", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    }).setOrigin(0.5, 0.5);

    // Nickname label
    this.add.text(centerX, 190, "NICKNAME", {
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

    this.nicknameInput = this.add.dom(centerX, 220, inputEl);

    // Play button
    this.playButton = this.add.text(centerX, 290, "PLAY", {
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
    const howBtn = this.add.text(centerX, 350, "HOW TO PLAY", {
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
      "Hold LMB     Charged shot",
    ];

    const controlsText = this.add.text(0, 0, controls.join("\n"), {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
      lineSpacing: 6,
    });
    controlsText.setOrigin(0.5, 0.5);

    this.howToPlayPanel = this.add.container(centerX, 460, [panelBg, controlsText]);
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

    // Clean up DOM on scene shutdown
    this.events.on("shutdown", () => {
      if (this.nicknameInput) {
        this.nicknameInput.destroy();
        this.nicknameInput = null;
      }
    });
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

    this.scene.start("GameScene", { nickname });
  }

  private onTestMode() {
    // Clean up DOM input
    if (this.nicknameInput) {
      this.nicknameInput.destroy();
      this.nicknameInput = null;
    }
    this.scene.start("GameScene", { nickname: "Dev", testMode: true });
  }

  private toggleHowToPlay() {
    this.howToPlayVisible = !this.howToPlayVisible;
    this.howToPlayPanel.setVisible(this.howToPlayVisible);
  }

}
