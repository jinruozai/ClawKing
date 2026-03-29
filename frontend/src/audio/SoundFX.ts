/**
 * SoundFX — Procedural Sound Effects via Web Audio API
 * No external audio files needed
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let volume = 0.5;
let muted = false;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function gain(v = 1): GainNode {
  const g = ac().createGain();
  g.gain.value = v;
  g.connect(masterGain!);
  return g;
}

function osc(type: OscillatorType, freq: number, g: GainNode, dur: number) {
  const o = ac().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  o.start();
  o.stop(ac().currentTime + dur);
  return o;
}

function noise(g: GainNode, dur: number, freq = 2000) {
  const a = ac();
  const len = a.sampleRate * dur;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1;
  src.connect(bp);
  bp.connect(g);
  src.start();
  src.stop(a.currentTime + dur);
}

// Preloaded audio samples (lazy load on first use)
const samples: Record<string, AudioBuffer | null> = {};
const samplesLoading = new Set<string>();

function loadSample(name: string, url: string) {
  if (samplesLoading.has(name) || samples[name]) return;
  samplesLoading.add(name);
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(d => ac().decodeAudioData(d))
    .then(b => { samples[name] = b; })
    .catch(() => {});
}

function playSample(name: string, url: string) {
  loadSample(name, url);
  const buf = samples[name];
  if (buf) {
    const src = ac().createBufferSource();
    src.buffer = buf;
    src.connect(masterGain!);
    src.start();
    return true;
  }
  return false;
}

export const SFX = {
  attack(crit = false) {
    const t = ac().currentTime;
    const g = gain(0.4);
    g.gain.linearRampToValueAtTime(0, t + 0.12);
    noise(g, 0.12, 1800);
    const g2 = gain(0.3);
    g2.gain.linearRampToValueAtTime(0, t + 0.12);
    const o = osc('sine', 120, g2, 0.12);
    o.frequency.linearRampToValueAtTime(50, t + 0.12);
    if (crit) {
      const g3 = gain(0.35);
      g3.gain.linearRampToValueAtTime(0, t + 0.15);
      const o2 = osc('square', 1200, g3, 0.15);
      o2.frequency.linearRampToValueAtTime(600, t + 0.15);
    }
  },

  hurt() {
    const t = ac().currentTime;
    const g = gain(0.25);
    g.gain.linearRampToValueAtTime(0, t + 0.12);
    const o = osc('sine', 200, g, 0.12);
    o.frequency.linearRampToValueAtTime(80, t + 0.12);
  },

  death() {
    const t = ac().currentTime;
    const g = gain(0.3);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    const o = osc('sawtooth', 300, g, 0.5);
    o.frequency.linearRampToValueAtTime(40, t + 0.5);
  },

  heal() {
    const t = ac().currentTime;
    const g = gain(0.2);
    g.gain.linearRampToValueAtTime(0, t + 0.25);
    const o = osc('sine', 440, g, 0.25);
    o.frequency.linearRampToValueAtTime(880, t + 0.25);
  },

  evolve() {
    const t = ac().currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const g = gain(0.12);
      const s = t + i * 0.08;
      g.gain.setValueAtTime(0.12, s);
      g.gain.linearRampToValueAtTime(0, s + 0.2);
      const o = ac().createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(s);
      o.stop(s + 0.2);
    });
    const gn = gain(0.06);
    gn.gain.setValueAtTime(0.06, t + 0.3);
    gn.gain.linearRampToValueAtTime(0, t + 0.5);
    noise(gn, 0.5, 5000);
  },


  shrink() {
    const t = ac().currentTime;
    const g = gain(0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.8);
    const o = osc('sawtooth', 60, g, 0.8);
    const lp = ac().createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.frequency.linearRampToValueAtTime(80, t + 0.8);
    o.disconnect();
    o.connect(lp);
    lp.connect(g);
  },

  firstBlood() {
    const t = ac().currentTime;
    // Dramatic horn
    [262, 330, 392, 523].forEach((f, i) => {
      const g = gain(0.2);
      const s = t + i * 0.15;
      g.gain.setValueAtTime(0.2, s);
      g.gain.linearRampToValueAtTime(0.05, s + 0.4);
      g.gain.linearRampToValueAtTime(0, s + 0.5);
      const o = ac().createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ac().createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      o.connect(lp);
      lp.connect(g);
      o.start(s);
      o.stop(s + 0.5);
    });
  },

  killStreak() {
    const t = ac().currentTime;
    const g = gain(0.25);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    const o = osc('square', 400, g, 0.6);
    o.frequency.linearRampToValueAtTime(800, t + 0.3);
    o.frequency.linearRampToValueAtTime(600, t + 0.6);
    noise(gain(0.08), 0.4, 4000);
  },

  gameOver() {
    const t = ac().currentTime;
    [262, 330, 392, 523].forEach((f, i) => {
      const g = gain(0.15);
      const s = t + i * 0.25;
      g.gain.setValueAtTime(0.15, s);
      g.gain.linearRampToValueAtTime(0, s + 0.5);
      const o = ac().createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ac().createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      o.connect(lp);
      lp.connect(g);
      o.start(s);
      o.stop(s + 0.5);
    });
  },

  hitImpact() {
    if (!playSample('hit', '/snd/hit.mp3')) {
      // Procedural fallback while mp3 loads
      const t = ac().currentTime;
      const g = gain(0.35);
      g.gain.linearRampToValueAtTime(0, t + 0.1);
      noise(g, 0.1, 1500);
    }
  },

  stun() {
    playSample('stun', '/snd/stun.mp3');
  },

  levelUp() {
    playSample('lvup', '/snd/lvup.mp3');
  },

  flash() {
    playSample('flash', '/snd/flash.mp3');
  },

  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (masterGain && !muted) masterGain.gain.value = volume;
  },

  toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : volume;
    return muted;
  },

  get isMuted() { return muted; },
};
