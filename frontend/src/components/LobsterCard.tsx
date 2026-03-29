/**
 * LobsterCard — 龙虾名片组件
 *
 * 16:9 卡片，展示玩家完整信息，用于社交传播。
 * 视觉设计：外发光、渐变边框、噪点纹理、铭牌配色背景
 * 右上角分享按钮 → html-to-image 截图下载 PNG
 * 自己的名片：名字旁编辑按钮 → 打开 PlayerInfoPanel
 */

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Pencil, Swords, Flame, Download, Loader2 } from 'lucide-react';
import { MiniLobsterIcon } from './Icons';
import { CopyAddress } from './CopyAddress';
import { PlayerNameTag } from './PlayerNameTag';
import { InteractiveLobsterCard } from './InteractiveLobsterCard';
import { NAMEPLATE_THEME, DEFAULT_CARD_THEME } from '../game/nameplateStyles';
import { BADGE_DEFS, hasAchBit } from '../game/badgeData';
import type { PlayerData } from '../services/dataStore';
import { fetchLobsterNFT } from '../services/dataStore';
import { getRankInfo, defaultName, lobsterDisplayName } from '../config/game';
import { usePlayer } from '../hooks/useData';
import { t } from '../i18n';
import { partColorsToTheme, type LobsterTheme, type LobsterStats } from './Lobster';

// Nameplate theme imported from shared nameplateStyles.ts

interface LobsterCardProps {
  player: PlayerData | null;
  address: string;
  isOwn?: boolean;
  overrideHeroId?: number;
  onClose: () => void;
  onEdit?: () => void;
}

