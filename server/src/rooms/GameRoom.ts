import { Room, Client } from "colyseus";
import { GameStateSchema, PlayerSchema } from "../state/GameState";
import {
  TICK_RATE,
  TICK_INTERVAL_MS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  MAX_HEALTH,
  MAX_PLAYERS_PER_ROOM,
} from "shared";
import type { InputPayload } from "shared";

interface QueuedInput {
  sessionId: string;
  input: InputPayload;
}

export class GameRoom extends Room<GameStateSchema> {
  private inputQueue: QueuedInput[] = [];
  private tickInterval!: ReturnType<typeof setInterval>;

  onCreate() {
    this.setState(new GameStateSchema());
    this.maxClients = MAX_PLAYERS_PER_ROOM;

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

    console.log(`GameRoom created. Tick rate: ${TICK_RATE}Hz`);
  }

  onJoin(client: Client) {
    const player = new PlayerSchema();
    // Random spawn within arena bounds, away from edges
    const margin = PLAYER_RADIUS * 4;
    player.x = margin + Math.random() * (ARENA_WIDTH - margin * 2);
    player.y = margin + Math.random() * (ARENA_HEIGHT - margin * 2);
    player.health = MAX_HEALTH;
    player.state = "idle";

    this.state.players.set(client.sessionId, player);
    console.log(`Player joined: ${client.sessionId} at (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`Player left: ${client.sessionId}`);
  }

  onDispose() {
    clearInterval(this.tickInterval);
    console.log("GameRoom disposed");
  }

  private tick() {
    const dt = 1 / TICK_RATE; // fixed timestep in seconds

    // Process all queued inputs
    for (const { sessionId, input } of this.inputQueue) {
      const player = this.state.players.get(sessionId);
      if (!player || player.state === "dead") continue;

      // Normalize movement vector
      let dx = Math.max(-1, Math.min(1, input.dx));
      let dy = Math.max(-1, Math.min(1, input.dy));
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }

      // Apply movement
      player.x += dx * PLAYER_SPEED * dt;
      player.y += dy * PLAYER_SPEED * dt;

      // Clamp to arena boundaries
      player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
      player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));

      // Update aim angle
      player.angle = input.aimAngle;

      // Update player state
      player.state = mag > 0.1 ? "moving" : "idle";

      // Track last processed input for client reconciliation
      player.lastProcessedInput = input.seq;
    }

    // Clear queue
    this.inputQueue.length = 0;

    // Advance server tick
    this.state.tick++;
  }
}
