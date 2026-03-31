import { useState, useMemo } from 'react';
import { X, Zap, Loader2, Plus } from 'lucide-react';
import { t } from '../i18n';
import { SKILL_EFFECT_BITS, lobsterDisplayName } from '../config/game';
import { MINT_LOBSTER_COINS, MINT_BNB } from '../config/constants';
import { InteractiveLobsterCard } from './InteractiveLobsterCard';
import { RadarChart } from './RadarChart';
import { partColorsToTheme, type LobsterPartColors } from './Lobster';
import { MintSuccessDialog } from './MintSuccessDialog';
import { mintLobsterNFT, fetchLobsterNFT, parseContractError, type LobsterNFT } from '../services/dataStore';
import { useOwnedLobsters } from '../hooks/useData';
import { ADDRESSES } from '../config/contracts';
import { CopyNFTAddress } from './CopyNFTAddress';
import { type Signer } from 'ethers';
import { LobsterCoinIcon, PolAmount } from './Icons';

// ══════════════════════════════════════════
// Hero Select Panel — 从链上 NFT 加载数据
// ══════════════════════════════════════════

/** 从 skillEffect bitmask 获取匹配的技能条目 */
function getSkillEntries(skillEffect: number) {
  return SKILL_EFFECT_BITS.filter(se => (skillEffect & se.bit) !== 0);
}

/** NFT 数据 → 主色 hex */
function nftMainColor(nft: LobsterNFT): string {
  return `rgb(${nft.shell[0]},${nft.shell[1]},${nft.shell[2]})`;
}

/** NFT → LobsterPartColors */
function nftToPartColors(nft: LobsterNFT): LobsterPartColors {
  return { shell: nft.shell, claw: nft.claw, leg: nft.leg, eye: nft.eye, tail: nft.tail, aura: nft.aura, sub: nft.sub };
}

/** NFT → LobsterStats */
function nftToStats(nft: LobsterNFT): import('./Lobster').LobsterStats {
  return { hp: nft.hp, atk: nft.atk, speed: nft.speed, atkRange: nft.atkRange, manaMax: nft.manaMax, skillPower: nft.skillPower };
}


