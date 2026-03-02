import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class ProjectileSchema extends Schema {
  @type("uint16") id: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") angle: number = 0;
  @type("float32") speed: number = 0;
  @type("string") ownerId: string = "";
  @type("boolean") charged: boolean = false;
  @type("string") weaponId: string = "";
}

export class PlayerSchema extends Schema {
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
  @type("float32") angle: number = 0;
  @type("int16") health: number = 100;
  @type("string") state: string = "idle";
  @type("uint8") kills: number = 0;
  @type("uint32") lastProcessedInput: number = 0;
  @type("string") meleeWeaponId: string = "fists";
  @type("string") rangedWeaponId: string = "";
  @type("boolean") eliminated: boolean = false;
  @type("string") displayName: string = "";
  @type("string") consumableSlot1: string = "";
  @type("string") consumableSlot2: string = "";
  @type("int16") shieldHp: number = 0;
  @type("float32") speedMultiplier: number = 1.0;
  @type("float32") damageMultiplier: number = 1.0;
}

export class LockerSchema extends Schema {
  @type("uint8") id: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("boolean") opened: boolean = false;
  @type("string") containedWeaponId: string = "";
  @type("string") containedConsumableId: string = "";
}

export class PickupSchema extends Schema {
  @type("uint16") id: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("string") weaponId: string = "";
  @type("string") consumableId: string = "";
}

export class GameStateSchema extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ ProjectileSchema ]) projectiles = new ArraySchema<ProjectileSchema>();
  @type([ LockerSchema ]) lockers = new ArraySchema<LockerSchema>();
  @type([ PickupSchema ]) pickups = new ArraySchema<PickupSchema>();
  @type("string") phase: string = "waiting"; // waiting | countdown | playing | ended
  @type("uint32") tick: number = 0;
  @type("uint8") alivePlayers: number = 0;
  @type("uint8") countdownSeconds: number = 0;
  @type("string") winnerId: string = "";
}
