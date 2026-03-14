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
  DISMOUNT_PLAYER_SPEED_FACTOR,
  DISMOUNT_PLAYER_SPEED_CAP,
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
  /** Last player who rode this vehicle — used for kill attribution after dismount */
  lastRiderId: string;
  durabilityRemainingMs: number;
  totalDurabilityMs: number;
  destroyed: boolean;
  /** Vehicle heading in radians (the direction it's facing) */
  heading: number;
  /** Current vehicle velocity (px/s) — persists between ticks for momentum */
  vx: number;
  vy: number;
  /** Per-target run-over cooldowns (ms remaining) */
  runOverCooldowns: Map<string, number>;
}

export class VehicleSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private combatSystem!: CombatSystem;
  private vehicles = new Map<number, ServerVehicle>();
  private nextId = 1;
  private wallRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  private resolveWalls!: (x: number, y: number, r: number, walls: any[]) => { x: number; y: number };

  // Track which vehicle each player is riding (sessionId → schemaId)
  private playerVehicle = new Map<string, number>();

  constructor(room: Room<GameStateSchema>, state: GameStateSchema) {
    this.room = room;
    this.state = state;
  }

  setWallData(
    wallRects: Array<{ x: number; y: number; w: number; h: number }>,
    resolveWalls: (x: number, y: number, r: number, walls: any[]) => { x: number; y: number },
  ) {
    this.wallRects = wallRects;
    this.resolveWalls = resolveWalls;
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
      lastRiderId: "",
      durabilityRemainingMs: config.durabilityMs,
      totalDurabilityMs: config.durabilityMs,
      destroyed: false,
      heading: 0,
      vx: 0,
      vy: 0,
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

  /** Get vehicle config for a mounted player, or null if not mounted */
  getMountedConfig(sessionId: string): VehicleConfig | null {
    const schemaId = this.playerVehicle.get(sessionId);
    if (schemaId === undefined) return null;
    const sv = this.vehicles.get(schemaId);
    return sv ? sv.config : null;
  }

  /** Get vehicle speed for a mounted player, or 0 if not mounted */
  getMountedSpeed(sessionId: string): number {
    const config = this.getMountedConfig(sessionId);
    return config ? config.maxSpeed : 0;
  }

  /**
   * Apply vehicle physics with W/S throttle + A/D steering.
   *
   * Input interpretation (from client WASD):
   *   inputDy < 0 (W) → throttle forward along heading
   *   inputDy > 0 (S) → brake / reverse
   *   inputDx < 0 (A) → steer left (rotate heading CCW)
   *   inputDx > 0 (D) → steer right (rotate heading CW)
   *
   * Grip controls how quickly the actual velocity direction aligns with
   * the heading. Low grip = drifting, high grip = go-kart.
   */
  applyVehicleMovement(
    sessionId: string,
    inputDx: number, inputDy: number,
    aimAngle: number,
    dt: number,
    wallRects: Array<{ x: number; y: number; w: number; h: number }>,
    resolveWalls: (x: number, y: number, r: number, walls: any[]) => { x: number; y: number },
    playerRadius: number,
  ): void {
    const schemaId = this.playerVehicle.get(sessionId);
    if (schemaId === undefined) return;
    const sv = this.vehicles.get(schemaId);
    if (!sv) return;

    const player = this.state.players.get(sessionId);
    if (!player) return;

    const cfg = sv.config;

    // ── Steering: A/D rotate the heading ──
    if (inputDx < -0.1) sv.heading -= cfg.turnSpeed * dt;
    if (inputDx > 0.1)  sv.heading += cfg.turnSpeed * dt;

    // Normalize heading to [-π, π]
    sv.heading = Math.atan2(Math.sin(sv.heading), Math.cos(sv.heading));

    // ── Throttle / Brake ──
    // Project current velocity onto heading to get forward speed
    const headCos = Math.cos(sv.heading);
    const headSin = Math.sin(sv.heading);
    const forwardSpeed = sv.vx * headCos + sv.vy * headSin;

    const throttle = inputDy < -0.1;   // W pressed
    const braking  = inputDy > 0.1;    // S pressed

    if (throttle) {
      // Accelerate forward along heading
      sv.vx += headCos * cfg.accel * dt;
      sv.vy += headSin * cfg.accel * dt;
    } else if (braking) {
      if (forwardSpeed > 10) {
        // Moving forward — apply brakes (decelerate)
        sv.vx -= headCos * cfg.brakeAccel * dt;
        sv.vy -= headSin * cfg.brakeAccel * dt;
      } else {
        // Stopped or slow — reverse
        sv.vx -= headCos * cfg.accel * 0.6 * dt;
        sv.vy -= headSin * cfg.accel * 0.6 * dt;
      }
    } else {
      // Coasting — apply passive friction
      const speed = Math.sqrt(sv.vx * sv.vx + sv.vy * sv.vy);
      if (speed > 1) {
        const decel = Math.min(cfg.friction * dt, speed);
        const scale = (speed - decel) / speed;
        sv.vx *= scale;
        sv.vy *= scale;
      } else {
        sv.vx = 0;
        sv.vy = 0;
      }
    }

    // ── Grip: blend velocity direction toward heading ──
    // Split velocity into forward (along heading) and lateral (perpendicular) components.
    // Grip reduces the lateral component each tick — high grip = tight cornering,
    // low grip = the vehicle slides/drifts.
    const fwd = sv.vx * headCos + sv.vy * headSin;
    const latX = sv.vx - fwd * headCos;
    const latY = sv.vy - fwd * headSin;
    const gripFactor = 1 - Math.pow(1 - cfg.grip, dt * 60); // frame-rate independent
    sv.vx = fwd * headCos + latX * (1 - gripFactor);
    sv.vy = fwd * headSin + latY * (1 - gripFactor);

    // ── Speed clamp ──
    const speed = Math.sqrt(sv.vx * sv.vx + sv.vy * sv.vy);
    const fwdNow = sv.vx * headCos + sv.vy * headSin;
    const maxSpd = fwdNow >= 0 ? cfg.maxSpeed : cfg.reverseSpeed;
    if (speed > maxSpd) {
      const scale = maxSpd / speed;
      sv.vx *= scale;
      sv.vy *= scale;
    }

    // ── Apply velocity to position ──
    const newX = player.x + sv.vx * dt;
    const newY = player.y + sv.vy * dt;
    const resolved = resolveWalls(newX, newY, playerRadius, wallRects);

    // Wall collision kills velocity on blocked axis
    if (Math.abs(resolved.x - newX) > 0.01) sv.vx = 0;
    if (Math.abs(resolved.y - newY) > 0.01) sv.vy = 0;

    player.x = resolved.x;
    player.y = resolved.y;
    player.vx = 0;
    player.vy = 0;

    // Sync heading to player angle (so the vehicle sprite rotates correctly)
    player.angle = sv.heading;

    const moving = Math.sqrt(sv.vx * sv.vx + sv.vy * sv.vy) > 5;
    player.state = moving ? "moving" : "idle";
  }

  /** Tick durability, coasting, and run-over collisions */
  tickVehicles(dtMs: number) {
    const dt = dtMs / 1000;

    for (const [schemaId, sv] of this.vehicles) {
      if (sv.destroyed) continue;

      const schema = this.findSchema(schemaId);

      if (sv.riderId) {
        // ── Ridden vehicle ──
        sv.durabilityRemainingMs -= dtMs;

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

        // Sync vehicle position/angle to rider
        const rider = this.state.players.get(sv.riderId);
        if (rider && schema) {
          schema.x = rider.x;
          schema.y = rider.y;
          schema.angle = sv.heading;
        }

        // Run-over check (using rider position)
        if (sv.config.canRunOver && rider) {
          this.tickRunOver(sv, rider.x, rider.y, sv.riderId);
        }
      } else {
        // ── Riderless vehicle — coast with friction ──
        const speed = Math.sqrt(sv.vx * sv.vx + sv.vy * sv.vy);
        if (speed > 1 && schema) {
          // Apply vehicle's own friction to slow it down
          const decel = Math.min(sv.config.friction * dt, speed);
          const scale = (speed - decel) / speed;
          sv.vx *= scale;
          sv.vy *= scale;

          // Move the vehicle
          const newX = schema.x + sv.vx * dt;
          const newY = schema.y + sv.vy * dt;

          if (this.resolveWalls) {
            const resolved = this.resolveWalls(newX, newY, VEHICLE_RUN_OVER_RADIUS, this.wallRects);
            if (Math.abs(resolved.x - newX) > 0.01) sv.vx = 0;
            if (Math.abs(resolved.y - newY) > 0.01) sv.vy = 0;
            schema.x = resolved.x;
            schema.y = resolved.y;
          } else {
            schema.x = newX;
            schema.y = newY;
          }

          // Riderless run-over check (damage attributed to last rider)
          if (sv.config.canRunOver && sv.lastRiderId) {
            this.tickRunOver(sv, schema.x, schema.y, sv.lastRiderId);
          }
        } else if (speed <= 1) {
          sv.vx = 0;
          sv.vy = 0;
        }
      }

      // Tick run-over cooldowns
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

  /** Check run-over collisions at a given position, attributed to attackerId */
  private tickRunOver(sv: ServerVehicle, vx: number, vy: number, attackerId: string) {
    const hitRadius = VEHICLE_RUN_OVER_RADIUS + PLAYER_RADIUS;

    this.state.players.forEach((target: PlayerSchema, targetId: string) => {
      if (targetId === sv.riderId) return;
      if (targetId === attackerId && !sv.riderId) return; // don't hit the player who just dismounted
      if (target.state === "dead") return;
      if (this.playerVehicle.has(targetId)) return;

      const dx = target.x - vx;
      const dy = target.y - vy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius) {
        if (sv.runOverCooldowns.has(targetId)) return;

        sv.runOverCooldowns.set(targetId, VEHICLE_RUN_OVER_COOLDOWN_MS);

        if (this.combatSystem) {
          this.combatSystem.applyDamage(targetId, target, sv.config.runOverDamage, attackerId, "vehicle");
        }

        this.room.broadcast("vehicle_hit", {
          targetId,
          attackerId,
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
    sv.lastRiderId = sessionId;
    sv.heading = player.angle; // face where the player is aiming on mount
    sv.vx = 0;
    sv.vy = 0;
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

    // Transfer momentum to player (capped)
    if (sv && player) {
      const vehicleSpeed = Math.sqrt(sv.vx * sv.vx + sv.vy * sv.vy);
      if (vehicleSpeed > 1) {
        const playerSpeed = Math.min(
          vehicleSpeed * DISMOUNT_PLAYER_SPEED_FACTOR,
          DISMOUNT_PLAYER_SPEED_CAP,
        );
        const scale = playerSpeed / vehicleSpeed;
        player.vx = sv.vx * scale;
        player.vy = sv.vy * scale;
      }
      // Vehicle keeps its full velocity — it coasts on its own
      sv.lastRiderId = sessionId;
    }

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
