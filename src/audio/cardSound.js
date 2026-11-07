// Sounds for the rules flash cards, made with the Web Audio API (no audio files to download or cache):
// a ninja-style slice as a card flips in, a swoosh as the racquet swings, then tennis-ball bounces timed to the balls on screen.
// Browsers only allow audio after a tap or key press, so the very first card plays its sound on the first interaction.
const KEY = 'traice.sound';
let context = null, noise = null, muted = false;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* storage blocked */ }

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? 'off' : 'on'); } catch { /* storage blocked */ }
}

function audio() {
  if (context) return context;
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  try { context = new AudioContextClass(); } catch { return null; }
  return context;
}
function noiseBuffer(c) {
  if (noise) return noise;
  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.4), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}
const envelope = (param, at, peak, duration) => {
  param.setValueAtTime(0.0001, at);
  param.linearRampToValueAtTime(peak, at + 0.012);
  param.exponentialRampToValueAtTime(0.0001, at + duration);
};

// Filtered noise that sweeps downwards: a blade or racquet cutting the air.
function swish(c, at, level, { from = 5200, to = 900, duration = 0.2 } = {}) {
  const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  source.buffer = noiseBuffer(c);
  filter.type = 'bandpass'; filter.Q.value = 1.6;
  filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, at + duration);
  envelope(gain.gain, at, level, duration);
  source.connect(filter); filter.connect(gain); gain.connect(c.destination);
  source.start(at); source.stop(at + duration + 0.05);
}
// A bright metallic "shing" on top of the slice.
function ping(c, at, level) {
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(2400, at); osc.frequency.exponentialRampToValueAtTime(3300, at + 0.08);
  envelope(gain.gain, at + 0.03, level, 0.16);
  osc.connect(gain); gain.connect(c.destination);
  osc.start(at); osc.stop(at + 0.25);
}
// A tennis-ball "pock": a quick falling tone plus a tiny noise tick.
function pock(c, at, level, pitch = 1) {
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(520 * pitch, at); osc.frequency.exponentialRampToValueAtTime(150 * pitch, at + 0.09);
  envelope(gain.gain, at, level, 0.13);
  osc.connect(gain); gain.connect(c.destination);
  osc.start(at); osc.stop(at + 0.18);
  swish(c, at, level * 0.35, { from: 3800, to: 1800, duration: 0.04 });
}

// Matches the rally animation: the balls hit the floor at about these times (seconds after a card flips).
const BOUNCES = [[1.08, 1, 1.0], [1.43, 0.8, 1.1], [1.78, 0.65, 0.95], [1.92, 0.55, 1.05], [2.27, 0.45, 0.9], [2.62, 0.35, 1.0]];

export function playCardChange({ reducedMotion = false } = {}) {
  if (muted) return false;
  const c = audio();
  if (!c) return false;
  c.resume?.();
  const t = c.currentTime + 0.01;
  swish(c, t, 0.5); ping(c, t, 0.12);                       // the card slices in
  if (reducedMotion) return true;                            // no rally on screen, so no rally sound
  swish(c, t + 0.5, 0.3, { from: 3200, to: 700, duration: 0.28 });   // the racquet swing
  for (const [after, level, pitch] of BOUNCES) pock(c, t + after, 0.5 * level, pitch);
  return true;
}

// The first card: play as soon as the browser allows it (immediately if audio is already unlocked, else on the first tap or key).
export function playWelcome() {
  if (muted) return () => {};
  const c = audio();
  if (!c) return () => {};
  const play = () => { if (!muted) { c.resume?.(); const t = c.currentTime + 0.01; swish(c, t, 0.4); ping(c, t, 0.1); pock(c, t + 0.3, 0.4); pock(c, t + 0.62, 0.28, 0.9); } };
  if (c.state === 'running') { play(); return () => {}; }
  const once = () => { cleanup(); play(); };
  const cleanup = () => { for (const type of ['pointerdown', 'keydown']) window.removeEventListener(type, once); };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, once, { once: true });
  return cleanup;
}
