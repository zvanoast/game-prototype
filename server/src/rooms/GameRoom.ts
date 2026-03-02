import { Room, Client } from "colyseus";
import { GameStateSchema, PlayerSchema } from "../state/GameState";
import { CombatSystem } from "../systems/CombatSystem";
import { LootSystem } from "../systems/LootSystem";
import { BuffSystem } from "../systems/BuffSystem";
import { MatchSystem } from "../systems/MatchSystem";
import {
  TICK_RATE,
  TICK_INTERVAL_MS,
  PLAYER_RADIUS,
  MAX_HEALTH,
  MAX_PLAYERS_PER_ROOM,
  CHARACTER_COUNT,
  DASH_DISTANCE,
  DASH_DURATION_FRAMES,
  CONSUMABLE_USE_COOLDOWN_MS,
  buildWallRects,
  resolveWallCollisions,
  applyMovement,
} from "shared";
import { Button } from "shared";
import type { InputPayload, WallRect } from "shared";

interface QueuedInput {
  sessionId: string;
  input: InputPayload;
}

export class GameRoom extends Room<GameStateSchema> {
  private inputQueue: QueuedInput[] = [];
  private tickInterval!: ReturnType<typeof setInterval>;
  private wallRects!: WallRect[];
  private combatSystem!: CombatSystem;
  private lootSystem!: LootSystem;
  private buffSystem!: BuffSystem;
  private matchSystem!: MatchSystem;

  // Track previous buttons per player for edge detection
  private prevButtons = new Map<string, number>();

  // Per-player dash state
  private dashStates = new Map<string, { timeLeft: number; angle: number }>();

  // Per-player consumable use cooldown (ms remaining)
  private consumableCooldowns = new Map<string, number>();

  // Taken character indices (enforces unique character per room)
  // Public so the REST API can read it
  takenCharacters = new Set<number>();

  // Dash constants (derived from shared)
  private static DASH_DURATION_S = DASH_DURATION_FRAMES / 60;
  private static DASH_SPEED = DASH_DISTANCE / (DASH_DURATION_FRAMES / 60);

  onCreate(options?: { sandbox?: boolean }) {
    this.setState(new GameStateSchema());
    this.maxClients = MAX_PLAYERS_PER_ROOM;

    // Pre-compute wall collision rects once
    this.wallRects = buildWallRects();

    // Create loot system (before combat system, since combat needs it)
    this.lootSystem = new LootSystem(this, this.state);
    this.lootSystem.initLockers();

    // Create buff system
    this.buffSystem = new BuffSystem();

    // Create match system
    this.matchSystem = new MatchSystem(
      this,
      this.state,
      this.lootSystem,
      () => this.findSafeSpawn()
    );

    // Create combat system
    this.combatSystem = new CombatSystem(
      this,
      this.state,
      this.wallRects,
      () => this.findSafeSpawn(),
      this.lootSystem
    );

    // Cross-wire systems
    this.combatSystem.setMatchSystem(this.matchSystem);
    this.combatSystem.setBuffSystem(this.buffSystem);
    this.matchSystem.setCombatSystem(this.combatSystem);
    this.matchSystem.setBuffSystem(this.buffSystem);

    // Sandbox mode: skip match lifecycle
    if (options?.sandbox) {
      this.matchSystem.enableSandbox();
      console.log("Sandbox mode enabled");
    }

    // Listen for input messages
    this.onMessage("input", (client: Client, input: InputPayload) => {
      // Basic validation
      if (
        typeof input.seq !== "number" ||
        typeof input.dx !== "number" ||
        typeof input.dy !== "number"
      ) {
        return;
      }
      this.inputQueue.push({ sessionId: client.sessionId, input });
    });

    // Listen for pickup click messages
    this.onMessage("pickup_click", (client: Client, data: { pickupId: number }) => {
      if (typeof data?.pickupId !== "number") return;
      this.lootSystem.processPickupClick(client.sessionId, data.pickupId);
    });

    // Start fixed-rate simulation loop
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    console.log(`GameRoom created. Tick rate: ${TICK_RATE}Hz, wallRects: ${this.wallRects.length}, lockers: ${this.state.lockers.length}`);
  }

