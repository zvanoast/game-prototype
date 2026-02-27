import { Client, Room } from "colyseus.js";
import type { InputPayload } from "shared";

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private _onStateChange: ((state: any) => void) | null = null;

  constructor() {
    // Connect directly to Colyseus server
    this.client = new Client("ws://localhost:3001");
  }

  async connect(): Promise<Room> {
    try {
      this.room = await this.client.joinOrCreate("game");
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
    if (this.room) {
      this.room.send("input", input);
    }
  }

  onStateChange(callback: (state: any) => void) {
    this._onStateChange = callback;
    if (this.room) {
      this.room.onStateChange(callback);
    }
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
