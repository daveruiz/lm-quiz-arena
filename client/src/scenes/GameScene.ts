// ─── Phaser GameScene ────────────────────────────────────────────────────────
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONES, ZONE_COLORS } from "../config";
import { onState, getMyId, sendInput } from "../network";
import type { Player, RoomState, RoomPhase } from "../network";
import * as sfx from "../audio";

// ── Character dimensions ─────────────────────────────────────────────────────
const CHAR = {
  bodyW: 16,
  bodyH: 18,
  headR: 8,
  shadowRx: 10,
  shadowRy: 4,
};

/** Eye positions per facing: 0=down, 1=left, 2=up, 3=right */
const EYE_POSITIONS: Record<number, { lx: number; ly: number; rx: number; ry: number; size: number }> = {
  0: { lx: -3, ly: 1,  rx: 3,  ry: 1,  size: 1.5 },
  1: { lx: -5, ly: 0,  rx: -2, ry: 0,  size: 1.3 },
  2: { lx: -2, ly: -2, rx: 2,  ry: -2, size: 0.8 },
  3: { lx: 2,  ly: 0,  rx: 5,  ry: 0,  size: 1.3 },
};

interface PlayerSprite {
  bodyGroup: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  root: Phaser.GameObjects.Container;
  bodyRect: Phaser.GameObjects.Rectangle;
  head: Phaser.GameObjects.Arc;
  highlight: Phaser.GameObjects.Rectangle;
  eyeL: Phaser.GameObjects.Arc;
  eyeR: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  currentFacing: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  visualZ: number;
  wasAirborne: boolean;
  squashTimer: number;
  stompReactTimer: number;
  bumpReactTimer: number;
  starsEffect: Phaser.GameObjects.Container | null;
  bumpEffect: Phaser.GameObjects.Text | null;
}

const LERP = 0.35;
const Z_LERP = 0.5;

