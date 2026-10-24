import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@spellcaster/shared";

export const socket = io(import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001", { autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>;
