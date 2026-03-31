// ─── Phaser GameScene: renders the map, zones, and all players ──────────────
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONES, ZONE_COLORS } from "../config";
import { onState, getMyId, sendInput, getLatestState } from "../network";
import type { Player, RoomState } from "../network";

/** Visual representation of a player on the Phaser canvas */
interface PlayerSprite {
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerSprites: Record<string, PlayerSprite> = {};

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // ── Draw the grass background ────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);

    // ── Draw answer zones ────────────────────────────────────────────────
    for (const [label, zone] of Object.entries(ZONES)) {
      const color = ZONE_COLORS[label];
      this.add
        .rectangle(zone.x + zone.w / 2, zone.y + zone.h / 2, zone.w, zone.h, color, 0.35)
        .setStrokeStyle(2, color)
        .setDepth(1);

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

    // ── Input ────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── Listen for state updates from the server ─────────────────────────
    onState((state) => this.syncPlayers(state));
  }

  update() {
    // Read input and send to server every frame
    const input = this.getInputVector();
    sendInput(input.x, input.y);
  }

  // ── Sync player sprites with server state ──────────────────────────────

  private syncPlayers(state: RoomState) {
    const serverPlayers = state.players;
    const myId = getMyId();

    // Remove sprites for players that left
    for (const id of Object.keys(this.playerSprites)) {
      if (!serverPlayers[id]) {
        this.playerSprites[id].body.destroy();
        this.playerSprites[id].label.destroy();
        delete this.playerSprites[id];
      }
    }

    // Create or update sprites
    for (const [id, player] of Object.entries(serverPlayers)) {
      let sprite = this.playerSprites[id];

      if (!sprite) {
        sprite = this.createPlayerSprite(player, id === myId);
        this.playerSprites[id] = sprite;
      }

      // Update position
      sprite.body.setPosition(player.x, player.y);
      sprite.label.setPosition(player.x, player.y - 18);

      // Update appearance based on status
      if (player.status === "dead") {
        sprite.body.setAlpha(0.3);
        sprite.label.setAlpha(0.3);
        sprite.body.setFillStyle(0x666666);
      } else if (player.status === "ghost") {
        sprite.body.setAlpha(0.4);
        sprite.label.setAlpha(0.4);
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
    const label = this.add
      .text(player.x, player.y - 18, player.nickname, {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: isMe ? "#ffd700" : "#ffffff",
        align: "center",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(11);

    return { body, label };
  }

  // ── Input reading ──────────────────────────────────────────────────────

  private getInputVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) y += 1;

    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }

    return { x, y };
  }
}
