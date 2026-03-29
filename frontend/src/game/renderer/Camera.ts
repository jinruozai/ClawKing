export const TILE_W = 48;
export const TILE_H = 24;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;

export class Camera {
  camX = 0;
  camY = 0;
  zoom = 3.0;
  private camTargetX = 0;
  private camTargetY = 0;
  private camZoomTarget = 3.0;
  private camLerping = false;
  private shakeIntensity = 0;
  private shakeDecay = 0;
  shakeX = 0;
  shakeY = 0;

  /** Isometric transform: grid (col,row) to screen (x,y) */
  toScreen(col: number, row: number): [number, number] {
    return [(col - row) * HW, (col + row) * HH];
  }

  /** Screen pixel to grid tile (diamond-accurate picking) */
  screenToTile(px: number, py: number, screenW: number, screenH: number): [number, number] {
    const wx = (px - screenW / 2) / this.zoom - this.camX;
    const wy = (py - screenH / 2) / this.zoom - this.camY;
    const col = wx / TILE_W + wy / TILE_H;
    const row = wy / TILE_H - wx / TILE_W;

    let bestCol = Math.round(col);
    let bestRow = Math.round(row);
    let bestDist = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = Math.floor(col) + dc;
        const cr = Math.floor(row) + dr;
        const [sx, sy] = this.toScreen(cc, cr);
        const d = Math.abs(wx - sx) / HW + Math.abs(wy - sy) / HH;
        if (d < bestDist && d <= 1.0) {
          bestDist = d;
          bestCol = cc;
          bestRow = cr;
        }
      }
    }
    return [bestCol, bestRow];
  }

  focusOn(col: number, row: number) {
    const [sx, sy] = this.toScreen(col, row);
    this.camX = -sx;
    this.camY = -sy;
    this.camTargetX = this.camX;
    this.camTargetY = this.camY;
  }

  smoothFocusOn(col: number, row: number, targetZoom?: number) {
    const [sx, sy] = this.toScreen(col, row);
    this.camTargetX = -sx;
    this.camTargetY = -sy;
    this.camLerping = true;
    if (targetZoom != null) this.camZoomTarget = targetZoom;
  }

  shake(intensity: number, decay: number) {
    this.shakeIntensity = intensity;
    this.shakeDecay = decay;
  }

  update(dt: number) {
    // Smooth camera pan
    if (this.camLerping) {
      const speed = 6;
      this.camX += (this.camTargetX - this.camX) * Math.min(1, speed * dt);
      this.camY += (this.camTargetY - this.camY) * Math.min(1, speed * dt);
      this.zoom += (this.camZoomTarget - this.zoom) * Math.min(1, speed * dt);
      if (
        Math.abs(this.camTargetX - this.camX) < 0.5 &&
        Math.abs(this.camTargetY - this.camY) < 0.5
      ) {
        this.camX = this.camTargetX;
        this.camY = this.camTargetY;
        this.zoom = this.camZoomTarget;
        this.camLerping = false;
      }
    }

    // Shake decay
    if (this.shakeIntensity > 0.1) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }
  }

  /** Apply transform to a PixiJS Container */
  applyTransform(
    container: {
      position: { set(x: number, y: number): void };
      scale: { set(v: number): void };
    },
    screenW: number,
    screenH: number,
  ) {
    container.position.set(
      screenW / 2 + this.camX * this.zoom + this.shakeX,
      screenH / 2 + this.camY * this.zoom + this.shakeY,
    );
    container.scale.set(this.zoom);
  }

  cancelLerp() {
    this.camLerping = false;
  }
}
