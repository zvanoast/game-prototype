# Storage Wars — Progress Tracker

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

## Phase 4: Storage Wars — Loot & Weapons — COMPLETE

### Shared Weapon Registry
- `shared/src/weapons.ts` — single source of truth for all 7 weapons with `WEAPON_REGISTRY`, `LOOTABLE_WEAPON_IDS`, `getWeaponConfig()`
- `WeaponId` enum and `WeaponSlot` type added to `shared/src/types.ts`
- `WeaponConfig` refactored: ranged stats and melee stats are optional (slot-specific)
- Deleted `client/src/config/weapons.ts` and `server/src/config/weapons.ts` (duplicated files)

### Weapons (7 total)
- **Fists** (melee, default): 10 dmg, 36 range, 350ms CD
- **Hammer** (melee): 40 dmg, 44 range, 700ms CD — slow heavy hitter
- **Lamp** (melee): 20 dmg, 56 range, 450ms CD — long reach
- **Frying Pan** (melee): 30 dmg, 40 range, 500ms CD — wide 100° arc
- **Darts** (ranged): 12 dmg, 150ms fire rate, 700 speed — fast spam
- **Plates** (ranged): 25 dmg, 500ms fire rate, 400 speed — slow heavy
- **Staple Gun** (ranged): 8 dmg, 100ms fire rate, 800 speed — highest ROF

### Equipment System
- Two slots: melee (always filled, starts with Fists) + ranged (starts empty)
- Left-click = ranged (if equipped), right-click = melee
- Weapons dropped on death (become pickups), player respawns with Fists only
- Picking up a weapon auto-equips to correct slot; old weapon drops as pickup

### Storage Lockers
- `shared/src/locker-data.ts` — 18 `LockerSpawn` positions near obstacles
- `LockerSchema` (server): id, x, y, opened, containedWeaponId
- Each locker contains a random lootable weapon
- Press E near closed locker → server opens it → weapon spawns as pickup

### Pickups
- `PickupSchema` (server): id, x, y, weaponId
- Server auto-collects pickups on player-circle overlap each tick
- Pickup sprites: white circle tinted per weapon color + weapon name label

### Server LootSystem (`server/src/systems/LootSystem.ts`)
- `initLockers()`: populates lockers with random weapons
- `processInteract()`: proximity check, opens locker, spawns pickup
- `tickPickups()`: circle-vs-circle overlap → auto-equip + old weapon drop
- `onPlayerRespawn()`: drops weapons at death location, resets to Fists
- `getPlayerMeleeConfig()`/`getPlayerRangedConfig()`: used by CombatSystem

### Server CombatSystem Refactor
- Now takes LootSystem reference; uses per-player weapon configs for all damage/cooldown calculations
- Shoot cooldown ticks derived from weapon's `fireRateMs`
- Melee cooldown ticks derived from weapon's `meleeCooldownMs`
- Charged shot applies multiplier to equipped ranged weapon's damage
- On kill: calls `lootSystem.onPlayerRespawn()` to drop victim's weapons

### Client Updates
- **BootScene**: generated textures for locker_closed, locker_open, pickup
- **CombatManager**: dynamic weapon configs via `setMeleeWeapon()`/`setRangedWeapon()`; `tryShoot()` returns false if no ranged weapon; `setOfflineDefaults()` for offline mode
- **GameScene**: E key for INTERACT button; locker sprites synced via `room.state.lockers.onAdd`; pickup sprites via `room.state.pickups.onAdd/onRemove`; weapon config sync from player schema changes; "Press E" interaction prompt near closed lockers; `weapon_pickup`/`locker_opened` message handlers
- **WeaponHud** (`client/src/ui/WeaponHud.ts`): bottom-center overlay showing `[RMB] weapon` + `[LMB] weapon`
- **DebugOverlay**: added equipped weapon names row (melee + ranged), expanded to 20 rows
- **Minimap**: locker dots (orange = closed, gray = open)

## Phase 5: Game Loop — Match Lifecycle & Elimination — COMPLETE

