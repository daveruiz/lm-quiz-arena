// ─── Shared types for Quiz Arena ────────────────────────────────────────────

/** Possible states the game room can be in */
export type RoomPhase = "lobby" | "inQuestion" | "revealed";

/** Player status */
export type PlayerStatus = "alive" | "dead" | "ghost";

/** Answer zone labels */
export type Zone = "A" | "B" | "C" | "D";

/** A single player's server-side state */
export interface Player {
  id: string;
  nickname: string;
  /** Server-assigned color (hex number, e.g. 0xe94560) */
  color: number;
  x: number;
  y: number;
  /** Vertical position for jumping (0 = ground) */
  z: number;
  /** Vertical velocity (positive = upward) */
  vz: number;
  status: PlayerStatus;
  /** Input vector from the client (normalized -1..1) */
  inputX: number;
  inputY: number;
  /** Whether the player is requesting a jump */
  jumpRequested: boolean;
  /** Ticks remaining for "got stomped" reaction (server decrements each tick) */
  stompedTimer: number;
  /** Ticks remaining for "bumped" reaction (horizontal collision) */
  bumpedTimer: number;
}

/** The current quiz question (if any) */
export interface Question {
  text: string;
  options: { A: string; B: string; C: string; D: string };
  correctZone: Zone;
  durationSec: number;
  startedAt: number;
}

/** Full room state (server-authoritative) */
export interface RoomState {
  phase: RoomPhase;
  players: Record<string, Player>;
  question: Question | null;
  timeRemaining: number;
}

// ─── Socket.IO Event Contracts ──────────────────────────────────────────────

export interface ClientToServerEvents {
  join: (nickname: string) => void;
  /** Movement input + jump flag */
  input: (data: { x: number; y: number; jump?: boolean }) => void;
  adminStartQuestion: (data: {
    text: string;
    A: string; B: string; C: string; D: string;
    correctZone: Zone;
    durationSec: number;
    adminKey: string;
  }) => void;
  adminReveal: (data: { adminKey: string }) => void;
  adminReset: (data: { adminKey: string }) => void;
}

export interface ServerToClientEvents {
  state: (state: RoomState) => void;
  welcome: (data: { id: string }) => void;
  error: (msg: string) => void;
}
