// ─── Vehicle definitions ──────────────────────────────────────────────

export enum VehicleId {
  OfficeChair = "office_chair",
  RedWagon    = "red_wagon",
  GolfCart    = "golf_cart",
  JetSki      = "jet_ski",
  ForkLift    = "fork_lift",
}

export interface VehicleConfig {
  id: VehicleId;
  name: string;
  /** Max forward speed in px/s */
  maxSpeed: number;
  /** Max reverse speed in px/s */
  reverseSpeed: number;
  /** Forward acceleration in px/s² */
  accel: number;
  /** Braking/reverse deceleration in px/s² */
  brakeAccel: number;
  /** Passive deceleration when coasting (no W/S) in px/s² */
  friction: number;
  /** Steering speed in rad/s (how fast A/D rotate heading) */
  turnSpeed: number;
  /** Grip: how quickly velocity aligns with heading (0-1, 0 = ice, 1 = rails) */
  grip: number;
  /** How long the vehicle lasts when ridden (ms) */
  durabilityMs: number;
  /** Can this vehicle damage players by running them over? */
  canRunOver: boolean;
  /** Damage dealt on run-over collision */
  runOverDamage: number;
  /** Tint color for placeholder sprite */
  color: number;
}

// ─── Office Chair ─────────────────────────────────────────────────────
// Slow to start, builds momentum, coasts forever. Spins like crazy
// (it's a swivel chair!). Very low grip — slides everywhere. The
// sleeper pick: if you get it up to speed it's surprisingly lethal
// and hilarious to watch.
export const VEHICLE_OFFICE_CHAIR: VehicleConfig = {
  id: VehicleId.OfficeChair,
  name: "Office Chair",
  maxSpeed: 500,
  reverseSpeed: 150,
  accel: 180,           // sluggish start — takes a while to build speed
  brakeAccel: 200,
  friction: 50,         // coasts forever
  turnSpeed: 5.0,       // spins like a top — it's a swivel chair
  grip: 0.15,           // basically on ice — slides everywhere
  durabilityMs: 35_000,
  canRunOver: true,
  runOverDamage: 15,
  color: 0x555555,
};

// ─── Red Wagon ────────────────────────────────────────────────────────
// Born to drift. Decent speed, snappy acceleration, but low grip means
// it fishtails through corners beautifully. Great for whipping around
// obstacles. Very durable (it's a sturdy kids' toy).
export const VEHICLE_RED_WAGON: VehicleConfig = {
  id: VehicleId.RedWagon,
  name: "Red Wagon",
  maxSpeed: 460,
  reverseSpeed: 180,
  accel: 350,
  brakeAccel: 300,
  friction: 120,
  turnSpeed: 3.5,       // quick steering
  grip: 0.3,            // drifts through corners
  durabilityMs: 45_000,
  canRunOver: true,
  runOverDamage: 20,
  color: 0xCC2222,
};

// ─── Golf Cart ────────────────────────────────────────────────────────
// The reliable, boring choice. Good handling, moderate speed, responsive
// controls. What you'd expect. The Honda Civic of storage facility vehicles.
export const VEHICLE_GOLF_CART: VehicleConfig = {
  id: VehicleId.GolfCart,
  name: "Golf Cart",
  maxSpeed: 500,
  reverseSpeed: 200,
  accel: 380,
  brakeAccel: 450,
  friction: 400,        // stops reasonably fast
  turnSpeed: 3.0,
  grip: 0.75,           // good traction — goes where you point it
  durabilityMs: 30_000,
  canRunOver: true,
  runOverDamage: 30,
  color: 0x44AA44,
};

// ─── Jet Ski ──────────────────────────────────────────────────────────
// An absolute menace. Insanely fast, barely steers (it's on dry
// concrete!). Almost zero grip — once it's moving it's going THAT way
// whether you like it or not. Burns through durability fast. Devastating
// if you manage to actually hit someone. Approach with reckless abandon.
export const VEHICLE_JET_SKI: VehicleConfig = {
  id: VehicleId.JetSki,
  name: "Jet Ski",
  maxSpeed: 850,
  reverseSpeed: 100,
  accel: 600,           // rockets off the line
  brakeAccel: 150,      // good luck stopping
  friction: 80,         // slides forever on concrete
  turnSpeed: 1.2,       // sluggish steering
  grip: 0.05,           // basically on ice — commits to its line
  durabilityMs: 15_000, // burns out fast, not meant for land
  canRunOver: true,
  runOverDamage: 60,    // absolute truck
  color: 0x2288DD,
};

// ─── Fork Lift ────────────────────────────────────────────────────────
// The tank. Slow, heavy, stops on a dime. Very high grip — it goes
// exactly where you steer it, no sliding. Turns well at low speed
// (like a real forklift). Absolutely demolishes anyone it touches.
// Patient players who can corner someone will be rewarded.
export const VEHICLE_FORK_LIFT: VehicleConfig = {
  id: VehicleId.ForkLift,
  name: "Fork Lift",
  maxSpeed: 340,
  reverseSpeed: 220,    // good reverse — forklifts do this a lot
  accel: 500,           // instant torque — electric motor
  brakeAccel: 700,
  friction: 600,        // stops almost immediately
  turnSpeed: 2.5,
  grip: 0.9,            // heavy treads, planted to the ground
  durabilityMs: 40_000, // built to last
  canRunOver: true,
  runOverDamage: 50,    // industrial equipment hurts
  color: 0xDDAA22,
};

export const VEHICLE_REGISTRY: Record<string, VehicleConfig> = {
  [VehicleId.OfficeChair]: VEHICLE_OFFICE_CHAIR,
  [VehicleId.RedWagon]: VEHICLE_RED_WAGON,
  [VehicleId.GolfCart]: VEHICLE_GOLF_CART,
  [VehicleId.JetSki]: VEHICLE_JET_SKI,
  [VehicleId.ForkLift]: VEHICLE_FORK_LIFT,
};

export const ALL_VEHICLE_IDS: VehicleId[] = [
  VehicleId.OfficeChair,
  VehicleId.RedWagon,
  VehicleId.GolfCart,
  VehicleId.JetSki,
  VehicleId.ForkLift,
];

export function getVehicleConfig(id: string): VehicleConfig | undefined {
  return VEHICLE_REGISTRY[id];
}

// ─── Spawn slots ─────────────────────────────────────────────────────

export interface VehicleSpawnSlot {
  x: number;
  y: number;
}

/** Potential vehicle spawn positions (pixel coords) in open areas of the map */
export const VEHICLE_SPAWN_SLOTS: VehicleSpawnSlot[] = [
  // Center aisle (x ~1008 = tile 31.5)
  { x: 1008, y: 416 },   // top of center aisle
  { x: 1008, y: 1024 },  // mid center aisle
  { x: 1008, y: 1632 },  // bottom of center aisle
  // Left aisles (between storage columns)
  { x: 288, y: 448 },    // left col gap, upper
  { x: 288, y: 1408 },   // left col gap, lower
  // Right aisles (mirrored)
  { x: 1728, y: 448 },
  { x: 1728, y: 1408 },
  // Open spawn zones
  { x: 1008, y: 112 },   // very top
  { x: 1008, y: 1936 },  // very bottom
];

/** Pick a random subset of spawn slots for a match */
export function pickActiveVehicleSpawns(
  slots: VehicleSpawnSlot[],
  min: number,
  max: number
): VehicleSpawnSlot[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...slots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