export function HeroSelectPanel({ currentHeroId, onSelect, onClose, walletAddress, signer, showToast, playerCoins = 0 }: {
  currentHeroId: number;
  onSelect: (id: number) => void;
  onClose: () => void;
  walletAddress: string | null;
  signer: Signer | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  playerCoins?: number;
}) {
  // 通过 hook 订阅 DataCenter，自动缓存 + 通知
  const addr = walletAddress || ADDRESSES.LobsterHub;
  const { data: lobsters, loading, refresh: refreshLobsters } = useOwnedLobsters(addr);

  const [selected, setSelected] = useState<number>(currentHeroId);
  const [showMintDialog, setShowMintDialog] = useState(false);
  const [mintName, setMintName] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintedNFT, setMintedNFT] = useState<LobsterNFT | null>(null);

  const list = lobsters ?? [];

  // 分组：我的 vs 系统默认
  const { mine, system } = useMemo(() => {
    const mine: LobsterNFT[] = [];
    const system: LobsterNFT[] = [];
    for (const nft of list) {
      if (walletAddress && nft.owner.toLowerCase() === walletAddress.toLowerCase()) {
        mine.push(nft);
      } else {
        system.push(nft);
      }
    }
    return { mine, system };
  }, [list, walletAddress]);

  const hero = list.find(l => l.tokenId === selected) ?? list[0] ?? null;
  const heroColor = hero ? nftMainColor(hero) : '#f97316';

  const maxHp = 40, maxAtk = 11, maxSpeed = 5, maxRange = 4, maxPower = 10;
  const radarValues = hero
    ? [hero.hp / maxHp, hero.atk / maxAtk, hero.speed / maxSpeed, hero.atkRange / maxRange, hero.skillPower / maxPower]
    : [0, 0, 0, 0, 0];
  const radarLabels = hero
    ? [
        `${t('common.hp')} ${hero.hp}`,
        `${t('common.attack')} ${hero.atk}`,
        `${t('common.speed')} ${hero.speed}`,
        `${t('hero.range')} ${hero.atkRange}`,
        `${t('hero.skillPower')} ${hero.skillPower}`,
      ]
    : [`${t('common.hp')} 0`, `${t('common.attack')} 0`, `${t('common.speed')} 0`, `${t('hero.range')} 0`, `${t('hero.skillPower')} 0`];

  const MINT_COST = MINT_LOBSTER_COINS;
  const MIN_NAME_LEN = 2;

  const nameBytes = (s: string) => new TextEncoder().encode(s).byteLength;
  const sanitizeName = (v: string) => {
    let s = v.replace(/\s/g, '');
    while (nameBytes(s) > 12) s = [...s].slice(0, -1).join('');
    return s;
  };
  const nameValid = mintName.length >= MIN_NAME_LEN && nameBytes(mintName) <= 12;

  // 铸造龙虾
  const handleMint = async () => {
    if (!signer) { showToast?.(t('toast.connectWalletFirst'), 'error'); return; }
    if (mintName.length < MIN_NAME_LEN) { showToast?.(t('mint.nameTooShort'), 'error'); return; }
    if (nameBytes(mintName) > 12) { showToast?.(t('mint.nameTooLong'), 'error'); return; }
    if (playerCoins < MINT_COST) { showToast?.(t('error.insufficientCoins'), 'error'); return; }
    setMinting(true);
    try {
      const tokenId = await mintLobsterNFT(signer, mintName);
      // 获取铸造出的 NFT 数据展示
      let nft: LobsterNFT | null = null;
      if (tokenId >= 0) {
        try { nft = await fetchLobsterNFT(tokenId); } catch { /* ignore */ }
      }
      setMintedNFT(nft);
      setMinting(false);
      refreshLobsters();
    } catch (e) {
      const key = parseContractError(e);
      showToast?.(key ? t(key) : t('mint.lobster.failed') + ': ' + (e as Error).message?.slice(0, 80), 'error');
      setMinting(false);
    }
  };

  // 渲染龙虾卡片
  const renderCard = (nft: LobsterNFT) => (
    <InteractiveLobsterCard
      key={nft.tokenId}
      theme={partColorsToTheme(nftToPartColors(nft), nftToStats(nft))}
      selected={selected === nft.tokenId}
      onClick={() => setSelected(nft.tokenId)}
      className="!p-3 !gap-2"
    >
      <p className="text-xs font-bold text-white text-center truncate">{lobsterDisplayName(nft.tokenId, nft.name)}</p>
    </InteractiveLobsterCard>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white z-10">
          <X className="w-6 h-6" />
        </button>

        <div className="p-6 border-b border-white/10 shrink-0 flex items-center justify-between">
          <h2 className="text-2xl font-display uppercase tracking-wider text-white">{t('hero.chooseLobster')}</h2>
          {walletAddress && (
            <button
              onClick={() => setShowMintDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:border-orange-500/60 rounded-xl text-sm font-bold text-orange-400 hover:text-orange-300 transition-all mr-8"
            >
              <Plus className="w-4 h-4" />
              {t('mint.lobster')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-zinc-500">{t('nft.loading')}</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-zinc-500">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Lobster Grid */}
            <div className="flex-1 p-4 overflow-y-auto">
              {/* 我的龙虾 */}
              <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 px-1">{t('nft.section.mine')}</div>
              {mine.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {mine.map(renderCard)}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 mb-4 px-1">{t('nft.lobster.mintHint')}</p>
              )}
              {/* 系统默认 */}
              {system.length > 0 && (
                <>
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('nft.section.system')}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {system.map(renderCard)}
                  </div>
                </>
              )}
            </div>

            {/* Right: Detail Panel */}
            {hero && (
              <div className="w-[280px] shrink-0 border-l border-white/10 p-5 overflow-y-auto flex flex-col gap-4">
                <div>
                  <h3 className="text-2xl font-display text-white tracking-wider">{lobsterDisplayName(hero.tokenId, hero.name)}</h3>
                  <div className="mt-1">
                    <CopyNFTAddress address={ADDRESSES.LobsterHub} tokenId={hero.tokenId} className="text-[11px] text-zinc-500" iconSize={10} />
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                    <span>{t('hero.skill')}</span>
                    <span className="flex items-center gap-1 text-blue-400 normal-case tracking-normal">💧 {hero.manaMax}</span>
                  </h4>
                  <div className="space-y-2">
                    {getSkillEntries(hero.skillEffect).map(se => (
                      <div key={se.bit} className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10" style={{ backgroundColor: (se.type === 'buff' ? '#22c55e' : '#ef4444') + '25' }}>
                            <Zap className="w-3.5 h-3.5" style={{ color: se.type === 'buff' ? '#22c55e' : '#ef4444' }} />
                          </div>
                          <span className="text-sm font-bold text-white">{t(`skill.${se.key}` as any)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${se.type === 'buff' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {se.type === 'buff' ? t('skill.buff') : t('skill.debuff')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {t(`skill.${se.key}.desc` as any).replace('{p}', String(hero.skillPower)).replace('{d}', String(100 + hero.skillPower * 10))}
                        </p>
                      </div>
                    ))}
                    {getSkillEntries(hero.skillEffect).length === 0 && (
                      <div className="text-xs text-zinc-600">{t('admin.none')}</div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('hero.stats')}</h4>
                  <div className="flex justify-center">
                    <RadarChart values={radarValues} labels={radarLabels} color={heroColor} size={180} />
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {([
                      [t('common.hp'), hero.hp, maxHp],
                      [t('common.attack'), hero.atk, maxAtk],
                      [t('common.speed'), hero.speed, maxSpeed],
                      [t('hero.range'), hero.atkRange, maxRange],
                      [t('hero.skillPower'), hero.skillPower, maxPower],
                      [t('replay.mana'), hero.manaMax, 6],
                    ] as [string, number, number][]).map(([label, val, max]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 w-14 truncate">{label}</span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(val / max) * 100}%`, backgroundColor: heroColor }} />
                        </div>
                        <span className="text-xs text-zinc-300 w-6 text-right font-mono">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm Button */}
        <div className="p-5 border-t border-white/10 flex justify-center shrink-0">
          <button
            onClick={() => { onSelect(selected); onClose(); }}
            disabled={!hero}
            className="px-10 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-display text-xl tracking-wider uppercase hover:scale-105 transition-transform shadow-[0_0_20px_rgba(249,115,22,0.4)] disabled:opacity-50"
          >
            {t('hero.confirm')}
          </button>
        </div>
      </div>

      {/* ── Mint Success ── */}
      {showMintDialog && mintedNFT && (
        <MintSuccessDialog nft={mintedNFT} onClose={() => { setShowMintDialog(false); setMintedNFT(null); setMintName(''); }} />
      )}

      {/* ── Mint Dialog ── */}
      {showMintDialog && !mintedNFT && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-6" onMouseDown={() => !minting && setShowMintDialog(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6" onMouseDown={e => e.stopPropagation()}>
            {/* 状态：铸造中 */}
            {minting ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                <p className="text-sm text-zinc-400">{t('mint.lobster.minting')}</p>
              </div>
            ) : (
              /* 状态：输入 */
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-display text-white tracking-wider">{t('mint.lobster')}</h3>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                    {t('mint.lobster.owned')}
                    <LobsterCoinIcon className="w-4 h-4" />
                    <span className={`font-tech font-bold ${playerCoins < MINT_COST ? 'text-red-400' : 'text-white'}`}>{playerCoins.toLocaleString()}</span>
                  </span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{t('mint.lobster.desc')}</p>

                <div>
                  <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 block">{t('mint.lobster.name')}</label>
                  <input
                    value={mintName}
                    onChange={e => setMintName(sanitizeName(e.target.value))}
                    placeholder={`${MIN_NAME_LEN}-12 bytes`}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50"
                  />
                </div>

                {/* 预估费用 */}
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5 border border-white/10">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{t('wallet.estimatedCost')}</span>
                  <PolAmount amount={MINT_BNB} size="sm" />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMintDialog(false)}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    {t('player.cancel')}
                  </button>
                  <button
                    onClick={handleMint}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm hover:scale-[1.02] transition-transform shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <LobsterCoinIcon className="w-5 h-5" /> {MINT_COST} {t('common.mint')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HeroSelectPanel;
