// ─── Phaser GameScene ────────────────────────────────────────────────────────
import Phaser from "phaser";
import { MAP_W, MAP_H, ZONE_CENTERS, ZONE_COLORS, MAX_ZONE_SIZE } from "../config";
import { onState, getMyId, sendInput, sendChat } from "../network";
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
  chatBubble: Phaser.GameObjects.Text | null;
  lastChatMessage: string;
}

const LERP = 0.35;
const Z_LERP = 0.5;

// ── Virtual joystick constants ────────────────────────────────────────────────
const JOY_BASE_R  = 45;  // px – radius of base ring
const JOY_STICK_R = 20;  // px – radius of stick knob
const JOY_MAX_DIST = 35; // px – max stick travel from origin

export class GameScene extends Phaser.Scene {
  // ── Manual keyboard tracking (avoids Phaser global capture issues) ───────
  private keysDown = new Set<string>();
  private jumpPending = false;
  private keydownHandler!: (e: KeyboardEvent) => void;
  private keyupHandler!: (e: KeyboardEvent) => void;

  private playerSprites: Record<string, PlayerSprite> = {};
  private zoneShadows: Record<string, Phaser.GameObjects.Rectangle> = {};
  private zoneRects:   Record<string, Phaser.GameObjects.Rectangle> = {};
  private zoneLabels:  Record<string, Phaser.GameObjects.Text> = {};

  /** Tweened zone size – updated every frame to drive zone rect sizes */
  private zoneSizeObj  = { size: 0 };
  private lastZoneSize = 0;

  private lastSentX = 0;
  private lastSentY = 0;

  // ── Touch joystick state ──────────────────────────────────────────────────
  private touchEverUsed = false;   // true once any touch/pointer event fires
  private joyActive = false;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyDelta = { x: 0, y: 0 };
  private touchJump = false;
  private jumpBtnId: number | null = null;

  // ── HTML touch control elements ──────────────────────────────────────────
  private touchOverlayEl!: HTMLElement;
  private joyBaseEl!: HTMLElement;
  private joyStickEl!: HTMLElement;
  private jumpBtnEl!: HTMLElement;

  // ── Pointer event handlers (stored for removal on shutdown) ─────────────
  private pointerdownHandler!:   (e: PointerEvent) => void;
  private pointermoveHandler!:   (e: PointerEvent) => void;
  private pointerupHandler!:     (e: PointerEvent) => void;
  private pointercancelHandler!: (e: PointerEvent) => void;

