import { store } from '../state/store';

/** Synthesised sound effects (Web Audio) — no audio files to download. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!store.getState().settings.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(duration: number, freq: number, gain: number): void {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

function tone(freq: number, start: number, duration: number, gain = 0.08, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  card: () => noiseBurst(0.07, 2400, 0.5),
  deal: () => noiseBurst(0.05, 3000, 0.25),
  collect: () => noiseBurst(0.18, 900, 0.35),
  turn: () => tone(880, 0, 0.18, 0.05),
  reveal: () => {
    tone(523, 0, 0.35, 0.07, 'triangle');
    tone(784, 0.12, 0.5, 0.07, 'triangle');
  },
  pair: () => {
    tone(659, 0, 0.3, 0.06, 'triangle');
    tone(880, 0.1, 0.3, 0.06, 'triangle');
    tone(1047, 0.2, 0.5, 0.06, 'triangle');
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.5, 0.06, 'triangle')),
  error: () => tone(220, 0, 0.2, 0.05, 'square'),
};
