/**
 * OverlayLayer — Floaters (damage numbers), Announcements, FPS counter
 * PixiJS v8 Text API
 */
import { Container, Text } from 'pixi.js';
import type { Floater, FloaterStyle, Announcement } from '../types';
import { Camera } from './Camera';

const ENTITY_SIZE = 22;

function eq(t: number) { return t * (2 - t); }
function easeOutBack(t: number) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

// ── Floater Container (world-space) ──

interface ActiveFloater { text: Text; data: Floater }

export class FloaterContainer extends Container {
  private pool: ActiveFloater[] = [];

  addFloater(col: number, row: number, text: string, color: string, fontSize: number, style: FloaterStyle, dx: number, camera: Camera) {
    const [wx, wy] = camera.toScreen(col, row);
    const data: Floater = { x: wx, y: wy - ENTITY_SIZE - 15, text, color, t0: performance.now(), duration: 1200, fontSize, style, dx };
    const txt = new Text({
      text,
      style: { fontFamily: 'Rajdhani, sans-serif', fontWeight: 'bold', fontSize, fill: color, stroke: { color: '#000000', width: 3 } },
      resolution: 4,
    });
    txt.anchor.set(0.5, 0.5);
    this.addChild(txt);
    this.pool.push({ text: txt, data });
  }

  update(now: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const { text: txt, data: f } = this.pool[i];
      const t = (now - f.t0) / f.duration;
      if (t >= 1) { this.removeChild(txt); txt.destroy(); this.pool.splice(i, 1); continue; }
      const a = animateFloater(f.style, t, f.dx || 0);
      txt.position.set(f.x + a.dx, f.y + a.dy);
      txt.scale.set(a.scale);
      txt.alpha = a.alpha;
    }
  }
}

function animateFloater(style: FloaterStyle, t: number, driftX: number) {
  switch (style) {
    case 'damage': {
      const pop = t < 0.08 ? easeOutBack(t / 0.08) : 1;
      const rise = t < 0.08 ? 0 : (t - 0.08) * 25;
      return { dx: driftX * t * 12, dy: -rise, scale: Math.max(0.5, pop * (t < 0.08 ? 1.4 : 1.4 - (t - 0.08) * 0.5)), alpha: t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1 };
    }
    case 'crit': {
      const squish = t < 0.06 ? 1.8 : t < 0.15 ? 1.8 - (t - 0.06) / 0.09 * 0.6 : 1.2 - (t - 0.15) * 0.3;
      return { dx: driftX * t * 10, dy: -(t < 0.1 ? 0 : (t - 0.1) * 20), scale: Math.max(0.6, squish), alpha: t > 0.5 ? 1 - (t - 0.5) / 0.5 : 1 };
    }
    case 'heal': {
      return { dx: 0, dy: -t * 35, scale: 1 + Math.sin(t * Math.PI * 4) * 0.1, alpha: t < 0.15 ? t / 0.15 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1 };
    }
    case 'skill': {
      const slideIn = t < 0.1 ? eq(t / 0.1) : 1;
      return { dx: (1 - slideIn) * -20, dy: -t * 20, scale: Math.max(0.6, t < 0.1 ? 0.8 + slideIn * 0.4 : 1.2 - (t - 0.1) * 0.3), alpha: t < 0.1 ? slideIn : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1 };
    }
    case 'kill': {
      const shake = t < 0.3 ? Math.sin(t * 80) * 2 * (1 - t / 0.3) : 0;
      return { dx: shake, dy: -t * 25, scale: Math.max(0.5, t < 0.1 ? easeOutBack(t / 0.1) * 1.3 : 1.3 - (t - 0.1) * 0.4), alpha: t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1 };
    }
    default: {
      return { dx: 0, dy: -t * 30, scale: Math.max(0.5, t < 0.15 ? 0.5 + t / 0.15 * 0.8 : 1.3 - t * 0.3), alpha: t < 0.2 ? t / 0.2 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1 };
    }
  }
}

// ── Announcement Container (screen-space) ──

interface ActiveAnnouncement { main: Text; sub?: Text; data: Announcement }

export class AnnouncementContainer extends Container {
  private pool: ActiveAnnouncement[] = [];

  addAnnouncement(text: string, color: string, subtext?: string, duration = 2500) {
    const data: Announcement = { text, subtext, color, t0: performance.now(), duration };
    const main = new Text({ text, style: { fontFamily: 'Anton, sans-serif', fontWeight: 'bold', fontSize: 32, fill: color } });
    main.anchor.set(0.5, 0.5);
    this.addChild(main);
    let sub: Text | undefined;
    if (subtext) {
      sub = new Text({ text: subtext, style: { fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: 16, fill: '#ffffff' } });
      sub.anchor.set(0.5, 0.5);
      this.addChild(sub);
    }
    this.pool.push({ main, sub, data });
  }

  update(now: number, screenW: number, screenH: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const { main, sub, data } = this.pool[i];
      const t = (now - data.t0) / data.duration;
      if (t >= 1) { this.removeChild(main); main.destroy(); if (sub) { this.removeChild(sub); sub.destroy(); } this.pool.splice(i, 1); continue; }
      let alpha: number, yOff: number, scale: number;
      if (t < 0.15) { alpha = t / 0.15; yOff = (1 - t / 0.15) * -30; scale = 0.8 + (t / 0.15) * 0.2; }
      else if (t < 0.7) { alpha = 1; yOff = 0; scale = 1; }
      else { const ft = (t - 0.7) / 0.3; alpha = 1 - ft; yOff = ft * 20; scale = 1 + ft * 0.1; }
      main.position.set(screenW / 2, screenH * 0.25 + yOff);
      main.scale.set(scale); main.alpha = alpha;
      if (sub) { sub.position.set(screenW / 2, screenH * 0.25 + yOff + 30); sub.alpha = alpha * 0.8; }
    }
  }
}

// ── FPS Text ──
export class FPSText extends Text {
  constructor() {
    super({ text: '0 FPS', style: { fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12, fill: 'rgba(255,255,255,0.5)' } });
    this.anchor.set(1, 0);
  }
  updateFPS(fps: number, screenW: number) { this.text = `${fps} FPS`; this.position.set(screenW - 8, 8); }
}
