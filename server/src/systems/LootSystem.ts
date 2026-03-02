import { Room } from "colyseus";
import { GameStateSchema, PlayerSchema, LockerSchema, PickupSchema } from "../state/GameState";
import {
  LOCKER_INTERACT_RANGE,
  PICKUP_RADIUS,
  PICKUP_INTERACT_RANGE,
  PLAYER_RADIUS,
  TICK_RATE,
  ACTIVE_LOCKERS_MIN,
  ACTIVE_LOCKERS_MAX,
} from "shared";
import { WeaponId } from "shared";
import type { WeaponConfig } from "shared";
import {
  LOCKER_SLOTS,
  pickActiveLockers,
  LOOTABLE_WEAPON_IDS,
  getWeaponConfig,
  WEAPON_FISTS,
} from "shared";

interface PlayerEquipment {
  meleeWeaponId: string;
  rangedWeaponId: string;
}

/** Ticks a pickup must exist before it can be collected */
const PICKUP_IMMUNITY_TICKS = TICK_RATE; // 1 second

export class LootSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private playerEquipment = new Map<string, PlayerEquipment>();
  private nextPickupId = 1;
  private currentTick = 0;

  // Track spawn tick per pickup ID so we can enforce immunity
  private pickupSpawnTick = new Map<number, number>();

  constructor(room: Room<GameStateSchema>, state: GameStateSchema) {
    this.room = room;
    this.state = state;
  }

  /** Populate lockers from a random subset of LOCKER_SLOTS */
  initLockers() {
    const activeSlots = pickActiveLockers(LOCKER_SLOTS, ACTIVE_LOCKERS_MIN, ACTIVE_LOCKERS_MAX);
    for (let i = 0; i < activeSlots.length; i++) {
      const slot = activeSlots[i];
      const locker = new LockerSchema();
      locker.id = i;
      locker.x = slot.x;
      locker.y = slot.y;
      locker.opened = false;
      locker.containedWeaponId = LOOTABLE_WEAPON_IDS[
        Math.floor(Math.random() * LOOTABLE_WEAPON_IDS.length)
      ];
      this.state.lockers.push(locker);
    }
  }

  /** Set up default equipment for a new player */
  registerPlayer(sessionId: string) {
    const equip: PlayerEquipment = {
      meleeWeaponId: WeaponId.Fists,
      rangedWeaponId: "",
    };
    this.playerEquipment.set(sessionId, equip);

    // Sync to schema
    const player = this.state.players.get(sessionId);
    if (player) {
      player.meleeWeaponId = equip.meleeWeaponId;
      player.rangedWeaponId = equip.rangedWeaponId;
    }
  }

  /** Drop weapons on disconnect */
  unregisterPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const equip = this.playerEquipment.get(sessionId);
    if (player && equip) {
      this.dropPlayerWeapons(sessionId, player.x, player.y);
    }
    this.playerEquipment.delete(sessionId);
  }

  /** Check if player is near a closed locker and open it */
  processInteract(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.state === "dead") return;

    for (let i = 0; i < this.state.lockers.length; i++) {
      const locker = this.state.lockers.at(i);
      if (!locker || locker.opened) continue;

      const dx = player.x - locker.x;
      const dy = player.y - locker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= LOCKER_INTERACT_RANGE) {
        // Open the locker
        locker.opened = true;

        // Spawn pickup at locker position (offset slightly)
        this.spawnPickup(locker.x, locker.y + 20, locker.containedWeaponId);

        this.room.broadcast("locker_opened", {
          lockerId: locker.id,
          x: locker.x,
          y: locker.y,
          weaponId: locker.containedWeaponId,
        });
        return; // Only open one locker per interact
      }
    }
  }

  /** Update current tick (called each server tick) */
  tickPickups(tick: number) {
    this.currentTick = tick;
  }

  /** Player clicked a pickup — validate distance and equip */
  processPickupClick(sessionId: string, pickupId: number) {
    const player = this.state.players.get(sessionId);
    if (!player || player.state === "dead") return;

    // Find the pickup by id
    let pickupIdx = -1;
    let pickup: PickupSchema | null = null;
    for (let i = 0; i < this.state.pickups.length; i++) {
      const p = this.state.pickups.at(i);
      if (p && p.id === pickupId) {
        pickupIdx = i;
        pickup = p;
        break;
      }
    }
    if (!pickup || pickupIdx < 0) return;

    // Check immunity
    const spawnTick = this.pickupSpawnTick.get(pickup.id) ?? 0;
    if (this.currentTick - spawnTick < PICKUP_IMMUNITY_TICKS) return;

    // Check distance
    const dx = player.x - pickup.x;
    const dy = player.y - pickup.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > PICKUP_INTERACT_RANGE) return;

    const weaponConfig = getWeaponConfig(pickup.weaponId);
    if (!weaponConfig) return;

    this.equipWeapon(sessionId, weaponConfig);
    this.pickupSpawnTick.delete(pickup.id);

    // Remove from array
    const arr = this.state.pickups as any;
    arr.splice(pickupIdx, 1);
  }

  /** Equip a weapon, dropping old weapon from that slot */
  private equipWeapon(sessionId: string, weapon: WeaponConfig) {
    const player = this.state.players.get(sessionId);
    const equip = this.playerEquipment.get(sessionId);
    if (!player || !equip) return;

    const slot = weapon.slot;
    let droppedId = "";

    if (slot === "melee") {
      const oldId = equip.meleeWeaponId;
      // Don't drop Fists as a pickup
      if (oldId && oldId !== WeaponId.Fists) {
        droppedId = oldId;
      }
      equip.meleeWeaponId = weapon.id;
      player.meleeWeaponId = weapon.id;
    } else {
      const oldId = equip.rangedWeaponId;
      if (oldId) {
        droppedId = oldId;
      }
      equip.rangedWeaponId = weapon.id;
      player.rangedWeaponId = weapon.id;
    }

    // Drop old weapon offset from player so it's not immediately overlapping
    if (droppedId) {
      // Drop behind the player (opposite of aim direction)
      const dropDist = PLAYER_RADIUS + PICKUP_RADIUS + 8;
      const dropX = player.x - Math.cos(player.angle) * dropDist;
      const dropY = player.y - Math.sin(player.angle) * dropDist;
      this.spawnPickup(dropX, dropY, droppedId);
    }

    this.room.broadcast("weapon_pickup", {
      sessionId,
      weaponId: weapon.id,
      slot,
      weaponName: weapon.name,
    });
  }

  /** Called when a player dies — drop their weapons, reset to Fists */
  onPlayerRespawn(sessionId: string, deathX: number, deathY: number) {
    this.dropPlayerWeapons(sessionId, deathX, deathY);

    // Reset to defaults
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (equip) {
      equip.meleeWeaponId = WeaponId.Fists;
      equip.rangedWeaponId = "";
    }
    if (player) {
      player.meleeWeaponId = WeaponId.Fists;
      player.rangedWeaponId = "";
    }
  }

  /** Drop all non-fist weapons as pickups at given location */
  private dropPlayerWeapons(sessionId: string, x: number, y: number) {
    const equip = this.playerEquipment.get(sessionId);
    if (!equip) return;

    // Drop melee if not Fists
    if (equip.meleeWeaponId && equip.meleeWeaponId !== WeaponId.Fists) {
      this.spawnPickup(x - 16, y, equip.meleeWeaponId);
    }

    // Drop ranged if equipped
    if (equip.rangedWeaponId) {
      this.spawnPickup(x + 16, y, equip.rangedWeaponId);
    }
  }

  /** Create a pickup on the ground */
  private spawnPickup(x: number, y: number, weaponId: string) {
    const pickup = new PickupSchema();
    pickup.id = this.nextPickupId++;
    if (this.nextPickupId > 65535) this.nextPickupId = 1;
    pickup.x = x;
    pickup.y = y;
    pickup.weaponId = weaponId;
    this.state.pickups.push(pickup);
    this.pickupSpawnTick.set(pickup.id, this.currentTick);
  }

  /** Get the melee WeaponConfig for a player (always has one) */
  getPlayerMeleeConfig(sessionId: string): WeaponConfig {
    const equip = this.playerEquipment.get(sessionId);
    if (!equip) return WEAPON_FISTS;
    return getWeaponConfig(equip.meleeWeaponId) ?? WEAPON_FISTS;
  }

  /** Get the ranged WeaponConfig for a player, or null if none equipped */
  getPlayerRangedConfig(sessionId: string): WeaponConfig | null {
    const equip = this.playerEquipment.get(sessionId);
    if (!equip || !equip.rangedWeaponId) return null;
    return getWeaponConfig(equip.rangedWeaponId) ?? null;
  }

  /** Reset a single player's equipment to Fists (no drops) */
  resetPlayerEquipment(sessionId: string) {
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (equip) {
      equip.meleeWeaponId = WeaponId.Fists;
      equip.rangedWeaponId = "";
    }
    if (player) {
      player.meleeWeaponId = WeaponId.Fists;
      player.rangedWeaponId = "";
    }
  }

  /** Reset all loot for a new match: clear pickups, re-pick random locker subset */
  resetForNewMatch() {
    // Clear all pickups
    while (this.state.pickups.length > 0) {
      this.state.pickups.pop();
    }
    this.pickupSpawnTick.clear();
    this.nextPickupId = 1;

    // Clear old lockers and re-pick a new random subset
    while (this.state.lockers.length > 0) {
      this.state.lockers.pop();
    }
    this.initLockers();
  }
}
