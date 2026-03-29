/**
 * PixiRenderer — Main renderer class, replaces BattleRenderer.
 *
 * Exposes the exact same public API so ReplayEngine and ReplayView
 * can use it as a drop-in replacement.
 *
 * Architecture: PixiJS Application → Camera Container → Layers
 */
import { Application, Container, Sprite, Assets } from 'pixi.js';
import type { RenderEntity, Floater, FloaterStyle, VFXInstance, Announcement } from '../types';
import type { SpriteSet } from '../spriteCache';
import { Camera, HW, HH, TILE_W } from './Camera';
import { GroundLayer } from './GroundLayer';
import { EntityLayer } from './EntityLayer';
import { PoisonLayer, AttackRangeLayer, HoverLayer, FogOfWarLayer, TileIconLayer } from './FogLayer';
import { FloaterContainer, AnnouncementContainer, FPSText } from './OverlayLayer';
import { VFXLayer } from './VFXLayer';

const ENTITY_SIZE = 22;
const LERP_SPEED = 10;

export class BattleRenderer {
  // ── Public API (matches old BattleRenderer exactly) ──
  mapSize = 15;
  entities = new Map<number, RenderEntity>();
  floaters: Floater[] = [];
  vfx: VFXInstance[] = [];
  announcements: Announcement[] = [];
  tiles: Map<string, number> = new Map();
  poisonRadius = 20;
  selectedEid = -1;
  activeEid = -1;
  fogEnabled = false;
  myEid = -1;
  paused = false;
  fps = 0;
  entitySprites = new Map<number, SpriteSet>();

  get zoom() { return this.camera.zoom; }

  onHover?: (col: number, row: number, tileType: number, entity: RenderEntity | null) => void;
  onHoverLeave?: () => void;
  onClick?: (col: number, row: number, entity: RenderEntity | null) => void;
  onDblClick?: (col: number, row: number, entity: RenderEntity | null) => void;

  // ── Internal ──
  private app: Application;
  private camera = new Camera();
  private cameraContainer = new Container();

  // Layers (world-space, inside camera)
  private groundLayer: GroundLayer;
  private poisonLayer: PoisonLayer;
  private hoverLayer = new HoverLayer();
  private tileIconLayer = new TileIconLayer();
  private attackRangeLayer: AttackRangeLayer;
  private entityLayer = new EntityLayer();
  private fogLayer: FogOfWarLayer;
  private vfxLayer = new VFXLayer();
  private floaterContainer = new FloaterContainer();

  // Screen-space layers
  private announcementContainer = new AnnouncementContainer();
  private fpsText = new FPSText();

  // Input state
  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private dragMoved = false;
  private hoverCol = Infinity;
  private hoverRow = Infinity;

  // FPS tracking
  private fpsCount = 0;
  private fpsTime = 0;

  // Canvas reference for sizing
  private canvas: HTMLCanvasElement;
  private bgSprite: Sprite | null = null;
  private screenW = 1;
  private screenH = 1;
  private eventAC = new AbortController();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Create PixiJS Application
    this.app = new Application();

