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
  /** Movement speed tier (1-3) */
  speedTier: 1 | 2 | 3;
  /** Actual speed in px/s while mounted */
  speed: number;
  /** How long the vehicle lasts when ridden (ms) */
  durabilityMs: number;
  /** Can this vehicle damage players by running them over? */
  canRunOver: boolean;
  /** Damage dealt on run-over collision */
  runOverDamage: number;
  /** Tint color for placeholder sprite */
  color: number;
}

// Speed tier mapping: tier → px/s
export const VEHICLE_SPEED_TIERS: Record<number, number> = { 1: 420, 2: 560, 3: 750 };

export const VEHICLE_OFFICE_CHAIR: VehicleConfig = {
  id: VehicleId.OfficeChair,
  name: "Office Chair",
  speedTier: 1,
  speed: VEHICLE_SPEED_TIERS[1],
  durabilityMs: 30_000,
  canRunOver: false,
  runOverDamage: 0,
  color: 0x555555,
};

export const VEHICLE_RED_WAGON: VehicleConfig = {
  id: VehicleId.RedWagon,
  name: "Red Wagon",
  speedTier: 1,
  speed: VEHICLE_SPEED_TIERS[1],
  durabilityMs: 45_000,
  canRunOver: false,
  runOverDamage: 0,
  color: 0xCC2222,
};

export const VEHICLE_GOLF_CART: VehicleConfig = {
  id: VehicleId.GolfCart,
  name: "Golf Cart",
  speedTier: 2,
  speed: VEHICLE_SPEED_TIERS[2],
  durabilityMs: 30_000,
  canRunOver: true,
  runOverDamage: 30,
  color: 0x44AA44,
};

export const VEHICLE_JET_SKI: VehicleConfig = {
  id: VehicleId.JetSki,
  name: "Jet Ski",
  speedTier: 3,
  speed: VEHICLE_SPEED_TIERS[3],
  durabilityMs: 20_000,
  canRunOver: true,
  runOverDamage: 40,
  color: 0x2288DD,
};

export const VEHICLE_FORK_LIFT: VehicleConfig = {
  id: VehicleId.ForkLift,
  name: "Fork Lift",
  speedTier: 2,
  speed: VEHICLE_SPEED_TIERS[2],
  durabilityMs: 25_000,
  canRunOver: true,
  runOverDamage: 35,
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
