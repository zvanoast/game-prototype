import { GameStateSchema, PlayerSchema, LockerSchema, PickupSchema } from "../../state/GameState";
import { dist } from "./BotNavigation";

/** What a bot can "see" — spatial queries over game state */

export interface NearbyPlayer {
  sessionId: string;
  player: PlayerSchema;
  distance: number;
  angle: number;
}

export interface NearbyLocker {
  locker: LockerSchema;
  distance: number;
}

export interface NearbyPickup {
  pickup: PickupSchema;
  distance: number;
}

export interface BotPerceptionData {
  /** All alive, non-self players sorted by distance */
  enemies: NearbyPlayer[];
  /** Nearest enemy (or null) */
  nearestEnemy: NearbyPlayer | null;
  /** Closed lockers sorted by distance */
  closedLockers: NearbyLocker[];
  /** Ground pickups sorted by distance */
  pickups: NearbyPickup[];
  /** Our health percentage 0-1 */
  healthPct: number;
  /** Do we have a ranged weapon? */
  hasRanged: boolean;
  /** Do we have a melee weapon (non-fists)? */
  hasMeleeUpgrade: boolean;
  /** Do we have any consumables? */
  hasConsumable: boolean;
  /** Number of alive players total */
  aliveCount: number;
}

/** Build perception data for a bot */
export function perceive(
  botId: string,
  state: GameStateSchema,
  maxHealth: number,
): BotPerceptionData {
  const self = state.players.get(botId);
  if (!self) {
    return {
      enemies: [],
      nearestEnemy: null,
      closedLockers: [],
      pickups: [],
      healthPct: 0,
      hasRanged: false,
      hasMeleeUpgrade: false,
      hasConsumable: false,
      aliveCount: 0,
    };
  }

  const mx = self.x;
  const my = self.y;

  // Enemies
  const enemies: NearbyPlayer[] = [];
  let aliveCount = 0;

  state.players.forEach((player: PlayerSchema, sessionId: string) => {
    if (sessionId === botId) return;
    if (player.state === "dead" || player.eliminated) return;
    aliveCount++;
    const d = dist(mx, my, player.x, player.y);
    const angle = Math.atan2(player.y - my, player.x - mx);
    enemies.push({ sessionId, player, distance: d, angle });
  });

  // Count self if alive
  if (self.state !== "dead" && !self.eliminated) aliveCount++;

  enemies.sort((a, b) => a.distance - b.distance);

  // Closed lockers
  const closedLockers: NearbyLocker[] = [];
  for (let i = 0; i < state.lockers.length; i++) {
    const locker = state.lockers.at(i);
    if (!locker || locker.opened) continue;
    const d = dist(mx, my, locker.x, locker.y);
    closedLockers.push({ locker, distance: d });
  }
  closedLockers.sort((a, b) => a.distance - b.distance);

  // Pickups
  const pickups: NearbyPickup[] = [];
  for (let i = 0; i < state.pickups.length; i++) {
    const pickup = state.pickups.at(i);
    if (!pickup) continue;
    const d = dist(mx, my, pickup.x, pickup.y);
    pickups.push({ pickup, distance: d });
  }
  pickups.sort((a, b) => a.distance - b.distance);

  return {
    enemies,
    nearestEnemy: enemies.length > 0 ? enemies[0] : null,
    closedLockers,
    pickups,
    healthPct: self.health / maxHealth,
    hasRanged: !!self.rangedWeaponId && self.rangedAmmo > 0,
    hasMeleeUpgrade: self.meleeWeaponId !== "fists",
    hasConsumable: !!self.consumableSlot1 || !!self.consumableSlot2,
    aliveCount,
  };
}
