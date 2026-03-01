# Battle Royale 2D — Progress Tracker

## Phase 0: Project Scaffold — COMPLETE
- Monorepo with npm workspaces (shared, server, client)
- Colyseus server with GameRoom, player state sync
- Phaser 3 client with connection, client-side prediction, server reconciliation
- Remote player interpolation
- Debug overlay (backtick toggle)

## Phase 1: Single Player Movement & Combat — COMPLETE
- Acceleration-based movement (WASD) with friction
- 64x64 tilemap with perimeter walls + 18 interior obstacles
- Player-wall collision via Arcade Physics
- Mouse aim: player sprite rotates toward cursor
- Shooting (left-click): projectile pooling, wall/dummy collision, muzzle flash
- Melee (right-click): arc visualization, angle+distance check, cooldown
- 5 test dummies: health bars, hit flash, floating damage numbers, 2s respawn
- Minimap (150x150, top-right): walls + player dot
- Camera deadzone + smooth follow
- Offline mode fallback (play without server)
- Debug overlay extended: velocity, speed, projectile count, cooldowns, aim angle
- WeaponConfig system (shared types, server + client mirrors)

## Phase 2: Input Combo System — COMPLETE

### Session 2A: Input Buffer and State Machine
- InputBuffer: circular buffer (30 frames) with direction, buttons, aimAngle, press/release tracking
- ComboDetector: scans buffer against shared combo definitions, direction variants, per-combo cooldowns
- CombatStateMachine: states (idle, moving, attacking, dashing, combo_executing, stunned) with transitions
- 3 combos: Dash (double-tap direction, 150px/10 frames), Charged Shot (hold 20+ frames, 3x damage), Dash Strike (dash + melee, 2x range/damage)
- Charging visual: pulsing ring around player that changes color when fully charged
- Debug overlay: state machine state, last combo, charge frames, input buffer timeline

### Session 2B: Juice and Feel
- ScreenShake: omnidirectional + directional, configurable magnitude/duration per event
- HitStop: freeze frames on melee hit (50ms) and charged shot hit (83ms), sprites flash white
- ParticleManager: muzzle flash (5 yellow), impact (8 color-matched), dash trail (green), death explosion (20 red), charged impact (12 orange)
- Knockback: projectile (30px), melee (60px), charged shot (100px), decays over 10 frames
- SoundManager: placeholder console.log for all combat events (shoot, melee, dash, death, etc.)
- All juice events wired via Phaser event system for decoupled architecture

## Phase 3A: Server-Authoritative Movement — COMPLETE

### Shared Movement & Collision
- `shared/src/movement.ts` — pure `applyMovement()` function (acceleration, friction, speed clamping) used by both client and server
- `shared/src/collision.ts` — pure `resolveWallCollisions()` circle-vs-AABB collision, no Phaser dependency
- `shared/src/map-data.ts` — `OBSTACLES` array and `buildWallRects()` pre-computation, imported by both client TilemapManager and server GameRoom
- `InputPayload.dt` added so server uses client's actual frame delta for movement

### Server Upgrades
- `PlayerSchema` now has `vx`, `vy` float32 fields for velocity tracking across ticks
- `GameRoom.tick()` uses shared `applyMovement()` + `resolveWallCollisions()` instead of instant-velocity
- Wall collisions zero velocity on colliding axis (no sliding through walls)
- Safe spawn: rejects positions overlapping walls (up to 50 attempts)

### Client Upgrades
- `GameScene` uses shared `applyMovement()` + `resolveWallCollisions()` for both live movement and input replay during reconciliation
- Reconciliation starts from server's confirmed velocity (`vx`, `vy`) instead of resetting to zero
- Pending inputs now store `vx`/`vy` for accurate replay

### Artificial Latency Testing
- `NetworkManager` delay queue: `setArtificialDelay(ms)` + `flush()` pattern
- Number keys 1-5 set 0/50/100/200/500ms artificial latency
- Debug overlay shows: prediction delta distance, pending input count, artificial latency setting

## Phase 3B: Server-Authoritative Combat — COMPLETE

### Shared Types
- `Button.MELEE = 1 << 4` added so right-click melee reaches server via buttons bitfield
- Server combat constants: `SHOOT_COOLDOWN_TICKS`, `MELEE_COOLDOWN_TICKS`, `RESPAWN_TIME_MS`, `MAX_SERVER_PROJECTILES`

### Server Schemas
- `ProjectileSchema`: id, x, y, angle, speed, ownerId, charged — synced to all clients via ArraySchema
- `PlayerSchema.kills` (uint8) added for kill tracking
- `GameStateSchema.projectiles` ArraySchema added

### Server CombatSystem (`server/src/systems/CombatSystem.ts`)
- Per-player combat state: lastShootTick, lastMeleeTick, lastButtons, chargeFrameCount, respawnTimer
- `processInput()`: detects ATTACK press → fire projectile; ATTACK release after 20+ held frames → fire charged projectile (3x damage, faster, bigger); MELEE press → angle+distance check against all living players
- `tickProjectiles()`: advances positions, checks wall collision (point-in-AABB with radius), checks player collision (circle-vs-circle), removes on hit/range/wall
- `applyDamage()`: reduces health, broadcasts "hit" message, checks for kill → broadcasts "kill", starts respawn timer
- `updateRespawns()`: ticks respawn timers, teleports to safe spawn on expiry, broadcasts "respawn"
- All damage is server-authoritative; clients never modify health

### GameRoom Integration
- CombatSystem instantiated in `onCreate()`, players registered/unregistered in `onJoin()`/`onLeave()`
- `tick()` calls `processInput()` per queued input, `tickProjectiles()`, `updateRespawns()`

### Client Combat Messages
- `room.onMessage("hit")` → damage numbers (via event system), impact particles, screen shake if local player hit
- `room.onMessage("melee_hit")` → impact particles at attacker position
- `room.onMessage("kill")` → death explosion particles
- `room.onMessage("respawn")` → reset local player position/velocity/state, restore alpha
- `room.onMessage("projectile_wall")` → impact particles at wall hit location
- MELEE button bit sent via `buttons |= Button.MELEE` on right-click

### CombatManager Multiplayer Mode
- `setMultiplayerMode(true)` disables local projectile-vs-dummy collisions and local melee damage
- Melee still shows arc visual for client-side feedback
- Offline mode (test dummies) still works as before

### Remote Player Visuals
- `remoteTargets` expanded: x, y, angle, health, state
- Remote player rotation applied from server angle
- Health bars rendered above remote players (green/yellow/red based on ratio)
- Death state: alpha set to 0.3

### Server Projectile Rendering
- `room.state.projectiles.onAdd/onRemove` creates/destroys sprites for remote player projectiles
- Local player's own projectiles skipped (shown via client prediction)
- Charged projectiles tinted orange + scaled 2x
- Impact particles on projectile removal

### Debug Overlay
- Added: HP, kills, server projectile count
- Rows expanded from 16 to 18
