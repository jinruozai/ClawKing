/**
 * Season Nameplate Themes — 8赛季 × 4档铭牌配色
 *
 * 每个赛季有4个奖励铭牌（冠军/亚军/季军/32强），
 * 铭牌 bit ID: (seasonIdx * 4) + tierOffset + 1
 *   赛季1冠军=1, 赛季1亚军=2, 赛季1季军=3, 赛季1-32强=4
 *   赛季2冠军=5, 赛季2亚军=6, ...
 */

export interface ThemeColors {
  p: string;  // Primary
  s: string;  // Secondary
  bg: string; // Background
  icon: string; // Icon color
  tF: string; // Text gradient From
  tV: string; // Text gradient Via
  tT: string; // Text gradient To
}

export interface SeasonDef {
  id: number;
  name: string;
  r1: ThemeColors; // 冠军
  r2: ThemeColors; // 亚军
  r3: ThemeColors; // 季军
  r4: ThemeColors; // 32强
}

export const SEASONS: SeasonDef[] = [
  {
    id: 1, name: "S1 启航",
    r1: { p: '#FFD700', s: '#FF4500', bg: '#450a0a', icon: '#431407', tF: '#ffffff', tV: '#fef08a', tT: '#f97316' },
    r2: { p: '#00FFFF', s: '#8A2BE2', bg: '#020617', icon: '#0f172a', tF: '#ffffff', tV: '#cffafe', tT: '#60a5fa' },
    r3: { p: '#D2691E', s: '#FF8C00', bg: '#1c1917', icon: '#1c1917', tF: '#ffedd5', tV: '#fdba74', tT: '#ea580c' },
    r4: { p: '#a855f7', s: '#d946ef', bg: '#18181b', icon: '#a855f7', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 2, name: "S2 赛博",
    r1: { p: '#ff00ff', s: '#00ffff', bg: '#170213', icon: '#2e0426', tF: '#ffffff', tV: '#f0abfc', tT: '#db2777' },
    r2: { p: '#39ff14', s: '#0055ff', bg: '#021705', icon: '#062b0f', tF: '#ffffff', tV: '#bbf7d0', tT: '#22c55e' },
    r3: { p: '#ffff00', s: '#ff0055', bg: '#1a1a00', icon: '#333300', tF: '#ffffff', tV: '#fef08a', tT: '#eab308' },
    r4: { p: '#00ff00', s: '#008800', bg: '#001100', icon: '#00ff00', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 3, name: "S3 星际",
    r1: { p: '#9333ea', s: '#000000', bg: '#0f0518', icon: '#ffffff', tF: '#ffffff', tV: '#d8b4fe', tT: '#9333ea' },
    r2: { p: '#38bdf8', s: '#e2e8f0', bg: '#081426', icon: '#0f172a', tF: '#ffffff', tV: '#bae6fd', tT: '#38bdf8' },
    r3: { p: '#f472b6', s: '#4c1d95', bg: '#1a0b16', icon: '#4c1d95', tF: '#ffffff', tV: '#fbcfe8', tT: '#db2777' },
    r4: { p: '#94a3b8', s: '#334155', bg: '#0f1115', icon: '#94a3b8', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 4, name: "S4 幻境",
    r1: { p: '#10b981', s: '#fbbf24', bg: '#021c11', icon: '#022c22', tF: '#ffffff', tV: '#a7f3d0', tT: '#059669' },
    r2: { p: '#3b82f6', s: '#60a5fa', bg: '#06142e', icon: '#1e3a8a', tF: '#ffffff', tV: '#bfdbfe', tT: '#2563eb' },
    r3: { p: '#ef4444', s: '#f87171', bg: '#240606', icon: '#7f1d1d', tF: '#ffffff', tV: '#fecaca', tT: '#dc2626' },
    r4: { p: '#78716c', s: '#a8a29e', bg: '#141211', icon: '#78716c', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 5, name: "S5 机甲",
    r1: { p: '#f97316', s: '#94a3b8', bg: '#1a0f08', icon: '#431407', tF: '#ffffff', tV: '#fdba74', tT: '#ea580c' },
    r2: { p: '#06b6d4', s: '#cbd5e1', bg: '#04151a', icon: '#164e63', tF: '#ffffff', tV: '#a5f3fc', tT: '#0891b2' },
    r3: { p: '#dc2626', s: '#64748b', bg: '#1c0505', icon: '#450a0a', tF: '#ffffff', tV: '#fca5a5', tT: '#b91c1c' },
    r4: { p: '#10b981', s: '#3f3f46', bg: '#05120d', icon: '#10b981', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 6, name: "S6 血月",
    r1: { p: '#991b1b', s: '#000000', bg: '#1a0000', icon: '#ffffff', tF: '#ffffff', tV: '#fca5a5', tT: '#dc2626' },
    r2: { p: '#e2e8f0', s: '#7f1d1d', bg: '#121418', icon: '#450a0a', tF: '#ffffff', tV: '#e2e8f0', tT: '#94a3b8' },
    r3: { p: '#5b21b6', s: '#991b1b', bg: '#0f0518', icon: '#ffffff', tF: '#ffffff', tV: '#c4b5fd', tT: '#7c3aed' },
    r4: { p: '#7f1d1d', s: '#450a0a', bg: '#0a0000', icon: '#7f1d1d', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
  {
    id: 7, name: "S7 神域",
    r1: { p: '#fbbf24', s: '#fef08a', bg: '#2a1a08', icon: '#78350f', tF: '#ffffff', tV: '#fef08a', tT: '#f59e0b' },
    r2: { p: '#38bdf8', s: '#bae6fd', bg: '#0c2136', icon: '#0c4a6e', tF: '#ffffff', tV: '#e0f2fe', tT: '#0ea5e9' },
    r3: { p: '#f472b6', s: '#fbcfe8', bg: '#311024', icon: '#831843', tF: '#ffffff', tV: '#fce7f3', tT: '#db2777' },
    r4: { p: '#f8fafc', s: '#e2e8f0', bg: '#0f172a', icon: '#f8fafc', tF: '#ffffff', tV: '#f8fafc', tT: '#cbd5e1' },
  },
  {
    id: 8, name: "S8 深渊",
    r1: { p: '#0d9488', s: '#0284c7', bg: '#021314', icon: '#042f2e', tF: '#ffffff', tV: '#5eead4', tT: '#0f766e' },
    r2: { p: '#f43f5e', s: '#0ea5e9', bg: '#17050a', icon: '#881337', tF: '#ffffff', tV: '#fda4af', tT: '#e11d48' },
    r3: { p: '#7e22ce', s: '#06b6d4', bg: '#10041a', icon: '#3b0764', tF: '#ffffff', tV: '#d8b4fe', tT: '#9333ea' },
    r4: { p: '#0369a1', s: '#0c4a6e', bg: '#020b12', icon: '#0369a1', tF: '#f4f4f5', tV: '#f4f4f5', tT: '#f4f4f5' },
  },
];

/**
 * 根据铭牌 bit ID (1~32) 获取赛季和档次
 * @returns { seasonIdx: 0~7, tier: 1~4 } 或 null
 */
export function getSeasonTier(nameplateId: number): { seasonIdx: number; tier: number; theme: ThemeColors } | null {
  if (nameplateId < 1 || nameplateId > 32) return null;
  const idx = nameplateId - 1; // 0-based
  const seasonIdx = Math.floor(idx / 4);
  const tier = (idx % 4) + 1; // 1=冠军, 2=亚军, 3=季军, 4=32强
  const season = SEASONS[seasonIdx];
  if (!season) return null;
  const theme = tier === 1 ? season.r1 : tier === 2 ? season.r2 : tier === 3 ? season.r3 : season.r4;
  return { seasonIdx, tier, theme };
}

/** hex → "r, g, b" */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
}

/** 构建 CSS 变量 style 对象 */
export function themeVars(theme: ThemeColors): React.CSSProperties {
  const pRgb = hexToRgb(theme.p);
  const sRgb = hexToRgb(theme.s);
  return {
    '--c-p': theme.p,
    '--c-s': theme.s,
    '--c-p-alpha': `rgba(${pRgb}, 0.4)`,
    '--c-s-alpha': `rgba(${sRgb}, 0.4)`,
    '--c-p-glow': `rgba(${pRgb}, 0.6)`,
    '--c-s-glow': `rgba(${sRgb}, 0.6)`,
    '--c-bg': theme.bg,
    '--c-icon': theme.icon,
    '--c-tf': theme.tF,
    '--c-tv': theme.tV,
    '--c-tt': theme.tT,
  } as React.CSSProperties;
}
