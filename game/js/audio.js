// audio.js — every sound in Solmar Vice is synthesized with WebAudio: no audio files.
// The context is created lazily inside startAudio(), which main.js calls from the start
// button click, so nothing ever plays before a user gesture (autoplay rules).
let ctx = null;
let master = null;
let musicTimer = null;
let muted = false;
let musicStep = 0;

export function startAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  startMusicLoop();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export function isMuted() { return muted; }

function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, vol = 0.25, freq = 900) {
  if (!ctx || muted) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start();
}

export function sfxShoot() { noiseBurst(0.09, 0.3, 2600); tone(160, 0.08, 'square', 0.12, 60); }
export function sfxMelee() { noiseBurst(0.07, 0.2, 700); }
export function sfxCrash(strength = 1) { noiseBurst(0.22, 0.2 + 0.25 * strength, 500); tone(70, 0.2, 'sawtooth', 0.15, 40); }
export function sfxPickup() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.14, 'sine', 0.25, null, 0.08); }
export function sfxCash() { tone(880, 0.07, 'triangle', 0.22); tone(1174, 0.07, 'triangle', 0.22, null, 0.06); tone(1568, 0.16, 'triangle', 0.22, null, 0.12); }
export function sfxDoor() { tone(220, 0.06, 'square', 0.12); tone(180, 0.08, 'square', 0.12, null, 0.06); }
export function sfxHurt() { tone(140, 0.15, 'sawtooth', 0.2, 90); }
export function sfxSirenBlip() { tone(720, 0.16, 'sine', 0.07, 980); tone(980, 0.16, 'sine', 0.07, 720, 0.16); }
export function sfxMissionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, null, i * 0.1)); }
export function sfxBusted() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'square', 0.16, null, i * 0.14)); }

// A cheap engine hum whose pitch follows the player's speed; called every frame.
let engineOsc = null; let engineGain = null;
export function setEngine(speedRatio, driving) {
  if (!ctx) return;
  if (driving && !engineOsc) {
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  if (engineOsc) {
    engineOsc.frequency.value = 55 + Math.abs(speedRatio) * 130;
    engineGain.gain.value = muted ? 0 : (driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0);
  }
}

// A lazy tropical loop: I–vi–IV–V plucks over a soft bass, scheduled with setInterval.
const CHORDS = [ [261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7] ];
function startMusicLoop() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || muted) return;
    const chord = CHORDS[musicStep % CHORDS.length];
    tone(chord[0] / 2, 0.9, 'sine', 0.10);
    chord.forEach((f, i) => tone(f, 0.5, 'triangle', 0.045, null, i * 0.13));
    musicStep++;
  }, 950);
}
