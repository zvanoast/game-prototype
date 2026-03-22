# Storage Wars — Claude Code Project Guide

## Progress

See `claude-progress.md` in the project root for current phase status, completed work, and what's next. Read it at the start of each session and update it after completing phases or milestones.

## Project Overview

A top-down 2D multiplayer last-man-standing elimination shooter set in a storage facility. Players open storage lockers to find household items to use as weapons. Retro pixel-art aesthetics with fighting-game-style input combos ("tech"). Browser-based technical prototype.

## Tech Stack

- **Client:** Phaser 3 with TypeScript
- **Server:** Colyseus (Node.js/TypeScript) — authoritative multiplayer game server
- **Build:** Vite
- **Monorepo:** Single repo with `client/`, `server/`, and `shared/` directories
- **Package Manager:** npm workspaces

## Project Structure

```
storage-wars/
├── client/                  # Phaser 3 game client
│   ├── src/
│   │   ├── main.ts          # Phaser game config and entry point
│   │   ├── scenes/          # Phaser scenes (Boot, Menu, Game, GameOver)
│   │   ├── entities/        # Game objects (Player, Projectile, Pickup, TestDummy)
│   │   ├── systems/         # Reusable systems (InputBuffer, ComboDetector, CombatState)
│   │   ├── network/         # Colyseus client connection, message handlers, prediction
│   │   ├── ui/              # HUD, health bars, kill feed, debug overlays
│   │   └── assets/          # Sprites, tilemaps, audio (placeholder/generated)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── server/                  # Colyseus game server
│   ├── src/
│   │   ├── index.ts         # Server entry, Express + Colyseus setup
│   │   ├── rooms/           # Colyseus room definitions (GameRoom, LobbyRoom)
│   │   ├── state/           # Colyseus state schemas (GameState, PlayerState, etc.)
│   │   ├── systems/         # Server-side game logic (Combat, Loot)
│   ├── tsconfig.json
│   └── package.json
├── shared/                  # Shared types between client and server
│   ├── src/
│   │   ├── types.ts         # Shared interfaces (InputPayload, WeaponType, etc.)
│   │   ├── constants.ts     # Shared constants (tick rate, arena size, physics values)
│   │   └── combo-defs.ts    # Combo/tech input definitions (used by both sides)
│   ├── tsconfig.json
│   └── package.json
├── CLAUDE.md                # This file
├── ARCHITECTURE.md          # Technical architecture decisions
├── package.json             # Root workspace config
└── tsconfig.base.json       # Shared TS config
```

## Architecture Principles

1. **Server is authoritative.** The server owns all game state. Clients send inputs, never positions. The server simulates physics and combat, then broadcasts state.
6. **Bot AI uses Utility AI.** Bots score all actions each tick and execute the highest-scoring one. They produce `InputPayload` objects pushed into the same `inputQueue` as human players — no special codepaths. Persona configs (aggression, accuracy, preferred range, etc.) weight the action scores. Files live in `server/src/systems/bot/`.
2. **Client-side prediction.** The client immediately applies local player inputs for responsiveness, then reconciles when server state arrives. Other players are interpolated.
3. **Fixed tick rate.** The server runs game simulation at a fixed tick rate (20 ticks/sec for prototype). Client renders at 60fps and interpolates between server states.
4. **Input buffer pattern.** Raw inputs are recorded into a circular buffer each frame. The combo detection system reads from this buffer to match patterns. This runs on BOTH client (for instant feedback) and server (for validation).
5. **Component-like entities.** Phaser GameObjects are extended with behavior via composition, not deep inheritance. A Player has-a CombatStateMachine, has-a InputBuffer, etc.

## Key Technical Decisions

- **WebSocket transport** via Colyseus (not UDP/ENet). Fine for prototype; adds ~10-30ms latency vs UDP but works in browsers without plugins.
- **Colyseus Schema** for state sync. Define state as schema classes; Colyseus handles delta compression and patching automatically.
- **Phaser Arcade Physics** for client-side prediction and visual feedback. Server runs its own simplified physics (AABB collision checks, not full Phaser).
- **Placeholder art first.** Use colored rectangles or simple geometric sprites. Art is not a blocker for any phase.

## Coding Conventions

