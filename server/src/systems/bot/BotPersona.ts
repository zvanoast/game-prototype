/** Data-driven bot personality configuration */
export interface BotPersona {
  id: string;                    // matches shared BotPersonaMeta.id
  name: string;
  characterIndex: number;        // preferred character model
  aggression: number;            // 0-1, weight for attack actions
  selfPreservation: number;      // 0-1, weight for flee/heal actions
  lootPriority: number;          // 0-1, weight for locker/pickup actions
  preferredRange: number;        // ideal distance from target (px)
  aimAccuracy: number;           // 0-1, affects aim jitter (1=perfect)
  reactionDelayTicks: number;    // delay between seeing and acting
  healthFleeThreshold: number;   // HP% below which flee weight spikes
  engageMaxDistance: number;     // won't chase beyond this range
  meleePreference: number;       // 0-1, melee vs ranged preference
  strafeFrequency: number;       // 0-1, strafe during combat
  dashAggressiveness: number;    // 0-1, eagerness to dash
}

export const PERSONA_RUSHER: BotPersona = {
  id: "rusher",
  name: "Rusher Rick",
  characterIndex: 4,
  aggression: 0.9,
  selfPreservation: 0.2,
  lootPriority: 0.3,
  preferredRange: 64,
  aimAccuracy: 0.5,
  reactionDelayTicks: 2,
  healthFleeThreshold: 0.15,
  engageMaxDistance: 600,
  meleePreference: 0.8,
  strafeFrequency: 0.6,
  dashAggressiveness: 0.8,
};

export const PERSONA_SNIPER: BotPersona = {
  id: "sniper",
  name: "Sniper Sam",
  characterIndex: 5,
  aggression: 0.7,
  selfPreservation: 0.5,
  lootPriority: 0.4,
  preferredRange: 400,
  aimAccuracy: 0.9,
  reactionDelayTicks: 4,
  healthFleeThreshold: 0.3,
  engageMaxDistance: 700,
  meleePreference: 0.1,
  strafeFrequency: 0.3,
  dashAggressiveness: 0.3,
};

export const PERSONA_LOOTER: BotPersona = {
  id: "looter",
  name: "Looter Larry",
  characterIndex: 6,
  aggression: 0.3,
  selfPreservation: 0.6,
  lootPriority: 0.9,
  preferredRange: 200,
  aimAccuracy: 0.6,
  reactionDelayTicks: 3,
  healthFleeThreshold: 0.4,
  engageMaxDistance: 400,
  meleePreference: 0.4,
  strafeFrequency: 0.4,
  dashAggressiveness: 0.4,
};

export const PERSONA_SURVIVOR: BotPersona = {
  id: "survivor",
  name: "Survivor Sue",
  characterIndex: 7,
  aggression: 0.4,
  selfPreservation: 0.9,
  lootPriority: 0.5,
  preferredRange: 250,
  aimAccuracy: 0.7,
  reactionDelayTicks: 3,
  healthFleeThreshold: 0.5,
  engageMaxDistance: 350,
  meleePreference: 0.3,
  strafeFrequency: 0.5,
  dashAggressiveness: 0.5,
};

export const PERSONA_BERSERKER: BotPersona = {
  id: "berserker",
  name: "Berserker Bob",
  characterIndex: 8,
  aggression: 1.0,
  selfPreservation: 0.1,
  lootPriority: 0.2,
  preferredRange: 48,
  aimAccuracy: 0.4,
  reactionDelayTicks: 1,
  healthFleeThreshold: 0.1,
  engageMaxDistance: 500,
  meleePreference: 1.0,
  strafeFrequency: 0.7,
  dashAggressiveness: 0.9,
};

export const ALL_PERSONAS: BotPersona[] = [
  PERSONA_RUSHER,
  PERSONA_SNIPER,
  PERSONA_LOOTER,
  PERSONA_SURVIVOR,
  PERSONA_BERSERKER,
];

/** Lookup persona by id */
export const PERSONA_MAP: Record<string, BotPersona> = {};
for (const p of ALL_PERSONAS) {
  PERSONA_MAP[p.id] = p;
}
