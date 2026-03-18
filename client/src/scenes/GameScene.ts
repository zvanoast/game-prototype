import Phaser from "phaser";
import { CHARACTER_DEFS, buildPlayerSheet } from "./BootScene";
import { NetworkManager } from "../network/NetworkManager";
import { DebugOverlay } from "../ui/DebugOverlay";
import { Minimap } from "../ui/Minimap";
import { WeaponHud } from "../ui/WeaponHud";
import { MatchHud, ScoreboardEntry } from "../ui/MatchHud";
import { DamageNumberManager } from "../ui/DamageNumber";
import { TilemapManager } from "../world/TilemapManager";
import { CombatManager } from "../systems/CombatManager";
import { InputBuffer } from "../systems/InputBuffer";
import { ComboDetector } from "../systems/ComboDetector";
import { CombatStateMachine } from "../systems/CombatStateMachine";
import { ScreenShake } from "../systems/ScreenShake";
import { HitStop } from "../systems/HitStop";
import { ParticleManager } from "../systems/ParticleManager";
import { SoundManager } from "../systems/SoundManager";
import { RespawnOverlay } from "../ui/RespawnOverlay";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_RADIUS,
  MAX_HEALTH,
  LOCKER_INTERACT_RANGE,
  PICKUP_INTERACT_RANGE,
  SHAKE_SHOOT_MAG,
  SHAKE_SHOOT_DURATION,
  SHAKE_MELEE_HIT_MAG,
  SHAKE_MELEE_HIT_DURATION,
  SHAKE_DAMAGE_MAG,
  SHAKE_DAMAGE_DURATION,
  HITSTOP_MELEE_MS,
  applyMovement,
  resolveWallCollisions,
  buildWallRects,
  getWeaponConfig,
  getConsumableConfig,
  getVehicleConfig,
  VEHICLE_INTERACT_RANGE,
  WeaponId,
} from "shared";
import { Button } from "shared";
import type { InputPayload, WallRect, WeaponConfig } from "shared";

interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  dt: number;
  vx: number;
  vy: number;
}

interface RemotePlayerData {
  x: number;
  y: number;
  angle: number;
  health: number;
  state: string;
  shieldHp: number;
  speedMultiplier: number;
  damageMultiplier: number;
}

export class GameScene extends Phaser.Scene {
  private network!: NetworkManager;
  private debugOverlay!: DebugOverlay;
  private minimap!: Minimap;
  private weaponHud!: WeaponHud;
  private matchHud!: MatchHud;
  private tilemapManager!: TilemapManager;
  private combatManager!: CombatManager;
  private damageNumbers!: DamageNumberManager;
  private inputBuffer!: InputBuffer;
  private comboDetector!: ComboDetector;
  private stateMachine!: CombatStateMachine;
  private screenShake!: ScreenShake;
  private hitStop!: HitStop;
  private particles!: ParticleManager;
  private soundManager!: SoundManager;

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
    E: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  // Local player
  private localPlayer: Phaser.Physics.Arcade.Sprite | null = null;
  private localSessionId: string | null = null;
  private inputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private velocityX = 0;
  private velocityY = 0;
  private localHealth = MAX_HEALTH;
  private localShieldHp = 0;
  private localKills = 0;

  // Equipment tracking
  private localMeleeWeaponId = WeaponId.Fists as string;
  private localRangedWeaponId = "";
  private localRangedAmmo = 0;
  private localConsumableSlot1 = "";
  private localConsumableSlot2 = "";

  // Match state
  private matchPhase: string = "waiting";
  private isHost = false;
  private localEliminated = false;
  private matchWinner: boolean | null = null; // true=won, false=lost, null=draw/unknown
  private matchWinnerName = "";
  private matchAlivePlayers = 0;
  private matchTotalPlayers = 0;
  private matchCountdownSeconds = 0;

  // Spectator mode
  private spectating = false;
  private spectateTargetId: string | null = null;
  private spectateLabel: Phaser.GameObjects.Text | null = null;

  // Player names (from displayName)
  private playerNames = new Map<string, string>();

  // Nickname passed from MenuScene
  private nickname = "";
  // Selected character index (from CHARACTER_DEFS)
  private characterIndex = 0;

  // Button state tracking
  private attackHeld = false;
  private prevAttackHeld = false;

  // Wall collision data (shared with server)
  private wallRects: WallRect[] = [];

  // Remote players
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, RemotePlayerData>();
  private remoteHealthBars = new Map<string, Phaser.GameObjects.Graphics>();
  private remoteCharIndices = new Map<string, number>();

  // Server projectile sprites (keyed by projectile id)
  private serverProjectileSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private serverProjectileTrailCleanups = new Map<number, () => void>();
  private serverProjectileTweens = new Map<number, Phaser.Tweens.Tween[]>();

  // Lockers
  private lockerSprites = new Map<number, Phaser.GameObjects.Sprite>();

  // Pickups
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();
  private pickupWeaponIds = new Map<number, string>(); // pickup id → weapon id
  private pickupAmmo = new Map<number, number>(); // pickup id → retained ammo (-1 = full)

  // Pickup tooltip
  private pickupTooltip!: Phaser.GameObjects.Container;
  private pickupTooltipText!: Phaser.GameObjects.Text;
  private hoveredPickupId: number | null = null;
  private pickupClickedThisFrame = false;

  // Interaction prompt
  private interactPrompt!: Phaser.GameObjects.Text;

  // Dash cooldown visual
  private dashCooldownGfx!: Phaser.GameObjects.Graphics;
  private dashCooldownTimer = 0;    // ms remaining
  private dashCooldownDuration = 0; // total ms for this cooldown

  // Respawn overlay (sandbox item respawns)
  private respawnOverlay!: RespawnOverlay;

  // Vehicles
  private vehicleContainers = new Map<number, Phaser.GameObjects.Container>();
  private vehicleDurabilityBars = new Map<number, Phaser.GameObjects.Graphics>();
  private vehicleTargets = new Map<number, { x: number; y: number; angle: number; riderId: string; destroyed: boolean; durabilityPct: number }>();
  private localMountedVehicleId = 0; // 0 = on foot

  // Server projectile count for debug
  private serverProjectileCount = 0;

  // Pause/options menu
  private pauseMenuContainer: Phaser.GameObjects.Container | null = null;
  private pauseMenuOpen = false;

  // Generation counter — incremented each init; stale handlers compare against this
  private generation = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  // Test mode (offline, skips server connection)
  private testMode = false;
  private botPersonas: string[] = [];
  // Pre-connected room from LobbyScene
  private existingRoom: any = null;
  // When true, shutdown won't disconnect (room is being handed to another scene)
  private preserveRoom = false;

  init(data: { nickname?: string; testMode?: boolean; characterIndex?: number; botPersonas?: string[]; existingRoom?: any } = {}) {
    this.nickname = data.nickname ?? "";
    this.testMode = data.testMode ?? false;
    this.characterIndex = data.characterIndex ?? 0;
    this.botPersonas = data.botPersonas ?? [];
    this.existingRoom = data.existingRoom ?? null;
    this.preserveRoom = false;
    this.pauseMenuOpen = false;
    this.pauseMenuContainer = null;
    this.generation++;
  }

