import { GameStateSchema, PlayerSchema } from "../state/GameState";
import { CombatSystem } from "./CombatSystem";
import { LootSystem } from "./LootSystem";
import { BuffSystem } from "./BuffSystem";
import { MatchSystem } from "./MatchSystem";
import { BotBrain } from "./bot/BotBrain";
import { ALL_PERSONAS, PERSONA_MAP } from "./bot/BotPersona";
import type { BotPersona } from "./bot/BotPersona";
import { initNavGrid } from "./bot/BotNavigation";
import {
  MAX_HEALTH,
  CHARACTER_COUNT,
  BOT_SESSION_PREFIX,
} from "shared";
import type { WallRect, InputPayload } from "shared";

interface QueuedInput {
  sessionId: string;
  input: InputPayload;
}

export class BotManager {
  private state: GameStateSchema;
  private takenCharacters: Set<number>;
  private findSafeSpawn: () => { x: number; y: number };
  private botIds: string[] = [];
  private brains = new Map<string, BotBrain>();

  constructor(
    state: GameStateSchema,
    takenCharacters: Set<number>,
    findSafeSpawn: () => { x: number; y: number },
    wallRects: WallRect[],
  ) {
    this.state = state;
    this.takenCharacters = takenCharacters;
    this.findSafeSpawn = findSafeSpawn;

    // Build shared nav grid once
    initNavGrid(wallRects);
  }

  /**
   * Spawn bots with specified personas.
   * @param personaIds — list of persona IDs to spawn (e.g. ["rusher", "sniper"]).
   *   If empty/undefined, falls back to spawning `fallbackCount` bots round-robin.
   */
  spawnBots(
    combatSystem: CombatSystem,
    lootSystem: LootSystem,
    buffSystem: BuffSystem,
    matchSystem: MatchSystem,
    personaIds?: string[],
    fallbackCount?: number,
  ) {
    // Build the list of personas to spawn
    let personas: BotPersona[];
    if (personaIds && personaIds.length > 0) {
      personas = [];
      for (const id of personaIds) {
        const p = PERSONA_MAP[id];
        if (p) personas.push(p);
      }
      if (personas.length === 0) {
        // All IDs invalid — fall back to defaults
        personas = ALL_PERSONAS.slice(0, fallbackCount ?? ALL_PERSONAS.length);
      }
    } else {
      const count = fallbackCount ?? ALL_PERSONAS.length;
      personas = [];
      for (let i = 0; i < count; i++) {
        personas.push(ALL_PERSONAS[i % ALL_PERSONAS.length]);
      }
    }

    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i];
      const botId = `${BOT_SESSION_PREFIX}${i}`;
      const player = new PlayerSchema();

      player.displayName = persona.name;

      // Use persona's preferred character, fall back if taken
      let charIdx = persona.characterIndex;
      if (this.takenCharacters.has(charIdx)) {
        // Find first free character
        charIdx = 0;
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

      // Create AI brain
      const brain = new BotBrain(botId, persona, this.state);
      this.brains.set(botId, brain);

      this.botIds.push(botId);
    }

    console.log(`Spawned ${personas.length} bots: ${personas.map(p => p.name).join(", ")}`);
  }

  /**
   * Tick all bot brains and push their inputs into the game's input queue.
   */
  tickBots(tick: number, inputQueue: QueuedInput[], phase: string): void {
    if (phase === "waiting" || phase === "countdown" || phase === "ended") return;

    for (const [botId, brain] of this.brains) {
      const input = brain.tick(tick);
      if (input) {
        inputQueue.push({ sessionId: botId, input });
      }
    }
  }

  getBotIds(): string[] {
    return this.botIds;
  }

  static isBot(sessionId: string): boolean {
    return sessionId.startsWith(BOT_SESSION_PREFIX);
  }
}
