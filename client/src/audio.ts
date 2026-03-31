// ─── Procedural sound effects using Web Audio API ───────────────────────────
// No external audio files needed — all sounds are synthesized on the fly.

let ctx: AudioContext | null = null;
let _muted = false;

/** Lazy-init AudioContext (must happen after user gesture) */
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function isMuted(): boolean { return _muted; }
export function setMuted(m: boolean) { _muted = m; }
export function toggleMute(): boolean { _muted = !_muted; return _muted; }

// ── Helper: play a tone with envelope ────────────────────────────────────────

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  volume: number = 0.15,
  slide?: number, // slide to this freq
) {
  if (_muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) osc.frequency.linearRampToValueAtTime(slide, c.currentTime + duration);
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

function playNoise(duration: number, volume: number = 0.08) {
  if (_muted) return;
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  // Bandpass for a thumpier sound
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 200;
  filter.Q.value = 1;
  source.connect(filter).connect(gain).connect(c.destination);
  source.start();
}

// ── Public sound effects ─────────────────────────────────────────────────────

/** Player jumps */
export function sfxJump() {
  playTone(250, 0.15, "square", 0.1, 500);
}

/** Player lands on ground */
export function sfxLand() {
  playNoise(0.08, 0.1);
  playTone(120, 0.08, "sine", 0.08);
}

/** Two players bump into each other */
export function sfxBump() {
  playTone(180, 0.1, "sawtooth", 0.1);
  playNoise(0.06, 0.06);
}

/** Player gets stomped on */
export function sfxStomp() {
  playTone(400, 0.08, "square", 0.12, 100);
  setTimeout(() => playTone(200, 0.12, "square", 0.1, 80), 50);
  playNoise(0.1, 0.1);
}

/** Question starts */
export function sfxQuestionStart() {
  playTone(440, 0.1, "square", 0.1);
  setTimeout(() => playTone(554, 0.1, "square", 0.1), 100);
  setTimeout(() => playTone(659, 0.15, "square", 0.1), 200);
}

/** Answer revealed */
export function sfxReveal() {
  playTone(523, 0.12, "square", 0.12);
  setTimeout(() => playTone(659, 0.12, "square", 0.12), 120);
  setTimeout(() => playTone(784, 0.2, "square", 0.12), 240);
}

/** Player dies (wrong zone) */
export function sfxDeath() {
  playTone(300, 0.15, "sawtooth", 0.1, 80);
  setTimeout(() => playTone(200, 0.2, "sawtooth", 0.08, 50), 150);
}

/** Game reset */
export function sfxReset() {
  playTone(523, 0.08, "triangle", 0.1);
  setTimeout(() => playTone(392, 0.08, "triangle", 0.1), 80);
  setTimeout(() => playTone(523, 0.15, "triangle", 0.1), 160);
}
