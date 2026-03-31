// ─── Admin panel ─────────────────────────────────────────────────────────────
import { getSocket, onState } from "./network";
import type { RoomState, Zone } from "./network";

export function isAdminMode(): boolean {
  return new URLSearchParams(window.location.search).get("admin") === "1";
}

export function initAdminPanel() {
  if (!isAdminMode()) return;

  const panel = document.createElement("div");
  panel.id = "admin-panel";
  panel.innerHTML = `
    <style>
      #admin-panel {
        position: fixed;
        top: 40px; right: 8px;
        z-index: 100;
        background: rgba(0,0,0,.88);
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
      #admin-panel h3 { margin: 0 0 8px; color: #e94560; font-size: 1rem; }
      #admin-panel h4 { margin: 10px 0 6px; color: #aaa; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; border-top: 1px solid #333; padding-top: 8px; }
      #admin-panel label { display: block; margin: 6px 0 2px; font-weight: bold; font-size: .78rem; color: #ccc; }
      #admin-panel input, #admin-panel select, #admin-panel textarea {
        width: 100%; padding: 6px 8px; border-radius: 6px;
        border: 1px solid #444; background: #1a1a2e; color: #eee;
        font-size: .85rem; margin-bottom: 4px;
      }
      #admin-panel textarea { resize: vertical; min-height: 40px; }
      #admin-panel button {
        padding: 8px; border-radius: 6px; border: none;
        font-weight: bold; cursor: pointer; font-size: .85rem;
        transition: opacity .2s; margin-top: 4px;
      }
      #admin-panel button:hover { opacity: .82; }
      #admin-panel button:active { opacity: .65; }
      .btn-full { width: 100%; }
      .btn-start  { background: #e94560; color: #fff; }
      .btn-reveal { background: #e9a045; color: #000; }
      .btn-reset  { background: #0f3460; color: #fff; }
      /* Quick-answer row */
      .quick-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px; margin-top: 4px; }
      .btn-qa { color: #fff; font-size: 1rem; padding: 10px 0; border-radius: 6px; }
      .btn-qa-A { background: #e94560; }
      .btn-qa-B { background: #0f3460; }
      .btn-qa-C { background: #e9a045; color: #000; }
      .btn-qa-D { background: #16c79a; }
      .btn-qa.selected { outline: 3px solid #fff; }
      #admin-status {
        margin-top: 8px; padding: 6px; border-radius: 6px;
        background: #16213e; font-size: .78rem; text-align: center; line-height: 1.5;
      }
    </style>

    <h3>⚙ Admin Panel</h3>

    <label>Admin Key <span style="font-weight:normal;color:#666">(default: <code style="color:#aaa">secret</code> — set <code style="color:#aaa">ADMIN_KEY</code> env var to change)</span></label>
    <input type="password" id="admin-key" placeholder="secret" value="secret" />

    <!-- ── Full question form ──────────────────────── -->
    <h4>Question</h4>
    <textarea id="admin-q" placeholder="e.g. What color is the sky?"></textarea>
    <label>A</label><input id="admin-a" placeholder="Option A" />
    <label>B</label><input id="admin-b" placeholder="Option B" />
    <label>C</label><input id="admin-c" placeholder="Option C" />
    <label>D</label><input id="admin-d" placeholder="Option D" />

    <label>Duration (seconds)</label>
    <input id="admin-duration" type="number" value="15" min="5" max="120" />

    <label>Correct Answer</label>
    <select id="admin-correct">
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
      <option value="D">D</option>
    </select>

    <button class="btn-start btn-full" id="admin-start-btn">▶ Start Question</button>
    <button class="btn-reveal btn-full" id="admin-reveal-btn">✓ Force Reveal</button>
    <button class="btn-reset btn-full" id="admin-reset-btn">↺ Reset Game</button>

    <!-- ── Dev: quick correct-answer picker ───────── -->
    <h4>🧪 Dev: quick-fire test</h4>
    <div style="font-size:.75rem;color:#888;margin-bottom:4px">
      Fills a dummy question and sets the correct answer.<br>
      Click a zone to instantly launch it.
    </div>
    <div class="quick-row">
      <button class="btn-qa btn-qa-A" data-zone="A">A</button>
      <button class="btn-qa btn-qa-B" data-zone="B">B</button>
      <button class="btn-qa btn-qa-C" data-zone="C">C</button>
      <button class="btn-qa btn-qa-D" data-zone="D">D</button>
    </div>

    <div id="admin-status">Phase: LOBBY | Players: 0</div>
  `;
  document.body.appendChild(panel);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getKey  = () => (document.getElementById("admin-key") as HTMLInputElement).value;
  const val     = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  // ── Start question ────────────────────────────────────────────────────────
  document.getElementById("admin-start-btn")!.addEventListener("click", () => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("adminStartQuestion", {
      text: val("admin-q"),
      A: val("admin-a"), B: val("admin-b"),
      C: val("admin-c"), D: val("admin-d"),
      correctZone: val("admin-correct") as Zone,
      durationSec: Number(val("admin-duration")),
      adminKey: getKey(),
    });
  });

  // ── Reveal / Reset ────────────────────────────────────────────────────────
  document.getElementById("admin-reveal-btn")!.addEventListener("click", () => {
    getSocket()?.emit("adminReveal", { adminKey: getKey() });
  });

  document.getElementById("admin-reset-btn")!.addEventListener("click", () => {
    getSocket()?.emit("adminReset", { adminKey: getKey() });
  });

  // ── Quick-fire test buttons ────────────────────────────────────────────────
  // Each button fires a dummy question where that zone is the correct answer.
  const ZONE_NAMES: Record<Zone, string> = {
    A: "Red zone",
    B: "Blue zone",
    C: "Orange zone",
    D: "Green zone",
  };
  const DUMMY_OPTIONS: Record<Zone, string> = {
    A: "Answer A",
    B: "Answer B",
    C: "Answer C",
    D: "Answer D",
  };

  document.querySelectorAll<HTMLButtonElement>(".btn-qa[data-zone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const zone = btn.dataset.zone as Zone;
      const socket = getSocket();
      if (!socket) return;

      // Highlight selected
      document.querySelectorAll(".btn-qa").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      setTimeout(() => btn.classList.remove("selected"), 600);

      socket.emit("adminStartQuestion", {
        text: `[TEST] Move to the ${ZONE_NAMES[zone]} zone!`,
        A: DUMMY_OPTIONS.A,
        B: DUMMY_OPTIONS.B,
        C: DUMMY_OPTIONS.C,
        D: DUMMY_OPTIONS.D,
        correctZone: zone,
        durationSec: Number(val("admin-duration")),
        adminKey: getKey(),
      });
    });
  });

  // ── Live status ───────────────────────────────────────────────────────────
  onState((state: RoomState) => {
    const el = document.getElementById("admin-status");
    if (!el) return;
    const players = Object.values(state.players);
    const alive  = players.filter((p) => p.status === "alive").length;
    const dead   = players.filter((p) => p.status === "dead").length;
    const ghost  = players.filter((p) => p.status === "ghost").length;
    let text = `Phase: <b>${state.phase.toUpperCase()}</b> · ${players.length} players`;
    text += `<br>✅ ${alive} alive · ☠️ ${dead} dead · 👻 ${ghost} ghost`;
    if (state.phase === "inQuestion") text += `<br>⏱ ${Math.ceil(state.timeRemaining)}s remaining`;
    el.innerHTML = text;
  });
}