  onJoin(client: Client, options?: { nickname?: string; characterIndex?: number }) {
    const player = new PlayerSchema();

    // Sanitize and set display name
    const raw = (options?.nickname ?? "").trim().substring(0, 16);
    player.displayName = raw || `Player ${client.sessionId.substring(0, 4)}`;

    // Assign character — honour request if available, otherwise pick next free
    const requested = (typeof options?.characterIndex === "number" &&
      options.characterIndex >= 0 && options.characterIndex < CHARACTER_COUNT)
      ? options.characterIndex : 0;

    if (!this.takenCharacters.has(requested)) {
      player.characterIndex = requested;
    } else {
      // Find the first available character index
      let assigned = 0;
      for (let i = 0; i < CHARACTER_COUNT; i++) {
        if (!this.takenCharacters.has(i)) {
          assigned = i;
          break;
        }
      }
      player.characterIndex = assigned;
    }
    this.takenCharacters.add(player.characterIndex);

    // Find a valid spawn position that doesn't overlap walls
    const pos = this.findSafeSpawn();
    player.x = pos.x;
    player.y = pos.y;
    player.vx = 0;
    player.vy = 0;
    player.health = MAX_HEALTH;
    player.state = "idle";

    this.state.players.set(client.sessionId, player);
    this.combatSystem.registerPlayer(client.sessionId);
    this.lootSystem.registerPlayer(client.sessionId);
    this.buffSystem.registerPlayer(client.sessionId);
    this.matchSystem.onPlayerJoin(client.sessionId);
    this.prevButtons.set(client.sessionId, 0);
    console.log(`Player joined: ${client.sessionId} as character ${player.characterIndex} at (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`);
  }

