# Project Plan — Battle Royale 2D Technical Prototype

## Phase Summary

| Phase | Focus | Sessions | Deliverable |
|-------|-------|----------|-------------|
| 0 | Scaffold | 1 | Monorepo, two players moving on screen |
| 1 | Single Player Movement & Combat | 2-3 | Shooting, melee, tilemap arena |
| 2 | Input Combo System | 2-3 | Tech moves, state machine, juice |
| 3 | Multiplayer Foundation | 3-4 | Authoritative netcode, prediction, interpolation |
| 4 | Networked Combat | 2-3 | Server-validated damage, health, death |
| 5 | Battle Royale Loop | 2-3 | Shrinking zone, loot, match lifecycle |
| 6 | Polish & Hosting | Ongoing | Art pass, sound, deploy to your website |

---

## Phase 0 — Project Scaffold

**See PHASE-0-PROMPT.md for the complete Claude Code prompt.**

**Done when:** Two browser tabs each show a colored square. Both squares move with WASD. Each tab sees the other player moving in real time. Debug overlay shows ping and tick.

---

## Phase 1 — Single Player Movement & Combat

Focus on making a single player feel good to control before worrying about networking. Work offline (client-only) for most of this phase.

### Session 1A: Movement and World

```
Add these features to the Phaser client, working client-side only (no server changes yet):

1. Replace the placeholder square with an 8-directional animated sprite. Generate
   it programmatically: a 32x32 sprite with a directional indicator (like a triangle
   or arrow showing facing direction). Use Phaser's Graphics to draw this as a
   texture at boot time.

2. Implement 8-directional movement with acceleration and deceleration.
   - Don't snap to full speed instantly. Use acceleration (2000 units/sec²)
     and deceleration/friction so the player slides slightly to a stop.
   - Max speed from shared constants.
   - The player sprite should rotate (or flip) to face the mouse cursor.

3. Create a test arena tilemap:
   - Define the tilemap as a JSON data structure in code (not an external file).
   - 64x64 tiles, each 32x32 pixels. Total arena: 2048x2048.
   - Floor tiles, wall tiles around the perimeter, and 15-20 scattered
     rectangular wall obstacles of various sizes inside the arena.
   - Walls have Arcade Physics static bodies for collision.

4. Camera follows the player with a small deadzone and slight lerp smoothing.

5. Add a simple minimap in the top-right corner showing the player's position
   relative to the arena bounds. Render it as a small Phaser RenderTexture or
   Graphics object, not HTML.
```

### Session 1B: Shooting and Melee

```
Add combat mechanics to the client (still offline, no networking):

1. Shooting:
   - Left mouse click fires a projectile toward the mouse cursor.
   - Projectiles are small sprites (generate as 4x4 colored circles).
   - Projectiles travel in a straight line at PROJECTILE_SPEED (600 units/sec).
   - Projectiles collide with walls and are destroyed.
   - Projectiles have a max range (800 units) after which they disappear.
   - Fire rate: one shot every 200ms (configurable constant).
   - Add muzzle flash: a brief white circle at the player's position for 2 frames.

2. Melee:
   - Right mouse click performs a melee attack.
   - Melee creates a short-lived arc hitbox in front of the player (90 degree arc,
     range 48px, active for 6 frames).
   - Visualize the melee arc briefly (semi-transparent colored arc).
   - Melee has a 400ms cooldown.

3. Add test dummies: place 5 static "enemy" sprites (red squares) around the arena.
   - They have health (100 HP).
   - Projectiles and melee hits reduce their health.
   - Show a health bar above each dummy.
   - When health reaches 0, they flash and respawn after 2 seconds.
   - Display floating damage numbers that drift upward and fade out.

4. Put all weapon stats (fire rate, damage, speed, range, melee arc, melee range,
   melee damage, cooldowns) in a WeaponConfig object in server/src/config/.
```

---

## Phase 2 — Input Combo System

### Session 2A: Input Buffer and State Machine

