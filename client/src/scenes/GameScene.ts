import Phaser from "phaser";
import { NetworkManager } from "../network/NetworkManager";
import { DebugOverlay } from "../ui/DebugOverlay";
import { Minimap } from "../ui/Minimap";
import { WeaponHud } from "../ui/WeaponHud";
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
  WeaponId,
} from "shared";
import { Button } from "shared";
import type { InputPayload, WallRect } from "shared";

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
}

export class GameScene extends Phaser.Scene {
  private network!: NetworkManager;
  private debugOverlay!: DebugOverlay;
  private minimap!: Minimap;
  private weaponHud!: WeaponHud;
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
  };

  // Local player
  private localPlayer: Phaser.Physics.Arcade.Sprite | null = null;
  private localSessionId: string | null = null;
  private inputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private velocityX = 0;
  private velocityY = 0;
  private offlineMode = false;
  private localHealth = MAX_HEALTH;
  private localKills = 0;

  // Equipment tracking
  private localMeleeWeaponId = WeaponId.Fists as string;
  private localRangedWeaponId = "";

  // Button state tracking
  private attackHeld = false;

  // Wall collision data (shared with server)
  private wallRects: WallRect[] = [];

  // Remote players
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, RemotePlayerData>();
  private remoteHealthBars = new Map<string, Phaser.GameObjects.Graphics>();

  // Server projectile sprites (keyed by projectile id)
  private serverProjectileSprites = new Map<number, Phaser.GameObjects.Sprite>();

  // Lockers
  private lockerSprites = new Map<number, Phaser.GameObjects.Sprite>();

  // Pickups
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();

  // Interaction prompt
  private interactPrompt!: Phaser.GameObjects.Text;

  // Dummies
  private dummies: TestDummy[] = [];

  // Server projectile count for debug
  private serverProjectileCount = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
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
    };

    // Spawn test dummies
    for (const pos of DUMMY_SPAWN_POSITIONS) {
      const dummy = new TestDummy(this, pos.x, pos.y);
      this.dummies.push(dummy);
    }

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

    // Combat manager (initialized after player spawns)
    this.combatManager = new CombatManager(this);

    // Connect to server
    this.network = new NetworkManager();
    this.connectToServer();

    // Artificial latency keys (1-5)
    this.input.keyboard!.on("keydown-ONE", () => this.network.setArtificialDelay(0));
    this.input.keyboard!.on("keydown-TWO", () => this.network.setArtificialDelay(50));
    this.input.keyboard!.on("keydown-THREE", () => this.network.setArtificialDelay(100));
    this.input.keyboard!.on("keydown-FOUR", () => this.network.setArtificialDelay(200));
    this.input.keyboard!.on("keydown-FIVE", () => this.network.setArtificialDelay(500));
  }

  private spawnLocalPlayer(x: number, y: number) {
    this.localPlayer = this.physics.add.sprite(x, y, "player");
    this.localPlayer.setOrigin(0.5, 0.5);
    this.localPlayer.setDepth(10);

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
        this.combatManager.fireChargedShot();
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
    try {
      const room = await this.network.connect();
      this.localSessionId = room.sessionId;

      // Enable multiplayer mode on combat manager (disable local damage)
      this.combatManager.setMultiplayerMode(true);

      room.state.players.onAdd((player: any, sessionId: string) => {
        if (sessionId === room.sessionId) {
          this.spawnLocalPlayer(player.x, player.y);
          this.localHealth = player.health;
          this.localKills = player.kills ?? 0;
          this.localMeleeWeaponId = player.meleeWeaponId ?? WeaponId.Fists;
          this.localRangedWeaponId = player.rangedWeaponId ?? "";
          this.combatManager.setMeleeWeapon(this.localMeleeWeaponId);
          this.combatManager.setRangedWeapon(this.localRangedWeaponId);
          console.log("Local player spawned");
        } else {
          const sprite = this.add.sprite(player.x, player.y, "player_remote");
          sprite.setOrigin(0.5, 0.5);
          sprite.setDepth(9);
          this.remotePlayers.set(sessionId, sprite);
          this.remoteTargets.set(sessionId, {
            x: player.x,
            y: player.y,
            angle: player.angle ?? 0,
            health: player.health ?? MAX_HEALTH,
            state: player.state ?? "idle",
          });

          // Create health bar graphics for remote player
          const hpBar = this.add.graphics();
          hpBar.setDepth(15);
          this.remoteHealthBars.set(sessionId, hpBar);

          console.log(`Remote player joined: ${sessionId}`);
        }

        player.onChange(() => {
          if (sessionId === room.sessionId) {
            this.reconcile(player);
            this.localHealth = player.health;
            this.localKills = player.kills ?? 0;

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

            // Handle local player death state from server
            if (player.state === "dead" && this.localPlayer) {
              this.localPlayer.setAlpha(0.3);
            }
          } else {
            this.remoteTargets.set(sessionId, {
              x: player.x,
              y: player.y,
              angle: player.angle ?? 0,
              health: player.health ?? MAX_HEALTH,
              state: player.state ?? "idle",
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

      // --- Pickups ---
      room.state.pickups.onAdd((pickup: any, _key: number) => {
        const weapon = getWeaponConfig(pickup.weaponId);
        const color = weapon?.color ?? 0xffffff;

        const sprite = this.add.sprite(0, 0, "pickup");
        sprite.setTint(color);
        sprite.setOrigin(0.5, 0.5);

        const label = this.add.text(0, 12, weapon?.name ?? pickup.weaponId, {
          fontSize: "10px",
          fontFamily: "monospace",
          color: "#ffffff",
          backgroundColor: "#00000088",
          padding: { x: 2, y: 1 },
        });
        label.setOrigin(0.5, 0);

        const container = this.add.container(pickup.x, pickup.y, [sprite, label]);
        container.setDepth(5);
        this.pickupSprites.set(pickup.id, container);

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
      });

      // Listen for server projectile state changes
      room.state.projectiles.onAdd((proj: any, _key: number) => {
        // Skip projectiles owned by local player (already shown via client prediction)
        if (proj.ownerId === room.sessionId) return;

        const sprite = this.add.sprite(proj.x, proj.y, "projectile");
        sprite.setDepth(8);
        sprite.setOrigin(0.5, 0.5);
        if (proj.charged) {
          sprite.setTint(0xff8800);
          sprite.setScale(2);
        }
        this.serverProjectileSprites.set(proj.id, sprite);

        proj.onChange(() => {
          const s = this.serverProjectileSprites.get(proj.id);
          if (s) {
            s.setPosition(proj.x, proj.y);
          }
        });
      });

      room.state.projectiles.onRemove((proj: any, _key: number) => {
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
        }
      });

      room.onMessage("projectile_wall", (data: any) => {
        this.particles.impact(data.x, data.y, data.charged ? 0xff8800 : 0xffff00);
      });

      room.onMessage("locker_opened", (data: any) => {
        // Particle burst at locker location
        this.particles.impact(data.x, data.y, 0x8B6914);
      });

      room.onMessage("weapon_pickup", (data: any) => {
        if (data.sessionId === room.sessionId) {
          // Particle burst on local player
          if (this.localPlayer) {
            this.particles.impact(this.localPlayer.x, this.localPlayer.y, 0x00ff88);
          }
        }
      });

      room.onLeave((code: number) => {
        console.log(`Disconnected from room (code: ${code})`);
      });
    } catch (err) {
      console.warn("Connection failed, starting in offline mode:", err);
      this.offlineMode = true;
      this.spawnLocalPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
      this.combatManager.setOfflineDefaults();
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
    this.attackHeld = leftDown;

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

    // Don't send input or process movement if dead
    const isDead = this.localHealth <= 0;

    // Send input to server
    if (this.network.getRoom()) {
      this.inputSeq++;
      const input: InputPayload = {
        seq: this.inputSeq,
        tick: 0,
        dx: isDead ? 0 : dx,
        dy: isDead ? 0 : dy,
        aimAngle,
        buttons: isDead ? 0 : buttons,
        dt,
      };
      this.network.sendInput(input);
      if (!isDead) {
        this.pendingInputs.push({ seq: this.inputSeq, dx, dy, dt, vx: this.velocityX, vy: this.velocityY });
      }
    } else if (this.offlineMode) {
      this.inputSeq++;
    }

    // Movement & combat
    if (this.localPlayer && !isDead) {
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

      // Rotate player toward mouse
      this.localPlayer.setRotation(aimAngle);

      // Combat aim
      this.combatManager.setAimAngle(aimAngle);

      // Shoot on left click (only if not charging and state allows)
      if (leftDown && this.stateMachine.canShoot() && !this.stateMachine.isCharging()) {
        // Only fire on the frame the button goes down (not held)
        // Normal shots fire on press; charging is handled by combo system
        if (this.stateMachine.getChargeFrames() <= 1) {
          this.combatManager.tryShoot();
        }
      }

      // Update charge visual
      this.combatManager.updateChargeVisual(
        this.stateMachine.isCharging(),
        this.stateMachine.getChargeFrames(),
        CHARGED_SHOT_MIN_FRAMES
      );
    }

    // Interpolate remote players + update health bars + rotation + death
    this.remotePlayers.forEach((sprite, sessionId) => {
      const target = this.remoteTargets.get(sessionId);
      if (target) {
        const lerpFactor = 0.15;
        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);
        sprite.setRotation(target.angle);

        // Death state: fade out
        if (target.state === "dead") {
          sprite.setAlpha(0.3);
        } else {
          sprite.setAlpha(1);
        }

        // Update health bar
        const hpBar = this.remoteHealthBars.get(sessionId);
        if (hpBar) {
          this.drawRemoteHealthBar(hpBar, sprite.x, sprite.y, target.health);
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

    // Update weapon HUD
    this.weaponHud.update(this.localMeleeWeaponId, this.localRangedWeaponId);

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
    });
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

  private drawRemoteHealthBar(g: Phaser.GameObjects.Graphics, x: number, y: number, health: number) {
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

  private reconcile(serverPlayer: any) {
    if (!this.localPlayer) return;

    this.debugOverlay.setServerPos(serverPlayer.x, serverPlayer.y);

    const lastProcessed = serverPlayer.lastProcessedInput;

    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessed
    );

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
