// ─── Phaser GameScene: renders the map, zones, and all players ──────────────
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONES, ZONE_COLORS } from "../config";
import { onState, getMyId, sendInput } from "../network";
import type { Player, RoomState } from "../network";

/** Visual representation of a player on the Phaser canvas */
interface PlayerSprite {
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  /** Server-authoritative target position (we lerp toward this) */
  targetX: number;
  targetY: number;
}

/** Interpolation speed (0–1, higher = snappier) */
const LERP = 0.35;

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerSprites: Record<string, PlayerSprite> = {};

  /** Previous input sent to server (avoid spamming identical packets) */
  private lastSentX = 0;
  private lastSentY = 0;

  /** Mobile virtual joystick state */
  private touchInput = { x: 0, y: 0 };
  private touchId: number | null = null;
  private touchOrigin: { x: number; y: number } | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // ── Grass background ─────────────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);

    // Grid lines for SNES vibe
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x3a7d5a, 0.3);
    for (let x = 0; x <= MAP_W; x += 32) {
      g.moveTo(x, 0); g.lineTo(x, MAP_H);
    }
    for (let y = 0; y <= MAP_H; y += 32) {
      g.moveTo(0, y); g.lineTo(MAP_W, y);
    }
    g.strokePath();

    // ── Answer zones ─────────────────────────────────────────────────────
    for (const [label, zone] of Object.entries(ZONES)) {
      const color = ZONE_COLORS[label];
      this.add
        .rectangle(zone.x + zone.w / 2, zone.y + zone.h / 2, zone.w, zone.h, color, 0.35)
        .setStrokeStyle(3, color)
        .setDepth(1);

      this.add
        .text(zone.x + zone.w / 2, zone.y + zone.h / 2, label, {
          fontSize: "64px",
          fontFamily: "monospace",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setAlpha(0.45)
        .setDepth(2);
    }

    // ── Keyboard input ───────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── Touch / virtual joystick ─────────────────────────────────────────
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.touchId === null) {
        this.touchId = p.pointerId;
        this.touchOrigin = { x: p.x, y: p.y };
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.pointerId === this.touchId && this.touchOrigin) {
        const dx = p.x - this.touchOrigin.x;
        const dy = p.y - this.touchOrigin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const deadzone = 10;
        if (dist > deadzone) {
          this.touchInput.x = Math.max(-1, Math.min(1, dx / 50));
          this.touchInput.y = Math.max(-1, Math.min(1, dy / 50));
        } else {
          this.touchInput.x = 0;
          this.touchInput.y = 0;
        }
      }
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.pointerId === this.touchId) {
        this.touchId = null;
        this.touchOrigin = null;
        this.touchInput.x = 0;
        this.touchInput.y = 0;
      }
    });

    // ── Listen for server state ──────────────────────────────────────────
    onState((state) => this.syncPlayers(state));
  }

  update() {
    const kb = this.getKeyboardInput();
    // Prefer keyboard; fall back to touch
    const x = kb.x !== 0 ? kb.x : this.touchInput.x;
    const y = kb.y !== 0 ? kb.y : this.touchInput.y;

    // Only send if changed (reduce traffic)
    if (x !== this.lastSentX || y !== this.lastSentY) {
      sendInput(x, y);
      this.lastSentX = x;
      this.lastSentY = y;
    }

    // Lerp all player sprites toward their server target positions
    for (const sprite of Object.values(this.playerSprites)) {
      sprite.body.x += (sprite.targetX - sprite.body.x) * LERP;
      sprite.body.y += (sprite.targetY - sprite.body.y) * LERP;
      sprite.label.x = sprite.body.x;
      sprite.label.y = sprite.body.y - 18;
    }
  }

  // ── Server → Phaser sync ───────────────────────────────────────────────

  private syncPlayers(state: RoomState) {
    const myId = getMyId();

    // Remove departed players
    for (const id of Object.keys(this.playerSprites)) {
      if (!state.players[id]) {
        this.playerSprites[id].body.destroy();
        this.playerSprites[id].label.destroy();
        delete this.playerSprites[id];
      }
    }

    // Upsert
    for (const [id, player] of Object.entries(state.players)) {
      let sprite = this.playerSprites[id];

      if (!sprite) {
        sprite = this.createPlayerSprite(player, id === myId);
        this.playerSprites[id] = sprite;
      }

      // Update target (lerped in update())
      sprite.targetX = player.x;
      sprite.targetY = player.y;

      // Status visuals
      if (player.status === "dead") {
        sprite.body.setAlpha(0.3);
        sprite.label.setAlpha(0.3);
        sprite.body.setFillStyle(0x666666);
      } else if (player.status === "ghost") {
        sprite.body.setAlpha(0.4);
        sprite.label.setAlpha(0.4);
        sprite.body.setFillStyle(0xaaaaaa);
      } else {
        sprite.body.setAlpha(1);
        sprite.label.setAlpha(1);
        sprite.body.setFillStyle(id === myId ? 0xffd700 : 0xffffff);
      }
    }
  }

  private createPlayerSprite(player: Player, isMe: boolean): PlayerSprite {
    const color = isMe ? 0xffd700 : 0xffffff;
    const body = this.add.circle(player.x, player.y, 10, color).setDepth(10);
    if (isMe) body.setStrokeStyle(2, 0xffa500);

    const label = this.add
      .text(player.x, player.y - 18, player.nickname, {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: isMe ? "#ffd700" : "#ffffff",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(11);

    return { body, label, targetX: player.x, targetY: player.y };
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  private getKeyboardInput(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) y += 1;
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len; y /= len;
    }
    return { x, y };
  }
}
