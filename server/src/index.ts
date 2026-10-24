import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@spellcaster/shared";
import { RoomManager } from "./rooms.js";
import { MatchManager } from "./match.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") ?? "http://localhost:5173" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN?.split(",") ?? "http://localhost:5173" },
});
const rooms = new RoomManager();
const matches = new MatchManager();
const sendMatchEnd = (code: string) => (event: Parameters<ServerToClientEvents["MATCH_END"]>[0]) => io.to(code).emit("MATCH_END", event);

io.on("connection", (socket) => {
  let roomCode: string | null = null;

  socket.on("CREATE_ROOM", (callback) => {
    const result = rooms.create(socket.id);
    roomCode = result.room.code;
    socket.join(roomCode);
    callback(result);
    io.to(roomCode).emit("ROOM_UPDATED", result.room);
  });

  socket.on("JOIN_ROOM", (code, sessionToken, callback) => {
    const result = rooms.join(code, socket.id, sessionToken);
    if (!result) {
      callback({ error: "Room not found or full." });
      return;
    }
    roomCode = result.room.code;
    socket.join(roomCode);
    callback(result);
    io.to(roomCode).emit("ROOM_UPDATED", result.room);
    if (result.reconnected) socket.to(roomCode).emit("PLAYER_RECONNECTED", result.playerSlot);
    const matchState = matches.get(roomCode);
    if (result.reconnected && matchState) socket.emit("MATCH_STATE", matchState);
  });

  socket.on("READY_STATUS", (ready) => {
    if (!roomCode) return;
    const snapshot = rooms.setReady(roomCode, socket.id, ready);
    if (snapshot) {
      io.to(roomCode).emit("ROOM_UPDATED", snapshot);
      matches.beginCountdown(snapshot, (event, state) => io.to(roomCode!).emit(event, state), sendMatchEnd(roomCode));
    }
  });

  socket.on("CAST_REQUEST", ({ spell, clientActionId }) => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (room) matches.cast(room, socket.id, spell, clientActionId, (event, payload) => {
      if (event === "SPELL_REJECTED") socket.emit(event, payload as Parameters<ServerToClientEvents["SPELL_REJECTED"]>[0]);
      else io.to(roomCode!).emit(event as keyof ServerToClientEvents, payload as never);
    }, sendMatchEnd(roomCode));
  });

  socket.on("DEFEND_START", () => { if (roomCode) { const room = rooms.get(roomCode); const state = room ? matches.defendStart(room, socket.id) : null; if (state) io.to(roomCode).emit("MATCH_STATE", state); } });
  socket.on("DEFEND_END", () => { if (roomCode) { const room = rooms.get(roomCode); if (room) matches.defendEnd(room, socket.id); } });

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
