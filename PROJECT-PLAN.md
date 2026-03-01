# Project Plan — Storage Wars Technical Prototype

## Phase Summary

| Phase | Focus | Sessions | Deliverable |
|-------|-------|----------|-------------|
| 0 | Scaffold | 1 | Monorepo, two players moving on screen |
| 1 | Single Player Movement & Combat | 2-3 | Shooting, melee, tilemap arena |
| 2 | Input Combo System | 2-3 | Tech moves, state machine, juice |
| 3 | Multiplayer Foundation | 3-4 | Authoritative netcode, prediction, interpolation |
| 4 | Storage Wars — Loot & Weapons | 1-2 | 7 weapons, lockers, pickups, equipment slots |
| 5 | Game Loop | 2-3 | Match lifecycle, lobby, elimination, win condition |
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

## Phase 4 — Storage Wars: Loot & Weapons (COMPLETE)

Implemented as part of the "Storage Wars" theme. See `claude-progress.md` for details.

- 7 weapons: Fists (default) + 3 melee (Hammer, Lamp, Frying Pan) + 3 ranged (Darts, Plates, Staple Gun)
- Two equipment slots: melee + ranged. Players start with Fists, empty ranged.
- 18 storage lockers scattered near obstacles. Press E to open → weapon drops as pickup.
- Pickups auto-collected on walk-over. Old weapon drops behind player with 1s immunity.
- Weapons lost on death, dropped as pickups at death location.
- Shared weapon registry (`shared/src/weapons.ts`) replaces duplicated configs.
- Server CombatSystem uses per-player weapon configs for all damage/cooldown/range.

---

## Phase 5 — Game Loop

### Session 5A: Match Lifecycle and Elimination

```
Implement match flow for last-man-standing elimination (no shrinking zone):

1. Match lifecycle on the server:
   - Phases: "waiting" → "countdown" → "playing" → "ended"
   - Waiting: accept players until minimum (2+). Show "Waiting for players..." on client.
   - Countdown: once minimum reached, 5 second countdown. Players can move but not attack.
   - Playing: combat enabled. No respawning — dead players are eliminated.
   - Ended: when 1 player remains (or 0 if last two kill each other).
     Broadcast winner. After 5 seconds, reset room for next match.

2. Elimination mechanics:
   - During "playing" phase, dead players stay dead (no respawn).
   - Dead players become spectators: camera follows a random alive player,
     cycle with left/right arrow keys.
   - Track "playersAlive" count in state.
   - Show "X players remaining" on HUD.

3. Win condition:
   - Last player standing wins.
   - Server broadcasts "match_end" with winner info.
   - Client shows a "Victory!" or "Eliminated" overlay.
   - After 5 seconds, transition back to waiting phase.

4. Between-match reset:
   - Re-close all lockers with new random weapons.
   - Clear all pickups.
   - Respawn all players at random positions with Fists.
   - Reset health and kills.
```

### Session 5B: Lobby UI and HUD

```
Add match UI:

1. Match status HUD:
   - Show current phase (waiting/countdown/playing).
   - During countdown: large centered "3... 2... 1... FIGHT!" text.
   - During playing: "X alive" indicator.
   - On death: "You were eliminated! (Spectating)" overlay.
   - On win: "Victory!" screen.

2. Kill feed:
   - Top-right corner. Shows "PlayerA eliminated PlayerB" entries.
   - Each fades after 5 seconds. Max 5 visible.
   - Include weapon name in kill message.

3. Player count:
   - Show "Players: X" in top-left during waiting.
   - Show "Alive: X / Y" during playing.

4. Spectator controls:
   - Left/right arrow keys cycle between alive players.
   - Show name of spectated player.
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
   - Storage facility themed floor and wall tiles.
   - Locker sprites with open/closed states.
   - Weapon-specific pickup sprites instead of tinted circles.
   - Add destructible crates as cover (take 3 hits to destroy, drop a random pickup).

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
