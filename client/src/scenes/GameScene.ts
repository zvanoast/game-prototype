import Phaser from "phaser";
import { NetworkManager } from "../network/NetworkManager";
import { DebugOverlay } from "../ui/DebugOverlay";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SPEED,
  PLAYER_RADIUS,
} from "shared";
import type { InputPayload } from "shared";

interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  dt: number;
}

export class GameScene extends Phaser.Scene {
  private network!: NetworkManager;
  private debugOverlay!: DebugOverlay;

  // Input
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
  };

  // Local player
  private localPlayer: Phaser.GameObjects.Sprite | null = null;
  private inputSeq = 0;
  private pendingInputs: PendingInput[] = [];

  // Remote players
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, { x: number; y: number }>();

  // Arena
  private arenaBorder!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Draw arena boundary
    this.arenaBorder = this.add.graphics();
    this.arenaBorder.lineStyle(3, 0xff0000, 1);
    this.arenaBorder.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Draw a subtle grid for spatial reference
    this.arenaBorder.lineStyle(1, 0x333333, 0.3);
    const gridSize = 200;
    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
      this.arenaBorder.lineBetween(x, 0, x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
      this.arenaBorder.lineBetween(0, y, ARENA_WIDTH, y);
    }

    // Set up camera
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Set up keyboard input
    this.keys = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      UP: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };

    // Debug overlay
    this.debugOverlay = new DebugOverlay(this);

    // Connect to server
    this.network = new NetworkManager();
    this.connectToServer();
  }

  private async connectToServer() {
    try {
      const room = await this.network.connect();

      // Listen for state changes to sync players
      room.state.players.onAdd((player: any, sessionId: string) => {
        if (sessionId === room.sessionId) {
          // Local player
          this.localPlayer = this.add.sprite(player.x, player.y, "player");
          this.localPlayer.setOrigin(0.5, 0.5);
          this.cameras.main.startFollow(this.localPlayer, true, 0.1, 0.1);
          console.log("Local player spawned");
        } else {
          // Remote player
          const sprite = this.add.sprite(player.x, player.y, "player_remote");
          sprite.setOrigin(0.5, 0.5);
          this.remotePlayers.set(sessionId, sprite);
          this.remoteTargets.set(sessionId, { x: player.x, y: player.y });
          console.log(`Remote player joined: ${sessionId}`);
        }

        // Listen for changes to this player's properties
        player.onChange(() => {
          if (sessionId === room.sessionId) {
            // Server reconciliation for local player
            this.reconcile(player);
          } else {
            // Update interpolation target for remote player
            this.remoteTargets.set(sessionId, { x: player.x, y: player.y });
          }
        });
      });

      room.state.players.onRemove((_player: any, sessionId: string) => {
        const sprite = this.remotePlayers.get(sessionId);
        if (sprite) {
          sprite.destroy();
          this.remotePlayers.delete(sessionId);
          this.remoteTargets.delete(sessionId);
          console.log(`Remote player left: ${sessionId}`);
        }
      });

      // Connection status
      room.onLeave((code: number) => {
        console.log(`Disconnected from room (code: ${code})`);
      });
    } catch (err) {
      console.error("Connection failed:", err);
    }
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000; // convert ms to seconds

    // Read input
    const dx = this.getHorizontalInput();
    const dy = this.getVerticalInput();

    // Send input to server
    if (this.network.getRoom()) {
      this.inputSeq++;
      const input: InputPayload = {
        seq: this.inputSeq,
        tick: 0, // TODO: track server tick
        dx,
        dy,
        aimAngle: 0, // TODO: aim toward mouse
        buttons: 0,
      };
      this.network.sendInput(input);

      // Save for reconciliation
      this.pendingInputs.push({ seq: this.inputSeq, dx, dy, dt });
    }

    // Client-side prediction: move local player immediately
    if (this.localPlayer) {
      this.applyMovement(this.localPlayer, dx, dy, dt);
    }

    // Interpolate remote players toward their server positions
    this.remotePlayers.forEach((sprite, sessionId) => {
      const target = this.remoteTargets.get(sessionId);
      if (target) {
        const lerpFactor = 0.15;
        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);
      }
    });

    // Update debug overlay
    this.debugOverlay.update(this.network.getRoom(), this.localPlayer);
  }

  private getHorizontalInput(): number {
    let dx = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) dx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) dx += 1;
    return dx;
  }

  private getVerticalInput(): number {
    let dy = 0;
    if (this.keys.W.isDown || this.keys.UP.isDown) dy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) dy += 1;
    return dy;
  }

  private applyMovement(
    sprite: Phaser.GameObjects.Sprite,
    dx: number,
    dy: number,
    dt: number
  ) {
    // Normalize diagonal movement
    let mx = dx;
    let my = dy;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    sprite.x += mx * PLAYER_SPEED * dt;
    sprite.y += my * PLAYER_SPEED * dt;

    // Clamp to arena
    sprite.x = Phaser.Math.Clamp(sprite.x, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
    sprite.y = Phaser.Math.Clamp(sprite.y, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
  }

  private reconcile(serverPlayer: any) {
    if (!this.localPlayer) return;

    // Update debug overlay with server position
    this.debugOverlay.setServerPos(serverPlayer.x, serverPlayer.y);

    const lastProcessed = serverPlayer.lastProcessedInput;

    // Drop all pending inputs that the server has already processed
    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessed
    );

    // Re-apply remaining unprocessed inputs on top of server state
    this.localPlayer.x = serverPlayer.x;
    this.localPlayer.y = serverPlayer.y;

    for (const input of this.pendingInputs) {
      this.applyMovement(this.localPlayer, input.dx, input.dy, input.dt);
    }
  }
}
