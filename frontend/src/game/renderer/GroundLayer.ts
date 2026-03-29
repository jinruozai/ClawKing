/**
 * GroundLayer — Isometric ground grid.
 *
 * Strategy: Render ground to offscreen WebGL canvas (proven shader code),
 * then upload as PixiJS Sprite texture each frame.
 * This avoids fighting PixiJS's Mesh/Shader API while keeping everything
 * in a single PixiJS render tree.
 */
import { Container, Sprite, Texture, CanvasSource } from 'pixi.js';

// ── Glow colors ──
const GLOW_COLORS: Record<number, [number, number, number]> = {
  1: [239, 68, 68], 2: [234, 179, 8], 3: [59, 130, 246],
};

const GL_VS = `
attribute vec2 aP;
varying vec2 vPixel;
uniform vec2 uScreen;
void main(){
  vec2 clip=(aP/uScreen)*2.0-1.0;
  clip.y=-clip.y;
  gl_Position=vec4(clip,0.0,1.0);
  vPixel=aP;
}`;

const GL_FS = `
precision mediump float;
varying vec2 vPixel;
uniform vec2 uOffset;
uniform float uScale;
uniform vec2 uMapTiles;
uniform vec2 uTileSize;
uniform sampler2D uTex;
uniform float uGrid;
uniform float uTime;
uniform float uMapHalf;

float sT(vec2 cell){
  vec2 tc=cell+uMapHalf;
  if(tc.x<0.0||tc.x>=uMapTiles.x||tc.y<0.0||tc.y>=uMapTiles.y)return -1.0;
  vec2 uv=(floor(tc)+0.5)/uMapTiles;
  return floor(texture2D(uTex,uv).r*255.0+0.5);
}
vec3 sGlow(vec2 cell){
  vec2 tc=cell+uMapHalf;
  if(tc.x<0.0||tc.x>=uMapTiles.x||tc.y<0.0||tc.y>=uMapTiles.y)return vec3(0.0);
  vec2 uv=(floor(tc)+0.5)/uMapTiles;
  vec4 t=texture2D(uTex,uv);
  return vec3(t.g,t.b,t.a);
}
float layerOf(float ty){return ty<0.5?0.0:1.0;}
vec3 baseTileColor(vec2 tUV,vec2 screenPx,vec2 cell){
  float edDist=min(min(tUV.x,1.0-tUV.x),min(tUV.y,1.0-tUV.y));
  // 棋盘格深浅交替
  float checker=mod(cell.x+cell.y,2.0);
  vec3 dark=vec3(0.055,0.058,0.072);
  vec3 light=vec3(0.075,0.080,0.095);
  vec3 body=mix(dark,light,step(0.5,checker));
  // 中心 3×3 区域（cell 0,0 为中心）用深蓝紫色调
  float cx=abs(cell.x);float cy=abs(cell.y);
  if(cx<=1.0&&cy<=1.0){
    vec3 cDark=vec3(0.06,0.05,0.10);
    vec3 cLight=vec3(0.08,0.07,0.13);
    body=mix(cDark,cLight,step(0.5,checker));
  }
  // 扫描线
  float localY=(screenPx.y-uOffset.y)/uScale;
  float scanLine=fract(localY*0.5);
  float lineMask=1.0-smoothstep(0.35,0.5,scanLine)*(1.0-smoothstep(0.5,0.65,scanLine));
  body=mix(body,body*0.7,(1.0-lineMask)*0.3);
  // 边缘细线
  float trimCenter=0.055;float trimHalf=0.008;
  float trimMask=smoothstep(trimCenter-trimHalf*2.0,trimCenter-trimHalf,edDist)*(1.0-smoothstep(trimCenter+trimHalf,trimCenter+trimHalf*2.0,edDist));
  body=mix(body,vec3(0.14,0.15,0.18),trimMask*0.45);
  // 角落装饰点
  float dotR=0.055;
  float dd=min(length(tUV-vec2(0.84,0.84)),length(tUV-vec2(0.16,0.16)));
  body+=vec3(0.18,0.19,0.22)*smoothstep(dotR,0.0,dd)*0.5;
  return body;
}
vec3 specialTileColor(vec2 tUV,vec3 glow){
  vec3 base=glow*0.15;
  float cx=abs(tUV.x-0.5)*2.0;float cy=abs(tUV.y-0.5)*2.0;
  base+=glow*0.25*smoothstep(1.0,0.2,max(cx,cy));
  return base;
}
vec2 screenToTile(vec2 pixel){
  vec2 p=(pixel-uOffset)/uScale;
  float hw=uTileSize.x;float hh=uTileSize.y;
  return vec2(p.x/(2.0*hw)+p.y/(2.0*hh)+0.5, p.y/(2.0*hh)-p.x/(2.0*hw)+0.5);
}
void main(){
  vec2 tileF=screenToTile(vPixel);
  vec2 cell=floor(tileF);vec2 tUV=fract(tileF);
  float ty=sT(cell);
  if(ty<-0.5)discard;
  vec3 col;vec3 glow=sGlow(cell);
  bool isSpecial=ty>0.5;
  col=isSpecial?specialTileColor(tUV,glow):baseTileColor(tUV,vPixel,cell);
  float R=0.14;vec2 q=abs(tUV-0.5)-(0.5-R);
  if(q.x>0.0&&q.y>0.0){
    float d=length(q)-R;vec2 dir=sign(tUV-0.5);
    vec2 nH=cell+vec2(dir.x,0.0);float eH=sT(nH);float eV=sT(cell+vec2(0.0,dir.y));
    if(abs(eH-eV)<0.5){float lC=layerOf(ty);float lH=layerOf(eH);
      if(lH<lC){col=mix(col,eH>0.5?specialTileColor(tUV,sGlow(nH)):baseTileColor(tUV,vPixel,cell),smoothstep(-0.008,0.008,d));}
      else if(lH>lC){float eD=sT(cell+dir);if(abs(eD-ty)>0.5){col=mix(col,eH>0.5?specialTileColor(tUV,sGlow(nH)):baseTileColor(tUV,vPixel,cell),smoothstep(-0.008,0.008,d));}}}
  }
  if(uGrid>0.5){
    float isH=step(0.5,ty);
    float nL=sT(cell+vec2(-1,0));float nR=sT(cell+vec2(1,0));float nU=sT(cell+vec2(0,-1));float nD2=sT(cell+vec2(0,1));
    float hL=isH*step(0.5,nL);float hR=isH*step(0.5,nR);float hU=isH*step(0.5,nU);float hD=isH*step(0.5,nD2);
    float edL=mix(tUV.x,1.0,hL);float edR=mix(1.0-tUV.x,1.0,hR);float edU=mix(tUV.y,1.0,hU);float edD=mix(1.0-tUV.y,1.0,hD);
    float ed=min(min(edL,edR),min(edU,edD));
    col=mix(col,vec3(0.015,0.015,0.02),(1.0-smoothstep(0.0,0.03,ed))*0.95);
    float tl=(1.0-smoothstep(0.0,0.02,edU))*(1.0-hU)+(1.0-smoothstep(0.0,0.02,edL))*(1.0-hL);
    col+=vec3(0.04,0.042,0.05)*min(tl,1.0)*(1.0-isH)*0.5;
  }
  if(isSpecial){float rim=min(min(tUV.x,1.0-tUV.x),min(tUV.y,1.0-tUV.y));col+=glow*smoothstep(0.12,0.0,rim)*(0.2+0.08*sin(uTime*2.0));}
  vec2 mapUV=(tileF+uMapHalf)/uMapTiles;
  col*=0.92+0.08*smoothstep(0.0,0.06,mapUV.x)*smoothstep(0.0,0.06,1.0-mapUV.x)*smoothstep(0.0,0.04,mapUV.y)*smoothstep(0.0,0.04,1.0-mapUV.y);
  // 地图边缘圆角发光
  vec2 edgeP=abs(mapUV-0.5)*2.0; // 0~1, 1=边缘
  float cornerR=0.12;
  vec2 q2=max(edgeP-(1.0-cornerR),0.0);
  float edgeDist=1.0-max(edgeP.x,edgeP.y); // 直边距离
  float cornerDist=cornerR-length(q2); // 圆角距离
  float borderDist=min(edgeDist,cornerDist);
  float glow2=smoothstep(0.08,0.0,borderDist)*(0.35+0.1*sin(uTime*1.5));
  col+=vec3(0.15,0.25,0.5)*glow2; // 蓝紫色边缘光
  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
}`;

