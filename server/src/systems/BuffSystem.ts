import { PlayerSchema } from "../state/GameState";
import { getConsumableConfig, MAX_HEALTH } from "shared";
import type { ConsumableConfig } from "shared";

interface ActiveBuff {
  type: "speed" | "damage" | "shield";
  remainingMs: number;
  speedMultiplier?: number;
  damageMultiplier?: number;
  shieldHp?: number;
}

interface PlayerBuffState {
  buffs: ActiveBuff[];
}

export class BuffSystem {
  private playerBuffs = new Map<string, PlayerBuffState>();

  registerPlayer(sessionId: string) {
    this.playerBuffs.set(sessionId, { buffs: [] });
  }

  unregisterPlayer(sessionId: string) {
    this.playerBuffs.delete(sessionId);
  }

  /** Apply a consumable's effect to a player */
  useConsumable(sessionId: string, consumableId: string, player: PlayerSchema) {
    const config = getConsumableConfig(consumableId);
    if (!config) return;

    const state = this.playerBuffs.get(sessionId);
    if (!state) return;

    // Instant heal
    if (config.healAmount) {
      player.health = Math.min(MAX_HEALTH, player.health + config.healAmount);
    }

    // Speed buff
    if (config.speedMultiplier && config.durationMs) {
      // Remove existing speed buff
      state.buffs = state.buffs.filter(b => b.type !== "speed");
      state.buffs.push({
        type: "speed",
        remainingMs: config.durationMs,
        speedMultiplier: config.speedMultiplier,
      });
    }

    // Damage buff
    if (config.damageMultiplier && config.durationMs) {
      // Remove existing damage buff
      state.buffs = state.buffs.filter(b => b.type !== "damage");
      state.buffs.push({
        type: "damage",
        remainingMs: config.durationMs,
        damageMultiplier: config.damageMultiplier,
      });
    }

    // Shield
    if (config.shieldHp && config.durationMs) {
      // Remove existing shield buff
      state.buffs = state.buffs.filter(b => b.type !== "shield");
      state.buffs.push({
        type: "shield",
        remainingMs: config.durationMs,
        shieldHp: config.shieldHp,
      });
      player.shieldHp = config.shieldHp;
    }

    // Sync multipliers
    this.syncMultipliers(sessionId, player);
  }

  /** Tick all buffs, expire finished ones */
  tick(dtMs: number, getPlayer: (sessionId: string) => PlayerSchema | undefined): string[] {
    const expired: string[] = []; // sessionId:buffType pairs for broadcast

    this.playerBuffs.forEach((state, sessionId) => {
      const player = getPlayer(sessionId);
      if (!player) return;

      let changed = false;
      for (let i = state.buffs.length - 1; i >= 0; i--) {
        const buff = state.buffs[i];
        buff.remainingMs -= dtMs;

        if (buff.remainingMs <= 0) {
          if (buff.type === "shield") {
            player.shieldHp = 0;
          }
          expired.push(`${sessionId}:${buff.type}`);
          state.buffs.splice(i, 1);
          changed = true;
        }
      }

      if (changed) {
        this.syncMultipliers(sessionId, player);
      }
    });

    return expired;
  }

  getSpeedMultiplier(sessionId: string): number {
    const state = this.playerBuffs.get(sessionId);
    if (!state) return 1.0;
    const speedBuff = state.buffs.find(b => b.type === "speed");
    return speedBuff?.speedMultiplier ?? 1.0;
  }

  getDamageMultiplier(sessionId: string): number {
    const state = this.playerBuffs.get(sessionId);
    if (!state) return 1.0;
    const damageBuff = state.buffs.find(b => b.type === "damage");
    return damageBuff?.damageMultiplier ?? 1.0;
  }

  /** Absorb damage via shield first. Returns remaining damage after shield absorption. */
  applyShieldDamage(sessionId: string, damage: number, player: PlayerSchema): { remaining: number; absorbed: number } {
    const state = this.playerBuffs.get(sessionId);
    if (!state) return { remaining: damage, absorbed: 0 };

    const shieldBuff = state.buffs.find(b => b.type === "shield");
    if (!shieldBuff || !shieldBuff.shieldHp || shieldBuff.shieldHp <= 0) {
      return { remaining: damage, absorbed: 0 };
    }

    const absorbed = Math.min(shieldBuff.shieldHp, damage);
    shieldBuff.shieldHp -= absorbed;
    player.shieldHp = shieldBuff.shieldHp;

    if (shieldBuff.shieldHp <= 0) {
      // Shield broken
      state.buffs = state.buffs.filter(b => b !== shieldBuff);
    }

    return { remaining: damage - absorbed, absorbed };
  }

  resetPlayer(sessionId: string, player?: PlayerSchema) {
    const state = this.playerBuffs.get(sessionId);
    if (state) {
      state.buffs = [];
    }
    if (player) {
      player.shieldHp = 0;
      player.speedMultiplier = 1.0;
      player.damageMultiplier = 1.0;
    }
  }

  resetForNewMatch() {
    this.playerBuffs.forEach((state, sessionId) => {
      state.buffs = [];
    });
  }

  private syncMultipliers(sessionId: string, player: PlayerSchema) {
    player.speedMultiplier = this.getSpeedMultiplier(sessionId);
    player.damageMultiplier = this.getDamageMultiplier(sessionId);
  }
}
