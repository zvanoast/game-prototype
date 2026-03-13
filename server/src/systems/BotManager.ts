import { GameStateSchema, PlayerSchema } from "../state/GameState";
import { CombatSystem } from "./CombatSystem";
import { LootSystem } from "./LootSystem";
import { BuffSystem } from "./BuffSystem";
import { MatchSystem } from "./MatchSystem";
import {
  MAX_HEALTH,
  CHARACTER_COUNT,
  BOT_SESSION_PREFIX,
} from "shared";

export class BotManager {
  private state: GameStateSchema;
  private takenCharacters: Set<number>;
  private findSafeSpawn: () => { x: number; y: number };
  private botIds: string[] = [];

  constructor(
    state: GameStateSchema,
    takenCharacters: Set<number>,
    findSafeSpawn: () => { x: number; y: number }
  ) {
    this.state = state;
    this.takenCharacters = takenCharacters;
    this.findSafeSpawn = findSafeSpawn;
  }

  spawnBots(
    count: number,
    combatSystem: CombatSystem,
    lootSystem: LootSystem,
    buffSystem: BuffSystem,
    matchSystem: MatchSystem
  ) {
    for (let i = 0; i < count; i++) {
      const botId = `${BOT_SESSION_PREFIX}${i}`;
      const player = new PlayerSchema();

      player.displayName = `Bot ${i + 1}`;

      // Assign character from end of range to avoid conflicts with humans
      let charIdx = (CHARACTER_COUNT - 1 - i) % CHARACTER_COUNT;
      if (charIdx < 0) charIdx += CHARACTER_COUNT;
      // If taken, find first free
      if (this.takenCharacters.has(charIdx)) {
        for (let c = 0; c < CHARACTER_COUNT; c++) {
          if (!this.takenCharacters.has(c)) {
            charIdx = c;
            break;
          }
        }
      }
      player.characterIndex = charIdx;
      this.takenCharacters.add(charIdx);

      const pos = this.findSafeSpawn();
      player.x = pos.x;
      player.y = pos.y;
      player.health = MAX_HEALTH;
      player.state = "idle";

      this.state.players.set(botId, player);
      combatSystem.registerPlayer(botId);
      lootSystem.registerPlayer(botId);
      buffSystem.registerPlayer(botId);
      matchSystem.onPlayerJoin(botId);

      this.botIds.push(botId);
    }

    console.log(`Spawned ${count} sandbox bots`);
  }

  getBotIds(): string[] {
    return this.botIds;
  }

  static isBot(sessionId: string): boolean {
    return sessionId.startsWith(BOT_SESSION_PREFIX);
  }
}
