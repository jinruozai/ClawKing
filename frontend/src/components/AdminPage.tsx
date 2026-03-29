import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type Signer } from 'ethers';
import { motion } from 'motion/react';
import { ArrowLeft, RefreshCw, Search, Shield, ShieldOff, SkipForward, Settings, Users, LayoutDashboard, Coins, Calendar, Activity, Crown, Code, Bot } from 'lucide-react';
import {
  fetchGlobalStats,
  fetchLeaderboard,
  fetchPlayer,
  fetchPool,
  fetchOwnedLobsters,
  fetchOwnedScripts,
  mintDefaultLobster,
  mintDefaultScript,
  addDefaultPlayer,
  addCoins,
  pauseArena,
  unpauseArena,
  endSeason,
  type GlobalStats,
  type LeaderboardEntry,
  type PlayerData,
  type LobsterNFT,
  type ScriptNFT,
} from '../services/dataStore';
import { ADDRESSES } from '../config/contracts';
import { t } from '../i18n';
import { getRankInfo, RANKS, ATTR_INIT, ATTR_CAP, ATTR_NAMES, FREE_POINTS, SKILL_EFFECT_BITS } from '../config/game';
import { Lobster, type LobsterPartColors, type RGB, DEFAULT_PART_COLORS, partColorsToTheme } from './Lobster';
import { CopyAddress } from './CopyAddress';
import { PlayerNameTag } from './PlayerNameTag';

interface AdminPageProps {
  onBack: () => void;
  onOpenLobsterPanel: () => void;
  signer: Signer | null;
  walletAddress: string;
}

type Tab = 'dashboard' | 'players' | 'mintLobster' | 'mintScript' | 'playerPool';

const TAB_I18N: Record<Tab, string> = {
  dashboard: 'admin.tabDashboard',
  players: 'admin.tabPlayers',
  mintLobster: 'admin.tabMintLobster',
  mintScript: 'admin.tabMintScript',
  playerPool: 'admin.tabPlayerPool',
};

const TABS: { id: Tab; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'players', icon: Search },
  { id: 'mintLobster', icon: Crown },
  { id: 'mintScript', icon: Code },
  { id: 'playerPool', icon: Users },
];

// ── Pack functions ──
function packStats(hp: number, atk: number, range: number, speed: number, mana: number, skillEffect: number, skillPower: number): bigint {
  return BigInt(hp) | (BigInt(atk) << 8n) | (BigInt(range) << 16n) | (BigInt(speed) << 24n) | (BigInt(mana) << 32n) | (BigInt(skillEffect) << 40n) | (BigInt(skillPower) << 56n);
}

