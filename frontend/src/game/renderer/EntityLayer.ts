/**
 * EntityLayer — Object pool + AnimatedSprite frame animation.
 * No per-frame allocations. Graphics.clear() + property updates only.
 */
import { Container, AnimatedSprite, Sprite, Texture, Graphics, Text, Assets } from 'pixi.js';
import type { RenderEntity } from '../types';
import { TYPE_PLAYER } from '../types';
import type { SpriteSet, SpriteFrame } from '../spriteCache';
import { Camera, HW, HH } from './Camera';

/** Parse color string (hex '#rrggbb' or 'rgb(r,g,b)') to numeric. */
function parseColor(c: string): number {
  if (c.startsWith('#')) return parseInt(c.slice(1), 16) || 0;
  const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return (+m[1] << 16) | (+m[2] << 8) | +m[3];
  return 0xffffff;
}

const S = 22;
const BAR_W = 28, BAR_H = 3;
const BADGE_R = 4, RING_R = BADGE_R + 1.5;
const LV_COLORS = [0xa1a1aa, 0x4ade80, 0x60a5fa, 0xa855f7, 0xfbbf24, 0xfb923c, 0xef4444];
const TEXT_RES = 4;
const ANIM_SPEED = { idle: 6 / 60, walking: 12 / 60, attacking: 12 / 60 };
const ICON_SIZE = 8;

type AnimState = 'idle' | 'walking' | 'attacking';

const DIAMOND_08 = [0, -HH * 0.8, HW * 0.8, 0, 0, HH * 0.8, -HW * 0.8, 0];
const DIAMOND_07 = [0, -HH * 0.7, HW * 0.7, 0, 0, HH * 0.7, -HW * 0.7, 0];

// Status flag bits → icon asset paths (debuffs only, displayed on targets)
const STATUS_ICONS: { bit: number; path: string }[] = [
  { bit: 0x0001, path: '/sprites/vfx/snare.png' },
  { bit: 0x0002, path: '/sprites/vfx/disarm.png' },
  { bit: 0x0004, path: '/sprites/vfx/blind.png' },
  { bit: 0x0008, path: '/sprites/vfx/silence.png' },
  { bit: 0x0200, path: '/sprites/vfx/thornmail.png' },
];

class EntityView extends Container {
  private below = new Graphics();
  private anim: AnimatedSprite;
  private hud = new Graphics();
  private nameText: Text;
  private lvText: Text;
  private blinkIcon: Sprite;
  private statusIcons: { bit: number; sprite: Sprite }[] = [];
  private statusTexMap: Map<number, Texture>;
  private layer: EntityLayer;

  private animState: AnimState = 'idle';
  private texSets: Record<AnimState, Texture[]> | null = null;
  spritesLoaded = false;

  constructor(layer: EntityLayer) {
    super();
    this.statusTexMap = layer.statusTexMap;
    this.layer = layer;
    this.anim = new AnimatedSprite({ textures: [Texture.EMPTY] });
    this.anim.anchor.set(0.5, 0.42);
    this.anim.animationSpeed = ANIM_SPEED.idle;
    this.anim.play();

    this.nameText = new Text({
      text: '',
      style: { fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: 6, fill: '#ffffff', stroke: { color: '#000000', width: 1.5 } },
      resolution: TEXT_RES,
    });
    this.nameText.anchor.set(0, 0.5);

    this.lvText = new Text({
      text: '',
      style: { fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: 6, fill: '#000000' },
      resolution: TEXT_RES,
    });
    this.lvText.anchor.set(0.5, 0.5);

    // Blink icon (texture updated lazily in update())
    this.blinkIcon = new Sprite(layer.blinkTex);
    this.blinkIcon.anchor.set(0.5, 0.5);
    this.blinkIcon.width = ICON_SIZE;
    this.blinkIcon.height = ICON_SIZE;
    this.blinkIcon.visible = false;

    // Status debuff icons (textures updated lazily in update())
    for (const { bit } of STATUS_ICONS) {
      const tex = layer.statusTexMap.get(bit) || Texture.EMPTY;
      const spr = new Sprite(tex);
      spr.anchor.set(0.5, 0.5);
      spr.width = ICON_SIZE;
      spr.height = ICON_SIZE;
      spr.visible = false;
      this.statusIcons.push({ bit, sprite: spr });
    }

    this.addChild(
      this.below, this.anim, this.hud,
      this.nameText, this.lvText, this.blinkIcon,
      ...this.statusIcons.map(s => s.sprite),
    );
  }

  loadSprites(set: SpriteSet, layer: EntityLayer) {
    this.texSets = {
      idle: layer.getTextures(set.idle),
      walking: layer.getTextures(set.walking),
      attacking: layer.getTextures(set.attacking),
    };
    this.spritesLoaded = true;
    this.anim.textures = this.texSets.idle;
    this.anim.gotoAndPlay(0);
  }

