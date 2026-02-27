import express from "express";
import cors from "cors";
import { Server } from "colyseus";
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

// Colyseus monitor (dev tool)
app.use("/monitor", monitor());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

httpServer.listen(SERVER_PORT, () => {
  console.log(`Colyseus server listening on http://localhost:${SERVER_PORT}`);
  console.log(`Monitor: http://localhost:${SERVER_PORT}/monitor`);
});
