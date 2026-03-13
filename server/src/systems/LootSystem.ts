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
  CONSUMABLE_SPAWN_CHANCE,
} from "shared";
import { WeaponId, ConsumableId } from "shared";
import type { WeaponConfig } from "shared";
import {
  LOCKER_SLOTS,
  pickActiveLockers,
  LOOTABLE_WEAPON_IDS,
  getWeaponConfig,
  WEAPON_FISTS,
  LOOTABLE_CONSUMABLE_IDS,
  getConsumableConfig,
} from "shared";

interface PlayerEquipment {
  meleeWeaponId: string;
  rangedWeaponId: string;
  rangedAmmo: number;
  consumableSlot1: string;
  consumableSlot2: string;
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

      // 30% chance to contain a consumable instead of a weapon
      if (Math.random() < CONSUMABLE_SPAWN_CHANCE) {
        locker.containedWeaponId = "";
        locker.containedConsumableId = LOOTABLE_CONSUMABLE_IDS[
          Math.floor(Math.random() * LOOTABLE_CONSUMABLE_IDS.length)
        ];
      } else {
        locker.containedWeaponId = LOOTABLE_WEAPON_IDS[
          Math.floor(Math.random() * LOOTABLE_WEAPON_IDS.length)
        ];
        locker.containedConsumableId = "";
      }

