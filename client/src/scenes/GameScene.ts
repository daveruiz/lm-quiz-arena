// ─── Phaser GameScene: ¾ top-down perspective (SNES Zelda style) ────────────
// Players are drawn with a visible body, head, and ground shadow so you can
// see them "standing" on the map — ready for future push/jump physics.
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONES, ZONE_COLORS } from "../config";
import { onState, getMyId, sendInput } from "../network";
import type { Player, RoomState } from "../network";

// ── Player character dimensions (¾ view) ─────────────────────────────────────
const CHAR = {
  bodyW: 16,       // torso width
  bodyH: 18,       // torso height (visible front)
  headR: 8,        // head radius
  shadowRx: 10,    // shadow ellipse x-radius
  shadowRy: 4,     // shadow ellipse y-radius (squashed)
  /** Total visual height from shadow to top of head */
  totalH: 36,
} as const;

/** Visual representation of a player */
interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  bodyRect: Phaser.GameObjects.Rectangle;
  head: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  /** Lerp targets */
  targetX: number;
  targetY: number;
  /** Track facing direction for subtle visual cue */
  lastDirX: number;
}

const LERP = 0.35;

/** Generate a deterministic hue from a string (for unique player colors) */
function hashColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // Convert HSL to hex (saturation 65%, lightness 55%)
  return Phaser.Display.Color.HSLToColor(hue / 360, 0.65, 0.55).color;
}

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerSprites: Record<string, PlayerSprite> = {};
  private zoneRects: Record<string, Phaser.GameObjects.Rectangle> = {};
  private zoneLabels: Record<string, Phaser.GameObjects.Text> = {};

  private lastSentX = 0;
  private lastSentY = 0;

  private touchInput = { x: 0, y: 0 };
  private touchId: number | null = null;
  private touchOrigin: { x: number; y: number } | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // ── Grass background ─────────────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);

    // Grid lines (subtle SNES tile vibe)
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x3a7d5a, 0.25);
    for (let x = 0; x <= MAP_W; x += 32) {
      g.moveTo(x, 0); g.lineTo(x, MAP_H);
    }
    for (let y = 0; y <= MAP_H; y += 32) {
      g.moveTo(0, y); g.lineTo(MAP_W, y);
    }
    g.strokePath();

    // ── Answer zone platforms (¾ perspective: slight 3D raised look) ─────
    for (const [label, zone] of Object.entries(ZONES)) {
      const color = ZONE_COLORS[label];
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;

      // Platform "side" (gives depth illusion)
      this.add
        .rectangle(cx, cy + 6, zone.w, zone.h, Phaser.Display.Color.ValueToColor(color).darken(40).color, 0.5)
        .setDepth(1);

      // Platform top face
      const rect = this.add
        .rectangle(cx, cy, zone.w, zone.h, color, 0.35)
        .setStrokeStyle(2, color)
        .setDepth(2);
      this.zoneRects[label] = rect;

      // Big letter
      this.add
        .text(cx, cy - 8, label, {
          fontSize: "56px",
          fontFamily: "monospace",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0.35)
        .setDepth(3);
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
        if (dist > 10) {
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

    // ── Server state listener ────────────────────────────────────────────
    onState((state) => this.syncPlayers(state));
  }

  update() {
    const kb = this.getKeyboardInput();
    const x = kb.x !== 0 ? kb.x : this.touchInput.x;
    const y = kb.y !== 0 ? kb.y : this.touchInput.y;

    if (x !== this.lastSentX || y !== this.lastSentY) {
      sendInput(x, y);
      this.lastSentX = x;
      this.lastSentY = y;
    }

    // Lerp containers toward server positions + sort by Y for depth
    for (const sprite of Object.values(this.playerSprites)) {
      const cx = sprite.container.x;
      const cy = sprite.container.y;
      sprite.container.x += (sprite.targetX - cx) * LERP;
      sprite.container.y += (sprite.targetY - cy) * LERP;

      // Depth sort: higher Y = rendered on top (closer to "camera")
      sprite.container.setDepth(100 + Math.round(sprite.container.y));
    }
  }

  // ── Server → Phaser sync ───────────────────────────────────────────────

  private syncPlayers(state: RoomState) {
    const myId = getMyId();

    // Zone highlighting
    for (const [label, rect] of Object.entries(this.zoneRects)) {
      const color = ZONE_COLORS[label];
      if (state.phase === "revealed" && state.question?.correctZone === label) {
        rect.setFillStyle(color, 0.7);
        rect.setStrokeStyle(4, 0xffffff);
      } else if (state.phase === "revealed" && state.question) {
        rect.setFillStyle(color, 0.1);
        rect.setStrokeStyle(2, color);
      } else {
        rect.setFillStyle(color, 0.35);
        rect.setStrokeStyle(2, color);
      }
    }

    // Remove departed
    for (const id of Object.keys(this.playerSprites)) {
      if (!state.players[id]) {
        this.playerSprites[id].container.destroy();
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

      sprite.targetX = player.x;
      sprite.targetY = player.y;

      // Track facing direction
      const dx = player.x - sprite.container.x;
      if (Math.abs(dx) > 0.5) sprite.lastDirX = dx > 0 ? 1 : -1;

      // Apply status visuals
      this.applyStatusVisuals(sprite, player, id === myId);
    }
  }

  /** Apply alive/dead/ghost visual states */
  private applyStatusVisuals(sprite: PlayerSprite, player: Player, isMe: boolean) {
    const baseColor = isMe ? 0xffd700 : hashColor(player.nickname);
    const headColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(25).color;

    if (player.status === "dead") {
      // Dead: greyed out, fallen over look
      sprite.container.setAlpha(0.35);
      sprite.bodyRect.setFillStyle(0x555555);
      sprite.head.setFillStyle(0x777777);
      sprite.shadow.setAlpha(0.1);
    } else if (player.status === "ghost") {
      // Ghost: translucent
      sprite.container.setAlpha(0.4);
      sprite.bodyRect.setFillStyle(baseColor);
      sprite.head.setFillStyle(headColor);
      sprite.shadow.setAlpha(0.15);
    } else {
      // Alive
      sprite.container.setAlpha(1);
      sprite.bodyRect.setFillStyle(baseColor);
      sprite.head.setFillStyle(headColor);
      sprite.shadow.setAlpha(0.35);
    }
  }

  /**
   * Create a ¾ top-down character:
   *   - Ground shadow (ellipse, squashed)
   *   - Body (rounded rectangle / rect with slight taper)
   *   - Head (circle, slightly lighter)
   *   - Nickname label above
   *
   * All parts are in a Container so they move as one unit.
   * Coordinates are relative to the container origin (feet position).
   */
  private createPlayerSprite(player: Player, isMe: boolean): PlayerSprite {
    const baseColor = isMe ? 0xffd700 : hashColor(player.nickname);
    const headColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(25).color;
    const darkColor = Phaser.Display.Color.ValueToColor(baseColor).darken(30).color;

    // Shadow (at feet level, y=0)
    const shadow = this.add.ellipse(0, 2, CHAR.shadowRx * 2, CHAR.shadowRy * 2, 0x000000, 0.35);

    // Body (torso — shifted up from feet)
    const bodyRect = this.add.rectangle(0, -CHAR.bodyH / 2 - 1, CHAR.bodyW, CHAR.bodyH, baseColor);
    bodyRect.setStrokeStyle(1.5, darkColor);

    // Body highlight (small lighter strip to give volume)
    const highlight = this.add.rectangle(
      -CHAR.bodyW / 4, -CHAR.bodyH / 2 - 1,
      CHAR.bodyW / 3, CHAR.bodyH - 4,
      Phaser.Display.Color.ValueToColor(baseColor).lighten(15).color,
      0.4
    );

    // Head (circle above body)
    const headY = -CHAR.bodyH - CHAR.headR + 1;
    const head = this.add.circle(0, headY, CHAR.headR, headColor);
    head.setStrokeStyle(1.5, darkColor);

    // Eyes (two small dots — ¾ view shows them on the front face)
    const eyeY = headY + 1;
    const eyeL = this.add.circle(-3, eyeY, 1.5, 0x222222);
    const eyeR = this.add.circle(3, eyeY, 1.5, 0x222222);

    // Nickname label
    const label = this.add
      .text(0, headY - CHAR.headR - 10, player.nickname, {
        fontSize: "10px",
        fontFamily: "sans-serif",
        color: isMe ? "#ffd700" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5);

    // Me indicator (small arrow above name)
    let meArrow: Phaser.GameObjects.Text | null = null;
    if (isMe) {
      meArrow = this.add
        .text(0, headY - CHAR.headR - 22, "▼", {
          fontSize: "10px",
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5);
    }

    // Assemble container
    const parts: Phaser.GameObjects.GameObject[] = [shadow, bodyRect, highlight, head, eyeL, eyeR, label];
    if (meArrow) parts.push(meArrow);

    const container = this.add.container(player.x, player.y, parts);
    container.setDepth(100 + Math.round(player.y));

    return {
      container,
      shadow,
      bodyRect,
      head,
      label,
      targetX: player.x,
      targetY: player.y,
      lastDirX: 0,
    };
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
