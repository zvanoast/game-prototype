import Phaser from "phaser";

interface KillFeedEntry {
  text: Phaser.GameObjects.Text;
  timer: number; // ms remaining
}

const KILL_FEED_MAX = 5;
const KILL_FEED_DURATION_MS = 5000;

export class MatchHud {
  private scene: Phaser.Scene;

  // Phase banner (top-center)
  private phaseBanner: Phaser.GameObjects.Text;

  // Countdown overlay (large centered text)
  private countdownText: Phaser.GameObjects.Text;

  // Eliminated overlay
  private eliminatedText: Phaser.GameObjects.Text;

  // Victory/Defeat overlay
  private resultText: Phaser.GameObjects.Text;

  // Alive count (top-center, below banner)
  private aliveText: Phaser.GameObjects.Text;

  // Kill feed (top-right)
  private killFeedEntries: KillFeedEntry[] = [];
  private killFeedContainer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const centerX = scene.cameras.main.width / 2;
    const centerY = scene.cameras.main.height / 2;

    // Phase banner — top center
    this.phaseBanner = scene.add.text(centerX, 20, "", {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 12, y: 6 },
    });
    this.phaseBanner.setOrigin(0.5, 0);
    this.phaseBanner.setScrollFactor(0);
    this.phaseBanner.setDepth(900);

    // Alive count — below banner
    this.aliveText = scene.add.text(centerX, 52, "", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#cccccc",
      backgroundColor: "#000000aa",
      padding: { x: 8, y: 4 },
    });
    this.aliveText.setOrigin(0.5, 0);
    this.aliveText.setScrollFactor(0);
    this.aliveText.setDepth(900);
    this.aliveText.setVisible(false);

    // Countdown — large centered text
    this.countdownText = scene.add.text(centerX, centerY - 40, "", {
      fontSize: "64px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    });
    this.countdownText.setOrigin(0.5, 0.5);
    this.countdownText.setScrollFactor(0);
    this.countdownText.setDepth(950);
    this.countdownText.setVisible(false);

    // Eliminated overlay
    this.eliminatedText = scene.add.text(centerX, centerY + 40, "YOU WERE ELIMINATED\n(Spectating)", {
      fontSize: "24px",
      fontFamily: "monospace",
      color: "#ff4444",
      backgroundColor: "#000000cc",
      padding: { x: 16, y: 12 },
      align: "center",
    });
    this.eliminatedText.setOrigin(0.5, 0.5);
    this.eliminatedText.setScrollFactor(0);
    this.eliminatedText.setDepth(950);
    this.eliminatedText.setVisible(false);

    // Victory/Defeat overlay
    this.resultText = scene.add.text(centerX, centerY, "", {
      fontSize: "48px",
      fontFamily: "monospace",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.resultText.setOrigin(0.5, 0.5);
    this.resultText.setScrollFactor(0);
    this.resultText.setDepth(960);
    this.resultText.setVisible(false);

    // Kill feed container (top-right)
    this.killFeedContainer = scene.add.container(scene.cameras.main.width - 10, 10);
    this.killFeedContainer.setScrollFactor(0);
    this.killFeedContainer.setDepth(900);
  }

  update(
    phase: string,
    alivePlayers: number,
    totalPlayers: number,
    isEliminated: boolean,
    isWinner: boolean | null,
    countdownSeconds: number,
    delta: number
  ) {
    // Phase banner
    switch (phase) {
      case "waiting":
        this.phaseBanner.setText("Waiting for players...");
        this.phaseBanner.setVisible(true);
        this.aliveText.setVisible(false);
        this.countdownText.setVisible(false);
        this.eliminatedText.setVisible(false);
        this.resultText.setVisible(false);
        break;

      case "countdown":
        this.phaseBanner.setText("Match starting...");
        this.phaseBanner.setVisible(true);
        this.aliveText.setVisible(false);
        this.eliminatedText.setVisible(false);
        this.resultText.setVisible(false);

        if (countdownSeconds > 0) {
          this.countdownText.setText(`${countdownSeconds}`);
          this.countdownText.setVisible(true);
        } else {
          this.countdownText.setText("FIGHT!");
          this.countdownText.setVisible(true);
        }
        break;

      case "playing":
        this.phaseBanner.setText(`${alivePlayers} players alive`);
        this.phaseBanner.setVisible(true);
        this.aliveText.setText(`Alive: ${alivePlayers} / ${totalPlayers}`);
        this.aliveText.setVisible(true);
        this.countdownText.setVisible(false);

        // Eliminated overlay
        this.eliminatedText.setVisible(isEliminated);

        this.resultText.setVisible(false);
        break;

      case "ended":
        this.phaseBanner.setText("Match Over");
        this.phaseBanner.setVisible(true);
        this.aliveText.setVisible(false);
        this.countdownText.setVisible(false);
        this.eliminatedText.setVisible(false);

        if (isWinner === true) {
          this.resultText.setText("VICTORY!");
          this.resultText.setStyle({ color: "#ffcc00" });
          this.resultText.setVisible(true);
        } else if (isWinner === false) {
          this.resultText.setText("DEFEAT");
          this.resultText.setStyle({ color: "#ff4444" });
          this.resultText.setVisible(true);
        } else {
          // Draw
          this.resultText.setText("DRAW");
          this.resultText.setStyle({ color: "#aaaaaa" });
          this.resultText.setVisible(true);
        }
        break;
    }

    // Tick kill feed timers
    this.tickKillFeed(delta);
  }

  showKillFeed(killerName: string, victimName: string, weaponName: string) {
    const text = this.scene.add.text(0, 0,
      `${killerName} [${weaponName}] ${victimName}`, {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 6, y: 3 },
    });
    text.setOrigin(1, 0); // right-aligned

    this.killFeedEntries.push({ text, timer: KILL_FEED_DURATION_MS });
    this.killFeedContainer.add(text);

    // Trim to max
    while (this.killFeedEntries.length > KILL_FEED_MAX) {
      const removed = this.killFeedEntries.shift()!;
      removed.text.destroy();
    }

    // Reposition
    this.repositionKillFeed();
  }

  /** Hide all overlays (for match reset) */
  reset() {
    this.phaseBanner.setVisible(false);
    this.aliveText.setVisible(false);
    this.countdownText.setVisible(false);
    this.eliminatedText.setVisible(false);
    this.resultText.setVisible(false);
  }

  private tickKillFeed(delta: number) {
    const toRemove: number[] = [];

    for (let i = 0; i < this.killFeedEntries.length; i++) {
      const entry = this.killFeedEntries[i];
      entry.timer -= delta;

      // Fade out in last 1 second
      if (entry.timer < 1000) {
        entry.text.setAlpha(entry.timer / 1000);
      }

      if (entry.timer <= 0) {
        toRemove.push(i);
      }
    }

    // Remove expired (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const entry = this.killFeedEntries[idx];
      entry.text.destroy();
      this.killFeedEntries.splice(idx, 1);
    }

    if (toRemove.length > 0) {
      this.repositionKillFeed();
    }
  }

  private repositionKillFeed() {
    for (let i = 0; i < this.killFeedEntries.length; i++) {
      this.killFeedEntries[i].text.setPosition(0, i * 22);
    }
  }
}
