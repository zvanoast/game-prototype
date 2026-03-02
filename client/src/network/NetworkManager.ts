import { Client, Room } from "colyseus.js";
import type { InputPayload } from "shared";

interface QueuedMessage {
  input: InputPayload;
  sendAt: number; // performance.now() timestamp when this should be sent
}

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private _onStateChange: ((state: any) => void) | null = null;

  // Artificial latency
  private artificialDelayMs = 0;
  private delayQueue: QueuedMessage[] = [];

  constructor() {
    // Connect directly to Colyseus server
    this.client = new Client("ws://localhost:3001");
  }

  async connect(options: Record<string, unknown> = {}, roomType = "game"): Promise<Room> {
    try {
      this.room = await this.client.joinOrCreate(roomType, options);
      console.log(`Connected to room: ${this.room.id}, sessionId: ${this.room.sessionId}`);

      if (this._onStateChange) {
        this.room.onStateChange(this._onStateChange);
      }

      return this.room;
    } catch (err) {
      console.error("Failed to connect to server:", err);
      throw err;
    }
  }

  sendInput(input: InputPayload) {
    if (!this.room) return;

    if (this.artificialDelayMs <= 0) {
      // No delay — send immediately
      this.room.send("input", input);
    } else {
      // Queue with delay
      this.delayQueue.push({
        input,
        sendAt: performance.now() + this.artificialDelayMs,
      });
    }
  }

  /**
   * Flush the delay queue — call every frame from GameScene.update().
   * Sends all queued inputs whose delay has elapsed.
   */
  flush() {
    if (this.delayQueue.length === 0 || !this.room) return;

    const now = performance.now();
    let i = 0;
    while (i < this.delayQueue.length) {
      if (this.delayQueue[i].sendAt <= now) {
        this.room.send("input", this.delayQueue[i].input);
        this.delayQueue.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  /**
   * Set artificial latency for outgoing inputs (in milliseconds).
   * Use 0 to disable. Useful for testing prediction/reconciliation.
   */
  setArtificialDelay(ms: number) {
    this.artificialDelayMs = Math.max(0, ms);
    console.log(`Artificial latency set to ${this.artificialDelayMs}ms`);
  }

  getArtificialDelay(): number {
    return this.artificialDelayMs;
  }

  onStateChange(callback: (state: any) => void) {
    this._onStateChange = callback;
    if (this.room) {
      this.room.onStateChange(callback);
    }
  }

  isConnected(): boolean {
    return this.room !== null;
  }

  getRoom(): Room | null {
    return this.room;
  }

  getSessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
  }
}
