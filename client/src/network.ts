// ─── Socket.IO client wrapper ────────────────────────────────────────────────
import { io, Socket } from "socket.io-client";

/** Minimal type mirrors of the server types (keep in sync manually for MVP) */
export type RoomPhase = "lobby" | "inQuestion" | "revealed";
export type PlayerStatus = "alive" | "dead" | "ghost";
export type Zone = "A" | "B" | "C" | "D";

export interface Player {
  id: string;
  nickname: string;
  x: number;
  y: number;
  status: PlayerStatus;
  inputX: number;
  inputY: number;
}

export interface Question {
  text: string;
  options: { A: string; B: string; C: string; D: string };
  correctZone: Zone;
  durationSec: number;
  startedAt: number;
}

export interface RoomState {
  phase: RoomPhase;
  players: Record<string, Player>;
  question: Question | null;
  timeRemaining: number;
}

// ── Singleton socket ─────────────────────────────────────────────────────────

let socket: Socket | null = null;
let myId: string | null = null;
let latestState: RoomState | null = null;

/** Listeners that GameScene can register */
type StateListener = (state: RoomState) => void;
const stateListeners: StateListener[] = [];

export function onState(fn: StateListener) {
  stateListeners.push(fn);
}

export function getLatestState(): RoomState | null {
  return latestState;
}

export function getMyId(): string | null {
  return myId;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Connect to the server and join with a nickname */
export function connect(nickname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // In dev, Vite proxy forwards /socket.io to the server.
    // In prod, the client is served from the same origin.
    socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      socket!.emit("join", nickname);
    });

    socket.on("welcome", ({ id }) => {
      myId = id;
      resolve(id);
    });

    socket.on("state", (state: RoomState) => {
      latestState = state;
      for (const fn of stateListeners) fn(state);
    });

    socket.on("error", (msg: string) => {
      console.error("[server error]", msg);
      reject(new Error(msg));
    });

    socket.on("disconnect", () => {
      console.warn("[disconnected from server]");
    });
  });
}

/** Send movement input to the server */
export function sendInput(x: number, y: number) {
  socket?.emit("input", { x, y });
}
