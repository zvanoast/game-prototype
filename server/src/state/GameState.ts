import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") angle: number = 0;
  @type("int16") health: number = 100;
  @type("string") state: string = "idle";
  @type("uint32") lastProcessedInput: number = 0;
}

export class GameStateSchema extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type("string") phase: string = "waiting"; // waiting | playing | ended
  @type("uint32") tick: number = 0;
}
