// ─── Phaser GameScene: renders the map, zones, and players ──────────────────
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONES, ZONE_COLORS } from "../config";

export class GameScene extends Phaser.Scene {
  /** Keyboard cursor keys */
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  /** WASD keys */
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // ── Draw the grass background ────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);

    // ── Draw answer zones ────────────────────────────────────────────────
    for (const [label, zone] of Object.entries(ZONES)) {
      const color = ZONE_COLORS[label];
      const rect = this.add
        .rectangle(zone.x + zone.w / 2, zone.y + zone.h / 2, zone.w, zone.h, color, 0.35)
        .setStrokeStyle(2, color)
        .setDepth(1);

      // Zone label
      this.add
        .text(zone.x + zone.w / 2, zone.y + zone.h / 2, label, {
          fontSize: "64px",
          fontFamily: "monospace",
          color: "#ffffff",
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0.5)
        .setDepth(2);
    }

    // ── Input setup ──────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  /** Returns the current input vector { x, y } normalized to -1..1 */
  getInputVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) y += 1;

    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }

    return { x, y };
  }
}