  onLeave(client: Client) {
    // Release character index before removing player
    const player = this.state.players.get(client.sessionId);
    if (player) {
      this.takenCharacters.delete(player.characterIndex);
    }

    this.lootSystem.unregisterPlayer(client.sessionId);
    this.combatSystem.unregisterPlayer(client.sessionId);
    this.buffSystem.unregisterPlayer(client.sessionId);
    this.matchSystem.onPlayerLeave(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.prevButtons.delete(client.sessionId);
    this.dashStates.delete(client.sessionId);
    this.consumableCooldowns.delete(client.sessionId);
    console.log(`Player left: ${client.sessionId}`);
  }

  onDispose() {
    clearInterval(this.tickInterval);
    console.log("GameRoom disposed");
  }

  private findSafeSpawn(): { x: number; y: number } {
    const margin = PLAYER_RADIUS * 4;
    const mapW = 2048; // MAP_WIDTH_PX
    const mapH = 2048; // MAP_HEIGHT_PX

    for (let attempt = 0; attempt < 50; attempt++) {
      const x = margin + Math.random() * (mapW - margin * 2);
      const y = margin + Math.random() * (mapH - margin * 2);

      // Check if this position overlaps any wall
      const resolved = resolveWallCollisions(x, y, PLAYER_RADIUS, this.wallRects);
      const dx = resolved.x - x;
      const dy = resolved.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // If resolved position is very close to original, it's safe
      if (dist < 1) {
        return { x, y };
      }
    }

    // Fallback: center of map (should always be clear)
    return { x: mapW / 2, y: mapH / 2 };
  }

  private tick() {
    const tick = this.state.tick;
    const phase = this.matchSystem.getPhase();
    const frozen = phase === "waiting" || phase === "countdown" || phase === "ended";

    // Process all queued inputs
    for (const { sessionId, input } of this.inputQueue) {
      const player = this.state.players.get(sessionId);
      if (!player || player.state === "dead") {
        // Still track last processed input for reconciliation even when dead
        if (player) player.lastProcessedInput = input.seq;
        continue;
      }

      // Use client's dt if provided, otherwise use fixed tick dt
      const dt = (typeof input.dt === "number" && input.dt > 0 && input.dt < 0.1)
        ? input.dt
        : 1 / TICK_RATE;

      // Movement (frozen during waiting/countdown/ended phase)
      if (!frozen) {
        // Clamp input direction
        const dx = Math.max(-1, Math.min(1, input.dx));
        const dy = Math.max(-1, Math.min(1, input.dy));

        // Edge-detect DASH button
        const prev = this.prevButtons.get(sessionId) ?? 0;
        const dashPressed = !!(input.buttons & Button.DASH) && !(prev & Button.DASH);

        if (dashPressed && !this.dashStates.has(sessionId)) {
          // Start dash — direction from movement input or aim angle
          const dashAngle = (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)
            ? Math.atan2(dy, dx)
            : input.aimAngle;
          this.dashStates.set(sessionId, {
            timeLeft: GameRoom.DASH_DURATION_S,
            angle: dashAngle,
          });
        }

        const dash = this.dashStates.get(sessionId);
        if (dash) {
          // Dash movement — fixed velocity in dash direction
          const newX = player.x + Math.cos(dash.angle) * GameRoom.DASH_SPEED * dt;
          const newY = player.y + Math.sin(dash.angle) * GameRoom.DASH_SPEED * dt;
          const resolved = resolveWallCollisions(newX, newY, PLAYER_RADIUS, this.wallRects);
          player.x = resolved.x;
          player.y = resolved.y;
          player.vx = 0;
          player.vy = 0;
          player.state = "dashing";

          dash.timeLeft -= dt;
          if (dash.timeLeft <= 0) {
            this.dashStates.delete(sessionId);
            player.state = "idle";
          }
        } else {
          // Normal acceleration-based movement (with speed buff)
          const speedMult = this.buffSystem.getSpeedMultiplier(sessionId);
          const moveResult = applyMovement(
            player.x, player.y,
            player.vx, player.vy,
            dx, dy, dt,
            speedMult
          );

          // Shared wall collision resolution
          const resolved = resolveWallCollisions(
            moveResult.x, moveResult.y,
            PLAYER_RADIUS, this.wallRects
          );

          // If wall collision pushed us back, zero velocity in that axis
          let finalVx = moveResult.vx;
          let finalVy = moveResult.vy;
          if (Math.abs(resolved.x - moveResult.x) > 0.01) {
            finalVx = 0;
          }
          if (Math.abs(resolved.y - moveResult.y) > 0.01) {
            finalVy = 0;
          }

          player.x = resolved.x;
          player.y = resolved.y;
          player.vx = finalVx;
          player.vy = finalVy;

          const mag = Math.sqrt(dx * dx + dy * dy);
          player.state = mag > 0.1 ? "moving" : "idle";
        }
      }

      player.angle = input.aimAngle;

      // Track last processed input for client reconciliation
      player.lastProcessedInput = input.seq;

      // Detect INTERACT and USE_CONSUMABLE press (edge detection)
      if (!frozen) {
        const prev = this.prevButtons.get(sessionId) ?? 0;
        const interactPressed = !!(input.buttons & Button.INTERACT) && !(prev & Button.INTERACT);
        if (interactPressed) {
          this.lootSystem.processInteract(sessionId);
        }

        const useConsumablePressed = !!(input.buttons & Button.USE_CONSUMABLE) && !(prev & Button.USE_CONSUMABLE);
        if (useConsumablePressed) {
          const cd = this.consumableCooldowns.get(sessionId) ?? 0;
          if (cd <= 0) {
            const consumableId = this.lootSystem.useConsumable(sessionId);
            if (consumableId) {
              this.buffSystem.useConsumable(sessionId, consumableId, player);
              this.consumableCooldowns.set(sessionId, CONSUMABLE_USE_COOLDOWN_MS);
              this.broadcast("consumable_used", {
                sessionId,
                consumableId,
              });
            }
          }
        }

        this.prevButtons.set(sessionId, input.buttons);
      }

      // Process combat input (CombatSystem internally gates by match phase)
      this.combatSystem.processInput(sessionId, input, tick);
    }

    // Clear queue
    this.inputQueue.length = 0;

    // Tick pickups (auto-collect)
    this.lootSystem.tickPickups(tick);

    // Tick projectiles
    this.combatSystem.tickProjectiles(TICK_INTERVAL_MS);

    // Tick respawns
    this.combatSystem.updateRespawns(TICK_INTERVAL_MS);

    // Tick buff system (decrement timers, expire buffs)
    const expiredBuffs = this.buffSystem.tick(TICK_INTERVAL_MS, (sid) => this.state.players.get(sid));
    for (const entry of expiredBuffs) {
      const [sid, buffType] = entry.split(":");
      this.broadcast("buff_expired", { sessionId: sid, buffType });
    }

    // Decrement consumable cooldowns
    this.consumableCooldowns.forEach((cd, sid) => {
      if (cd > 0) {
        this.consumableCooldowns.set(sid, cd - TICK_INTERVAL_MS);
      }
    });

    // Tick match system (phase transitions, timers)
    this.matchSystem.tick(TICK_INTERVAL_MS);

    // Advance server tick
    this.state.tick++;
  }
}