export class GroundLayer extends Container {
  private sprite: Sprite;
  private source: CanvasSource;
  private offscreen: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;
  private locs: Record<string, WebGLUniformLocation | number> = {};
  private vb!: WebGLBuffer;
  private tileTex: WebGLTexture | null = null;
  private tileTexDirty = true;
  private mapSize: number;
  private lastW = 0;
  private lastH = 0;

  constructor(mapSize: number) {
    super();
    this.mapSize = mapSize;
    this.offscreen = document.createElement('canvas');
    this.source = new CanvasSource({ resource: this.offscreen });
    const tex = new Texture({ source: this.source });
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0, 0);
    this.addChild(this.sprite);
    this.initGL();
  }

  private initGL() {
    const gl = this.offscreen.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) return;
    this.gl = gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, GL_VS);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, GL_FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.useProgram(prog);
    for (const n of ['aP','uScreen','uOffset','uScale','uMapTiles','uTileSize','uTex','uGrid','uTime','uMapHalf']) {
      this.locs[n] = n[0] === 'a' ? gl.getAttribLocation(prog, n) : gl.getUniformLocation(prog, n)!;
    }
    this.vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.DYNAMIC_DRAW);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locs.aP as number);
    gl.vertexAttribPointer(this.locs.aP as number, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.locs.uTex as WebGLUniformLocation, 0);
    gl.clearColor(0, 0, 0, 0);
  }

  private compileShader(type: number, src: string) {
    const gl = this.gl, s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }

  markDirty() { this.tileTexDirty = true; }

  private buildTileTex(tiles: Map<string, number>) {
    if (!this.gl) return;
    const gl = this.gl, size = this.mapSize, half = Math.floor(size / 2);
    const data = new Uint8Array(size * size * 4);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const pi = (r * size + c) * 4;
      const tt = tiles.get(`${c-half},${r-half}`) || 0;
      data[pi] = tt;
      const gc = GLOW_COLORS[tt];
      if (gc) { data[pi+1]=gc[0]; data[pi+2]=gc[1]; data[pi+3]=gc[2]; }
    }
    if (this.tileTex) gl.deleteTexture(this.tileTex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tileTex = tex;
    this.tileTexDirty = false;
  }

  update(camX: number, camY: number, zoom: number, screenW: number, screenH: number, time: number, tiles: Map<string, number>) {
    if (!this.gl) return;
    const w = Math.round(screenW), h = Math.round(screenH);
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (pw !== this.lastW || ph !== this.lastH) {
      this.offscreen.width = pw; this.offscreen.height = ph;
      this.gl.viewport(0, 0, pw, ph);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vb);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([0,0,pw,0,pw,ph,0,ph]), this.gl.DYNAMIC_DRAW);
      this.lastW = pw; this.lastH = ph;
    }
    if (this.tileTexDirty) this.buildTileTex(tiles);
    const gl = this.gl, L = this.locs;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(L.uScreen as WebGLUniformLocation, pw, ph);
    gl.uniform2f(L.uOffset as WebGLUniformLocation, pw/2+camX*zoom*dpr, ph/2+camY*zoom*dpr);
    gl.uniform1f(L.uScale as WebGLUniformLocation, zoom * dpr);
    gl.uniform2f(L.uMapTiles as WebGLUniformLocation, this.mapSize, this.mapSize);
    gl.uniform2f(L.uTileSize as WebGLUniformLocation, 24, 12);
    gl.uniform1f(L.uGrid as WebGLUniformLocation, 1);
    gl.uniform1f(L.uTime as WebGLUniformLocation, time);
    gl.uniform1f(L.uMapHalf as WebGLUniformLocation, Math.floor(this.mapSize/2));
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Upload to PixiJS texture
    this.source.update();

    // Position sprite to counter camera container transform (ground is screen-space)
    // Sprite native size = pw×ph pixels, but displayed at screenW×screenH CSS pixels
    this.sprite.position.set(-screenW/2/zoom - camX, -screenH/2/zoom - camY);
    this.sprite.scale.set(1/(zoom * dpr));
  }
}