// ── Virtual joystick constants ────────────────────────────────────────────────
const JOY_BASE_R = 45;
const JOY_STICK_R = 20;
const JOY_MAX_DIST = 35;
const JOY_X = 80;   // from left edge of canvas
const JOY_Y_OFF = 80; // from bottom edge
const JUMP_BTN_R = 28;
const JUMP_BTN_X_OFF = 80; // from right edge
const JUMP_BTN_Y_OFF = 80; // from bottom edge

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private playerSprites: Record<string, PlayerSprite> = {};
  private zoneRects: Record<string, Phaser.GameObjects.Rectangle> = {};
  /** Zone letters – hidden in lobby */
  private zoneLabels: Phaser.GameObjects.Text[] = [];

  private lastSentX = 0;
  private lastSentY = 0;

  // ── Touch joystick state ──────────────────────────────────────────────────
  private joyActive = false;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyDelta = { x: 0, y: 0 };
  private touchJump = false;
  private jumpBtnId: number | null = null;

  // ── Joystick graphics ────────────────────────────────────────────────────
  private joyBase!: Phaser.GameObjects.Arc;
  private joyStick!: Phaser.GameObjects.Arc;
  private jumpBtn!: Phaser.GameObjects.Arc;
  private jumpBtnLabel!: Phaser.GameObjects.Text;

  private prevPhase: RoomPhase = "lobby";
  private prevAlive: Set<string> = new Set();

  // keyboard event cleanup ref
  private keydownHandler!: (e: KeyboardEvent) => void;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // ── Fix Phaser keyboard capture ──────────────────────────────────────
    // Phaser calls preventDefault() on all key events globally, which breaks
    // typing in form inputs. We disable that and handle it ourselves.
    this.input.keyboard!.disableGlobalCapture();

    // Manually prevent default only for game keys when no form is focused
    const GAME_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "KeyW", "KeyA", "KeyS", "KeyD",
    ]);
    this.keydownHandler = (e: KeyboardEvent) => {
      if (this.isTypingInForm()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    };
    window.addEventListener("keydown", this.keydownHandler, { capture: true });

    // ── Grass background ─────────────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x3a7d5a, 0.25);
    for (let x = 0; x <= MAP_W; x += 32) { g.moveTo(x, 0); g.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 32) { g.moveTo(0, y); g.lineTo(MAP_W, y); }
    g.strokePath();

    // ── Answer zone platforms ────────────────────────────────────────────
    for (const [label, zone] of Object.entries(ZONES)) {
      const color = ZONE_COLORS[label];
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;

      this.add.rectangle(cx, cy + 6, zone.w, zone.h,
        Phaser.Display.Color.ValueToColor(color).darken(40).color, 0.5,
      ).setDepth(1);

      const rect = this.add
        .rectangle(cx, cy, zone.w, zone.h, color, 0.35)
        .setStrokeStyle(2, color)
        .setDepth(2);
      this.zoneRects[label] = rect;

      const lbl = this.add.text(cx, cy - 8, label, {
        fontSize: "56px", fontFamily: "monospace",
        color: "#ffffff", fontStyle: "bold",
      }).setOrigin(0.5).setAlpha(0.35).setDepth(3).setVisible(false);
      this.zoneLabels.push(lbl);
    }

    // ── Keyboard input ───────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // ── Virtual joystick visuals ─────────────────────────────────────────
    const joyY = MAP_H - JOY_Y_OFF;
    this.joyBase = this.add.circle(JOY_X, joyY, JOY_BASE_R, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setDepth(200)
      .setScrollFactor(0);
    this.joyStick = this.add.circle(JOY_X, joyY, JOY_STICK_R, 0xffffff, 0.45)
      .setDepth(201)
      .setScrollFactor(0);

    const jumpX = MAP_W - JUMP_BTN_X_OFF;
    const jumpY = MAP_H - JUMP_BTN_Y_OFF;
    this.jumpBtn = this.add.circle(jumpX, jumpY, JUMP_BTN_R, 0xffd700, 0.4)
      .setStrokeStyle(2, 0xffd700, 0.7)
      .setDepth(200)
      .setScrollFactor(0);
    this.jumpBtnLabel = this.add.text(jumpX, jumpY, "▲", {
      fontSize: "18px", color: "#ffffff",
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    // ── Touch input ──────────────────────────────────────────────────────
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const jumpX = MAP_W - JUMP_BTN_X_OFF;
      const jumpY = MAP_H - JUMP_BTN_Y_OFF;
      const dj = Math.hypot(p.x - jumpX, p.y - jumpY);

      if (dj <= JUMP_BTN_R + 10 && this.jumpBtnId === null) {
        // Hit the jump button
        this.jumpBtnId = p.pointerId;
        this.touchJump = true;
        this.jumpBtn.setFillStyle(0xffd700, 0.75);
      } else if (this.joyId === null) {
        // Start joystick anywhere else
        this.joyId = p.pointerId;
        this.joyOrigin = { x: p.x, y: p.y };
        // Snap base to touch point
        this.joyBase.setPosition(p.x, p.y);
        this.joyStick.setPosition(p.x, p.y);
        this.joyActive = true;
      }
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.pointerId !== this.joyId || !this.joyActive) return;
      const dx = p.x - this.joyOrigin.x;
      const dy = p.y - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_MAX_DIST);
      const angle = Math.atan2(dy, dx);
      const sx = this.joyOrigin.x + Math.cos(angle) * clamped;
      const sy = this.joyOrigin.y + Math.sin(angle) * clamped;
      this.joyStick.setPosition(sx, sy);
      this.joyDelta.x = dist > 8 ? (dx / dist) : 0;
      this.joyDelta.y = dist > 8 ? (dy / dist) : 0;
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.pointerId === this.joyId) {
        this.joyId = null;
        this.joyActive = false;
        this.joyDelta = { x: 0, y: 0 };
        // Reset visuals to default position
        this.joyBase.setPosition(JOY_X, MAP_H - JOY_Y_OFF);
        this.joyStick.setPosition(JOY_X, MAP_H - JOY_Y_OFF);
      }
      if (p.pointerId === this.jumpBtnId) {
        this.jumpBtnId = null;
        this.jumpBtn.setFillStyle(0xffd700, 0.4);
      }
    });

    onState((state) => this.syncPlayers(state));

    // clean up listener when scene shuts down
    this.events.on("shutdown", () => {
      window.removeEventListener("keydown", this.keydownHandler, { capture: true } as EventListenerOptions);
    });
  }

  private isTypingInForm(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
  }

  update(_time: number, delta: number) {
    const formFocused = this.isTypingInForm();

    const kb = formFocused ? { x: 0, y: 0 } : this.getKeyboardInput();

    // Keyboard takes priority over joystick
    const x = kb.x !== 0 ? kb.x : this.joyDelta.x;
    const y = kb.y !== 0 ? kb.y : this.joyDelta.y;
    const jump = !formFocused && (Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.touchJump);
    this.touchJump = false;

    if (jump) sfx.sfxJump();

    if (x !== this.lastSentX || y !== this.lastSentY || jump) {
      sendInput(x, y, jump);
      this.lastSentX = x;
      this.lastSentY = y;
    }

    const dt = delta / 1000;
    for (const sprite of Object.values(this.playerSprites)) {
      sprite.root.x += (sprite.targetX - sprite.root.x) * LERP;
      sprite.root.y += (sprite.targetY - sprite.root.y) * LERP;

      sprite.visualZ += (sprite.targetZ - sprite.visualZ) * Z_LERP;
      const isAirborne = sprite.visualZ > 1;
      sprite.bodyGroup.y = -sprite.visualZ;

      const shadowScale = Math.max(0.4, 1 - sprite.visualZ / 60);
      sprite.shadow.setScale(shadowScale, shadowScale * 0.7);
      sprite.shadow.setAlpha(0.3 * shadowScale);

      // Squash & stretch
      if (sprite.wasAirborne && !isAirborne && sprite.squashTimer <= 0) {
        sprite.squashTimer = 0.15;
        sfx.sfxLand();
      }
      sprite.wasAirborne = isAirborne;

      if (sprite.squashTimer > 0) {
        sprite.squashTimer -= dt;
        const t = sprite.squashTimer / 0.15;
        sprite.bodyGroup.setScale(1 + t * 0.25, 1 - t * 0.2);
      } else if (isAirborne && sprite.targetZ > 5) {
        sprite.bodyGroup.setScale(0.9, 1.1);
      } else {
        sprite.bodyGroup.setScale(1, 1);
      }

      // Facing eyes
      this.updateEyes(sprite);

      // Stomp reaction
      if (sprite.stompReactTimer > 0) {
        sprite.stompReactTimer -= dt;
        const t = Math.max(0, sprite.stompReactTimer);
        const flatness = Math.min(1, t * 4);
        sprite.bodyGroup.setScale(1 + flatness * 0.4, 1 - flatness * 0.35);
        sprite.bodyGroup.x = Math.sin(t * 30) * 2 * flatness;
        if (sprite.starsEffect) {
          sprite.starsEffect.setVisible(true);
          sprite.starsEffect.setAlpha(flatness);
          sprite.starsEffect.rotation += dt * 4;
          sprite.starsEffect.y = -sprite.visualZ - CHAR.bodyH - CHAR.headR * 2 - 14;
        }
        if (t <= 0) {
          sprite.bodyGroup.x = 0;
          sprite.starsEffect?.setVisible(false);
        }
      }

      // Bump reaction
      if (sprite.bumpReactTimer > 0) {
        sprite.bumpReactTimer -= dt;
        const t = Math.max(0, sprite.bumpReactTimer);
        sprite.bodyGroup.x = Math.sin(t * 50) * 3 * (t / 0.3);
        if (sprite.bumpEffect) {
          sprite.bumpEffect.setVisible(true);
          sprite.bumpEffect.setAlpha(Math.min(1, t * 5));
          sprite.bumpEffect.y = -sprite.visualZ - CHAR.bodyH - CHAR.headR * 2 - 14;
        }
        if (t <= 0) {
          sprite.bodyGroup.x = 0;
          sprite.bumpEffect?.setVisible(false);
        }
      }

      sprite.root.setDepth(100 + Math.round(sprite.root.y));
    }
  }

  private updateEyes(sprite: PlayerSprite) {
    const headY = -CHAR.bodyH - CHAR.headR + 1;
    const target = EYE_POSITIONS[sprite.currentFacing] ?? EYE_POSITIONS[0];
    const s = 0.25;
    sprite.eyeL.x += (target.lx - sprite.eyeL.x) * s;
    sprite.eyeL.y += (headY + target.ly - sprite.eyeL.y) * s;
    sprite.eyeR.x += (target.rx - sprite.eyeR.x) * s;
    sprite.eyeR.y += (headY + target.ry - sprite.eyeR.y) * s;
    const cs = sprite.eyeL.scaleX;
    const ns = cs + (target.size / 1.5 - cs) * s;
    sprite.eyeL.setScale(ns);
    sprite.eyeR.setScale(ns);
  }

  // ── Sync ────────────────────────────────────────────────────────────────

  private syncPlayers(state: RoomState) {
    const myId = getMyId();

    // Phase sounds
    if (state.phase !== this.prevPhase) {
      if (state.phase === "inQuestion") sfx.sfxQuestionStart();
      if (state.phase === "revealed")   sfx.sfxReveal();
      if (state.phase === "lobby" && this.prevPhase !== "lobby") sfx.sfxReset();
      this.prevPhase = state.phase;
    }

    // Show zone labels only when a question is active or revealed
    const showLabels = state.phase === "inQuestion" || state.phase === "revealed";
    for (const lbl of this.zoneLabels) lbl.setVisible(showLabels);

    // Zone highlight
    for (const [label, rect] of Object.entries(this.zoneRects)) {
      const color = ZONE_COLORS[label];
      if (state.phase === "revealed" && state.question?.correctZone === label) {
        rect.setFillStyle(color, 0.7); rect.setStrokeStyle(4, 0xffffff);
      } else if (state.phase === "revealed" && state.question) {
        rect.setFillStyle(color, 0.1); rect.setStrokeStyle(2, color);
      } else {
        rect.setFillStyle(color, 0.35); rect.setStrokeStyle(2, color);
      }
    }

    // Death sounds
    const currentAlive = new Set<string>();
    for (const [id, p] of Object.entries(state.players)) {
      if (p.status === "alive") currentAlive.add(id);
      if (this.prevAlive.has(id) && p.status === "dead") sfx.sfxDeath();
    }
    this.prevAlive = currentAlive;

    // Remove departed
    for (const id of Object.keys(this.playerSprites)) {
      if (!state.players[id]) {
        this.playerSprites[id].root.destroy();
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
      sprite.targetZ = player.z;
      sprite.currentFacing = player.facing;

      if (player.stompedTimer > 8 && sprite.stompReactTimer <= 0) {
        sprite.stompReactTimer = 0.5;
        sfx.sfxStomp();
      }
      if (player.bumpedTimer > 4 && sprite.bumpReactTimer <= 0 && sprite.stompReactTimer <= 0) {
        sprite.bumpReactTimer = 0.3;
        sfx.sfxBump();
      }

      this.applyVisuals(sprite, player, id === myId);
    }
  }

  private applyVisuals(sprite: PlayerSprite, player: Player, isMe: boolean) {
    const baseColor = isMe ? 0xffd700 : player.color;
    const headColor  = Phaser.Display.Color.ValueToColor(baseColor).lighten(25).color;
    const darkColor  = Phaser.Display.Color.ValueToColor(baseColor).darken(30).color;
    const hlColor    = Phaser.Display.Color.ValueToColor(baseColor).lighten(15).color;

    if (player.status === "dead") {
      sprite.bodyRect.setFillStyle(0x555555).setStrokeStyle(1.5, 0x333333);
      sprite.head.setFillStyle(0x777777).setStrokeStyle(1.5, 0x333333);
      sprite.highlight.setFillStyle(0x666666, 0.4);
      sprite.root.setAlpha(0.35);
    } else {
      sprite.bodyRect.setFillStyle(baseColor).setStrokeStyle(1.5, darkColor);
      sprite.head.setFillStyle(headColor).setStrokeStyle(1.5, darkColor);
      sprite.highlight.setFillStyle(hlColor, 0.4);
      sprite.root.setAlpha(player.status === "ghost" ? 0.4 : 1);
    }
  }

  private createPlayerSprite(player: Player, isMe: boolean): PlayerSprite {
    const baseColor = isMe ? 0xffd700 : player.color;
    const headColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(25).color;
    const darkColor = Phaser.Display.Color.ValueToColor(baseColor).darken(30).color;
    const hlColor   = Phaser.Display.Color.ValueToColor(baseColor).lighten(15).color;

    const shadow = this.add.ellipse(0, 2, CHAR.shadowRx * 2, CHAR.shadowRy * 2, 0x000000, 0.3);

    const bodyRect = this.add.rectangle(0, -CHAR.bodyH / 2 - 1, CHAR.bodyW, CHAR.bodyH, baseColor);
    bodyRect.setStrokeStyle(1.5, darkColor);
    const highlight = this.add.rectangle(
      -CHAR.bodyW / 4, -CHAR.bodyH / 2 - 1, CHAR.bodyW / 3, CHAR.bodyH - 4, hlColor, 0.4,
    );

    const headY = -CHAR.bodyH - CHAR.headR + 1;
    const head = this.add.circle(0, headY, CHAR.headR, headColor);
    head.setStrokeStyle(1.5, darkColor);

    const eyeL = this.add.circle(-3, headY + 1, 1.5, 0x222222);
    const eyeR = this.add.circle(3,  headY + 1, 1.5, 0x222222);

    const label = this.add.text(0, headY - CHAR.headR - 10, player.nickname, {
      fontSize: "10px", fontFamily: "sans-serif",
      color: isMe ? "#ffd700" : "#ffffff",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5);

    const bodyParts: Phaser.GameObjects.GameObject[] = [bodyRect, highlight, head, eyeL, eyeR, label];
    if (isMe) {
      bodyParts.push(
        this.add.text(0, headY - CHAR.headR - 22, "▼", {
          fontSize: "10px", color: "#ffd700", stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5),
      );
    }

    const bodyGroup = this.add.container(0, 0, bodyParts);

    // Stars (stomp)
    const starsContainer = this.add.container(0, headY - CHAR.headR - 14);
    ["★", "☆", "✦"].forEach((ch, s) => {
      const angle = (s / 3) * Math.PI * 2;
      starsContainer.add(
        this.add.text(Math.cos(angle) * 10, Math.sin(angle) * 6, ch, {
          fontSize: "10px", color: "#ffff00", stroke: "#000", strokeThickness: 2,
        }).setOrigin(0.5),
      );
    });
    starsContainer.setVisible(false);

    // Bump "!"
    const bumpEffect = this.add.text(0, headY - CHAR.headR - 14, "!", {
      fontSize: "14px", fontStyle: "bold", color: "#ff4444",
      stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);

    const root = this.add.container(player.x, player.y, [shadow, bodyGroup, starsContainer, bumpEffect]);
    root.setDepth(100 + Math.round(player.y));

    return {
      root, bodyGroup, shadow, bodyRect, head, highlight, eyeL, eyeR, label,
      currentFacing: player.facing ?? 0,
      targetX: player.x, targetY: player.y,
      targetZ: player.z ?? 0, visualZ: player.z ?? 0,
      wasAirborne: false, squashTimer: 0,
      stompReactTimer: 0, bumpReactTimer: 0,
      starsEffect: starsContainer, bumpEffect,
    };
  }

  private getKeyboardInput(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.cursors.left.isDown  || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown    || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown  || this.wasd.S.isDown) y += 1;
    if (x !== 0 && y !== 0) { const l = Math.hypot(x, y); x /= l; y /= l; }
    return { x, y };
  }
}