```
Implement the input combo/tech system:

1. Input Buffer (client/src/systems/InputBuffer.ts):
   - A circular buffer that stores the last 30 frames of input.
   - Each frame records: tick number, direction (8-way enum from shared/),
     button bitfield (attack, special, dodge, interact), aimAngle.
   - Exposes methods: recordFrame(), getHistory(n), getLatest().
   - The buffer is written to every frame in GameScene.update().

2. Combo Detector (client/src/systems/ComboDetector.ts):
   - Takes the input buffer and the combo definitions from shared/combo-defs.ts.
   - Each frame, scans the buffer against all registered combo patterns.
   - Matches longest/most complex combo first (priority system).
   - When a combo matches, emits a Phaser event: 'combo:detected' with the combo name.
   - Has a cooldown per combo to prevent re-triggering (configurable per combo).

3. Player State Machine (client/src/systems/CombatStateMachine.ts):
   - States: idle, moving, attacking, melee, dashing, combo_executing, stunned.
   - Each state defines: which transitions are allowed, which combos can be initiated,
     and a duration (for timed states like dashing or stunned).
   - The state machine consumes 'combo:detected' events and transitions accordingly.
   - Some combos are only valid from certain states (e.g., dash-strike requires
     dashing state).

4. Implement these 3 combo moves:
   - **Dash**: double-tap a movement direction within 15 frames. Player launches
     forward 150px over 10 frames. Invulnerable during dash. Cannot shoot while dashing.
   - **Charged Shot**: hold attack button for 20+ frames, release to fire.
     Projectile is larger (8x8), faster (900 units/sec), and does 3x damage.
     Show a charging visual on the player (pulsing glow that grows).
   - **Dash Strike**: during a dash, press melee within 10 frames. Performs a
     powerful melee with 2x range and 2x damage. Ends the dash.

5. Add a debug overlay panel for the combo system (toggled with backtick along with
   other debug info):
   - Show the last 30 frames of the input buffer as a visual timeline.
   - Highlight which frames matched a combo pattern.
   - Show current player state machine state.
```

### Session 2B: Juice and Feel

```
Add game feel / "juice" to make combat satisfying. All of these should be
configurable constants:

1. Screen shake:
   - On firing: tiny shake (1px, 50ms).
   - On melee hit: medium shake (3px, 100ms).
   - On charged shot: large shake (5px, 150ms).
   - On taking damage: directional shake toward damage source (4px, 120ms).
   - Implement as a camera shake utility that supports magnitude and duration.

2. Hit-stop (freeze frames):
   - When a melee attack connects, freeze BOTH the attacker and target for
     3 frames (50ms). This is the single most impactful feel improvement.
   - Charged shot hit: 5 frame freeze.
   - During hit-stop, sprites flash white.

3. Particle effects using Phaser's built-in particle system:
   - Muzzle flash: burst of 5 small yellow particles on shoot.
   - Impact: burst of 8 particles in the projectile's color on wall/enemy hit.
   - Dash: trail of 10 fading afterimage particles along the dash path.
   - Death: explosion of 20 particles when a test dummy dies.

4. Knockback:
   - Projectile hits push the target 30px away from the shooter.
   - Melee hits push the target 60px away.
   - Charged shot pushes 100px.
   - Knockback is applied as a velocity impulse that decays over 10 frames.

5. Sound placeholders:
   - Don't add actual sound files yet, but create a SoundManager class with
     methods like playShoot(), playMeleeHit(), playDash(), playDeath().
   - Each method logs to console for now: "SFX: shoot", "SFX: melee_hit", etc.
   - Wire all combat events to the SoundManager so sound is trivial to add later.
```

---

## Phase 3 — Multiplayer Foundation

This is the hardest phase. Take it slow, test at each step.

### Session 3A: Server-Authoritative Movement

```
Refactor movement to be server-authoritative:

1. Server input processing:
   - GameRoom should queue incoming InputPayloads per player.
   - In the tick loop, process each player's queued inputs in order.
   - Apply movement using the same speed/acceleration constants from shared/.
   - Clamp positions to arena bounds and resolve wall collisions server-side.
   - Update PlayerSchema.lastProcessedInput with the seq number of the
     last input processed.

2. Client-side prediction in NetworkManager:
   - Maintain a buffer of unconfirmed inputs (inputs sent but not yet
     acknowledged by the server).
   - When a server state update arrives:
     a. Find the lastProcessedInput for the local player.
     b. Discard all inputs from the unconfirmed buffer with seq <= lastProcessedInput.
     c. Set the local player's position to the server's confirmed position.
     d. Re-apply all remaining unconfirmed inputs on top of the server position.
   - This should be transparent to GameScene — it just sees smooth local movement.

3. Entity interpolation for remote players:
   - Store the last 3 state snapshots (position + timestamp) for each remote player.
   - In the render loop, interpolate each remote player's position between the
     two most recent snapshots, offset by an interpolation delay (100ms).
   - If a snapshot is too old (>500ms), snap to latest instead of interpolating.

4. Test with artificial latency:
   - Add a debug control (number keys 1-5) that adds artificial latency
     to outgoing messages: 0ms, 50ms, 100ms, 200ms, 500ms.
   - Verify that local movement still feels responsive at 200ms latency
     and that remote players appear smooth.
   - Show the current artificial latency in the debug overlay.

5. Update the debug overlay to show:
   - Local position vs server-confirmed position (and the delta between them).
   - Number of unconfirmed inputs in the prediction buffer.
   - Interpolation state for remote players.
```

### Session 3B: Connection Handling and Lobby

