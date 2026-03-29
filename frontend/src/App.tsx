import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShoppingCart, Swords, Wallet, Clock, Zap, Hexagon, Users, X, ChevronRight, Crown, Medal, ChevronDown, Play, Flame, Volume2, VolumeX, Code, Loader2, Brain, ScrollText, Star, Shield, Eye, Copy, Download } from 'lucide-react';
import { MiniLobsterIcon, LobsterCoinIcon, PolAmount } from './components/Icons';
import OpenClawSVG from './components/OpenClawSVG';
import { SEASONS, themeVars } from './game/seasonThemes';
import ReplayView from './components/ReplayView';
import { t, useLang, setLang, LANGUAGES } from './i18n';
import { BGM } from './audio/BGM';
import { useWallet } from './hooks/useWallet';
import { usePlayer, useGlobalStats, useLeaderboard, useMatchHistory } from './hooks/useData';
import { playMatch, getOwner, buyItem, fetchLobsterSprites, parseContractError, dataCenter, fetchMatchById, fetchScriptNFT, estimateMatchGasCost, type MatchResult } from './services/dataStore';
import { ENTRY_FEE_POL, getRankInfo, RANKS, SHOP_ITEMS, NAMEPLATE_IDS, ITEM_ENTRY_TICKET, ITEM_RANK_SHIELD, ITEM_RATING_BOOST, ITEM_COIN_BOOST, lobsterDisplayName, scriptDisplayName } from './config/game';
import { DEFEND_REDUCE_PCT, DEFEND_HEAL_PCT, ATTACK_EXP, KILL_EXP_PCT, KILL_HEAL_PCT, EXPOSURE_DMG_PCT, EXPOSURE_ATK_PCT, RANGE_DECAY_PCT, BLINK_RANGE, BLINK_COOLDOWN, POINTS_PER_LEVEL } from './config/constants';
import { NAMEPLATE_STYLES } from './game/nameplateStyles';
import { ADDRESSES } from './config/contracts';
import { FeatureCard, tierColor, hasItemBit, ToastContainer, type ToastItem, nextToastId, formatTimeAgo } from './components/helpers';
import { PlayerNameTag } from './components/PlayerNameTag';
import { LobsterCard } from './components/LobsterCard';
import ScriptSelectPanel from './components/ScriptSelectPanel';
import AdminPage from './components/AdminPage';
import { PlayerInfoPanel } from './components/PlayerInfoPanel';
import { toast } from './services/toast';
import LobsterPanel from './components/LobsterPanel';
import { HeroSelectPanel } from './components/HeroSelectPanel';
import { CopyAddress } from './components/CopyAddress';
import { Lobster, partColorsToTheme, type LobsterTheme, type LobsterStats } from './components/Lobster';
import { fetchLobsterNFT, type LobsterNFT } from './services/dataStore';

// ══════════════════════════════════════════
// App
// ══════════════════════════════════════════

// ── Home page lobster with hover/click animation ──
function HomeLobster({ theme }: { theme: LobsterTheme | null }) {
  const [hovered, setHovered] = useState(false);
  const [charging, setCharging] = useState(false);
  const [attacking, setAttacking] = useState(false);
  const state = attacking ? 'attacking' as const : charging ? 'charging' as const : hovered ? 'walking' as const : 'idle' as const;

  return (
    <div
      className="relative w-[480px] h-[480px] z-10 transform -rotate-45 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-[51deg]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setCharging(false); setAttacking(false); }}
      onMouseDown={() => setCharging(true)}
      onMouseUp={() => { setCharging(false); setAttacking(true); setTimeout(() => setAttacking(false), 600); }}
    >
      {theme ? <Lobster theme={theme} state={state} className="w-full h-full" /> : <OpenClawSVG />}
    </div>
  );
}

// ── Transition Screen with sprite preloading ──
function TransitionScreen({ heroTokenIds, onReady }: { heroTokenIds: number[]; onReady: () => void }) {
  const [progress, setProgress] = useState({ done: 0, total: heroTokenIds.length || 8 });
  const [status, setStatus] = useState(t('replay.enteringArena'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const total = heroTokenIds.length;
      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        try {
          await fetchLobsterSprites(heroTokenIds[i]);
        } catch { /* skip */ }
        setProgress({ done: i + 1, total });
        setStatus(`${t('replay.loadingLobster')} ${i + 1}/${total}`);
      }
      if (!cancelled) {
        setStatus(t('replay.enteringArena'));
        setTimeout(onReady, 500);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center relative overflow-hidden">
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 20, opacity: 1 }} transition={{ duration: 1.5, ease: 'easeInOut' }} className="w-32 h-32 bg-orange-500 rounded-full blur-xl" />
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-white font-display text-3xl tracking-widest">
          {status}
        </motion.div>
        <div className="w-64 h-2 bg-black/30 rounded-full overflow-hidden border border-white/10">
          <motion.div
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-zinc-500 text-xs font-mono">{pct}%</span>
      </div>
    </div>
  );
}

