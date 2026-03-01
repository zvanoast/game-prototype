# Phase 0 — Project Scaffold

## Prompt for Claude Code

Copy everything below the line into Claude Code as your initial prompt. Make sure `CLAUDE.md` and `ARCHITECTURE.md` are already in your project root before you start.

---

Set up the monorepo project structure for a 2D multiplayer last-man-standing elimination game ("Storage Wars"). The stack is Phaser 3 (client), Colyseus (server), TypeScript throughout, Vite for client builds, and npm workspaces for the monorepo.

### Step 1: Monorepo and workspace setup

Create the root `package.json` with npm workspaces pointing to `client`, `server`, and `shared`. Create a `tsconfig.base.json` with strict TypeScript settings that all three packages extend. Each package gets its own `tsconfig.json` that extends the base and adds its specific paths/settings.

### Step 2: Shared package

Create `shared/` with:
- `src/types.ts` — Shared interfaces: `InputPayload` (seq, tick, dx, dy, aimAngle, buttons as bitfield), `Direction` enum (8-way + neutral), `PlayerState` enum (idle, moving, attacking, dashing, stunned, dead), `ActionType` enum, `WeaponType` enum
- `src/constants.ts` — Shared constants: `TICK_RATE = 20`, `ARENA_WIDTH = 2000`, `ARENA_HEIGHT = 2000`, `PLAYER_SPEED = 200`, `PLAYER_RADIUS = 16`, `MAX_HEALTH = 100`
- `src/combo-defs.ts` — A `ComboDefinition` interface and 3 starter combos defined as data: a dash (double-tap direction), a charged shot (hold attack 20+ frames then release), and a dash-strike (dash then attack within 10 frames)
- `src/index.ts` — Re-exports everything

### Step 3: Colyseus server

Create `server/` with:
- `src/state/GameState.ts` — Colyseus Schema classes: `PlayerSchema` (x, y, angle, health, state, lastProcessedInput), `GameStateSchema` (players as MapSchema, phase, tick)
- `src/rooms/GameRoom.ts` — A Colyseus Room that:
  - `onCreate`: initializes game state, starts a fixed-rate simulation loop at TICK_RATE
  - `onJoin`: creates a PlayerSchema at a random spawn position, adds to state.players keyed by sessionId
  - `onLeave`: removes the player from state
  - Listens for "input" messages: validates and queues InputPayload
  - Tick loop: processes queued inputs (applies movement with speed cap and arena boundary clamping), increments state.tick
- `src/index.ts` — Express + Colyseus server setup on port 3001, registers GameRoom as "game", serves a Colyseus monitor at /monitor

### Step 4: Phaser client

Create `client/` with:
- `vite.config.ts` — configured to proxy `/api` and WebSocket connections to localhost:3001
- `index.html` — minimal HTML with a `#game` container div
- `src/main.ts` — Phaser.Game config: 800x600 canvas (scale to fit), Arcade Physics enabled, pixel art rendering (roundPixels, antialias off), loads BootScene then GameScene
- `src/scenes/BootScene.ts` — Generates placeholder assets programmatically: a 32x32 colored square for the player sprite, a 4x4 circle for projectiles. Then starts GameScene.
- `src/scenes/GameScene.ts` — The main gameplay scene:
  - `create()`: connects to Colyseus GameRoom, sets up keyboard input (WASD + arrow keys), creates a player sprite group
  - On room state change: sync remote player sprites (create/update/destroy to match server state)
  - `update()`: reads WASD input, sends InputPayload to server every frame, applies client-side prediction (move local player immediately based on input), interpolates remote player positions toward their server state
  - Camera follows local player
  - The arena should have a visible boundary (simple rectangle outline)
- `src/network/NetworkManager.ts` — Encapsulates Colyseus client connection: connect(), disconnect(), sendInput(), onStateChange callback, getRoom(). Handles connection errors gracefully with console messages.
- `src/ui/DebugOverlay.ts` — A toggleable overlay (backtick key) that shows: ping/latency, current server tick, number of connected players, local player position vs server position. Render as Phaser text objects, not HTML.

### Step 5: Dev scripts

In the root `package.json`, add these scripts:
- `dev:client` — runs Vite dev server for the client
- `dev:server` — runs the Colyseus server with ts-node or tsx, watching for changes
- `dev` — runs both concurrently using the `concurrently` package
- `build` — builds all packages
- `typecheck` — runs tsc --noEmit across all packages

### Step 6: Verification

After setting everything up, make sure:
1. Both dev servers start without errors
2. The Phaser game renders and shows the player sprite
3. The client successfully connects to the Colyseus server (check console logs)
4. Opening two browser tabs shows two players, each able to move with WASD, visible to the other
5. The debug overlay toggles with backtick and shows live data

Use placeholder colored rectangles for all sprites. Do not add any asset files — generate everything programmatically in BootScene. Keep it ugly but functional.