```
Add robustness and a basic lobby flow:

1. Lobby/Menu scene:
   - A simple MenuScene with a "Play" button (Phaser text, clickable).
   - Clicking "Play" connects to the Colyseus server and joins a GameRoom.
   - Show "Connecting..." text while connecting.
   - On successful join, transition to GameScene.
   - On connection failure, show error message and a "Retry" button.

2. Reconnection handling:
   - If the WebSocket disconnects during gameplay, show a "Reconnecting..." overlay.
   - Attempt to reconnect 3 times with exponential backoff (1s, 2s, 4s).
   - If reconnection succeeds (Colyseus reconnect with sessionId), restore state.
   - If reconnection fails, return to MenuScene with a "Disconnected" message.

3. Player join/leave during gameplay:
   - When a new player joins mid-game, they appear with a brief fade-in.
   - When a player leaves, their sprite fades out over 500ms then is removed.
   - Show a brief notification text: "Player joined" / "Player left" that
     fades after 2 seconds.

4. Server room configuration:
   - Set maxClients to 16 on the GameRoom.
   - If the room is full, Colyseus should create a new room automatically.
   - Add a CORS configuration so the client can connect from a different origin
     (needed for production deployment).
```

---

## Phase 4 — Networked Combat

### Session 4A: Server-Side Combat

```
Move all combat resolution to the server:

1. Server-side projectile system:
   - When the server processes an "attack" input, it creates a ProjectileSchema
     in the game state (position, velocity, ownerId, damage, createdAt).
   - The server tick loop moves all projectiles and checks collisions against
     walls (destroy projectile) and players (apply damage, destroy projectile).
   - Projectiles are added to an ArraySchema on GameStateSchema so clients
     receive them via state sync.

2. Server-side melee:
   - When the server processes a "melee" input, it checks a hitbox arc
     in front of the attacking player.
   - If any other players are within the arc, apply damage.
   - Send a "melee_hit" event message to the attacker and victim(s) so
     clients can play effects.

3. Server-side combo validation:
   - When a client claims to have executed a combo (sends a "combo" action message),
     the server validates it by checking the player's recent input history.
   - The server maintains its own input buffer per player (last 30 inputs received).
   - If the combo is valid, execute the combo effect server-side.
   - If invalid, ignore the message (possible cheat attempt).

4. Health and damage:
   - PlayerSchema tracks health (starts at MAX_HEALTH from constants).
   - Damage reduces health. Health cannot go below 0.
   - When health reaches 0, set player state to "dead".
   - Dead players cannot move or attack.
   - For prototype: respawn after 3 seconds at a random position with full health.

5. Client-side hit effects:
   - When the client receives damage events from the server, trigger the
     juice effects from Phase 2 (screen shake, hit-stop, particles, knockback).
   - Show a damage direction indicator (brief red arc on screen edge pointing
     toward the attacker).
```

### Session 4B: HUD and Kill Feed

```
Add gameplay UI elements:

1. Health bar:
   - Show the local player's health as a bar above their sprite.
   - Bar is green > 60%, yellow 30-60%, red < 30%.
   - Smooth interpolation when health changes (don't snap).
   - Also show all other players' health bars (smaller, simpler).

2. Kill feed:
   - Top-right corner of screen.
   - Shows recent kills: "PlayerA eliminated PlayerB" with a weapon icon.
   - Each entry fades out after 5 seconds.
   - Maximum 5 visible entries.
   - Server sends "kill" event messages with attacker, victim, and weapon type.

3. Player count:
   - Show "Players: X/16" or "Alive: X" in the top-left.

4. Ammo / cooldown indicators:
   - Show weapon cooldown as a small circular cooldown indicator near the
     crosshair or player sprite.
   - Show charged shot progress (if holding attack) as a fill bar.

5. Crosshair:
   - Hide the default mouse cursor when the game canvas has focus.
   - Show a custom crosshair sprite that follows the mouse position.
   - Crosshair expands briefly when firing (returns to normal over 100ms).
```

---

## Phase 5 — Battle Royale Loop

### Session 5A: Zone and Match Lifecycle

