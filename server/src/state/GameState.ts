import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class ProjectileSchema extends Schema {
  @type("uint16") id: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") angle: number = 0;
  @type("float32") speed: number = 0;
  @type("string") ownerId: string = "";
  @type("boolean") charged: boolean = false;
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
}

export class GameStateSchema extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ ProjectileSchema ]) projectiles = new ArraySchema<ProjectileSchema>();
  @type("string") phase: string = "waiting"; // waiting | playing | ended
  @type("uint32") tick: number = 0;
}
