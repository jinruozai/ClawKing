/**
 * SkillVFX — Skill visual effects drawn on Canvas 2D
 * Each skill type has a unique VFX. Dispatched by skillEffect bitmask.
 *
 * Each function receives (ctx, v, t) where:
 *   ctx  — CanvasRenderingContext2D (already translated to VFX origin)
 *   v    — VFXInstance { x, y, tx, ty, color, data }
 *   t    — normalized progress 0..1
 *
 * Usage from BattleRenderer:
 *   import { drawSkillVFX } from './SkillVFX';
 *   drawSkillVFX(skillEffect, ctx, v, t);
 */

interface VFX {
  x: number; y: number;
  tx: number; ty: number;
  color: string;
  data?: Record<string, unknown>;
}

type Ctx = CanvasRenderingContext2D;

function eq(t: number) { return t * (2 - t); } // ease-out quad
function easeIn(t: number) { return t * t; }
function seeds(v: VFX): number[] { return (v.data?.seed as number[]) || []; }

// ── 定身 immobilize 0x0001 (spinning slashes AoE) ──
function vfx0(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.x, v.y);
  const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  const spin = t * Math.PI * 4; // 2 full rotations

  // Spinning slash arcs
  for (let i = 0; i < 3; i++) {
    const offset = (Math.PI * 2 / 3) * i + spin;
    const r = 10 + eq(t) * 25;
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = i === 0 ? '#ffffff' : '#f97316';
    ctx.lineWidth = 3 - t * 2;
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, r, offset, offset + Math.PI * 0.6);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Wind particles
  const sd = seeds(v);
  for (let i = 0; i < 8; i++) {
    const a = (sd[i] || i * 0.8) + spin * 0.5;
    const d = 8 + eq(t) * 28;
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2 * (1 - t), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 缴械 disarm 0x0002 (ground slam + cracks) ──
function vfx1(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;

  // Shockwave rings
  for (let ring = 0; ring < 2; ring++) {
    const delay = ring * 0.15;
    const rt = Math.max(0, t - delay) / (1 - delay);
    if (rt <= 0) continue;
    const r = eq(rt) * (20 + ring * 12);
    ctx.globalAlpha = (1 - rt) * 0.6;
    ctx.strokeStyle = ring === 0 ? '#ffffff' : '#a8a29e';
    ctx.lineWidth = 3 - rt * 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ground cracks
  const sd = seeds(v);
  for (let i = 0; i < 6; i++) {
    const angle = (sd[i] || i * 1.0);
    const len = eq(t) * 20;
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const mx = Math.cos(angle + 0.3) * len * 0.5;
    const my = Math.sin(angle + 0.3) * len * 0.5;
    ctx.lineTo(mx, my);
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    ctx.stroke();
  }

  // Center flash
  if (t < 0.15) {
    ctx.globalAlpha = (1 - t / 0.15) * 0.9;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 隐身 stealth 0x0100 (shadow dash + afterimage) ──
function vfx2(ctx: Ctx, v: VFX, t: number) {
  const dashT = Math.min(1, t * 2.5); // fast dash
  const hx = v.x + (v.tx - v.x) * eq(dashT);
  const hy = v.y + (v.ty - v.y) * eq(dashT);

  // Shadow trail (afterimages)
  for (let i = 0; i < 5; i++) {
    const trailT = Math.max(0, dashT - i * 0.12);
    const tx = v.x + (v.tx - v.x) * eq(trailT);
    const ty = v.y + (v.ty - v.y) * eq(trailT);
    ctx.globalAlpha = (0.4 - i * 0.08) * (1 - t);
    ctx.fillStyle = '#1a1a2e';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(tx, ty, 6 - i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Slash at target
  if (t > 0.35) {
    const st = (t - 0.35) / 0.65;
    ctx.translate(v.tx, v.ty);
    ctx.globalAlpha = (1 - st) * 0.9;
    // X-shaped slash
    const size = 12 + st * 8;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5 - st * 2;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-size, -size); ctx.lineTo(size, size);
    ctx.moveTo(size, -size); ctx.lineTo(-size, size);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ── 吸血 lifesteal 0x0010 (frenzy clamp + blood drain) ──
function vfx3(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;

  // Claw chomp animation
  const chomp = Math.sin(t * Math.PI * 6) * 0.5 + 0.5; // rapid open/close
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.5;
  // Top jaw
  ctx.beginPath();
  ctx.arc(0, -3 - chomp * 5, 10, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  // Bottom jaw
  ctx.beginPath();
  ctx.arc(0, 3 + chomp * 5, 10, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.stroke();

  // Blood particles flowing back to caster
  if (t > 0.3) {
    const bt = (t - 0.3) / 0.7;
    const sd = seeds(v);
    const dx = v.x - v.tx;
    const dy = v.y - v.ty;
    for (let i = 0; i < 6; i++) {
      const prog = Math.min(1, bt + (sd[i] || 0) * 0.1);
      const px = prog * dx + Math.sin((sd[i] || 0) * 5 + t * 8) * 4;
      const py = prog * dy + Math.cos((sd[i] || 0) * 5 + t * 8) * 4;
      ctx.globalAlpha = (1 - prog) * 0.7;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 - prog * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── 斩杀/活力 execute/vigor 0x0040/0x0020 (wave punch) ──
function vfx4(ctx: Ctx, v: VFX, t: number) {
  const angle = Math.atan2(v.ty - v.y, v.tx - v.x);
  const dist = Math.hypot(v.tx - v.x, v.ty - v.y);
  const hitT = Math.min(1, t * 2);
  const hx = v.x + (v.tx - v.x) * eq(hitT);
  const hy = v.y + (v.ty - v.y) * eq(hitT);

  // Water wave trail
  ctx.globalAlpha = (1 - t) * 0.5;
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const wt = Math.max(0, hitT - i * 0.15);
    const wx = v.x + (v.tx - v.x) * eq(wt);
    const wy = v.y + (v.ty - v.y) * eq(wt);
    const r = 5 + i * 3;
    ctx.globalAlpha = (1 - t) * (0.4 - i * 0.1);
    ctx.beginPath();
    ctx.arc(wx, wy, r, angle - Math.PI * 0.5, angle + Math.PI * 0.5);
    ctx.stroke();
  }

  // Impact explosion at target
  if (t > 0.4) {
    const it = (t - 0.4) / 0.6;
    ctx.translate(v.tx, v.ty);
    ctx.globalAlpha = (1 - it) * 0.8;
    // Shatter ring
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 - it * 2;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 10;
    const r = 4 + eq(it) * 18;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Armor fragments
    const sd = seeds(v);
    for (let i = 0; i < 5; i++) {
      const a = (sd[i] || i * 1.2);
      const fd = eq(it) * 15;
      ctx.globalAlpha = (1 - it) * 0.6;
      ctx.fillStyle = '#a5f3fc';
      ctx.fillRect(Math.cos(a) * fd - 2, Math.sin(a) * fd - 1, 4, 2);
    }
  }
}

// ── 反伤 thorns 0x0200 (curse rune circle) ──
function vfx5(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.2 ? t / 0.2 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  const spin = t * Math.PI * 2;

  // Outer rune circle
  const r = 16 + Math.sin(t * Math.PI * 3) * 3;
  ctx.globalAlpha = alpha * 0.6;
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, r, spin, spin + Math.PI * 1.8);
  ctx.stroke();
  ctx.setLineDash([]);

  // Inner pentagram
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = '#f0abfc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = spin + (Math.PI * 2 / 5) * i - Math.PI * 0.5;
    const x = Math.cos(a) * 10;
    const y = Math.sin(a) * 10;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Curse particles rising
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i + spin * 0.5;
    const pr = 8 + Math.sin(t * Math.PI * 4 + i) * 4;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#d946ef';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * pr, Math.sin(a) * pr - t * 15, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 暴击 critical 0x0400 (sand vortex AoE) ──
function vfx6(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.x, v.y);
  const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  const spin = t * Math.PI * 5;

  // Sand vortex
  const sd = seeds(v);
  for (let i = 0; i < 16; i++) {
    const a = (sd[i % 8] || i * 0.4) + spin + i * 0.3;
    const d = 5 + eq(t) * 22 + (i % 3) * 4;
    const size = 1.5 + Math.random() * 1;
    ctx.globalAlpha = alpha * (0.5 + (i % 2) * 0.2);
    ctx.fillStyle = i % 3 === 0 ? '#fcd34d' : i % 3 === 1 ? '#d4a017' : '#a8a29e';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size * (1 - t * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  // Dust cloud
  ctx.globalAlpha = alpha * 0.2;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, eq(t) * 28);
  grad.addColorStop(0, '#eab30880');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, eq(t) * 28, 0, Math.PI * 2);
  ctx.fill();
}

// ── 烧蓝 manaBurn 0x0080 (sonic boom shockwave) ──
function vfx7(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);

  // Concentric shockwaves
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.1;
    const rt = Math.max(0, t - delay) / (1 - delay);
    if (rt <= 0) continue;
    const r = eq(rt) * (16 + i * 10);
    ctx.globalAlpha = (1 - rt) * (0.7 - i * 0.15);
    ctx.strokeStyle = i === 0 ? '#ffffff' : '#4ade80';
    ctx.lineWidth = 3 - rt * 2 - i * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center flash
  if (t < 0.2) {
    const ft = t / 0.2;
    ctx.globalAlpha = (1 - ft) * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * (1 - ft), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Splash damage particles
  if (t > 0.2) {
    const st = (t - 0.2) / 0.8;
    const sd = seeds(v);
    for (let i = 0; i < 8; i++) {
      const a = sd[i] || i * 0.8;
      const d = 8 + eq(st) * 25;
      ctx.globalAlpha = (1 - st) * 0.5;
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2 * (1 - st), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── 致盲 blind 0x0004 (ice bolt + freeze) ──
function vfx8(ctx: Ctx, v: VFX, t: number) {
  const headT = Math.min(1, t * 2);
  const hx = v.x + (v.tx - v.x) * eq(headT);
  const hy = v.y + (v.ty - v.y) * eq(headT);

  // Ice crystal trail
  const sd = seeds(v);
  for (let i = 0; i < 4; i++) {
    const trailT = Math.max(0, headT - i * 0.1);
    const tx = v.x + (v.tx - v.x) * eq(trailT);
    const ty = v.y + (v.ty - v.y) * eq(trailT);
    ctx.globalAlpha = (0.5 - i * 0.1) * (1 - t);
    ctx.fillStyle = '#bae6fd';
    // Diamond shape
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(sd[i] || 0);
    const s = 3 - i * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Ice bolt head
  ctx.globalAlpha = (1 - t) * 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(hx, hy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Freeze burst at target
  if (t > 0.45) {
    const ft = (t - 0.45) / 0.55;
    ctx.translate(v.tx, v.ty);
    // Ice shards radiating
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 / 6) * i;
      const d = eq(ft) * 14;
      ctx.globalAlpha = (1 - ft) * 0.7;
      ctx.fillStyle = '#7dd3fc';
      ctx.save();
      ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
      ctx.rotate(a);
      ctx.fillRect(-1, -3, 2, 6); // shard
      ctx.restore();
    }
    // Freeze ring
    ctx.globalAlpha = (1 - ft) * 0.4;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2 - ft;
    ctx.beginPath();
    ctx.arc(0, 0, eq(ft) * 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ── 沉默 silence 0x0008 (full-screen pulse) ──
function vfx9(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.x, v.y);

  // Multiple expanding pulse rings
  for (let i = 0; i < 4; i++) {
    const delay = i * 0.12;
    const rt = Math.max(0, t - delay) / (1 - delay);
    if (rt <= 0) continue;
    const r = eq(rt) * (30 + i * 15);
    ctx.globalAlpha = (1 - rt) * (0.5 - i * 0.08);
    ctx.strokeStyle = i === 0 ? '#c084fc' : '#8b5cf6';
    ctx.lineWidth = 2.5 - rt * 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dark energy fill
  if (t < 0.5) {
    ctx.globalAlpha = (0.5 - t) * 0.3;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 净化 cleanse 0x0800 (chain grasp) ──
function vfx10(ctx: Ctx, v: VFX, t: number) {
  // Chain from caster to target
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const chainT = Math.min(1, t * 2.5);
  const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

  // Chain links
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const prog = (i / steps) * chainT;
    const cx = v.x + dx * prog;
    const cy = v.y + dy * prog;
    const wobble = Math.sin(i * 1.5 + t * 10) * 3;
    ctx.beginPath();
    ctx.arc(cx + wobble, cy, 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dark aura at target
  if (chainT > 0.8) {
    const at = (chainT - 0.8) / 0.2;
    ctx.translate(v.tx, v.ty);
    ctx.globalAlpha = alpha * at * 0.5;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
    grad.addColorStop(0, '#7f1d1d');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Lock icon (circle + bar)
    ctx.globalAlpha = alpha * at * 0.8;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -3, 5, Math.PI, 0);
    ctx.stroke();
    ctx.strokeRect(-4, 0, 8, 6);
  }
}

// ── 加速 haste 0x1000 (fortune stars burst) ──
function vfx11(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;

  // Star burst
  const sd = seeds(v);
  for (let i = 0; i < 8; i++) {
    const a = (sd[i] || i * 0.8);
    const d = 4 + eq(t) * 22;
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#facc15' : '#fde68a';

    // Draw 4-point star
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    ctx.rotate(t * Math.PI * 2 + i);
    const s = (3 - t * 2) * (i % 2 === 0 ? 1 : 0.7);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5);
    ctx.lineTo(s * 0.4, -s * 0.4);
    ctx.lineTo(s * 1.5, 0);
    ctx.lineTo(s * 0.4, s * 0.4);
    ctx.lineTo(0, s * 1.5);
    ctx.lineTo(-s * 0.4, s * 0.4);
    ctx.lineTo(-s * 1.5, 0);
    ctx.lineTo(-s * 0.4, -s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Golden glow
  ctx.globalAlpha = alpha * 0.3;
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 15;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, eq(t) * 20);
  grad.addColorStop(0, '#facc15');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, eq(t) * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Hit VFX: impact flash + directional sparks ──
export function drawHitVFX(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
  const angle = Math.atan2(v.ty - v.y, v.tx - v.x);

  // White flash
  if (t < 0.15) {
    ctx.globalAlpha = (1 - t / 0.15) * 0.9;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Directional sparks (fly away from attack direction)
  const sd = seeds(v);
  const spread = Math.PI * 0.6;
  for (let i = 0; i < 6; i++) {
    const a = angle + (sd[i] || 0) * spread - spread * 0.5;
    const d = 4 + eq(t) * 16;
    const sz = (2.5 - t * 2) * (1 + (i % 2) * 0.5);
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : v.color;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.3, sz), 0, Math.PI * 2);
    ctx.fill();
  }

  // Ring
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = v.color;
  ctx.lineWidth = 2 - t * 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 3 + eq(t) * 12, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Skill hit VFX: bigger, with screen shake trigger ──
export function drawSkillHitVFX(ctx: Ctx, v: VFX, t: number) {
  ctx.translate(v.tx, v.ty);
  const alpha = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;

  // Big white flash
  if (t < 0.12) {
    ctx.globalAlpha = (1 - t / 0.12);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, v.color + '80');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expanding ring with color
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = v.color;
  ctx.lineWidth = 3 - t * 2.5;
  ctx.shadowColor = v.color;
  ctx.shadowBlur = 10;
  const r = 5 + eq(t) * 20;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Spark burst
  const sd = seeds(v);
  for (let i = 0; i < 10; i++) {
    const a = sd[i] || i * 0.6;
    const d = 5 + eq(t) * 22;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : v.color;
    const sz = 3 - t * 2.5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.3, sz), 0, Math.PI * 2);
    ctx.fill();
  }
}

// skillEffect bit → VFX function
const SKILL_VFX: [number, (ctx: Ctx, v: VFX, t: number) => void][] = [
  [0x0001, vfx0],   // immobilize (定身)
  [0x0002, vfx1],   // disarm (缴械)
  [0x0004, vfx8],   // blind (致盲)
  [0x0008, vfx9],   // silence (沉默)
  [0x0010, vfx3],   // lifesteal (吸血)
  [0x0020, vfx4],   // vigor (活力)
  [0x0040, vfx4],   // execute (斩杀)
  [0x0080, vfx7],   // manaBurn (烧蓝)
  [0x0100, vfx2],   // stealth (隐身)
  [0x0200, vfx5],   // thorns (反伤)
  [0x0400, vfx6],   // critical (暴击)
  [0x0800, vfx10],  // cleanse (净化)
  [0x1000, vfx11],  // haste (加速)
];

export function drawSkillVFX(skillEffect: number, ctx: Ctx, v: VFX, t: number) {
  for (const [bit, fn] of SKILL_VFX) {
    if ((skillEffect & bit) !== 0) { fn(ctx, v, t); return; }
  }
}