export default function App() {
  const lang = useLang();
  const { address: walletAddress, signer, balance: walletBalance, connected: walletConnected, connecting, connect, disconnect, refreshBalance } = useWallet();
  const [matchStatus, setMatchStatus] = useState<'idle' | 'preparing' | 'found'>('idle');
  // Item toggle states for match (default: all owned items active)
  const [itemToggles, setItemToggles] = useState<Record<number, boolean>>({ 64: true, 65: true, 66: true, 67: true });

  // ── Data hooks ──
  const { data: player, refresh: refreshPlayer } = usePlayer(walletAddress);
  const { data: globalStats } = useGlobalStats();
  const { data: leaderboard } = useLeaderboard();
  const { data: matchHistory, state: matchHistoryState, refresh: refreshMatchHistory } = useMatchHistory(walletAddress);

  // Derive rank info from player rating
  const rankInfo = useMemo(() => getRankInfo(player?.rating ?? 0), [player?.rating]);

  // ── Selected hero/script (from player data or local) ──
  const [selectedHeroId, setSelectedHeroId] = useState<number>(0);
  const [selectedScriptId, setSelectedScriptId] = useState<number>(0);
  const [selectedHeroTheme, setSelectedHeroTheme] = useState<LobsterTheme | null>(null);
  useEffect(() => {
    if (player?.heroTokenId !== undefined) setSelectedHeroId(player.heroTokenId);
    if (player?.scriptTokenId !== undefined) setSelectedScriptId(player.scriptTokenId);
  }, [player?.heroTokenId, player?.scriptTokenId]);

  // 加载选中龙虾的 NFT 数据 → 生成 theme + 名字
  const [selectedHeroName, setSelectedHeroName] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchLobsterNFT(selectedHeroId)
      .then(nft => {
        if (cancelled) return;
        const stats: LobsterStats = { hp: nft.hp, atk: nft.atk, speed: nft.speed, atkRange: nft.atkRange, manaMax: nft.manaMax, skillPower: nft.skillPower };
        setSelectedHeroTheme(partColorsToTheme(
          { shell: nft.shell, claw: nft.claw, leg: nft.leg, eye: nft.eye, tail: nft.tail, aura: nft.aura, sub: nft.sub },
          stats,
        ));
        setSelectedHeroName(lobsterDisplayName(selectedHeroId, nft.name));
      })
      .catch(() => { if (!cancelled) { setSelectedHeroTheme(null); setSelectedHeroName(''); } });
    return () => { cancelled = true; };
  }, [selectedHeroId]);

  // 脚本名：走 DataCenter 统一接口（先查缓存，没有就拉取）
  const [selectedScriptName, setSelectedScriptName] = useState('');
  useEffect(() => {
    let cancelled = false;
    const quick = scriptDisplayName(selectedScriptId);
    if (!quick.startsWith('Script #')) { setSelectedScriptName(quick); return; }
    fetchScriptNFT(selectedScriptId).then(nft => {
      if (!cancelled) setSelectedScriptName(scriptDisplayName(selectedScriptId, nft.name));
    }).catch(() => { if (!cancelled) setSelectedScriptName(quick); });
    return () => { cancelled = true; };
  }, [selectedScriptId]);

  // ── UI state ──
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isMatchesOpen, setIsMatchesOpen] = useState(false);
  const [isWalletHelpOpen, setIsWalletHelpOpen] = useState(false);
  const [isTicketHelpOpen, setIsTicketHelpOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isRankInfoOpen, setIsRankInfoOpen] = useState(false);
  const [isSeasonRewardsOpen, setIsSeasonRewardsOpen] = useState(false);
  const [view, setViewRaw] = useState<'home' | 'transition' | 'replay' | 'admin'>('home');
  const setView = useCallback((v: 'home' | 'transition' | 'replay' | 'admin') => {
    setViewRaw(v);
    if (v === 'home' && window.location.search) window.history.replaceState(null, '', '/');
  }, []);
  const [isLobsterPanelOpen, setIsLobsterPanelOpen] = useState(false);
  const [isHeroSelectOpen, setIsHeroSelectOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [skillPreview, setSkillPreview] = useState<string | null>(null);
  const [isScriptEditorOpen, setIsScriptEditorOpen] = useState(false);
  const [cardViewAddr, setCardViewAddr] = useState<string | null>(null);

  const [bgmMuted, setBgmMuted] = useState(false);
  const [isContractOwner, setIsContractOwner] = useState(false);

  // ── Match result for replay ──
  const [currentMatchResult, setCurrentMatchResult] = useState<MatchResult | null>(null);
  const replayMatchEventRef = useRef<any>(null);


  // ── URL routing: ?replay={matchId} ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const replayId = params.get('replay');
    if (!replayId || !/^\d+$/.test(replayId)) return;
    const matchId = Number(replayId);
    (async () => {
      const result = await fetchMatchById(matchId);
      if (result) {
        setCurrentMatchResult(result);
        replayMatchEventRef.current = result;
        setViewRaw('replay');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Match history ──

  // ── Current language (for components that still need it as prop) ──
  const currentLang = LANGUAGES.find(l => l.code === lang)!;

  // ── Lock body scroll when any modal is open ──
  const anyModalOpen = isLeaderboardOpen || isShopOpen || isMatchesOpen || isRankInfoOpen || isSeasonRewardsOpen || isProfileOpen || isLobsterPanelOpen || isHeroSelectOpen || isScriptEditorOpen || !!cardViewAddr;
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [anyModalOpen]);

  // ── Check if current wallet is contract owner ──
  useEffect(() => {
    if (!walletAddress) { setIsContractOwner(false); return; }
    let cancelled = false;
    const check = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const owner = await getOwner();
          if (cancelled) return;
          const match = owner.toLowerCase() === walletAddress.toLowerCase();
          if (import.meta.env.DEV) console.log('[Admin] owner=', owner, 'wallet=', walletAddress, 'match=', match);
          setIsContractOwner(match);
          return;
        } catch (e) {
          if (import.meta.env.DEV) console.warn(`[Admin] getOwner attempt ${attempt + 1} failed:`, e);
        }
      }
      if (!cancelled) setIsContractOwner(false);
    };
    check();
    return () => { cancelled = true; };
  }, [walletAddress]);

  // ── Toast system ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = nextToastId();
    const truncated = message.length > 100 ? message.slice(0, 100) + '...' : message;
    setToasts(prev => [...prev, { id, message: truncated, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Bridge global toast emitter → local React state
  useEffect(() => {
    return toast.subscribe(({ message, type }) => showToast(message, type));
  }, [showToast]);

  // ── Entry fee / cost estimate ──
  const baseEntryFee = globalStats?.entryFeePol ?? ENTRY_FEE_POL;
  const usingFreeTicket = !!(player && hasItemBit(player.itemMask, ITEM_ENTRY_TICKET) && (itemToggles[ITEM_ENTRY_TICKET] ?? true));
  const entryFeePol = usingFreeTicket ? 0 : baseEntryFee;
  const [estimatedGas, setEstimatedGas] = useState('0.00001');
  useEffect(() => {
    estimateMatchGasCost().then(setEstimatedGas);
    const timer = setInterval(() => estimateMatchGasCost().then(setEstimatedGas), 30_000);
    return () => clearInterval(timer);
  }, []);

  // ── Refresh match history when panel opens with dirty data ──
  useEffect(() => {
    if (isMatchesOpen && walletAddress) refreshMatchHistory();
  }, [isMatchesOpen]);

  // Play menu BGM on home
  useEffect(() => {
    if (view === 'home') {
      BGM.preloadAll();
      BGM.play('menu');
      // Refresh data when returning home
      if (walletAddress) {
        refreshPlayer();
        refreshBalance();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, walletAddress]);

  const handleWatchReplay = () => {
    setView('transition');
    // TransitionScreen loads sprites then calls setView('replay')
  };

  const watchHistoryReplay = async (matchResult: MatchResult) => {
    setIsMatchesOpen(false);
    setCurrentMatchResult(matchResult);
    handleWatchReplay();
  };

  // ── v4 instant match flow ──
  const startMatchmaking = async () => {
    if (!walletAddress) {
      showToast(t('toast.connectWalletFirst'), 'error');
      return;
    }
    if (!signer) {
      showToast(t('toast.signerNotReady'), 'error');
      return;
    }
    if (matchStatus !== 'idle') {
      showToast(t('toast.alreadyInQueue'), 'info');
      return;
    }

    setMatchStatus('preparing');

    // Compute item flags from toggle state + owned items
    // Contract itemFlags: bit 0=ticket(64), bit 1=shield(65), bit 2=rating(66), bit 3=coin(67)
    let itemFlags = 0;
    const mask = player?.itemMask ?? 0n;
    const ITEM_FLAG_BITS: Record<number, number> = { 64: 1, 65: 2, 66: 4, 67: 8 };
    for (const id of [64, 65, 66, 67]) {
      if (itemToggles[id] && (BigInt(mask) & (1n << BigInt(id))) !== 0n) {
        itemFlags |= ITEM_FLAG_BITS[id];
      }
    }

    // Check balance
    if (walletBalance < entryFeePol) {
      showToast(`${t('toast.insufficientBalance')} (${walletBalance.toFixed(4)} BNB < ${entryFeePol} BNB)`, 'error');
      setMatchStatus('idle');
      return;
    }

    try {
      // v4: single tx — playMatch returns MatchResult directly
      const result = await playMatch(signer, selectedHeroId, selectedScriptId, itemFlags);
      if (import.meta.env.DEV) console.log(`[playMatch] gasUsed: ${result.gasUsed}, gasCost: ${result.gasCostPol} BNB`);

      // Refresh player data + wallet balance
      refreshPlayer();
      refreshBalance();

      // Set match result for replay
      setCurrentMatchResult(result);
      if (walletAddress) dataCenter.markMatchHistoryDirty(walletAddress);

      // Show found state briefly, then transition to replay
      setMatchStatus('found');
      setTimeout(() => {
        setMatchStatus('idle');
        handleWatchReplay();
      }, 1500);
    } catch (err: unknown) {
      const key = parseContractError(err);
      if (key) {
        showToast(t(key), 'error');
      } else {
        const raw = err instanceof Error ? err.message : 'Transaction failed';
        let msg: string;
        if (raw.includes('exceeds the configured cap')) msg = t('toast.txFeeTooHigh');
        else msg = raw.slice(0, 100);
        showToast(msg, 'error');
      }
      setMatchStatus('idle');
    }
  };

  // ── Season number ──
  const season = globalStats?.currentSeason ?? 1;

  // ── Leaderboard entries with rank info ──
  const leaderboardEntries = useMemo(() =>
    (leaderboard ?? []).map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
      rankInfo: getRankInfo(entry.rating),
    })),
  [leaderboard]);

  // ── Admin view ──
  if (view === 'admin') return (
    <>
      <AdminPage onBack={() => setView('home')} onOpenLobsterPanel={() => setIsLobsterPanelOpen(true)} signer={signer} walletAddress={walletAddress || ''} />
      {isLobsterPanelOpen && <LobsterPanel onClose={() => setIsLobsterPanelOpen(false)} lang={lang} />}
    </>
  );

  // ── Replay view ──
  if (view === 'replay' && currentMatchResult) {
    if (!replayMatchEventRef.current || replayMatchEventRef.current._seed !== currentMatchResult.seed) {
      replayMatchEventRef.current = {
        _seed: currentMatchResult.seed,
        matchId: currentMatchResult.matchId,
        seed: currentMatchResult.seed,
        players: currentMatchResult.players,
        heroIds: currentMatchResult.heroTokenIds,
        heroTokenIds: currentMatchResult.heroTokenIds,
        scriptTokenIds: currentMatchResult.scriptTokenIds,
        isPlayer: currentMatchResult.players.map(() => true),  // v4: 所有参与者都是玩家
        scripts: currentMatchResult.scriptTokenIds.map((id: number) => [id]),
      };
    }
    const settlement = {
      rank8: currentMatchResult.playerRank,
      rank12: currentMatchResult.playerRank,
      kills: 0, firstBlood: false,
      ratingChange: currentMatchResult.ratingChange,
      coinsEarned: currentMatchResult.coinsEarned,
      oldRating: (player?.rating ?? 0) - currentMatchResult.ratingChange,
      newRating: player?.rating ?? 0,
      oldStreak: 0, newStreak: player?.streak ?? 0,
      oldRank: getRankInfo((player?.rating ?? 0) - currentMatchResult.ratingChange),
      newRank: rankInfo,
    };
    return <ReplayView matchEvent={replayMatchEventRef.current} settlement={settlement as any} onBack={() => {
      replayMatchEventRef.current = null;
      setView('home');
    }} lang={lang} playerAddress={walletAddress || undefined} />;
  }

  // ── Transition animation + sprite preload ──
  if (view === 'transition') return (
    <TransitionScreen
      heroTokenIds={currentMatchResult?.heroTokenIds ?? []}
      onReady={() => setView('replay')}
    />
  );

  // ── Home ──
  return (
    <div className="min-h-screen bg-[#050505] font-sans selection:bg-red-500/30 pb-10 relative overflow-hidden">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Wallet Help Modal */}
      <AnimatePresence>
        {isWalletHelpOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onMouseDown={() => setIsWalletHelpOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md p-6 relative"
              onMouseDown={e => e.stopPropagation()}
            >
              <button onClick={() => setIsWalletHelpOpen(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              <h2 className="text-lg font-bold text-white mb-5">{t('walletHelp.title')}</h2>
              <div className="space-y-4">
                {(['step1', 'step2', 'step3'] as const).map(step => (
                  <div key={step}>
                    <h3 className="text-sm font-bold text-orange-400">{t(`walletHelp.${step}.title` as any)}</h3>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t(`walletHelp.${step}.desc` as any)}</p>
                  </div>
                ))}
              </div>
              {/* MetaMask download link */}
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer"
                className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 rounded-xl font-bold text-sm transition-colors">
                <Wallet className="w-4 h-4" /> metamask.io/download
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticket Help Modal */}
      <AnimatePresence>
        {isTicketHelpOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onMouseDown={() => setIsTicketHelpOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md p-6 relative"
              onMouseDown={e => e.stopPropagation()}
            >
              <button onClick={() => setIsTicketHelpOpen(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              <h2 className="text-lg font-bold text-white mb-3">{t('hero.ticketHelp.title')}</h2>
              {/* 防滥用说明 */}
              <p className="text-sm text-zinc-300 mb-4">{t('hero.ticketHelp.desc').split('\n')[0]}</p>
              {/* 步骤 */}
              <div className="space-y-2 mb-4">
                {t('hero.ticketHelp.desc').split('\n').filter((line: string) => /^\d\./.test(line.trim())).map((step: string, i: number) => {
                  const text = step.replace(/^\d\.\s*/, '');
                  // 提币步骤：重点突出 opBNB
                  const isWithdrawStep = text.includes('opBNB') && (text.includes('Withdraw') || text.includes('提币') || text.includes('提幣') || text.includes('출금') || text.includes('出金') || text.includes('Retira') || text.includes('Saque') || text.includes('Выведите') || text.includes('çek') || text.includes('Rút'));
                  return (
                    <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${isWithdrawStep ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/[0.03] border border-white/5'}`}>
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5 ${isWithdrawStep ? 'bg-yellow-500/30 text-yellow-400' : 'bg-orange-500/20 text-orange-400'}`}>{i + 1}</span>
                      <div className="text-xs leading-relaxed">
                        {isWithdrawStep ? (
                          <>
                            <span className="text-zinc-300">{text.split('opBNB')[0]}</span>
                            <span className="font-bold text-yellow-400 bg-yellow-500/15 px-1.5 py-0.5 rounded">opBNB</span>
                            <span className="text-zinc-300">{text.split('opBNB').slice(1).join('opBNB')}</span>
                            <p className="text-yellow-500/70 text-[10px] mt-1">⚠ {lang === 'zh' ? '注意选择 opBNB，不是 BNB Smart Chain (BSC)' : lang === 'tw' ? '注意選擇 opBNB，不是 BNB Smart Chain (BSC)' : 'Select opBNB, NOT BNB Smart Chain (BSC)'}</p>
                          </>
                        ) : (
                          <span className="text-zinc-300">{text}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 免费入场券 */}
              <p className="text-xs text-zinc-500 mb-3">{t('hero.ticketHelp.desc').split('\n').find((l: string) => l.includes('Free Ticket') || l.includes('免费') || l.includes('免費') || l.includes('無料') || l.includes('무료') || l.includes('gratis') || l.includes('gratuita') || l.includes('бесплатн') || l.includes('Ücretsiz') || l.includes('miễn phí')) || ''}</p>
              {/* 添加网络备注 */}
              {t('hero.ticketHelp.desc').includes('──') && (
                <details className="group" data-network-help>
                  <summary className="text-xs text-emerald-400 cursor-pointer hover:text-emerald-300 transition-colors">
                    {lang === 'zh' ? '如果钱包里没找到 opBNB 网络，可以手动添加' : lang === 'tw' ? '如果錢包裡沒找到 opBNB 網路，可以手動添加' : 'If opBNB is not in your wallet, add it manually'}
                  </summary>
                  <div className="mt-2 bg-zinc-900/80 border border-white/5 rounded-lg p-3 text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre-line">
                    {t('hero.ticketHelp.desc').split('──')[1]?.trim()}
                  </div>
                </details>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-red-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-orange-900/10 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-grid opacity-50" />
      </div>

      {/* ── Header ── */}
      <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="w-full px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)] cursor-pointer relative overflow-hidden group"
              onClick={() => { if (walletConnected) setIsProfileOpen(true); }}
              title="Edit Profile"
            >
              <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <MiniLobsterIcon className="text-white w-7 h-7" />
            </div>

            {walletConnected ? (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3">
                {/* Name with nameplate style */}
                <span onClick={() => { if (walletAddress) { setCardViewAddr(walletAddress); } }}
                  className="cursor-pointer">
                  <PlayerNameTag
                    address={walletAddress || ''}
                    className="text-white font-bold text-sm"
                  />
                  {walletAddress && <CopyAddress address={walletAddress} className="text-zinc-500 text-xs ml-2" iconSize={10} />}
                </span>
                {/* Rank badge */}
                <button onClick={() => setIsRankInfoOpen(true)} className="text-xs font-bold uppercase px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer" style={{ color: rankInfo.color }}>
                  {t(`rank.${rankInfo.id}`)} {rankInfo.tierName} ({player?.rating ?? 0})
                </button>
                {/* Coins */}
                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <LobsterCoinIcon className="w-5 h-5" />
                  <span className="text-white font-tech text-sm font-bold">{(player?.coins ?? 0).toLocaleString()}</span>
                </div>
              </motion.div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={connect} disabled={connecting}
                  className="bg-white text-black px-6 py-2.5 font-bold uppercase tracking-wide text-sm rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> {connecting ? '...' : t('header.connectWallet')}
                </button>
                <button onClick={() => setIsWalletHelpOpen(true)}
                  className="text-white/70 hover:text-white text-xs underline underline-offset-2 transition-colors whitespace-nowrap">
                  {t('header.walletHelp')}
                </button>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3 relative">
            <button onClick={() => setIsShopOpen(true)} className="px-5 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white rounded-lg font-tech font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-orange-400" /> {t('header.shop')}
            </button>
            <button onClick={() => setIsMatchesOpen(true)} className="px-5 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white rounded-lg font-tech font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2">
              <Swords className="w-4 h-4 text-red-400" /> {t('header.myMatches')}
            </button>

            {/* Language Dropdown */}
            <div className="relative">
              <button onClick={() => setIsLangOpen(!isLangOpen)} className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white rounded-lg font-tech font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2">
                {currentLang.name} <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {isLangOpen && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-36 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                    {LANGUAGES.map(l => (
                      <button key={l.code} onClick={() => { setLang(l.code); setIsLangOpen(false); }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 text-zinc-300 hover:text-white transition-colors text-sm font-bold">
                        {l.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={() => { const m = BGM.toggleMute(); setBgmMuted(m); }} className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all">
              {bgmMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Social Links */}
            <a href="https://x.com/LazyGooooo" target="_blank" rel="noopener noreferrer"
              className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://discord.gg/JrC6Kcdm" target="_blank" rel="noopener noreferrer"
              className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-[#5865F2] transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </a>
            <a href="https://github.com/jinruozai/ClawKing" target="_blank" rel="noopener noreferrer"
              className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>

            {walletConnected && (
              <div className="flex items-center pl-2 ml-2 border-l border-white/10">
                <button onClick={disconnect}
                  className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg font-tech font-bold uppercase tracking-widest text-sm transition-all">
                  {t('header.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Season Badge — absolute in hero section, scrolls with page */}
      <button onClick={() => setIsSeasonRewardsOpen(true)}
        className="absolute top-24 right-4 z-40 bg-black/60 backdrop-blur-md border border-orange-500/30 px-5 py-3 rounded-2xl flex items-center gap-4 shadow-[0_0_30px_rgba(249,115,22,0.2)] hover:bg-black/80 hover:border-orange-500/50 transition-all cursor-pointer group">
        <div className="relative flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-white font-display text-xl leading-none tracking-wider">{t('common.season')} {season} {t('season.rewards')}</span>
          <span className="text-orange-400/60 group-hover:text-orange-400 text-xs font-tech font-bold uppercase tracking-widest leading-none mt-1.5 transition-colors">{t('season.clickToView')}</span>
        </div>
      </button>

      {/* ── Hero Section ── */}
      <section className="relative pt-28 pb-12 lg:pt-32 lg:pb-16 min-h-[80vh] flex items-center z-10">
        <div className="max-w-7xl mx-auto px-6 w-full grid lg:grid-cols-2 gap-8 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="pt-8">
            <h1 className="font-display text-6xl lg:text-8xl text-white leading-[0.9] tracking-tight mb-6 drop-shadow-2xl">
              {t('hero.title1')}{lang !== 'zh' ? ' ' : ''}<span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500">{t('hero.title2')}</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-md mb-4 font-sans leading-relaxed">{t('hero.desc')}</p>
            <p className="text-orange-400/90 text-sm font-bold max-w-md mb-6 tracking-wide">{t('hero.autoFight')}</p>

            <div className="flex items-center gap-3 mb-10 flex-wrap">
              <button onClick={() => { const el = document.getElementById('quick-start'); if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' }); }}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-xl text-sm text-orange-300 hover:from-orange-500/30 hover:to-red-500/30 hover:text-orange-200 transition-all font-bold tracking-wide">
                {t('quickStart.title')}
              </button>
              <button onClick={() => { const el = document.getElementById('deploy-agent'); if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' }); }}
                className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-all font-bold tracking-wide">
                {t('agent.title')}
              </button>
              <button onClick={() => { const el = document.getElementById('how-it-works'); if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' }); }}
                className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-all font-bold tracking-wide">
                {t('howItWorks.title')}
              </button>
            </div>

            {/* Matchmaking Box */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6 rounded-3xl max-w-md relative shadow-2xl">
              <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 blur-3xl rounded-full pointer-events-none" />
              <div className="flex justify-between items-center mb-4 relative z-10">
                <div className="flex items-center gap-2">
                  <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">{t('hero.ticket')}</p>
                  <button onClick={() => setIsTicketHelpOpen(true)} className="w-5 h-5 rounded-full bg-white/10 text-zinc-400 hover:text-white hover:bg-white/20 flex items-center justify-center text-[10px] font-bold transition-colors">?</button>
                  <span className="relative group">
                    <button onClick={() => setIsTicketHelpOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-xs font-bold tracking-wide hover:bg-yellow-500/25 transition-colors">
                      <img src="/bnb_logo.png" alt="" className="w-4 h-4 rounded-full" />
                      opBNB
                    </button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-[11px] text-zinc-300 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-center leading-relaxed whitespace-pre-line">
                      {t('chain.opbnbTip')}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {usingFreeTicket
                    ? <span className="text-3xl font-tech font-bold text-green-400 tracking-wide">{t('item.free')}</span>
                    : <PolAmount amount={baseEntryFee} size="lg" />
                  }
                </div>
              </div>

              {/* Wallet balance */}
              {walletConnected && (
                <div className="relative z-10 flex items-center justify-between mb-4 px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-zinc-500 text-xs font-bold">{t('wallet.balance')}</span>
                  </div>
                  <PolAmount amount={walletBalance.toFixed(4)} size="sm" color={walletBalance < entryFeePol ? 'text-red-400' : 'text-white'} />
                </div>
              )}

              <div className="relative z-10">
                {matchStatus === 'idle' && (
                  <>
                    <button onClick={startMatchmaking}
                      className="w-full h-[64px] relative group overflow-hidden bg-white text-black py-4 rounded-xl font-display text-2xl tracking-wider uppercase transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient" />
                      <span className="relative z-10 flex items-center justify-center gap-3 group-hover:text-white transition-colors">
                        <Swords className="w-6 h-6" /> {t('hero.startMatch')}
                      </span>
                    </button>
                    {/* Item toggles — only show owned consumable items */}
                    {player && (() => {
                      const items = [
                        { id: ITEM_ENTRY_TICKET, color: 'from-green-500 to-emerald-400', border: 'border-green-500/40' },
                        { id: ITEM_RANK_SHIELD, color: 'from-blue-500 to-cyan-500', border: 'border-blue-500/40' },
                        { id: ITEM_RATING_BOOST, color: 'from-orange-500 to-yellow-500', border: 'border-orange-500/40' },
                        { id: ITEM_COIN_BOOST, color: 'from-yellow-500 to-amber-400', border: 'border-yellow-500/40' },
                      ].filter(it => hasItemBit(player.itemMask, it.id));
                      if (items.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {items.map(it => {
                            const active = itemToggles[it.id] ?? true;
                            return (
                              <button
                                key={it.id}
                                onClick={() => setItemToggles(prev => ({ ...prev, [it.id]: !prev[it.id] }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                  active
                                    ? `bg-gradient-to-r ${it.color} ${it.border} text-black shadow-lg`
                                    : 'bg-white/5 border-white/10 text-zinc-500'
                                }`}
                              >
                                {active ? t('item.active') : t('item.inactive')}:{t(`shop.item.${it.id}.name` as any)}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
                {matchStatus === 'preparing' && (
                  <div className="w-full h-[64px] flex items-center justify-center bg-black/50 border border-zinc-500/50 rounded-xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-zinc-500/10 animate-pulse" />
                    <span className="relative z-10 text-zinc-300 font-tech text-sm animate-pulse flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t('match.preparing')}
                    </span>
                  </div>
                )}
                {matchStatus === 'found' && (
                  <div className="w-full h-[64px] flex items-center justify-center bg-green-500 text-black py-4 rounded-xl font-display text-2xl tracking-wider uppercase text-center shadow-[0_0_30px_rgba(34,197,94,0.6)] animate-pulse">
                    {t('hero.matchFound')}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Lobster Visual */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:flex flex-col items-center relative -translate-x-16 -translate-y-4">
            <div className="relative w-[550px] h-[550px] flex items-center justify-center group">
              <div className="absolute inset-0 bg-orange-600/20 rounded-full blur-[120px] transition-all duration-500 group-hover:bg-red-600/30 group-hover:blur-[150px]" />
              <div className="absolute inset-0 border border-red-500/10 rounded-full scale-[1.15] animate-[spin_20s_linear_infinite] group-hover:animate-[spin_5s_linear_infinite] group-hover:border-red-500/40 transition-all duration-500" />
              <div className="absolute inset-0 border-2 border-dashed border-orange-500/20 rounded-full scale-90 animate-[spin_30s_linear_infinite_reverse] group-hover:animate-[spin_10s_linear_infinite_reverse] group-hover:border-orange-500/50 transition-all duration-500" />
              <HomeLobster theme={selectedHeroTheme} />
            </div>
            {/* Hero Name + Strategy */}
            <div className="relative z-40 -mt-8 mb-2 text-center">
              <p className="text-lg font-display tracking-wider text-white/80">{selectedHeroName}</p>
              {selectedScriptName && (
                <p className="text-xs text-zinc-500 mt-0.5">{t('hero.currentStrategy')}：{selectedScriptName}</p>
              )}
            </div>
            {/* Choose Lobster + Script Buttons */}
            <div className="relative z-40 flex items-center gap-2">
              <button
                onClick={() => setIsHeroSelectOpen(true)}
                className="px-8 py-3 bg-white/[0.06] backdrop-blur-md border border-white/15 hover:bg-white/10 hover:border-orange-500/40 text-zinc-300 hover:text-white rounded-2xl font-tech font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-3 group shadow-lg"
              >
                <MiniLobsterIcon className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                {t('hero.chooseLobster')}
              </button>
              <button
                onClick={() => setIsScriptEditorOpen(true)}
                className="px-4 py-3 bg-white/[0.06] backdrop-blur-md border border-white/15 hover:bg-white/10 hover:border-cyan-500/40 text-zinc-300 hover:text-white rounded-2xl font-tech font-bold uppercase tracking-widest text-sm transition-all flex items-center gap-2 group shadow-lg"
                title={t('script.configure')}
              >
                <Code className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                {t('script.configure')}
              </button>
            </div>
            <p className="text-zinc-500 text-xs mt-3">
              {t('hero.aiSkillHint.before')}
              <button
                onClick={() => {
                  fetch('/SKILL.md').then(r => r.text()).then(text => {
                    navigator.clipboard.writeText(text);
                    showToast(t('agent.copied'), 'success');
                  });
                }}
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer transition-colors font-bold"
              >SKILL.md</button>
              {t('hero.aiSkillHint.after')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Quick Start ── */}
      <section id="quick-start" className="pt-16 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-3xl lg:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 tracking-tight mb-6">{t('quickStart.title')}</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {/* 准备钱包 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-sm font-bold text-orange-400">1</span>
                <h4 className="text-white font-bold">{t('quickStart.wallet.title')}</h4>
              </div>
              <div className="space-y-2.5 mb-4">
                {t('quickStart.wallet.desc').split('\n').map((line: string, i: number) => {
                  const text = line.replace(/^\d\.\s*/, '');
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 leading-relaxed">
                      <span className="text-orange-400/60 mt-0.5">•</span>
                      <span>
                        {i === 0 ? (
                          <>{text.split('MetaMask')[0]}<a href="https://metamask.io" target="_blank" rel="noopener" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">MetaMask</a>{text.split('MetaMask')[1]}</>
                        ) : text}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400 text-xs">⚠</span>
                  <span className="text-yellow-400/80 text-xs">{lang === 'zh' ? '提币选 opBNB，不是 BNB Smart Chain' : lang === 'tw' ? '提幣選 opBNB，不是 BNB Smart Chain' : 'Select opBNB network, NOT BNB Smart Chain'}</span>
                </div>
                <button onClick={() => { setIsTicketHelpOpen(true); setTimeout(() => document.querySelector<HTMLElement>('details[data-network-help]')?.setAttribute('open', ''), 100); }} className="text-red-400 hover:text-red-300 text-xs font-bold whitespace-nowrap ml-2 underline underline-offset-2">
                  {lang === 'zh' ? '未找到opBNB?' : lang === 'tw' ? '未找到opBNB?' : "Can't find opBNB?"}
                </button>
              </div>
            </div>
            {/* 开始游戏 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-sm font-bold text-green-400">2</span>
                <h4 className="text-white font-bold">{t('quickStart.play')}</h4>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed mb-3">
                {lang === 'zh' ? (<><span className="text-green-400 font-bold">连接钱包</span>，点击<span className="text-green-400 font-bold">开始匹配</span>即可直接开始比赛。</>)
                 : lang === 'tw' ? (<><span className="text-green-400 font-bold">連接錢包</span>，點擊<span className="text-green-400 font-bold">開始配對</span>即可直接開始比賽。</>)
                 : (<><span className="text-green-400 font-bold">Connect wallet</span>, click <span className="text-green-400 font-bold">Start Matchmaking</span> to play immediately.</>)}
              </p>
              <p className="text-zinc-400 text-xs flex-1">{lang === 'zh' ? '你也可以选择喜欢的英雄和策略再开始。' : lang === 'tw' ? '你也可以選擇喜歡的英雄和策略再開始。' : 'You can also pick your favorite hero and strategy before starting.'}</p>
            </div>
          </div>
          {/* 进阶玩法 */}
          <div className="mt-5 rounded-xl border border-purple-500/20 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 mb-3">
              <Hexagon className="w-5 h-5 text-purple-400" />
              <h4 className="text-white font-bold">{t('quickStart.advanced.title')}</h4>
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {lang === 'zh' ? (<><span className="text-purple-300 font-bold">铸造你自己的龙虾</span>，拥有独特属性。<span className="text-purple-300 font-bold">设计专属策略脚本</span>（也可以让 AI 帮你设计）。在龙虾/脚本选择面板中都有铸造选项。</>)
               : lang === 'tw' ? (<><span className="text-purple-300 font-bold">鑄造你自己的龍蝦</span>，擁有獨特屬性。<span className="text-purple-300 font-bold">設計專屬策略腳本</span>（也可以讓 AI 幫你設計）。在龍蝦/腳本選擇面板中都有鑄造選項。</>)
               : (<><span className="text-purple-300 font-bold">Mint your own lobster</span> with unique stats. <span className="text-purple-300 font-bold">Design custom AI scripts</span> (or let AI design for you). Find mint options in the Lobster/Script panels.</>)}
            </p>
          </div>
        </div>
      </section>

      {/* ── AI Agent Section ── */}
      <section id="deploy-agent" className="py-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-3xl lg:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 tracking-tight mb-6">{t('agent.title')}</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 lg:p-8">
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              {/* 左：步骤 */}
              <div>
                <p className="text-zinc-300 text-sm leading-relaxed mb-5">{t('agent.skillDesc')}</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center mt-0.5 shrink-0">1</span>
                    <span className="text-sm text-zinc-300">{lang === 'zh' ? '下载或复制右侧的 SKILL.md 文件' : lang === 'tw' ? '下載或複製右側的 SKILL.md 檔案' : 'Download or copy the SKILL.md file on the right'}</span>
                  </div>
                  <div className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center mt-0.5 shrink-0">2</span>
                    <span className="text-sm text-zinc-300">{lang === 'zh' ? '交给你的 AI（OpenClaw 或其它有自主操作能力的 AI）' : lang === 'tw' ? '交給你的 AI（OpenClaw 或其它有自主操作能力的 AI）' : 'Give it to your AI (OpenClaw or any AI with autonomous capabilities)'}</span>
                  </div>
                  <div className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center mt-0.5 shrink-0">3</span>
                    <span className="text-sm text-zinc-300">{lang === 'zh' ? 'AI 会自动创建钱包、设计策略、发起对战' : lang === 'tw' ? 'AI 會自動創建錢包、設計策略、發起對戰' : 'AI will auto-create wallet, design strategies, and battle'}</span>
                  </div>
                </div>
              </div>
              {/* 右：SKILL.md 文件卡片 */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-5 text-center">
                <p className="text-xs font-bold text-orange-400/60 uppercase tracking-[0.3em] mb-2">{t('agent.skillFile')}</p>
                <h3 className="font-display text-2xl text-white tracking-wider mb-4">SKILL.md</h3>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button onClick={() => fetch('/SKILL.md').then(r => r.text()).then(text => setSkillPreview(text))}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-all">
                    <Eye className="w-4 h-4" /> {t('agent.preview')}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText('ClawKing (clawking.cc) — The first fully on-chain AI arena game. 8-player FFA battle royale where AI agents compete by writing strategy scripts. Learn and install this skill file to start playing: https://clawking.cc/SKILL.md'); showToast(t('agent.copied'), 'success'); }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-all">
                    <Copy className="w-4 h-4" /> {t('agent.copy')}
                  </button>
                  <a href="/SKILL.md" download="SKILL.md"
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-lg text-sm text-orange-300 hover:from-orange-500/30 hover:to-red-500/30 hover:text-orange-200 transition-all">
                    <Download className="w-4 h-4" /> {t('agent.download')}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="pt-8 pb-16 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-3xl lg:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 tracking-tight mb-8">{t('howItWorks.title')}</h2>

          {/* 四个行为 */}
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">{lang === 'zh' ? '四个行为' : lang === 'tw' ? '四個行為' : 'Actions'}</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* 攻击 */}
            <div className="rounded-xl border border-red-500/20 bg-white/[0.02] p-5">
              <div className="text-red-400 mb-2"><Swords className="w-5 h-5" /></div>
              <h4 className="text-white font-bold text-sm mb-2">{lang === 'zh' ? '攻击' : lang === 'tw' ? '攻擊' : 'Attack'}</h4>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>{lang === 'zh' ? '造成伤害' : lang === 'tw' ? '造成傷害' : 'Deal damage'}</p>
                <p>{lang === 'zh' ? `+1 破绽 · +1 蓝量 · +${ATTACK_EXP} 经验` : lang === 'tw' ? `+1 破綻 · +1 藍量 · +${ATTACK_EXP} 經驗` : `+1 exposure · +1 mana · +${ATTACK_EXP} EXP`}</p>
                <p className="text-blue-400">{lang === 'zh' ? '蓝满后下次攻击释放技能' : lang === 'tw' ? '藍滿後下次攻擊釋放技能' : 'Full mana → next attack triggers skill'}</p>
              </div>
            </div>
            {/* 防御 */}
            <div className="rounded-xl border border-blue-500/20 bg-white/[0.02] p-5">
              <div className="text-blue-400 mb-2"><Shield className="w-5 h-5" /></div>
              <h4 className="text-white font-bold text-sm mb-2">{lang === 'zh' ? '防御' : lang === 'tw' ? '防禦' : 'Defend'}</h4>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>{lang === 'zh' ? '清空破绽' : lang === 'tw' ? '清空破綻' : 'Clear all exposure'}</p>
                <p>{lang === 'zh' ? `减伤 ${DEFEND_REDUCE_PCT}%` : lang === 'tw' ? `減傷 ${DEFEND_REDUCE_PCT}%` : `${DEFEND_REDUCE_PCT}% damage reduction`}</p>
                <p>{lang === 'zh' ? `回血 ${DEFEND_HEAL_PCT}% 最大生命值` : lang === 'tw' ? `回血 ${DEFEND_HEAL_PCT}% 最大生命值` : `Heal ${DEFEND_HEAL_PCT}% max HP`}</p>
              </div>
            </div>
            {/* 移动 */}
            <div className="rounded-xl border border-green-500/20 bg-white/[0.02] p-5">
              <div className="text-green-400 mb-2"><Play className="w-5 h-5" /></div>
              <h4 className="text-white font-bold text-sm mb-2">{lang === 'zh' ? '移动' : lang === 'tw' ? '移動' : 'Move'}</h4>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>{lang === 'zh' ? '向任意方向移动一格' : lang === 'tw' ? '向任意方向移動一格' : 'Move 1 tile in any direction'}</p>
                <p>{lang === 'zh' ? '-1 破绽' : lang === 'tw' ? '-1 破綻' : '-1 exposure'}</p>
              </div>
            </div>
            {/* 闪现 */}
            <div className="rounded-xl border border-purple-500/20 bg-white/[0.02] p-5">
              <div className="text-purple-400 mb-2"><Zap className="w-5 h-5" /></div>
              <h4 className="text-white font-bold text-sm mb-2">{lang === 'zh' ? '闪现' : lang === 'tw' ? '閃現' : 'Blink'}</h4>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>{lang === 'zh' ? `瞬移 ${BLINK_RANGE} 格` : lang === 'tw' ? `瞬移 ${BLINK_RANGE} 格` : `Teleport ${BLINK_RANGE} tiles`}</p>
                <p>{lang === 'zh' ? '-1 破绽' : lang === 'tw' ? '-1 破綻' : '-1 exposure'}</p>
                <p className="text-zinc-500">{lang === 'zh' ? `冷却 ${BLINK_COOLDOWN} 回合` : lang === 'tw' ? `冷卻 ${BLINK_COOLDOWN} 回合` : `${BLINK_COOLDOWN} turn cooldown`}</p>
              </div>
            </div>
          </div>

          {/* 核心机制 */}
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">{lang === 'zh' ? '核心机制' : lang === 'tw' ? '核心機制' : 'Mechanics'}</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* 破绽 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h4 className="text-red-400 font-bold text-sm mb-2">{lang === 'zh' ? '破绽' : lang === 'tw' ? '破綻' : 'Exposure'}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {lang === 'zh' ? `攻击 +1 破绽。每点破绽：受伤 +${EXPOSURE_DMG_PCT}%，伤害 -${EXPOSURE_ATK_PCT}%，被发现距离 -1。击杀拉满破绽。移动/闪现 -1。防御清空。`
                 : lang === 'tw' ? `攻擊 +1 破綻。每點破綻：受傷 +${EXPOSURE_DMG_PCT}%，傷害 -${EXPOSURE_ATK_PCT}%，被發現距離 -1。擊殺拉滿破綻。移動/閃現 -1。防禦清空。`
                 : `Attack +1. Each point: +${EXPOSURE_DMG_PCT}% damage taken, -${EXPOSURE_ATK_PCT}% damage dealt, detection -1. Kill = max. Move/Blink -1. Defend clears all.`}
              </p>
            </div>
            {/* 攻击/视野范围 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h4 className="text-orange-400 font-bold text-sm mb-2">{lang === 'zh' ? '攻击/视野范围' : lang === 'tw' ? '攻擊/視野範圍' : 'Attack / Vision Range'}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{lang === 'zh' ? `攻击范围即视野范围。脚本只能获取视野内的敌人。每远一格伤害 -${RANGE_DECAY_PCT}%。` : lang === 'tw' ? `攻擊範圍即視野範圍。腳本只能獲取視野內的敵人。每遠一格傷害 -${RANGE_DECAY_PCT}%。` : `Attack range = vision range. Scripts can only see enemies in range. Damage -${RANGE_DECAY_PCT}% per extra tile.`}</p>
            </div>
            {/* 经验与升级 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h4 className="text-yellow-400 font-bold text-sm mb-2">{lang === 'zh' ? '经验与升级' : lang === 'tw' ? '經驗與升級' : 'EXP & Level Up'}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{lang === 'zh' ? `攻击 +${ATTACK_EXP} 经验。击杀获得对方 ${KILL_EXP_PCT}% 经验 + 回复 ${KILL_HEAL_PCT}% 缺失血量。升级 +${POINTS_PER_LEVEL} 属性点，回满血。` : lang === 'tw' ? `攻擊 +${ATTACK_EXP} 經驗。擊殺獲得對方 ${KILL_EXP_PCT}% 經驗 + 回復 ${KILL_HEAL_PCT}% 缺失血量。升級 +${POINTS_PER_LEVEL} 屬性點，回滿血。` : `Attack +${ATTACK_EXP} EXP. Kill = ${KILL_EXP_PCT}% of victim's EXP + heal ${KILL_HEAL_PCT}% missing HP. Level up: +${POINTS_PER_LEVEL} stat points, full heal.`}</p>
            </div>
            {/* 毒圈 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h4 className="text-purple-400 font-bold text-sm mb-2">{lang === 'zh' ? '毒圈' : lang === 'tw' ? '毒圈' : 'Poison Ring'}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{lang === 'zh' ? '毒圈持续缩小，站在圈外持续受伤。活得越久排名越高，最后存活的龙虾获胜。' : lang === 'tw' ? '毒圈持續縮小，站在圈外持續受傷。活得越久排名越高，最後存活的龍蝦獲勝。' : 'The ring keeps shrinking. Standing outside deals damage. Survive longer = higher rank. Last lobster wins.'}</p>
            </div>
          </div>

          {/* 策略脚本 */}
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">{lang === 'zh' ? '策略脚本' : lang === 'tw' ? '策略腳本' : 'Strategy Script'}</h3>
          <div className="rounded-xl border border-orange-500/20 bg-white/[0.02] p-5">
            <p className="text-sm text-zinc-300 leading-relaxed">{lang === 'zh'
              ? '每只龙虾由 AI 脚本控制。脚本定义了「看到什么敌人」和「做什么动作」。每回合从上到下逐条判断规则，第一条满足条件的规则执行。你可以使用默认策略，也可以自己设计或让 AI 帮你生成。'
              : lang === 'tw'
              ? '每隻龍蝦由 AI 腳本控制。腳本定義了「看到什麼敵人」和「做什麼動作」。每回合從上到下逐條判斷規則，第一條滿足條件的規則執行。你可以使用預設策略，也可以自己設計或讓 AI 幫你生成。'
              : 'Each lobster is controlled by an AI script. Scripts define "which enemy to target" and "what action to take". Rules are checked top-to-bottom each turn — first match fires. Use default scripts, design your own, or let AI generate one.'
            }</p>
          </div>

          {/* 设计理念 */}
          <div className="mt-10 text-center">
            <p className="text-zinc-300 text-sm leading-relaxed max-w-2xl mx-auto italic">
              {lang === 'zh' ? '「四个行为，五层破绽，一套规则引擎。极简的设计，却涌现出无穷的策略深度。每一条规则的顺序、每一次攻防的取舍，都可能改变战局走向。」'
               : lang === 'tw' ? '「四個行為，五層破綻，一套規則引擎。極簡的設計，卻湧現出無窮的策略深度。每一條規則的順序、每一次攻防的取捨，都可能改變戰局走向。」'
               : '"Four actions. Five layers of exposure. One rule engine. Minimal design, infinite strategic depth. The order of every rule, the choice between attack and defense — each decision shapes the outcome."'}
            </p>
          </div>
        </div>
      </section>

      {/* SKILL.md Preview Modal */}
      <AnimatePresence>
        {skillPreview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setSkillPreview(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl" onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                <h3 className="font-display text-lg text-white tracking-wider">SKILL.md</h3>
                <button onClick={() => setSkillPreview(null)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <pre className="flex-1 overflow-auto p-6 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">{skillPreview}</pre>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Features ── */}
      <section className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard icon={<Hexagon className="w-6 h-6" />} title={t('feature.onchain.title')} desc={t('feature.onchain.desc')} />
            <FeatureCard icon={<Brain className="w-6 h-6" />} title={t('feature.ai.title')} desc={t('feature.ai.desc')} />
            <FeatureCard icon={<Shield className="w-6 h-6" />} title={t('feature.fair.title')} desc={t('feature.fair.desc')} />
            <FeatureCard icon={<Star className="w-6 h-6" />} title={t('feature.mintHero.title')} desc={t('feature.mintHero.desc')} />
            <FeatureCard icon={<ScrollText className="w-6 h-6" />} title={t('feature.mintScript.title')} desc={t('feature.mintScript.desc')} />
            <FeatureCard icon={<span onClick={isContractOwner ? () => setView('admin') : undefined} style={isContractOwner ? { cursor: 'pointer' } : undefined}><Crown className="w-6 h-6" /></span>} title={t('feature.rank.title')} desc={t('feature.rank.desc')} />
          </div>
        </div>
      </section>

      {/* ── Leaderboard Widget (below season badge) ── */}
      <div className="absolute top-44 right-4 w-72 z-30 hidden md:block">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white/70 font-display text-sm tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500/70" /> {t('leaderboard.title')}
          </h3>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
        <div className="space-y-1 mb-2">
          {leaderboardEntries.slice(0, 3).map((p, idx) => (
            <div key={p.rank} className="flex items-center justify-between py-1.5 px-1 hover:bg-white/5 rounded transition-colors">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : idx === 1 ? 'bg-zinc-400/20 text-zinc-300 border border-zinc-400/50' : 'bg-orange-500/20 text-orange-400 border border-orange-500/50'}`}>
                  {p.rank}
                </div>
                <PlayerNameTag address={p.address} className="text-zinc-300 font-medium text-xs" onClick={() => { setCardViewAddr(p.address); }} />
              </div>
              <span className="text-orange-500/80 font-tech font-bold text-xs">{p.rating}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setIsLeaderboardOpen(true)}
          className="w-full py-1.5 hover:bg-white/5 text-white/50 hover:text-white/80 text-[10px] font-bold uppercase tracking-widest rounded transition-all flex items-center justify-center gap-1 group">
          {t('leaderboard.full')} <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* ── World's Strongest Lobster ── */}
        {leaderboardEntries.length > 0 && (
          <div className="mt-3 space-y-2">
            {/* #1 — 世界最强龙虾 */}
            <div className="group relative overflow-hidden rounded-xl border border-yellow-500/40 bg-gradient-to-r from-yellow-900/30 via-amber-800/20 to-yellow-900/30 p-2.5 cursor-default"
              title={t('title.strongestLobsterTip')}>
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-yellow-400/10 to-yellow-500/5 animate-pulse" />
              <div className="absolute inset-0 border border-yellow-400/20 rounded-xl" />
              <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent skew-x-12 group-hover:translate-x-full transition-transform duration-1000" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]">
                    {t('title.strongestLobster')}
                  </span>
                </div>
                <PlayerNameTag address={leaderboardEntries[0].address} className="text-yellow-200/90 font-bold text-xs" onClick={() => { setCardViewAddr(leaderboardEntries[0].address); }} />
              </div>
            </div>

            {/* #2 — 龙虾战神 (streak king) */}
            {globalStats?.streakKing && globalStats.streakKing !== '0x0000000000000000000000000000000000000000' && (
              <div className="group relative overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-red-900/30 via-rose-800/20 to-red-900/30 p-2.5 cursor-default"
                title={t('title.warGodTip')}>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-red-400/10 to-red-500/5 animate-pulse" />
                <div className="absolute inset-0 border border-red-400/20 rounded-xl" />
                <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-red-500/10 to-transparent skew-x-12 group-hover:translate-x-full transition-transform duration-1000" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-400" />
                    <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-rose-200 to-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                      {t('title.warGod')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlayerNameTag address={globalStats.streakKing} className="text-red-200/90 font-bold text-xs" onClick={() => { setCardViewAddr(globalStats!.streakKing); }} />
                    {globalStats.streakRecord > 0 && <span className="text-red-400/70 text-[10px] font-tech font-bold">{t('title.streakRecord').replace('{n}', String(globalStats.streakRecord))}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Total Players ── */}
        {globalStats && globalStats.totalPlayers > 0 && (
          <div className="mt-3 flex items-center justify-between px-2 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Users className="w-3 h-3" /> {t('leaderboard.totalPlayers')}
            </span>
            <span className="text-white font-tech font-bold text-sm">{globalStats.totalPlayers.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* ── Leaderboard Modal ── */}
      <AnimatePresence>
        {isLeaderboardOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto overscroll-contain" onMouseDown={() => setIsLeaderboardOpen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-3xl h-[70vh] overflow-hidden shadow-2xl flex flex-col" onMouseDown={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30"><Trophy className="w-5 h-5 text-orange-500" /></div>
                  <div>
                    <h2 className="text-2xl font-display text-white tracking-wider">{t('leaderboard.globalTitle')}</h2>
                    <p className="text-zinc-400 text-xs font-tech uppercase tracking-widest">{t('leaderboard.seasonRankings')}</p>
                  </div>
                </div>
                <button onClick={() => setIsLeaderboardOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 overscroll-contain">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-4">
                  <div className="col-span-2">{t('leaderboard.rank')}</div>
                  <div className="col-span-5">{t('leaderboard.player')}</div>
                  <div className="col-span-2 text-center">{t('leaderboard.tier')}</div>
                  <div className="col-span-3 text-right">{t('leaderboard.score')}</div>
                </div>
                <div className="space-y-2">
                  {leaderboardEntries.map((p, idx) => {
                    const ri = p.rankInfo;
                    const displayName = t(`rank.${ri.id}`);
                    return (
                      <div key={p.rank} className={`grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-xl border transition-colors ${idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : idx === 1 ? 'bg-zinc-400/10 border-zinc-400/30' : idx === 2 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                        <div className="col-span-2 flex items-center">
                          {idx === 0 ? <Crown className="w-5 h-5 text-yellow-500" /> : idx === 1 ? <Medal className="w-5 h-5 text-zinc-400" /> : idx === 2 ? <Medal className="w-5 h-5 text-orange-500" /> : <span className="text-zinc-500 font-tech font-bold text-lg w-5 text-center">{p.rank}</span>}
                        </div>
                        <div className="col-span-5"><span className={`font-bold ${idx < 3 ? 'text-white' : 'text-zinc-300'}`}><PlayerNameTag address={p.address} onClick={() => { setCardViewAddr(p.address); }} /></span></div>
                        <div className="col-span-2 text-center"><span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap ${tierColor(ri.id)}`}>{displayName} {ri.tierName}</span></div>
                        <div className="col-span-3 text-right"><span className="text-orange-500 font-tech font-bold text-lg">{p.rating}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shop Modal ── */}
      <AnimatePresence>
        {isShopOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onMouseDown={() => setIsShopOpen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onMouseDown={e => e.stopPropagation()}
              className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30"><ShoppingCart className="w-5 h-5 text-orange-500" /></div>
                  <div>
                    <h2 className="text-2xl font-display text-white tracking-wider">{t('shop.title')}</h2>
                    <p className="text-zinc-400 text-xs font-tech uppercase tracking-widest">{t('shop.subtitle')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {player && (
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                      <LobsterCoinIcon className="w-5 h-5" />
                      <span className="text-white font-tech text-sm font-bold">{player.coins.toLocaleString()}</span>
                    </div>
                  )}
                  <button onClick={() => setIsShopOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>
              </div>
              {/* Items Grid */}
              <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...SHOP_ITEMS, ...NAMEPLATE_IDS].map(item => {
                  const owned = player ? hasItemBit(player.itemMask, item.id) : false;
                  const isNameplate = item.id >= 33 && item.id <= 42;
                  return (
                    <div key={item.id} className="relative group rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all min-h-[180px]">
                      <div className={`absolute inset-0 opacity-50 group-hover:opacity-100 transition-opacity ${NAMEPLATE_STYLES[item.id] || 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20'}`} />
                      <div className="relative p-6 flex flex-col h-full bg-black/40 backdrop-blur-sm justify-between">
                        <div className="flex-1">
                          {isNameplate ? (
                            <div className="mb-2">
                              <PlayerNameTag overrideName={t(`shop.item.${item.id}.name` as any)} overrideNameplateId={item.id} address="" className="text-xl font-display tracking-wider" />
                            </div>
                          ) : (
                            <h3 className="text-white font-display text-xl tracking-wider mb-2">{t(`shop.item.${item.id}.name` as any)}</h3>
                          )}
                          <p className="text-zinc-400 text-sm font-medium">
                            {isNameplate ? t('shop.nameplateDesc') : t(`shop.item.${item.id}.desc` as any)}
                          </p>
                        </div>
                        <div className="mt-6 flex items-center justify-between">
                          <div className="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-lg border border-white/5">
                            <LobsterCoinIcon className="w-5 h-5" />
                            <span className="text-white font-tech font-bold text-lg">{item.price}</span>
                          </div>
                          <button
                            onClick={async (e) => {
                              if (owned || !signer) return;
                              const btn = e.currentTarget;
                              btn.disabled = true;
                              btn.textContent = t('shop.purchasing');
                              try {
                                await buyItem(signer, item.id);
                                showToast(t(`shop.item.${item.id}.name` as any) + ' ✓', 'success');
                                refreshPlayer();
                                refreshBalance();
                              } catch (err: any) {
                                const key = parseContractError(err);
                                showToast(key ? t(key) : (err.message?.slice(0, 80) || 'Error'), 'error');
                              } finally {
                                btn.disabled = false;
                                btn.textContent = owned ? t('shop.owned') : t('shop.purchase');
                              }
                            }}
                            className={`px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${owned ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-white text-black hover:bg-orange-500 hover:text-white hover:shadow-[0_0_15px_rgba(249,115,22,0.4)]'}`}
                          >
                            {owned ? t('shop.owned') : t('shop.purchase')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rank Info Modal ── */}
      <AnimatePresence>
        {isRankInfoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onMouseDown={() => setIsRankInfoOpen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onMouseDown={e => e.stopPropagation()}
              className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/30"><Trophy className="w-5 h-5 text-yellow-500" /></div>
                  <div>
                    <h2 className="text-2xl font-display text-white tracking-wider">{t('rank.title')}</h2>
                    <p className="text-zinc-400 text-xs font-tech uppercase tracking-widest">{t('rank.subtitle')}</p>
                  </div>
                </div>
                <button onClick={() => setIsRankInfoOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              {/* Current rank + progress */}
              <div className="mx-5 mt-4 mb-1 px-4 py-3 rounded-xl border bg-white/[0.03] flex items-center justify-between" style={{ borderColor: rankInfo.color + '40' }}>
                <div className="flex items-center gap-2.5">
                  <Crown className="w-4 h-4" style={{ color: rankInfo.color }} />
                  <span className="font-display tracking-wider" style={{ color: rankInfo.color }}>{t(`rank.${rankInfo.id}`)} {rankInfo.tierName}</span>
                </div>
                <span className="text-lg font-tech font-bold text-white">{player?.rating ?? 0}<span className="text-zinc-500 text-[10px] ml-1">pts</span></span>
              </div>
              {/* Progress bar */}
              {rankInfo.id !== RANKS[RANKS.length - 1]?.id && (() => {
                const range = rankInfo.max - rankInfo.min + 1;
                const progress = Math.min(1, ((player?.rating ?? 0) - rankInfo.min) / range);
                return (
                  <div className="mx-5 mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full" style={{ background: rankInfo.color }} />
                  </div>
                );
              })()}
              {/* Rank list */}
              <div className="px-5 py-3 overflow-y-auto space-y-1">
                {RANKS.map((rank) => {
                  const isCurrent = rankInfo.id === rank.id;
                  const rn = t(`rank.${rank.id}`);
                  const isMax = rank.max === Infinity;
                  const pointsStr = isMax
                    ? `${rank.min}+`
                    : `${rank.min} - ${rank.max}`;
                  return (
                    <div key={rank.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                        isCurrent
                          ? 'bg-white/[0.06] border-white/20'
                          : 'bg-transparent border-transparent'
                      }`}>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rank.color }} />
                      <span className="font-display text-sm tracking-wider whitespace-nowrap shrink-0" style={{ color: rank.color }}>{rn}</span>
                      <span className="text-zinc-500 text-xs font-tech flex-1">{pointsStr}</span>
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: rank.color, boxShadow: `0 0 6px ${rank.color}` }} />}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Season Rewards Modal ── */}
      <AnimatePresence>
        {isSeasonRewardsOpen && (
          <SeasonRewardsModal currentSeason={season} onClose={() => setIsSeasonRewardsOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── Matches Modal ── */}
      <AnimatePresence>
        {isMatchesOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onMouseDown={() => setIsMatchesOpen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onMouseDown={e => e.stopPropagation()}
              className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center border border-red-500/30"><Swords className="w-5 h-5 text-red-500" /></div>
                  <div>
                    <h2 className="text-2xl font-display text-white tracking-wider">{t('matches.title')}</h2>
                    <p className="text-zinc-400 text-xs font-tech uppercase tracking-widest">{t('matches.subtitle')}</p>
                  </div>
                </div>
                <button onClick={() => setIsMatchesOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Sync status indicator */}
                {matchHistoryState === 'loading' && (matchHistory?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {t('matches.syncing')}
                  </div>
                )}
                {matchHistoryState === 'error' && (matchHistory?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    {t('matches.syncFailed')}
                  </div>
                )}
                {matchHistoryState === 'loading' && (!matchHistory || matchHistory.length === 0) && (
                  <div className="text-zinc-500 text-center py-8 font-tech flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </div>
                )}
                {matchHistoryState !== 'loading' && (!matchHistory || matchHistory.length === 0) && (
                  <div className="text-zinc-500 text-center py-8 font-tech">{t('matches.noMatches')}</div>
                )}
                {(matchHistory ?? []).map((m, i) => {
                  const isWin = m.ratingChange >= 0;
                  const timeAgo = m.timestamp ? formatTimeAgo(m.timestamp * 1000) : '';
                  const ratingStr = m.ratingChange >= 0 ? `+${m.ratingChange}` : `${m.ratingChange}`;
                  return (
                    <div key={`${m.seed}-${i}`} className={`rounded-2xl p-5 border transition-colors hover:brightness-110 ${isWin ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                      {/* Top row: rank + rating change */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-white font-tech text-lg font-bold">#{m.playerRank + 1}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-display text-xl tracking-wider uppercase ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                            {isWin ? t('matches.victory') : t('matches.defeat')}
                          </span>
                          <span className={`font-tech font-bold text-lg ${m.ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ratingStr}</span>
                        </div>
                      </div>
                      {/* Middle row: coins + seed */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 border border-white/10 rounded-lg">
                          <LobsterCoinIcon className="w-4 h-4" />
                          <span className="text-white font-tech text-sm">+{m.coinsEarned}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 border border-white/10 rounded-lg">
                          <span className="text-zinc-500 text-xs font-tech uppercase">Seed</span>
                          <span className="text-white font-tech text-sm">{m.seed}</span>
                        </div>
                      </div>
                      {/* Bottom row: time + replay */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-zinc-500 text-xs">
                          {timeAgo && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo}</span>}
                          {m.gasUsed && <span className="font-mono">{m.gasUsed} gas</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {m.matchId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`${window.location.origin}/?replay=${m.matchId}`);
                                showToast(t('matches.linkCopied'), 'success');
                              }}
                              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-400 text-xs font-bold transition-colors flex items-center gap-1.5"
                            >
                              <Copy className="w-3 h-3" /> {t('matches.share')}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); watchHistoryReplay(m); }}
                            className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/30 rounded-lg text-orange-400 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                          >
                            <Play className="w-3 h-3" /> {t('matches.watchReplay')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLobsterPanelOpen && <LobsterPanel onClose={() => setIsLobsterPanelOpen(false)} lang={lang} />}
      {isHeroSelectOpen && (
        <HeroSelectPanel
          currentHeroId={selectedHeroId}
          onSelect={(id) => {
            setSelectedHeroId(id);
          }}
          onClose={() => setIsHeroSelectOpen(false)}
          walletAddress={walletAddress}
          signer={signer}
          showToast={showToast}
          playerCoins={player?.coins ?? 0}
        />
      )}

      {/* ── Lobster Card (click player in leaderboard) ── */}
      <AnimatePresence>
        {cardViewAddr && (
          <LobsterCard
            player={cardViewAddr === walletAddress && player ? {
              ...player,
              address: walletAddress!,
              itemMask: String(player.itemMask),
              achievements: String(player.achievements),
              heroId: player.heroTokenId,
              badge: 0,
              script: null,
            } as any : null}
            address={cardViewAddr}
            isOwn={cardViewAddr === walletAddress}
            overrideHeroId={cardViewAddr === walletAddress ? selectedHeroId : undefined}
            onClose={() => { setCardViewAddr(null); }}
            onEdit={() => { setCardViewAddr(null); setIsProfileOpen(true); }}
          />
        )}
      </AnimatePresence>

      {/* ── Player Info / Edit Profile ── */}
      {isProfileOpen && walletAddress && (
        <PlayerInfoPanel
          player={player}
          address={walletAddress}
          gasPrice={null}
          editable={true}
          onClose={() => setIsProfileOpen(false)}
          onRefresh={() => { /* usePlayer auto-refreshes */ }}
          showToast={showToast}
        />
      )}

      {/* ── Script Select / Mint ── */}
      {isScriptEditorOpen && (
        <ScriptSelectPanel
          lang={lang}
          currentScriptId={selectedScriptId}
          onSelect={(id) => setSelectedScriptId(id)}
          onClose={() => setIsScriptEditorOpen(false)}
          walletAddress={walletAddress}
          signer={signer}
          showToast={showToast}
        />
      )}

      {/* ── Contract Addresses Footer ── */}
      <div className="relative z-10 text-center py-8 pb-16 space-y-2">
        <p className="text-zinc-600 text-xs font-tech uppercase tracking-widest mb-3">Smart Contracts on opBNB</p>
        {(['ClawArena', 'LobsterHub', 'ScriptHub', 'ClawUtility'] as const).map(name => {
          const addr = ADDRESSES[name];
          const url = `https://opbnbscan.com/address/${addr}`;
          return (
            <div key={name} className="flex items-center justify-center gap-2 text-zinc-500 text-xs font-mono">
              <span className="text-zinc-600 font-bold">{name}:</span>
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-orange-400">{addr}</a>
            </div>
          );
        })}
      </div>

      {/* ── Marquee Footer ── */}
      <div className="fixed bottom-0 w-full bg-gradient-to-r from-red-900 to-orange-900 text-white py-2.5 overflow-hidden z-50 border-t border-red-500/30">
        <div className="flex whitespace-nowrap animate-marquee items-center">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-12 mx-6">
              <span className="flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wider">
                <Flame className="w-4 h-4 text-orange-400" /> ClawKing
              </span>
              <span className="flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wider text-zinc-300">
                <Trophy className="w-4 h-4 text-yellow-500" /> {leaderboardEntries[0] ? `#1 Rating ${leaderboardEntries[0].rating}` : 'Leaderboard'}
              </span>
              <span className="flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wider">
                <Swords className="w-4 h-4 text-red-400" /> {t('common.season')} {season} {t('hero.seasonLive')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Season Rewards Modal ──

function SeasonRewardsModal({ currentSeason, onClose }: { currentSeason: number; onClose: () => void }) {
  const lang = useLang();
  const [activeSeason, setActiveSeason] = useState(currentSeason);
  const seasonData = SEASONS[(activeSeason - 1) % SEASONS.length];
  const tierKeys: Array<string> = ['season.tier1', 'season.tier2', 'season.tier3', 'season.tier4'];
  const tierIcons = [
    <Crown className="w-5 h-5" />,
    <Star className="w-5 h-5" />,
    <Shield className="w-5 h-5" />,
    <Swords className="w-5 h-5" />,
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onMouseDown={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onMouseDown={e => e.stopPropagation()}
        className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
              <Zap className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-display text-white tracking-wider">{t('season.rewardsTitle')}</h2>
              <p className="text-zinc-400 text-xs font-tech uppercase tracking-widest">{t('season.rewardsSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Season Tabs */}
        <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2">
          {SEASONS.map(s => {
            const isCurrent = s.id === currentSeason;
            const isActive = s.id === activeSeason;
            return (
              <button key={s.id} onClick={() => setActiveSeason(s.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-[0_0_15px_rgba(255,255,255,0.15)]'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
                }`}>
                {s.name}
                {isCurrent && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-tech">
                    {t('season.current')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Nameplates Grid */}
        <div className="p-6 pt-2 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map(tier => {
            const theme = tier === 1 ? seasonData.r1 : tier === 2 ? seasonData.r2 : tier === 3 ? seasonData.r3 : seasonData.r4;
            const vars = themeVars(theme);
            const sampleName = tier === 1 ? 'Champion' : tier === 2 ? 'Runner-up' : tier === 3 ? '3rd_Place' : 'Top32_Player';
            const nameplateId = (seasonData.id - 1) * 4 + tier;

            return (
              <div key={tier} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ ...vars, background: 'var(--c-bg)', border: '1px solid var(--c-p-alpha)' }}>
                    <span style={{ color: theme.p }}>{tierIcons[tier - 1]}</span>
                  </div>
                  <span className="text-sm font-bold text-zinc-200">{t(tierKeys[tier - 1])}</span>
                </div>
                <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 flex items-center justify-center p-3">
                  <PlayerNameTag address="0x0000000000000000000000000000000000000000" overrideName={sampleName} overrideNameplateId={nameplateId} large />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
