import { Room } from "colyseus";
import { GameStateSchema, PlayerSchema, VehicleSchema } from "../state/GameState";
import { CombatSystem } from "./CombatSystem";
import {
  PLAYER_RADIUS,
  VEHICLE_INTERACT_RANGE,
  VEHICLE_SPAWN_MIN,
  VEHICLE_SPAWN_MAX,
  VEHICLE_RUN_OVER_COOLDOWN_MS,
  VEHICLE_RUN_OVER_RADIUS,
} from "shared";
import {
  ALL_VEHICLE_IDS,
  VEHICLE_SPAWN_SLOTS,
  pickActiveVehicleSpawns,
  getVehicleConfig,
} from "shared";
import type { VehicleConfig } from "shared";

interface ServerVehicle {
  schemaId: number;
  config: VehicleConfig;
  riderId: string;
  durabilityRemainingMs: number;
  totalDurabilityMs: number;
  destroyed: boolean;
  /** Per-target run-over cooldowns (ms remaining) */
  runOverCooldowns: Map<string, number>;
}

export class VehicleSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private combatSystem!: CombatSystem;
  private vehicles = new Map<number, ServerVehicle>();
  private nextId = 1;

  // Track which vehicle each player is riding (sessionId → schemaId)
  private playerVehicle = new Map<string, number>();

  constructor(room: Room<GameStateSchema>, state: GameStateSchema) {
    this.room = room;
    this.state = state;
  }

  setCombatSystem(cs: CombatSystem) {
    this.combatSystem = cs;
  }

  /** Spawn vehicles at random positions for a match */
  initVehicles() {
    const spawns = pickActiveVehicleSpawns(VEHICLE_SPAWN_SLOTS, VEHICLE_SPAWN_MIN, VEHICLE_SPAWN_MAX);

    for (let i = 0; i < spawns.length; i++) {
      const vehicleId = ALL_VEHICLE_IDS[i % ALL_VEHICLE_IDS.length];
      this.spawnVehicle(vehicleId, spawns[i].x, spawns[i].y);
    }
  }

  /** Spawn ALL vehicles in a neat column layout (for sandbox/test mode) */
  spawnAllVehicles() {
    const centerX = 1024 + 400; // to the right of item columns
    const rowSpacing = 60;
    const startY = 1024 - ((ALL_VEHICLE_IDS.length - 1) * rowSpacing) / 2;

    for (let i = 0; i < ALL_VEHICLE_IDS.length; i++) {
      this.spawnVehicle(ALL_VEHICLE_IDS[i], centerX, startY + i * rowSpacing);
    }
  }

  private spawnVehicle(vehicleId: string, x: number, y: number) {
    const config = getVehicleConfig(vehicleId);
    if (!config) return;

    const schemaId = this.nextId++;

    const schema = new VehicleSchema();
    schema.id = schemaId;
    schema.vehicleId = vehicleId;
    schema.x = x;
    schema.y = y;
    schema.angle = 0;
    schema.riderId = "";
    schema.destroyed = false;
    schema.durabilityPct = 1.0;
    this.state.vehicles.push(schema);

    this.vehicles.set(schemaId, {
      schemaId,
      config,
      riderId: "",
      durabilityRemainingMs: config.durabilityMs,
      totalDurabilityMs: config.durabilityMs,
      destroyed: false,
      runOverCooldowns: new Map(),
    });
  }

  /** Try to mount a nearby vehicle. Returns true if mounted. */
  processMount(sessionId: string): boolean {
    if (this.playerVehicle.has(sessionId)) return false; // already mounted

    const player = this.state.players.get(sessionId);
    if (!player || player.state === "dead") return false;

    let bestDist = VEHICLE_INTERACT_RANGE + 1;
    let bestId = -1;

    // Find nearest available vehicle
    for (const [schemaId, sv] of this.vehicles) {
      if (sv.destroyed || sv.riderId) continue;

      const schema = this.findSchema(schemaId);
      if (!schema) continue;

      const dx = player.x - schema.x;
      const dy = player.y - schema.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= VEHICLE_INTERACT_RANGE && dist < bestDist) {
        bestDist = dist;
        bestId = schemaId;
      }
    }

    if (bestId < 0) return false;

    this.mount(sessionId, bestId);
    return true;
  }

  /** Dismount from current vehicle */
  processDismount(sessionId: string): boolean {
    const schemaId = this.playerVehicle.get(sessionId);
    if (schemaId === undefined) return false;
    this.dismount(sessionId);
    return true;
  }

  isPlayerMounted(sessionId: string): boolean {
    return this.playerVehicle.has(sessionId);
  }

  /** Get vehicle speed for a mounted player, or 0 if not mounted */
  getMountedSpeed(sessionId: string): number {
    const schemaId = this.playerVehicle.get(sessionId);
    if (schemaId === undefined) return 0;
    const sv = this.vehicles.get(schemaId);
    return sv ? sv.config.speed : 0;
  }

  /** Tick durability and run-over collisions */
  tickVehicles(dtMs: number) {
    for (const [schemaId, sv] of this.vehicles) {
      if (sv.destroyed) continue;

      // Only tick durability while ridden
      if (sv.riderId) {
        sv.durabilityRemainingMs -= dtMs;

        // Update schema durability
        const schema = this.findSchema(schemaId);
        if (schema) {
          schema.durabilityPct = Math.max(0, sv.durabilityRemainingMs / sv.totalDurabilityMs);
        }

        // Vehicle broke
        if (sv.durabilityRemainingMs <= 0) {
          this.dismount(sv.riderId);
          sv.destroyed = true;
          if (schema) schema.destroyed = true;
          this.room.broadcast("vehicle_destroyed", { vehicleId: schemaId });
          continue;
        }

        // Update vehicle position to rider position
        const rider = this.state.players.get(sv.riderId);
        if (rider && schema) {
          schema.x = rider.x;
          schema.y = rider.y;
          schema.angle = rider.angle;
        }

        // Run-over collision check
        if (sv.config.canRunOver && rider) {
          this.tickRunOver(sv, rider, dtMs);
        }
      }

      // Tick run-over cooldowns even when not colliding
      for (const [targetId, cd] of sv.runOverCooldowns) {
        const remaining = cd - dtMs;
        if (remaining <= 0) {
          sv.runOverCooldowns.delete(targetId);
        } else {
          sv.runOverCooldowns.set(targetId, remaining);
        }
      }
    }
  }

  private tickRunOver(sv: ServerVehicle, rider: PlayerSchema, _dtMs: number) {
    const hitRadius = VEHICLE_RUN_OVER_RADIUS + PLAYER_RADIUS;

    this.state.players.forEach((target: PlayerSchema, targetId: string) => {
      if (targetId === sv.riderId) return;
      if (target.state === "dead") return;
      // Don't hit other mounted players
      if (this.playerVehicle.has(targetId)) return;

      const dx = target.x - rider.x;
      const dy = target.y - rider.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius) {
        // Check cooldown
        if (sv.runOverCooldowns.has(targetId)) return;

        sv.runOverCooldowns.set(targetId, VEHICLE_RUN_OVER_COOLDOWN_MS);

        // Apply damage
        if (this.combatSystem) {
          this.combatSystem.applyDamage(targetId, target, sv.config.runOverDamage, sv.riderId, "vehicle");
        }

        this.room.broadcast("vehicle_hit", {
          targetId,
          attackerId: sv.riderId,
          vehicleName: sv.config.name,
          damage: sv.config.runOverDamage,
        });
      }
    });
  }

  /** Force dismount on death */
  onPlayerDeath(sessionId: string) {
    this.dismount(sessionId);
  }

  unregisterPlayer(sessionId: string) {
    this.dismount(sessionId);
  }

  /** Reset for new match */
  resetForNewMatch() {
    // Clear all vehicles
    while (this.state.vehicles.length > 0) {
      this.state.vehicles.pop();
    }
    this.vehicles.clear();
    this.playerVehicle.clear();
    this.nextId = 1;

    // Respawn
    this.initVehicles();
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private mount(sessionId: string, schemaId: number) {
    const sv = this.vehicles.get(schemaId);
    const schema = this.findSchema(schemaId);
    const player = this.state.players.get(sessionId);
    if (!sv || !schema || !player) return;

    sv.riderId = sessionId;
    schema.riderId = sessionId;
    this.playerVehicle.set(sessionId, schemaId);
    player.mountedVehicleSchemaId = schemaId;

    this.room.broadcast("vehicle_mount", {
      sessionId,
      vehicleSchemaId: schemaId,
      vehicleName: sv.config.name,
    });
  }

  private dismount(sessionId: string) {
    const schemaId = this.playerVehicle.get(sessionId);
    if (schemaId === undefined) return;

    const sv = this.vehicles.get(schemaId);
    const schema = this.findSchema(schemaId);
    const player = this.state.players.get(sessionId);

    if (sv) sv.riderId = "";
    if (schema) schema.riderId = "";
    if (player) player.mountedVehicleSchemaId = 0;
    this.playerVehicle.delete(sessionId);

    this.room.broadcast("vehicle_dismount", {
      sessionId,
      vehicleSchemaId: schemaId,
    });
  }

  private findSchema(schemaId: number): VehicleSchema | null {
    for (let i = 0; i < this.state.vehicles.length; i++) {
      const s = this.state.vehicles.at(i);
      if (s && s.id === schemaId) return s;
    }
    return null;
  }
}
