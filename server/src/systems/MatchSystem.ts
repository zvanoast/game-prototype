import { Room } from "colyseus";
import { GameStateSchema, PlayerSchema } from "../state/GameState";
import { LootSystem } from "./LootSystem";
import { CombatSystem } from "./CombatSystem";
import {
  MIN_PLAYERS_TO_START,
  COUNTDOWN_DURATION_MS,
  POST_MATCH_DELAY_MS,
  MAX_HEALTH,
} from "shared";
import type { MatchPhase } from "shared";

export class MatchSystem {
  private room: Room<GameStateSchema>;
  private state: GameStateSchema;
  private lootSystem: LootSystem;
  private combatSystem!: CombatSystem;

  private phase: MatchPhase = "waiting";
  private countdownTimer = 0;
  private postMatchTimer = 0;
  private findSafeSpawn: () => { x: number; y: number };

  constructor(
    room: Room<GameStateSchema>,
    state: GameStateSchema,
    lootSystem: LootSystem,
    findSafeSpawn: () => { x: number; y: number }
  ) {
    this.room = room;
    this.state = state;
    this.lootSystem = lootSystem;
    this.findSafeSpawn = findSafeSpawn;
  }

  /** Must be called after CombatSystem is created */
  setCombatSystem(combatSystem: CombatSystem) {
    this.combatSystem = combatSystem;
  }

  getPhase(): MatchPhase {
    return this.phase;
  }

  canAttack(): boolean {
    return this.phase === "waiting" || this.phase === "playing";
  }

  /** Called each server tick */
  tick(dtMs: number) {
    switch (this.phase) {
      case "waiting":
        this.tickWaiting();
        break;
      case "countdown":
        this.tickCountdown(dtMs);
        break;
      case "playing":
        this.tickPlaying();
        break;
      case "ended":
        this.tickEnded(dtMs);
        break;
    }
  }

  onPlayerJoin(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    if (this.phase === "waiting" || this.phase === "countdown") {
      player.eliminated = false;
      this.updateAliveCount();
    } else if (this.phase === "playing" || this.phase === "ended") {
      // Late joiners are immediately eliminated (spectators)
      player.eliminated = true;
      player.state = "dead";
      player.health = 0;
      this.updateAliveCount();
    }
  }

  onPlayerLeave(sessionId: string) {
    this.updateAliveCount();
    if (this.phase === "playing") {
      this.checkWinCondition();
    }
    if (this.phase === "countdown") {
      // If players drop below minimum during countdown, revert
      if (this.getAlivePlayerCount() < MIN_PLAYERS_TO_START) {
        this.setPhase("waiting");
        this.countdownTimer = 0;
        this.state.countdownSeconds = 0;
        this.room.broadcast("match_countdown", { seconds: 0 });
      }
    }
  }

  onPlayerKilled(victimId: string, killerId: string, weaponName: string) {
    const victim = this.state.players.get(victimId);
    if (!victim) return;

    victim.eliminated = true;

    this.room.broadcast("player_eliminated", {
      sessionId: victimId,
      killerId,
      weaponName,
    });

    this.updateAliveCount();
    this.checkWinCondition();
  }

  // --- Phase ticking ---

  private tickWaiting() {
    const aliveCount = this.getAlivePlayerCount();
    if (aliveCount >= MIN_PLAYERS_TO_START) {
      this.setPhase("countdown");
      this.countdownTimer = COUNTDOWN_DURATION_MS;
      this.state.countdownSeconds = Math.ceil(COUNTDOWN_DURATION_MS / 1000);
      this.room.broadcast("match_countdown", { seconds: this.state.countdownSeconds });
    }
  }

  private tickCountdown(dtMs: number) {
    this.countdownTimer -= dtMs;

    const newSeconds = Math.max(0, Math.ceil(this.countdownTimer / 1000));
    if (newSeconds !== this.state.countdownSeconds) {
      this.state.countdownSeconds = newSeconds;
      this.room.broadcast("match_countdown", { seconds: newSeconds });
    }

    if (this.countdownTimer <= 0) {
      this.startMatch();
    }
  }

  private tickPlaying() {
    // Win condition is checked reactively in onPlayerKilled/onPlayerLeave
  }

  private tickEnded(dtMs: number) {
    this.postMatchTimer -= dtMs;
    if (this.postMatchTimer <= 0) {
      this.resetMatch();
    }
  }

  // --- Phase transitions ---

  private startMatch() {
    this.setPhase("playing");
    this.state.countdownSeconds = 0;
    this.state.winnerId = "";

    // Mark all current players as alive (not eliminated)
    this.state.players.forEach((player: PlayerSchema) => {
      player.eliminated = false;
      player.state = "idle";
      player.health = MAX_HEALTH;
    });

    this.updateAliveCount();
    this.room.broadcast("match_start", {});
  }

  private checkWinCondition() {
    if (this.phase !== "playing") return;

    const aliveCount = this.getAlivePlayerCount();
    if (aliveCount > 1) return;

    // Game over
    let winnerId = "";
    let winnerName = "";

    if (aliveCount === 1) {
      // Find the last alive player
      this.state.players.forEach((player: PlayerSchema, sessionId: string) => {
        if (!player.eliminated && player.state !== "dead") {
          winnerId = sessionId;
          winnerName = player.displayName || sessionId.substring(0, 6);
        }
      });
    }

    this.setPhase("ended");
    this.state.winnerId = winnerId;
    this.postMatchTimer = POST_MATCH_DELAY_MS;

    this.room.broadcast("match_end", {
      winnerId: winnerId || null,
      winnerName: winnerName || null,
    });
  }

  private resetMatch() {
    // Reset all players
    this.state.players.forEach((player: PlayerSchema, sessionId: string) => {
      const spawn = this.findSafeSpawn();
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.health = MAX_HEALTH;
      player.state = "idle";
      player.eliminated = false;
      player.kills = 0;

      // Reset equipment
      this.lootSystem.resetPlayerEquipment(sessionId);

      // Broadcast respawn
      this.room.broadcast("respawn", {
        sessionId,
        x: spawn.x,
        y: spawn.y,
      });
    });

    // Reset loot (re-close lockers, clear pickups)
    this.lootSystem.resetForNewMatch();

    // Reset combat (clear projectiles)
    if (this.combatSystem) {
      this.combatSystem.resetForNewMatch();
    }

    // Reset state
    this.state.winnerId = "";
    this.state.countdownSeconds = 0;
    this.updateAliveCount();
    this.setPhase("waiting");
  }

  // --- Helpers ---

  private setPhase(phase: MatchPhase) {
    this.phase = phase;
    this.state.phase = phase;
  }

  private getAlivePlayerCount(): number {
    let count = 0;
    this.state.players.forEach((player: PlayerSchema) => {
      if (!player.eliminated && player.state !== "dead") {
        count++;
      }
    });
    return count;
  }

  private updateAliveCount() {
    this.state.alivePlayers = this.getAlivePlayerCount();
  }
}
