// ─── Admin panel logic ───────────────────────────────────────────────────────
// Activated via ?admin=1 query param. The admin key is entered in the panel
// and sent with every admin action for server-side validation.

import { getSocket, onState } from "./network";
import type { RoomState, Zone } from "./network";

/** Check if admin mode should be enabled */
export function isAdminMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "1";
}

/** Build and inject the admin panel into the DOM */
export function initAdminPanel() {
  if (!isAdminMode()) return;

  const panel = document.createElement("div");
  panel.id = "admin-panel";
  panel.innerHTML = `
    <style>
      #admin-panel {
        position: fixed;
        top: 40px;
        right: 8px;
        z-index: 100;
        background: rgba(0,0,0,.85);
        backdrop-filter: blur(6px);
        border: 1px solid #e94560;
        border-radius: 10px;
        padding: 14px;
        width: 320px;
        font-size: .85rem;
        color: #eee;
        max-height: 90vh;
        overflow-y: auto;
      }
      #admin-panel h3 {
        margin: 0 0 10px;
        color: #e94560;
        font-size: 1rem;
      }
      #admin-panel label {
        display: block;
        margin: 6px 0 2px;
        font-weight: bold;
        font-size: .8rem;
      }
      #admin-panel input, #admin-panel select, #admin-panel textarea {
        width: 100%;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid #444;
        background: #1a1a2e;
        color: #eee;
        font-size: .85rem;
        margin-bottom: 4px;
      }
      #admin-panel textarea { resize: vertical; min-height: 40px; }
      #admin-panel button {
        width: 100%;
        padding: 8px;
        border-radius: 6px;
        border: none;
        font-weight: bold;
        cursor: pointer;
        margin-top: 6px;
        font-size: .85rem;
        transition: opacity .2s;
      }
      #admin-panel button:hover { opacity: .85; }
      .btn-start { background: #e94560; color: #fff; }
      .btn-reveal { background: #e9a045; color: #000; }
      .btn-reset { background: #0f3460; color: #fff; }
      #admin-status {
        margin-top: 8px;
        padding: 6px;
        border-radius: 6px;
        background: #16213e;
        font-size: .8rem;
        text-align: center;
      }
    </style>
    <h3>Admin Panel</h3>

    <label>Admin Key</label>
    <input type="password" id="admin-key" placeholder="Enter admin key" />

    <label>Question</label>
    <textarea id="admin-q" placeholder="What color is the sky?"></textarea>

    <label>A</label>
    <input id="admin-a" placeholder="Option A" />
    <label>B</label>
    <input id="admin-b" placeholder="Option B" />
    <label>C</label>
    <input id="admin-c" placeholder="Option C" />
    <label>D</label>
    <input id="admin-d" placeholder="Option D" />

    <label>Correct Answer</label>
    <select id="admin-correct">
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
      <option value="D">D</option>
    </select>

    <label>Duration (seconds)</label>
    <input id="admin-duration" type="number" value="15" min="5" max="120" />

    <button class="btn-start" id="admin-start-btn">Start Question</button>
    <button class="btn-reveal" id="admin-reveal-btn">Force Reveal</button>
    <button class="btn-reset" id="admin-reset-btn">Reset Game</button>

    <div id="admin-status">Phase: LOBBY | Players: 0</div>
  `;
  document.body.appendChild(panel);

  // ── Wire up buttons ────────────────────────────────────────────────────

  const getKey = () => (document.getElementById("admin-key") as HTMLInputElement).value;

  document.getElementById("admin-start-btn")!.addEventListener("click", () => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("adminStartQuestion", {
      text: (document.getElementById("admin-q") as HTMLTextAreaElement).value,
      A: (document.getElementById("admin-a") as HTMLInputElement).value,
      B: (document.getElementById("admin-b") as HTMLInputElement).value,
      C: (document.getElementById("admin-c") as HTMLInputElement).value,
      D: (document.getElementById("admin-d") as HTMLInputElement).value,
      correctZone: (document.getElementById("admin-correct") as HTMLSelectElement).value as Zone,
      durationSec: Number((document.getElementById("admin-duration") as HTMLInputElement).value),
      adminKey: getKey(),
    });
  });

  document.getElementById("admin-reveal-btn")!.addEventListener("click", () => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("adminReveal", { adminKey: getKey() });
  });

  document.getElementById("admin-reset-btn")!.addEventListener("click", () => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("adminReset", { adminKey: getKey() });
  });

  // ── Live status ────────────────────────────────────────────────────────

  onState((state: RoomState) => {
    const el = document.getElementById("admin-status");
    if (!el) return;
    const players = Object.values(state.players);
    const alive = players.filter((p) => p.status === "alive").length;
    const dead = players.filter((p) => p.status === "dead").length;
    const ghost = players.filter((p) => p.status === "ghost").length;
    let text = `Phase: ${state.phase.toUpperCase()} | Players: ${players.length} (alive: ${alive}, dead: ${dead}, ghost: ${ghost})`;
    if (state.phase === "inQuestion") {
      text += ` | Time: ${Math.ceil(state.timeRemaining)}s`;
    }
    el.textContent = text;
  });
}
