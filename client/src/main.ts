// ─── Quiz Arena – Client entry point ─────────────────────────────────────────
import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { MAP_W, MAP_H } from "./config";

// ── UI references ────────────────────────────────────────────────────────────
const joinScreen = document.getElementById("join-screen")!;
const nicknameInput = document.getElementById("nickname-input") as HTMLInputElement;
const joinBtn = document.getElementById("join-btn")!;
const gameContainer = document.getElementById("game-container")!;

let game: Phaser.Game | null = null;

/** Initialize Phaser when the player joins */
function startGame() {
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
}

// ── Join flow (local only for now – networking in Milestone 4) ───────────────
joinBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;
  startGame();
});

nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});
