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
export const PLAYER_SPEED = 200;           // pixels per second (server instant-velocity)
export const PLAYER_RADIUS = 16;           // collision half-size
export const MAX_HEALTH = 100;
export const PLAYER_ACCELERATION = 2000;   // pixels per second² (client-side)
export const PLAYER_FRICTION = 2000;       // deceleration when no input (client-side)

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

// --- Input / Combo Timing ---
export const INPUT_BUFFER_SIZE = 60;             // frames stored
export const COMBO_WINDOW_FRAMES = 20;           // max frames between combo steps
export const CHARGED_SHOT_MIN_FRAMES = 20;       // hold attack this long to charge
export const DASH_STRIKE_WINDOW_FRAMES = 10;     // attack within this many frames after dash

// --- Network ---
export const SERVER_PORT = 3001;
export const MAX_PLAYERS_PER_ROOM = 20;
