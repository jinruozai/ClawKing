/**
 * PlayerInfoPanel — 玩家资料面板
 *
 * 两种模式:
 *   - editable=true: 自己的资料，可改名+选铭牌+提交
 *   - editable=false: 查看其他玩家，只读展示
 *
 * 铭牌用下拉选择，底部统一提交按钮
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, User, ChevronDown, Trophy } from 'lucide-react';
import { CopyAddress } from './CopyAddress';
import { t } from '../i18n';
import { BADGE_DEFS, hasAchBit } from '../game/badgeData';
import { getRankInfo } from '../config/game';
import {
  updateProfile as contractUpdateProfile,
  type PlayerData,
} from '../services/dataStore';
import { usePlayer } from '../hooks/useData';
import { useWallet } from '../hooks/useWallet';

import { defaultName, NAME_FEE_POL, NAMEPLATE_IDS } from '../config/game';
import { hasItemBit } from './helpers';
import { NAMEPLATE_STYLES } from '../game/nameplateStyles';
import { PolAmount } from './Icons';
import { getSeasonTier } from '../game/seasonThemes';

function npDisplayName(id: number): string {
  if (id === 0) return t('player.nameplateNone');
  if (id >= 1 && id <= 32) {
    const info = getSeasonTier(id);
    if (info) return `S${info.seasonIdx + 1} ${t(`season.tier${info.tier}` as any)}`;
  }
  return t(`shop.item.${id}.name` as any);
}

interface Props {
  /** 自己的 player 数据（editable 模式下必传） */
  player?: PlayerData | null;
  address: string;
  gasPrice: number | null;
  editable?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const PlayerInfoPanel: React.FC<Props> = ({
  player: playerProp, address, gasPrice, editable = true, onClose, onRefresh, showToast,
}) => {
  const { signer } = useWallet();

  // ── 数据加载（只读模式通过 usePlayer 拉） ──
  const { data: fetchedPlayer } = usePlayer(!editable && !playerProp ? address : null);
  const player = playerProp || fetchedPlayer || null;

  // ── 编辑状态 ──
  const [nameInput, setNameInput] = useState('');
  const [selectedNp, setSelectedNp] = useState(0);
  const [npDropdownOpen, setNpDropdownOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(0); // 0=无, N=bit N-1的成就
  const [saving, setSaving] = useState(false);

  // Sync from player data — only on first load, not on background refreshes
  const initializedRef = React.useRef(false);
  useEffect(() => {
    if (player && !initializedRef.current) {
      initializedRef.current = true;
      setNameInput(player.name || '');
      setSelectedNp(player.equippedNameplate);
      setSelectedBadge(player.equippedBadge || 0);
    }
  }, [player]);

  if (!player) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        onClick={onClose}>
        <div className="text-zinc-400 text-sm">{t('admin.loading')}</div>
      </motion.div>
    );
  }

  // ── 变更检测 ──
  const nameChanged = editable && nameInput.trim() !== '' && nameInput.trim() !== player.name;
  const npChanged = editable && selectedNp !== player.equippedNameplate;
  const badgeChanged = editable && selectedBadge !== (player.equippedBadge || 0);
  const hasChanges = nameChanged || npChanged || badgeChanged;

  // ── 费用计算 ──
  const renamePol = nameChanged ? (!player.name ? 0 : NAME_FEE_POL) : 0;

  // ── 提交 ──
  async function handleSubmit() {
    if (!hasChanges || saving || !showToast || !onRefresh || !signer) return;
    const trimmed = nameInput.trim();
    if (nameChanged && trimmed.length > 12) {
      showToast(`Max ${12} chars`, 'error');
      return;
    }
    setSaving(true);
    try {
      // One transaction for all profile changes
      await contractUpdateProfile(
        signer,
        nameChanged ? trimmed : null,
        npChanged ? (selectedNp === 0 ? -1 : selectedNp) : 0,  // -1=unequip, 0=no change, >0=equip
        badgeChanged ? selectedBadge : 0,
        renamePol,
      );
      showToast(t('toast.profileUpdated'), 'success');
      onRefresh();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('toast.transactionFailed');
      showToast(msg.includes('user rejected') ? t('toast.transactionCancelled') : msg, 'error');
      setSaving(false);
    }
  }

  const displayName = player.name || defaultName(address);
  const rankInfo = getRankInfo(player.rating);


  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
              <User className="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <h2 className="text-2xl font-display text-white tracking-wider">
                {editable ? t('player.editProfile') : displayName}
              </h2>
              <CopyAddress address={address} className="text-zinc-400 text-xs" iconSize={10} />
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Read-only stats */}
          {!editable && (
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md" style={{ color: rankInfo.color, backgroundColor: rankInfo.color + '20' }}>
                {t(`rank.${rankInfo.id}`)}
              </span>
              <span className="text-zinc-400 text-sm font-tech">{player.rating} pts</span>
              <span className="text-zinc-500 text-sm">{player.totalMatches} matches</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
              {t('player.name')}
              {editable && !player.name && (
                <span className="ml-2 text-green-400 normal-case tracking-normal font-normal">
                  ({t('player.renameFree')})
                </span>
              )}
              {editable && !!player.name && (
                <span className="ml-2 text-orange-400 normal-case tracking-normal font-normal">
                  ({NAME_FEE_POL} BNB)
                </span>
              )}
            </label>
            {editable ? (
              <>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  maxLength={12}
                  placeholder={displayName}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-cyan-500/50 outline-none transition-colors placeholder:text-zinc-600"
                />
                <p className="text-xs text-zinc-600 mt-1">{12} chars max</p>
              </>
            ) : (
              <p className="text-white text-sm">{displayName}</p>
            )}
          </div>

          {/* Nameplate — dropdown */}
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
              {t('player.nameplate')}
              {editable && (
                <span className="ml-2 text-green-400 normal-case tracking-normal font-normal">
                  ({t('player.gasOnly')})
                </span>
              )}
            </label>
            {editable ? (
              <div className="relative">
                <button
                  onClick={() => setNpDropdownOpen(!npDropdownOpen)}
                  className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white hover:border-white/20 transition-colors"
                >
                  <span className={selectedNp > 0 ? (NAMEPLATE_STYLES[selectedNp] || '') : ''}>{npDisplayName(selectedNp)}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${npDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {npDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-white/10 rounded-xl overflow-hidden z-10 shadow-xl max-h-48 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedNp(0); setNpDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedNp === 0 ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'}`}
                    >
                      {t('player.nameplateNone')}
                    </button>
                    {/* 赛季铭牌 (bit 1-32) */}
                    {Array.from({ length: 32 }, (_, i) => i + 1)
                      .filter(id => hasItemBit(String(player.itemMask || '0'), id))
                      .map(id => {
                        const info = getSeasonTier(id);
                        const seasonNum = info ? info.seasonIdx + 1 : 0;
                        const tierKey = info ? `season.tier${info.tier}` : '';
                        return (
                          <button
                            key={id}
                            onClick={() => { setSelectedNp(id); setNpDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedNp === id ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'}`}
                          >
                            S{seasonNum} {t(tierKey as any)}
                          </button>
                        );
                      })}
                    {/* 商城铭牌 (33-42) */}
                    {NAMEPLATE_IDS.filter(np => hasItemBit(String(player.itemMask || '0'), np.id)).map(np => (
                      <button
                        key={np.id}
                        onClick={() => { setSelectedNp(np.id); setNpDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedNp === np.id ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-400 hover:bg-white/5'}`}
                      >
                        <span className={NAMEPLATE_STYLES[np.id] || ''}>{t(`shop.item.${np.id}.name` as any)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className={`text-white text-sm ${selectedNp > 0 ? (NAMEPLATE_STYLES[selectedNp] || '') : ''}`}>{npDisplayName(selectedNp)}</p>
            )}
          </div>

          {/* Achievements + Badge selection */}
          {(() => {
            const achStr = String(player.achievements || '0');
            const unlocked = BADGE_DEFS.filter(a => hasAchBit(achStr, a.bit));
            if (unlocked.length === 0 && !editable) return null;
            return (
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" />
                  {t('player.achievements')}
                  {editable && unlocked.length > 0 && (
                    <span className="ml-1 text-green-400 normal-case tracking-normal font-normal">
                      ({t('player.badgeEquipHint')})
                    </span>
                  )}
                </label>
                {unlocked.length === 0 ? (
                  <p className="text-zinc-600 text-xs">{t('player.noAchievements')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {editable && (
                      <button
                        onClick={() => setSelectedBadge(0)}
                        className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                          selectedBadge === 0
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                            : 'bg-white/5 text-zinc-500 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {t('player.badgeNone')}
                      </button>
                    )}
                    {unlocked.map(a => {
                      const isEquipped = selectedBadge === a.bit + 1;
                      return editable ? (
                        <button
                          key={a.bit}
                          onClick={() => setSelectedBadge(isEquipped ? 0 : a.bit + 1)}
                          className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                            isEquipped
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 ring-1 ring-cyan-500/40'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/20 hover:border-amber-500/40'
                          }`}
                        >
                          {t(a.nameKey)}
                          {isEquipped && ' \u2713'}
                        </button>
                      ) : (
                        <span key={a.bit} className="px-2 py-0.5 text-xs rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          {t(a.nameKey)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer — cost + submit (editable only) */}
        {editable && (
          <div className="p-6 pt-0 space-y-3">
            {hasChanges && (
              <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 border ${
                renamePol > 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-green-500/10 border-green-500/20'
              }`}>
                <span className={`text-xs uppercase tracking-wider font-bold ${renamePol > 0 ? 'text-orange-300' : 'text-green-400'}`}>
                  {t('player.totalCost')}
                </span>
                {renamePol > 0
                  ? <PolAmount amount={renamePol} size="md" color="text-orange-400" />
                  : <span className="text-sm font-tech text-green-400">{t('player.gasOnly')}</span>
                }
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={!hasChanges || saving}
              className={`w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${
                hasChanges
                  ? 'bg-white text-black hover:bg-orange-500 hover:text-white hover:shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer'
                  : 'bg-white/5 text-zinc-600 cursor-not-allowed'
              }`}
            >
              {saving ? t('player.submitting') : t('player.save')}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
