// ─── Room: in-memory game state with physics ────────────────────────────────
import type { Player, Question, RoomPhase, RoomState, Zone } from "./types.js";

/** Map dimensions (logical pixels) */
export const MAP_W = 800;
export const MAP_H = 600;

// ── Physics constants ────────────────────────────────────────────────────────
const SPEED = 7;             // px/tick ground movement
const AIR_SPEED = 4;         // px/tick movement while airborne (less control)
const JUMP_VZ = 9;           // initial upward velocity on jump (shorter arc)
const GRAVITY = 1.2;         // downward acceleration per tick (snappier fall)
const BOUNCE_FACTOR = 0.3;   // how much velocity transfers on landing bounce
const PLAYER_RADIUS = 10;    // collision radius
const PUSH_FORCE = 4;        // base push strength on collision
const STOMP_PUSH = 8;        // extra push when landing on someone
const BUMP_COOLDOWN = 5;     // ticks before same pair can bump again

// ── Dynamic zone sizing ──────────────────────────────────────────────────────
/** Zone centres – fixed quadrant midpoints */
export const ZONE_CENTERS: Record<Zone, { x: number; y: number }> = {
  A: { x: 200, y: 150 },
  B: { x: 600, y: 150 },
  C: { x: 200, y: 450 },
  D: { x: 600, y: 450 },
};

/** Side length constraints for square zones */
export const MIN_ZONE_SIZE = 100;
export const MAX_ZONE_SIZE = 270; // keeps a ≥20 px gap between adjacent zones

/** Compute square zone side length so ~aliveCount/4 players fit per zone */
function computeZoneSize(aliveCount: number): number {
  const s = 60 * Math.sqrt(Math.max(1, aliveCount) / 4) + 50;
  return Math.max(MIN_ZONE_SIZE, Math.min(MAX_ZONE_SIZE, Math.round(s)));
}

/** AABB of a zone at the current size */
function zoneRect(zone: Zone, size: number) {
  const c = ZONE_CENTERS[zone];
  return { x: c.x - size / 2, y: c.y - size / 2, w: size, h: size };
}

const SPAWN_X = MAP_W / 2;
const SPAWN_Y = MAP_H / 2;

// ── Palette of distinct, vibrant colors ──────────────────────────────────────
const COLOR_PALETTE = [
  0xe94560, // red
  0x3498db, // blue
  0x2ecc71, // green
  0xe9a045, // orange
  0x9b59b6, // purple
  0x1abc9c, // teal
  0xe74c3c, // crimson
  0xf39c12, // amber
  0x00b894, // mint
  0x6c5ce7, // indigo
  0xfd79a8, // pink
  0x00cec9, // cyan
  0xffeaa7, // cream
  0xdfe6e9, // silver
  0xa29bfe, // lavender
  0xfab1a0, // salmon
];
let colorIndex = 0;

/** Tracks recent collisions to prevent jitter */
const bumpCooldowns: Record<string, number> = {};

/** Internal bot movement state (not sent to clients) */
interface BotDir { x: number; y: number; timer: number }

class Room {
  phase: RoomPhase = "lobby";
  players: Record<string, Player> = {};
  question: Question | null = null;
  zoneSize: number = 0; // 0 = hidden in lobby; computed at startQuestion

  // ── Bot tracking ──────────────────────────────────────────────────────
  private botDirs: Record<string, BotDir> = {};
  private botCount = 0;

  // ── Player management ──────────────────────────────────────────────────

  addPlayer(id: string, nickname: string): Player {
    const status = this.phase === "inQuestion" ? "ghost" : "alive";
    const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
    colorIndex++;

    const player: Player = {
      id,
      nickname,
      color,
      x: SPAWN_X + (Math.random() - 0.5) * 60,
      y: SPAWN_Y + (Math.random() - 0.5) * 60,
      z: 0,
      vz: 0,
      status,
      inputX: 0,
      inputY: 0,
      jumpRequested: false,
      facing: 0, // default: facing down (toward camera)
      stompedTimer: 0,
      bumpedTimer: 0,
      chatMessage: "",
      chatTimer: 0,
      score: 0,
    };
    this.players[id] = player;
    return player;
  }

  /** Remove all bot players */
  removeBots() {
    for (const id of Object.keys(this.botDirs)) {
      this.removePlayer(id);
    }
  }

