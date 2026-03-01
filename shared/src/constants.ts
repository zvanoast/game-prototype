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
export const PLAYER_SPEED = 340;           // pixels per second (max speed)
export const PLAYER_RADIUS = 16;           // collision half-size
export const MAX_HEALTH = 100;
export const PLAYER_ACCELERATION = 450;    // pixels per second² — ~0.75s to max speed
export const PLAYER_FRICTION = 750;        // deceleration when no input — gradual stop

// --- Projectile ---
export const PROJECTILE_SPEED = 600;       // pixels per second
export const PROJECTILE_MAX_RANGE = 800;   // max travel distance before despawn
export const PROJECTILE_RADIUS = 2;        // collision radius

// --- Melee ---
export const MELEE_ARC_DEGREES = 90;       // swing arc width
export const MELEE_RANGE = 48;             // pixels from player center
export const MELEE_ACTIVE_FRAMES = 6;      // frames the hitbox is active

// --- Test Dummies ---
export const DUMMY_COUNT = 5;
export const DUMMY_RESPAWN_TIME_MS = 2000;

// --- Dash ---
export const DASH_DISTANCE = 150;                // pixels traveled during dash
export const DASH_DURATION_FRAMES = 10;          // frames the dash lasts
export const DASH_COOLDOWN_TICKS = 10;           // ticks before dash can be used again

// --- Charged Shot ---
export const CHARGED_SHOT_SPEED = 900;           // pixels per second
export const CHARGED_SHOT_SIZE = 8;              // projectile size (px)
export const CHARGED_SHOT_DAMAGE_MULT = 3;       // damage multiplier vs normal shot

// --- Dash Strike ---
export const DASH_STRIKE_RANGE_MULT = 2;         // melee range multiplier
export const DASH_STRIKE_DAMAGE_MULT = 2;        // melee damage multiplier

// --- Input / Combo Timing ---
export const INPUT_BUFFER_SIZE = 30;             // frames stored (for combo detection)
export const COMBO_WINDOW_FRAMES = 15;           // max frames between combo steps (double-tap window)
export const CHARGED_SHOT_MIN_FRAMES = 20;       // hold attack this long to charge
export const DASH_STRIKE_WINDOW_FRAMES = 10;     // attack within this many frames after dash

// --- Screen Shake ---
export const SHAKE_SHOOT_MAG = 1;            // pixels
export const SHAKE_SHOOT_DURATION = 50;      // ms
export const SHAKE_MELEE_HIT_MAG = 3;
export const SHAKE_MELEE_HIT_DURATION = 100;
export const SHAKE_CHARGED_SHOT_MAG = 5;
export const SHAKE_CHARGED_SHOT_DURATION = 150;
export const SHAKE_DAMAGE_MAG = 4;
export const SHAKE_DAMAGE_DURATION = 120;

// --- Hit-Stop (Freeze Frames) ---
export const HITSTOP_MELEE_MS = 50;          // 3 frames at 60fps
export const HITSTOP_CHARGED_MS = 83;        // 5 frames at 60fps

// --- Knockback ---
export const KNOCKBACK_PROJECTILE = 30;      // pixels
export const KNOCKBACK_MELEE = 60;
export const KNOCKBACK_CHARGED = 100;
export const KNOCKBACK_DECAY_FRAMES = 10;

// --- Server Combat ---
export const SHOOT_COOLDOWN_TICKS = 4;         // 200ms at 20Hz
export const MELEE_COOLDOWN_TICKS = 8;         // 400ms at 20Hz
export const RESPAWN_TIME_MS = 3000;
export const MAX_SERVER_PROJECTILES = 100;

// --- Loot / Lockers ---
export const LOCKER_INTERACT_RANGE = 48;  // pixels from player center
export const PICKUP_RADIUS = 12;          // circle-vs-circle pickup range

// --- Network ---
export const SERVER_PORT = 3001;
export const MAX_PLAYERS_PER_ROOM = 20;
