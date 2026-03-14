import express from "express";
import cors from "cors";
import path from "path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom";
import { SERVER_PORT } from "shared";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register rooms
gameServer.define("game", GameRoom);
gameServer.define("sandbox", GameRoom);

// Colyseus monitor (dev tool)
app.use("/monitor", monitor());

// In production, serve the built client files
const clientDist = path.resolve(__dirname, "../../client/dist");

// Hashed assets (js/css) can be cached forever; index.html must not be cached
app.use(express.static(clientDist, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    } else {
      // Vite adds content hashes to JS/CSS filenames — safe to cache long
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
}));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Return taken character indices across all active game rooms
app.get("/api/taken-characters", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "game" });
    const taken: number[] = [];
    const players: { name: string; characterIndex: number }[] = [];
    let phase = "waiting";
    for (const listing of rooms) {
      const room = matchMaker.getRoomById(listing.roomId);
      if (room && room instanceof GameRoom) {
        for (const idx of room.takenCharacters) {
          if (!taken.includes(idx)) taken.push(idx);
        }
        room.state.players.forEach((p) => {
          players.push({
            name: p.displayName || "NONAME",
            characterIndex: p.characterIndex,
          });
        });
        phase = room.state.phase || "waiting";
      }
    }
    res.json({ taken, players, phase });
  } catch {
    res.json({ taken: [], players: [], phase: "waiting" });
  }
});

// SPA fallback — serve index.html for any non-API/non-WS route
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(clientDist, "index.html"));
});

httpServer.listen(SERVER_PORT, () => {
  console.log(`Colyseus server listening on http://localhost:${SERVER_PORT}`);
  console.log(`Monitor: http://localhost:${SERVER_PORT}/monitor`);
});