  /** Add a server-controlled bot player */
  addBot() {
    this.botCount++;
    const id = `bot_${this.botCount}`;
    const player = this.addPlayer(id, `Bot${this.botCount}`);
    player.isBot = true;
    // Start moving in a random direction
    const angle = Math.random() * Math.PI * 2;
    this.botDirs[id] = { x: Math.cos(angle), y: Math.sin(angle), timer: 0 };
    return player;
  }

  removePlayer(id: string) {
    delete this.players[id];
    delete this.botDirs[id]; // clean up bot state if applicable
    // Clean up cooldowns involving this player
    for (const key of Object.keys(bumpCooldowns)) {
      if (key.includes(id)) delete bumpCooldowns[key];
    }
  }

  setInput(id: string, x: number, y: number, jump?: boolean) {
    const p = this.players[id];
    if (!p) return;
    p.inputX = Math.max(-1, Math.min(1, x));
    p.inputY = Math.max(-1, Math.min(1, y));
    if (jump) p.jumpRequested = true;
  }

  setChat(id: string, text: string) {
    const p = this.players[id];
    if (!p) return;
    const clean = text.trim().slice(0, 60);
    if (!clean) return;
    p.chatMessage = clean;
    p.chatTimer = 120; // 6 s at 20 Hz
  }

  // ── Bot AI ────────────────────────────────────────────────────────────
  private tickBots() {
    for (const [id, dir] of Object.entries(this.botDirs)) {
      if (!this.players[id]) { delete this.botDirs[id]; continue; }
      dir.timer--;
      if (dir.timer <= 0) {
        // Pick a new random direction and hold it for 1–3 seconds
        const angle = Math.random() * Math.PI * 2;
        dir.x = Math.random() > 0.15 ? Math.cos(angle) : 0; // 15% idle
        dir.y = Math.random() > 0.15 ? Math.sin(angle) : 0;
        dir.timer = Math.floor(20 + Math.random() * 40);
      }
      // ~4% chance to jump each tick (≈ once every 1.25s)
      const jump = Math.random() < 0.04;
      this.setInput(id, dir.x, dir.y, jump);
    }
  }

  // ── Tick (called at ~20 Hz) ────────────────────────────────────────────

  tick() {
    this.tickBots(); // update bot inputs before physics
    const players = Object.values(this.players);

    // 0. Decrement reaction + chat timers
    for (const p of players) {
      if (p.stompedTimer > 0) p.stompedTimer--;
      if (p.bumpedTimer > 0) p.bumpedTimer--;
      if (p.chatTimer > 0) {
        p.chatTimer--;
        if (p.chatTimer === 0) p.chatMessage = "";
      }
    }

    // 1. Process movement + jump for each player
    // Dead players become ghosts: they can move freely but skip collisions below.
    for (const p of players) {
      if (p.status === "ghost") continue; // spectators who joined mid-game don't move

      const isAirborne = p.z > 0.5;
      const speed = isAirborne ? AIR_SPEED : SPEED;

      // Horizontal movement
      p.x += p.inputX * speed;
      p.y += p.inputY * speed;

      // Update facing direction based on dominant input axis
      if (Math.abs(p.inputX) > 0.1 || Math.abs(p.inputY) > 0.1) {
        if (Math.abs(p.inputY) >= Math.abs(p.inputX)) {
          p.facing = p.inputY > 0 ? 0 : 2; // 0=down, 2=up
        } else {
          p.facing = p.inputX < 0 ? 1 : 3; // 1=left, 3=right
        }
      }

      // Jump initiation (only from ground)
      if (p.jumpRequested && p.z < 0.5) {
        p.vz = JUMP_VZ;
      }
      p.jumpRequested = false;

      // Gravity
      p.vz -= GRAVITY;
      p.z += p.vz;

      // Ground clamp
      if (p.z <= 0) {
        p.z = 0;
        // Small bounce if landing with speed
        if (p.vz < -2) {
          p.vz = Math.abs(p.vz) * BOUNCE_FACTOR;
        } else {
          p.vz = 0;
        }
      }

      // Map bounds
      p.x = Math.max(PLAYER_RADIUS, Math.min(MAP_W - PLAYER_RADIUS, p.x));
      p.y = Math.max(PLAYER_RADIUS, Math.min(MAP_H - PLAYER_RADIUS, p.y));
    }

    // 2. Player-to-player collisions (push apart)
    // Decrease cooldowns
    for (const key of Object.keys(bumpCooldowns)) {
      bumpCooldowns[key]--;
      if (bumpCooldowns[key] <= 0) delete bumpCooldowns[key];
    }

    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (a.status === "dead") continue;

      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];
        if (b.status === "dead") continue;

