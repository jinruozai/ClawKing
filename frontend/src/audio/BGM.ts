/**
 * BGM — Background Music Player
 * Web Audio API with crossfade transitions and caching
 */

const TRACKS: Record<string, string> = {
  menu: './bgm/menu.mp3',
  battle: './bgm/battle.mp3',
  climax: './bgm/climax.mp3',
  victory: './bgm/victory.mp3',
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let currentTrack = '';
let volume = 0.4;
let muted = false;

const cache = new Map<string, AudioBuffer>();

function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const ac = ensureCtx();
    const buf = await ac.decodeAudioData(arr);
    cache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export const BGM = {
  async play(track: string) {
    if (track === currentTrack && currentSource) return;
    const url = TRACKS[track];
    if (!url) return;
    const ac = ensureCtx();
    const buf = await loadBuffer(url);
    if (!buf) return;

    // Crossfade out old
    if (currentSource && currentGain) {
      const oldGain = currentGain;
      const oldSrc = currentSource;
      oldGain.gain.linearRampToValueAtTime(0, ac.currentTime + 1.2);
      setTimeout(() => { try { oldSrc.stop(); } catch {} }, 1300);
    }

    // New source
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(1, ac.currentTime + 1.2);
    src.connect(gain);
    gain.connect(masterGain!);
    src.start();

    currentSource = src;
    currentGain = gain;
    currentTrack = track;
  },

  stop() {
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
      currentGain = null;
      currentTrack = '';
    }
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
  get currentVolume() { return volume; },

  async preloadAll() {
    await Promise.all(Object.values(TRACKS).map(u => loadBuffer(u).catch(() => {})));
  },
};
