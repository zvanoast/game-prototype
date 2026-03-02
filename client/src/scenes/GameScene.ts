import Phaser from "phaser";
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
import { TestDummy, DUMMY_SPAWN_POSITIONS } from "../entities/TestDummy";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_RADIUS,
  MAX_HEALTH,
  LOCKER_INTERACT_RANGE,
  PICKUP_INTERACT_RANGE,
  CHARGED_SHOT_MIN_FRAMES,
  SHAKE_SHOOT_MAG,
  SHAKE_SHOOT_DURATION,
  SHAKE_MELEE_HIT_MAG,
  SHAKE_MELEE_HIT_DURATION,
  SHAKE_CHARGED_SHOT_MAG,
  SHAKE_CHARGED_SHOT_DURATION,
  SHAKE_DAMAGE_MAG,
  SHAKE_DAMAGE_DURATION,
  HITSTOP_MELEE_MS,
  HITSTOP_CHARGED_MS,
  applyMovement,
  resolveWallCollisions,
  buildWallRects,
  getWeaponConfig,
  getConsumableConfig,
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
  private localConsumableSlot1 = "";
  private localConsumableSlot2 = "";

  // Match state
  private matchPhase: string = "waiting";
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

  // Button state tracking
  private attackHeld = false;
  private prevAttackHeld = false;

  // Wall collision data (shared with server)
  private wallRects: WallRect[] = [];

  // Remote players
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, RemotePlayerData>();
  private remoteHealthBars = new Map<string, Phaser.GameObjects.Graphics>();

  // Server projectile sprites (keyed by projectile id)
  private serverProjectileSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private serverProjectileTrailCleanups = new Map<number, () => void>();

  // Lockers
  private lockerSprites = new Map<number, Phaser.GameObjects.Sprite>();

  // Pickups
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();
  private pickupWeaponIds = new Map<number, string>(); // pickup id → weapon id

  // Pickup tooltip
  private pickupTooltip!: Phaser.GameObjects.Container;
  private pickupTooltipText!: Phaser.GameObjects.Text;
  private hoveredPickupId: number | null = null;

  // Interaction prompt
  private interactPrompt!: Phaser.GameObjects.Text;

  // Dummies
  private dummies: TestDummy[] = [];

  // Server projectile count for debug
  private serverProjectileCount = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  // Test mode (offline, skips server connection)
  private testMode = false;

  init(data: { nickname?: string; testMode?: boolean } = {}) {
    this.nickname = data.nickname ?? "";
    this.testMode = data.testMode ?? false;
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
    this.localConsumableSlot1 = "";
    this.localConsumableSlot2 = "";
    this.matchPhase = "waiting";
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
    this.serverProjectileSprites.clear();
    this.serverProjectileTrailCleanups.clear();
    this.lockerSprites.clear();
    this.pickupSprites.clear();
    this.pickupWeaponIds.clear();
    this.hoveredPickupId = null;
    this.dummies = [];

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

    // ESC key returns to menu (works in both test mode and multiplayer)
    this.input.keyboard!.on("keydown-ESC", () => {
      this.network.disconnect();
      this.scene.start("MenuScene");
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
      this.network.disconnect();
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
    this.localPlayer.setTint(0x00ff88);
    this.localPlayer.play("player_idle");

    // Circular physics body (kept for overlap detection, not for movement)
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS, 0, 0);
    body.setCollideWorldBounds(false);
    body.moves = false; // We handle all movement — prevent Phaser from applying velocity

    // Camera follow with deadzone
    this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(40, 40);

    // Init combat manager with player
    this.combatManager.init(
      this.localPlayer,
      this.tilemapManager.getWallLayer(),
      this.dummies
    );

    // Wire state machine callbacks
    this.stateMachine.setCallbacks({
      onDash: (_angle: number, _speed: number) => {
        // Dash movement is handled in update() via dashState
      },
      onDashStrike: () => {
        this.combatManager.executeDashStrike();
      },
      onChargedShot: () => {
        if (this.network.isConnected()) {
          // Multiplayer: just emit sound/juice, server drives projectile sprite
          const rangedCfg = this.combatManager.getRangedConfig();
          if (rangedCfg) {
            this.events.emit("sfx:charged_shot");
            this.events.emit("juice:charged_shot", this.combatManager.getAimAngle());
            const spawnDist = 20;
            const px = this.localPlayer!.x + Math.cos(this.combatManager.getAimAngle()) * spawnDist;
            const py = this.localPlayer!.y + Math.sin(this.combatManager.getAimAngle()) * spawnDist;
            this.events.emit("particle:muzzle", px, py, this.combatManager.getAimAngle());
          }
        } else {
          this.combatManager.fireChargedShot();
        }
      },
    });
  }

  private setupJuiceListeners() {
    // Screen shake on shoot
    this.events.on("juice:shoot", (_angle: number) => {
      this.screenShake.shake(SHAKE_SHOOT_MAG, SHAKE_SHOOT_DURATION);
    });

    // Screen shake + hit-stop on charged shot fire
    this.events.on("juice:charged_shot", (_angle: number) => {
      this.screenShake.shake(SHAKE_CHARGED_SHOT_MAG, SHAKE_CHARGED_SHOT_DURATION);
    });

    // Hit-stop + shake on charged projectile hit
    this.events.on("juice:charged_hit", (attacker: Phaser.GameObjects.Sprite, target: Phaser.GameObjects.Sprite) => {
      this.screenShake.shake(SHAKE_CHARGED_SHOT_MAG, SHAKE_CHARGED_SHOT_DURATION);
      this.hitStop.freeze(HITSTOP_CHARGED_MS, [attacker, target]);
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

    // Death particles
    this.events.on("dummy:death", (x: number, y: number) => {
      this.particles.deathExplosion(x, y);
    });

    // Dash event
    this.events.on("state:dash_start", () => {
      this.events.emit("sfx:dash");
    });
  }

  private async connectToServer() {
    const roomType = this.testMode ? "sandbox" : "game";
    const options: Record<string, unknown> = { nickname: this.nickname };
    if (this.testMode) options.sandbox = true;

    try {
      const room = await this.network.connect(options, roomType);
      this.localSessionId = room.sessionId;

      // Enable multiplayer mode on combat manager (disable local damage)
      this.combatManager.setMultiplayerMode(true);

      // In sandbox, spawn dummies for local target practice
      if (this.testMode) {
        for (const pos of DUMMY_SPAWN_POSITIONS) {
          const dummy = new TestDummy(this, pos.x, pos.y, this.wallRects);
          this.dummies.push(dummy);
        }
      }

      // Track phase changes from state
      const trackState = () => {
        const state = room.state as any;
        this.matchPhase = state.phase ?? "waiting";
        this.matchAlivePlayers = state.alivePlayers ?? 0;
        this.matchCountdownSeconds = state.countdownSeconds ?? 0;
        this.matchTotalPlayers = state.players?.size ?? 0;

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
      };

      room.state.onChange(() => {
        trackState();
      });

      room.state.players.onAdd((player: any, sessionId: string) => {
        // Use server displayName
        const name = player.displayName || sessionId.substring(0, 6);
        this.playerNames.set(sessionId, name);

        if (sessionId === room.sessionId) {
          this.spawnLocalPlayer(player.x, player.y);
          this.localHealth = player.health;
          this.localShieldHp = player.shieldHp ?? 0;
          this.localKills = player.kills ?? 0;
          this.localEliminated = player.eliminated ?? false;
          this.localMeleeWeaponId = player.meleeWeaponId ?? WeaponId.Fists;
          this.localRangedWeaponId = player.rangedWeaponId ?? "";
          this.localConsumableSlot1 = player.consumableSlot1 ?? "";
          this.localConsumableSlot2 = player.consumableSlot2 ?? "";
          this.combatManager.setMeleeWeapon(this.localMeleeWeaponId);
          this.combatManager.setRangedWeapon(this.localRangedWeaponId);

          // If joining as eliminated (late joiner), enter spectator immediately
          if (this.localEliminated) {
            this.enterSpectatorMode();
          }
          console.log("Local player spawned", this.localEliminated ? "(eliminated, spectating)" : "");
        } else {
          const sprite = this.add.sprite(player.x, player.y, "player_sheet");
          sprite.setOrigin(0.5, 0.5);
          sprite.setDepth(9);
          sprite.setTint(0xff4444);
          sprite.play("player_idle");
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
          // Track displayName updates
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

            // Track consumable changes
            this.localConsumableSlot1 = player.consumableSlot1 ?? "";
            this.localConsumableSlot2 = player.consumableSlot2 ?? "";

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
      });

      room.state.players.onRemove((_player: any, sessionId: string) => {
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
        if (this.hoveredPickupId === pickup.id) {
          this.hoveredPickupId = null;
          this.pickupTooltip.setVisible(false);
        }
      });

      // Listen for server projectile state changes
      room.state.projectiles.onAdd((proj: any, _key: number) => {
        const texKey = proj.charged
          ? "proj_charged"
          : this.getProjectileTexture(proj.weaponId ?? "");
        const sprite = this.add.sprite(proj.x, proj.y, texKey);
        sprite.setDepth(8);
        sprite.setOrigin(0.5, 0.5);
        if (proj.charged) {
          sprite.setScale(2);
        }
        this.serverProjectileSprites.set(proj.id, sprite);

        // Attach projectile trail
        const weaponCfg = getWeaponConfig(proj.weaponId ?? "");
        const trailColor = proj.charged ? 0xff8800 : (weaponCfg?.projectileColor ?? 0xffff00);
        const trailCleanup = this.particles.projectileTrail(sprite, trailColor);
        this.serverProjectileTrailCleanups.set(proj.id, trailCleanup);

        proj.onChange(() => {
          const s = this.serverProjectileSprites.get(proj.id);
          if (s) {
            s.setPosition(proj.x, proj.y);
          }
        });
      });

      room.state.projectiles.onRemove((proj: any, _key: number) => {
        // Clean up trail
        const trailCleanup = this.serverProjectileTrailCleanups.get(proj.id);
        if (trailCleanup) {
          trailCleanup();
          this.serverProjectileTrailCleanups.delete(proj.id);
        }

        const sprite = this.serverProjectileSprites.get(proj.id);
        if (sprite) {
          // Impact particles on removal
          this.particles.impact(proj.x, proj.y, proj.charged ? 0xff8800 : 0xffff00);
          sprite.destroy();
          this.serverProjectileSprites.delete(proj.id);
        }
      });

      // Combat messages
      room.onMessage("hit", (data: any) => {
        // Show damage number at hit location
        this.events.emit("damage:number", data.x, data.y, data.damage);

        // Impact particles
        const color = data.type === "charged" ? 0xff8800 : data.type === "melee" ? 0xffffff : 0xffff00;
        this.particles.impact(data.x, data.y, color);

        // Screen shake if local player was hit
        if (data.targetId === room.sessionId) {
          this.screenShake.shake(SHAKE_DAMAGE_MAG, SHAKE_DAMAGE_DURATION);
        }
      });

      room.onMessage("melee_hit", (data: any) => {
        // Show melee impact particles at attacker position
        this.particles.impact(data.x, data.y, 0xffffff);
      });

      room.onMessage("kill", (data: any) => {
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
        // If the spectated player was eliminated, cycle
        if (this.spectating && this.spectateTargetId === data.sessionId) {
          this.cycleSpectateTarget(1);
        }
      });

      room.onMessage("match_start", () => {
        this.matchPhase = "playing";
        this.matchWinner = null;
        this.matchWinnerName = "";
        this.localEliminated = false;
        this.exitSpectatorMode();
        this.events.emit("sfx:match_start");
      });

      room.onMessage("match_end", (data: any) => {
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
        this.matchCountdownSeconds = data.seconds ?? 0;
        if (data.seconds > 0) {
          this.events.emit("sfx:countdown_beep");
        }
      });

      room.onMessage("respawn", (data: any) => {
        if (data.sessionId === room.sessionId && this.localPlayer) {
          // Reset local player
          this.localPlayer.setPosition(data.x, data.y);
          this.localPlayer.setAlpha(1);
          this.velocityX = 0;
          this.velocityY = 0;
          this.pendingInputs = [];
          this.localHealth = MAX_HEALTH;
          this.localEliminated = false;

          // Exit spectator mode on respawn (match reset)
          this.exitSpectatorMode();
        }
      });

      room.onMessage("projectile_wall", (data: any) => {
        this.particles.impact(data.x, data.y, data.charged ? 0xff8800 : 0xffff00);
      });

      room.onMessage("locker_opened", (data: any) => {
        // Particle burst at locker location
        this.particles.impact(data.x, data.y, 0x8B6914);
        this.events.emit("sfx:locker_open");
      });

      room.onMessage("weapon_pickup", (data: any) => {
        if (data.sessionId === room.sessionId) {
          // Particle burst on local player
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x00ff88);
          }
          this.events.emit("sfx:pickup");
        }
      });

      room.onMessage("consumable_pickup", (data: any) => {
        if (data.sessionId === room.sessionId) {
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x44ff44);
          }
          this.events.emit("sfx:pickup");
        }
      });

      room.onMessage("consumable_used", (data: any) => {
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
        // Particle puff when buff expires
        if (data.sessionId === room.sessionId) {
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x888888);
          }
        }
        this.events.emit("sfx:buff_expired");
      });

      room.onLeave((code: number) => {
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
    const leftDown = pointer.leftButtonDown();
    const rightDown = pointer.rightButtonDown();
    let buttons = 0;
    if (leftDown) buttons |= Button.ATTACK;
    if (rightDown) buttons |= Button.MELEE;
    if (this.keys.E.isDown) buttons |= Button.INTERACT;
    if (this.keys.Q.isDown) buttons |= Button.USE_CONSUMABLE;
    if (this.keys.SPACE.isDown) buttons |= Button.DASH;
    this.attackHeld = leftDown;

    // Snapshot charge frames before updateCharging resets them on release
    const chargeFramesBeforeUpdate = this.stateMachine.getChargeFrames();

    // Record input to buffer
    this.inputBuffer.recordFrame(dx, dy, buttons, aimAngle);

    // Run combo detection
    this.comboDetector.update();

    // Update state machine charging tracker
    this.stateMachine.updateCharging(this.attackHeld);

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
    const movementFrozen = this.matchPhase === "waiting" || this.matchPhase === "countdown" || this.matchPhase === "ended";

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
        buttons: isDead ? 0 : buttons,
        dt,
      };
      this.network.sendInput(input);
      if (canMove) {
        this.pendingInputs.push({ seq: this.inputSeq, dx, dy, dt, vx: this.velocityX, vy: this.velocityY });
      }
    }

    // Aim + combat (allowed when alive, even if movement frozen)
    if (this.localPlayer && !isDead) {
      // Rotate player toward mouse
      this.localPlayer.setRotation(aimAngle);

      // Combat aim
      this.combatManager.setAimAngle(aimAngle);

      // Fire prediction on release (matches server fire-on-release behavior)
      // In multiplayer, only emit muzzle flash/sound — actual projectile visuals
      // come from server state so they properly disappear on hit.
      const attackReleased = this.prevAttackHeld && !leftDown;
      if (attackReleased && this.stateMachine.canShoot()) {
        const wasCharged = chargeFramesBeforeUpdate >= CHARGED_SHOT_MIN_FRAMES;
        if (!wasCharged) {
          if (this.network.isConnected()) {
            // Multiplayer: just emit muzzle flash/sound, server drives projectile sprite
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
            // Offline: use local predicted projectiles
            this.combatManager.tryShoot();
          }
        }
        // Charged shots are fired by the combo system callback (fireChargedShot)
      }

      // Update charge visual
      this.combatManager.updateChargeVisual(
        this.stateMachine.isCharging(),
        this.stateMachine.getChargeFrames(),
        CHARGED_SHOT_MIN_FRAMES
      );
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
      } else if (dx !== 0 || dy !== 0) {
        this.localPlayer.play("player_walk", true);
      } else {
        this.localPlayer.play("player_idle", true);
      }
    } else if (this.localPlayer && !isDead && movementFrozen) {
      // Frozen but alive — show idle animation
      this.localPlayer.play("player_idle", true);
      this.localPlayer.setAlpha(1);
    }

    // Interpolate remote players + update health bars + rotation + death
    this.remotePlayers.forEach((sprite, sessionId) => {
      const target = this.remoteTargets.get(sessionId);
      if (target) {
        const lerpFactor = 0.15;
        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);
        sprite.setRotation(target.angle);

        // Death state: fade out + death animation
        if (target.state === "dead") {
          sprite.setAlpha(0.3);
          sprite.play("player_death", true);
        } else if (target.state === "moving") {
          sprite.setAlpha(1);
          sprite.play("player_walk", true);
        } else {
          sprite.setAlpha(1);
          sprite.play("player_idle", true);
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
          sprite.setTint(0xff4444); // default enemy tint
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

    // Update dummies
    for (const dummy of this.dummies) {
      dummy.update(time, delta);
    }

    // Update minimap
    if (this.localPlayer) {
      this.minimap.update(this.localPlayer.x, this.localPlayer.y, this.getLockerData());
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
    this.weaponHud.update(this.localMeleeWeaponId, this.localRangedWeaponId, this.localConsumableSlot1, this.localConsumableSlot2, this.localHealth, this.localShieldHp);

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
      this.matchPhase === "ended" ? this.getScoreboardEntries() : undefined,
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
      chargeFrames: this.stateMachine.getChargeFrames(),
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
  private getProjectileTexture(weaponId: string): string {
    switch (weaponId) {
      case "darts": return "proj_darts";
      case "plates": return "proj_plates";
      case "staple_gun": return "proj_staple_gun";
      default: return "proj_default";
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

    const state = room.state as any;
    if (!state?.lockers) {
      this.interactPrompt.setVisible(false);
      return;
    }

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
      this.interactPrompt.setPosition(nearestX, nearestY - 24);
      this.interactPrompt.setVisible(true);
    } else {
      this.interactPrompt.setVisible(false);
    }
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
      lines.push(`Damage: ${weapon.damage ?? 0}`);
      lines.push(`Fire rate: ${weapon.fireRateMs ?? 0}ms`);
      lines.push(`Range: ${weapon.projectileRange ?? 0}`);
      lines.push(`Speed: ${weapon.projectileSpeed ?? 0}`);
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
      this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
      this.cameras.main.setDeadzone(40, 40);
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

    // During a dash, skip input replay — dash is a fixed trajectory,
    // so trust the server position directly to avoid snap-back
    if (this.stateMachine.isDashing() || serverPlayer.state === "dashing") {
      this.localPlayer.x = serverPlayer.x;
      this.localPlayer.y = serverPlayer.y;
      this.velocityX = 0;
      this.velocityY = 0;
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

    this.localPlayer.x = x;
    this.localPlayer.y = y;
  }
}
