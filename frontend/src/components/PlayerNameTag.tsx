/**
 * PlayerNameTag — 玩家名字标签组件
 *
 * 显示: [铭牌背景板] 玩家名
 * 赛季铭牌 (1-32) 使用新版动态特效系统
 * 商城铭牌 (33-42) 使用旧版 Tailwind 特效
 */

import React, { useMemo } from 'react';
import { Crown, Star, Shield, Swords } from 'lucide-react';
import { defaultName } from '../config/game';
import { BADGE_BY_BIT } from '../game/badgeData';
import { getSeasonTier, themeVars } from '../game/seasonThemes';
import { t } from '../i18n';
import { usePlayer } from '../hooks/useData';

// ── 商城铭牌旧版特效 ──
type ShopEffect = 'none' | 'shimmer' | 'glow' | 'prismatic' | 'solar';
interface ShopStyle {
  bg: string; border: string; text: string; effect: ShopEffect; glowColor?: string;
}

let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes np-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes np-glow { 0%, 100% { box-shadow: 0 0 4px var(--np-glow-color, rgba(255,255,255,0.2)); } 50% { box-shadow: 0 0 12px var(--np-glow-color, rgba(255,255,255,0.5)); } }
    @keyframes np-prismatic { 0% { border-color: #d946ef; box-shadow: 0 0 14px #d946ef70, 0 0 28px #8b5cf630; } 25% { border-color: #a78bfa; box-shadow: 0 0 18px #a78bfa70, 0 0 32px #d946ef30; } 50% { border-color: #e879f9; box-shadow: 0 0 14px #e879f970, 0 0 28px #a78bfa30; } 75% { border-color: #c084fc; box-shadow: 0 0 18px #c084fc70, 0 0 32px #e879f930; } 100% { border-color: #d946ef; box-shadow: 0 0 14px #d946ef70, 0 0 28px #8b5cf630; } }
    @keyframes np-solar { 0% { border-color: #fbbf24; box-shadow: 0 0 20px #fbbf2480, 0 0 40px #f9731640; } 20% { border-color: #f97316; box-shadow: 0 0 24px #f9731680, 0 0 48px #ef444440; } 40% { border-color: #ef4444; box-shadow: 0 0 28px #ef444480, 0 0 56px #f9731640; } 60% { border-color: #f59e0b; box-shadow: 0 0 24px #f59e0b80, 0 0 48px #fbbf2440; } 80% { border-color: #eab308; box-shadow: 0 0 22px #eab30880, 0 0 44px #f9731640; } 100% { border-color: #fbbf24; box-shadow: 0 0 20px #fbbf2480, 0 0 40px #f9731640; } }
    .np-shimmer { background-image: linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.15) 37%, transparent 50%); background-size: 200% 100%; animation: np-shimmer 3s ease-in-out infinite; }
    .np-glow { animation: np-glow 2s ease-in-out infinite; }
    .np-prismatic { animation: np-prismatic 2.5s linear infinite; border-width: 2px !important; }
    .np-solar { animation: np-solar 2.5s linear infinite; border-width: 2px !important; }
  `;
  document.head.appendChild(style);
}

const SHOP_STYLES: Record<number, ShopStyle> = {
  // 500 档 — 白色文字，素雅
  33: { bg: 'bg-sky-800/10', border: 'border-sky-700/20', text: 'text-zinc-200', effect: 'none' },
  34: { bg: 'bg-rose-800/10', border: 'border-rose-700/20', text: 'text-zinc-200', effect: 'none' },
  // 1000 档 — 白色文字 + shimmer
  35: { bg: 'bg-green-600/15', border: 'border-green-500/30', text: 'text-zinc-100', effect: 'shimmer' },
  36: { bg: 'bg-teal-600/15', border: 'border-teal-500/30', text: 'text-zinc-100', effect: 'shimmer' },
  37: { bg: 'bg-lime-600/15', border: 'border-lime-500/30', text: 'text-zinc-100', effect: 'shimmer' },
  38: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-zinc-100', effect: 'glow', glowColor: 'rgba(59,130,246,0.4)' },
  // 2000 档 — 渐变彩色文字 + glow
  39: { bg: 'bg-gradient-to-r from-amber-500/30 to-yellow-400/30', border: 'border-amber-400/60', text: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-200', effect: 'glow', glowColor: 'rgba(245,158,11,0.6)' },
  40: { bg: 'bg-gradient-to-r from-rose-500/30 to-pink-400/30', border: 'border-rose-400/60', text: 'text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-pink-200', effect: 'glow', glowColor: 'rgba(244,63,94,0.6)' },
  // 5000 档 — 渐变彩色文字 + 动态光效
  41: { bg: 'bg-gradient-to-r from-violet-600/50 to-fuchsia-500/50', border: 'border-2 border-fuchsia-400', text: 'text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-fuchsia-300 to-purple-300', effect: 'prismatic', glowColor: 'rgba(217,70,239,0.8)' },
  42: { bg: 'bg-gradient-to-r from-yellow-400/50 via-orange-500/50 to-red-500/50', border: 'border-2 border-amber-400', text: 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-orange-300 to-red-300', effect: 'solar', glowColor: 'rgba(245,158,11,0.9)' },
};

// ── 赛季铭牌内联组件 (tier 1-4) ──
function SeasonNameplateTag({
  nameplateId, displayName, badgeEl, className, onClick, address, large,
}: {
  nameplateId: number; displayName: string; badgeEl: React.ReactNode;
  className: string; onClick?: () => void; address: string; large?: boolean;
}) {
  const info = getSeasonTier(nameplateId);
  if (!info) return null;
  const { tier, theme } = info;
  const vars = themeVars(theme);

  const textSize = large ? 'text-xl' : 'text-sm';
  const iconSize = large ? 'w-6 h-6' : 'w-3.5 h-3.5';
  const h = large ? 'h-16' : 'h-8';
  const px = large ? 'px-5' : 'px-2';
  const wClass = large ? 'w-full' : '';

  const nameEl = (
    <span className={`${textSize} font-black text-transparent bg-clip-text drop-shadow-[0_1px_2px_rgba(0,0,0,1)] tracking-wide`}
      style={{ backgroundImage: 'linear-gradient(to bottom, var(--c-tf), var(--c-tv), var(--c-tt))' }}>
      {displayName}
    </span>
  );

  const clickClass = onClick ? 'cursor-pointer hover:brightness-125' : '';

  if (tier === 1) {
    // 冠军 — 旋转边框 + 内光 + 粒子 + 扫光
    return (
      <span style={vars} className={`relative inline-flex items-center ${h} ${wClass} rounded-md p-[2px] overflow-hidden shadow-[0_0_20px_var(--c-p-glow)] ${clickClass} ${className}`}
        onClick={onClick} title={address}>
        <span className="absolute inset-[-100%] animate-[spin_2.5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0%,transparent_10%,var(--c-p)_20%,var(--c-s)_30%,transparent_40%,transparent_60%,var(--c-p)_70%,var(--c-s)_80%,transparent_90%)]" />
        <span className={`relative inline-flex items-center ${wClass} h-full rounded-[5px] ${px} overflow-hidden z-10 border shadow-[inset_0_0_10px_var(--c-s-glow)]`}
          style={{ backgroundColor: 'var(--c-bg)', borderColor: 'var(--c-p-alpha)' }}>
          <span className="absolute inset-[-100%] np2-spin-slow bg-[conic-gradient(from_0deg,transparent_0%,var(--c-p-alpha)_10%,transparent_20%,var(--c-s-alpha)_30%,transparent_40%)] mix-blend-screen" />
          <span className="absolute inset-0 animate-[np2-pulse-glow_2s_ease-in-out_infinite] mix-blend-screen" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, var(--c-s-glow), transparent 70%)' }} />
          <span className="absolute top-0 left-0 w-12 h-[150%] bg-gradient-to-r from-transparent via-white to-transparent opacity-60 mix-blend-overlay animate-[np2-laser-sweep_2s_ease-in-out_infinite]" />
          <span className="absolute inset-0 overflow-hidden pointer-events-none">
            {[1,2,3,4,5].map(i => <span key={i} className={`absolute bottom-0 w-1 h-1 rounded-full np2-particle np2-p${i} shadow-[0_0_4px_#fff]`} style={{ backgroundColor: 'var(--c-p)' }} />)}
          </span>
          <span className="relative z-20 inline-flex items-center gap-1.5">
            <Crown className={`${iconSize} shrink-0`} style={{ color: 'var(--c-p)' }} />
            {nameEl}
            {badgeEl}
          </span>
        </span>
      </span>
    );
  }

  if (tier === 2) {
    // 亚军 — 旋转边框(慢) + 横向渐变 + 扫光
    return (
      <span style={vars} className={`relative inline-flex items-center ${h} ${wClass} rounded-md p-[1.5px] overflow-hidden shadow-[0_0_15px_var(--c-p-glow)] ${clickClass} ${className}`}
        onClick={onClick} title={address}>
        <span className="absolute inset-[-100%] animate-[spin_4s_linear_infinite_reverse] bg-[conic-gradient(from_0deg,transparent_0%,transparent_20%,var(--c-p)_40%,var(--c-s)_60%,transparent_80%)] opacity-90" />
        <span className={`relative inline-flex items-center ${wClass} h-full rounded-[5px] ${px} overflow-hidden z-10 border shadow-[inset_0_0_8px_var(--c-p-glow)]`}
          style={{ backgroundColor: 'var(--c-bg)', borderColor: 'var(--c-p-alpha)' }}>
          <span className="absolute inset-0 bg-[length:200%_100%] animate-[np2-bg-pan-x_3s_linear_infinite]" style={{ backgroundImage: 'linear-gradient(105deg, transparent 0%, var(--c-p-alpha) 30%, var(--c-s-alpha) 50%, var(--c-p-alpha) 70%, transparent 100%)' }} />
          <span className="absolute top-0 left-0 w-16 h-[150%] bg-gradient-to-r from-transparent via-white to-transparent opacity-30 mix-blend-overlay animate-[np2-laser-sweep_3.5s_ease-in-out_infinite]" />
          <span className="relative z-20 inline-flex items-center gap-1.5">
            <Star className={`${iconSize} shrink-0`} style={{ color: 'var(--c-p)' }} />
            {nameEl}
            {badgeEl}
          </span>
        </span>
      </span>
    );
  }

  if (tier === 3) {
    // 季军 — 单条旋转 + 呼吸光晕 + 碎片粒子
    return (
      <span style={vars} className={`relative inline-flex items-center ${h} ${wClass} rounded-md p-[1.5px] overflow-hidden shadow-[0_0_10px_var(--c-p-glow)] ${clickClass} ${className}`}
        onClick={onClick} title={address}>
        <span className="absolute inset-[-100%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0%,transparent_30%,var(--c-p)_50%,transparent_70%)] opacity-80" />
        <span className={`relative inline-flex items-center ${wClass} h-full rounded-[5px] ${px} overflow-hidden z-10 border shadow-[inset_0_0_8px_var(--c-p-alpha)]`}
          style={{ backgroundColor: 'var(--c-bg)', borderColor: 'var(--c-s-alpha)' }}>
          <span className="absolute inset-0 animate-[np2-pulse-glow_3s_ease-in-out_infinite]" style={{ backgroundImage: 'radial-gradient(ellipse at bottom, var(--c-s-glow), transparent 70%)' }} />
          <span className="absolute top-0 left-0 w-20 h-[150%] bg-gradient-to-r from-transparent via-white to-transparent opacity-15 mix-blend-overlay animate-[np2-laser-sweep_5s_ease-in-out_infinite]" />
          <span className="absolute inset-0 overflow-hidden pointer-events-none">
            {[1,2,3].map(i => <span key={i} className={`absolute bottom-0 w-1 h-1 rounded-sm np2-ember np2-p${i} rotate-45`} style={{ backgroundColor: 'var(--c-p)', boxShadow: '0 0 3px var(--c-p)' }} />)}
          </span>
          <span className="relative z-20 inline-flex items-center gap-1.5">
            <Shield className={`${iconSize} shrink-0`} style={{ color: 'var(--c-p)' }} />
            {nameEl}
            {badgeEl}
          </span>
        </span>
      </span>
    );
  }

  // tier === 4: 32强 — 扫描线 + 微弱脉冲
  return (
    <span style={vars} className={`relative inline-flex items-center ${h} ${wClass} rounded-md p-[1px] overflow-hidden shadow-[0_0_5px_var(--c-p-alpha)] ${clickClass} ${className}`}
      onClick={onClick} title={address}>
      <span className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(to right, var(--c-p-alpha), var(--c-s-alpha))' }} />
      <span className={`relative inline-flex items-center ${wClass} h-full rounded-[5px] ${px} overflow-hidden z-10 np2-neon-pulse bg-size-200 np2-gradient-shift`}
        style={{ backgroundImage: 'linear-gradient(to right, var(--c-bg), var(--c-p-alpha), var(--c-bg))' }}>
        <span className="absolute top-0 left-0 w-full h-[1px] np2-scanline" style={{ backgroundColor: 'var(--c-p)', boxShadow: '0 0 5px var(--c-p)' }} />
        <span className="relative z-20 inline-flex items-center gap-1.5">
          <Swords className={`${iconSize} shrink-0`} style={{ color: 'var(--c-p)' }} />
          <span className={`${textSize} font-bold tracking-wide`} style={{ color: 'var(--c-tf)' }}>{displayName}</span>
          {badgeEl}
        </span>
      </span>
    </span>
  );
}

