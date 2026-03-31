// ─── Shared types for Quiz Arena ────────────────────────────────────────────
// These types define the Socket.IO event contracts and game state shape.
// In a larger project these would live in a shared package; for MVP we
// duplicate the essentials and keep the server as the source of truth.

/** Possible states the game room can be in */
export type RoomPhase = "lobby" | "inQuestion" | "revealed";

/** Player status */
export type PlayerStatus = "alive" | "dead" | "ghost";

/** Answer zone labels */
export type Zone = "A" | "B" | "C" | "D";

/** A single player's server-side state */
export interface Player {
  id: string;          // socket id
  nickname: string;
  x: number;
  y: number;
  status: PlayerStatus;
  /** Input vector from the client (normalized -1..1) */
  inputX: number;
  inputY: number;
}

/** The current quiz question (if any) */
export interface Question {
  text: string;
  options: { A: string; B: string; C: string; D: string };
  correctZone: Zone;
  durationSec: number;
  startedAt: number;   // Date.now()
}

/** Full room state (server-authoritative) */
export interface RoomState {
  phase: RoomPhase;
  players: Record<string, Player>;
  question: Question | null;
  /** Seconds remaining for the current question (computed on tick) */
  timeRemaining: number;
}

// ─── Socket.IO Event Contracts ──────────────────────────────────────────────

/** Client → Server events */
export interface ClientToServerEvents {
  /** Player wants to join with a nickname */
  join: (nickname: string) => void;
  /** Player sends movement input vector */
  input: (data: { x: number; y: number }) => void;
  // ─── Admin events ─────────────────────────────────────
  /** Admin starts a new question */
  adminStartQuestion: (data: {
    text: string;
    A: string;
    B: string;
    C: string;
    D: string;
    correctZone: Zone;
    durationSec: number;
    adminKey: string;
  }) => void;
  /** Admin forces reveal of the answer */
  adminReveal: (data: { adminKey: string }) => void;
  /** Admin resets the game back to lobby */
  adminReset: (data: { adminKey: string }) => void;
}

/** Server → Client events */
export interface ServerToClientEvents {
  /** Full state sync (sent on join and every tick) */
  state: (state: RoomState) => void;
  /** Server assigns the player their id */
  welcome: (data: { id: string }) => void;
  /** Error message */
  error: (msg: string) => void;
}
