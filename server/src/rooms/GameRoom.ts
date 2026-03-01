import { Room, Client } from "colyseus";
import { GameStateSchema, PlayerSchema } from "../state/GameState";
import { CombatSystem } from "../systems/CombatSystem";
import {
  TICK_RATE,
  TICK_INTERVAL_MS,
  PLAYER_RADIUS,
  MAX_HEALTH,
  MAX_PLAYERS_PER_ROOM,
  buildWallRects,
  resolveWallCollisions,
  applyMovement,
} from "shared";
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

  onCreate() {
    this.setState(new GameStateSchema());
    this.maxClients = MAX_PLAYERS_PER_ROOM;

    // Pre-compute wall collision rects once
    this.wallRects = buildWallRects();

    // Create combat system
    this.combatSystem = new CombatSystem(
      this,
      this.state,
      this.wallRects,
      () => this.findSafeSpawn()
    );

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

    // Start fixed-rate simulation loop
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    console.log(`GameRoom created. Tick rate: ${TICK_RATE}Hz, wallRects: ${this.wallRects.length}`);
  }

  onJoin(client: Client) {
    const player = new PlayerSchema();

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
    console.log(`Player joined: ${client.sessionId} at (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.combatSystem.unregisterPlayer(client.sessionId);
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

    // Process all queued inputs
    for (const { sessionId, input } of this.inputQueue) {
      const player = this.state.players.get(sessionId);
      if (!player || player.state === "dead") continue;

      // Use client's dt if provided, otherwise use fixed tick dt
      const dt = (typeof input.dt === "number" && input.dt > 0 && input.dt < 0.1)
        ? input.dt
        : 1 / TICK_RATE;

      // Clamp input direction
      const dx = Math.max(-1, Math.min(1, input.dx));
      const dy = Math.max(-1, Math.min(1, input.dy));

      // Shared acceleration-based movement
      const moveResult = applyMovement(
        player.x, player.y,
        player.vx, player.vy,
        dx, dy, dt
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

      // Update player state
      player.x = resolved.x;
      player.y = resolved.y;
      player.vx = finalVx;
      player.vy = finalVy;
      player.angle = input.aimAngle;

      const mag = Math.sqrt(dx * dx + dy * dy);
      player.state = mag > 0.1 ? "moving" : "idle";

      // Track last processed input for client reconciliation
      player.lastProcessedInput = input.seq;

      // Process combat input
      this.combatSystem.processInput(sessionId, input, tick);
    }

    // Clear queue
    this.inputQueue.length = 0;

    // Tick projectiles
    this.combatSystem.tickProjectiles(TICK_INTERVAL_MS);

    // Tick respawns
    this.combatSystem.updateRespawns(TICK_INTERVAL_MS);

    // Advance server tick
    this.state.tick++;
  }
}
