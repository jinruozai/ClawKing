/**
 * FogLayer — Fog of war, Poison ring, Attack range, Hover highlight, Tile icons
 * PixiJS v8 Graphics: shape().fill().stroke() pattern
 */
import { Container, Graphics } from 'pixi.js';
import type { RenderEntity } from '../types';
import { Camera, HW, HH } from './Camera';

function diamondPts(cx: number, cy: number, hw: number, hh: number): number[] {
  return [cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy];
}

// ── Poison Ring ──
export class PoisonLayer extends Container {
  private gfx = new Graphics();
  private mapSize: number;
  constructor(mapSize: number) { super(); this.mapSize = mapSize; this.addChild(this.gfx); }

  update(poisonRadius: number, camera: Camera, now: number) {
    this.gfx.clear();
    const half = Math.floor(this.mapSize / 2);
    if (poisonRadius >= half) return;
    const pulse = 0.12 + 0.04 * Math.sin(now * 0.003);
    for (let c = -half; c <= half; c++) {
      for (let r = -half; r <= half; r++) {
        if (Math.max(Math.abs(c), Math.abs(r)) > poisonRadius) {
          const [x, y] = camera.toScreen(c, r);
          this.gfx.poly(diamondPts(x, y, HW, HH)).fill({ color: 0xa028c8, alpha: pulse });
        }
      }
    }
    const borderAlpha = 0.4 + 0.2 * Math.sin(now * 0.004);
    for (let c = -poisonRadius; c <= poisonRadius; c++) {
      for (let r = -poisonRadius; r <= poisonRadius; r++) {
        if (Math.abs(c) === poisonRadius || Math.abs(r) === poisonRadius) {
          const [x, y] = camera.toScreen(c, r);
          this.gfx.poly(diamondPts(x, y, HW, HH)).stroke({ width: 2, color: 0xc83cff, alpha: borderAlpha });
        }
      }
    }
  }
}

// ── Attack Range ──
export class AttackRangeLayer extends Container {
  private gfx = new Graphics();
  private mapSize: number;
  constructor(mapSize: number) { super(); this.mapSize = mapSize; this.addChild(this.gfx); }

  update(entities: Map<number, RenderEntity>, activeEid: number, camera: Camera, now: number) {
    this.gfx.clear();
    const active = entities.get(activeEid);
    if (!active || !active.visible) return;
    const half = Math.floor(this.mapSize / 2);
    const ac = Math.round(active.renderCol), ar = Math.round(active.renderRow);
    const range = active.atkRange;
    const pulse = 0.08 + 0.04 * Math.sin(now * 0.003);
    for (let c = ac - range; c <= ac + range; c++) {
      for (let r = ar - range; r <= ar + range; r++) {
        if (Math.abs(c) > half || Math.abs(r) > half) continue;
        const dist = Math.max(Math.abs(c - ac), Math.abs(r - ar));
        if (dist > range || dist === 0) continue;
        const [x, y] = camera.toScreen(c, r);
        this.gfx.poly(diamondPts(x, y, HW, HH)).fill({ color: 0xef4444, alpha: pulse });
      }
    }
    const borderAlpha = 0.25 + 0.1 * Math.sin(now * 0.004);
    for (let c = ac - range; c <= ac + range; c++) {
      for (let r = ar - range; r <= ar + range; r++) {
        if (Math.abs(c) > half || Math.abs(r) > half) continue;
        if (Math.max(Math.abs(c - ac), Math.abs(r - ar)) === range) {
          const [x, y] = camera.toScreen(c, r);
          this.gfx.poly(diamondPts(x, y, HW, HH)).stroke({ width: 1.5, color: 0xef4444, alpha: borderAlpha });
        }
      }
    }
  }
}

// ── Hover Highlight ──
export class HoverLayer extends Container {
  private gfx = new Graphics();
  constructor() { super(); this.addChild(this.gfx); }

  update(hoverCol: number, hoverRow: number, camera: Camera) {
    this.gfx.clear();
    if (hoverCol === Infinity) return;
    const [x, y] = camera.toScreen(hoverCol, hoverRow);
    this.gfx.poly(diamondPts(x, y, HW, HH))
         .fill({ color: 0x66ffcc, alpha: 0.08 })
         .stroke({ width: 1.5, color: 0x66ffcc, alpha: 0.6 });
  }
}

// ── Fog of War ──
export class FogOfWarLayer extends Container {
  private gfx = new Graphics();
  private mapSize: number;
  constructor(mapSize: number) { super(); this.mapSize = mapSize; this.addChild(this.gfx); }

  update(fogEnabled: boolean, entities: Map<number, RenderEntity>, activeEid: number, camera: Camera) {
    this.gfx.clear();
    if (!fogEnabled) return;
    const active = entities.get(activeEid);
    if (!active || !active.visible) return;
    const half = Math.floor(this.mapSize / 2);
    const ac = Math.round(active.renderCol), ar = Math.round(active.renderRow);
    const vision = active.vision;
    const exposed: { col: number; row: number; exp: number }[] = [];
    for (const e of entities.values()) {
      if (e.visible && e.exposure > 0 && e.eid !== activeEid) {
        exposed.push({ col: Math.round(e.renderCol), row: Math.round(e.renderRow), exp: e.exposure });
      }
    }
    for (let c = -half; c <= half; c++) {
      for (let r = -half; r <= half; r++) {
        if (Math.max(Math.abs(c - ac), Math.abs(r - ar)) <= vision) continue;
        let inExposure = false;
        for (const ex of exposed) {
          if (Math.max(Math.abs(c - ex.col), Math.abs(r - ex.row)) <= ex.exp) { inExposure = true; break; }
        }
        if (inExposure) continue;
        const [x, y] = camera.toScreen(c, r);
        this.gfx.poly(diamondPts(x, y, HW, HH)).fill({ color: 0x000000, alpha: 0.45 });
      }
    }
  }
}

// ── Tile Icons ──
export class TileIconLayer extends Container {
  private gfx = new Graphics();
  constructor() { super(); this.addChild(this.gfx); }

  update(tiles: Map<string, number>, camera: Camera, time: number) {
    this.gfx.clear();
    const COLORS: Record<number, number> = { 1: 0xef4444, 2: 0xeab308, 3: 0x3b82f6 };
    for (const [key, tt] of tiles) {
      if (tt <= 0) continue;
      const color = COLORS[tt];
      if (color === undefined) continue;
      const [cs, rs] = key.split(',');
      const c = parseInt(cs), r = parseInt(rs);
      const [x, y] = camera.toScreen(c, r);
      const alpha = 0.6 + Math.sin(time * 2 + c * 0.5) * 0.15;
      const s = 5;
      if (tt === 1) {
        this.gfx.poly([x, y - s * 1.8, x - s * 0.2, y - s * 0.2, x + s * 0.2, y - s * 0.2])
                .fill({ color, alpha });
      } else if (tt === 2) {
        this.gfx.poly([x, y - s * 1.2, x + s * 0.9, y - s * 0.5, x + s * 0.9, y + s * 0.2, x, y + s * 1.2, x - s * 0.9, y + s * 0.2, x - s * 0.9, y - s * 0.5])
                .stroke({ width: 1.2, color, alpha });
      } else if (tt === 3) {
        this.gfx.circle(x, y, s * 0.8).stroke({ width: 1.2, color, alpha });
      }
    }
  }
}
