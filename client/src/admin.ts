// ─── Admin panel ─────────────────────────────────────────────────────────────
import { getSocket, onState } from "./network";
import type { RoomState, Zone } from "./network";
import defaultQuestions from "./questions.json";

// ── Question-bank types & persistence ────────────────────────────────────────
interface Question {
  text: string;
  A: string; B: string; C: string; D: string;
  correctZone: Zone;
}

const STORAGE_KEY = "quiz-arena-questions";

function loadBank(): Question[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Question[];
  } catch { /* ignore corrupt data */ }
  // First run: seed from JSON and persist
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultQuestions));
  return defaultQuestions as Question[];
}

function saveBank(qs: Question[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(qs));
}

// ─────────────────────────────────────────────────────────────────────────────

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
        font-size: .85rem; margin-bottom: 4px; box-sizing: border-box;
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
      /* Question bank nav */
      .q-nav {
        display: flex; align-items: center; gap: 5px; margin-bottom: 8px;
      }
      .q-nav .btn-arrow {
        background: #333; color: #fff; padding: 5px 10px;
        font-size: 1rem; margin-top: 0; flex-shrink: 0;
      }
      .q-nav .btn-arrow:disabled { opacity: .3; cursor: default; }
      .q-nav .q-counter {
        flex: 1; text-align: center; font-size: .8rem; color: #888;
      }
      .q-nav .btn-add { background: #2d6a4f; color: #fff; padding: 5px 9px; margin-top: 0; }
      .q-nav .btn-del { background: #555;    color: #fff; padding: 5px 9px; margin-top: 0; }
      #admin-status {
        margin-top: 8px; padding: 6px; border-radius: 6px;
        background: #16213e; font-size: .78rem; text-align: center; line-height: 1.5;
      }
    </style>

    <h3>⚙ Admin Panel</h3>

    <label>Admin Key <span style="font-weight:normal;color:#666">(default: <code style="color:#aaa">secret</code>)</span></label>
    <input type="password" id="admin-key" placeholder="secret" value="secret" />

    <!-- ── Question bank + form (unified) ─────── -->
    <h4>📋 Question</h4>
    <div class="q-nav">
      <button class="btn-arrow" id="btn-prev-q" title="Previous question">◀</button>
      <span class="q-counter" id="q-counter">— / —</span>
      <button class="btn-arrow" id="btn-next-q" title="Next question">▶</button>
      <button class="btn-add"  id="btn-add-q"  title="Add new question">＋</button>
      <button class="btn-del"  id="btn-del-q"  title="Delete this question">🗑</button>
    </div>

    <label>Question text</label>
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
  const getKey = () => (document.getElementById("admin-key") as HTMLInputElement).value;
  const val    = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  // ── Form element refs ────────────────────────────────────────────────────
  const fQ       = document.getElementById("admin-q")       as HTMLTextAreaElement;
  const fA       = document.getElementById("admin-a")       as HTMLInputElement;
  const fB       = document.getElementById("admin-b")       as HTMLInputElement;
  const fC       = document.getElementById("admin-c")       as HTMLInputElement;
  const fD       = document.getElementById("admin-d")       as HTMLInputElement;
  const fCorrect = document.getElementById("admin-correct") as HTMLSelectElement;
  const qCounter = document.getElementById("q-counter")!;
  const btnPrev  = document.getElementById("btn-prev-q")  as HTMLButtonElement;
  const btnNext  = document.getElementById("btn-next-q")  as HTMLButtonElement;
  const btnAdd   = document.getElementById("btn-add-q")   as HTMLButtonElement;
  const btnDel   = document.getElementById("btn-del-q")   as HTMLButtonElement;

  // ── Bank state ───────────────────────────────────────────────────────────
  let bank: Question[] = loadBank();
  let idx  = 0;

  /** Read the form into bank[idx] and persist */
  function saveCurrentToBank() {
    if (bank.length === 0) return;
    bank[idx] = {
      text: fQ.value,
      A: fA.value, B: fB.value, C: fC.value, D: fD.value,
      correctZone: fCorrect.value as Zone,
    };
    saveBank(bank);
  }

  /** Load bank[idx] into the form */
  function loadFromBank() {
    if (bank.length === 0) {
      fQ.value = ""; fA.value = ""; fB.value = ""; fC.value = ""; fD.value = "";
      fCorrect.value = "A";
      return;
    }
    const q = bank[idx];
    fQ.value = q.text;
    fA.value = q.A; fB.value = q.B; fC.value = q.C; fD.value = q.D;
    fCorrect.value = q.correctZone;
  }

  /** Update nav buttons and counter */
  function renderNav() {
    const n = bank.length;
    qCounter.textContent = n === 0 ? "— / —" : `${idx + 1} / ${n}`;
    btnPrev.disabled = n <= 1;
    btnNext.disabled = n <= 1;
    btnDel.disabled  = n === 0;
  }

  // ── Initial load ─────────────────────────────────────────────────────────
  loadFromBank();
  renderNav();

  // ── Auto-save: any edit to the form immediately persists ─────────────────
  // We debounce slightly so rapid typing doesn't hammer localStorage.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrentToBank, 300);
  };
  [fQ, fA, fB, fC, fD, fCorrect].forEach((el) =>
    el.addEventListener("input", scheduleSave),
  );
  // select fires "change" not "input"
  fCorrect.addEventListener("change", scheduleSave);

  // ── Navigation ───────────────────────────────────────────────────────────
  btnPrev.addEventListener("click", () => {
    if (bank.length === 0) return;
    saveCurrentToBank();
    idx = (idx - 1 + bank.length) % bank.length;
    loadFromBank();
    renderNav();
  });

  btnNext.addEventListener("click", () => {
    if (bank.length === 0) return;
    saveCurrentToBank();
    idx = (idx + 1) % bank.length;
    loadFromBank();
    renderNav();
  });

  // ── Add blank question ───────────────────────────────────────────────────
  btnAdd.addEventListener("click", () => {
    saveCurrentToBank(); // save whatever's in form first
    const blank: Question = { text: "", A: "", B: "", C: "", D: "", correctZone: "A" };
    bank.push(blank);
    idx = bank.length - 1;
    saveBank(bank);
    loadFromBank();
    renderNav();
    fQ.focus();
  });

  // ── Delete current question ──────────────────────────────────────────────
  btnDel.addEventListener("click", () => {
    if (bank.length === 0) return;
    bank.splice(idx, 1);
    if (idx >= bank.length) idx = Math.max(0, bank.length - 1);
    saveBank(bank);
    loadFromBank();
    renderNav();
  });

  // ── Start question ────────────────────────────────────────────────────────
  document.getElementById("admin-start-btn")!.addEventListener("click", () => {
    const socket = getSocket();
    if (!socket) return;
    saveCurrentToBank(); // ensure latest edits are in bank
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

  // ── Quick-fire test buttons ───────────────────────────────────────────────
  const ZONE_NAMES: Record<Zone, string> = {
    A: "Red zone", B: "Blue zone", C: "Orange zone", D: "Green zone",
  };
  const DUMMY_OPTIONS: Record<Zone, string> = {
    A: "Answer A", B: "Answer B", C: "Answer C", D: "Answer D",
  };

  document.querySelectorAll<HTMLButtonElement>(".btn-qa[data-zone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const zone = btn.dataset.zone as Zone;
      const socket = getSocket();
      if (!socket) return;
      document.querySelectorAll(".btn-qa").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      setTimeout(() => btn.classList.remove("selected"), 600);
      socket.emit("adminStartQuestion", {
        text: `[TEST] Move to the ${ZONE_NAMES[zone]} zone!`,
        A: DUMMY_OPTIONS.A, B: DUMMY_OPTIONS.B,
        C: DUMMY_OPTIONS.C, D: DUMMY_OPTIONS.D,
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
