/**
 * PixiJS v8 验证 Demo — 在浏览器 console 中运行验证 API
 * 用法: import('./game/renderer/demo').then(m => m.runDemo(document.querySelector('canvas')))
 */
import { Application, Graphics, Text, Sprite, Texture, Container, Mesh, MeshGeometry, Shader, GlProgram } from 'pixi.js';

export async function runDemo(canvas: HTMLCanvasElement) {
  const app = new Application();
  await app.init({
    canvas,
    background: '#1a1a2e',
    width: 800,
    height: 600,
    preference: 'webgl',
  });

  // ── 1. Graphics: 菱形 + 矩形 + 圆 ──
  const g = new Graphics();
  // 菱形 (diamond)
  g.moveTo(400, 200).lineTo(450, 225).lineTo(400, 250).lineTo(350, 225).closePath()
   .fill({ color: 0x66ffcc, alpha: 0.3 })
   .stroke({ width: 2, color: 0x66ffcc, alpha: 0.8 });

  // 矩形 (HP bar)
  g.rect(360, 270, 80, 6).fill({ color: 0x333333 });
  g.rect(360, 270, 60, 6).fill({ color: 0x22c55e });
  g.rect(360, 270, 80, 6).stroke({ width: 0.5, color: 0xffffff, alpha: 0.3 });

  // 圆 (level badge) — 注意 arc 后不能直接 stroke，要用 circle
  g.circle(355, 260, 5).fill({ color: 0xfbbf24 });

  // 弧形 (exp ring) — arc 单独画
  g.arc(355, 260, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.2)
   .stroke({ width: 1.5, color: 0xf59e0b });

  app.stage.addChild(g);

  // ── 2. Text ──
  const text = new Text({
    text: '幽灵虾 Lv2',
    style: {
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      fontSize: 12,
      fill: '#ffffff',
      stroke: { color: '#000000', width: 2 },
    },
  });
  text.anchor.set(0.5, 1);
  text.position.set(400, 258);
  app.stage.addChild(text);

  // ── 3. Sprite from Canvas ──
  const offscreen = document.createElement('canvas');
  offscreen.width = 64; offscreen.height = 64;
  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = '#ff6600';
  ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('龙', 32, 40);

  const sprite = new Sprite(Texture.from(offscreen));
  sprite.anchor.set(0.5);
  sprite.position.set(400, 225);
  sprite.scale.set(0.5);
  app.stage.addChild(sprite);

  // ── 4. Container + zIndex ──
  const container = new Container();
  const bg = new Graphics();
  bg.rect(300, 300, 200, 100).fill({ color: 0x222244 }).stroke({ width: 1, color: 0x4444aa });
  container.addChild(bg);
  const label = new Text({ text: 'zIndex test', style: { fontSize: 14, fill: '#aaaaff' } });
  label.position.set(350, 340);
  container.addChild(label);
  app.stage.addChild(container);

  if (import.meta.env.DEV) console.log('PixiJS v8 demo running.');
  return app;
}
