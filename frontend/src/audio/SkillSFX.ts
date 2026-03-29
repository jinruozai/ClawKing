/**
 * SkillSFX — Skill sound effects via Web Audio API
 * Each skill type has a unique procedural sound. No external files.
 *
 * Usage:
 *   SkillSFX.play(skillEffect)  — play sound matching skillEffect bitmask
 *   SkillSFX.playHit()          — universal hit impact sound
 *   SkillSFX.playBigHit()       — heavy hit (skill damage)
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function g(v = 1): GainNode {
  const node = ac().createGain();
  node.gain.value = v;
  node.connect(masterGain!);
  return node;
}

function osc(type: OscillatorType, freq: number, gain: GainNode, dur: number) {
  const o = ac().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(gain);
  o.start();
  o.stop(ac().currentTime + dur);
  return o;
}

function noise(gain: GainNode, dur: number, freq = 2000, q = 1) {
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
  bp.Q.value = q;
  src.connect(bp);
  bp.connect(gain);
  src.start();
  src.stop(a.currentTime + dur);
}

function lp(input: AudioNode, freq: number): BiquadFilterNode {
  const f = ac().createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  input.connect(f);
  return f;
}

// ── 定身 immobilize 0x0001 (whirling whoosh) ──
function skill0() {
  const t = ac().currentTime;
  // Spinning whoosh
  const gn = g(0.5);
  gn.gain.linearRampToValueAtTime(0.6, t + 0.1);
  gn.gain.linearRampToValueAtTime(0, t + 0.4);
  noise(gn, 0.4, 800, 2);
  // Rising tone
  const go = g(0.3);
  go.gain.linearRampToValueAtTime(0, t + 0.35);
  const o = osc('sawtooth', 200, go, 0.35);
  o.frequency.linearRampToValueAtTime(600, t + 0.2);
  o.frequency.linearRampToValueAtTime(300, t + 0.35);
}

// ── 缴械 disarm 0x0002 (heavy slam) ──
function skill1() {
  const t = ac().currentTime;
  // Deep impact
  const g1 = g(0.6);
  g1.gain.linearRampToValueAtTime(0, t + 0.3);
  osc('sine', 60, g1, 0.3);
  // Crunch
  const g2 = g(0.5);
  g2.gain.linearRampToValueAtTime(0, t + 0.15);
  noise(g2, 0.15, 500, 3);
  // Rumble
  const g3 = g(0.25);
  g3.gain.setValueAtTime(0, t + 0.08);
  g3.gain.linearRampToValueAtTime(0.25, t + 0.12);
  g3.gain.linearRampToValueAtTime(0, t + 0.5);
  noise(g3, 0.5, 120, 2);
}

// ── 隐身 stealth 0x0100 (shadow strike) ──
function skill2() {
  const t = ac().currentTime;
  // Quick stab
  const g1 = g(0.5);
  g1.gain.linearRampToValueAtTime(0, t + 0.08);
  noise(g1, 0.08, 3000, 5);
  // Dark whoosh
  const g2 = g(0.35);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.35, t + 0.03);
  g2.gain.linearRampToValueAtTime(0, t + 0.2);
  const o = osc('sine', 800, g2, 0.2);
  o.frequency.linearRampToValueAtTime(200, t + 0.2);
  // Vanish shimmer
  const g3 = g(0.15);
  g3.gain.setValueAtTime(0, t + 0.15);
  g3.gain.linearRampToValueAtTime(0.15, t + 0.2);
  g3.gain.linearRampToValueAtTime(0, t + 0.4);
  osc('sine', 2000, g3, 0.4);
}

// ── 吸血 lifesteal 0x0010 (frenzy bite + drain) ──
function skill3() {
  const t = ac().currentTime;
  // Rapid chomps
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.06;
    const gn = g(0.35);
    gn.gain.setValueAtTime(0.35, s);
    gn.gain.linearRampToValueAtTime(0, s + 0.06);
    noise(gn, 0.06, 1200 + i * 400, 4);
  }
  // Drain sound (rising hum)
  const gd = g(0.2);
  gd.gain.setValueAtTime(0, t + 0.2);
  gd.gain.linearRampToValueAtTime(0.2, t + 0.3);
  gd.gain.linearRampToValueAtTime(0, t + 0.6);
  osc('sine', 300, gd, 0.6).frequency.linearRampToValueAtTime(600, t + 0.6);
}

// ── 斩杀/活力 execute/vigor 0x0040/0x0020 (wave break) ──
function skill4() {
  const t = ac().currentTime;
  // Water splash
  const g1 = g(0.5);
  g1.gain.linearRampToValueAtTime(0, t + 0.25);
  noise(g1, 0.25, 2500, 1.5);
  // Impact crack
  const g2 = g(0.4);
  g2.gain.linearRampToValueAtTime(0, t + 0.12);
  const o = osc('square', 400, g2, 0.12);
  o.frequency.linearRampToValueAtTime(100, t + 0.12);
  // Armor break tinkle
  const g3 = g(0.2);
  g3.gain.setValueAtTime(0, t + 0.1);
  g3.gain.linearRampToValueAtTime(0.2, t + 0.12);
  g3.gain.linearRampToValueAtTime(0, t + 0.35);
  osc('triangle', 1500, g3, 0.35).frequency.linearRampToValueAtTime(800, t + 0.35);
}

// ── 反伤 thorns 0x0200 (coral curse) ──
function skill5() {
  const t = ac().currentTime;
  // Eerie hum
  const g1 = g(0.3);
  g1.gain.linearRampToValueAtTime(0, t + 0.6);
  const o1 = osc('sine', 180, g1, 0.6);
  o1.frequency.linearRampToValueAtTime(220, t + 0.3);
  o1.frequency.linearRampToValueAtTime(160, t + 0.6);
  // Curse whisper
  const g2 = g(0.25);
  g2.gain.linearRampToValueAtTime(0, t + 0.5);
  noise(g2, 0.5, 600, 8);
  // Dark chime
  const g3 = g(0.2);
  g3.gain.setValueAtTime(0, t + 0.15);
  g3.gain.linearRampToValueAtTime(0.2, t + 0.2);
  g3.gain.linearRampToValueAtTime(0, t + 0.5);
  osc('sine', 1100, g3, 0.5);
}

// ── 暴击 critical 0x0400 (sandstorm) ──
function skill6() {
  const t = ac().currentTime;
  // Wind howl
  const g1 = g(0.4);
  g1.gain.linearRampToValueAtTime(0.5, t + 0.15);
  g1.gain.linearRampToValueAtTime(0, t + 0.6);
  noise(g1, 0.6, 400, 1);
  // Sand rush
  const g2 = g(0.3);
  g2.gain.linearRampToValueAtTime(0, t + 0.5);
  noise(g2, 0.5, 3000, 0.5);
  // Low rumble
  const g3 = g(0.2);
  g3.gain.linearRampToValueAtTime(0, t + 0.5);
  osc('sine', 80, g3, 0.5);
}

// ── 烧蓝 manaBurn 0x0080 (sonic boom) ──
function skill7() {
  const t = ac().currentTime;
  // Sharp crack
  const g1 = g(0.6);
  g1.gain.linearRampToValueAtTime(0, t + 0.06);
  noise(g1, 0.06, 4000, 8);
  // Boom
  const g2 = g(0.5);
  g2.gain.setValueAtTime(0, t + 0.03);
  g2.gain.linearRampToValueAtTime(0.5, t + 0.05);
  g2.gain.linearRampToValueAtTime(0, t + 0.35);
  osc('sine', 100, g2, 0.35).frequency.linearRampToValueAtTime(30, t + 0.35);
  // Echo ring
  const g3 = g(0.15);
  g3.gain.setValueAtTime(0, t + 0.1);
  g3.gain.linearRampToValueAtTime(0.15, t + 0.15);
  g3.gain.linearRampToValueAtTime(0, t + 0.5);
  noise(g3, 0.5, 1000, 2);
}

// ── 致盲 blind 0x0004 (ice arrow) ──
function skill8() {
  const t = ac().currentTime;
  // Ice launch
  const g1 = g(0.35);
  g1.gain.linearRampToValueAtTime(0, t + 0.15);
  osc('triangle', 1200, g1, 0.15).frequency.linearRampToValueAtTime(2000, t + 0.15);
  // Crystal shatter
  const g2 = g(0.4);
  g2.gain.setValueAtTime(0, t + 0.12);
  g2.gain.linearRampToValueAtTime(0.4, t + 0.14);
  g2.gain.linearRampToValueAtTime(0, t + 0.3);
  noise(g2, 0.3, 5000, 3);
  // Freeze ring
  const g3 = g(0.2);
  g3.gain.setValueAtTime(0, t + 0.2);
  g3.gain.linearRampToValueAtTime(0.2, t + 0.25);
  g3.gain.linearRampToValueAtTime(0, t + 0.5);
  osc('sine', 800, g3, 0.5).frequency.linearRampToValueAtTime(400, t + 0.5);
}

// ── 沉默 silence 0x0008 (abyss pulse) ──
function skill9() {
  const t = ac().currentTime;
  // Deep pulse
  const g1 = g(0.5);
  g1.gain.linearRampToValueAtTime(0, t + 0.8);
  osc('sine', 40, g1, 0.8);
  // Expanding pressure wave
  const g2 = g(0.3);
  g2.gain.linearRampToValueAtTime(0.4, t + 0.2);
  g2.gain.linearRampToValueAtTime(0, t + 0.7);
  noise(g2, 0.7, 200, 1);
  // Tinnitus ring
  const g3 = g(0.1);
  g3.gain.setValueAtTime(0, t + 0.3);
  g3.gain.linearRampToValueAtTime(0.1, t + 0.4);
  g3.gain.linearRampToValueAtTime(0, t + 1.0);
  osc('sine', 3000, g3, 1.0);
}

// ── 净化 cleanse 0x0800 (doomsday grasp) ──
function skill10() {
  const t = ac().currentTime;
  // Chain rattle
  for (let i = 0; i < 4; i++) {
    const s = t + i * 0.05;
    const gn = g(0.25);
    gn.gain.setValueAtTime(0.25, s);
    gn.gain.linearRampToValueAtTime(0, s + 0.05);
    noise(gn, 0.05, 2000 + i * 500, 6);
  }
  // Dark clamp
  const g2 = g(0.4);
  g2.gain.setValueAtTime(0, t + 0.2);
  g2.gain.linearRampToValueAtTime(0.4, t + 0.22);
  g2.gain.linearRampToValueAtTime(0, t + 0.5);
  osc('sawtooth', 150, g2, 0.5).frequency.linearRampToValueAtTime(80, t + 0.5);
  // Drain hum
  const g3 = g(0.15);
  g3.gain.setValueAtTime(0, t + 0.3);
  g3.gain.linearRampToValueAtTime(0.15, t + 0.35);
  g3.gain.linearRampToValueAtTime(0, t + 0.7);
  osc('sine', 250, g3, 0.7);
}

// ── 加速 haste 0x1000 (fortune stars) ──
function skill11() {
  const t = ac().currentTime;
  // Lucky chimes (ascending)
  [880, 1100, 1320, 1760].forEach((f, i) => {
    const s = t + i * 0.07;
    const gn = g(0.2);
    gn.gain.setValueAtTime(0.2, s);
    gn.gain.linearRampToValueAtTime(0, s + 0.2);
    osc('sine', f, gn, 0.2);
  });
  // Sparkle
  const g2 = g(0.15);
  g2.gain.setValueAtTime(0, t + 0.25);
  g2.gain.linearRampToValueAtTime(0.15, t + 0.28);
  g2.gain.linearRampToValueAtTime(0, t + 0.5);
  noise(g2, 0.5, 6000, 4);
  // Coin ding
  const g3 = g(0.25);
  g3.gain.setValueAtTime(0, t + 0.3);
  g3.gain.linearRampToValueAtTime(0.25, t + 0.32);
  g3.gain.linearRampToValueAtTime(0, t + 0.6);
  osc('sine', 2200, g3, 0.6);
}

// ── Universal hit sounds ──
function playHit() {
  const t = ac().currentTime;
  const gn = g(0.35);
  gn.gain.linearRampToValueAtTime(0, t + 0.1);
  noise(gn, 0.1, 1500, 3);
  const go = g(0.2);
  go.gain.linearRampToValueAtTime(0, t + 0.08);
  osc('sine', 150, go, 0.08).frequency.linearRampToValueAtTime(60, t + 0.08);
}

function playBigHit() {
  const t = ac().currentTime;
  // Loud impact
  const g1 = g(0.5);
  g1.gain.linearRampToValueAtTime(0, t + 0.15);
  noise(g1, 0.15, 1200, 2);
  // Bass thud
  const g2 = g(0.4);
  g2.gain.linearRampToValueAtTime(0, t + 0.2);
  osc('sine', 80, g2, 0.2).frequency.linearRampToValueAtTime(40, t + 0.2);
  // Crack
  const g3 = g(0.3);
  g3.gain.setValueAtTime(0, t + 0.02);
  g3.gain.linearRampToValueAtTime(0.3, t + 0.04);
  g3.gain.linearRampToValueAtTime(0, t + 0.12);
  noise(g3, 0.12, 4000, 5);
}

// skillEffect bit → sound function
const SKILL_SOUNDS: [number, () => void][] = [
  [0x0001, skill0],   // immobilize (定身)
  [0x0002, skill1],   // disarm (缴械)
  [0x0004, skill8],   // blind (致盲)
  [0x0008, skill9],   // silence (沉默)
  [0x0010, skill3],   // lifesteal (吸血)
  [0x0020, skill4],   // vigor (活力)
  [0x0040, skill4],   // execute (斩杀)
  [0x0080, skill7],   // manaBurn (烧蓝)
  [0x0100, skill2],   // stealth (隐身)
  [0x0200, skill5],   // thorns (反伤)
  [0x0400, skill6],   // critical (暴击)
  [0x0800, skill10],  // cleanse (净化)
  [0x1000, skill11],  // haste (加速)
];

export const SkillSFX = {
  play(skillEffect: number) {
    for (const [bit, fn] of SKILL_SOUNDS) {
      if ((skillEffect & bit) !== 0) { fn(); return; }
    }
  },
  playHit,
  playBigHit,
};
