// ─── Quiz Arena Server ──────────────────────────────────────────────────────
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import { room } from "./room.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "secret";
const TICK_RATE = 20; // Hz

const app = express();
app.use(cors());

// In production, serve the built client from ../client/dist
// app.use(express.static("../client/dist"));

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: "*" },
});

// ── Connection handler ───────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`⚡ connected: ${socket.id}`);

  socket.on("join", (nickname) => {
    if (!nickname || typeof nickname !== "string") {
      socket.emit("error", "Invalid nickname");
      return;
    }
    const trimmed = nickname.trim().slice(0, 16);
    if (!trimmed) {
      socket.emit("error", "Nickname cannot be empty");
      return;
    }
    room.addPlayer(socket.id, trimmed);
    socket.emit("welcome", { id: socket.id });
    console.log(`👤 ${trimmed} joined (${socket.id})`);
  });

  socket.on("input", ({ x, y }) => {
    room.setInput(socket.id, x, y);
  });

  // ── Admin events ─────────────────────────────────────────────────────────

  socket.on("adminStartQuestion", (data) => {
    if (data.adminKey !== ADMIN_KEY) {
      socket.emit("error", "Invalid admin key");
      return;
    }
    room.startQuestion({
      text: data.text,
      options: { A: data.A, B: data.B, C: data.C, D: data.D },
      correctZone: data.correctZone,
      durationSec: data.durationSec,
    });
    console.log(`❓ Question started: "${data.text}"`);
  });

  socket.on("adminReveal", (data) => {
    if (data.adminKey !== ADMIN_KEY) {
      socket.emit("error", "Invalid admin key");
      return;
    }
    room.reveal();
    console.log("✅ Answer revealed");
  });

  socket.on("adminReset", (data) => {
    if (data.adminKey !== ADMIN_KEY) {
      socket.emit("error", "Invalid admin key");
      return;
    }
    room.reset();
    console.log("🔄 Game reset");
  });

  socket.on("disconnect", () => {
    room.removePlayer(socket.id);
    console.log(`💤 disconnected: ${socket.id}`);
  });
});

// ── Game loop: tick + broadcast state ────────────────────────────────────────

setInterval(() => {
  // Auto-reveal when timer expires
  if (room.phase === "inQuestion" && room.question) {
    const elapsed = (Date.now() - room.question.startedAt) / 1000;
    if (elapsed >= room.question.durationSec) {
      room.reveal();
      console.log("⏰ Timer expired – auto-revealing answer");
    }
  }

  room.tick();
  io.emit("state", room.getState());
}, 1000 / TICK_RATE);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🚀 Quiz Arena server listening on http://localhost:${PORT}`);
});