        // Only collide if both are roughly on the same vertical plane
        // (allows jumping over someone)
        const zDiff = Math.abs(a.z - b.z);
        if (zDiff > 15) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = PLAYER_RADIUS * 2;

        if (dist < minDist && dist > 0.01) {
          // Normalize
          const nx = dx / dist;
          const ny = dy / dist;

          // Separation (push apart equally)
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // Check bump cooldown
          const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          if (bumpCooldowns[pairKey]) continue;
          bumpCooldowns[pairKey] = BUMP_COOLDOWN;

          // Push force based on relative velocity
          const aSpeed = Math.sqrt(a.inputX * a.inputX + a.inputY * a.inputY);
          const bSpeed = Math.sqrt(b.inputX * b.inputX + b.inputY * b.inputY);

          // The faster-moving player pushes the other more
          const pushA = PUSH_FORCE * (0.5 + bSpeed * 0.5);
          const pushB = PUSH_FORCE * (0.5 + aSpeed * 0.5);

          a.x -= nx * pushA;
          a.y -= ny * pushA;
          b.x += nx * pushB;
          b.y += ny * pushB;

          // Both get a bump reaction
          a.bumpedTimer = 6;  // ~0.3s at 20Hz
          b.bumpedTimer = 6;

          // Stomp: if one is above the other and falling, extra push + bounce
          if (a.z > b.z + 5 && a.vz < 0) {
            // A is stomping B
            b.x += nx * STOMP_PUSH;
            b.y += ny * STOMP_PUSH;
            a.vz = JUMP_VZ * 0.6;
            b.stompedTimer = 10; // ~0.5s reaction
            b.bumpedTimer = 0;   // stomp overrides bump
          } else if (b.z > a.z + 5 && b.vz < 0) {
            // B is stomping A
            a.x -= nx * STOMP_PUSH;
            a.y -= ny * STOMP_PUSH;
            b.vz = JUMP_VZ * 0.6;
            a.stompedTimer = 10;
            a.bumpedTimer = 0;
          }

          // Re-clamp after push
          a.x = Math.max(PLAYER_RADIUS, Math.min(MAP_W - PLAYER_RADIUS, a.x));
          a.y = Math.max(PLAYER_RADIUS, Math.min(MAP_H - PLAYER_RADIUS, a.y));
          b.x = Math.max(PLAYER_RADIUS, Math.min(MAP_W - PLAYER_RADIUS, b.x));
          b.y = Math.max(PLAYER_RADIUS, Math.min(MAP_H - PLAYER_RADIUS, b.y));
        }
      }
    }
  }

  // ── Quiz state machine ─────────────────────────────────────────────────

  startQuestion(q: Omit<Question, "startedAt">) {
    this.phase = "inQuestion";
    this.question = { ...q, startedAt: Date.now() };
    // Resize zones so alive players barely fit
    const aliveCount = Object.values(this.players).filter(p => p.status === "alive").length;
    this.zoneSize = computeZoneSize(aliveCount);
  }

  reveal() {
    if (!this.question) return;
    this.phase = "revealed";
    const correct = zoneRect(this.question.correctZone, this.zoneSize);
    for (const p of Object.values(this.players)) {
      if (p.status !== "alive") continue;
      const inZone =
        p.x >= correct.x && p.x <= correct.x + correct.w &&
        p.y >= correct.y && p.y <= correct.y + correct.h;
      if (inZone) {
        p.score++; // correct answer!
      } else {
        p.status = "dead";
      }
    }
  }

  reset() {
    this.phase = "lobby";
    this.question = null;
    this.zoneSize = 0;
    for (const p of Object.values(this.players)) {
      p.status = "alive";
      p.score = 0; // reset scores on full game reset
      p.x = SPAWN_X + (Math.random() - 0.5) * 60;
      p.y = SPAWN_Y + (Math.random() - 0.5) * 60;
      p.z = 0;
      p.vz = 0;
      p.inputX = 0;
      p.inputY = 0;
    }
  }

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
      zoneSize: this.zoneSize,
    };
  }
}

export const room = new Room();