### Shared
- `shared/src/constants.ts` — `MIN_PLAYERS_TO_START`, `COUNTDOWN_DURATION_MS`, `POST_MATCH_DELAY_MS`
- `shared/src/types.ts` — `MatchPhase` type (`"waiting" | "countdown" | "playing" | "ended"`)

### Server Schemas
- `PlayerSchema.eliminated` (boolean) — distinguishes eliminated-from-match vs dead-waiting-to-respawn
- `GameStateSchema.alivePlayers` (uint8), `countdownSeconds` (uint8), `winnerId` (string)

### Server MatchSystem (`server/src/systems/MatchSystem.ts`)
- Phase state machine: waiting → countdown → playing → ended → waiting
- `waiting`: accepts players, transitions to countdown when >= 2 players
- `countdown`: 5-second timer, reverts to waiting if players drop below minimum
- `playing`: combat enabled, no respawning — deaths are permanent eliminations
- `ended`: 5-second delay, then full match reset
- Broadcasts: `match_countdown`, `match_start`, `match_end`, `player_eliminated`
- `resetMatch()`: respawns all players, resets equipment/lockers/pickups/projectiles

### Server LootSystem Changes
- `resetPlayerEquipment(sessionId)`: resets to Fists without dropping
- `resetForNewMatch()`: clears pickups, re-closes lockers with new random weapons

### Server CombatSystem Changes
- `setMatchSystem()`: takes MatchSystem reference
- `processInput()`: gates combat by `matchSystem.canAttack()` (only during "playing")
- `updateRespawns()`: skips during "playing" phase (eliminated players stay dead)
- `applyDamage()` on kill: calls `matchSystem.onPlayerKilled()` during playing, normal respawn otherwise
- `resetForNewMatch()`: clears all projectiles and combat state
- Kill broadcast now includes `weaponName`

### Server GameRoom Changes
- MatchSystem instantiated in `onCreate()`, cross-wired with CombatSystem
- `onJoin()`/`onLeave()` call MatchSystem
- `tick()` calls `matchSystem.tick()`, gates movement during "ended" phase

### Client MatchHud (`client/src/ui/MatchHud.ts`)
- Phase banner (top-center): "Waiting for players..." / "Match starting..." / "X players alive" / "Match Over"
- Countdown overlay: large centered number during countdown
- Eliminated overlay: "YOU WERE ELIMINATED (Spectating)"
- Victory/Defeat/Draw overlay at match end
- Kill feed (top-right): max 5 entries, fade after 5s

### Client GameScene Changes
- Phase tracking from `room.state.onChange` + message handlers
- `localEliminated` tracked from `PlayerSchema.eliminated`
- Spectator mode: camera follows alive remote players, cycle with left/right arrow keys
- Spectate label shows name of followed player
- Kill feed integration: kill messages show killer/victim names + weapon
- New message handlers: `match_start`, `match_end`, `match_countdown`, `player_eliminated`
- Respawn handler clears eliminated state and exits spectator mode
- Player display names assigned on join order

### Debug Overlay
- Added: match phase, alive count, eliminated status (expanded to 22 rows)

## Phase 7: Map & Visual Polish — COMPLETE

### 7A: Warehouse Map Redesign + Locker Randomization
- `shared/src/map-data.ts` — symmetrical storage warehouse layout: 4 columns of 4×6 storage units (left/right mirrored) + 6 center cover obstacles, `MapTheme` interface, `WAREHOUSE_THEME` constant
- `shared/src/locker-data.ts` — 30 `LockerSlot` positions adjacent to storage units, `pickActiveLockers()` Fisher-Yates shuffle helper, `LOCKER_SPAWNS` alias for backward compat
- `shared/src/constants.ts` — `ACTIVE_LOCKERS_MIN = 15`, `ACTIVE_LOCKERS_MAX = 20`
- `server/src/systems/LootSystem.ts` — `initLockers()` uses `pickActiveLockers()` for random subset; `resetForNewMatch()` clears and re-picks lockers