```
Implement the core battle royale mechanics:

1. Match lifecycle on the server:
   - Phases: "lobby" → "countdown" → "playing" → "ended"
   - Lobby: wait for 2+ players (lower threshold for testing). Show a countdown
     timer that starts when minimum players are reached. 10 second countdown.
   - Countdown: 3-2-1-GO sequence. Players are frozen during countdown.
   - Playing: game is active. Zone starts shrinking.
   - Ended: when 1 player remains (or 0 if last two kill each other).
     Show winner. After 5 seconds, return all players to lobby.

2. Shrinking zone:
   - The zone is a circle defined by centerX, centerY, currentRadius.
   - Stored in ZoneState schema so all clients receive it.
   - The zone shrinks in stages:
     Stage 1: starts at full arena size, shrinks to 75% over 60 seconds.
     Stage 2: pause 15 seconds, then shrink to 50% over 45 seconds.
     Stage 3: pause 10 seconds, then shrink to 25% over 30 seconds.
     Stage 4: pause 5 seconds, then shrink to a tiny circle over 20 seconds.
   - Center drifts slightly each stage toward a random point (not always centered).
   - Make all timing values configurable constants.

3. Zone damage:
   - Players outside the zone take damage every second.
   - Damage increases each stage: 5, 10, 20, 40 HP per second.
   - Show a visual warning on the player's screen edge when near the zone boundary.

4. Client zone rendering:
   - Draw the safe zone as a circle.
   - Everything outside the zone has a tinted/darkened overlay.
   - Show the next zone as a white circle outline.
   - On the minimap, show the zone circle and the player's position relative to it.
   - Show a subtle directional indicator pointing toward the safe zone when outside it.

5. Disable respawning during "playing" phase. Dead players become spectators
   (camera follows a random alive player, can cycle with left/right arrow keys).
```

### Session 5B: Loot and Weapons

```
Add loot pickups and weapon variety:

1. Weapon types (defined in server/src/config/weapons.ts):
   - Pistol: default weapon. Moderate fire rate, moderate damage, moderate range.
   - Shotgun: fires 5 projectiles in a spread (30 degree arc). Short range,
     high damage up close, slow fire rate.
   - Rifle: fast projectile, long range, moderate fire rate, moderate damage.
   - Each weapon has: damage, fireRate, projectileSpeed, range, projectileCount,
     spread, sprite color (for placeholder visuals).

2. Loot spawns:
   - Define 20-30 loot spawn points on the map (hardcoded positions for now).
   - On match start, randomly assign weapons and health packs to spawn points.
   - Render pickups as colored squares with a letter (P/S/R for weapons, + for health).
   - Pickups bob up and down slightly (sine wave animation).

3. Pickup mechanics:
   - Walk over a pickup to collect it (collision-based, no button press).
   - Weapons replace your current weapon (drop the old one at your position
     as a new pickup).
   - Health packs restore 50 HP, up to MAX_HEALTH.
   - Server validates all pickups (client can't cheat by claiming a pickup).

4. All pickup state is in the server schema (ArraySchema<PickupState>).
   Clients render pickups based on state sync.
```

---

## Phase 6 — Polish and Deployment

### Session 6A: Visual Polish

```
Improve the visual presentation while keeping the retro aesthetic:

1. Consistent pixel art palette:
   - Choose a limited palette (16-32 colors). Use the PICO-8 palette or
     a similar retro palette.
   - Update all generated placeholder sprites to use this palette.
   - Players should be distinct colors (assign on join from a pool of 8 colors).

2. Arena visual improvements:
   - Floor tiles with subtle variation (2-3 tile variants, randomly placed).
   - Wall tiles with a distinct look.
   - Add destructible crates as cover (take 3 hits to destroy, drop a random pickup).
   - Zone outside the safe area: red-tinted overlay that pulses.

3. Player sprites:
   - Generate a simple but recognizable player sprite: a top-down character
     with a visible weapon.
   - Weapon sprite changes when picking up different weapons.
   - Walking animation (2 frame alternation is fine for retro feel).
   - Death animation: sprite breaks into 4 pieces that scatter.

4. Post-processing:
   - Optional CRT scanline shader (toggle in settings).
   - Subtle vignette on the screen edges.
```

### Session 6B: Deployment

```
Prepare for hosting on a personal website:

1. Production build:
   - Client: Vite production build, output to dist/.
   - Server: compile TypeScript, output to server/dist/.
   - Single Dockerfile or docker-compose that runs the server and serves the
     client static files.

2. Deployment options (set up one):
   - Option A: Single VPS (e.g., DigitalOcean droplet, Railway, Fly.io).
     The Node.js server serves both the Colyseus WebSocket and the static
     client files.
   - Option B: Client on Cloudflare Pages / Netlify, server on Railway / Fly.io.
     Configure CORS and WebSocket URL via environment variable.

3. Environment configuration:
   - Client reads the server WebSocket URL from an env variable
     (VITE_SERVER_URL), defaulting to localhost:3001 for dev.
   - Server reads port from PORT env variable.

4. Basic analytics:
   - Log match results to a JSON file on the server: timestamp, player count,
     winner, match duration. Just for your own interest.
```

---

## Ongoing: Playtesting Notes

After each session, add notes to a PLAYTEST.md file:
- What feels good?
- What feels bad or unresponsive?
- What constants need tuning? (list specific values to change)
- What bugs did you notice?
- What do your friends say when they play?

Feed these notes into the next Claude Code session as context. This is how you iteratively converge on a game that feels great.