  private prevPhase: RoomPhase = "lobby";
  private prevAlive: Set<string> = new Set();


  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    this.load.image("lm-logo", "/assets/lm-logo.png");
  }

  create() {
    // ── Manual keyboard tracking ──────────────────────────────────────────
    // We do NOT use Phaser's keyboard plugin (disableGlobalCapture breaks
    // isDown; enableGlobalCapture blocks form typing). Instead we track
    // key state ourselves on the window, skipping game input when a form
    // element has focus so the user can type normally.
    const GAME_CODES = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "KeyW", "KeyA", "KeyS", "KeyD", "Space",
    ]);
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!GAME_CODES.has(e.code)) return;
      if (this.isTypingInForm()) return;   // let form input proceed normally
      e.preventDefault();                  // stop page scroll etc.
      this.keysDown.add(e.code);
      if (e.code === "Space" && !e.repeat) this.jumpPending = true;
      // Keyboard in use → hide touch controls (touch can re-show them)
      if (this.touchEverUsed) {
        this.touchEverUsed = false;
        if (this.touchOverlayEl) this.touchOverlayEl.style.display = "none";
        // Reset joystick state too
        this.joyActive = false;
        this.joyId = null;
        this.joyDelta = { x: 0, y: 0 };
      }
    };
    this.keyupHandler = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };
    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("keyup",   this.keyupHandler);

    // ── Grass background ─────────────────────────────────────────────────
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x2d6a4f).setDepth(0);
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x3a7d5a, 0.25);
    for (let x = 0; x <= MAP_W; x += 32) { g.moveTo(x, 0); g.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 32) { g.moveTo(0, y); g.lineTo(MAP_W, y); }
    g.strokePath();

    // ── Launchmetrics logo (arena watermark) ─────────────────────────────
    const logo = this.add.image(MAP_W / 2, MAP_H / 2, "lm-logo");
    const scale = Math.min((MAP_W * 0.55) / logo.width, (MAP_H * 0.3) / logo.height);
    logo.setScale(scale).setAlpha(0.07).setDepth(1);

    // ── Answer zone platforms (sizes driven by zoneSizeObj, tweened) ─────
    for (const [label, center] of Object.entries(ZONE_CENTERS)) {
      const color = ZONE_COLORS[label];
      const s = this.zoneSizeObj.size;

      const shadow = this.add
        .rectangle(center.x, center.y + 6, s, s,
          Phaser.Display.Color.ValueToColor(color).darken(40).color, 0.5)
        .setDepth(1);
      this.zoneShadows[label] = shadow;

      const rect = this.add
        .rectangle(center.x, center.y, s, s, color, 0.35)
        .setStrokeStyle(2, color)
        .setDepth(2);
      this.zoneRects[label] = rect;

      const lbl = this.add.text(center.x, center.y - 8, label, {
        fontSize: "56px", fontFamily: "monospace",
        color: "#ffffff", fontStyle: "bold",
      }).setOrigin(0.5).setAlpha(0.35).setDepth(3).setVisible(false);
      this.zoneLabels[label] = lbl;
    }

    // ── HTML touch controls ──────────────────────────────────────────────
    // Controls live outside the Phaser canvas as position:fixed HTML elements.
    // This means they work in portrait mode and are not clipped by the canvas.
    this.touchOverlayEl = document.getElementById("touch-overlay")!;
    this.joyBaseEl      = document.getElementById("joy-base-html")!;
    this.joyStickEl     = document.getElementById("joy-stick-html")!;
    this.jumpBtnEl      = document.getElementById("jump-btn-html")!;

    /** True if a pointer is on a UI widget we should not intercept for game input */
    const isUiPointer = (e: PointerEvent): boolean =>
      !!(e.target as HTMLElement | null)?.closest(
        "#hud, #admin-panel, #chat-bar, #qr-modal",
      );

    /** True if (cx, cy) is inside the jump button's bounding rect */
    const inJumpBtn = (cx: number, cy: number): boolean => {
      const r = this.jumpBtnEl.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };

    /** Reposition an element so its centre is at (cx, cy) in viewport coords */
    const centreAt = (el: HTMLElement, radius: number, cx: number, cy: number) => {
      el.style.left = `${cx - radius}px`;
      el.style.top  = `${cy - radius}px`;
    };

    /** Reset joystick to idle (called on pointerup / pointercancel) */
    const releaseJoy = () => {
      this.joyId     = null;
      this.joyActive = false;
      this.joyDelta  = { x: 0, y: 0 };
      // Snap stick back to base centre
      centreAt(this.joyStickEl, JOY_STICK_R, this.joyOrigin.x, this.joyOrigin.y);
    };

    // We listen in the CAPTURE phase so we receive events even when Phaser's
    // canvas has called setPointerCapture, which would otherwise redirect
    // pointermove/pointerup to the canvas and away from document bubble phase.
    this.pointerdownHandler = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (isUiPointer(e)) return;
      e.preventDefault(); // prevent text selection, scroll, zoom

      // Reveal overlay on first touch
      if (!this.touchEverUsed) {
        this.touchEverUsed = true;
        this.touchOverlayEl.style.display = "block";
      }

      if (inJumpBtn(e.clientX, e.clientY) && this.jumpBtnId === null) {
        // Hit jump button (coordinate-based, works regardless of pointer capture)
        this.jumpBtnId = e.pointerId;
        this.touchJump = true;
        this.jumpBtnEl.classList.add("pressed");
      } else if (this.joyId === null && !inJumpBtn(e.clientX, e.clientY)) {
        // Joystick: snap base to touch point
        this.joyId     = e.pointerId;
        this.joyOrigin = { x: e.clientX, y: e.clientY };
        centreAt(this.joyBaseEl,  JOY_BASE_R,  e.clientX, e.clientY);
        centreAt(this.joyStickEl, JOY_STICK_R, e.clientX, e.clientY);
        this.joyActive = true;
      }
    };

    this.pointermoveHandler = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (e.pointerId !== this.joyId || !this.joyActive) return;
      e.preventDefault();
      const dx   = e.clientX - this.joyOrigin.x;
      const dy   = e.clientY - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_MAX_DIST);
      const angle   = Math.atan2(dy, dx);
      centreAt(
        this.joyStickEl, JOY_STICK_R,
        this.joyOrigin.x + Math.cos(angle) * clamped,
        this.joyOrigin.y + Math.sin(angle) * clamped,
      );
      this.joyDelta.x = dist > 8 ? dx / dist : 0;
      this.joyDelta.y = dist > 8 ? dy / dist : 0;
    };

    this.pointerupHandler = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (e.pointerId === this.joyId)     releaseJoy();
      if (e.pointerId === this.jumpBtnId) {
        this.jumpBtnId = null;
        this.jumpBtnEl.classList.remove("pressed");
      }
    };

    // pointercancel fires when the OS takes over (notification, call, etc.)
    // Without this the joystick gets permanently stuck.
    this.pointercancelHandler = (e: PointerEvent) => {
      if (e.pointerId === this.joyId)     releaseJoy();
      if (e.pointerId === this.jumpBtnId) {
        this.jumpBtnId = null;
        this.jumpBtnEl.classList.remove("pressed");
      }
    };

    // Use { capture: true } so we intercept before Phaser's setPointerCapture
    // redirects events to the canvas element.
    document.addEventListener("pointerdown",   this.pointerdownHandler,   { capture: true });
    document.addEventListener("pointermove",   this.pointermoveHandler,   { capture: true });
    document.addEventListener("pointerup",     this.pointerupHandler,     { capture: true });
    document.addEventListener("pointercancel", this.pointercancelHandler, { capture: true });

    onState((state) => this.syncPlayers(state));

    // ── Chat bar keyboard wiring ──────────────────────────────────────────
    const chatBar   = document.getElementById("chat-bar")!;
    const chatInput = document.getElementById("chat-input") as HTMLInputElement;

    const openChat = () => {
      chatBar.classList.add("active");
      // defer focus so button-click event fully resolves before we steal focus
      setTimeout(() => chatInput.focus(), 0);
    };
    const closeChat = () => {
      chatBar.classList.remove("active");
      chatInput.value = "";
      chatInput.blur();
    };
    const submitChat = () => {
      const text = chatInput.value.trim();
      if (text) sendChat(text);
      closeChat();
    };

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // stopPropagation prevents the window listener from re-opening chat
        e.stopPropagation();
        e.preventDefault();
        submitChat();
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        closeChat();
      }
    });

    // Global shortcuts: Enter / T → open chat; M → mute toggle
    window.addEventListener("keydown", (e) => {
      if (this.isTypingInForm()) return;
      if (e.key === "Enter" || e.key === "t" || e.key === "T") {
        e.preventDefault();
        openChat();
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const muted = sfx.toggleMute();
        const muteBtn = document.getElementById("mute-btn");
        if (muteBtn) muteBtn.textContent = muted ? "🔇" : "🔊";
      }
    });

    // Wire chat HUD button
    document.getElementById("chat-btn")?.addEventListener("click", openChat);

    // clean up listeners when scene shuts down
    this.events.on("shutdown", () => {
      window.removeEventListener("keydown", this.keydownHandler);
      window.removeEventListener("keyup",   this.keyupHandler);
      document.removeEventListener("pointerdown",   this.pointerdownHandler,   { capture: true });
      document.removeEventListener("pointermove",   this.pointermoveHandler,   { capture: true });
      document.removeEventListener("pointerup",     this.pointerupHandler,     { capture: true });
      document.removeEventListener("pointercancel", this.pointercancelHandler, { capture: true });
    });
  }

  private isTypingInForm(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
  }

  /** Reposition and resize all zone rects from the current (tweened) size */
  private updateZoneRects(size: number) {
    for (const [label, center] of Object.entries(ZONE_CENTERS)) {
      const shadow = this.zoneShadows[label];
      const rect   = this.zoneRects[label];
      const lbl    = this.zoneLabels[label];
      if (!shadow || !rect || !lbl) continue;

      shadow.setPosition(center.x, center.y + 6).setSize(size, size);
      rect  .setPosition(center.x, center.y)     .setSize(size, size);
      lbl   .setPosition(center.x, center.y - 8);
    }
  }

  update(_time: number, delta: number) {
    // Drive zone rect geometry from tweened size every frame
    this.updateZoneRects(this.zoneSizeObj.size);
    const kb = this.getKeyboardInput();

    // Keyboard takes priority over joystick
    const x = kb.x !== 0 ? kb.x : this.joyDelta.x;
    const y = kb.y !== 0 ? kb.y : this.joyDelta.y;

    // Jump: space key (one-shot) OR touch jump button
    const jump = this.jumpPending || this.touchJump;
    this.jumpPending = false;
    this.touchJump = false;

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

      // Squash & stretch + landing/jump sounds
      if (!sprite.wasAirborne && isAirborne) {
        // Just left the ground → actual jump happened
        sfx.sfxJump();
      }
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

    // Tween zone size when it changes (new question starts)
    if (state.zoneSize !== this.lastZoneSize) {
      this.lastZoneSize = state.zoneSize;
      this.tweens.add({
        targets: this.zoneSizeObj,
        size: state.zoneSize,
        duration: 900,
        ease: "Back.Out",
      });
    }

    // Show zone labels only when a question is active or revealed
    const showLabels = state.phase === "inQuestion" || state.phase === "revealed";
    for (const lbl of Object.values(this.zoneLabels)) lbl.setVisible(showLabels);

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

      // Update chat bubble
      const msg = player.chatMessage || "";
      if (msg !== sprite.lastChatMessage) {
        sprite.lastChatMessage = msg;
        if (msg) {
          sprite.chatBubble?.setText(msg).setVisible(true);
        } else {
          sprite.chatBubble?.setVisible(false);
        }
      }
      // Keep bubble above the head (tracks jump height via visualZ)
      if (sprite.chatBubble?.visible) {
        const headTop = -(CHAR.bodyH + CHAR.headR * 2) - sprite.visualZ;
        sprite.chatBubble.setPosition(0, headTop - 26);
      }

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

    // Chat bubble — styled text with background, hidden until a message arrives
    const chatBubble = this.add.text(0, -(CHAR.bodyH + CHAR.headR * 2) - 26, "", {
      fontSize: "11px",
      fontFamily: "sans-serif",
      color: "#111111",
      backgroundColor: "#ffffff",
      padding: { x: 5, y: 3 },
      wordWrap: { width: 120, useAdvancedWrap: true },
    })
      .setOrigin(0.5, 1)
      .setDepth(210)
      .setVisible(false);

    const root = this.add.container(player.x, player.y, [shadow, bodyGroup, starsContainer, bumpEffect, chatBubble]);
    root.setDepth(100 + Math.round(player.y));

    return {
      root, bodyGroup, shadow, bodyRect, head, highlight, eyeL, eyeR, label,
      currentFacing: player.facing ?? 0,
      targetX: player.x, targetY: player.y,
      targetZ: player.z ?? 0, visualZ: player.z ?? 0,
      wasAirborne: false, squashTimer: 0,
      stompReactTimer: 0, bumpReactTimer: 0,
      starsEffect: starsContainer, bumpEffect,
      chatBubble, lastChatMessage: "",
    };
  }

  private getKeyboardInput(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.keysDown;
    if (k.has("ArrowLeft")  || k.has("KeyA")) x -= 1;
    if (k.has("ArrowRight") || k.has("KeyD")) x += 1;
    if (k.has("ArrowUp")    || k.has("KeyW")) y -= 1;
    if (k.has("ArrowDown")  || k.has("KeyS")) y += 1;
    if (x !== 0 && y !== 0) { const l = Math.hypot(x, y); x /= l; y /= l; }
    return { x, y };
  }
}
