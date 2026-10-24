import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@spellcaster/shared";
import type { MatchState } from "@spellcaster/shared";

export const socket = io(import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001", { autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>;
export let currentMatchState: MatchState | null = null;
socket.on("MATCH_STATE", (state) => { currentMatchState = state; });
socket.on("MATCH_START", (state) => { currentMatchState = state; });
socket.on("MATCH_END", (event) => { if (currentMatchState) currentMatchState = { ...currentMatchState, phase: "finished", winner: event.winner, endsAt: null, hp: event.hp }; });
