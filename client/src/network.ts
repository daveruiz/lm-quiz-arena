// ─── Socket.IO client wrapper ────────────────────────────────────────────────
import { io, Socket } from "socket.io-client";

export type RoomPhase = "lobby" | "inQuestion" | "revealed";
export type PlayerStatus = "alive" | "dead" | "ghost";
export type Zone = "A" | "B" | "C" | "D";

export interface Player {
  id: string;
  nickname: string;
  color: number;
  x: number;
  y: number;
  /** Vertical position (0 = ground, >0 = airborne) */
  z: number;
  vz: number;
  status: PlayerStatus;
  inputX: number;
  inputY: number;
  jumpRequested: boolean;
  /** >0 means this player just got stomped on */
  stompedTimer: number;
  /** >0 means this player just got bumped */
  bumpedTimer: number;
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

let socket: Socket | null = null;
let myId: string | null = null;
let latestState: RoomState | null = null;

type StateListener = (state: RoomState) => void;
const stateListeners: StateListener[] = [];

export function onState(fn: StateListener) { stateListeners.push(fn); }
export function getLatestState(): RoomState | null { return latestState; }
export function getMyId(): string | null { return myId; }
export function getSocket(): Socket | null { return socket; }

export function connect(nickname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    socket = io({ transports: ["websocket", "polling"] });
    socket.on("connect", () => { socket!.emit("join", nickname); });
    socket.on("welcome", ({ id }) => { myId = id; resolve(id); });
    socket.on("state", (state: RoomState) => {
      latestState = state;
      for (const fn of stateListeners) fn(state);
    });
    socket.on("error", (msg: string) => {
      console.error("[server error]", msg);
      reject(new Error(msg));
    });
    socket.on("disconnect", () => { console.warn("[disconnected]"); });
  });
}

/** Send movement input + jump to the server */
export function sendInput(x: number, y: number, jump: boolean = false) {
  if (jump) {
    socket?.emit("input", { x, y, jump: true });
  } else {
    socket?.emit("input", { x, y });
  }
}
