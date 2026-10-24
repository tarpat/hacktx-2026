import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { DEFAULT_MATCH_CONFIG, type ClientToServerEvents, type ServerToClientEvents } from "@spellcaster/shared";
import { MatchRunner } from "./match.js";
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
const matches = new Map<string, MatchRunner>();

const isActionId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

function startMatch(code: string) {
  matches.get(code)?.stop();
  const runner = new MatchRunner(
    (state, events) => io.to(code).emit("MATCH_STATE", state, events),
    () => {
      matches.delete(code);
      const snapshot = rooms.setInMatch(code, false);
      if (snapshot) io.to(code).emit("ROOM_UPDATED", snapshot);
    },
  );
  matches.set(code, runner);
  const snapshot = rooms.setInMatch(code, true);
  if (snapshot) io.to(code).emit("ROOM_UPDATED", snapshot);
}

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
    const snapshot = rooms.setReady(roomCode, socket.id, ready === true);
    if (!snapshot) return;
    io.to(roomCode).emit("ROOM_UPDATED", snapshot);
    if (snapshot.status === "ready" && !matches.has(roomCode)) startMatch(roomCode);
  });

  socket.on("CAST_REQUEST", (request, callback) => {
    const runner = roomCode ? matches.get(roomCode) : undefined;
    const slot = roomCode ? rooms.slotOf(roomCode, socket.id) : null;
    if (!runner || !slot || !isActionId(request?.clientActionId) || !Object.hasOwn(DEFAULT_MATCH_CONFIG.spells, request.spell)) {
      callback?.({ ok: false, clientActionId: String(request?.clientActionId ?? ""), reason: "not_active" });
      return;
    }
    // Evaluate before the optional call: `callback?.(f())` skips f() when there is no ack.
    const ack = runner.cast(slot, request.spell, request.clientActionId);
    callback?.(ack);
  });

  socket.on("POWER_UP_REQUEST", (request, callback) => {
    const runner = roomCode ? matches.get(roomCode) : undefined;
    const slot = roomCode ? rooms.slotOf(roomCode, socket.id) : null;
    if (!runner || !slot || !isActionId(request?.clientActionId) || !Object.hasOwn(DEFAULT_MATCH_CONFIG.powerUps, request.powerUp)) {
      callback?.({ ok: false, clientActionId: String(request?.clientActionId ?? ""), reason: "not_active" });
      return;
    }
    const ack = runner.powerUp(slot, request.powerUp, request.clientActionId);
    callback?.(ack);
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