  private switchAnim(state: AnimState) {
    if (this.animState === state || !this.texSets) return;
    this.animState = state;
    this.anim.textures = this.texSets[state];
    this.anim.animationSpeed = ANIM_SPEED[state];
    this.anim.loop = state !== 'attacking';
    this.anim.gotoAndPlay(0);
  }

  update(e: RenderEntity, activeEid: number, selectedEid: number, myEid: number, camera: Camera, now: number) {
    const [x, y] = camera.toScreen(e.renderCol, e.renderRow);
    this.position.set(x, y);

    // Animation state
    const isAttacking = e.attackAnim > 0;
    const isMoving = !isAttacking && (Math.abs(e.renderCol - e.col) > 0.05 || Math.abs(e.renderRow - e.row) > 0.05);
    this.switchAnim(isAttacking ? 'attacking' : isMoving ? 'walking' : 'idle');

    // Scale
    let sc = e.scale;
    if (e.attackAnim > 0) {
      const p = 1 - e.attackAnim / 400;
      sc *= p < 0.25 ? 1 + 0.3 * (p / 0.25) : 1.3 - 0.3 * ((p - 0.25) / 0.75);
    }
    if (e.evolveBounce > 0) {
      const p = 1 - e.evolveBounce / 500;
      sc *= 1 + 0.4 * Math.sin(p * Math.PI) * (1 - p);
    }

    // ── Below: indicators + shadow ──
    const g = this.below;
    g.clear();
    if (e.eid === activeEid) {
      const a = 0.6 + 0.3 * Math.sin(now * 0.004);
      g.poly(DIAMOND_08).stroke({ width: 2.5, color: 0xfbbf24, alpha: a });
      g.poly(DIAMOND_08).fill({ color: 0xfbbf24, alpha: a * 0.1 });
    }
    if (e.eid === selectedEid) {
      const a = 0.5 + 0.3 * Math.sin(now * 0.005);
      g.poly(DIAMOND_07).stroke({ width: 2, color: 0x66ffcc, alpha: a });
    }
    g.ellipse(0, S * 0.4 * sc, S * 0.5 * sc, S * 0.12 * sc).fill({ color: 0x000000, alpha: 0.3 });

    // ── Sprite ──
    this.anim.visible = !!this.texSets;
    if (this.texSets) {
      const gdx = Math.cos(e.facing), gdy = Math.sin(e.facing);
      this.anim.rotation = Math.atan2(gdx + gdy, (gdx - gdy) * 2) + Math.PI / 2;
      const sz = S * 1.68 * sc;
      this.anim.width = sz;
      this.anim.height = sz;
      this.anim.alpha = e.alpha;
    }

    // ── HUD ──
    const h = this.hud;
    h.clear();
    this.nameText.visible = false;
    this.lvText.visible = false;
    this.blinkIcon.visible = false;
    for (const si of this.statusIcons) si.sprite.visible = false;

    if (e.flashAlpha > 0) {
      h.circle(0, -S * 0.1 * sc, S * 0.5 * sc)
       .fill({ color: parseColor(e.flashColor), alpha: e.flashAlpha * 0.5 });
    }

    if (e.type !== TYPE_PLAYER || e.hp <= 0) return;

    const by = -S - 6;
    const badgeX = -BAR_W / 2 - RING_R - 1;
    const cy = by - 2;

    // Exp ring + level circle
    let expIn = e.displayExp;
    for (let i = 0; i < e.level; i++) expIn -= (10 + i * 5);
    const expPct = Math.max(0, Math.min(expIn / (10 + e.level * 5), 1));

    h.circle(badgeX, cy, RING_R).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
    if (expPct > 0) {
      h.beginPath().arc(badgeX, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * expPct)
       .stroke({ width: 1.5, color: 0xf59e0b });
    }
    h.circle(badgeX, cy, BADGE_R).fill({ color: LV_COLORS[Math.min(e.level, 6)] });

    // HP bar
    const hx = -BAR_W / 2, hy = by + 3;
    const pct = Math.max(0, e.hp / e.maxHp);
    h.rect(hx, hy, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    h.rect(hx, hy, BAR_W * pct, BAR_H).fill({ color: pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xeab308 : 0xef4444 });
    if (e.maxHp > 1 && e.maxHp <= 60) {
      for (let j = 1; j < e.maxHp; j++) {
        const gx = hx + (BAR_W * j) / e.maxHp;
        h.moveTo(gx, hy).lineTo(gx, hy + BAR_H).stroke({ width: 0.5, color: 0x000000, alpha: 0.4 });
      }
    }
    h.rect(hx, hy, BAR_W, BAR_H).stroke({ width: 0.5, color: 0xffffff, alpha: 0.2 });

    // Mana bar
    if (e.maxMana > 0) {
      const my = hy + BAR_H + 1, mH = 2;
      const mp = Math.min(e.mana / e.maxMana, 1);
      h.rect(hx, my, BAR_W, mH).fill({ color: 0x000000, alpha: 0.5 });
      h.rect(hx, my, BAR_W * mp, mH).fill({ color: mp >= 1 ? 0xd946ef : 0x60a5fa });
    }

    // Exposure diamonds
    if (e.exposure > 0) {
      const cnt = Math.min(e.exposure, 5), t = now / 1000;
      const ox = -cnt * 4 + 4, oy = S - 8;
      for (let j = 0; j < cnt; j++) {
        const a = 0.7 + 0.3 * Math.sin(t * 4 + j * 1.5);
        const cx = ox + j * 8;
        h.poly([cx, oy - 3, cx + 2.5, oy, cx, oy + 3, cx - 2.5, oy]).fill({ color: 0xef4444, alpha: a });
      }
    }

    // ── Name + Level text ──
    this.nameText.visible = true;
    if (this.nameText.text !== e.name) this.nameText.text = e.name;
    const fill = e.eid === myEid ? '#4ade80' : '#ffffff';
    if (this.nameText.style.fill !== fill) this.nameText.style.fill = fill;
    this.nameText.position.set(badgeX + RING_R + 2, cy);

    this.lvText.visible = true;
    const lvStr = `${e.level + 1}`;
    if (this.lvText.text !== lvStr) this.lvText.text = lvStr;
    this.lvText.position.set(badgeX, cy);

    // ── Blink icon (right of name) ──
    this.blinkIcon.visible = e.blinkCooldown <= 0;
    if (this.blinkIcon.visible) {
      const nameRight = badgeX + RING_R + 2 + (this.nameText.width || 20);
      this.blinkIcon.position.set(nameRight + ICON_SIZE / 2 + 1, cy);
    }

    // ── Status icons (above name, centered row) ──
    const flags = e.statusFlags || 0;
    let activeCount = 0;
    for (const si of this.statusIcons) {
      if ((flags & si.bit) !== 0) activeCount++;
    }
    if (activeCount > 0) {
      const totalW = activeCount * (ICON_SIZE + 1) - 1;
      let ix = -totalW / 2;
      const iy = cy - ICON_SIZE - 3;
      for (const si of this.statusIcons) {
        if ((flags & si.bit) !== 0) {
          // Update texture lazily (preload may have completed after construction)
          const latestTex = this.statusTexMap.get(si.bit);
          if (latestTex && si.sprite.texture !== latestTex) si.sprite.texture = latestTex;
          si.sprite.visible = true;
          si.sprite.position.set(ix + ICON_SIZE / 2, iy);
          ix += ICON_SIZE + 1;
        }
      }
    }

    // Update blink icon texture lazily (preload may complete after construction)
    if (this.blinkIcon.visible && this.layer.blinkTex !== Texture.EMPTY && this.blinkIcon.texture !== this.layer.blinkTex) {
      this.blinkIcon.texture = this.layer.blinkTex;
    }
  }
}

export class EntityLayer extends Container {
  private pool = new Map<number, EntityView>();
  private texCache = new Map<SpriteFrame, Texture>();
  blinkTex = Texture.EMPTY;
  statusTexMap = new Map<number, Texture>();

