/**
 * VFXLayer — Spritesheet-based VFX (slash, fireball, hit).
 * Preloads 3 sheets, creates AnimatedSprites on demand.
 */
import { Container, AnimatedSprite, Texture, Rectangle, Assets } from 'pixi.js';

interface SheetDef {
  path: string;
  cols: number; rows: number;
  fw: number; fh: number;
  additive: boolean;
  size: number; // display size in world px
}

const SHEETS: Record<string, SheetDef> = {
  slash:    { path: '/sprites/vfx/slash.png',    cols: 5, rows: 2, fw: 128, fh: 128, additive: false, size: 38 },
  fireball: { path: '/sprites/vfx/fireball.png', cols: 4, rows: 4, fw: 64,  fh: 64,  additive: true,  size: 22 },
  hit:      { path: '/sprites/vfx/hit.png',      cols: 7, rows: 1, fw: 48,  fh: 48,  additive: false, size: 28 },
  stun:     { path: '/sprites/vfx/stun.png',     cols: 2, rows: 3, fw: 64,  fh: 50,  additive: true,  size: 26 },
  levelup:  { path: '/sprites/vfx/levelup.png',  cols: 4, rows: 3, fw: 128, fh: 128, additive: true,  size: 36 },
};

const TYPE_MAP: Record<string, string> = {
  claw_slash: 'slash',
  claw_projectile: 'fireball',
  hit_vfx: 'hit',
  skill_hit_vfx: 'hit',
  stun_vfx: 'stun',
  evolve_glow: 'levelup',
};

interface ActiveVFX {
  sprite: AnimatedSprite;
  t0: number;
  duration: number;
  fx: number; fy: number;
  tx: number; ty: number;
  projectile: boolean;
}

export class VFXLayer extends Container {
  private frames: Record<string, Texture[]> = {};
  private active: ActiveVFX[] = [];

  async preload() {
    for (const [key, def] of Object.entries(SHEETS)) {
      const tex = await Assets.load(def.path) as Texture;
      const arr: Texture[] = [];
      for (let r = 0; r < def.rows; r++) {
        for (let c = 0; c < def.cols; c++) {
          arr.push(new Texture({ source: tex.source, frame: new Rectangle(c * def.fw, r * def.fh, def.fw, def.fh) }));
        }
      }
      this.frames[key] = arr;
    }
  }

  addVFX(type: string, x: number, y: number, tx: number, ty: number, _color: string, duration: number) {
    const key = TYPE_MAP[type];
    if (!key) return;
    const texArr = this.frames[key];
    if (!texArr?.length) return;

    const def = SHEETS[key];
    const projectile = type === 'claw_projectile';

    const spr = new AnimatedSprite(texArr);
    spr.anchor.set(0.5, 0.5);
    spr.width = def.size;
    spr.height = def.size;
    spr.animationSpeed = texArr.length / (duration / 1000) / 60;
    spr.loop = false;
    spr.position.set(projectile ? x : tx, projectile ? y : ty);
    if (def.additive) spr.blendMode = 'add';

    // Face from → to
    if (x !== tx || y !== ty) {
      spr.rotation = Math.atan2(ty - y, tx - x);
    }

    spr.play();
    this.addChild(spr);
    this.active.push({ sprite: spr, t0: performance.now(), duration, fx: x, fy: y, tx, ty, projectile });
  }

  update(now: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const v = this.active[i];
      const t = (now - v.t0) / v.duration;
      if (t >= 1) {
        this.removeChild(v.sprite);
        v.sprite.destroy();
        this.active.splice(i, 1);
        continue;
      }
      if (v.projectile) {
        v.sprite.position.set(v.fx + (v.tx - v.fx) * t, v.fy + (v.ty - v.fy) * t);
      }
    }
  }
}
