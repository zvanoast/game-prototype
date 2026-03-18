import Phaser from "phaser";
import { Room } from "colyseus.js";
import { NetworkManager } from "../network/NetworkManager";
import { CHARACTER_DEFS } from "./BootScene";
import { BOT_PERSONA_METAS, BOT_SESSION_PREFIX } from "shared";

const CHAT_MAX_DISPLAY = 12;
const INPUT_STYLE = [
  "width: 280px",
  "padding: 6px 10px",
  "font-size: 13px",
  "font-family: monospace",
  "background: #1a1a2e",
  "color: #ffffff",
  "border: 1px solid #555577",
  "border-radius: 3px",
  "outline: none",
].join(";");

interface ChatMsg {
  senderName: string;
  senderId: string;
  text: string;
}

export class LobbyScene extends Phaser.Scene {
  private network!: NetworkManager;
  private room: Room | null = null;

  // Data from MenuScene
  private nickname = "";
  private characterIndex = 0;

  // State
  private isHost = false;
  private localSessionId = "";
  private chatMessages: ChatMsg[] = [];

  // UI elements
  private playerListContainer!: Phaser.GameObjects.Container;
  private scoreboardContainer!: Phaser.GameObjects.Container;
  private chatContainer!: Phaser.GameObjects.Container;
  private chatInputDom: Phaser.GameObjects.DOMElement | null = null;
  private startButton: Phaser.GameObjects.Text | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private botButtonContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "LobbyScene" });
  }

  // Pre-connected room (from GameScene returning to lobby)
  private existingRoom: any = null;

  init(data: { nickname?: string; characterIndex?: number; existingRoom?: any } = {}) {
    this.nickname = data.nickname ?? "";
    this.characterIndex = data.characterIndex ?? 0;
    this.existingRoom = data.existingRoom ?? null;
    this.chatMessages = [];
    this.isHost = false;
    this.room = null;
  }

  create() {
    const w = this.cameras.main.width;  // 800
    const h = this.cameras.main.height; // 600

    // Title
    this.add.text(w / 2, 24, "LOBBY", {
      fontSize: "32px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5);

    // ─── Left column: Player list (x: 10–210) ───────────────────────────
    this.add.text(20, 55, "PLAYERS", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
    });

    this.add.rectangle(110, 220, 200, 280, 0x000000, 0.5)
      .setStrokeStyle(1, 0x555577);

    this.playerListContainer = this.add.container(20, 78);

    // ─── Middle column: Scoreboard (x: 220–530) ─────────────────────────
    this.add.text(230, 55, "SCOREBOARD", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
    });

    this.add.rectangle(375, 220, 310, 280, 0x000000, 0.5)
      .setStrokeStyle(1, 0x555577);

    this.scoreboardContainer = this.add.container(230, 78);

    // ─── Right column: Chat (x: 545–790) ────────────────────────────────
    this.add.text(555, 55, "CHAT", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
    });

    this.add.rectangle(668, 220, 245, 280, 0x000000, 0.5)
      .setStrokeStyle(1, 0x555577);

    this.chatContainer = this.add.container(555, 78);

    // Chat input (DOM)
    const chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.maxLength = 200;
    chatInput.placeholder = "Type a message...";
    chatInput.style.cssText = INPUT_STYLE.replace("width: 280px", "width: 220px");
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = chatInput.value.trim();
        if (text && this.room) {
          this.room.send("chat", { text });
          chatInput.value = "";
        }
      }
      e.stopPropagation();
    });

    this.chatInputDom = this.add.dom(668, 375, chatInput);

    // ─── Bottom bar ─────────────────────────────────────────────────────

    // Bot controls (host only)
    this.add.text(20, 420, "ADD BOTS", {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#cccccc",
    });

    this.botButtonContainer = this.add.container(20, 445);
    this.buildBotButtons();

    // Start button (host only)
    this.startButton = this.add.text(w / 2, 540, "START MATCH", {
      fontSize: "24px",
      fontFamily: "monospace",
      color: "#000000",
      backgroundColor: "#ffcc00",
      padding: { x: 30, y: 8 },
      fontStyle: "bold",
    });
    this.startButton.setOrigin(0.5, 0.5);
    this.startButton.setInteractive({ useHandCursor: true });
    this.startButton.on("pointerover", () => {
      this.startButton?.setStyle({ backgroundColor: "#ffdd44", color: "#000000" });
    });
    this.startButton.on("pointerout", () => {
      this.startButton?.setStyle({ backgroundColor: "#ffcc00", color: "#000000" });
    });
    this.startButton.on("pointerup", () => {
      if (this.isHost && this.room) {
        this.room.send("start_match", {});
      }
    });
    this.startButton.setVisible(false);

    // Status text (for non-hosts)
    this.statusText = this.add.text(w / 2, 540, "Waiting for host to start...", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#aaaaaa",
    });
    this.statusText.setOrigin(0.5, 0.5);

    // Leave button
    const leaveBtn = this.add.text(w - 20, 540, "LEAVE", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ff6666",
    });
    leaveBtn.setOrigin(1, 0.5);
    leaveBtn.setInteractive({ useHandCursor: true });
    leaveBtn.on("pointerover", () => leaveBtn.setColor("#ff9999"));
    leaveBtn.on("pointerout", () => leaveBtn.setColor("#ff6666"));
    leaveBtn.on("pointerup", () => {
      this.leaveToMenu();
    });

    // Connect to server
    this.connectToRoom();

    // Cleanup on shutdown
    this.events.on("shutdown", () => {
      if (this.chatInputDom) {
        this.chatInputDom.destroy();
        this.chatInputDom = null;
      }
    });
  }

  private async connectToRoom() {
    if (this.existingRoom) {
      this.room = this.existingRoom;
      this.existingRoom = null;
      this.localSessionId = this.room!.sessionId;
      this.setupRoomListeners(this.room!);
      return;
    }

    this.network = new NetworkManager();
    try {
      this.room = await this.network.connect(
        { nickname: this.nickname, characterIndex: this.characterIndex },
        "game",
      );
      this.localSessionId = this.room.sessionId;
      this.setupRoomListeners(this.room);
    } catch (err) {
      console.error("Failed to connect to lobby:", err);
      this.addSystemChat("Failed to connect to server.");
    }
  }

  private setupRoomListeners(room: Room) {
    // Track state changes (phase, host)
    room.state.onChange(() => {
      if (!this.scene.isActive()) return;
      const state = room.state as any;
      const phase = state.phase as string;
      const hostId = state.hostSessionId as string;

      this.isHost = (hostId === this.localSessionId);
      this.updateHostUI();
      this.refreshScoreboard();

      if (phase !== "lobby") {
        this.transitionToGame();
      }
    });

    // Player list updates (guard against destroyed scene)
    room.state.players.onAdd(() => {
      if (this.scene.isActive()) {
        this.refreshPlayerList();
        this.refreshScoreboard();
      }
    });
    room.state.players.onRemove(() => {
      if (this.scene.isActive()) {
        this.refreshPlayerList();
        this.refreshScoreboard();
      }
    });

    // Chat messages
    room.onMessage("chat_msg", (msg: ChatMsg) => {
      if (!this.scene.isActive()) return;
      this.chatMessages.push(msg);
      if (this.chatMessages.length > CHAT_MAX_DISPLAY) {
        this.chatMessages.shift();
      }
      this.refreshChat();
    });

    // Chat history on join
    room.onMessage("chat_history", (history: ChatMsg[]) => {
      if (!this.scene.isActive()) return;
      for (const msg of history) {
        this.chatMessages.push(msg);
      }
      while (this.chatMessages.length > CHAT_MAX_DISPLAY) {
        this.chatMessages.shift();
      }
      this.refreshChat();
    });

    // Initial render
    this.refreshPlayerList();
    this.refreshScoreboard();
    this.refreshChat();
  }

  private refreshPlayerList() {
    this.playerListContainer.removeAll(true);
    if (!this.room) return;

    const state = this.room.state as any;
    const hostId = state.hostSessionId as string;
    let i = 0;

    state.players.forEach((player: any, sessionId: string) => {
      const y = i * 32;
      const isBot = player.isBot || sessionId.startsWith(BOT_SESSION_PREFIX);
      const isHostPlayer = (sessionId === hostId);
      const charIdx = player.characterIndex ?? 0;

      // Character preview
      const texKey = `char_preview_${charIdx}`;
      if (this.textures.exists(texKey)) {
        const icon = this.add.sprite(12, y + 10, texKey)
          .setDisplaySize(20, 20)
          .setOrigin(0.5, 0.5);
        this.playerListContainer.add(icon);
      }

      // Name
      const displayName = player.displayName || sessionId.substring(0, 6);
      let label = displayName;
      if (isHostPlayer) label += " [HOST]";
      if (isBot) label += " [BOT]";

      const nameColor = sessionId === this.localSessionId ? "#ffcc00" : "#cccccc";
      const nameText = this.add.text(26, y + 10, label, {
        fontSize: "11px",
        fontFamily: "monospace",
        color: nameColor,
      }).setOrigin(0, 0.5);
      this.playerListContainer.add(nameText);

      // Remove button for bots (host only)
      if (isBot && this.isHost) {
        const removeBtn = this.add.text(185, y + 10, "X", {
          fontSize: "11px",
          fontFamily: "monospace",
          color: "#ff4444",
          fontStyle: "bold",
        }).setOrigin(0.5, 0.5);
        removeBtn.setInteractive({ useHandCursor: true });
        removeBtn.on("pointerover", () => removeBtn.setColor("#ff8888"));
        removeBtn.on("pointerout", () => removeBtn.setColor("#ff4444"));
        removeBtn.on("pointerup", () => {
          this.room?.send("remove_bot", { botSessionId: sessionId });
        });
        this.playerListContainer.add(removeBtn);
      }

      i++;
    });
  }

  private refreshScoreboard() {
    this.scoreboardContainer.removeAll(true);
    if (!this.room) return;

    const state = this.room.state as any;

    // Gather entries
    interface Entry {
      sessionId: string;
      name: string;
      kills: number;
      deaths: number;
      wins: number;
    }
    const entries: Entry[] = [];
    state.players.forEach((player: any, sessionId: string) => {
      entries.push({
        sessionId,
        name: player.displayName || sessionId.substring(0, 6),
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        wins: player.wins ?? 0,
      });
    });

    // Sort by wins desc, then kills desc
    entries.sort((a, b) => b.wins - a.wins || b.kills - a.kills);

    // Column layout (relative to container x=230)
    const colName = 0;
    const colK = 190;
    const colD = 220;
    const colW = 250;
    const rowH = 22;

    // Header
    const hdr = (x: number, text: string) => {
      const t = this.add.text(x, 0, text, {
        fontSize: "11px", fontFamily: "monospace", color: "#888888",
      });
      this.scoreboardContainer.add(t);
    };
    hdr(colName, "Player");
    hdr(colK, "K");
    hdr(colD, "D");
    hdr(colW, "W");

    // Separator line
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x555577, 0.5);
    sep.lineBetween(0, 14, 280, 14);
    this.scoreboardContainer.add(sep);

    // Rows
    for (let i = 0; i < entries.length && i < 10; i++) {
      const e = entries[i];
      const y = 20 + i * rowH;
      const isLocal = e.sessionId === this.localSessionId;
      const color = isLocal ? "#ffcc00" : "#cccccc";

      const nameLabel = this.add.text(colName, y, `${i + 1}. ${e.name}`, {
        fontSize: "11px", fontFamily: "monospace", color,
      });
      const kLabel = this.add.text(colK, y, `${e.kills}`, {
        fontSize: "11px", fontFamily: "monospace", color,
      });
      const dLabel = this.add.text(colD, y, `${e.deaths}`, {
        fontSize: "11px", fontFamily: "monospace", color,
      });
      const wLabel = this.add.text(colW, y, `${e.wins}`, {
        fontSize: "11px", fontFamily: "monospace", color,
      });
      this.scoreboardContainer.add(nameLabel);
      this.scoreboardContainer.add(kLabel);
      this.scoreboardContainer.add(dLabel);
      this.scoreboardContainer.add(wLabel);
    }

    if (entries.length === 0) {
      const empty = this.add.text(0, 20, "No players yet", {
        fontSize: "11px", fontFamily: "monospace", color: "#666666",
      });
      this.scoreboardContainer.add(empty);
    }
  }

  private refreshChat() {
    this.chatContainer.removeAll(true);

    for (let i = 0; i < this.chatMessages.length; i++) {
      const msg = this.chatMessages[i];
      const y = i * 16;

      let text: string;
      let color: string;

      if (msg.senderId === "system") {
        text = `* ${msg.text}`;
        color = "#888888";
      } else {
        text = `${msg.senderName}: ${msg.text}`;
        color = msg.senderId === this.localSessionId ? "#ffcc00" : "#cccccc";
      }

      // Truncate long messages for display
      if (text.length > 30) text = text.substring(0, 27) + "...";

      const chatLine = this.add.text(0, y, text, {
        fontSize: "11px",
        fontFamily: "monospace",
        color,
      });
      this.chatContainer.add(chatLine);
    }
  }

  private buildBotButtons() {
    this.botButtonContainer.removeAll(true);

    for (let i = 0; i < BOT_PERSONA_METAS.length; i++) {
      const meta = BOT_PERSONA_METAS[i];
      const x = i * 130;

      const btn = this.add.text(x, 0, `+ ${meta.name}`, {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#aaaaaa",
        backgroundColor: "#2a2a3e",
        padding: { x: 6, y: 4 },
      });
      btn.setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setColor("#ffcc00"));
      btn.on("pointerout", () => btn.setColor("#aaaaaa"));
      btn.on("pointerup", () => {
        if (this.isHost && this.room) {
          this.room.send("add_bot", { personaId: meta.id });
        }
      });
      this.botButtonContainer.add(btn);
    }
  }

  private updateHostUI() {
    if (this.startButton) {
      this.startButton.setVisible(this.isHost);
    }
    this.statusText.setVisible(!this.isHost);
    this.botButtonContainer.setAlpha(this.isHost ? 1 : 0.3);
    this.refreshPlayerList();
  }

  private addSystemChat(text: string) {
    this.chatMessages.push({ senderName: "", senderId: "system", text });
    if (this.chatMessages.length > CHAT_MAX_DISPLAY) {
      this.chatMessages.shift();
    }
    this.refreshChat();
  }

  private transitionToGame() {
    if (!this.room) return;

    if (this.chatInputDom) {
      this.chatInputDom.destroy();
      this.chatInputDom = null;
    }

    this.scene.start("GameScene", {
      nickname: this.nickname,
      characterIndex: this.characterIndex,
      existingRoom: this.room,
    });
  }

  private leaveToMenu() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.scene.start("MenuScene");
  }
}