  async preload() {
    this.blinkTex = await Assets.load('/sprites/vfx/flash.png') as Texture;
    for (const { bit, path } of STATUS_ICONS) {
      this.statusTexMap.set(bit, await Assets.load(path) as Texture);
    }
  }

  getTextures(frames: SpriteFrame[]): Texture[] {
    return frames.map(f => {
      let t = this.texCache.get(f);
      if (!t) { t = Texture.from(f as any); this.texCache.set(f, t); }
      return t;
    });
  }

  update(
    entities: Map<number, RenderEntity>,
    sprites: Map<number, SpriteSet>,
    activeEid: number, selectedEid: number, myEid: number,
    camera: Camera, now: number,
  ) {
    for (const v of this.pool.values()) v.visible = false;

    const sorted = [...entities.values()]
      .filter(e => e.visible)
      .sort((a, b) => (a.renderCol + a.renderRow) - (b.renderCol + b.renderRow));

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      let view = this.pool.get(e.eid);
      if (!view) {
        view = new EntityView(this);
        this.pool.set(e.eid, view);
        this.addChild(view);
      }
      const ss = sprites.get(e.eid);
      if (ss && !view.spritesLoaded) view.loadSprites(ss, this);
      view.visible = true;
      view.zIndex = i;
      view.update(e, activeEid, selectedEid, myEid, camera, now);
    }
  }
}
