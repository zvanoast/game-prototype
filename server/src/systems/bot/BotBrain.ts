import type { BotPersona } from "./BotPersona";
import { perceive } from "./BotPerception";
import { ALL_ACTIONS, type BotContext, type BotOutput } from "./BotActions";
import { findPath, dist } from "./BotNavigation";
import { GameStateSchema } from "../../state/GameState";
import {
  MAX_HEALTH,
  TICK_RATE,
} from "shared";
import type { InputPayload } from "shared";

const BOT_PATH_UPDATE_TICKS = 10;
const BOT_STUCK_THRESHOLD_TICKS = 40;

// Button bit constants (const enum values aren't available at runtime)
const Button_INTERACT = 1 << 2;
const Button_DASH = 1 << 1;
const Button_USE_CONSUMABLE = 1 << 5;
const Button_ATTACK = 1 << 0;
const Button_MELEE = 1 << 4;

// Buttons that GameRoom/CombatSystem edge-detect (need 1-tick press, 1-tick release)
const EDGE_BUTTONS = Button_INTERACT | Button_DASH | Button_USE_CONSUMABLE;

/**
 * Per-bot AI controller. Runs utility scoring each tick to pick the best action,
 * then produces an InputPayload identical to what a human client sends.
 */
export class BotBrain {
  readonly botId: string;
  readonly persona: BotPersona;
  private state: GameStateSchema;
  private seq = 0;

  // Button state management
  // Track what buttons we sent last tick so CombatSystem's edge detection works
  private lastSentButtons = 0;
  // Edge buttons (INTERACT, DASH, USE_CONSUMABLE) need a release tick after pressing
  private edgeButtonCooldown = 0; // ticks until we can press edge buttons again

  // Ranged attack: CombatSystem fires on RELEASE, so we need press→release cycle
  private attackHoldTicks = 0; // how many ticks we've held ATTACK

  // Context state persisted between ticks
  private cachedPath: { x: number; y: number }[] = [];
  private waypointIdx = 0;
  private lastPathTick = -999;
  private wanderTarget: { x: number; y: number } | null = null;
  private lastWanderTick = 0;
  private stuckTicks = 0;
  private lastPos = { x: 0, y: 0 };

  // Persistent strafe direction (don't randomize every tick)
  strafeDir = 1; // 1 or -1
  private strafeChangeTick = 0;

  // Track last action for path caching
  private lastActionName = "";
  private lastTargetX = 0;
  private lastTargetY = 0;

  constructor(botId: string, persona: BotPersona, state: GameStateSchema) {
    this.botId = botId;
    this.persona = persona;
    this.state = state;
    // Stagger initial strafe direction
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
  }