### 7B: Upgraded Sprites & Tilemap
- `client/src/scenes/BootScene.ts` — expanded tileset (6 tiles: floor, wall, wall-top, floor-accent, wall-edge-h, wall-edge-v); per-weapon projectile textures (`proj_darts`, `proj_plates`, `proj_staple_gun`, `proj_default`, `proj_charged`); improved locker sprites (metal gray with padlock); per-weapon pickup silhouettes (`pickup_hammer`, `pickup_lamp`, `pickup_frying_pan`, `pickup_darts`, `pickup_plates`, `pickup_staple_gun`); target mannequin dummy sprite
- `client/src/world/TilemapManager.ts` — wall-top tiles for south-facing walls (depth effect), ~10% floor accent scatter with seeded PRNG, collision on all wall tile indices
- `server/src/state/GameState.ts` — `ProjectileSchema.weaponId` field added
- `server/src/systems/CombatSystem.ts` — `weaponId` set on `ServerProjectile` and synced to schema
- `client/src/scenes/GameScene.ts` — per-weapon projectile textures via `getProjectileTexture()`, per-weapon pickup textures via `getPickupTexture()`

### 7C: Player Animations
- `client/src/scenes/BootScene.ts` — 11-frame player spritesheet (idle×2, walk×4, attack×2, death×3) via raw HTML Canvas; 4 registered animations (`player_idle` 2fps, `player_walk` 8fps, `player_attack` 12fps, `player_death` 6fps)
- `client/src/scenes/GameScene.ts` — local player uses `player_sheet` texture tinted green with animations based on movement state; remote players use `player_sheet` tinted red with state-driven animations; death animation on kill

### 7D: Sound Effects
- `client/src/audio/ProceduralAudio.ts` — CREATE: 13 procedurally generated sounds via Web Audio API oscillators/noise (shoot, melee_swing, melee_hit, charged_shot, dash, dash_strike, impact, death, damage, pickup, locker_open, countdown_beep, match_start)
- `client/src/systems/SoundManager.ts` — REWRITE: real audio playback via `AudioContext.createBufferSource()` + `GainNode`; browser autoplay policy handling; 13 sound events wired
- `client/src/scenes/GameScene.ts` — new sound event emissions: `sfx:pickup`, `sfx:locker_open`, `sfx:countdown_beep`, `sfx:match_start`

## Phase 8: Lobby & UI Flow — COMPLETE

### Menu Scene
- `client/src/scenes/MenuScene.ts` — CREATE: "STORAGE WARS" title, DOM `<input>` for nickname (max 16 chars, pre-filled from localStorage), "PLAY" button with hover/press feedback, "HOW TO PLAY" toggle panel (WASD, LMB/RMB, E, dash, charge), Enter key to submit, DOM cleanup on shutdown

### Scene Flow
- BootScene → MenuScene → GameScene → (leave) → MenuScene
- `client/src/main.ts` — added `dom: { createContainer: true }`, imported MenuScene, added to scene list
- `client/src/scenes/BootScene.ts` — routes to "MenuScene" instead of "GameScene"

### Server-Side Display Names
- `server/src/state/GameState.ts` — `PlayerSchema.displayName` (string) added
- `server/src/rooms/GameRoom.ts` — `onJoin(client, options?)` reads nickname from options, sanitizes (trim, 16 char max), sets `player.displayName`; fallback to sessionId prefix
- `server/src/systems/MatchSystem.ts` — `checkWinCondition()` uses `player.displayName` for `winnerName`

### Network & Client Flow
- `client/src/network/NetworkManager.ts` — `connect(options)` passes options to `joinOrCreate("game", options)`
- `client/src/scenes/GameScene.ts` — `init(data)` receives `{ nickname }` from MenuScene; passes to `network.connect()`; uses `player.displayName` for player names (synced on add + onChange); stores `matchWinnerName` from `match_end` message; `getScoreboardEntries()` helper builds entries from room state; `match:leave` event listener disconnects + returns to MenuScene