      this.state.lockers.push(locker);
    }
  }

  /** Set up default equipment for a new player */
  registerPlayer(sessionId: string) {
    const equip: PlayerEquipment = {
      meleeWeaponId: WeaponId.Fists,
      rangedWeaponId: "",
      rangedAmmo: 0,
      consumableSlot1: "",
      consumableSlot2: "",
    };
    this.playerEquipment.set(sessionId, equip);

    // Sync to schema
    const player = this.state.players.get(sessionId);
    if (player) {
      player.meleeWeaponId = equip.meleeWeaponId;
      player.rangedWeaponId = equip.rangedWeaponId;
      player.rangedAmmo = 0;
      player.consumableSlot1 = "";
      player.consumableSlot2 = "";
    }
  }

  /** Drop weapons on disconnect */
  unregisterPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const equip = this.playerEquipment.get(sessionId);
    if (player && equip) {
      this.dropPlayerItems(sessionId, player.x, player.y);
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
        if (locker.containedConsumableId) {
          this.spawnPickup(locker.x, locker.y + 20, "", locker.containedConsumableId);
        } else {
          this.spawnPickup(locker.x, locker.y + 20, locker.containedWeaponId, "");
        }

        this.room.broadcast("locker_opened", {
          lockerId: locker.id,
          x: locker.x,
          y: locker.y,
          weaponId: locker.containedWeaponId,
          consumableId: locker.containedConsumableId,
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

    // Handle consumable pickup
    if (pickup.consumableId) {
      const config = getConsumableConfig(pickup.consumableId);
      if (!config) return;

      this.equipConsumable(sessionId, pickup.consumableId);
      this.pickupSpawnTick.delete(pickup.id);

      // Remove from array
      const arr = this.state.pickups as any;
      arr.splice(pickupIdx, 1);
      return;
    }

    // Handle weapon pickup
    const weaponConfig = getWeaponConfig(pickup.weaponId);
    if (!weaponConfig) return;

    this.equipWeapon(sessionId, weaponConfig);
    this.pickupSpawnTick.delete(pickup.id);

    // Remove from array
    const arr = this.state.pickups as any;
    arr.splice(pickupIdx, 1);
  }

  /** Equip a consumable: fill slot1 → slot2 → drop slot1 to make room */
  private equipConsumable(sessionId: string, consumableId: string) {
    const player = this.state.players.get(sessionId);
    const equip = this.playerEquipment.get(sessionId);
    if (!player || !equip) return;

    let droppedConsumableId = "";

    if (!equip.consumableSlot1) {
      equip.consumableSlot1 = consumableId;
    } else if (!equip.consumableSlot2) {
      equip.consumableSlot2 = consumableId;
    } else {
      // Both slots full — drop slot1, shift slot2 → slot1, put new in slot2
      droppedConsumableId = equip.consumableSlot1;
      equip.consumableSlot1 = equip.consumableSlot2;
      equip.consumableSlot2 = consumableId;
    }

    // Sync to schema
    player.consumableSlot1 = equip.consumableSlot1;
    player.consumableSlot2 = equip.consumableSlot2;

    // Drop old consumable
    if (droppedConsumableId) {
      const dropDist = PLAYER_RADIUS + PICKUP_RADIUS + 8;
      const dropX = player.x - Math.cos(player.angle) * dropDist;
      const dropY = player.y - Math.sin(player.angle) * dropDist;
      this.spawnPickup(dropX, dropY, "", droppedConsumableId);
    }

    const config = getConsumableConfig(consumableId);
    this.room.broadcast("consumable_pickup", {
      sessionId,
      consumableId,
      consumableName: config?.name ?? consumableId,
    });
  }

  /** Use consumable from first non-empty slot. Returns the consumableId or "" */
  useConsumable(sessionId: string): string {
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!equip || !player) return "";

    let used = "";
    if (equip.consumableSlot1) {
      used = equip.consumableSlot1;
      equip.consumableSlot1 = equip.consumableSlot2;
      equip.consumableSlot2 = "";
    } else if (equip.consumableSlot2) {
      used = equip.consumableSlot2;
      equip.consumableSlot2 = "";
    }

    if (used) {
      player.consumableSlot1 = equip.consumableSlot1;
      player.consumableSlot2 = equip.consumableSlot2;
    }

    return used;
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
      equip.rangedAmmo = weapon.maxAmmo ?? 0;
      player.rangedWeaponId = weapon.id;
      player.rangedAmmo = equip.rangedAmmo;
    }

    // Drop old weapon offset from player so it's not immediately overlapping
    if (droppedId) {
      // Drop behind the player (opposite of aim direction)
      const dropDist = PLAYER_RADIUS + PICKUP_RADIUS + 8;
      const dropX = player.x - Math.cos(player.angle) * dropDist;
      const dropY = player.y - Math.sin(player.angle) * dropDist;
      this.spawnPickup(dropX, dropY, droppedId, "");
    }

    this.room.broadcast("weapon_pickup", {
      sessionId,
      weaponId: weapon.id,
      slot,
      weaponName: weapon.name,
    });
  }

  /** Called when a player dies — drop their items, reset to Fists */
  onPlayerRespawn(sessionId: string, deathX: number, deathY: number) {
    this.dropPlayerItems(sessionId, deathX, deathY);

    // Reset to defaults
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (equip) {
      equip.meleeWeaponId = WeaponId.Fists;
      equip.rangedWeaponId = "";
      equip.rangedAmmo = 0;
      equip.consumableSlot1 = "";
      equip.consumableSlot2 = "";
    }
    if (player) {
      player.meleeWeaponId = WeaponId.Fists;
      player.rangedWeaponId = "";
      player.rangedAmmo = 0;
      player.consumableSlot1 = "";
      player.consumableSlot2 = "";
    }
  }

  /** Drop all non-fist weapons and consumables as pickups at given location */
  private dropPlayerItems(sessionId: string, x: number, y: number) {
    const equip = this.playerEquipment.get(sessionId);
    if (!equip) return;

    let offsetIdx = 0;
    const offsets = [-16, 16, -24, 24];

    // Drop melee if not Fists
    if (equip.meleeWeaponId && equip.meleeWeaponId !== WeaponId.Fists) {
      this.spawnPickup(x + offsets[offsetIdx++], y, equip.meleeWeaponId, "");
    }

    // Drop ranged if equipped
    if (equip.rangedWeaponId) {
      this.spawnPickup(x + offsets[offsetIdx++], y, equip.rangedWeaponId, "");
    }

    // Drop consumables
    if (equip.consumableSlot1) {
      this.spawnPickup(x + offsets[offsetIdx++], y - 16, "", equip.consumableSlot1);
    }
    if (equip.consumableSlot2) {
      this.spawnPickup(x + offsets[offsetIdx++], y - 16, "", equip.consumableSlot2);
    }
  }

  /** Create a pickup on the ground */
  private spawnPickup(x: number, y: number, weaponId: string, consumableId: string) {
    const pickup = new PickupSchema();
    pickup.id = this.nextPickupId++;
    if (this.nextPickupId > 65535) this.nextPickupId = 1;
    pickup.x = x;
    pickup.y = y;
    pickup.weaponId = weaponId;
    pickup.consumableId = consumableId;
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
    // No ammo left → treat as unarmed
    if (equip.rangedAmmo <= 0) return null;
    return getWeaponConfig(equip.rangedWeaponId) ?? null;
  }

  /** Get remaining ammo for ranged weapon */
  getPlayerRangedAmmo(sessionId: string): number {
    return this.playerEquipment.get(sessionId)?.rangedAmmo ?? 0;
  }

  /** Consume one round of ranged ammo. Returns false if empty. Removes weapon when depleted. */
  consumeRangedAmmo(sessionId: string): boolean {
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!equip || equip.rangedAmmo <= 0) return false;

    equip.rangedAmmo--;
    if (player) player.rangedAmmo = equip.rangedAmmo;

    // Weapon depleted — unequip (don't drop a pickup)
    if (equip.rangedAmmo <= 0) {
      equip.rangedWeaponId = "";
      if (player) player.rangedWeaponId = "";
      this.room.broadcast("weapon_depleted", { sessionId });
    }

    return true;
  }

  /** Reset a single player's equipment to Fists (no drops) */
  resetPlayerEquipment(sessionId: string) {
    const equip = this.playerEquipment.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (equip) {
      equip.meleeWeaponId = WeaponId.Fists;
      equip.rangedWeaponId = "";
      equip.rangedAmmo = 0;
      equip.consumableSlot1 = "";
      equip.consumableSlot2 = "";
    }
    if (player) {
      player.meleeWeaponId = WeaponId.Fists;
      player.rangedWeaponId = "";
      player.rangedAmmo = 0;
      player.consumableSlot1 = "";
      player.consumableSlot2 = "";
    }
  }

  /** Spawn one pickup per lootable weapon and consumable in grouped rows near map center */
  spawnAllItems() {
    const centerX = 1024;
    const rowSpacing = 50;   // vertical spacing between items in a column
    const colSpacing = 200;  // horizontal spacing between columns

    const meleeIds = LOOTABLE_WEAPON_IDS.filter(id => getWeaponConfig(id)?.slot === "melee");
    const rangedIds = LOOTABLE_WEAPON_IDS.filter(id => getWeaponConfig(id)?.slot === "ranged");

    // Layout: 3 columns — Melee (left), Ranged (center), Consumables (right)
    // Each column starts at a Y that vertically centers its group around centerY
    const groupCenterY = 1024;

    // Melee column (left)
    const meleeX = centerX - colSpacing;
    const meleeStartY = groupCenterY - ((meleeIds.length - 1) * rowSpacing) / 2;
    for (let i = 0; i < meleeIds.length; i++) {
      this.spawnPickup(meleeX, meleeStartY + i * rowSpacing, meleeIds[i], "");
    }

    // Ranged column (center)
    const rangedX = centerX;
    const rangedStartY = groupCenterY - ((rangedIds.length - 1) * rowSpacing) / 2;
    for (let i = 0; i < rangedIds.length; i++) {
      this.spawnPickup(rangedX, rangedStartY + i * rowSpacing, rangedIds[i], "");
    }

    // Consumables column (right)
    const cCount = LOOTABLE_CONSUMABLE_IDS.length;
    const consumableX = centerX + colSpacing;
    const consumableStartY = groupCenterY - ((cCount - 1) * rowSpacing) / 2;
    for (let i = 0; i < cCount; i++) {
      this.spawnPickup(consumableX, consumableStartY + i * rowSpacing, "", LOOTABLE_CONSUMABLE_IDS[i]);
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
