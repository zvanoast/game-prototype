// --- Simulation ---
export const TICK_RATE = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 50ms

// --- Arena ---
export const ARENA_WIDTH = 2000;
export const ARENA_HEIGHT = 2000;

// --- Player ---
export const PLAYER_SPEED = 200;     // pixels per second
export const PLAYER_RADIUS = 16;     // collision half-size
export const MAX_HEALTH = 100;

// --- Input / Combo Timing ---
export const INPUT_BUFFER_SIZE = 60;             // frames stored
export const COMBO_WINDOW_FRAMES = 20;           // max frames between combo steps
export const CHARGED_SHOT_MIN_FRAMES = 20;       // hold attack this long to charge
export const DASH_STRIKE_WINDOW_FRAMES = 10;     // attack within this many frames after dash

// --- Network ---
export const SERVER_PORT = 3001;
export const MAX_PLAYERS_PER_ROOM = 20;