### Match HUD Upgrades
- `client/src/ui/MatchHud.ts` — scoreboard panel (semi-transparent bg, "SCOREBOARD" title, up to 10 rows sorted by kills desc, winner row gold, local player green); "LEAVE MATCH" button emitting `match:leave`; defeat text shows winner name; `ScoreboardEntry` interface exported; `update()` signature extended with `winnerName`, `scoreboard`, `localSessionId`

### Shared Constants
- `shared/src/constants.ts` — `POST_MATCH_DELAY_MS`: 5000 → 10000 (more time to view scoreboard)

## Phase 9: Consumables & Weapon Polish — COMPLETE

### 9A: Shared Types & Registries
- `shared/src/types.ts` — `ConsumableId` enum (HealthPack, SpeedBoost, Shield, DamageBoost), `ConsumableConfig` interface, `Button.USE_CONSUMABLE = 1 << 5`, 4 new `WeaponId` entries (BaseballBat, GolfClub, Vase, RubberBandGun), optional `knockback`/`meleeKnockback` on `WeaponConfig`
- `shared/src/consumables.ts` — CREATE: 4 consumable configs (First Aid Kit 50HP heal, Energy Drink 1.4x speed 8s, Bubble Wrap Armor +40 shield 10s, Adrenaline Shot 1.5x damage 6s), `CONSUMABLE_REGISTRY`, `LOOTABLE_CONSUMABLE_IDS`, `getConsumableConfig()`
- `shared/src/weapons.ts` — 4 new weapons (Baseball Bat, Golf Club, Vase, Rubber Band Gun), balance tuning (Fists 10→8 dmg / 350→300ms CD, Hammer 40→35 dmg / 700→750ms CD, Frying Pan 30→28 dmg / 100→95° arc, Darts 12→10 dmg / 150→140ms rate, Staple Gun 8→7 dmg / 550→500 range)
- `shared/src/constants.ts` — `MAX_CONSUMABLE_SLOTS`, `CONSUMABLE_USE_COOLDOWN_MS`, `CONSUMABLE_SPAWN_CHANCE`
- `shared/src/movement.ts` — `applyMovement()` now accepts optional `speedMultiplier` param
- `shared/src/index.ts` — exports `consumables.ts`

### 9B: Server State & Buff System
- `server/src/state/GameState.ts` — `PlayerSchema`: consumableSlot1, consumableSlot2, shieldHp, speedMultiplier, damageMultiplier; `LockerSchema.containedConsumableId`; `PickupSchema.consumableId`
- `server/src/systems/BuffSystem.ts` — CREATE: tracks timed buffs per player (speed, damage, shield); `useConsumable()` applies instant heal or timed buff; `tick()` decrements timers, expires buffs; `applyShieldDamage()` absorbs damage via shield; `resetPlayer()`/`resetForNewMatch()`
- `server/src/systems/LootSystem.ts` — extended `PlayerEquipment` with consumable slots; `initLockers()` 30% chance for consumable; `processPickupClick()` handles consumable pickups; `equipConsumable()` fills slot1→slot2→swap; `useConsumable()` removes from first non-empty slot; `dropPlayerItems()` drops consumables on death
- `server/src/systems/CombatSystem.ts` — accepts BuffSystem ref; multiplies projectile/melee damage by `getDamageMultiplier()`; routes damage through `applyShieldDamage()` before applying to health
- `server/src/rooms/GameRoom.ts` — BuffSystem wiring; Q key (`Button.USE_CONSUMABLE`) edge detection → `lootSystem.useConsumable()` → `buffSystem.useConsumable()`; `buffSystem.tick()` in main loop; speed multiplier passed to `applyMovement()`; broadcasts `consumable_used`/`buff_expired`
- `server/src/systems/MatchSystem.ts` — BuffSystem ref; resets buffs and multipliers on match reset

### 9C: Client Consumable UI
- `client/src/scenes/BootScene.ts` — consumable pickup textures (health_pack green cross, speed_boost lightning, shield shape, damage_boost star), new weapon pickup textures (baseball_bat, golf_club, vase, rubber_band_gun), new projectile textures (proj_vase large circle, proj_rubber_band_gun tiny line)
- `client/src/ui/WeaponHud.ts` — consumable slot display: `[Q] name1 | name2` below weapon slots
- `client/src/scenes/GameScene.ts` — Q key → `Button.USE_CONSUMABLE`; consumable slot sync from PlayerSchema; pickup onAdd handles consumable pickups (texture, label); `consumable_used`/`buff_expired` message handlers (particles + sound); buff tinting on remote player sprites (red=damage, blue=speed, purple=shield); shield HP bar above health bar

