// ─── Quiz Arena – Client entry point ─────────────────────────────────────────
import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { MAP_W, MAP_H } from "./config";
import { connect, onState } from "./network";
import type { RoomState } from "./network";
import { initAdminPanel } from "./admin";
import { toggleMute } from "./audio";

// ── UI references ────────────────────────────────────────────────────────────
const joinScreen = document.getElementById("join-screen")!;
const nicknameInput = document.getElementById("nickname-input") as HTMLInputElement;
const joinBtn = document.getElementById("join-btn")!;
const gameContainer = document.getElementById("game-container")!;
const phaseBadge = document.getElementById("phase-badge")!;
const playerCount = document.getElementById("player-count")!;
const questionOverlay = document.getElementById("question-overlay")!;
const qText = document.getElementById("q-text")!;
const optA = document.getElementById("opt-A")!;
const optB = document.getElementById("opt-B")!;
const optC = document.getElementById("opt-C")!;
const optD = document.getElementById("opt-D")!;
const timer = document.getElementById("timer")!;

let game: Phaser.Game | null = null;

/** Update the HTML HUD from server state */
function updateHUD(state: RoomState) {
  // Phase badge
  phaseBadge.textContent = state.phase.toUpperCase();
  phaseBadge.className = `phase phase-${state.phase}`;

  // Player count
  const players = Object.values(state.players);
  const alive = players.filter((p) => p.status === "alive").length;
  const total = players.length;
  playerCount.textContent = `Alive: ${alive} / ${total}`;

  // Question overlay
  if (state.question && (state.phase === "inQuestion" || state.phase === "revealed")) {
    questionOverlay.classList.add("active");
    qText.textContent = state.question.text;
    optA.textContent = `A: ${state.question.options.A}`;
    optB.textContent = `B: ${state.question.options.B}`;
    optC.textContent = `C: ${state.question.options.C}`;
    optD.textContent = `D: ${state.question.options.D}`;

    if (state.phase === "inQuestion") {
      timer.textContent = `⏱ ${Math.ceil(state.timeRemaining)}s`;
    } else {
      timer.textContent = `✅ Answer: ${state.question.correctZone}`;
    }
  } else {
    questionOverlay.classList.remove("active");
  }
}

/** Initialize Phaser and connect to the server */
async function joinGame(nickname: string) {
  joinBtn.textContent = "Connecting…";
  joinBtn.setAttribute("disabled", "true");

  try {
    await connect(nickname);
  } catch (err) {
    joinBtn.textContent = "Join Game";
    joinBtn.removeAttribute("disabled");
    alert(`Failed to join: ${(err as Error).message}`);
    return;
  }

  joinScreen.style.display = "none";
  gameContainer.classList.add("active");

  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: MAP_W,
    height: MAP_H,
    parent: "game-container",
    backgroundColor: "#1a1a2e",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [GameScene],
  });

  // Wire up HUD updates
  onState(updateHUD);

  // Initialize admin panel if ?admin=1
  initAdminPanel();
}

// ── Join flow ────────────────────────────────────────────────────────────────
joinBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;
  joinGame(nickname);
});

nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

// ── Mute button ──────────────────────────────────────────────────────────────
const muteBtn = document.getElementById("mute-btn");
muteBtn?.addEventListener("click", () => {
  const muted = toggleMute();
  muteBtn.textContent = muted ? "🔇" : "🔊";
});
