// --- Simulation ---
export const TICK_RATE = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 50ms

// --- Arena / Tilemap ---
export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 64;
export const MAP_HEIGHT_TILES = 64;
export const MAP_WIDTH_PX = MAP_WIDTH_TILES * TILE_SIZE;   // 2048
export const MAP_HEIGHT_PX = MAP_HEIGHT_TILES * TILE_SIZE; // 2048
export const ARENA_WIDTH = MAP_WIDTH_PX;
export const ARENA_HEIGHT = MAP_HEIGHT_PX;

// --- Player ---
export const PLAYER_SPEED = 280;           // pixels per second (max speed)
export const PLAYER_RADIUS = 16;           // collision half-size
export const MAX_HEALTH = 100;
export const PLAYER_ACCELERATION = 900;    // pixels per second² — snappy ramp-up
export const PLAYER_FRICTION = 1500;       // deceleration when no input — quick stop

// --- Projectile ---
export const PROJECTILE_SPEED = 600;       // pixels per second
export const PROJECTILE_MAX_RANGE = 800;   // max travel distance before despawn
export const PROJECTILE_RADIUS = 2;        // collision radius

// --- Melee ---
export const MELEE_ARC_DEGREES = 90;       // swing arc width
export const MELEE_RANGE = 48;             // pixels from player center
export const MELEE_ACTIVE_FRAMES = 6;      // frames the hitbox is active

// --- Sandbox ---
export const SANDBOX_BOT_COUNT = 5;
export const BOT_SESSION_PREFIX = "bot_";
export const SANDBOX_RESPAWN_TIME_MS = 60000; // 60 seconds

// --- Dash ---
export const DASH_DISTANCE = 150;                // pixels traveled during dash
export const DASH_DURATION_FRAMES = 10;          // frames the dash lasts
export const DASH_COOLDOWN_TICKS = 100;           // ticks before dash can be used again

// --- Dash Strike ---
export const DASH_STRIKE_RANGE_MULT = 2;         // melee range multiplier
export const DASH_STRIKE_DAMAGE_MULT = 2;        // melee damage multiplier

// --- Input / Combo Timing ---
export const INPUT_BUFFER_SIZE = 60;             // frames stored (for combo detection)
export const COMBO_WINDOW_FRAMES = 15;           // max frames between combo steps (double-tap window)
export const DASH_STRIKE_WINDOW_FRAMES = 10;     // attack within this many frames after dash

// --- Screen Shake ---
export const SHAKE_SHOOT_MAG = 1;            // pixels
export const SHAKE_SHOOT_DURATION = 50;      // ms
export const SHAKE_MELEE_HIT_MAG = 3;
export const SHAKE_MELEE_HIT_DURATION = 100;
export const SHAKE_DAMAGE_MAG = 4;
export const SHAKE_DAMAGE_DURATION = 120;

// --- Hit-Stop (Freeze Frames) ---
export const HITSTOP_MELEE_MS = 50;          // 3 frames at 60fps

// --- Knockback ---
export const KNOCKBACK_PROJECTILE = 30;      // pixels
export const KNOCKBACK_MELEE = 60;
export const KNOCKBACK_DECAY_FRAMES = 10;

// --- Server Combat ---
export const SHOOT_COOLDOWN_TICKS = 4;         // 200ms at 20Hz
export const MELEE_COOLDOWN_TICKS = 8;         // 400ms at 20Hz
export const RESPAWN_TIME_MS = 3000;
export const MAX_SERVER_PROJECTILES = 100;

// --- Loot / Lockers ---
export const LOCKER_INTERACT_RANGE = 48;  // pixels from player center
export const PICKUP_RADIUS = 12;          // circle-vs-circle pickup range
export const PICKUP_INTERACT_RANGE = 48;  // max distance to click-pickup a weapon
export const ACTIVE_LOCKERS_MIN = 15;     // minimum lockers active per match
export const ACTIVE_LOCKERS_MAX = 20;     // maximum lockers active per match

// --- Match Lifecycle ---
export const MIN_PLAYERS_TO_START = 2;
export const COUNTDOWN_DURATION_MS = 5000;
export const POST_MATCH_DELAY_MS = 10000;

// --- Consumables ---
export const MAX_CONSUMABLE_SLOTS = 2;
export const CONSUMABLE_USE_COOLDOWN_MS = 500;
export const CONSUMABLE_SPAWN_CHANCE = 0.3;  // 30% chance locker has consumable instead of weapon

// --- Vehicles ---
export const VEHICLE_INTERACT_RANGE = 48;
export const VEHICLE_SPAWN_MIN = 3;
export const VEHICLE_SPAWN_MAX = 5;
export const VEHICLE_RUN_OVER_COOLDOWN_MS = 500;
export const VEHICLE_RUN_OVER_RADIUS = 24;
export const DISMOUNT_PLAYER_SPEED_FACTOR = 0.9;  // player gets 90% of vehicle speed on dismount
export const DISMOUNT_PLAYER_SPEED_CAP = 480;    // cap so Jet Ski doesn't launch you into orbit
export const DISMOUNT_PLAYER_FRICTION = 200;     // low friction while sliding from dismount (vs normal 750)

// --- Lobby ---
export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const MAX_CHAT_HISTORY = 50;
export const LOBBY_MAX_BOTS = 7;

// --- Network ---
// Server reads PORT env var (for test environments on different ports); client ignores this.
export const SERVER_PORT = typeof process !== "undefined" && process.env.PORT
  ? Number(process.env.PORT)
  : 3001;
export const MAX_PLAYERS_PER_ROOM = 20;
export const CHARACTER_COUNT = 9;