### 9D: Weapon Visual & Audio Polish
- `client/src/audio/ProceduralAudio.ts` — per-weapon shoot sounds (darts tick, plates whoosh, staple_gun click, vase thunk, rubber_band_gun twang), per-weapon melee sounds (fists thud, hammer clang, lamp ring, frying_pan clang, baseball_bat crack, golf_club whoosh), consumable sounds (consumable_use chime, shield_hit pop, buff_expired descend)
- `client/src/systems/SoundManager.ts` — registers all per-weapon + consumable buffers; `sfx:shoot_weapon` and `sfx:melee_weapon` events with weapon ID fallback to generic
- `client/src/systems/CombatManager.ts` — emits `sfx:shoot_weapon` with weapon ID instead of generic `sfx:shoot`; emits `sfx:melee_weapon` with weapon ID instead of generic `sfx:melee_swing`; melee arc tinted with weapon's color
- `client/src/systems/ParticleManager.ts` — `projectileTrail()` method: continuous particle emitter following a sprite with color-matched trail
- `client/src/scenes/GameScene.ts` — attaches projectile trails on server projectile onAdd, cleans up on onRemove

### Weapons (11 total, 4 new)
- **Baseball Bat** (melee): 25 dmg, 52 range, 85° arc, 350ms CD — fast swing
- **Golf Club** (melee): 30 dmg, 64 range, 50° arc, 600ms CD, high knockback — long reach, narrow
- **Vase** (ranged): 35 dmg, 300 speed, 350 range, 5 radius, 800ms rate — heavy, short range, big projectile
- **Rubber Band Gun** (ranged): 4 dmg, 900 speed, 700 range, 1 radius, 80ms rate — rapid-fire spam

## Character Selection from Menu — COMPLETE

### Shared Character Data
- `CHARACTER_DEFS` exported from BootScene: 9 characters (Blue, Hitman, Soldier, Survivor, Brown, Veteran, Green, Robot, Zombie) from Kenney atlas
- `buildPlayerSheet()` extracted as reusable function: builds 11-frame player spritesheet from any Kenney atlas frame, supports texture destruction and rebuild

### BootScene Changes
- `generateCharacterPreviews()`: generates 9 `char_preview_0..8` textures (48×48) for menu display
- `generateRemoteSkins()`: now generates skins for all 9 characters (was 8), indexed by CHARACTER_DEFS
- `generatePlayerSheet()`: delegates to shared `buildPlayerSheet()` utility

### MenuScene — Character Picker
- 9 clickable character previews in horizontal row between nickname input and PLAY button
- Yellow highlight border on selected character, character name label below
- Selection persisted in `localStorage` key `storage_wars_character`
- `characterIndex` passed in scene data to GameScene (and test mode)
- UI repositioned: elements shifted to accommodate character row

### Server-Side Character Uniqueness
- `PlayerSchema.characterIndex` (uint8) — synced to all clients
- `shared/src/constants.ts` — `CHARACTER_COUNT = 9`
- `GameRoom.onJoin()` validates requested character; if taken, assigns next available index
- `GameRoom.takenCharacters` Set tracks occupied indices; released in `onLeave()`

### GameScene Changes
- `init()` accepts `characterIndex` (default 0)
- `create()` rebuilds `player_sheet` texture from chosen character's atlas frame before spawning
- Animations re-registered after texture rebuild (player_idle, player_walk, player_attack, player_death)
- On local player join: reads `player.characterIndex` from server; if different from requested, rebuilds player_sheet again
- Remote players use `player.characterIndex` directly from schema (no more hash-based assignment)
- Removed `getRemoteSkinIndex()` — uniqueness is enforced server-side