    // Layers
    this.groundLayer = new GroundLayer(this.mapSize);
    this.poisonLayer = new PoisonLayer(this.mapSize);
    this.attackRangeLayer = new AttackRangeLayer(this.mapSize);
    this.fogLayer = new FogOfWarLayer(this.mapSize);
  }

  /** Async init — must be called before start() */
  private async initApp() {
    const parent = this.canvas.parentElement!;

    await this.app.init({
      canvas: this.canvas,
      background: '#080910',
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    });

    // Background image
    this.bgSprite = new Sprite();
    this.bgSprite.label = 'bg';
    this.app.stage.addChild(this.bgSprite);
    Assets.load('/sprites/scene_bk.jpg').then(tex => {
      this.bgSprite!.texture = tex;
      this.fitBg();
    }).catch(() => {});

    // Build container tree
    // Camera container (world-space)
    this.groundLayer.alpha = 1;
    this.cameraContainer.addChild(
      this.groundLayer,
      this.poisonLayer,
      this.hoverLayer,
      this.tileIconLayer,
      this.attackRangeLayer,
      this.entityLayer,
      this.fogLayer,
      this.vfxLayer,
      this.floaterContainer,
    );
    this.app.stage.addChild(this.cameraContainer);

    // Screen-space overlays
    this.app.stage.addChild(this.announcementContainer);
    this.app.stage.addChild(this.fpsText);

    // Enable sorting for depth
    this.entityLayer.sortableChildren = true;

    this.setupEvents();

    // Preload assets in background — rendering starts immediately, VFX/icons appear when ready
    this.vfxLayer.preload();
    this.entityLayer.preload();
  }

  // ─── Events ───

  private setupEvents() {
    const c = this.canvas;
    const s = this.eventAC.signal;
    c.style.cursor = 'crosshair';

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = e.deltaY > 0 ? 0.97 : 1.03;
      this.camera.zoom = Math.max(2, Math.min(5, this.camera.zoom * d));
      this.camera.cancelLerp();
    }, { passive: false, signal: s });

    c.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      c.style.cursor = 'grabbing';
    }, { signal: s });

    c.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        const dx = e.clientX - this.dragX;
        const dy = e.clientY - this.dragY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          this.dragMoved = true;
          this.camera.cancelLerp();
        }
        this.camera.camX += dx / this.camera.zoom;
        this.camera.camY += dy / this.camera.zoom;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      } else {
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const [col, row] = this.camera.screenToTile(mx, my, this.screenW, this.screenH);
        const half = Math.floor(this.mapSize / 2);
        if (Math.abs(col) <= half && Math.abs(row) <= half) {
          this.hoverCol = col;
          this.hoverRow = row;
          if (this.onHover) {
            const tt = this.tiles.get(`${col},${row}`) || 0;
            let ent: RenderEntity | null = null;
            for (const en of this.entities.values()) {
              if (en.visible && en.col === col && en.row === row) { ent = en; break; }
            }
            this.onHover(col, row, tt, ent);
          }
        } else {
          if (this.hoverCol !== Infinity) { this.hoverCol = Infinity; this.hoverRow = Infinity; this.onHoverLeave?.(); }
        }
      }
    }, { signal: s });

    c.addEventListener('pointerup', (e) => {
      if (this.dragging) {
        this.dragging = false;
        c.style.cursor = 'crosshair';
        if (!this.dragMoved) {
          const rect = c.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const [col, row] = this.camera.screenToTile(mx, my, this.screenW, this.screenH);
          const half = Math.floor(this.mapSize / 2);
          const inMap = Math.abs(col) <= half && Math.abs(row) <= half;
          const ent = inMap ? this.findEntityAt(col, row) : null;
          this.onClick?.(col, row, ent);
        }
      }
    }, { signal: s });

    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [col, row] = this.camera.screenToTile(mx, my, this.screenW, this.screenH);
      const half = Math.floor(this.mapSize / 2);
      const inMap = Math.abs(col) <= half && Math.abs(row) <= half;
      const ent = inMap ? this.findEntityAt(col, row) : null;
      this.onDblClick?.(col, row, ent);
    }, { signal: s });

    c.addEventListener('pointerleave', () => {
      this.dragging = false;
      c.style.cursor = 'crosshair';
      if (this.hoverCol !== Infinity) { this.hoverCol = Infinity; this.hoverRow = Infinity; this.onHoverLeave?.(); }
    }, { signal: s });
  }

  private findEntityAt(col: number, row: number): RenderEntity | null {
    for (const e of this.entities.values()) {
      if (e.visible && e.col === col && e.row === row) return e;
    }
    return null;
  }

  // ─── Public API ───

  toScreen(col: number, row: number): [number, number] {
    return this.camera.toScreen(col, row);
  }

  focusOn(col: number, row: number) { this.camera.focusOn(col, row); }
  smoothFocusOn(col: number, row: number, targetZoom?: number) { this.camera.smoothFocusOn(col, row, targetZoom); }
  shake(intensity = 8, decay = 0.88) { this.camera.shake(intensity, decay); }
  markTilesDirty() { this.groundLayer.markDirty(); }

  addFloater(col: number, row: number, text: string, color: string, fontSize = 14, style: FloaterStyle = 'normal', dx = 0) {
    this.floaterContainer.addFloater(col, row, text, color, fontSize, style, dx, this.camera);
  }

  addVFX(type: string, fromCol: number, fromRow: number, toCol: number, toRow: number, color: string, duration = 400) {
    const [x, y] = this.camera.toScreen(fromCol, fromRow);
    const [tx, ty] = this.camera.toScreen(toCol, toRow);
    this.vfxLayer.addVFX(type, x, y, tx, ty, color, duration);
  }

  announce(text: string, color: string, subtext?: string, duration = 2500) {
    this.announcementContainer.addAnnouncement(text, color, subtext, duration);
  }

  private fitBg() {
    const bg = this.bgSprite;
    if (!bg || !bg.texture || this.screenW < 1) return;
    // cover: scale to fill, center
    const tw = bg.texture.width, th = bg.texture.height;
    const scale = Math.max(this.screenW / tw, this.screenH / th);
    bg.width = tw * scale;
    bg.height = th * scale;
    bg.x = (this.screenW - bg.width) / 2;
    bg.y = (this.screenH - bg.height) / 2;
  }

  resize(w: number, h: number) {
    this.screenW = Math.round(w);
    this.screenH = Math.round(h);
    if (this.app.renderer) {
      this.app.renderer.resize(this.screenW, this.screenH);
    }
    this.fitBg();
  }

  async start() {
    await this.initApp();

    // Apply stored size now that the renderer exists
    if (this.screenW > 1 && this.screenH > 1) {
      this.app.renderer.resize(this.screenW, this.screenH);
    }

    this.fpsTime = performance.now();
    this.app.ticker.add(() => {
      const now = performance.now();
      const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);

      // FPS
      this.fpsCount++;
      if (now - this.fpsTime >= 1000) {
        this.fps = this.fpsCount;
        this.fpsCount = 0;
        this.fpsTime = now;
      }

      if (!this.paused) this.updateEntities(dt);
      this.camera.update(dt);
      this.camera.applyTransform(this.cameraContainer, this.screenW, this.screenH);

      // Update layers
      const time = now / 1000;
      this.groundLayer.update(this.camera.camX, this.camera.camY, this.camera.zoom, this.screenW, this.screenH, time, this.tiles);
      this.poisonLayer.update(this.poisonRadius, this.camera, now);
      this.hoverLayer.update(this.hoverCol, this.hoverRow, this.camera);
      this.tileIconLayer.update(this.tiles, this.camera, time);
      this.attackRangeLayer.update(this.entities, this.activeEid, this.camera, now);
      this.entityLayer.update(this.entities, this.entitySprites, this.activeEid, this.selectedEid, this.myEid, this.camera, now);
      this.fogLayer.update(this.fogEnabled, this.entities, this.activeEid, this.camera);
      this.vfxLayer.update(now);
      this.floaterContainer.update(now);
      this.announcementContainer.update(now, this.screenW, this.screenH);
      this.fpsText.updateFPS(this.fps, this.screenW);
    });
  }

  stop() {
    this.eventAC.abort(); // Remove all canvas event listeners
    if (this.app.ticker) this.app.ticker.stop();
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private updateEntities(dt: number) {
    const now = performance.now();
    const dtMs = dt * 1000;
    for (const e of this.entities.values()) {
      if (!e.visible) continue;
      e.renderCol += (e.col - e.renderCol) * Math.min(1, LERP_SPEED * dt);
      e.renderRow += (e.row - e.renderRow) * Math.min(1, LERP_SPEED * dt);
      // Smooth facing
      let df = e.targetFacing - e.facing;
      if (df > Math.PI) df -= Math.PI * 2;
      if (df < -Math.PI) df += Math.PI * 2;
      e.facing += df * Math.min(1, 12 * dt);
      if (e.flashAlpha > 0) e.flashAlpha = Math.max(0, e.flashAlpha - dt * 4);
      if (e.attackAnim > 0) e.attackAnim = Math.max(0, e.attackAnim - dtMs);
      if (e.evolveBounce > 0) e.evolveBounce = Math.max(0, e.evolveBounce - dtMs);
      // Smooth exp ring
      const expDiff = e.exp - e.displayExp;
      if (Math.abs(expDiff) > 0.01) e.displayExp += expDiff * Math.min(1, 6 * dt);
      else e.displayExp = e.exp;
    }
  }
}
