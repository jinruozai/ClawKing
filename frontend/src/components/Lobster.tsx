import React from 'react';

// ── RGB 类型 ──
export type RGB = [number, number, number]; // [R, G, B] 0-255

// ── 新版：每部位独立 RGB + 全局辅色 ──
export interface LobsterPartColors {
  shell: RGB;   // 甲壳 — 对应 HP
  claw: RGB;    // 钳子 — 对应 ATK
  leg: RGB;     // 腿   — 对应 Speed
  eye: RGB;     // 眼睛 — 对应 Range
  tail: RGB;    // 尾巴 — 对应 Mana
  aura: RGB;    // 光晕 — 对应 Power
  sub: RGB;     // 全局辅色（混入所有部位的渐变辅色）
}

// ── 从 RGB 主色 → 渲染用渐变色组 ──
// 核心公式：v * (v/max)^power * factor
// power 控制饱和度增强，factor 控制整体明暗
function rgb(c: RGB): string { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function lighten(c: RGB, t: number): RGB { return [Math.min(255,Math.round(c[0]+(255-c[0])*t)), Math.min(255,Math.round(c[1]+(255-c[1])*t)), Math.min(255,Math.round(c[2]+(255-c[2])*t))]; }

/** 饱和暗化：v * (v/max)^power * factor */
function satDarken(c: RGB, power: number, factor: number): RGB {
  const mx = Math.max(c[0], c[1], c[2]) || 1;
  return [
    Math.round(c[0] * Math.pow(c[0] / mx, power) * factor),
    Math.round(c[1] * Math.pow(c[1] / mx, power) * factor),
    Math.round(c[2] * Math.pow(c[2] / mx, power) * factor),
  ] as RGB;
}

function partColors(main: RGB) {
  return {
    primary:   rgb(main),
    mid:       rgb(satDarken(main, 1, 0.8)),   // 甲壳中间色
    dark:      rgb(satDarken(main, 1, 0.3)),   // 甲壳暗色
    clawEnd:   rgb(satDarken(main, 1, 0.5)),   // 钳子终点
    legEnd:    rgb(satDarken(main, 4, 1.0)),   // 腿终点：v⁵/max⁴ 强饱和
    highlight: rgb(lighten(main, 0.4)),         // 高光/包边色
    stroke:    rgb(lighten(main, 0.25)),         // 描边色（偏暖高光）
  };
}

// ── 属性 → 部位缩放 ──
function lerp(value: number, min: number, max: number, outMin: number, outMax: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return outMin + t * (outMax - outMin);
}

export interface LobsterStats {
  hp: number; atk: number; speed: number;
  atkRange: number; manaMax: number; skillPower: number;
}

function statsToBodyShape(stats: LobsterStats) {
  return {
    clawScale:    lerp(stats.atk, 1, 11, 0.6, 1.6),
    headScale:    lerp(stats.hp, 10, 40, 0.8, 1.4),
    legScale:     lerp(stats.speed, 0, 5, 0.8, 1.5),
    antennaScale: lerp(stats.atkRange, 1, 4, 0.4, 1.5),
    coreScale:    lerp(stats.manaMax, 3, 6, 0.8, 1.5),
    tailScale:    lerp(stats.skillPower, 1, 10, 0.6, 1.6),
  };
}

// ── 从 LobsterPartColors 生成完整 LobsterTheme ──
export function partColorsToTheme(parts: LobsterPartColors, stats?: LobsterStats): LobsterTheme {
  const s = partColors(parts.shell);
  const c = partColors(parts.claw);
  const l = partColors(parts.leg);
  const t = partColors(parts.tail);
  const body = stats ? statsToBodyShape(stats) : undefined;
  return {
    coreColors: [s.primary, s.mid, s.dark],
    highlightColors: [l.primary, l.legEnd],          // 腿渐变：亮 → 饱和暗（老版用 highlightColors 给腿）
    clawColors: [c.primary, c.clawEnd],
    tailColors: [t.primary, t.mid, t.dark],
    strokeColor: s.stroke,                            // 各部位包边色（从甲壳高光推算）
    neonAntenna: rgb(parts.aura),
    neonEye: rgb(parts.eye),
    eyeHighlight: partColors(parts.eye).highlight,
    innerCutout: s.dark,
    carapaceInner: s.mid,
    clawScale: body?.clawScale,
    headScale: body?.headScale,
    legScale: body?.legScale,
    antennaScale: body?.antennaScale,
    coreScale: body?.coreScale,
    tailScale: body?.tailScale,
  };
}

// ── LobsterTheme（渲染用） ──
export interface LobsterTheme {
  coreColors: [string, string, string];
  highlightColors: [string, string];    // 腿渐变 [亮, 暗]
  clawColors: [string, string];
  tailColors?: [string, string, string];
  strokeColor?: string;                  // 各部位描边/包边色
  neonAntenna: string;
  neonEye: string;
  eyeHighlight?: string;
  innerCutout: string;
  carapaceInner: string;
  clawScale?: number;
  headScale?: number;
  legScale?: number;
  antennaScale?: number;
  coreScale?: number;
  tailScale?: number;
}

// ── 默认配色（经典红色龙虾） ──
export const DEFAULT_PART_COLORS: LobsterPartColors = {
  shell: [255, 85, 0],    // 橙色甲壳（老版 #ff5500）
  claw:  [255, 51, 0],    // 橙红钳子
  leg:   [255, 170, 0],   // 金黄腿（老版 #ffaa00）
  eye:   [0, 243, 255],   // 青色眼
  tail:  [255, 85, 0],    // 橙红尾
  aura:  [255, 85, 0],    // 橙色光晕
  sub:   [204, 34, 0],    // 暗红辅色
};

export const DEFAULT_THEME: LobsterTheme = partColorsToTheme(DEFAULT_PART_COLORS);

interface LobsterProps {
  theme?: LobsterTheme;
  state?: 'idle' | 'walking' | 'attacking' | 'charging';
  className?: string;
  id?: string;
}

export const Lobster: React.FC<LobsterProps> = ({
  theme: themeProp,
  state = 'idle',
  className = '',
  id,
}) => {
  const theme = themeProp ?? DEFAULT_THEME;
  const clawScale = theme.clawScale || 1;
  const headScale = theme.headScale || 1;
  const legScale = theme.legScale || 1;
  const antennaScale = theme.antennaScale || 1;
  const coreRadius = Math.round(12 * (theme.coreScale || 1));
  const tailScale = theme.tailScale || 1;
  const strokeColor = theme.strokeColor ?? theme.highlightColors[0];

  const uid = React.useMemo(() => Math.random().toString(36).substring(7), []);
  const armorCoreId = `armorCore-${uid}`;
  const armorHighlightId = `armorHighlight-${uid}`;
  const clawGradientId = `clawGradient-${uid}`;
  const neonPulseId = `neonPulse-${uid}`;

  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-50 -50 612 612"
      className={`w-full h-full relative z-10 drop-shadow-[0_0_40px_${theme.neonEye}66] is-${state} ${state === 'charging' ? 'animate-shake' : ''} ${state === 'attacking' ? 'animate-attack-body' : ''} ${className}`}
      overflow="visible"
    >
      <defs>
        <linearGradient id={armorCoreId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.coreColors[0]} />
          <stop offset="50%" stopColor={theme.coreColors[1]} />
          <stop offset="100%" stopColor={theme.coreColors[2]} />
        </linearGradient>
        {/* 腿渐变：上下方向，和老版 armorHighlightId 一致 */}
        <linearGradient id={armorHighlightId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={theme.highlightColors[0]} />
          <stop offset="100%" stopColor={theme.highlightColors[1]} />
        </linearGradient>
        <linearGradient id={clawGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.clawColors[0]} />
          <stop offset="100%" stopColor={theme.clawColors[1]} />
        </linearGradient>
        <linearGradient id={`tailGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={theme.tailColors?.[0] ?? theme.coreColors[0]} />
          <stop offset="50%" stopColor={theme.tailColors?.[1] ?? theme.coreColors[1]} />
          <stop offset="100%" stopColor={theme.tailColors?.[2] ?? theme.coreColors[2]} />
        </linearGradient>
        <filter id={neonPulseId}>
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="lobster-body">
        <g className="lobster-body-inner">
          {/* Cyber Legs Left */}
          <g transform={`translate(212,200) scale(${legScale}) translate(-212,-200)`}>
            <polyline className="leg-l-1" points="212,200 160,190 140,230" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
            <polyline className="leg-l-2" points="218,230 160,240 140,280" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
            <polyline className="leg-l-3" points="226,260 170,280 150,330" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
          </g>

          {/* Cyber Legs Right */}
          <g transform={`translate(300,200) scale(${legScale}) translate(-300,-200)`}>
            <polyline className="leg-r-1" points="300,200 352,190 372,230" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
            <polyline className="leg-r-2" points="294,230 352,240 372,280" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
            <polyline className="leg-r-3" points="286,260 342,280 362,330" fill="none" stroke={`url(#${armorHighlightId})`} strokeWidth="10" strokeLinejoin="bevel" />
          </g>

          {/* Segmented Tail */}
          <g transform={`translate(256,270) scale(1,${tailScale}) translate(-256,-270)`}>
          <g className="tail-1">
            <polygon points="236,270 276,270 286,310 226,310" fill={`url(#tailGrad-${uid})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
            <g className="tail-2">
              <polygon points="230,320 282,320 276,360 236,360" fill={`url(#tailGrad-${uid})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
              <g className="tail-3">
                <polygon points="236,370 276,370 266,410 246,410" fill={`url(#tailGrad-${uid})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
                <g className="tail-4">
                  <polygon points="240,420 272,420 260,460 252,460" fill={`url(#tailGrad-${uid})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
                  <g className="tail-5">
                    <polygon points="256,460 286,500 256,520 226,500" fill={theme.tailColors?.[1] ?? theme.highlightColors[0]} stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
                  </g>
                </g>
              </g>
            </g>
          </g>
          </g>

          {/* Left Arm & Massive Claw */}
          <g transform={`translate(226, 150) scale(${clawScale}) translate(-226, -150)`}>
            <g className="claw-left">
              <polygon points="230,160 160,110 180,90 240,140" fill={`url(#${armorCoreId})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
              <polygon points="160,110 130,50 160,10 200,30 190,70 180,90" fill={`url(#${clawGradientId})`} stroke={strokeColor} strokeWidth="3" strokeLinejoin="round" />
              <polygon points="160,10 170,50 200,30" fill={theme.innerCutout} stroke={theme.coreColors[0]} strokeWidth="2" />
              <polygon points="130,50 160,10 180,90" fill={`url(#${armorHighlightId})`} opacity="0.6" />
            </g>
          </g>

          {/* Right Arm & Massive Claw */}
          <g transform={`translate(286, 150) scale(${clawScale}) translate(-286, -150)`}>
            <g className="claw-right">
              <polygon points="282,160 352,110 332,90 272,140" fill={`url(#${armorCoreId})`} stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
              <polygon points="352,110 382,50 352,10 312,30 322,70 332,90" fill={`url(#${clawGradientId})`} stroke={strokeColor} strokeWidth="3" strokeLinejoin="round" />
              <polygon points="352,10 342,50 312,30" fill={theme.innerCutout} stroke={theme.coreColors[0]} strokeWidth="2" />
              <polygon points="382,50 352,10 332,90" fill={`url(#${armorHighlightId})`} opacity="0.6" />
            </g>
          </g>

          {/* Main Carapace */}
          <g transform={`translate(256,200) scale(${headScale}) translate(-256,-200)`}>
            <polygon points="256,120 286,150 300,200 286,260 256,280 226,260 212,200 226,150" fill={`url(#${armorCoreId})`} stroke={strokeColor} strokeWidth="3" strokeLinejoin="round" />
            <polygon points="256,120 286,150 256,200 226,150" fill={`url(#${armorHighlightId})`} opacity="0.8" />
            <polygon points="256,200 286,260 256,280 226,260" fill={theme.carapaceInner} opacity="0.6" />
          </g>

          {/* Glowing Core / Eyes — 先圆后菱形（菱形在上层） */}
          <circle cx="256" cy="180" r={coreRadius} fill={theme.neonEye} filter={`url(#${neonPulseId})`} className="animate-pulse energy-core" />
          <polygon points="256,160 266,180 256,200 246,180" fill={theme.eyeHighlight ?? '#ffffff'} />
          <circle cx="236" cy="140" r="4" fill={theme.neonEye} filter={`url(#${neonPulseId})`} />
          <circle cx="276" cy="140" r="4" fill={theme.neonEye} filter={`url(#${neonPulseId})`} />

          {/* Antennae — 须子有呼吸动画 */}
          <g transform={`translate(256,120) scale(1,${antennaScale}) translate(-256,-120)`}>
            <path className="antenna-l" d="M256 120 Q 245 50 220 -20" fill="none" stroke={theme.neonAntenna} strokeWidth="4" strokeLinecap="round" filter={`url(#${neonPulseId})`} />
            <path className="antenna-r" d="M256 120 Q 267 50 292 -20" fill="none" stroke={theme.neonAntenna} strokeWidth="4" strokeLinecap="round" filter={`url(#${neonPulseId})`} />
          </g>
        </g>
      </g>
    </svg>
  );
};