// ── Main Component ──

interface PlayerNameTagProps {
  address: string;
  className?: string;
  showNameplate?: boolean;
  overrideName?: string;
  overrideNameplateId?: number;
  onClick?: () => void;
  large?: boolean; // 大尺寸模式（赛季奖励展示用）
}

export const PlayerNameTag: React.FC<PlayerNameTagProps> = ({
  address,
  className = '',
  showNameplate = true,
  overrideName,
  overrideNameplateId,
  onClick,
  large,
}) => {
  // Auto-fetch player data from DataCenter (skip if overrides provided or no address)
  const shouldFetch = address && !overrideName && overrideNameplateId == null;
  const { data: playerData } = usePlayer(shouldFetch ? address : null);

  const displayName = overrideName || playerData?.name || defaultName(address);
  const nameplateId = overrideNameplateId ?? playerData?.equippedNameplate ?? 0;
  const badge = playerData?.equippedBadge ?? 0;
  const badgeLabel = badge > 0 ? BADGE_BY_BIT[badge - 1] ?? null : null;

  useMemo(() => injectStyles(), []);

  const badgeEl = badgeLabel ? (
    <span className="ml-1 inline-flex items-center px-1 py-0 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 whitespace-nowrap leading-tight"
      title={`${t(badgeLabel.nameKey, 'zh')} — ${t(badgeLabel.desc, 'zh')}`}>
      {badgeLabel.icon}
    </span>
  ) : null;

  // 赛季铭牌 1-32: 新版动态特效
  if (showNameplate && nameplateId >= 1 && nameplateId <= 32) {
    return (
      <SeasonNameplateTag
        nameplateId={nameplateId}
        displayName={displayName}
        badgeEl={badgeEl}
        className={className}
        onClick={onClick}
        address={address}
        large={large}
      />
    );
  }

  // 商城铭牌 33-42: 旧版 Tailwind 特效
  const shopStyle = showNameplate && nameplateId >= 33 ? SHOP_STYLES[nameplateId] : undefined;
  if (shopStyle) {
    const effectClass = shopStyle.effect !== 'none' ? `np-${shopStyle.effect}` : '';
    const glowVar = shopStyle.glowColor ? { '--np-glow-color': shopStyle.glowColor } as React.CSSProperties : undefined;
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded border ${shopStyle.bg} ${shopStyle.border} ${effectClass} ${onClick ? 'cursor-pointer hover:brightness-125' : ''} ${className}`}
        onClick={onClick} title={address} style={glowVar}>
        <span className={`truncate font-bold ${shopStyle.text}`}>{displayName}</span>
        {badgeEl}
      </span>
    );
  }

  // 无铭牌 — 纯文字
  return (
    <span className={`inline-flex items-center ${onClick ? 'cursor-pointer hover:underline' : ''} ${className}`}
      onClick={onClick} title={address}>
      <span className="truncate">{displayName}</span>
      {badgeEl}
    </span>
  );
};
