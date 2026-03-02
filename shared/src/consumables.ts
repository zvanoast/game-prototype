import { ConsumableId, type ConsumableConfig } from "./types.js";

export const CONSUMABLE_HEALTH_PACK: ConsumableConfig = {
  id: ConsumableId.HealthPack,
  name: "First Aid Kit",
  description: "Heal 50 HP instantly",
  color: 0x44ff44,
  healAmount: 50,
};

export const CONSUMABLE_SPEED_BOOST: ConsumableConfig = {
  id: ConsumableId.SpeedBoost,
  name: "Energy Drink",
  description: "1.4x speed for 8 seconds",
  color: 0x44ddff,
  durationMs: 8000,
  speedMultiplier: 1.4,
};

export const CONSUMABLE_SHIELD: ConsumableConfig = {
  id: ConsumableId.Shield,
  name: "Bubble Wrap Armor",
  description: "+40 shield HP for 10 seconds",
  color: 0xdd88ff,
  durationMs: 10000,
  shieldHp: 40,
};

export const CONSUMABLE_DAMAGE_BOOST: ConsumableConfig = {
  id: ConsumableId.DamageBoost,
  name: "Adrenaline Shot",
  description: "1.5x damage for 6 seconds",
  color: 0xff4444,
  durationMs: 6000,
  damageMultiplier: 1.5,
};

export const CONSUMABLE_REGISTRY: Record<string, ConsumableConfig> = {
  [ConsumableId.HealthPack]: CONSUMABLE_HEALTH_PACK,
  [ConsumableId.SpeedBoost]: CONSUMABLE_SPEED_BOOST,
  [ConsumableId.Shield]: CONSUMABLE_SHIELD,
  [ConsumableId.DamageBoost]: CONSUMABLE_DAMAGE_BOOST,
};

/** Consumables that can appear in lockers */
export const LOOTABLE_CONSUMABLE_IDS: ConsumableId[] = [
  ConsumableId.HealthPack,
  ConsumableId.SpeedBoost,
  ConsumableId.Shield,
  ConsumableId.DamageBoost,
];

/** Get a consumable config by ID. Returns undefined if not found. */
export function getConsumableConfig(id: string): ConsumableConfig | undefined {
  return CONSUMABLE_REGISTRY[id];
}
