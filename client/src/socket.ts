import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@spellcaster/shared";

// Production uses the page's origin, including HTTPS/WSS on Render.
const serverUrl = import.meta.env.VITE_SERVER_URL?.trim() || undefined;
export const socket = io(serverUrl, { autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>;
