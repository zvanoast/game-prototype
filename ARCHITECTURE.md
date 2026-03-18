# Architecture — Storage Wars

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Phaser 3)                    │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Input    │  │   Combo      │  │  Client-Side      │  │
│  │  Buffer   │──│   Detector   │──│  Prediction       │  │
│  │ (raw keys)│  │ (pattern     │  │ (apply input      │  │
│  │           │  │  matching)   │  │  immediately)     │  │
│  └──────────┘  └──────────────┘  └────────┬──────────┘  │
│                                           │              │
│  ┌──────────────────────┐    ┌────────────▼──────────┐  │
│  │  Renderer / Scenes   │◄───│  Entity Interpolation │  │
│  │  (Phaser scenes,     │    │  (smooth remote       │  │
│  │   sprites, FX)       │    │   players between     │  │
│  └──────────────────────┘    │   server ticks)       │  │
│                               └────────────┬──────────┘  │
│                                            │              │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ WebSocket ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ │
└────────────────────────────────────────────┼─────────────┘
                                             │
┌────────────────────────────────────────────┼─────────────┐
│                  SERVER (Colyseus)          │             │
│                                            ▼              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  GameRoom    │  │  Physics     │  │  Combat      │   │
│  │  (lifecycle, │──│  System      │──│  System      │   │
│  │   tick loop) │  │  (movement,  │  │  (damage,    │   │
│  │              │  │   collision) │  │   hitboxes)  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Loot        │  │  State       │  │  Match       │   │
│  │  System      │  │  Schema      │  │  Lifecycle   │   │
│  │  (lockers,   │  │  (Colyseus   │  │  (lobby,     │   │
│  │   pickups)   │  │   sync)      │  │   elim.)     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Client Architecture

### Scene Flow

```
BootScene → MenuScene → GameScene → GameOverScene
   │                       │              │
   │ (load assets)         │ (gameplay)   │ (results)
   │                       │              │
   └───────────────────────┴──────────────┘
                  (restart cycle)
```

### Input Buffer System

The input buffer is a fixed-size circular buffer that records every frame's input state. This is the foundation for the combo/tech system.

```typescript
// Conceptual structure (see shared/src/types.ts for actual definition)
interface FrameInput {
  tick: number;           // Frame number
  direction: Direction;   // 8-way directional (or neutral)
  buttons: ButtonState;   // Bitfield: attack, special, dodge, interact
  aimAngle: number;       // Mouse aim direction (radians)
}

// Buffer holds last N frames (e.g., 30 frames = 0.5 sec at 60fps)
// Oldest entries are overwritten as new frames arrive
```

### Combo Detection

Combos are defined as data — sequences of directional + button inputs with timing constraints.

```typescript
// Conceptual combo definition
interface ComboDefinition {
  name: string;                    // e.g., "dash_strike"
  sequence: ComboStep[];           // Ordered inputs to match
  windowFrames: number;            // Max frames for entire sequence
  requiredState: PlayerState[];    // Valid states to start from (e.g., idle, moving)
  resultAction: ActionType;        // What happens on successful input
}

interface ComboStep {
  direction?: Direction;           // Required direction (optional)
  button?: Button;                 // Required button press (optional)
  holdFrames?: number;             // Minimum hold duration (for charged moves)
  maxGapFrames: number;            // Max frames before this step must occur
}
```

The detector scans the input buffer on each frame, checking all registered combo patterns from longest to shortest (priority to complex combos). When a match is found, it fires an event.

### Client-Side Prediction

For responsive movement despite network latency:

1. Client records each input with a sequence number
2. Client immediately applies the input to the local player (prediction)
3. Client sends the input to the server
4. Server processes the input and includes the last-processed sequence number in state updates
5. Client receives server state, rewinds to the server's confirmed position, then re-applies all unconfirmed inputs

This means local movement feels instant while staying in sync with the server.

### Entity Interpolation

Remote players (other clients) are rendered with interpolation:

1. Client stores the last 2-3 server state snapshots for each remote entity
2. Renderer displays entities at a position slightly in the past (e.g., 100ms behind)
3. Position is linearly interpolated between the two nearest snapshots
4. This produces smooth movement even with 50ms+ between server updates

## Server Architecture

### Tick Loop

The server runs a fixed-rate simulation loop (default 20 Hz for prototype):

```
Each tick:
  1. Process all queued client inputs (movement, combat, interact)
  2. Run LootSystem.tickPickups()  — check pickup collisions, auto-equip
  3. Run CombatSystem.tickProjectiles() — move projectiles, check hits
  4. Run CombatSystem.updateRespawns()  — respawn dead players
  5. Check win conditions (last player standing)
  6. Colyseus automatically diffs state and sends patches to clients
```

### State Schema (Colyseus)

Colyseus uses a schema system for efficient state synchronization. Only changed fields are sent over the wire.