export const LobsterCard: React.FC<LobsterCardProps> = ({
  player: playerProp, address, isOwn = false, overrideHeroId, onClose, onEdit,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Load player data via cache (always available — defaults first)
  const { data: cachedPlayer } = usePlayer(playerProp ? null : address);
  const player = playerProp || cachedPlayer;

  // Normalize fields that differ between types.ts PlayerData and dataStore PlayerData
  const rating = player?.rating ?? 0;
  const heroIdRaw = player ? ((player as any).heroId ?? (player as any).heroTokenId ?? 0) : 0;
  const achievementsStr = player ? String(player.achievements ?? '0') : '0';

  const rankInfo = useMemo(
    () => getRankInfo(rating),
    [rating],
  );

  const rankDisplayName = `${t('rank.' + rankInfo.id)} ${rankInfo.tierName}`;

  const displayName = player?.name || defaultName(address);
  const heroId = overrideHeroId ?? heroIdRaw;

  // 加载龙虾 NFT → theme + 名字
  const [heroTheme, setHeroTheme] = useState<LobsterTheme | null>(null);
  const [heroName, setHeroName] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchLobsterNFT(heroId)
      .then(nft => {
        if (cancelled) return;
        const stats: LobsterStats = { hp: nft.hp, atk: nft.atk, speed: nft.speed, atkRange: nft.atkRange, manaMax: nft.manaMax, skillPower: nft.skillPower };
        setHeroTheme(partColorsToTheme(
          { shell: nft.shell, claw: nft.claw, leg: nft.leg, eye: nft.eye, tail: nft.tail, aura: nft.aura, sub: nft.sub },
          stats,
        ));
        setHeroName(lobsterDisplayName(heroId, nft.name));
      })
      .catch(() => { if (!cancelled) { setHeroTheme(null); setHeroName(''); } });
    return () => { cancelled = true; };
  }, [heroId]);

  const totalMatches = player?.totalMatches ?? 0;
  const wins = player?.wins ?? 0;
  const winRate = totalMatches > 0
    ? Math.round((wins / totalMatches) * 100)
    : 0;

  const equippedNameplate = player?.equippedNameplate ?? 0;
  const theme = equippedNameplate > 0 ? (NAMEPLATE_THEME[equippedNameplate] || DEFAULT_CARD_THEME) : DEFAULT_CARD_THEME;

  // 已解锁成就
  const unlockedAch = useMemo(
    () => BADGE_DEFS.filter(a => hasAchBit(achievementsStr, a.bit)),
    [achievementsStr],
  );

  const [downloading, setDownloading] = useState(false);

  // 下载名片 — html-to-image 截图
  const handleDownload = async () => {
    const el = cardRef.current;
    if (!el || downloading) return;
    setDownloading(true);
    try {
      const { toPng } = await import('html-to-image');
      // 临时隐藏导出按钮
      const dlBtn = el.querySelector('[data-export-btn]') as HTMLElement | null;
      if (dlBtn) dlBtn.style.visibility = 'hidden';
      // 临时给截图容器加圆角裁切背景，导出后移除
      el.style.backgroundColor = '#111114';
      el.style.borderRadius = '22px';
      el.style.overflow = 'hidden';
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        filter: (node: HTMLElement) => !node?.hasAttribute?.('data-export-btn'),
      });
      el.style.backgroundColor = '';
      el.style.borderRadius = '';
      el.style.overflow = '';
      if (dlBtn) dlBtn.style.visibility = '';
      const link = document.createElement('a');
      link.download = `claw-arena-${displayName}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Screenshot failed:', e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
        className="w-full max-w-[640px]"
      >
        {/* 卡片容器 */}
        <div className="relative group">

          {/* 外发光 */}
          <div
            className="absolute -inset-0.5 rounded-[24px] blur-xl opacity-50 group-hover:opacity-75 transition duration-500"
            style={{ background: `linear-gradient(135deg, ${theme.glowFrom}, rgba(249,115,22,0.05) 50%, ${theme.glowTo})` }}
          />

          {/* 渐变边框 */}
          <div ref={cardRef} className="relative rounded-[22px] p-[1px] bg-gradient-to-br from-slate-700/50 via-slate-800/20 to-slate-800/60 shadow-2xl overflow-hidden">

            {/* 卡片内容 */}
            <div className="relative w-full rounded-[21px] py-6 pl-8 pr-5 flex flex-col" style={{ background: `linear-gradient(135deg, ${theme.bg}, #111114 50%, ${theme.bg})` }}>

              {/* 装饰渐变 */}
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: theme.glowFrom }} />
              <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: theme.glowTo }} />

              {/* 噪点纹理 */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff 1px, transparent 1px)', backgroundSize: '4px 4px' }} />

              {/* Header */}
              <div className="flex justify-between items-center shrink-0 relative z-10 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                    <MiniLobsterIcon className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 text-base uppercase">
                    {t('card.title')}
                  </span>
                  <span className="text-[10px] text-slate-600 tracking-wider ml-1">{t('card.subtitle')}</span>
                </div>
                {isOwn && (
                  <button
                    data-export-btn
                    onClick={handleDownload}
                    disabled={downloading}
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5 hover:border-white/10 disabled:opacity-50"
                    title={t('player.downloadCard')}
                  >
                    {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  </button>
                )}
              </div>

              {/* Main Content */}
              <div className="flex-1 flex items-start gap-8 relative z-10">

                {/* 左：英雄头像 */}
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <InteractiveLobsterCard size="lg" theme={heroTheme ?? undefined} className="!bg-transparent !border-0 !rounded-none !cursor-default" />
                  <span className="text-sm font-bold text-orange-400">{heroName}</span>
                </div>

                {/* 右：所有数据 */}
                <div className="flex flex-col flex-1 min-w-0">
                  {/* 名字 + 铭牌 + 编辑按钮 */}
                  <div className="flex items-center gap-4 mb-4">
                    <PlayerNameTag address={address} className="text-2xl [&_span]:text-2xl" />
                    {isOwn && onEdit && (
                      <button
                        onClick={onEdit}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all border border-white/5 shrink-0"
                        title={t('player.editProfile')}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>

                  {/* 段位 + 基础数据 */}
                  <div className="flex flex-col gap-2.5 mb-3">
                    <div className="text-lg text-slate-300 flex items-center gap-3">
                      <span className="font-semibold" style={{ color: rankInfo.color }}>
                        {rankDisplayName}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                      <span className="font-mono text-slate-300">{rating} <span className="text-sm text-slate-500 font-sans">{t('player.pts')}</span></span>
                    </div>
                    <div className="text-sm text-slate-400 flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-mono font-medium">S{player?.season ?? 0}</span>
                      <span><span className="font-mono text-slate-300">{totalMatches}</span> {t('player.games')}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                      <span>{t('player.winRate')} <span className="text-emerald-400 font-mono font-medium">{winRate}%</span></span>
                    </div>
                  </div>

                  {/* 分割线 */}
                  <div className="h-px w-3/4 bg-gradient-to-r from-white/10 to-transparent mb-3" />

                  {/* 战斗数据 */}
                  <div className="flex items-center gap-8 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-white/[0.05] border border-white/[0.05] text-slate-400">
                        <Swords size={16} />
                      </div>
                      <span className="text-sm text-slate-400 font-medium">{t('player.kills')}</span>
                      <span className="text-xl font-mono font-semibold text-slate-200">{player?.totalKills ?? 0}</span>
                    </div>
                    {(player?.streak ?? 0) !== 0 && (
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md border ${(player?.streak ?? 0) > 0 ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                          <Flame size={16} />
                        </div>
                        <span className="text-sm text-slate-400 font-medium">{(player?.streak ?? 0) > 0 ? t('player.streak') : t('player.losing')}</span>
                        <span className={`text-xl font-mono font-semibold ${(player?.streak ?? 0) > 0 ? 'text-orange-400' : 'text-red-400'}`}>{Math.abs(player?.streak ?? 0)}</span>
                      </div>
                    )}
                  </div>

                  {/* 成就图标 */}
                  {unlockedAch.length > 0 && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold shrink-0 leading-[1.75rem]">{t('player.feat')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {unlockedAch.map(a => (
                          <span
                            key={a.bit}
                            title={`${t(a.nameKey)} — ${t(a.desc)}`}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.04] border border-white/[0.08] text-sm cursor-default hover:bg-white/[0.10] hover:border-white/[0.15] hover:scale-110 transition-all"
                          >
                            {a.icon}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="pb-[5px] flex justify-end items-center mt-auto shrink-0 relative z-10">
                <CopyAddress address={address} short={false} className="text-[10px] text-slate-500" iconSize={10} />
              </div>

            </div>
          </div>
        </div>

        {/* 关闭按钮（卡片外） */}
        <div className="flex justify-center mt-3">
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