- All game constants (speeds, damage values, timing windows) go in `shared/src/constants.ts` or `server/src/config/`. Never hardcode magic numbers in game logic.
- Input combo definitions are data-driven: defined as arrays of InputPattern objects, not hardcoded if/else chains.
- Every system that affects gameplay feel (input buffer size, combo windows, hit-stop duration) should expose its tuning parameters as named constants.
- Use Phaser's built-in event system for decoupled communication between client systems (e.g., `this.events.emit('combo:executed', comboName)`).
- Server room logic should be broken into focused system classes (CombatSystem, LootSystem) that the room orchestrates, not one giant room file.

## Current Phase

Character selection, production deployment, test environment deployment, and bot AI complete. 9 phases of gameplay + bot AI implemented. See `claude-progress.md` for full history.

## Branching Rules

**Never commit directly to `main`.** All changes — features, bug fixes, tweaks — must be made on a new branch.

- Check the current branch before making any changes: `git branch --show-current`
- If on `main`, create a new branch first using a descriptive name:
  - `feature/<name>` for new features
  - `fix/<name>` for bug fixes
  - `chore/<name>` for non-gameplay changes (docs, config, CI)
- This applies to all contributors.

## Development Commands

```bash
# From root
npm install             # Install all workspace dependencies
npm run dev             # Start both client (Vite) and server (Colyseus) concurrently
npm run dev:client      # Start only the Phaser client
npm run dev:server      # Start only the Colyseus server
npm run build           # Build all packages
npm run build:client    # Build only the Phaser client (used in CI)
npm run typecheck       # Type-check all packages
npm run start:prod      # Start server in production (tsx with tsconfig)
```

## Deployment

**Production URL:** `https://game.zachvanoast.com`

### Infrastructure
- **Hosting:** AWS EC2 (`t3.small`, Ubuntu 22.04) — shared with Discord bot (bangabot)
- **Process Manager:** PM2 (process name: `game-prototype`)
- **Reverse Proxy:** nginx → `localhost:3001`
- **SSL:** Let's Encrypt via certbot (auto-renewing)
- **DNS:** Route 53 A record `game.zachvanoast.com` → EC2 public IP

### CI/CD
- **Workflow:** `.github/workflows/deploy.yml`
- **Trigger:** Push to `main` (only when game files change — `client/`, `server/`, `shared/`, `package.json`, etc.)
- **Process:** GHA builds client → tars artifact → SCPs to EC2 → `npm ci` + `pm2 restart`
- **Health check:** Post-deploy curl to `/api/health`, PM2 logs dumped on failure
- **Manual trigger:** `workflow_dispatch` with optional `run_setup=true` for infra provisioning

### GitHub Secrets Required
- `EC2_HOST` — EC2 public IP
- `EC2_USER` — SSH username (e.g., `ubuntu`)
- `EC2_SSH_KEY` — SSH private key (PEM)

### EC2 Setup Script
`scripts/ec2-setup.sh` is idempotent — installs Node.js 20, PM2, nginx, certbot SSL, and test subdomain nginx configs. Only runs via manual workflow dispatch with `run_setup=true`. Safe to re-run.

### Test Environments
Label-driven deploys for testing feature branches without merging to main.

```
test-zach.zachvanoast.com  → nginx → localhost:3002 → PM2 "game-test-zach"
test-keith.zachvanoast.com → nginx → localhost:3003 → PM2 "game-test-keith"
game.zachvanoast.com       → nginx → localhost:3001 → PM2 "game-prototype" (prod)
```

- **Workflow:** `.github/workflows/deploy-test.yml`
- **Trigger:** Add label `deploy:test-zach` or `deploy:test-keith` to any PR
- **Auto-redeploy:** Pushing new commits to a labeled PR triggers redeploy
- **Teardown:** Removing the label or closing the PR stops the PM2 process
- **Conflict guard:** Only one PR can own a given test env at a time
- **Port config:** `SERVER_PORT` reads `process.env.PORT` (fallback 3001)
- **Manual trigger:** `workflow_dispatch` with env name + branch inputs

### Production Architecture
In production, the Colyseus server (port 3001) serves both:
- WebSocket connections for game rooms
- Static files from `client/dist` via `express.static`
- SPA fallback route for client-side routing

Client auto-detects dev vs prod environment via `window.location` to derive WebSocket (`ws://` vs `wss://`) and REST API URLs.

## Debug Tools

When implementing features, always include corresponding debug overlays that can be toggled with backtick (`). Current debug overlays:
- Network: shows ping, server tick, client prediction offset
- Input: shows input buffer contents, active combo matches
- Physics: shows hitboxes, collision boundaries