```
GameState
├── players: MapSchema<PlayerSchema>
│   ├── x, y, vx, vy: float32
│   ├── angle: float32
│   ├── health: int16
│   ├── state: string (idle|moving|dead)
│   ├── meleeWeaponId: string (e.g., "fists", "hammer")
│   ├── rangedWeaponId: string (e.g., "", "darts", "plates")
│   ├── kills: uint8
│   └── lastProcessedInput: uint32
├── projectiles: ArraySchema<ProjectileSchema>
│   ├── id, x, y, angle, speed: number
│   ├── ownerId: string
│   └── charged: boolean
├── lockers: ArraySchema<LockerSchema>
│   ├── id, x, y: number
│   ├── opened: boolean
│   └── containedWeaponId: string
├── pickups: ArraySchema<PickupSchema>
│   ├── id, x, y: number
│   └── weaponId: string
├── phase: string (waiting|playing|ended)
└── tick: uint32
```

### Server-Side Validation

The server validates all client inputs:
- Movement speed cannot exceed max (prevents speed hacks)
- Attack rate respects cooldowns
- Combo inputs are re-validated server-side using the same combo definitions
- Position is constrained to arena bounds and respects collision

## Networking Protocol

### Client → Server Messages

```typescript
// Sent every client frame (60fps), batched where possible
interface InputMessage {
  seq: number;           // Sequence number for prediction reconciliation
  tick: number;          // Client's local tick
  dx: number;            // Movement input X (-1, 0, 1)
  dy: number;            // Movement input Y (-1, 0, 1)
  aimAngle: number;      // Mouse aim angle
  buttons: number;       // Bitfield of pressed buttons
}

// Sent on specific actions
interface ActionMessage {
  type: "fire" | "melee" | "dodge" | "interact" | "combo";
  data?: any;            // Combo name, etc.
}
```

### Server → Client Messages

State synchronization is handled automatically by Colyseus schema patching.

Additional event messages:
```typescript
// Broadcast messages (room.onMessage):
// "hit"            — damage dealt (targetId, attackerId, damage, type, x, y)
// "melee_hit"      — melee connected (attackerId, x, y, angle)
// "kill"           — player eliminated (killerId, victimId, x, y)
// "respawn"        — player respawned (sessionId, x, y)
// "weapon_pickup"  — weapon equipped (sessionId, weaponId, slot, weaponName)
// "locker_opened"  — locker opened (lockerId, x, y, weaponId)
// "projectile_wall" — projectile hit wall (x, y, charged)
```

## Deployment Architecture

```
                    ┌──────────────────────────┐
                    │    GitHub Actions (CI)    │
                    │                           │
                    │  checkout → npm ci →      │
                    │  vite build → tar →       │
                    │  scp to EC2 → ssh restart │
                    └────────────┬─────────────┘
                                 │ scp + ssh
                                 ▼
┌─────────────────────────────────────────────────────┐
│              AWS EC2 (t3.small, Ubuntu)              │
│                                                     │
│  ┌─────────┐    ┌──────────────────────────────┐    │
│  │  nginx   │───▶│  Colyseus Server (port 3001) │    │
│  │ (80/443) │    │  ├── WebSocket (game rooms)  │    │
│  │  + SSL   │    │  ├── express.static (client) │    │
│  └─────────┘    │  ├── /api/health              │    │
│       │          │  └── /api/taken-characters    │    │
│       │          └──────────────────────────────┘    │
│       │                                              │
│       │         ┌──────────────────────────────┐    │
│       ├────────▶│  Test: test-zach (port 3002)  │    │
│       │         └──────────────────────────────┘    │
│       │         ┌──────────────────────────────┐    │
│       └────────▶│  Test: test-keith (port 3003) │    │
│                  └──────────────────────────────┘    │
│                                                     │
│  ┌──────────────────────────┐  ┌────────────────┐   │
│  │  PM2 (process manager)   │  │  Docker         │   │
│  │  ├─ game-prototype       │  │  ├─ bangabot    │   │
│  │  ├─ game-test-zach       │  │  └─ postgres    │   │
│  │  └─ game-test-keith      │  └────────────────┘   │
│  └──────────────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

### Deploy Flow
1. Push to `main` triggers GitHub Actions (filtered by path)
2. GHA runner: `npm ci` → `vite build` → `tar czf deploy.tar.gz`
3. `scp` tarball to EC2 via `webfactory/ssh-agent`
4. `ssh` into EC2: extract tarball → `npm ci` → `pm2 restart`
5. Health check verifies server responds on `:3001/api/health`

### Test Environment Deploy Flow
1. Add label `deploy:test-zach` or `deploy:test-keith` to a PR
2. Workflow checks no other open PR owns the label (conflict guard)
3. Same build process as prod, deployed to `~/game-test-{name}/` on EC2
4. PM2 process starts with `PORT=300X` env var (`SERVER_PORT` reads it at startup)
5. Pushing new commits to a labeled PR auto-redeploys
6. Removing the label or closing the PR stops the PM2 process

### Production URL Detection
Client detects environment via `window.location`:
- **Dev** (`localhost:5173`): `ws://localhost:3001` + `http://localhost:3001/api/...`
- **Prod** (any other host): `wss://{host}` + relative `/api/...` (same origin)

## Performance Targets (Prototype)

- Client renders at 60fps
- Server tick rate: 20 Hz (50ms per tick)
- Max players per room: 16 (prototype), 32+ (optimized)
- Network update size: <500 bytes per tick per client (Colyseus delta compression)
- Input-to-visual latency: <16ms local (1 frame), <80ms for server-confirmed actions
- Combo input window: configurable, default 500ms (30 frames at 60fps)