function packVisual(parts: LobsterPartColors): bigint {
  let v = 0n;
  const all = [parts.shell, parts.claw, parts.leg, parts.eye, parts.tail, parts.aura, parts.sub];
  for (let i = 0; i < 21; i++) {
    v |= BigInt(all[Math.floor(i / 3)][i % 3]) << BigInt(i * 8);
  }
  return v;
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export default function AdminPage({ onBack, onOpenLobsterPanel, signer, walletAddress }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Dashboard state
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // Player search state
  const [searchAddr, setSearchAddr] = useState('');
  const [searchResult, setSearchResult] = useState<(PlayerData & { address: string }) | null>(null);
  const [searchError, setSearchError] = useState('');
  const [recentAddrs, setRecentAddrs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('admin-recent-addrs') || '[]'); } catch { return []; }
  });

  // Actions state
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  // Add coins state
  const [coinAddr, setCoinAddr] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [coinLoading, setCoinLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await fetchGlobalStats(true);
      setGlobalStats(stats);
    } catch (e) {
      showToast(t('admin.loadFailed') + ': ' + (e as Error).message);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const searchPlayer = async () => {
    const addr = searchAddr.trim();
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
      setSearchError(t('admin.invalidAddress'));
      return;
    }
    setSearchError('');
    setSearchResult(null);
    setLoading(true);
    try {
      const p = await fetchPlayer(addr, true);
      setSearchResult({ address: addr, ...p });
      const updated = [addr, ...recentAddrs.filter(a => a !== addr)].slice(0, 10);
      setRecentAddrs(updated);
      localStorage.setItem('admin-recent-addrs', JSON.stringify(updated));
    } catch (e) {
      setSearchError(t('admin.playerNotFound') + ': ' + (e as Error).message);
    }
    setLoading(false);
  };

  const execAction = async (action: string) => {
    if (!signer) { showToast('No wallet connected'); return; }
    setConfirmAction(null);
    setLoading(true);
    try {
      let result: string | undefined;
      switch (action) {
        case 'pause': result = await pauseArena(signer); break;
        case 'unpause': result = await unpauseArena(signer); break;
        case 'endSeason': result = await endSeason(signer); break;
        default: setLoading(false); return;
      }
      showToast(`${t('admin.success')}: ${result!.slice(0, 14)}...`);
      setTimeout(loadDashboard, 2000);
    } catch (e) {
      showToast(t('admin.error') + ': ' + (e as Error).message?.slice(0, 80));
    }
    setLoading(false);
  };

  const paused = globalStats?.paused ?? false;

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-white">
      {/* Toast */}
      {toast && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-zinc-800/95 border border-zinc-600 rounded-2xl px-8 py-4 text-sm shadow-2xl backdrop-blur-xl">
          {toast}
        </motion.div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{t('admin.back')}</span>
          </button>

          <nav className="flex items-center gap-1 bg-white/[0.03] rounded-2xl p-1.5">
            {TABS.map(tabDef => (
              <button key={tabDef.id} onClick={() => setTab(tabDef.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  tab === tabDef.id ? 'bg-orange-500/20 text-orange-400 shadow-lg shadow-orange-500/10' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                }`}>
                <tabDef.icon className="w-4 h-4" />
                {t(TAB_I18N[tabDef.id] as any)}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button onClick={onOpenLobsterPanel}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-xs text-zinc-400 hover:text-white font-bold flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-orange-400" /> {t('admin.heroes')}
            </button>
            <button onClick={loadDashboard} disabled={loading}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="bg-white/5 px-3 py-1.5 rounded-lg"><CopyAddress address={walletAddress} className="text-xs text-zinc-500" iconSize={10} /></span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Dashboard */}
        {tab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* Stats row */}
            <div className="grid grid-cols-5 gap-4">
              <StatCard icon={<Users className="w-5 h-5" />} label={t('admin.totalPlayers')} value={String(globalStats?.totalPlayers ?? 0)} color="blue" />
              <StatCard icon={<Calendar className="w-5 h-5" />} label={t('admin.season')} value={`S${globalStats?.currentSeason ?? 0}`} color="purple" />
              <StatCard icon={<Coins className="w-5 h-5" />} label={t('admin.entryFee')} value={`${globalStats?.entryFeePol ?? 0} BNB`} color="yellow" />
              <StatCard icon={<Activity className="w-5 h-5" />} label={t('admin.status')} value={paused ? t('admin.paused') : t('admin.active')} color={paused ? 'red' : 'green'} />
              <StatCard icon={<Crown className="w-5 h-5" />} label={t('admin.streakKing')} value={globalStats?.streakKing && globalStats.streakKing !== '0x0000000000000000000000000000000000000000' ? `${shortAddr(globalStats.streakKing)} (${globalStats.streakRecord}W)` : t('admin.none')} color="orange" />
            </div>

            {/* Actions */}
            <div className="max-w-xl">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-6 py-4">
                <div className="flex items-center gap-3 mb-4">
                  <Settings className="w-5 h-5 text-orange-400" />
                  <h2 className="font-display text-base tracking-wide">{t('admin.actions')}</h2>
                </div>

                <div className="space-y-3">
                  <CompactAction
                    label={paused ? t('admin.resume') : t('admin.pause')}
                    icon={paused ? ShieldOff : Shield}
                    color={paused ? 'green' : 'yellow'}
                    onAction={() => execAction(paused ? 'unpause' : 'pause')}
                    loading={loading}
                  />
                  <CompactAction
                    label={t('admin.endSeason')}
                    icon={SkipForward}
                    color="orange"
                    onAction={() => {
                      if (confirmAction === 'endSeason') { execAction('endSeason'); }
                      else { setConfirmAction('endSeason'); }
                    }}
                    loading={loading}
                    confirming={confirmAction === 'endSeason'}
                    onCancel={() => setConfirmAction(null)}
                    confirmText={t('admin.endSeasonConfirm').replace('{n}', String(globalStats?.currentSeason ?? 0))}
                  />
                </div>
              </div>

              {/* Add Coins */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-6 py-4 mt-4">
                <div className="flex items-center gap-3 mb-4">
                  <Coins className="w-5 h-5 text-yellow-400" />
                  <h2 className="font-display text-base tracking-wide">{t('admin.addCoins')}</h2>
                </div>
                <div className="flex gap-2">
                  <input
                    value={coinAddr}
                    onChange={e => setCoinAddr(e.target.value)}
                    placeholder={t('admin.searchPlaceholder')}
                    className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-yellow-500/50"
                  />
                  <input
                    value={coinAmount}
                    onChange={e => setCoinAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('admin.amount')}
                    className="w-28 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-yellow-500/50"
                  />
                  <button
                    onClick={async () => {
                      if (!signer || !coinAddr || !coinAmount) return;
                      setCoinLoading(true);
                      try {
                        await addCoins(signer, coinAddr.trim(), Number(coinAmount));
                        showToast(`✅ +${coinAmount} coins → ${coinAddr.slice(0, 8)}...`);
                        setCoinAmount('');
                      } catch (e: any) {
                        showToast(`❌ ${e.message?.slice(0, 80)}`);
                      }
                      setCoinLoading(false);
                    }}
                    disabled={coinLoading || !coinAddr || !coinAmount}
                    className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg text-sm font-bold hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                  >
                    {coinLoading ? '...' : t('admin.send')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Players */}
        {tab === 'players' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    value={searchAddr}
                    onChange={e => setSearchAddr(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchPlayer()}
                    placeholder={t('admin.searchPlaceholder')}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-sm text-white placeholder-zinc-600 focus:border-orange-500/50 outline-none transition-colors"
                  />
                </div>
                <button onClick={searchPlayer} disabled={loading}
                  className="px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-orange-500/20">
                  {t('admin.search')}
                </button>
              </div>

              {recentAddrs.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="text-zinc-600 text-xs py-1">{t('admin.recent')}</span>
                  {recentAddrs.map(addr => (
                    <button key={addr} onClick={() => setSearchAddr(addr)}
                      className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-zinc-500 hover:text-orange-400 hover:border-orange-500/30 transition-colors">
                      {shortAddr(addr)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {searchError && <div className="text-red-400 text-sm text-center">{searchError}</div>}

            {searchResult && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-8 py-5 border-b border-white/5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{searchResult.name || t('admin.unnamed')}</h3>
                    <CopyAddress address={searchResult.address} short={false} className="text-zinc-500 text-xs" iconSize={10} />
                  </div>
                </div>
                <div className="grid grid-cols-4 xl:grid-cols-6 gap-px bg-white/5">
                  {([
                    [t('admin.fieldRating'), searchResult.rating, 'text-orange-400'],
                    [t('admin.fieldCoins'), searchResult.coins, 'text-yellow-400'],
                    [t('admin.fieldStreak'), searchResult.streak, 'text-green-400'],
                    [t('admin.fieldSeason'), searchResult.season, 'text-purple-400'],
                    [t('admin.fieldMatches'), searchResult.totalMatches, 'text-blue-400'],
                    [t('admin.fieldWins'), searchResult.wins, 'text-emerald-400'],
                    [t('admin.fieldKills'), searchResult.totalKills, 'text-red-400'],
                    [t('admin.fieldHeroToken'), searchResult.heroTokenId, 'text-cyan-400'],
                    [t('admin.fieldScriptToken'), searchResult.scriptTokenId, 'text-pink-400'],
                    [t('admin.fieldNameplate'), searchResult.equippedNameplate, 'text-amber-400'],
                    [t('admin.fieldItemMask'), String(searchResult.itemMask), 'text-zinc-300'],
                    [t('admin.fieldAchievements'), String(searchResult.achievements), 'text-violet-400'],
                  ] as [string, unknown, string][]).map(([k, v, colorCls]) => (
                    <div key={k} className="bg-[#0a0a0a] px-5 py-4">
                      <div className="text-zinc-600 text-xs uppercase tracking-wider mb-1">{k}</div>
                      <div className={`font-mono text-sm font-bold break-all ${colorCls}`}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Mint Lobster */}
        {tab === 'mintLobster' && <MintLobsterTab signer={signer} showToast={showToast} />}

        {/* Mint Script */}
        {tab === 'mintScript' && <MintScriptTab signer={signer} showToast={showToast} />}

        {/* Player Pool (AI Players + Pool Browser merged) */}
        {tab === 'playerPool' && <PlayerPoolTab signer={signer} showToast={showToast} />}
      </main>
    </div>
  );
}

// ── Stat Card ──

function StatCard({ icon, label, value, color, progress }: {
  icon: React.ReactNode; label: string; value: string; color: string; progress?: number;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/15 text-blue-400',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/15 text-purple-400',
    yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/15 text-yellow-400',
    green: 'from-green-500/20 to-green-600/5 border-green-500/15 text-green-400',
    red: 'from-red-500/20 to-red-600/5 border-red-500/15 text-red-400',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/15 text-orange-400',
    cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/15 text-cyan-400',
  };
  const c = colorMap[color] || colorMap.blue;
  const iconColor = c.split(' ').pop() || 'text-white';

  return (
    <div className={`bg-gradient-to-br ${c} border rounded-2xl p-5 relative overflow-hidden`}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{label}</div>
        <div className={iconColor}>{icon}</div>
      </div>
      <div className="text-xl font-bold text-white font-tech leading-tight">{value}</div>
      {progress !== undefined && (
        <div className="w-full bg-white/10 rounded-full h-1.5 mt-3">
          <div className="bg-cyan-400 rounded-full h-1.5 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Compact Action Button ──

function CompactAction({ label, icon: Icon, color, onAction, loading, disabled, confirming, onCancel, confirmText }: {
  label: string;
  icon: typeof Shield;
  color: string;
  onAction: () => void;
  loading: boolean;
  disabled?: boolean;
  confirming?: boolean;
  onCancel?: () => void;
  confirmText?: string;
}) {
  const btnColors: Record<string, string> = {
    green: 'bg-green-600/80 hover:bg-green-600',
    yellow: 'bg-yellow-600/80 hover:bg-yellow-600',
    red: 'bg-red-600/80 hover:bg-red-600',
    orange: 'bg-orange-600/80 hover:bg-orange-600',
  };
  const iconColors: Record<string, string> = {
    green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400', orange: 'text-orange-400',
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${iconColors[color] || 'text-white'} flex-shrink-0`} />
        <span className="text-sm text-zinc-300 flex-1">{label}</span>
        {confirming && onCancel && (
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 transition-colors">
            {t('admin.cancel')}
          </button>
        )}
        <button onClick={onAction} disabled={loading || disabled}
          className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 ${
            confirming ? 'bg-red-600 hover:bg-red-700' : btnColors[color] || 'bg-zinc-700'
          }`}>
          {confirming ? t('admin.confirm') : label}
        </button>
      </div>
      {confirming && confirmText && (
        <div className="mt-2 ml-7 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300">{confirmText}</div>
      )}
    </div>
  );
}

// (PoolBrowser merged into PlayerPoolTab below)

// ── Mint Lobster Tab ──
function MintLobsterTab({ signer, showToast }: { signer: Signer | null; showToast: (msg: string) => void }) {
  // Visual colors
  const [partColors, setPartColors] = useState<LobsterPartColors>({ ...DEFAULT_PART_COLORS });
  const updatePart = (part: keyof LobsterPartColors, ch: number, val: number) => {
    setPartColors(prev => {
      const next = { ...prev };
      next[part] = [...prev[part]] as RGB;
      next[part][ch] = val;
      return next;
    });
  };

  // Attributes
  const [freeAlloc, setFreeAlloc] = useState([0, 0, 0, 0, 0, 0]); // free points allocated per attr
  const [skillEffect, setSkillEffect] = useState(SKILL_EFFECT_BITS[0].bit);
  const [lobsterName, setLobsterName] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintedList, setMintedList] = useState<LobsterNFT[]>([]);
  const [mintedLoading, setMintedLoading] = useState(false);

  const totalUsed = freeAlloc.reduce((a, b) => a + b, 0);
  const remaining = FREE_POINTS - totalUsed;

  const setAttr = (idx: number, val: number) => {
    const maxAdd = ATTR_CAP[idx]; // max additional free points for this attr
    const clamped = Math.max(0, Math.min(val, maxAdd));
    // Check total budget
    const newTotal = totalUsed - freeAlloc[idx] + clamped;
    if (newTotal > FREE_POINTS) return;
    setFreeAlloc(prev => { const n = [...prev]; n[idx] = clamped; return n; });
  };

  // Resizable panel
  const [leftW, setLeftW] = useState(420);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(420);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = leftW;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      setLeftW(Math.max(250, Math.min(800, startWRef.current + ev.clientX - startXRef.current)));
    };
    const onUp = () => { draggingRef.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [leftW]);

  // Load minted lobsters
  const loadMinted = useCallback(async () => {
    setMintedLoading(true);
    try {
      const list = await fetchOwnedLobsters(ADDRESSES.LobsterHub);
      setMintedList(list);
    } catch { /* ignore */ }
    setMintedLoading(false);
  }, []);

  useEffect(() => { loadMinted(); }, [loadMinted]);

  const handleMint = async () => {
    if (!signer) { showToast(t('admin.noWallet')); return; }
    if (lobsterName.length === 0 || lobsterName.length > 12) { showToast(t('admin.nameRequired')); return; }
    if (remaining < 0) { showToast(t('admin.error')); return; }

    setMinting(true);
    try {
      const stats = packStats(
        ATTR_INIT[0] + freeAlloc[0], ATTR_INIT[1] + freeAlloc[1],
        ATTR_INIT[2] + freeAlloc[2], ATTR_INIT[3] + freeAlloc[3],
        ATTR_INIT[4] + freeAlloc[4], skillEffect, ATTR_INIT[5] + freeAlloc[5],
      );
      const visual = packVisual(partColors);
      const txHash = await mintDefaultLobster(signer, lobsterName, stats, visual);
      showToast(`${t('admin.success')} TX: ${txHash.slice(0, 14)}...`);
      setTimeout(loadMinted, 3000);
    } catch (e) {
      showToast(t('admin.mintFailed') + ': ' + (e as Error).message?.slice(0, 80));
    }
    setMinting(false);
  };

  const PARTS: [keyof LobsterPartColors, string, string][] = [
    ['shell', t('palette.shell'), 'HP'],
    ['claw', t('palette.claw'), 'ATK'],
    ['leg', t('palette.leg'), 'Speed'],
    ['eye', t('palette.eye'), 'Range'],
    ['tail', t('palette.tail'), 'Mana'],
    ['aura', t('palette.antenna'), 'Power'],
    ['sub', t('palette.subColor'), ''],
  ];

  // ── 默认龙虾模板（与 DefaultData.sol + i18n 一致）──
  // freeAlloc = [hp, atk, range, speed, mana, skillPower] 在 ATTR_INIT 基础上的加点
  // ATTR_INIT = [10, 1, 1, 0, 3, 1]
  interface LobsterTemplate {
    name: string;          // bytes12 name for minting
    colors: LobsterPartColors;
    freeAlloc: number[];   // 6 values: extra points on top of ATTR_INIT
    skillEffect: number;   // skill effect bit
  }

  const LOBSTER_TEMPLATES: LobsterTemplate[] = [
    // 0: 铁钳虾 - 定身 (平衡前排) hp=16 atk=4 range=2 speed=1 mana=3 power=2
    { name: 'Iron Claw', skillEffect: 0x0001,
      freeAlloc: [6, 3, 1, 1, 0, 1],
      colors: { shell:[255,85,0], claw:[255,51,0], leg:[255,170,0], eye:[0,243,255], tail:[255,85,0], aura:[255,85,0], sub:[204,34,0] } },
    // 1: 岩虾 - 缴械 (纯坦) hp=20 atk=2 range=1 speed=0 mana=4 power=1
    { name: 'Rock Lobs', skillEffect: 0x0002,
      freeAlloc: [10, 1, 0, 0, 1, 0],
      colors: { shell:[136,136,136], claw:[119,119,119], leg:[85,85,85], eye:[0,255,170], tail:[100,100,100], aura:[0,255,0], sub:[170,170,170] } },
    // 2: 幽灵虾 - 隐身 (刺客) hp=10 atk=5 range=2 speed=4 mana=3 power=4
    { name: 'Ghost Shr', skillEffect: 0x0100,
      freeAlloc: [0, 4, 1, 4, 0, 3],
      colors: { shell:[68,0,0], claw:[51,0,0], leg:[17,0,0], eye:[255,0,0], tail:[34,0,0], aura:[170,0,255], sub:[0,0,0] } },
    // 3: 血钳虾 - 吸血 (持续战) hp=14 atk=3 range=2 speed=1 mana=4 power=4
    { name: 'Blood Cla', skillEffect: 0x0010,
      freeAlloc: [4, 2, 1, 1, 1, 3],
      colors: { shell:[255,0,0], claw:[221,0,0], leg:[170,0,0], eye:[255,0,0], tail:[200,0,0], aura:[255,0,0], sub:[80,0,0] } },
    // 4: 斩杀者 - 斩杀 (爆发) hp=12 atk=5 range=2 speed=2 mana=3 power=4
    { name: 'Executr', skillEffect: 0x0040,
      freeAlloc: [2, 4, 1, 2, 0, 3],
      colors: { shell:[0,170,255], claw:[0,119,204], leg:[0,51,102], eye:[0,255,255], tail:[0,136,204], aura:[0,255,255], sub:[0,34,68] } },
    // 5: 荆棘虾 - 反甲 (反伤坦) hp=19 atk=2 range=1 speed=1 mana=3 power=2
    { name: 'Thorn Shr', skillEffect: 0x0200,
      freeAlloc: [9, 1, 0, 1, 0, 1],
      colors: { shell:[85,107,47], claw:[102,123,51], leg:[42,58,10], eye:[170,255,68], tail:[80,100,40], aura:[68,255,136], sub:[20,34,0] } },
    // 6: 暴击虾 - 暴击 (输出) hp=11 atk=6 range=2 speed=3 mana=3 power=3
    { name: 'Crit Lobs', skillEffect: 0x0400,
      freeAlloc: [1, 5, 1, 3, 0, 2],
      colors: { shell:[255,51,102], claw:[238,34,85], leg:[153,17,51], eye:[255,255,68], tail:[200,40,80], aura:[255,170,204], sub:[50,0,17] } },
    // 7: 蓝焰虾 - 烧蓝 (远程法) hp=13 atk=3 range=4 speed=1 mana=4 power=3
    { name: 'Blue Flam', skillEffect: 0x0080,
      freeAlloc: [3, 2, 3, 1, 1, 2],
      colors: { shell:[170,221,255], claw:[136,204,255], leg:[34,119,170], eye:[255,255,255], tail:[170,200,230], aura:[255,255,255], sub:[0,17,34] } },
    // 8: 北极虾 - 致盲 (远程狙) hp=12 atk=4 range=4 speed=1 mana=3 power=4
    { name: 'Arctic Sh', skillEffect: 0x0004,
      freeAlloc: [2, 3, 3, 1, 0, 3],
      colors: { shell:[100,160,220], claw:[140,200,240], leg:[60,100,160], eye:[200,240,255], tail:[110,170,220], aura:[150,210,250], sub:[220,240,255] } },
    // 9: 盲虾 - 沉默 (全场法) hp=14 atk=3 range=3 speed=0 mana=4 power=4
    { name: 'Vent Shr', skillEffect: 0x0008,
      freeAlloc: [4, 2, 2, 0, 1, 3],
      colors: { shell:[100,50,180], claw:[130,60,210], leg:[60,20,120], eye:[200,100,255], tail:[90,40,160], aura:[160,80,255], sub:[40,10,60] } },
    // 10: 苟苟虾 - 净化 (苟活) hp=18 atk=2 range=1 speed=2 mana=3 power=2
    { name: 'Hermit Sh', skillEffect: 0x0800,
      freeAlloc: [8, 1, 0, 2, 0, 1],
      colors: { shell:[160,120,50], claw:[180,140,60], leg:[120,80,30], eye:[220,200,100], tail:[140,100,40], aura:[200,160,70], sub:[100,70,20] } },
    // 11: 福星虾 - 加速 (赌徒) hp=13 atk=4 range=2 speed=2 mana=3 power=4
    { name: 'Lucky Shr', skillEffect: 0x1000,
      freeAlloc: [3, 3, 1, 2, 0, 3],
      colors: { shell:[230,190,0], claw:[255,215,0], leg:[200,160,0], eye:[255,255,200], tail:[240,200,0], aura:[255,230,50], sub:[255,245,200] } },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);

  const applyTemplate = (idx: number) => {
    const tpl = LOBSTER_TEMPLATES[idx];
    setLobsterName(tpl.name);
    setPartColors(tpl.colors);
    setFreeAlloc(tpl.freeAlloc);
    setSkillEffect(tpl.skillEffect);
    setSelectedTemplate(idx);
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setLobsterName('');
    setPartColors({ ...DEFAULT_PART_COLORS });
    setFreeAlloc([0, 0, 0, 0, 0, 0]);
    setSkillEffect(SKILL_EFFECT_BITS[0].bit);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex min-h-[70vh]">
        {/* Left: SVG preview */}
        <div className="shrink-0 pr-2 flex items-center justify-center" style={{ width: leftW }}>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 w-full h-full flex items-center justify-center">
            <Lobster theme={partColorsToTheme(partColors, {
              hp: ATTR_INIT[0] + freeAlloc[0],          // idx 0: HP
              atk: ATTR_INIT[1] + freeAlloc[1],         // idx 1: ATK
              atkRange: ATTR_INIT[2] + freeAlloc[2],    // idx 2: Range
              speed: ATTR_INIT[3] + freeAlloc[3],       // idx 3: Speed
              manaMax: ATTR_INIT[4] + freeAlloc[4],     // idx 4: Mana
              skillPower: ATTR_INIT[5] + freeAlloc[5],  // idx 5: Skill Power
            })} />
          </div>
        </div>
        {/* Drag handle */}
        <div onMouseDown={onDragStart}
          className="w-2 shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-orange-500/10 rounded transition-colors">
          <div className="w-0.5 h-16 bg-zinc-700 group-hover:bg-orange-500 rounded-full transition-colors" />
        </div>
        {/* Right: controls */}
        <div className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 overflow-y-auto ml-2" style={{ maxHeight: '85vh' }}>
          {/* RGB sliders */}
          <div className="space-y-5">
            {PARTS.map(([part, label, stat]) => (
              <div key={part}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded" style={{ background: `rgb(${partColors[part]})` }} />
                  <span className="text-sm font-bold text-zinc-200">{label}</span>
                  {stat && <span className="text-xs text-zinc-600">{stat}</span>}
                  <span className="ml-auto text-xs text-zinc-500 font-mono">({partColors[part].join(', ')})</span>
                </div>
                <div className="flex items-center gap-3">
                  {(['R', 'G', 'B'] as const).map((ch, ci) => (
                    <div key={ch} className="flex items-center gap-1 flex-1">
                      <span className={`text-xs font-bold w-3 ${ci === 0 ? 'text-red-400' : ci === 1 ? 'text-green-400' : 'text-blue-400'}`}>{ch}</span>
                      <input type="range" min={0} max={255} value={partColors[part][ci]}
                        onChange={e => updatePart(part, ci, Number(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, ${ci === 0 ? '#000,#f00' : ci === 1 ? '#000,#0f0' : '#000,#00f'})` }} />
                      <span className="text-xs text-zinc-500 font-mono w-6 text-right">{partColors[part][ci]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Attribute editor */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                {t('admin.attributes')}
              </h3>
              <span className={`text-xs font-mono font-bold ${remaining > 0 ? 'text-green-400' : remaining === 0 ? 'text-zinc-400' : 'text-red-400'}`}>
                {remaining}/{FREE_POINTS} {t('admin.freePoints')}
              </span>
            </div>
            <div className="space-y-3">
              {ATTR_NAMES.map((name, idx) => {
                const total = ATTR_INIT[idx] + freeAlloc[idx];
                const maxVal = ATTR_CAP[idx];
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 w-20 font-bold">{name}</span>
                    <span className="text-xs text-zinc-600 w-8 text-right">{ATTR_INIT[idx]}+</span>
                    <input type="range" min={0} max={maxVal} value={freeAlloc[idx]}
                      onChange={e => setAttr(idx, Number(e.target.value))}
                      className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, #333 0%, #f97316 ${(freeAlloc[idx] / maxVal) * 100}%, #333 ${(freeAlloc[idx] / maxVal) * 100}%)` }} />
                    <span className="text-xs text-orange-400 font-mono w-6 text-right font-bold">{total}</span>
                  </div>
                );
              })}
            </div>

            {/* Skill effect dropdown */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-zinc-300 font-bold w-20">
                {t('admin.skillEffect')}
              </span>
              <select value={skillEffect} onChange={e => setSkillEffect(Number(e.target.value))}
                className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50">
                {SKILL_EFFECT_BITS.map(se => (
                  <option key={se.bit} value={se.bit}>{se.key} (0x{se.bit.toString(16).padStart(4, '0')})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Name input */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-3 font-bold">
              {t('admin.name')}
            </h3>
            <input value={lobsterName} onChange={e => setLobsterName(e.target.value.slice(0, 12))}
              placeholder={t('admin.maxChars')}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50" />
          </div>

          {/* Templates */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">{t('admin.templates')}</h3>
              {selectedTemplate !== null && (
                <button onClick={clearTemplate}
                  className="text-xs text-zinc-500 hover:text-orange-400 transition-colors">
                  {t('admin.customMode')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LOBSTER_TEMPLATES.map((tpl, idx) => (
                <button key={idx} onClick={() => applyTemplate(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedTemplate === idx
                      ? 'bg-orange-500/20 border border-orange-500/50 text-orange-300'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent text-zinc-400 hover:text-white'
                  }`}>
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background: `rgb(${tpl.colors.shell})` }} />
                  <span className="truncate">{t(`hero.name.${idx}` as any)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mint button */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <button onClick={handleMint} disabled={minting || !signer}
              className="w-full px-6 py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-orange-500/20">
              {minting ? t('admin.minting') : t('admin.mintLobster')}
            </button>
          </div>

          {/* Solidity output */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">{t('admin.solidity')}</h3>
            <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap">
{`_packVisualRGB(
  [${partColors.shell}], [${partColors.claw}],
  [${partColors.leg}], [${partColors.eye}],
  [${partColors.tail}], [${partColors.aura}],
  [${partColors.sub}]
);`}
            </pre>
          </div>

          {/* Minted list */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                {t('admin.mintedList')}
              </h3>
              <button onClick={loadMinted} disabled={mintedLoading}
                className="text-xs text-zinc-500 hover:text-orange-400 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${mintedLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {mintedLoading ? (
              <div className="text-zinc-600 text-xs py-4 text-center">{t('loading') /* Loading... */}</div>
            ) : mintedList.length === 0 ? (
              <div className="text-zinc-600 text-xs py-4 text-center">{t('admin.noLobstersMinted')}</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {mintedList.map(nft => (
                  <div key={nft.tokenId} className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 rounded-lg px-4 py-3">
                    <span className="text-xs text-orange-400 font-bold">#{nft.tokenId}</span>
                    <span className="text-xs text-white font-bold flex-1">{nft.name || 'Unnamed'}</span>
                    <span className="text-xs text-zinc-500 font-mono">
                      HP:{nft.hp} ATK:{nft.atk} R:{nft.atkRange} S:{nft.speed} M:{nft.manaMax} P:{nft.skillPower}
                    </span>
                    <span className="text-xs text-zinc-600">
                      SE:0x{nft.skillEffect.toString(16).padStart(4, '0')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Mint Script Tab ──
/**
 * 将脚本 JSON 编码为合约二进制格式
 * JSON 格式: { slots: [{sortBy,order,filterProp,filterOp,filterRSub,filterRProp,filterVal},...], rules: [{c0,c1,c2,c3,action,actionArg,actionTarget},...] }
 * 每个 condition: {lSub,lProp,lOp,lVal,cmp,rSub,rProp,rOp,rVal}
 */
function encodeScriptJson(json: string): Uint8Array {
  const script = JSON.parse(json);
  const slots: any[] = script.slots || [];
  const rules: any[] = script.rules || [];
  const buf: number[] = [];

  // numSlots
  buf.push(Math.min(slots.length, 8));
  for (let i = 0; i < Math.min(slots.length, 8); i++) {
    const s = slots[i];
    buf.push(s.sortBy ?? 0, s.order ?? 0, s.filterProp ?? 0, s.filterOp ?? 0, s.filterRSub ?? 0, s.filterRProp ?? 0);
    const fv = s.filterVal ?? 0;
    buf.push((fv >> 8) & 0xFF, fv & 0xFF); // int16 big-endian
  }

  // numRules
  buf.push(Math.min(rules.length, 16));
  for (let i = 0; i < Math.min(rules.length, 16); i++) {
    const r = rules[i];
    for (const cKey of ['c0', 'c1', 'c2', 'c3']) {
      const c = r[cKey] || {};
      buf.push(c.lSub ?? 0, c.lProp ?? 0, c.lOp ?? 0);
      const lv = c.lVal ?? 0;
      buf.push((lv >> 8) & 0xFF, lv & 0xFF);
      buf.push(c.cmp ?? 0);
      buf.push(c.rSub ?? 0, c.rProp ?? 0, c.rOp ?? 0);
      const rv = c.rVal ?? 0;
      buf.push((rv >> 8) & 0xFF, rv & 0xFF);
    }
    buf.push(r.action ?? 0, r.actionArg ?? 0, r.actionTarget ?? 0);
  }

  return new Uint8Array(buf);
}

function MintScriptTab({ signer, showToast }: { signer: Signer | null; showToast: (msg: string) => void }) {
  const [scriptName, setScriptName] = useState('');
  const [rawJson, setRawJson] = useState('{\n  "slots": [],\n  "rules": []\n}');
  const [minting, setMinting] = useState(false);
  const [scriptList, setScriptList] = useState<ScriptNFT[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadScripts = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await fetchOwnedScripts(ADDRESSES.ScriptHub);
      setScriptList(list);
    } catch { /* ignore */ }
    setListLoading(false);
  }, []);

  useEffect(() => { loadScripts(); }, [loadScripts]);

  const handleMint = async () => {
    if (!signer) { showToast(t('admin.noWallet')); return; }
    if (scriptName.length === 0 || scriptName.length > 12) { showToast(t('admin.nameRequired')); return; }

    setMinting(true);
    try {
      const bytes = encodeScriptJson(rawJson);

      const txHash = await mintDefaultScript(signer, scriptName, bytes);
      showToast(`${t('admin.success')} TX: ${txHash.slice(0, 14)}...`);
      setTimeout(loadScripts, 3000);
    } catch (e) {
      showToast(t('admin.mintFailed') + ': ' + (e as Error).message?.slice(0, 80));
    }
    setMinting(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-orange-400" />
          <h2 className="font-display text-lg tracking-wide">
            {t('admin.mintScript')}
          </h2>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('admin.name')}</label>
          <input value={scriptName} onChange={e => setScriptName(e.target.value.slice(0, 12))}
            placeholder={t('admin.maxChars')}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50" />
        </div>

        {/* Script JSON */}
        <div>
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('admin.scriptJson')}</label>
          <textarea value={rawJson} onChange={e => setRawJson(e.target.value)}
            placeholder='{"slots":[...],"rules":[...]}'
            rows={10}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50 font-mono resize-y" />
        </div>

        {/* Mint button */}
        <button onClick={handleMint} disabled={minting || !signer}
          className="w-full px-6 py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-orange-500/20">
          {minting ? t('admin.minting') : t('admin.mintScript')}
        </button>
      </div>

      {/* Script list */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            {t('admin.mintedList')}
          </h3>
          <button onClick={loadScripts} disabled={listLoading}
            className="text-xs text-zinc-500 hover:text-orange-400 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {listLoading ? (
          <div className="text-zinc-600 text-xs py-4 text-center">{t('loading') /* Loading... */}</div>
        ) : scriptList.length === 0 ? (
          <div className="text-zinc-600 text-xs py-4 text-center">{t('admin.noScriptsMinted')}</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {scriptList.map(s => (
              <div key={s.tokenId} className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 rounded-lg px-4 py-3">
                <span className="text-xs text-orange-400 font-bold">#{s.tokenId}</span>
                <span className="text-xs text-zinc-400">{s.isDefault ? t('admin.default') : t('admin.custom')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Player Pool Tab (merged: AI player creation + pool browser) ──
function PlayerPoolTab({ signer, showToast }: { signer: Signer | null; showToast: (msg: string) => void }) {
  // Add AI player form
  const [aiName, setAiName] = useState('');
  const [heroTokenId, setHeroTokenId] = useState('');
  const [scriptTokenId, setScriptTokenId] = useState('');
  const [adding, setAdding] = useState(false);

  // Pool browser
  const [selectedTier, setSelectedTier] = useState(0);
  const [poolData, setPoolData] = useState<{ addresses: string[]; head: number } | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);

  const loadPool = useCallback(async (tier: number) => {
    setPoolLoading(true);
    try {
      const data = await fetchPool(tier);
      setPoolData(data);
    } catch { setPoolData(null); }
    setPoolLoading(false);
  }, []);

  useEffect(() => { loadPool(selectedTier); }, [selectedTier, loadPool]);

  const handleAdd = async () => {
    if (!signer) { showToast(t('admin.noWallet')); return; }
    if (aiName.length === 0 || aiName.length > 12) { showToast(t('admin.nameRequired')); return; }
    const hero = parseInt(heroTokenId);
    const script = parseInt(scriptTokenId);
    if (isNaN(hero) || hero < 0) { showToast(t('admin.invalidHeroToken')); return; }
    if (isNaN(script) || script < 0) { showToast(t('admin.invalidScriptToken')); return; }

    setAdding(true);
    try {
      const txHash = await addDefaultPlayer(signer, aiName, hero, script);
      showToast(`${t('admin.success')} TX: ${txHash.slice(0, 14)}...`);
      setTimeout(() => loadPool(selectedTier), 3000);
    } catch (e) {
      showToast(t('admin.addFailed') + ': ' + (e as Error).message?.slice(0, 80));
    }
    setAdding(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex gap-6">
        {/* Left: Add AI Player */}
        <div className="w-[360px] shrink-0 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-orange-400" />
            <h2 className="font-display text-base tracking-wide">{t('admin.addAIPlayer')}</h2>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('admin.name')}</label>
            <input value={aiName} onChange={e => setAiName(e.target.value.slice(0, 12))}
              placeholder={t('admin.maxChars')}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('admin.heroTokenId')}</label>
            <input type="number" value={heroTokenId} onChange={e => setHeroTokenId(e.target.value)} placeholder="0"
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50 font-mono" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('admin.scriptTokenId')}</label>
            <input type="number" value={scriptTokenId} onChange={e => setScriptTokenId(e.target.value)} placeholder="0"
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50 font-mono" />
          </div>
          <button onClick={handleAdd} disabled={adding || !signer}
            className="w-full px-6 py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-orange-500/20">
            {adding ? t('admin.adding') : t('admin.addAIPlayer')}
          </button>
        </div>

        {/* Right: Pool Browser */}
        <div className="flex-1 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {RANKS.map((rank, i) => (
              <button key={i} onClick={() => setSelectedTier(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedTier === i ? 'text-white border' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
                style={selectedTier === i ? { borderColor: rank.color, color: rank.color, backgroundColor: rank.color + '20' } : {}}>
                {t(`rank.${rank.id}`)}
              </button>
            ))}
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-orange-400" />
                <h2 className="font-display text-lg tracking-wide">{t(`rank.${RANKS[selectedTier]?.id}`)} {t('admin.pool')}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">{t('admin.poolStats').replace('{count}', String(poolData?.addresses.length ?? 0)).replace('{head}', String(poolData?.head ?? 0))}</span>
                <button onClick={() => loadPool(selectedTier)} disabled={poolLoading}
                  className="text-xs text-zinc-500 hover:text-orange-400 transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${poolLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            {poolLoading ? (
              <div className="p-16 text-center text-zinc-600 text-sm">{t('loading')}</div>
            ) : !poolData || poolData.addresses.length === 0 ? (
              <div className="p-16 text-center text-zinc-600 text-sm">{t('admin.empty')}</div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-px bg-white/5 max-h-[60vh] overflow-y-auto">
                {poolData.addresses.map((addr, i) => (
                  <div key={i} className="bg-[#0a0a0a] px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
                    <span className="text-xs text-zinc-600 w-6">{i}</span>
                    <PlayerNameTag address={addr} className="text-xs" />
                    <CopyAddress address={addr} className="text-xs text-zinc-500" iconSize={10} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
