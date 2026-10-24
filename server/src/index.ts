import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@spellcaster/shared";
import { RoomManager } from "./rooms.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") ?? "http://localhost:5173" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN?.split(",") ?? "http://localhost:5173" },
});
const rooms = new RoomManager();

io.on("connection", (socket) => {
  let roomCode: string | null = null;

  socket.on("CREATE_ROOM", (callback) => {
    const result = rooms.create(socket.id);
    roomCode = result.room.code;
    socket.join(roomCode);
    callback(result);
    io.to(roomCode).emit("ROOM_UPDATED", result.room);
  });

  socket.on("JOIN_ROOM", (code, callback) => {
    const result = rooms.join(code, socket.id);
    if (!result) {
      callback({ error: "Room not found or full." });
      return;
    }
    roomCode = result.room.code;
    socket.join(roomCode);
    callback(result);
    io.to(roomCode).emit("ROOM_UPDATED", result.room);
    socket.to(roomCode).emit("PLAYER_RECONNECTED", result.playerSlot);
  });

  socket.on("READY_STATUS", (ready) => {
    if (!roomCode) return;
    const snapshot = rooms.setReady(roomCode, socket.id, ready);
    if (snapshot) io.to(roomCode).emit("ROOM_UPDATED", snapshot);
  });

  socket.on("disconnect", () => {
    if (!roomCode) return;
    const disconnected = rooms.disconnect(roomCode, socket.id, (snapshot) => io.to(snapshot.code).emit("ROOM_UPDATED", snapshot));
    if (!disconnected) return;
    io.to(roomCode).emit("ROOM_UPDATED", disconnected.room);
    io.to(roomCode).emit("PLAYER_DISCONNECTED", disconnected.slot, disconnected.expiresAt);
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`SpellCaster server listening on http://localhost:${port}`));
