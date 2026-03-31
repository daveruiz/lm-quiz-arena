// ─── Room: in-memory game state manager ─────────────────────────────────────
import type { Player, Question, RoomPhase, RoomState, Zone } from "./types.js";

/** Map dimensions (logical pixels) */
export const MAP_W = 800;
export const MAP_H = 600;

/** Player movement speed (px per tick at 20 Hz) */
const SPEED = 5;

/** Zone bounding boxes (x, y, w, h) – four quadrants */
export const ZONES: Record<Zone, { x: number; y: number; w: number; h: number }> = {
  A: { x: 50,  y: 50,  w: 300, h: 200 },
  B: { x: 450, y: 50,  w: 300, h: 200 },
  C: { x: 50,  y: 350, w: 300, h: 200 },
  D: { x: 450, y: 350, w: 300, h: 200 },
};

/** Spawn point (center of the map) */
const SPAWN_X = MAP_W / 2;
const SPAWN_Y = MAP_H / 2;

class Room {
  phase: RoomPhase = "lobby";
  players: Record<string, Player> = {};
  question: Question | null = null;

  // ── Player management ──────────────────────────────────────────────────

  addPlayer(id: string, nickname: string): Player {
    const status = this.phase === "inQuestion" ? "ghost" : "alive";
    const player: Player = {
      id,
      nickname,
      x: SPAWN_X,
      y: SPAWN_Y,
      status,
      inputX: 0,
      inputY: 0,
    };
    this.players[id] = player;
    return player;
  }

  removePlayer(id: string) {
    delete this.players[id];
  }

  setInput(id: string, x: number, y: number) {
    const p = this.players[id];
    if (!p) return;
    // Clamp to -1..1
    p.inputX = Math.max(-1, Math.min(1, x));
    p.inputY = Math.max(-1, Math.min(1, y));
  }

  // ── Tick (called at ~20 Hz) ────────────────────────────────────────────

  tick() {
    for (const p of Object.values(this.players)) {
      // Only alive (or ghost during lobby) players can move
      if (p.status === "dead") continue;

      p.x += p.inputX * SPEED;
      p.y += p.inputY * SPEED;

      // Clamp to map bounds
      p.x = Math.max(0, Math.min(MAP_W, p.x));
      p.y = Math.max(0, Math.min(MAP_H, p.y));
    }
  }

  // ── Quiz state machine ─────────────────────────────────────────────────

  startQuestion(q: Omit<Question, "startedAt">) {
    this.phase = "inQuestion";
    this.question = { ...q, startedAt: Date.now() };
    // Late joiners already handled in addPlayer via phase check
  }

  /** Reveal the correct answer; kill players outside the correct zone */
  reveal() {
    if (!this.question) return;
    this.phase = "revealed";

    const correct = ZONES[this.question.correctZone];

    for (const p of Object.values(this.players)) {
      if (p.status === "ghost") continue; // ghosts don't participate
      if (p.status === "dead") continue;  // already dead

      const inZone =
        p.x >= correct.x &&
        p.x <= correct.x + correct.w &&
        p.y >= correct.y &&
        p.y <= correct.y + correct.h;

      if (!inZone) {
        p.status = "dead";
      }
    }
  }

  /** Reset everything back to lobby */
  reset() {
    this.phase = "lobby";
    this.question = null;
    for (const p of Object.values(this.players)) {
      p.status = "alive";
      p.x = SPAWN_X;
      p.y = SPAWN_Y;
      p.inputX = 0;
      p.inputY = 0;
    }
  }

  // ── Snapshot for clients ───────────────────────────────────────────────

  getState(): RoomState {
    let timeRemaining = 0;
    if (this.question && this.phase === "inQuestion") {
      const elapsed = (Date.now() - this.question.startedAt) / 1000;
      timeRemaining = Math.max(0, this.question.durationSec - elapsed);
    }
    return {
      phase: this.phase,
      players: this.players,
      question: this.question,
      timeRemaining,
    };
  }
}

/** Singleton room instance (MVP: single room) */
export const room = new Room();