  /** Run one tick of AI and return the InputPayload to push into the queue */
  tick(tick: number): InputPayload | null {
    const self = this.state.players.get(this.botId);
    if (!self || self.state === "dead" || self.eliminated) return null;

    // Stuck detection
    const moved = dist(self.x, self.y, this.lastPos.x, this.lastPos.y);
    if (moved < 2) {
      this.stuckTicks++;
    } else {
      this.stuckTicks = 0;
    }
    this.lastPos.x = self.x;
    this.lastPos.y = self.y;

    // If stuck for too long, clear path to force re-path
    if (this.stuckTicks > BOT_STUCK_THRESHOLD_TICKS) {
      this.cachedPath = [];
      this.waypointIdx = 0;
      this.wanderTarget = null;
      this.stuckTicks = 0;
    }

    // Periodically change strafe direction
    if (tick - this.strafeChangeTick > 10 + Math.floor(Math.random() * 20)) {
      this.strafeDir *= -1;
      this.strafeChangeTick = tick;
    }

    // Build perception
    const perception = perceive(this.botId, this.state, MAX_HEALTH);

    // Build context
    const ctx: BotContext = {
      botId: this.botId,
      self,
      persona: this.persona,
      perception,
      tick,
      cachedPath: this.cachedPath,
      waypointIdx: this.waypointIdx,
      lastPathTick: this.lastPathTick,
      wanderTarget: this.wanderTarget,
      lastWanderTick: this.lastWanderTick,
      stuckTicks: this.stuckTicks,
      lastPos: this.lastPos,
      strafeDir: this.strafeDir,
    };

    // Score all actions and pick highest
    let bestScore = -1;
    let bestAction = ALL_ACTIONS[ALL_ACTIONS.length - 1]; // Wander fallback
    for (const action of ALL_ACTIONS) {
      const score = action.score(ctx);
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    // Update pathfinding for navigation-heavy actions
    if (bestAction.name === "AttackEnemy" && perception.nearestEnemy) {
      const target = perception.nearestEnemy.player;
      this.updatePath(ctx, tick, target.x, target.y, bestAction.name);
    } else if (bestAction.name === "OpenLocker" && perception.closedLockers.length > 0) {
      const locker = perception.closedLockers[0].locker;
      this.updatePath(ctx, tick, locker.x, locker.y, bestAction.name);
    } else if (bestAction.name === "Wander" && ctx.wanderTarget) {
      this.updatePath(ctx, tick, ctx.wanderTarget.x, ctx.wanderTarget.y, bestAction.name);
    }

    // Execute chosen action
    const output = bestAction.execute(ctx);

    this.lastActionName = bestAction.name;

    // Persist context state back
    this.cachedPath = ctx.cachedPath;
    this.waypointIdx = ctx.waypointIdx;
    this.wanderTarget = ctx.wanderTarget;
    this.lastWanderTick = ctx.lastWanderTick;

    // --- Button management ---
    // Handle the complexity of edge-detected vs held buttons
    let finalButtons = 0;

    // Edge buttons (INTERACT, DASH, USE_CONSUMABLE):
    // Press for 1 tick, then must release for 1 tick before pressing again
    const wantsEdge = output.buttons & EDGE_BUTTONS;
    if (wantsEdge && this.edgeButtonCooldown <= 0) {
      finalButtons |= wantsEdge;
      this.edgeButtonCooldown = 2; // skip next tick to ensure release
    } else if (this.edgeButtonCooldown > 0) {
      this.edgeButtonCooldown--;
    }

    // ATTACK button: CombatSystem fires on RELEASE.
    // Press for 1 tick, release next tick → fires on release.
    const wantsAttack = !!(output.buttons & Button_ATTACK);
    if (wantsAttack) {
      if (this.attackHoldTicks === 0) {
        // Start pressing
        finalButtons |= Button_ATTACK;
        this.attackHoldTicks = 1;
      } else {
        // Release this tick (CombatSystem fires on release)
        // Don't set ATTACK bit
        this.attackHoldTicks = 0;
      }
    } else {
      // Action doesn't want attack — ensure released
      this.attackHoldTicks = 0;
    }

    // MELEE button: CombatSystem fires on PRESS (edge: down && !wasDown).
    // Press for 1 tick, release next tick to allow re-press.
    const wantsMelee = !!(output.buttons & Button_MELEE);
    if (wantsMelee) {
      if (!(this.lastSentButtons & Button_MELEE)) {
        // Can press (wasn't down last tick)
        finalButtons |= Button_MELEE;
      }
      // If was down last tick, don't press (release this tick so we can press again next tick)
    }

    this.lastSentButtons = finalButtons;

    this.seq++;
    return {
      seq: this.seq,
      tick,
      dx: output.dx,
      dy: output.dy,
      aimAngle: output.aimAngle,
      buttons: finalButtons,
      dt: 1 / TICK_RATE,
    };
  }

  private updatePath(
    ctx: BotContext,
    tick: number,
    targetX: number,
    targetY: number,
    actionName: string,
  ): void {
    const targetMoved = dist(targetX, targetY, this.lastTargetX, this.lastTargetY) > 64;
    const needsRepath = tick - this.lastPathTick >= BOT_PATH_UPDATE_TICKS
      || targetMoved
      || actionName !== this.lastActionName
      || ctx.cachedPath.length === 0;

    if (needsRepath) {
      ctx.cachedPath = findPath(ctx.self.x, ctx.self.y, targetX, targetY);
      ctx.waypointIdx = 0;
      this.lastPathTick = tick;
      this.lastTargetX = targetX;
      this.lastTargetY = targetY;
    }
  }
}
