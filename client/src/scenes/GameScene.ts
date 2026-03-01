import Phaser from "phaser";
import { NetworkManager } from "../network/NetworkManager";
import { DebugOverlay } from "../ui/DebugOverlay";
import { Minimap } from "../ui/Minimap";
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
  PLAYER_SPEED,
  PLAYER_RADIUS,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  CHARGED_SHOT_MIN_FRAMES,
  SHAKE_SHOOT_MAG,
  SHAKE_SHOOT_DURATION,
  SHAKE_MELEE_HIT_MAG,
  SHAKE_MELEE_HIT_DURATION,
  SHAKE_CHARGED_SHOT_MAG,
  SHAKE_CHARGED_SHOT_DURATION,
  HITSTOP_MELEE_MS,
  HITSTOP_CHARGED_MS,
} from "shared";
import { Button } from "shared";
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
  private minimap!: Minimap;
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
  };

  // Local player
  private localPlayer: Phaser.Physics.Arcade.Sprite | null = null;
  private inputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private velocityX = 0;
  private velocityY = 0;
  private offlineMode = false;

  // Button state tracking
  private attackHeld = false;

  // Remote players
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteTargets = new Map<string, { x: number; y: number }>();

  // Dummies
  private dummies: TestDummy[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Create tilemap
    this.tilemapManager = new TilemapManager(this);

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

    // Damage numbers
    this.damageNumbers = new DamageNumberManager(this);

    // Combat manager (initialized after player spawns)
    this.combatManager = new CombatManager(this);

    // Connect to server
    this.network = new NetworkManager();
    this.connectToServer();
  }

  private spawnLocalPlayer(x: number, y: number) {
    this.localPlayer = this.physics.add.sprite(x, y, "player");
    this.localPlayer.setOrigin(0.5, 0.5);
    this.localPlayer.setDepth(10);

    // Circular physics body
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS, 0, 0);
    body.setCollideWorldBounds(false);

    // Wall collision
    this.physics.add.collider(this.localPlayer, this.tilemapManager.getWallLayer());

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

      room.state.players.onAdd((player: any, sessionId: string) => {
        if (sessionId === room.sessionId) {
          this.spawnLocalPlayer(player.x, player.y);
          console.log("Local player spawned");
        } else {
          const sprite = this.add.sprite(player.x, player.y, "player_remote");
          sprite.setOrigin(0.5, 0.5);
          sprite.setDepth(9);
          this.remotePlayers.set(sessionId, sprite);
          this.remoteTargets.set(sessionId, { x: player.x, y: player.y });
          console.log(`Remote player joined: ${sessionId}`);
        }

        player.onChange(() => {
          if (sessionId === room.sessionId) {
            this.reconcile(player);
          } else {
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

      room.onLeave((code: number) => {
        console.log(`Disconnected from room (code: ${code})`);
      });
    } catch (err) {
      console.warn("Connection failed, starting in offline mode:", err);
      this.offlineMode = true;
      this.spawnLocalPlayer(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
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

    // Button state: track attack (left mouse)
    const leftDown = pointer.leftButtonDown();
    let buttons = 0;
    if (leftDown) buttons |= Button.ATTACK;
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

    // Send input to server
    if (this.network.getRoom()) {
      this.inputSeq++;
      const input: InputPayload = {
        seq: this.inputSeq,
        tick: 0,
        dx,
        dy,
        aimAngle,
        buttons,
      };
      this.network.sendInput(input);
      this.pendingInputs.push({ seq: this.inputSeq, dx, dy, dt });
    } else if (this.offlineMode) {
      this.inputSeq++;
    }

    // Movement & combat
    if (this.localPlayer) {
      if (dashState) {
        // During dash: override movement with dash velocity
        const dashVx = Math.cos(dashState.angle) * dashState.speedPerFrame * 60; // convert per-frame to per-second for physics
        const dashVy = Math.sin(dashState.angle) * dashState.speedPerFrame * 60;
        const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(dashVx, dashVy);
        this.velocityX = dashVx;
        this.velocityY = dashVy;

        // Make player semi-transparent during dash (invulnerability indicator)
        this.localPlayer.setAlpha(0.5);

        // Dash trail particles
        this.particles.dashTrail(this.localPlayer.x, this.localPlayer.y);
      } else {
        // Normal acceleration movement (blocked during state lock except dash)
        if (!this.stateMachine.isLocked()) {
          this.applyMovementWithAcceleration(dx, dy, dt);
          this.stateMachine.setMoving(dx !== 0 || dy !== 0);
        } else {
          // Locked states (combo_executing, etc.) — slow down
          this.applyMovementWithAcceleration(0, 0, dt);
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

    // Interpolate remote players
    this.remotePlayers.forEach((sprite, sessionId) => {
      const target = this.remoteTargets.get(sessionId);
      if (target) {
        const lerpFactor = 0.15;
        sprite.x = Phaser.Math.Linear(sprite.x, target.x, lerpFactor);
        sprite.y = Phaser.Math.Linear(sprite.y, target.y, lerpFactor);
      }
    });

    // Update combat
    this.combatManager.update(time, delta);

    // Update dummies
    for (const dummy of this.dummies) {
      dummy.update(time, delta);
    }

    // Update minimap
    if (this.localPlayer) {
      this.minimap.update(this.localPlayer.x, this.localPlayer.y);
    }

    // Update debug overlay
    const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
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
    });
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

  private applyMovementWithAcceleration(dx: number, dy: number, dt: number) {
    if (!this.localPlayer) return;

    let ix = dx;
    let iy = dy;
    const mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    if (mag > 0) {
      this.velocityX += ix * PLAYER_ACCELERATION * dt;
      this.velocityY += iy * PLAYER_ACCELERATION * dt;
    } else {
      const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
      if (speed > 0) {
        const frictionAmount = PLAYER_FRICTION * dt;
        if (frictionAmount >= speed) {
          this.velocityX = 0;
          this.velocityY = 0;
        } else {
          const ratio = (speed - frictionAmount) / speed;
          this.velocityX *= ratio;
          this.velocityY *= ratio;
        }
      }
    }

    const currentSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
    if (currentSpeed > PLAYER_SPEED) {
      const scale = PLAYER_SPEED / currentSpeed;
      this.velocityX *= scale;
      this.velocityY *= scale;
    }

    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(this.velocityX, this.velocityY);
  }

  private reconcile(serverPlayer: any) {
    if (!this.localPlayer) return;

    this.debugOverlay.setServerPos(serverPlayer.x, serverPlayer.y);

    const lastProcessed = serverPlayer.lastProcessedInput;

    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessed
    );

    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    body.reset(serverPlayer.x, serverPlayer.y);
    this.velocityX = 0;
    this.velocityY = 0;

    for (const input of this.pendingInputs) {
      this.replayInput(input);
    }

    body.setVelocity(this.velocityX, this.velocityY);
  }

  private replayInput(input: PendingInput) {
    if (!this.localPlayer) return;

    let ix = input.dx;
    let iy = input.dy;
    const mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    if (mag > 0) {
      this.velocityX += ix * PLAYER_ACCELERATION * input.dt;
      this.velocityY += iy * PLAYER_ACCELERATION * input.dt;
    } else {
      const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
      if (speed > 0) {
        const frictionAmount = PLAYER_FRICTION * input.dt;
        if (frictionAmount >= speed) {
          this.velocityX = 0;
          this.velocityY = 0;
        } else {
          const ratio = (speed - frictionAmount) / speed;
          this.velocityX *= ratio;
          this.velocityY *= ratio;
        }
      }
    }

    const currentSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
    if (currentSpeed > PLAYER_SPEED) {
      const scale = PLAYER_SPEED / currentSpeed;
      this.velocityX *= scale;
      this.velocityY *= scale;
    }

    this.localPlayer.x += this.velocityX * input.dt;
    this.localPlayer.y += this.velocityY * input.dt;

    this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
    this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
  }
}