  create() {
    // Reset all mutable state for clean re-entry (scene instance is reused)
    this.localPlayer = null;
    this.localSessionId = null;
    this.inputSeq = 0;
    this.pendingInputs = [];
    this.velocityX = 0;
    this.velocityY = 0;
    this.localHealth = MAX_HEALTH;
    this.localKills = 0;
    this.localMeleeWeaponId = WeaponId.Fists as string;
    this.localRangedWeaponId = "";
    this.localRangedAmmo = 0;
    this.localConsumableSlot1 = "";
    this.localConsumableSlot2 = "";
    this.matchPhase = "waiting";
    this.isHost = false;
    this.localEliminated = false;
    this.matchWinner = null;
    this.matchWinnerName = "";
    this.matchAlivePlayers = 0;
    this.matchTotalPlayers = 0;
    this.matchCountdownSeconds = 0;
    this.spectating = false;
    this.spectateTargetId = null;
    this.spectateLabel = null;
    this.attackHeld = false;
    this.prevAttackHeld = false;
    this.serverProjectileCount = 0;
    this.playerNames.clear();
    this.remotePlayers.clear();
    this.remoteTargets.clear();
    this.remoteHealthBars.clear();
    this.remoteCharIndices.clear();
    this.serverProjectileSprites.clear();
    this.serverProjectileTrailCleanups.clear();
    this.lockerSprites.clear();
    this.pickupSprites.clear();
    this.respawnOverlay?.clear();
    this.pickupWeaponIds.clear();
    this.pickupAmmo.clear();
    this.vehicleContainers.clear();
    this.vehicleDurabilityBars.clear();
    this.vehicleTargets.clear();
    this.localMountedVehicleId = 0;
    this.hoveredPickupId = null;

    // Rebuild player_sheet from chosen character (destroys old texture, re-registers frames)
    const chosenFrame = CHARACTER_DEFS[this.characterIndex]?.frame ?? CHARACTER_DEFS[0].frame;
    buildPlayerSheet(this, chosenFrame);
    // Re-register animations so they reference the rebuilt texture
    this.anims.remove("player_idle");
    this.anims.remove("player_walk");
    this.anims.remove("player_attack");
    this.anims.remove("player_death");
    this.anims.create({
      key: "player_idle",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 0, end: 1 }),
      frameRate: 2,
      repeat: -1,
    });
    this.anims.create({
      key: "player_walk",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 2, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "player_attack",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 6, end: 7 }),
      frameRate: 12,
      repeat: 0,
    });
    this.anims.create({
      key: "player_death",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 8, end: 10 }),
      frameRate: 6,
      repeat: 0,
    });

    // Create tilemap
    this.tilemapManager = new TilemapManager(this);

    // Pre-compute wall rects for shared collision (matches server)
    this.wallRects = buildWallRects();

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
      E: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      Q: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      SPACE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    // Input buffer & combo system
    this.inputBuffer = new InputBuffer();
    this.comboDetector = new ComboDetector(this, this.inputBuffer);
    this.stateMachine = new CombatStateMachine(this);

    // Juice systems
    this.screenShake = new ScreenShake(this);
    this.hitStop = new HitStop(this);
    this.particles = new ParticleManager(this);
    this.soundManager = new SoundManager(this);
    this.setupJuiceListeners();

    // Debug overlay
    this.debugOverlay = new DebugOverlay(this);

    // Minimap
    this.minimap = new Minimap(this, this.tilemapManager.getWallPositions());

    // Weapon HUD
    this.weaponHud = new WeaponHud(this);

    // Match HUD
    this.matchHud = new MatchHud(this);

    // Damage numbers
    this.damageNumbers = new DamageNumberManager(this);

    // Interaction prompt (hidden by default)
    this.interactPrompt = this.add.text(0, 0, "Press E", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 6, y: 3 },
    });
    this.interactPrompt.setOrigin(0.5, 1);
    this.interactPrompt.setDepth(50);
    this.interactPrompt.setVisible(false);

    // Dash cooldown ring (drawn around player's feet)
    this.dashCooldownGfx = this.add.graphics();
    this.dashCooldownGfx.setDepth(14);

    // Respawn overlay for sandbox item respawns
    this.respawnOverlay = new RespawnOverlay(this);

    // Pickup tooltip (reusable, follows hovered pickup)
    this.pickupTooltipText = this.add.text(0, 0, "", {
      fontSize: "11px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000cc",
      padding: { x: 6, y: 4 },
      lineSpacing: 2,
    });
    this.pickupTooltipText.setOrigin(0.5, 1);
    this.pickupTooltip = this.add.container(0, 0, [this.pickupTooltipText]);
    this.pickupTooltip.setDepth(55);
    this.pickupTooltip.setVisible(false);

    // Spectator label (shown above followed player)
    this.spectateLabel = this.add.text(0, 0, "", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#ffcc00",
      backgroundColor: "#000000aa",
      padding: { x: 4, y: 2 },
    });
    this.spectateLabel.setOrigin(0.5, 1);
    this.spectateLabel.setDepth(100);
    this.spectateLabel.setVisible(false);

    // Block browser context menu on game canvas (must be set before any right-click)
    this.game.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Combat manager (initialized after player spawns)
    this.combatManager = new CombatManager(this);

    // Connect to server
    this.network = new NetworkManager();
    this.connectToServer();

    // Listen for leave event from MatchHud
    this.events.on("match:leave", () => {
      this.network.disconnect();
      this.scene.start("MenuScene");
    });

    // ESC key toggles pause menu (test mode: direct exit)
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.testMode) {
        this.network.disconnect();
        this.scene.start("MenuScene");
        return;
      }
      this.togglePauseMenu();
    });

    // Test mode label
    if (this.testMode) {
      const testLabel = this.add.text(this.cameras.main.width / 2, 12, "TEST MODE  [ESC to exit]", {
        fontSize: "13px",
        fontFamily: "monospace",
        color: "#ffcc00",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 3 },
      });
      testLabel.setOrigin(0.5, 0);
      testLabel.setScrollFactor(0);
      testLabel.setDepth(200);
    }

    // Clean up network on scene shutdown (scene.start to another scene)
    this.events.on("shutdown", () => {
      if (!this.preserveRoom) {
        this.network.disconnect();
      }
    });

    // Tab scoreboard toggle (hold to show)
    this.input.keyboard!.on("keydown-TAB", (event: KeyboardEvent) => {
      event.preventDefault(); // Prevent browser tab-switching
      this.matchHud.setTabHeld(true);
    });
    this.input.keyboard!.on("keyup-TAB", () => {
      this.matchHud.setTabHeld(false);
    });

    // Artificial latency keys (1-5)
    this.input.keyboard!.on("keydown-ONE", () => this.network.setArtificialDelay(0));
    this.input.keyboard!.on("keydown-TWO", () => this.network.setArtificialDelay(50));
    this.input.keyboard!.on("keydown-THREE", () => this.network.setArtificialDelay(100));
    this.input.keyboard!.on("keydown-FOUR", () => this.network.setArtificialDelay(200));
    this.input.keyboard!.on("keydown-FIVE", () => this.network.setArtificialDelay(500));
  }

  private spawnLocalPlayer(x: number, y: number) {
    this.localPlayer = this.physics.add.sprite(x, y, "player_sheet");
    this.localPlayer.setOrigin(0.5, 0.5);
    this.localPlayer.setDepth(10);
    this.localPlayer.play("player_idle");

    // Circular physics body (kept for overlap detection, not for movement)
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS, 0, 0);
    body.setCollideWorldBounds(false);
    body.moves = false; // We handle all movement — prevent Phaser from applying velocity

    // Camera follow — lerp is updated dynamically in update() based on speed
    this.cameras.main.startFollow(this.localPlayer, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(20, 20);

    // Init combat manager with player
    this.combatManager.init(
      this.localPlayer,
      this.tilemapManager.getWallLayer()
    );

    // Wire state machine callbacks
    this.stateMachine.setCallbacks({
      onDash: (_angle: number, _speed: number) => {
        // Dash movement is handled in update() via dashState
      },
      onDashStrike: () => {
        this.combatManager.executeDashStrike();
      },
    });
  }

  private setupJuiceListeners() {
    // Screen shake on shoot
    this.events.on("juice:shoot", (_angle: number) => {
      this.screenShake.shake(SHAKE_SHOOT_MAG, SHAKE_SHOOT_DURATION);
    });

    // Screen shake + hit-stop on melee hit
    this.events.on("juice:melee_hit", (attacker: Phaser.GameObjects.Sprite, targets: Phaser.GameObjects.Sprite[]) => {
      this.screenShake.shake(SHAKE_MELEE_HIT_MAG, SHAKE_MELEE_HIT_DURATION);
      this.hitStop.freeze(HITSTOP_MELEE_MS, [attacker, ...targets]);
    });

    // Particle events
    this.events.on("particle:muzzle", (x: number, y: number, angle: number) => {
      this.particles.muzzleFlash(x, y, angle);
    });

    this.events.on("particle:impact", (x: number, y: number, color: number) => {
      this.particles.impact(x, y, color);
    });

    // Dash event
    this.events.on("state:dash_start", () => {
      this.events.emit("sfx:dash");
    });
  }

  // ─── Pause Menu ───────────────────────────────────────────────────────

  private togglePauseMenu() {
    if (this.pauseMenuOpen) {
      this.closePauseMenu();
    } else {
      this.openPauseMenu();
    }
  }

  private openPauseMenu() {
    if (this.pauseMenuOpen) return;
    this.pauseMenuOpen = true;

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Use an array to track objects for cleanup (no container — scrollFactor
    // on a container doesn't affect children's interactive hit areas)
    const items: Phaser.GameObjects.GameObject[] = [];

    // Dimmed background (full screen, blocks clicks behind menu)
    const dimBg = this.add.rectangle(centerX, centerY, 800, 600, 0x000000, 0.6);
    dimBg.setScrollFactor(0).setDepth(1000).setInteractive();
    items.push(dimBg);

    // Panel
    const panel = this.add.rectangle(centerX, centerY, 280, 200, 0x1a1a2e, 0.95);
    panel.setStrokeStyle(2, 0x555577);
    panel.setScrollFactor(0).setDepth(1001);
    items.push(panel);

    // Title
    const title = this.add.text(centerX, centerY - 70, "PAUSED", {
      fontSize: "22px",
      fontFamily: "monospace",
      color: "#ffcc00",
      fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1002);
    items.push(title);

    // Resume button
    items.push(this.makeMenuButton(centerX, centerY - 20, "Resume", "#cccccc", () => {
      this.closePauseMenu();
    }));

    // Host: End Game
    if (this.isHost) {
      items.push(this.makeMenuButton(centerX, centerY + 20, "End Game", "#ff8844", () => {
        this.network.getRoom()?.send("end_game", {});
        this.closePauseMenu();
      }));
    }

    // Leave Game
    items.push(this.makeMenuButton(centerX, centerY + 60, "Leave Game", "#ff4444", () => {
      this.closePauseMenu();
      this.network.disconnect();
      this.scene.start("MenuScene");
    }));

    // Wrap in container for easy cleanup only (not for positioning)
    this.pauseMenuContainer = this.add.container(0, 0, items);
    this.pauseMenuContainer.setDepth(1000);
  }

  private makeMenuButton(x: number, y: number, label: string, color: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: "16px",
      fontFamily: "monospace",
      color,
      padding: { x: 16, y: 6 },
    });
    btn.setOrigin(0.5, 0.5);
    btn.setScrollFactor(0);
    btn.setDepth(1002);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setAlpha(0.7));
    btn.on("pointerout", () => btn.setAlpha(1));
    btn.on("pointerup", onClick);
    return btn;
  }

  private closePauseMenu() {
    if (!this.pauseMenuOpen) return;
    this.pauseMenuOpen = false;
    if (this.pauseMenuContainer) {
      this.pauseMenuContainer.destroy(true);
      this.pauseMenuContainer = null;
    }
  }

  private async connectToServer() {
    try {
      let room: any;

      if (this.existingRoom) {
        // Reuse room from LobbyScene — already connected
        room = this.existingRoom;
        this.network.setRoom(room);
        this.existingRoom = null;
        this.localSessionId = room.sessionId;
      } else {
        const roomType = this.testMode ? "sandbox" : "game";
        const options: Record<string, unknown> = {
          nickname: this.nickname,
          characterIndex: this.characterIndex,
        };
        if (this.testMode) {
          options.sandbox = true;
          if (this.botPersonas.length > 0) {
            options.botPersonas = this.botPersonas;
          }
        }

        room = await this.network.connect(options, roomType);
        this.localSessionId = room.sessionId;
      }

      // Capture generation so stale handlers from previous scene entries bail
      const gen = this.generation;
      const alive = () => this.generation === gen;

      // Track phase changes from state
      const trackState = () => {
        const state = room.state as any;
        const prevPhase = this.matchPhase;
        this.matchPhase = state.phase ?? "waiting";
        this.matchAlivePlayers = state.alivePlayers ?? 0;
        this.matchCountdownSeconds = state.countdownSeconds ?? 0;
        this.matchTotalPlayers = state.players?.size ?? 0;
        this.isHost = (state.hostSessionId === this.localSessionId);

        // Determine win state
        if (this.matchPhase === "ended") {
          const winnerId = state.winnerId ?? "";
          if (!winnerId) {
            this.matchWinner = null; // draw
          } else if (winnerId === room.sessionId) {
            this.matchWinner = true;
          } else {
            this.matchWinner = false;
          }
        }

        // Close pause menu on phase changes
        if (this.matchPhase !== prevPhase) {
          this.closePauseMenu();
        }

        // Match reset → back to lobby (non-sandbox only)
        if (this.matchPhase === "lobby" && prevPhase !== "lobby" && !this.testMode) {
          this.preserveRoom = true;
          this.scene.start("LobbyScene", {
            nickname: this.nickname,
            characterIndex: this.characterIndex,
            existingRoom: room,
          });
        }
      };

      room.state.onChange(() => {
        if (!alive()) return;
        trackState();
      });

      // --- Player setup helper (used by onAdd and manual init for reused rooms) ---
      const handlePlayerAdd = (player: any, sessionId: string) => {
        // Use server displayName
        const name = player.displayName || sessionId.substring(0, 6);
        this.playerNames.set(sessionId, name);

        if (sessionId === room.sessionId) {
          // Skip if already spawned (onAdd + manual init may both fire)
          if (this.localPlayer) return;

          // If server reassigned character (requested was taken), rebuild player sheet
          const serverCharIdx = player.characterIndex ?? 0;
          if (serverCharIdx !== this.characterIndex) {
            this.characterIndex = serverCharIdx;
            const newFrame = CHARACTER_DEFS[serverCharIdx]?.frame ?? CHARACTER_DEFS[0].frame;
            buildPlayerSheet(this, newFrame);
            this.anims.remove("player_idle");
            this.anims.remove("player_walk");
            this.anims.remove("player_attack");
            this.anims.remove("player_death");
            this.anims.create({ key: "player_idle", frames: this.anims.generateFrameNumbers("player_sheet", { start: 0, end: 1 }), frameRate: 2, repeat: -1 });
            this.anims.create({ key: "player_walk", frames: this.anims.generateFrameNumbers("player_sheet", { start: 2, end: 5 }), frameRate: 8, repeat: -1 });
            this.anims.create({ key: "player_attack", frames: this.anims.generateFrameNumbers("player_sheet", { start: 6, end: 7 }), frameRate: 12, repeat: 0 });
            this.anims.create({ key: "player_death", frames: this.anims.generateFrameNumbers("player_sheet", { start: 8, end: 10 }), frameRate: 6, repeat: 0 });
            console.log(`Character reassigned by server: ${serverCharIdx} (${CHARACTER_DEFS[serverCharIdx]?.name})`);
          }

          this.spawnLocalPlayer(player.x, player.y);
          this.localHealth = player.health;
          this.localShieldHp = player.shieldHp ?? 0;
          this.localKills = player.kills ?? 0;
          this.localEliminated = player.eliminated ?? false;
          this.localMeleeWeaponId = player.meleeWeaponId ?? WeaponId.Fists;
          this.localRangedWeaponId = player.rangedWeaponId ?? "";
          this.localRangedAmmo = player.rangedAmmo ?? 0;
          this.localConsumableSlot1 = player.consumableSlot1 ?? "";
          this.localConsumableSlot2 = player.consumableSlot2 ?? "";
          this.localMountedVehicleId = player.mountedVehicleSchemaId ?? 0;
          this.combatManager.setMeleeWeapon(this.localMeleeWeaponId);
          this.combatManager.setRangedWeapon(this.localRangedWeaponId);

          // If joining as eliminated (late joiner), enter spectator immediately
          if (this.localEliminated) {
            this.enterSpectatorMode();
          }
          console.log("Local player spawned", this.localEliminated ? "(eliminated, spectating)" : "");
        } else {
          // Skip if already tracked
          if (this.remotePlayers.has(sessionId)) return;

          // Use server-assigned character's spritesheet for remote player
          const charIdx = player.characterIndex ?? 0;
          const sheetKey = `player_sheet_${charIdx}`;
          const hasSheet = this.textures.exists(sheetKey);
          const sprite = this.add.sprite(player.x, player.y, hasSheet ? sheetKey : "player_sheet");
          sprite.setOrigin(0.5, 0.5);
          sprite.setDepth(9);
          sprite.play(hasSheet ? `player_idle_${charIdx}` : "player_idle");
          this.remoteCharIndices.set(sessionId, charIdx);
          this.remotePlayers.set(sessionId, sprite);
          this.remoteTargets.set(sessionId, {
            x: player.x,
            y: player.y,
            angle: player.angle ?? 0,
            health: player.health ?? MAX_HEALTH,
            state: player.state ?? "idle",
            shieldHp: player.shieldHp ?? 0,
            speedMultiplier: player.speedMultiplier ?? 1.0,
            damageMultiplier: player.damageMultiplier ?? 1.0,
          });

          // Create health bar graphics for remote player
          const hpBar = this.add.graphics();
          hpBar.setDepth(15);
          this.remoteHealthBars.set(sessionId, hpBar);

          console.log(`Remote player joined: ${sessionId}`);
        }

        player.onChange(() => {
          if (!alive()) return;
          if (player.displayName) {
            this.playerNames.set(sessionId, player.displayName);
          }

          if (sessionId === room.sessionId) {
            this.reconcile(player);
            this.localHealth = player.health;
            this.localShieldHp = player.shieldHp ?? 0;
            this.localKills = player.kills ?? 0;
            this.localEliminated = player.eliminated ?? false;

            // Track weapon changes
            const newMelee = player.meleeWeaponId ?? WeaponId.Fists;
            const newRanged = player.rangedWeaponId ?? "";
            if (newMelee !== this.localMeleeWeaponId) {
              this.localMeleeWeaponId = newMelee;
              this.combatManager.setMeleeWeapon(newMelee);
            }
            if (newRanged !== this.localRangedWeaponId) {
              this.localRangedWeaponId = newRanged;
              this.combatManager.setRangedWeapon(newRanged);
            }
            this.localRangedAmmo = player.rangedAmmo ?? 0;

            // Track consumable changes
            this.localConsumableSlot1 = player.consumableSlot1 ?? "";
            this.localConsumableSlot2 = player.consumableSlot2 ?? "";

            // Track mounted vehicle
            this.localMountedVehicleId = player.mountedVehicleSchemaId ?? 0;

            // Handle local player death state from server
            if (player.state === "dead" && this.localPlayer) {
              this.localPlayer.setAlpha(0.3);
              this.localPlayer.play("player_death", true);
            }

            // Enter spectator mode when eliminated during play
            if (this.localEliminated && this.matchPhase === "playing" && !this.spectating) {
              this.enterSpectatorMode();
            }
          } else {
            this.remoteTargets.set(sessionId, {
              x: player.x,
              y: player.y,
              angle: player.angle ?? 0,
              health: player.health ?? MAX_HEALTH,
              state: player.state ?? "idle",
              shieldHp: player.shieldHp ?? 0,
              speedMultiplier: player.speedMultiplier ?? 1.0,
              damageMultiplier: player.damageMultiplier ?? 1.0,
            });
          }
        });
      };

      // Register onAdd for future players
      room.state.players.onAdd((player: any, sessionId: string) => {
        if (!alive()) return;
        handlePlayerAdd(player, sessionId);
      });

      // Sync current state immediately (onChange only fires on future changes)
      trackState();

      // Handle pre-existing players on reused rooms (onAdd may not fire for them)
      room.state.players.forEach((player: any, sessionId: string) => {
        handlePlayerAdd(player, sessionId);
      });

      room.state.players.onRemove((_player: any, sessionId: string) => {
        if (!alive()) return;
        const sprite = this.remotePlayers.get(sessionId);
        if (sprite) {
          sprite.destroy();
          this.remotePlayers.delete(sessionId);
          this.remoteTargets.delete(sessionId);
        }
        const hpBar = this.remoteHealthBars.get(sessionId);
        if (hpBar) {
          hpBar.destroy();
          this.remoteHealthBars.delete(sessionId);
        }
        this.remoteCharIndices.delete(sessionId);
        this.playerNames.delete(sessionId);

        // If spectating this player, cycle to next
        if (this.spectateTargetId === sessionId) {
          this.cycleSpectateTarget(1);
        }

        console.log(`Remote player left: ${sessionId}`);
      });

      // --- Lockers ---
      room.state.lockers.onAdd((locker: any, _key: number) => {
        const texture = locker.opened ? "locker_open" : "locker_closed";
        const sprite = this.add.sprite(locker.x, locker.y, texture);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(3);
        this.lockerSprites.set(locker.id, sprite);

        locker.onChange(() => {
          const s = this.lockerSprites.get(locker.id);
          if (s) {
            s.setTexture(locker.opened ? "locker_open" : "locker_closed");
          }
        });
      });

      // --- Pickups (click-to-pickup with hover tooltip) ---
      room.state.pickups.onAdd((pickup: any, _key: number) => {
        const isConsumable = !!pickup.consumableId;
        const weapon = isConsumable ? null : getWeaponConfig(pickup.weaponId);
        const consumable = isConsumable ? getConsumableConfig(pickup.consumableId) : null;
        const color = isConsumable ? (consumable?.color ?? 0xffffff) : (weapon?.color ?? 0xffffff);

        const pickupTexKey = isConsumable
          ? this.getConsumablePickupTexture(pickup.consumableId)
          : this.getPickupTexture(pickup.weaponId);
        const sprite = this.add.sprite(0, 0, pickupTexKey);
        sprite.setTint(color);
        sprite.setOrigin(0.5, 0.5);

        const displayName = isConsumable
          ? (consumable?.name ?? pickup.consumableId)
          : (weapon?.name ?? pickup.weaponId);
        const label = this.add.text(0, 12, displayName, {
          fontSize: "10px",
          fontFamily: "monospace",
          color: "#ffffff",
          backgroundColor: "#00000088",
          padding: { x: 2, y: 1 },
        });
        label.setOrigin(0.5, 0);

        const container = this.add.container(pickup.x, pickup.y, [sprite, label]);
        container.setDepth(5);

        // Make container interactive for click + hover
        container.setSize(28, 28);
        container.setInteractive({ useHandCursor: true });

        const pickupId = pickup.id;

        container.on("pointerup", () => {
          if (!this.localPlayer) return;
          const dx = this.localPlayer.x - container.x;
          const dy = this.localPlayer.y - container.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= PICKUP_INTERACT_RANGE) {
            room.send("pickup_click", { pickupId });
            this.pickupClickedThisFrame = true;
          }
        });

        container.on("pointerover", () => {
          this.hoveredPickupId = pickupId;
        });

        container.on("pointerout", () => {
          if (this.hoveredPickupId === pickupId) {
            this.hoveredPickupId = null;
            this.pickupTooltip.setVisible(false);
          }
        });

        this.pickupSprites.set(pickup.id, container);
        this.pickupWeaponIds.set(pickup.id, pickup.weaponId);
        this.pickupAmmo.set(pickup.id, pickup.ammo ?? -1);

        pickup.onChange(() => {
          const c = this.pickupSprites.get(pickup.id);
          if (c) {
            c.setPosition(pickup.x, pickup.y);
          }
        });
      });

      room.state.pickups.onRemove((pickup: any, _key: number) => {
        const container = this.pickupSprites.get(pickup.id);
        if (container) {
          container.destroy();
          this.pickupSprites.delete(pickup.id);
        }
        this.pickupWeaponIds.delete(pickup.id);
        this.pickupAmmo.delete(pickup.id);
        if (this.hoveredPickupId === pickup.id) {
          this.hoveredPickupId = null;
          this.pickupTooltip.setVisible(false);
        }
      });

      // --- Vehicles ---
      room.state.vehicles.onAdd((vehicle: any, _key: number) => {
        const config = getVehicleConfig(vehicle.vehicleId);
        const texKey = this.textures.exists(`vehicle_${vehicle.vehicleId}`)
          ? `vehicle_${vehicle.vehicleId}`
          : "pickup";
        const sprite = this.add.sprite(0, 0, texKey);
        sprite.setOrigin(0.5, 0.5);

        // Name label below sprite
        const label = this.add.text(0, 24, config?.name ?? vehicle.vehicleId, {
          fontSize: "10px",
          fontFamily: "monospace",
          color: "#ffffff",
          backgroundColor: "#00000088",
          padding: { x: 2, y: 1 },
        });
        label.setOrigin(0.5, 0);

        const container = this.add.container(vehicle.x, vehicle.y, [sprite, label]);
        container.setDepth(4);
        this.vehicleContainers.set(vehicle.id, container);

        // Durability bar graphics
        const durBar = this.add.graphics();
        durBar.setDepth(15);
        this.vehicleDurabilityBars.set(vehicle.id, durBar);

        // Store initial target
        this.vehicleTargets.set(vehicle.id, {
          x: vehicle.x, y: vehicle.y, angle: vehicle.angle,
          riderId: vehicle.riderId, destroyed: vehicle.destroyed,
          durabilityPct: vehicle.durabilityPct,
        });

        vehicle.onChange(() => {
          // Update target — actual interpolation happens in update()
          this.vehicleTargets.set(vehicle.id, {
            x: vehicle.x, y: vehicle.y, angle: vehicle.angle,
            riderId: vehicle.riderId, destroyed: vehicle.destroyed,
            durabilityPct: vehicle.durabilityPct,
          });
        });
      });

      room.state.vehicles.onRemove((vehicle: any, _key: number) => {
        const container = this.vehicleContainers.get(vehicle.id);
        if (container) {
          container.destroy();
          this.vehicleContainers.delete(vehicle.id);
        }
        const bar = this.vehicleDurabilityBars.get(vehicle.id);
        if (bar) {
          bar.destroy();
          this.vehicleDurabilityBars.delete(vehicle.id);
        }
        this.vehicleTargets.delete(vehicle.id);
      });

      // Listen for server projectile state changes
      room.state.projectiles.onAdd((proj: any, _key: number) => {
        const texKey = this.getProjectileTexture(proj.weaponId ?? "");
        const sprite = this.add.sprite(proj.x, proj.y, texKey);
        sprite.setDepth(8);
        sprite.setOrigin(0.5, 0.5);
        // Set initial rotation to face travel direction
        if (proj.vx !== undefined && proj.vy !== undefined) {
          sprite.setRotation(Math.atan2(proj.vy, proj.vx));
        }
        this.serverProjectileSprites.set(proj.id, sprite);

        // Apply per-weapon tween animations
        const animTweens = this.applyProjectileAnimation(sprite, proj.weaponId ?? "");
        if (animTweens.length > 0) {
          this.serverProjectileTweens.set(proj.id, animTweens);
        }

        // Attach projectile trail (per-weapon config)
        const weaponCfg = getWeaponConfig(proj.weaponId ?? "");
        const trailColor = weaponCfg?.projectileColor ?? 0xffff00;
        const trailCleanup = this.particles.projectileTrail(sprite, trailColor, proj.weaponId ?? "");
        this.serverProjectileTrailCleanups.set(proj.id, trailCleanup);

        proj.onChange(() => {
          const s = this.serverProjectileSprites.get(proj.id);
          if (s) {
            s.setPosition(proj.x, proj.y);
          }
        });
      });

      room.state.projectiles.onRemove((proj: any, _key: number) => {
        // Clean up tweens
        const tweens = this.serverProjectileTweens.get(proj.id);
        if (tweens) {
          this.cleanupProjectileTweens(tweens);
          this.serverProjectileTweens.delete(proj.id);
        }

        // Clean up trail
        const trailCleanup = this.serverProjectileTrailCleanups.get(proj.id);
        if (trailCleanup) {
          trailCleanup();
          this.serverProjectileTrailCleanups.delete(proj.id);
        }

        const sprite = this.serverProjectileSprites.get(proj.id);
        if (sprite) {
          // Impact particles on removal
          this.particles.impact(proj.x, proj.y, 0xffff00);
          sprite.destroy();
          this.serverProjectileSprites.delete(proj.id);
        }
      });

      room.onMessage("hit", (data: any) => {
        if (!alive()) return;
        // Show damage number at hit location
        this.events.emit("damage:number", data.x, data.y, data.damage);

        // Impact particles
        const color = data.type === "melee" ? 0xffffff : 0xffff00;
        this.particles.impact(data.x, data.y, color);

        // Screen shake if local player was hit
        if (data.targetId === room.sessionId) {
          this.screenShake.shake(SHAKE_DAMAGE_MAG, SHAKE_DAMAGE_DURATION);
        }
      });

      room.onMessage("melee_hit", (data: any) => {
        if (!alive()) return;
        this.particles.impact(data.x, data.y, 0xffffff);
      });

      room.onMessage("kill", (data: any) => {
        if (!alive()) return;
        // Death explosion at victim location
        this.particles.deathExplosion(data.x, data.y);
        this.events.emit("sfx:death");

        // Kill feed
        const killerName = this.playerNames.get(data.killerId) ?? data.killerId?.substring(0, 6) ?? "???";
        const victimName = this.playerNames.get(data.victimId) ?? data.victimId?.substring(0, 6) ?? "???";
        const weaponName = data.weaponName ?? "???";
        this.matchHud.showKillFeed(killerName, victimName, weaponName);
      });

      room.onMessage("player_eliminated", (data: any) => {
        if (!alive()) return;
        if (this.spectating && this.spectateTargetId === data.sessionId) {
          this.cycleSpectateTarget(1);
        }
      });

      room.onMessage("match_start", () => {
        if (!alive()) return;
        this.matchPhase = "playing";
        this.matchWinner = null;
        this.matchWinnerName = "";
        this.localEliminated = false;
        this.exitSpectatorMode();
        this.events.emit("sfx:match_start");
      });

      room.onMessage("match_end", (data: any) => {
        if (!alive()) return;
        this.matchPhase = "ended";
        this.matchWinnerName = data.winnerName ?? "";
        if (!data.winnerId) {
          this.matchWinner = null;
        } else if (data.winnerId === room.sessionId) {
          this.matchWinner = true;
        } else {
          this.matchWinner = false;
        }
      });

      room.onMessage("match_countdown", (data: any) => {
        if (!alive()) return;
        this.matchCountdownSeconds = data.seconds ?? 0;
        if (data.seconds > 0) {
          this.events.emit("sfx:countdown_beep");
        }
      });

      room.onMessage("respawn", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId && this.localPlayer) {
          // Reset local player
          this.localPlayer.setPosition(data.x, data.y);
          this.localPlayer.setAlpha(1);
          this.velocityX = 0;
          this.velocityY = 0;
          this.pendingInputs = [];
          this.localHealth = MAX_HEALTH;
          this.localEliminated = false;
          this.localMountedVehicleId = 0;

          // Exit spectator mode on respawn (match reset)
          this.exitSpectatorMode();
        }
      });

      room.onMessage("projectile_wall", (data: any) => {
        if (!alive()) return;
        this.particles.impact(data.x, data.y, 0xffff00);
      });

      room.onMessage("locker_opened", (data: any) => {
        if (!alive()) return;
        this.particles.impact(data.x, data.y, 0x8B6914);
        this.events.emit("sfx:locker_open");
      });

      room.onMessage("respawn_start", (data: any) => {
        if (!alive()) return;
        if (data.type === "pickup") {
          this.respawnOverlay.addTimer(
            `pickup_${data.x}_${data.y}`,
            data.x, data.y,
            data.durationMs, 14, 0x66ccff,
          );
        }
      });

      room.onMessage("weapon_pickup", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId) {
          // Particle burst on local player
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x00ff88);
          }
          this.events.emit("sfx:pickup");
        }
      });

      room.onMessage("consumable_pickup", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId) {
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x44ff44);
          }
          this.events.emit("sfx:pickup");
        }
      });

      room.onMessage("consumable_used", (data: any) => {
        if (!alive()) return;
        const config = getConsumableConfig(data.consumableId);
        const color = config?.color ?? 0xffffff;

        // Find the player sprite and show particles
        if (data.sessionId === room.sessionId) {
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, color);
          }
        } else {
          const sprite = this.remotePlayers.get(data.sessionId);
          if (sprite) {
            this.particles.impact(sprite.x, sprite.y, color);
          }
        }
        this.events.emit("sfx:consumable_use");
      });

      room.onMessage("buff_expired", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId) {
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x888888);
          }
        }
        this.events.emit("sfx:buff_expired");
      });

      // Vehicle messages
      room.onMessage("vehicle_mount", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId) {
          this.localMountedVehicleId = data.vehicleSchemaId;
          this.stateMachine.setMounted(true);
        }
        this.events.emit("sfx:vehicle_mount");
      });

      room.onMessage("vehicle_dismount", (data: any) => {
        if (!alive()) return;
        if (data.sessionId === room.sessionId) {
          this.localMountedVehicleId = 0;
          this.stateMachine.setMounted(false);
        }
        this.events.emit("sfx:vehicle_dismount");
      });

      room.onMessage("vehicle_destroyed", (_data: any) => {
        if (!alive()) return;
        this.events.emit("sfx:vehicle_destroyed");
      });

      room.onMessage("vehicle_hit", (data: any) => {
        if (!alive()) return;
        let tx = 0, ty = 0;
        if (data.targetId === room.sessionId && this.localPlayer) {
          tx = this.localPlayer.x;
          ty = this.localPlayer.y;
          this.screenShake.shake(SHAKE_DAMAGE_MAG, SHAKE_DAMAGE_DURATION);
        } else {
          const remote = this.remotePlayers.get(data.targetId);
          if (remote) { tx = remote.x; ty = remote.y; }
        }
        if (tx || ty) {
          this.events.emit("damage:number", tx, ty, data.damage);
          this.particles.impact(tx, ty, 0xffffff);
        }
        this.events.emit("sfx:vehicle_hit");
      });

      room.onMessage("weapon_depleted", (_data: any) => {
        if (!alive()) return;
      });

      room.onMessage("dash_cooldown", (data: any) => {
        if (!alive()) return;
        this.dashCooldownDuration = data.durationMs;
        this.dashCooldownTimer = data.durationMs;
      });

      room.onLeave((code: number) => {
        if (!alive()) return;
        console.log(`Disconnected from room (code: ${code})`);
      });
    } catch (err) {
      console.error("Connection failed:", err);
      // Show error and return to menu
      const errorText = this.add.text(
        this.cameras.main.width / 2, this.cameras.main.height / 2,
        "Could not connect to server.\nClick to return to menu.",
        { fontSize: "18px", fontFamily: "monospace", color: "#ff4444", align: "center" }
      );
      errorText.setOrigin(0.5, 0.5);
      errorText.setScrollFactor(0);
      errorText.setDepth(999);
      this.input.once("pointerup", () => {
        this.scene.start("MenuScene");
      });
    }
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;

    // Read movement input
    const dx = this.getHorizontalInput();
    const dy = this.getVerticalInput();

    // Mouse aim
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let aimAngle = 0;
    if (this.localPlayer) {
      aimAngle = Math.atan2(
        worldPoint.y - this.localPlayer.y,
        worldPoint.x - this.localPlayer.x
      );
    }

    // Button state: track attack (left mouse) and melee (right mouse)
    // When hovering a pickup, swallow the mouse so the server never sees a press or release edge.
    const hoveringPickup = this.hoveredPickupId !== null;
    const rawLeftDown = pointer.leftButtonDown();
    const leftDown = hoveringPickup || this.pickupClickedThisFrame ? false : rawLeftDown;
    // If hovering pickup and mouse is held, keep ATTACK bit matching previous frame to avoid false release
    const forceAttackBit = hoveringPickup && rawLeftDown && this.attackHeld;
    const rightDown = pointer.rightButtonDown();
    this.pickupClickedThisFrame = false;
    let buttons = 0;
    if (leftDown || forceAttackBit) buttons |= Button.ATTACK;
    if (rightDown) buttons |= Button.MELEE;
    if (this.keys.E.isDown) buttons |= Button.INTERACT;
    if (this.keys.Q.isDown) buttons |= Button.USE_CONSUMABLE;
    if (this.keys.SPACE.isDown) buttons |= Button.DASH;
    this.attackHeld = leftDown || forceAttackBit;

    // Record input to buffer
    this.inputBuffer.recordFrame(dx, dy, buttons, aimAngle);

    // Run combo detection
    this.comboDetector.update();

    // Update state machine (tick timers, return dash state if dashing)
    const dashState = this.stateMachine.update();

    // Set dash direction based on movement input or aim angle
    if (this.stateMachine.isDashing()) {
      const dashAngle = (dx !== 0 || dy !== 0)
        ? Math.atan2(dy, dx)
        : aimAngle;
      this.stateMachine.setDashAngle(dashAngle);
    }

    // Don't send input or process movement if dead or eliminated
    const isDead = this.localHealth <= 0 || this.localEliminated;
    // Movement frozen during waiting and ended phases (aim + combat still allowed)
    const movementFrozen = this.pauseMenuOpen || this.matchPhase === "lobby" || this.matchPhase === "waiting" || this.matchPhase === "countdown" || this.matchPhase === "ended";

    // Spectator mode: cycle with left/right arrow keys
    if (this.spectating) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.LEFT)) {
        this.cycleSpectateTarget(-1);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.RIGHT)) {
        this.cycleSpectateTarget(1);
      }
    }

    // Send input to server
    const canMove = !isDead && !movementFrozen;
    if (this.network.getRoom()) {
      this.inputSeq++;
      const input: InputPayload = {
        seq: this.inputSeq,
        tick: 0,
        dx: canMove ? dx : 0,
        dy: canMove ? dy : 0,
        aimAngle,
        buttons: (isDead || this.pauseMenuOpen) ? 0 : buttons,
        dt,
      };
      this.network.sendInput(input);
      if (canMove) {
        this.pendingInputs.push({ seq: this.inputSeq, dx, dy, dt, vx: this.velocityX, vy: this.velocityY });
      }
    }

    // Aim + combat (allowed when alive, even if movement frozen)
    if (this.localPlayer && !isDead) {
      // Rotate player toward mouse, or lock to vehicle heading when mounted
      if (this.localMountedVehicleId > 0) {
        // Face the vehicle's heading so the player knows which way W goes
        const vTarget = this.vehicleTargets.get(this.localMountedVehicleId);
        if (vTarget) {
          this.localPlayer.setRotation(vTarget.angle);
        }
      } else {
        this.localPlayer.setRotation(aimAngle);
      }

      // Combat aim
      this.combatManager.setAimAngle(aimAngle);

      // Hold-to-attack melee: continuously swing while right mouse held
      if (rightDown && this.combatManager.getMeleeConfig().meleeHoldToAttack) {
        this.combatManager.tryMelee();
      }

      // Fire prediction on release (matches server fire-on-release behavior)
      // In multiplayer, only emit muzzle flash/sound — actual projectile visuals
      // come from server state so they properly disappear on hit.
      const attackReleased = this.prevAttackHeld && !leftDown;
      if (attackReleased && this.stateMachine.canShoot()) {
        if (this.network.isConnected()) {
          // Multiplayer/sandbox: just emit muzzle flash/sound, server drives projectile sprite
          const rangedCfg = this.combatManager.getRangedConfig();
          if (rangedCfg) {
            this.events.emit("sfx:shoot_weapon", rangedCfg.id);
            this.events.emit("juice:shoot", aimAngle);
            const spawnDist = 20;
            const mx = this.localPlayer!.x + Math.cos(aimAngle) * spawnDist;
            const my = this.localPlayer!.y + Math.sin(aimAngle) * spawnDist;
            this.events.emit("particle:muzzle", mx, my, aimAngle);
          }
        } else {
          // Offline fallback: use local predicted projectiles
          this.combatManager.tryShoot();
        }
      }
    }

    this.prevAttackHeld = leftDown;

    // Movement (blocked when dead, eliminated, or phase-frozen)
    if (this.localPlayer && canMove) {
      if (dashState) {
        // During dash: override movement with dash velocity
        const dashVx = Math.cos(dashState.angle) * dashState.speedPerFrame * 60;
        const dashVy = Math.sin(dashState.angle) * dashState.speedPerFrame * 60;
        this.velocityX = dashVx;
        this.velocityY = dashVy;

        // Integrate position manually + wall collision
        const newX = this.localPlayer.x + dashVx * dt;
        const newY = this.localPlayer.y + dashVy * dt;
        const resolved = resolveWallCollisions(newX, newY, PLAYER_RADIUS, this.wallRects);
        this.localPlayer.x = resolved.x;
        this.localPlayer.y = resolved.y;

        // Make player semi-transparent during dash (invulnerability indicator)
        this.localPlayer.setAlpha(0.5);

        // Dash trail particles
        this.particles.dashTrail(this.localPlayer.x, this.localPlayer.y);
      } else if (this.localMountedVehicleId > 0) {
        // Mounted: interpolate toward vehicle position from server.
        // Vehicle physics run server-side only — client smoothly follows.
        const vc = this.vehicleContainers.get(this.localMountedVehicleId);
        if (vc) {
          this.localPlayer.x = Phaser.Math.Linear(this.localPlayer.x, vc.x, 0.4);
          this.localPlayer.y = Phaser.Math.Linear(this.localPlayer.y, vc.y, 0.4);
        }
        this.velocityX = 0;
        this.velocityY = 0;
        this.localPlayer.setAlpha(1);
      } else {
        // Normal acceleration movement (blocked during state lock except dash)
        if (!this.stateMachine.isLocked()) {
          this.applySharedMovement(dx, dy, dt);
          this.stateMachine.setMoving(dx !== 0 || dy !== 0);
        } else {
          // Locked states (combo_executing, etc.) — slow down
          this.applySharedMovement(0, 0, dt);
        }
        this.localPlayer.setAlpha(1);
      }

      // Animate local player
      if (dashState) {
        this.localPlayer.play("player_walk", true);
      } else if (this.localMountedVehicleId > 0 || dx !== 0 || dy !== 0) {
        this.localPlayer.play("player_walk", true);
      } else {
        this.localPlayer.play("player_idle", true);
      }
    } else if (this.localPlayer && !isDead && movementFrozen) {
      // Frozen but alive — show idle animation
      this.localPlayer.play("player_idle", true);
      this.localPlayer.setAlpha(1);
    }

    // Dynamic camera lerp — tighten up at high speed so it doesn't lag behind
    if (this.localPlayer && !this.spectating) {
      const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
      const mounted = this.localMountedVehicleId > 0;
      // Base lerp 0.12 for walking, ramps up to 0.5 for fast vehicles
      const lerpVal = mounted ? 0.45 : Math.min(0.12 + speed / 2000, 0.35);
      this.cameras.main.setFollowOffset(0, 0);
      this.cameras.main.followOffset.set(0, 0);
      (this.cameras.main as any).lerp.set(lerpVal, lerpVal);
    }

    // Dash cooldown ring around player's feet
    this.dashCooldownGfx.clear();
    if (this.dashCooldownTimer > 0 && this.localPlayer && !isDead) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - delta);
      const pct = 1 - this.dashCooldownTimer / this.dashCooldownDuration;
      const radius = PLAYER_RADIUS + 4;
      const px = this.localPlayer.x;
      const py = this.localPlayer.y;
      // Background ring (dim)
      this.dashCooldownGfx.lineStyle(2, 0xffffff, 0.15);
      this.dashCooldownGfx.strokeCircle(px, py, radius);
      // Filled arc showing progress
      if (pct < 1) {
        this.dashCooldownGfx.lineStyle(2, 0x66ccff, 0.7);
        this.dashCooldownGfx.beginPath();
        this.dashCooldownGfx.arc(px, py, radius, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false);
        this.dashCooldownGfx.strokePath();
      }
    }

    // Respawn overlay timers (sandbox locker/pickup respawns)
    this.respawnOverlay.update(delta);

    // Interpolate remote players + update health bars + rotation + death
    this.remotePlayers.forEach((sprite, sessionId) => {
      const target = this.remoteTargets.get(sessionId);
      if (target) {
        const lerpFactor = 0.15;
        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);
        sprite.setRotation(target.angle);

        // Death state: fade out + death animation (use per-character anims)
        const ci = this.remoteCharIndices.get(sessionId) ?? 0;
        const hasCharAnims = this.anims.exists(`player_idle_${ci}`);
        const idleKey = hasCharAnims ? `player_idle_${ci}` : "player_idle";
        const walkKey = hasCharAnims ? `player_walk_${ci}` : "player_walk";
        const deathKey = hasCharAnims ? `player_death_${ci}` : "player_death";

        if (target.state === "dead") {
          sprite.setAlpha(0.3);
          sprite.play(deathKey, true);
        } else if (target.state === "moving") {
          sprite.setAlpha(1);
          sprite.play(walkKey, true);
        } else {
          sprite.setAlpha(1);
          sprite.play(idleKey, true);
        }

        // Update health bar (with shield)
        const hpBar = this.remoteHealthBars.get(sessionId);
        if (hpBar) {
          this.drawRemoteHealthBar(hpBar, sprite.x, sprite.y, target.health, target.shieldHp);
        }

        // Buff tinting for remote players
        if (target.damageMultiplier > 1.0) {
          sprite.setTint(0xff6666); // red tint for damage buff
        } else if (target.speedMultiplier > 1.0) {
          sprite.setTint(0x66ccff); // blue tint for speed buff
        } else if (target.shieldHp > 0) {
          sprite.setTint(0xcc88ff); // purple tint for shield
        } else {
          sprite.clearTint(); // Kenney sprites have their own colors
        }
      }
    });

    // Interpolate vehicle positions + update visuals
    this.vehicleContainers.forEach((container, vehicleId) => {
      const target = this.vehicleTargets.get(vehicleId);
      if (!target) return;

      // Faster lerp for the vehicle the local player is riding (matches player lerp)
      const isLocal = vehicleId === this.localMountedVehicleId;
      const posLerp = isLocal ? 0.4 : 0.25;

      container.x = Phaser.Math.Linear(container.x, target.x, posLerp);
      container.y = Phaser.Math.Linear(container.y, target.y, posLerp);

      // Rotate the sprite (first child), not the label.
      // Vehicle textures are drawn pointing up, so add π/2 to align with heading.
      const sprite = container.getAt(0) as Phaser.GameObjects.Sprite;
      if (sprite) {
        const targetAngle = target.angle + Math.PI / 2;
        const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - sprite.rotation);
        sprite.rotation += angleDiff * 0.3;
      }

      // Alpha based on state
      if (target.destroyed) {
        container.setAlpha(0.2);
      } else if (target.riderId) {
        container.setAlpha(0.7);
      } else {
        container.setAlpha(1);
      }

      // Update durability bar
      const bar = this.vehicleDurabilityBars.get(vehicleId);
      if (bar) {
        bar.clear();
        if (target.riderId && !target.destroyed) {
          const barW = 32;
          const barH = 3;
          const barX = container.x - barW / 2;
          const barY = container.y + 22;
          bar.fillStyle(0x000000, 0.6);
          bar.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          const pct = Math.max(0, target.durabilityPct);
          const color = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffff00 : 0xff4444;
          bar.fillStyle(color, 0.9);
          bar.fillRect(barX, barY, barW * pct, barH);
        }
      }
    });

    // Track server projectile count for debug
    const room = this.network.getRoom();
    if (room) {
      this.serverProjectileCount = (room.state as any)?.projectiles?.length ?? 0;
    }

    // Update interaction prompt
    this.updateInteractPrompt();
    this.updatePickupTooltip();

    // Update combat
    this.combatManager.update(time, delta);

    // Update minimap
    if (this.localPlayer) {
      const remotes = this.testMode ? this.getRemotePlayerData() : undefined;
      this.minimap.update(this.localPlayer.x, this.localPlayer.y, this.getLockerData(), remotes);
    }

    // Update spectator camera
    if (this.spectating && this.spectateTargetId) {
      const targetSprite = this.remotePlayers.get(this.spectateTargetId);
      if (targetSprite) {
        this.cameras.main.centerOn(targetSprite.x, targetSprite.y);
        if (this.spectateLabel) {
          const name = this.playerNames.get(this.spectateTargetId) ?? this.spectateTargetId.substring(0, 6);
          this.spectateLabel.setText(`Spectating: ${name} [< >]`);
          this.spectateLabel.setPosition(targetSprite.x, targetSprite.y - PLAYER_RADIUS - 14);
          this.spectateLabel.setVisible(true);
        }
      } else {
        // Target gone, try to find another
        this.cycleSpectateTarget(1);
      }
    } else if (this.spectateLabel) {
      this.spectateLabel.setVisible(false);
    }

    // Update weapon HUD
    this.weaponHud.update(this.localMeleeWeaponId, this.localRangedWeaponId, this.localConsumableSlot1, this.localConsumableSlot2, this.localHealth, this.localShieldHp, this.localRangedAmmo);

    // Update match HUD
    this.matchHud.update(
      this.matchPhase,
      this.matchAlivePlayers,
      this.matchTotalPlayers,
      this.localEliminated,
      this.matchWinner,
      this.matchCountdownSeconds,
      delta,
      this.matchWinnerName,
      this.getScoreboardEntries(),
      this.localSessionId ?? undefined
    );

    // Flush artificial latency queue
    this.network.flush();

    // Update debug overlay
    const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
    const meleeWeapon = getWeaponConfig(this.localMeleeWeaponId);
    const rangedWeapon = this.localRangedWeaponId ? getWeaponConfig(this.localRangedWeaponId) : null;
    this.debugOverlay.update({
      room: this.network.getRoom(),
      localSprite: this.localPlayer,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      speed,
      activeProjectiles: this.combatManager.getActiveProjectileCount(),
      shootCooldown: this.combatManager.getShootCooldownRemaining(),
      meleeCooldown: this.combatManager.getMeleeCooldownRemaining(),
      aimAngle,
      comboState: this.stateMachine.getState(),
      lastCombo: this.comboDetector.getLastDetected(),
      inputBufferHistory: this.inputBuffer.getHistory(30),
      pendingInputCount: this.pendingInputs.length,
      artificialLatency: this.network.getArtificialDelay(),
      localHealth: this.localHealth,
      localKills: this.localKills,
      serverProjectileCount: this.serverProjectileCount,
      meleeWeaponName: meleeWeapon?.name ?? "Fists",
      rangedWeaponName: rangedWeapon?.name ?? "--",
      matchPhase: this.matchPhase,
      alivePlayers: this.matchAlivePlayers,
      localEliminated: this.localEliminated,
    });
  }

  /** Get per-weapon projectile texture key */
  private getProjectileTexture(_weaponId: string): string {
    return "proj_default";
  }

  // ─── Projectile animation configs ────────────────────────────────────

  private static readonly PROJECTILE_ANIM_CONFIGS: Record<string, {
    rotationSpeed?: number; // deg/s (0 = face travel direction)
    scalePulse?: { min: number; max: number; duration: number };
    alphaPulse?: { min: number; max: number; duration: number };
  }> = {};

  /** Apply per-weapon tween animations to a projectile sprite. Returns tweens for cleanup. */
  private applyProjectileAnimation(sprite: Phaser.GameObjects.Sprite, weaponId: string): Phaser.Tweens.Tween[] {
    const tweens: Phaser.Tweens.Tween[] = [];
    const cfg = GameScene.PROJECTILE_ANIM_CONFIGS[weaponId];
    if (!cfg) return tweens;

    // Rotation: 0 = face travel direction (set externally), >0 = continuous spin
    if (cfg.rotationSpeed && cfg.rotationSpeed > 0) {
      const degsPerMs = cfg.rotationSpeed / 1000;
      tweens.push(this.tweens.add({
        targets: sprite,
        angle: 360,
        duration: 360 / cfg.rotationSpeed * 1000,
        repeat: -1,
        ease: "Linear",
      }));
    }

    // Scale pulse
    if (cfg.scalePulse) {
      tweens.push(this.tweens.add({
        targets: sprite,
        scaleX: { from: cfg.scalePulse.min, to: cfg.scalePulse.max },
        scaleY: { from: cfg.scalePulse.min, to: cfg.scalePulse.max },
        duration: cfg.scalePulse.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }));
    }

    // Alpha pulse
    if (cfg.alphaPulse) {
      tweens.push(this.tweens.add({
        targets: sprite,
        alpha: { from: cfg.alphaPulse.min, to: cfg.alphaPulse.max },
        duration: cfg.alphaPulse.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }));
    }

    return tweens;
  }

  /** Clean up tweens for a projectile (destroy + remove from map) */
  private cleanupProjectileTweens(tweens: Phaser.Tweens.Tween[]) {
    for (const tw of tweens) {
      tw.destroy();
    }
  }

  /** Get per-weapon pickup texture key */
  private getPickupTexture(weaponId: string): string {
    const key = `pickup_${weaponId}`;
    if (this.textures.exists(key)) return key;
    return "pickup";
  }

  private getConsumablePickupTexture(consumableId: string): string {
    const key = `pickup_${consumableId}`;
    if (this.textures.exists(key)) return key;
    return "pickup";
  }


  /** Build scoreboard entries from current room state */
  private getScoreboardEntries(): ScoreboardEntry[] {
    const room = this.network.getRoom();
    if (!room) return [];
    const entries: ScoreboardEntry[] = [];
    const state = room.state as any;
    if (state?.players) {
      state.players.forEach((player: any, sessionId: string) => {
        entries.push({
          sessionId,
          displayName: this.playerNames.get(sessionId) ?? sessionId.substring(0, 6),
          kills: player.kills ?? 0,
          deaths: player.deaths ?? 0,
          wins: player.wins ?? 0,
          eliminated: player.eliminated ?? false,
        });
      });
    }
    return entries;
  }

  /** Get locker data for minimap rendering */
  private getLockerData(): Array<{ x: number; y: number; opened: boolean }> {
    const room = this.network.getRoom();
    if (!room) return [];
    const lockers: Array<{ x: number; y: number; opened: boolean }> = [];
    const state = room.state as any;
    if (state?.lockers) {
      for (let i = 0; i < state.lockers.length; i++) {
        const l = state.lockers.at(i);
        if (l) lockers.push({ x: l.x, y: l.y, opened: l.opened });
      }
    }
    return lockers;
  }

  /** Get remote player positions for minimap */
  private getRemotePlayerData(): Array<{ x: number; y: number; state: string }> {
    const result: Array<{ x: number; y: number; state: string }> = [];
    for (const [, data] of this.remoteTargets) {
      result.push({ x: data.x, y: data.y, state: data.state });
    }
    return result;
  }

  /** Show "Press E" prompt when near a closed locker */
  private updateInteractPrompt() {
    if (!this.localPlayer) {
      this.interactPrompt.setVisible(false);
      return;
    }

    const room = this.network.getRoom();
    if (!room) {
      this.interactPrompt.setVisible(false);
      return;
    }

    // If mounted, show dismount prompt above player
    if (this.localMountedVehicleId > 0) {
      this.interactPrompt.setText("Press E to dismount");
      this.interactPrompt.setPosition(this.localPlayer.x, this.localPlayer.y - PLAYER_RADIUS - 20);
      this.interactPrompt.setVisible(true);
      return;
    }

    const state = room.state as any;

    // Check for nearby vehicle first
    if (state?.vehicles) {
      let nearestVDist = Infinity;
      let nearestVX = 0;
      let nearestVY = 0;
      let nearestVName = "";

      for (let i = 0; i < state.vehicles.length; i++) {
        const v = state.vehicles.at(i);
        if (!v || v.destroyed || v.riderId) continue;

        const dx = this.localPlayer.x - v.x;
        const dy = this.localPlayer.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= VEHICLE_INTERACT_RANGE && dist < nearestVDist) {
          nearestVDist = dist;
          nearestVX = v.x;
          nearestVY = v.y;
          const cfg = getVehicleConfig(v.vehicleId);
          nearestVName = cfg?.name ?? v.vehicleId;
        }
      }

      if (nearestVDist <= VEHICLE_INTERACT_RANGE) {
        this.interactPrompt.setText(`Press E: ${nearestVName}`);
        this.interactPrompt.setPosition(nearestVX, nearestVY - 24);
        this.interactPrompt.setVisible(true);
        return;
      }
    }

    // Check for nearby lockers
    if (state?.lockers) {
      let nearestDist = Infinity;
      let nearestX = 0;
      let nearestY = 0;

      for (let i = 0; i < state.lockers.length; i++) {
        const locker = state.lockers.at(i);
        if (!locker || locker.opened) continue;

        const dx = this.localPlayer.x - locker.x;
        const dy = this.localPlayer.y - locker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= LOCKER_INTERACT_RANGE && dist < nearestDist) {
          nearestDist = dist;
          nearestX = locker.x;
          nearestY = locker.y;
        }
      }

      if (nearestDist <= LOCKER_INTERACT_RANGE) {
        this.interactPrompt.setText("Press E");
        this.interactPrompt.setPosition(nearestX, nearestY - 24);
        this.interactPrompt.setVisible(true);
        return;
      }
    }

    this.interactPrompt.setVisible(false);
  }

  private updatePickupTooltip() {
    if (this.hoveredPickupId === null || !this.localPlayer) {
      this.pickupTooltip.setVisible(false);
      return;
    }

    const container = this.pickupSprites.get(this.hoveredPickupId);
    if (!container) {
      this.hoveredPickupId = null;
      this.pickupTooltip.setVisible(false);
      return;
    }

    // Check distance — only show tooltip when within range
    const dx = this.localPlayer.x - container.x;
    const dy = this.localPlayer.y - container.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > PICKUP_INTERACT_RANGE) {
      this.pickupTooltip.setVisible(false);
      return;
    }

    const weaponId = this.pickupWeaponIds.get(this.hoveredPickupId);
    if (!weaponId) {
      this.pickupTooltip.setVisible(false);
      return;
    }

    const weapon = getWeaponConfig(weaponId);
    if (!weapon) {
      this.pickupTooltip.setVisible(false);
      return;
    }

    // Build tooltip text
    const lines: string[] = [weapon.name];
    lines.push(`Slot: ${weapon.slot}`);
    if (weapon.slot === "melee") {
      lines.push(`Damage: ${weapon.meleeDamage ?? 0}`);
      lines.push(`Range: ${weapon.meleeRange ?? 0}`);
      lines.push(`Arc: ${weapon.meleeArcDegrees ?? 0}°`);
      lines.push(`Cooldown: ${weapon.meleeCooldownMs ?? 0}ms`);
    } else {
      const retainedAmmo = this.pickupAmmo.get(this.hoveredPickupId!) ?? -1;
      const ammoCount = retainedAmmo >= 0 ? retainedAmmo : (weapon.maxAmmo ?? 0);
      lines.push(`Ammo: ${ammoCount}/${weapon.maxAmmo ?? 0}`);
      lines.push(`Damage: ${weapon.damage ?? 0}`);
      lines.push(`Fire rate: ${weapon.fireRateMs ?? 0}ms`);
      lines.push(`Range: ${weapon.projectileRange ?? 0}`);
    }
    lines.push("[Click to pick up]");

    this.pickupTooltipText.setText(lines.join("\n"));
    this.pickupTooltip.setPosition(container.x, container.y - 20);
    this.pickupTooltip.setVisible(true);
  }

  private drawRemoteHealthBar(g: Phaser.GameObjects.Graphics, x: number, y: number, health: number, shieldHp = 0) {
    g.clear();

    const barWidth = 32;
    const barHeight = 4;
    const barY = y - PLAYER_RADIUS - 8;
    const barX = x - barWidth / 2;

    // Background
    g.fillStyle(0x000000, 0.6);
    g.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // Health fill
    const ratio = Math.max(0, health / MAX_HEALTH);
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
    g.fillStyle(color, 0.9);
    g.fillRect(barX, barY, barWidth * ratio, barHeight);

    // Shield bar (purple, above health bar)
    if (shieldHp > 0) {
      const shieldY = barY - 5;
      const shieldRatio = Math.min(1, shieldHp / 40);
      g.fillStyle(0x000000, 0.6);
      g.fillRect(barX - 1, shieldY - 1, barWidth + 2, 4);
      g.fillStyle(0xdd88ff, 0.9);
      g.fillRect(barX, shieldY, barWidth * shieldRatio, 3);
    }
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

  private applySharedMovement(dx: number, dy: number, dt: number) {
    if (!this.localPlayer) return;

    // Use the shared movement function (identical to server)
    const result = applyMovement(
      this.localPlayer.x, this.localPlayer.y,
      this.velocityX, this.velocityY,
      dx, dy, dt
    );

    // Resolve wall collisions using shared function
    const resolved = resolveWallCollisions(result.x, result.y, PLAYER_RADIUS, this.wallRects);

    // Zero velocity on axes where collision occurred
    this.velocityX = Math.abs(resolved.x - result.x) > 0.01 ? 0 : result.vx;
    this.velocityY = Math.abs(resolved.y - result.y) > 0.01 ? 0 : result.vy;

    // Set position directly on game object — Phaser body syncs automatically
    this.localPlayer.x = resolved.x;
    this.localPlayer.y = resolved.y;
  }

  private enterSpectatorMode() {
    this.spectating = true;
    if (this.localPlayer) {
      this.localPlayer.setAlpha(0);
      this.cameras.main.stopFollow();
    }
    // Pick first alive remote player to spectate
    this.cycleSpectateTarget(1);
  }

  private exitSpectatorMode() {
    this.spectating = false;
    this.spectateTargetId = null;
    if (this.spectateLabel) {
      this.spectateLabel.setVisible(false);
    }
    if (this.localPlayer) {
      this.localPlayer.setAlpha(1);
      this.cameras.main.startFollow(this.localPlayer, true, 0.12, 0.12);
      this.cameras.main.setDeadzone(20, 20);
    }
  }

  private cycleSpectateTarget(direction: number) {
    // Get list of alive remote player session IDs
    const aliveIds: string[] = [];
    this.remoteTargets.forEach((data, id) => {
      if (data.state !== "dead") {
        aliveIds.push(id);
      }
    });

    if (aliveIds.length === 0) {
      this.spectateTargetId = null;
      return;
    }

    if (!this.spectateTargetId || !aliveIds.includes(this.spectateTargetId)) {
      this.spectateTargetId = aliveIds[0];
      return;
    }

    const currentIdx = aliveIds.indexOf(this.spectateTargetId);
    const nextIdx = ((currentIdx + direction) % aliveIds.length + aliveIds.length) % aliveIds.length;
    this.spectateTargetId = aliveIds[nextIdx];
  }

  private reconcile(serverPlayer: any) {
    if (!this.localPlayer) return;

    this.debugOverlay.setServerPos(serverPlayer.x, serverPlayer.y);

    const lastProcessed = serverPlayer.lastProcessedInput;

    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessed
    );

    // During a dash, the trajectory is deterministic (fixed direction + speed),
    // so client prediction is highly accurate. Instead of snapping to server
    // position (which causes 20Hz stutter), trust client prediction and only
    // blend gently toward server to correct any drift.
    if (this.stateMachine.isDashing() || serverPlayer.state === "dashing") {
      const dx = serverPlayer.x - this.localPlayer.x;
      const dy = serverPlayer.y - this.localPlayer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only correct if drift is significant (> 2px), and blend gently
      if (dist > 2) {
        const blend = dist > 50 ? 0.5 : 0.15;
        this.localPlayer.x += dx * blend;
        this.localPlayer.y += dy * blend;
      }
      this.pendingInputs = [];
      return;
    }

    // When mounted, vehicle position is server-authoritative — no input replay.
    // The update() loop interpolates toward the vehicle container each frame,
    // so we just let that handle it and don't snap here.
    if (this.localMountedVehicleId > 0) {
      this.pendingInputs = [];
      return;
    }

    // Reset to server-confirmed state
    let x = serverPlayer.x as number;
    let y = serverPlayer.y as number;
    let vx = (serverPlayer.vx as number) ?? 0;
    let vy = (serverPlayer.vy as number) ?? 0;

    // Replay all unconfirmed inputs using the shared movement function
    for (const input of this.pendingInputs) {
      const result = applyMovement(x, y, vx, vy, input.dx, input.dy, input.dt);
      const resolved = resolveWallCollisions(result.x, result.y, PLAYER_RADIUS, this.wallRects);

      vx = Math.abs(resolved.x - result.x) > 0.01 ? 0 : result.vx;
      vy = Math.abs(resolved.y - result.y) > 0.01 ? 0 : result.vy;
      x = resolved.x;
      y = resolved.y;
    }

    this.velocityX = vx;
    this.velocityY = vy;

    // Smooth small corrections instead of hard-snapping (reduces jitter at high speed)
    const errX = x - this.localPlayer.x;
    const errY = y - this.localPlayer.y;
    const errDist = Math.sqrt(errX * errX + errY * errY);
    if (errDist > 100) {
      // Large desync — snap immediately
      this.localPlayer.x = x;
      this.localPlayer.y = y;
    } else if (errDist > 0.5) {
      // Small correction — blend toward target
      this.localPlayer.x += errX * 0.3;
      this.localPlayer.y += errY * 0.3;
    }
  }
}
