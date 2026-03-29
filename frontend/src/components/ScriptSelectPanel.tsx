/**
 * ScriptSelectPanel — 两个标签页：选择脚本 / 铸造AI脚本NFT
 */
import { useState, useMemo, useCallback, useRef } from 'react';
import { X, Loader2, Code, Check, Copy, Eye } from 'lucide-react';
import { t, type Lang } from '../i18n';
import { scriptDisplayName } from '../config/game';
import { mintScriptNFT, parseContractError, fetchScriptBytes, type ScriptNFT } from '../services/dataStore';
import { useOwnedScripts } from '../hooks/useData';
import { ADDRESSES } from '../config/contracts';
import { CopyNFTAddress } from './CopyNFTAddress';
import { PolAmount, LobsterCoinIcon } from './Icons';
import { MINT_BNB, MINT_SCRIPT_COINS } from '../config/constants';
import ScriptPanel, { type ScriptPanelHandle } from './ScriptPanel';
import { type Signer } from 'ethers';

// ── 脚本 JSON → 二进制编码 ──

function encodeScriptJson(json: string): Uint8Array {
  const script = JSON.parse(json);
  const slots: any[] = script.slots || [];
  const rules: any[] = script.rules || [];
  const buf: number[] = [];

  buf.push(Math.min(slots.length, 8));
  for (let i = 0; i < Math.min(slots.length, 8); i++) {
    const s = slots[i];
    buf.push(s.sortBy ?? 0, s.order ?? 0, s.filterProp ?? 0, s.filterOp ?? 0, s.filterRSub ?? 0, s.filterRProp ?? 0);
    const fv = s.filterVal ?? 0;
    buf.push((fv >> 8) & 0xFF, fv & 0xFF);
  }

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

/** 二进制脚本 → JSON 对象（encodeScriptJson 的逆操作） */
function decodeScriptBytes(data: Uint8Array): { slots: any[]; rules: any[] } {
  let p = 0;
  const r = () => data[p++] ?? 0;
  const r16 = () => { const hi = r(), lo = r(); const v = (hi << 8) | lo; return v > 32767 ? v - 65536 : v; };

  const numSlots = r();
  const slots: any[] = [];
  for (let i = 0; i < numSlots; i++) {
    slots.push({ sortBy: r(), order: r(), filterProp: r(), filterOp: r(), filterRSub: r(), filterRProp: r(), filterVal: r16() });
  }

  const numRules = r();
  const rules: any[] = [];
  for (let i = 0; i < numRules; i++) {
    const conds: any = {};
    for (const cKey of ['c0', 'c1', 'c2', 'c3']) {
      conds[cKey] = { lSub: r(), lProp: r(), lOp: r(), lVal: r16(), cmp: r(), rSub: r(), rProp: r(), rOp: r(), rVal: r16() };
    }
    rules.push({ ...conds, action: r(), actionArg: r(), actionTarget: r() });
  }

  return { slots, rules };
}

export default function ScriptSelectPanel({ lang, currentScriptId, onSelect, onClose, walletAddress, signer, showToast }: {
  lang: Lang;
  currentScriptId: number;
  onSelect: (id: number) => void;
  onClose: () => void;
  walletAddress: string | null;
  signer: Signer | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [tab, setTab] = useState<'select' | 'mint'>('select');
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl h-[70vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
        {/* Header with tabs */}
        <div className="p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
              <button
                onClick={() => setTab('select')}
                className={`px-4 py-2 text-sm font-bold transition-colors ${tab === 'select' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('script.tab.select')}
              </button>
              <button
                onClick={() => setTab('mint')}
                className={`px-4 py-2 text-sm font-bold transition-colors ${tab === 'mint' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('script.tab.mint')}
              </button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {tab === 'mint' && <span className="text-sm font-bold text-white">{t('mint.script.title')}</span>}
              <button onClick={() => setShowHelp(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-white/10 text-zinc-500 hover:text-white hover:bg-white/20 border border-white/10">?</button>
              <button onClick={onClose} className="text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Script help modal */}
        {showHelp && (
          <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={() => setShowHelp(false)}>
            <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-lg p-6 relative" onMouseDown={e => e.stopPropagation()}>
              <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              <h3 className="text-lg font-bold text-white mb-1">{t('script.helpTitle')}</h3>
              <p className="text-xs text-zinc-500 mb-4">{lang === 'zh' ? '脚本控制你的龙虾在战斗中的 AI 行为。你也可以让 AI 帮你设计 JSON 格式的脚本，直接粘贴使用。' : lang === 'tw' ? '腳本控制你的龍蝦在戰鬥中的 AI 行為。你也可以讓 AI 幫你設計 JSON 格式的腳本，直接粘貼使用。' : 'Scripts control your lobster\'s battle AI. You can also ask AI to design a JSON script and paste it directly.'}</p>

              {/* 目标选择 */}
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 mb-3">
                <h4 className="text-sm font-bold text-cyan-400 mb-2">{lang === 'zh' ? '目标选择（Slot）' : lang === 'tw' ? '目標選擇（Slot）' : 'Target Selection (Slot)'}</h4>
                <p className="text-xs text-zinc-300 leading-relaxed">{lang === 'zh' ? '对视野内的敌人排序筛选，找到最优目标。可按距离、血量、击杀所需刀数等排序。' : lang === 'tw' ? '對視野內的敵人排序篩選，找到最優目標。可按距離、血量、擊殺所需刀數等排序。' : 'Sort and filter visible enemies to find the best target. Sort by distance, HP, hits to kill, etc.'}</p>
              </div>

              {/* 规则 */}
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 mb-3">
                <h4 className="text-sm font-bold text-orange-400 mb-2">{lang === 'zh' ? '规则（Rule）' : lang === 'tw' ? '規則（Rule）' : 'Rules (Rule)'}</h4>
                <p className="text-xs text-zinc-300 leading-relaxed">{lang === 'zh' ? '每回合从上到下逐条判断，第一条满足条件的规则执行。每条规则最多 4 个条件 + 1 个行为（攻击/防御/移动/闪现）。' : lang === 'tw' ? '每回合從上到下逐條判斷，第一條滿足條件的規則執行。每條規則最多 4 個條件 + 1 個行為。' : 'Evaluated top-to-bottom each turn. First matching rule fires. Each rule: up to 4 conditions + 1 action (attack/defend/move/blink).'}</p>
              </div>

              {/* 执行流程 */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
                <h4 className="text-sm font-bold text-zinc-300 mb-2">{lang === 'zh' ? '每回合执行流程' : lang === 'tw' ? '每回合執行流程' : 'Per-Turn Flow'}</h4>
                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400 font-bold">{lang === 'zh' ? '计算目标' : 'Slots'}</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded text-orange-400 font-bold">{lang === 'zh' ? '逐条匹配规则' : 'Match Rules'}</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-green-400 font-bold">{lang === 'zh' ? '执行行为' : 'Execute'}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-500">{lang === 'zh' ? '点击任意脚本的「查看策略」按钮可查看其逻辑。' : lang === 'tw' ? '點擊任意腳本的「查看策略」按鈕可查看其邏輯。' : 'Click the "View Strategy" button on any script to see its logic.'}</p>
            </div>
          </div>
        )}

        {/* Content — 两个 tab 都渲染，用 display 切换避免尺寸跳动 */}
        <div className={`flex-1 flex flex-col min-h-0 ${tab === 'select' ? '' : 'hidden'}`}>
          <SelectTab lang={lang} currentScriptId={currentScriptId} onSelect={onSelect} onClose={onClose} walletAddress={walletAddress} showToast={showToast} />
        </div>
        <div className={`flex-1 flex flex-col min-h-0 ${tab === 'mint' ? '' : 'hidden'}`}>
          <MintTab lang={lang} signer={signer} showToast={showToast} walletAddress={walletAddress} onMinted={() => setTab('select')} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// Tab 1: 选择脚本
// ══════════════════════════════════════════

function SelectTab({ lang, currentScriptId, onSelect, onClose, walletAddress, showToast }: {
  lang: Lang;
  currentScriptId: number;
  onSelect: (id: number) => void;
  onClose: () => void;
  walletAddress: string | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const addr = walletAddress || ADDRESSES.ScriptHub;
  const { data: scripts, loading } = useOwnedScripts(addr);
  const [selected, setSelected] = useState(currentScriptId);
  const [viewScript, setViewScript] = useState<{ data: any; label: string } | null>(null);

  const list = scripts ?? [];

  const handleView = useCallback(async (tokenId: number, label: string) => {
    try {
      const bytes = await fetchScriptBytes(tokenId);
      const json = decodeScriptBytes(bytes);
      setViewScript({ data: json, label });
    } catch {
      showToast?.(t('admin.loadFailed'), 'error');
    }
  }, [showToast]);

  const handleCopy = useCallback(async (tokenId: number) => {
    try {
      const bytes = await fetchScriptBytes(tokenId);
      const json = decodeScriptBytes(bytes);
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      showToast?.(t('script.copied'), 'success');
    } catch {
      showToast?.(t('admin.loadFailed'), 'error');
    }
  }, [showToast]);

  // 分组
  const { mine, system } = useMemo(() => {
    const mine: ScriptNFT[] = [];
    const system: ScriptNFT[] = [];
    for (const s of list) {
      if (s.isDefault) system.push(s);
      else mine.push(s);
    }
    return { mine, system };
  }, [list]);

  const getLabel = (s: ScriptNFT) => scriptDisplayName(s.tokenId, s.name);

  return (
    <>
      {viewScript && (
        <ScriptPanel
          script={viewScript.data}
          lang={lang}
          label={viewScript.label}
          onClose={() => setViewScript(null)}
        />
      )}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {loading && list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            <p className="text-sm text-zinc-500">{t('nft.loading')}</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-zinc-500">{t('nft.script.none')}</p>
          </div>
        ) : (
          <>
            <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">{t('nft.section.mine')}</div>
            {mine.length > 0 ? (
              <div className="space-y-2 mb-4">
                {mine.map(s => (
                  <ScriptRow key={s.tokenId} label={getLabel(s)} tokenId={s.tokenId} selected={selected === s.tokenId} onClick={() => setSelected(s.tokenId)} onCopy={() => handleCopy(s.tokenId)} onView={() => handleView(s.tokenId, getLabel(s))} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 mb-4">{t('nft.script.mintHint')}</p>
            )}
            {system.length > 0 && (
              <>
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('nft.section.system')}</div>
                <div className="space-y-2">
                  {system.map(s => (
                    <ScriptRow key={s.tokenId} label={getLabel(s)} tokenId={s.tokenId} selected={selected === s.tokenId} onClick={() => setSelected(s.tokenId)} onCopy={() => handleCopy(s.tokenId)} onView={() => handleView(s.tokenId, getLabel(s))} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="p-4 border-t border-white/10 flex justify-center shrink-0">
        <button
          onClick={() => { onSelect(selected); onClose(); }}
          disabled={loading && list.length === 0}
          className="px-10 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-display text-xl tracking-wider uppercase hover:scale-105 transition-transform shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50"
        >
          {t('hero.confirm')}
        </button>
      </div>
    </>
  );
}

function ScriptRow({ label, tokenId, selected, onClick, onCopy, onView }: {
  label: string; tokenId: number; selected: boolean; onClick: () => void; onCopy: () => void; onView: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left cursor-pointer ${
        selected
          ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
          : 'bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/10'
      }`}
    >
      <Code className={`w-4 h-4 shrink-0 ${selected ? 'text-cyan-400' : 'text-zinc-600'}`} />
      <span className="text-sm font-bold truncate">{label}</span>
      <CopyNFTAddress address={ADDRESSES.ScriptHub} tokenId={tokenId} className="text-[10px] text-zinc-600 shrink-0" iconSize={9} />
      <span className="flex-1" />
      {selected && <Check className="w-4 h-4 text-cyan-400 shrink-0" />}
      <button
        onClick={e => { e.stopPropagation(); onCopy(); }}
        className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-cyan-400 transition-colors shrink-0"
        title={t('script.copied')}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onView(); }}
        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors shrink-0"
      >
        {t('common.viewStrategy')}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════
// Tab 2: 铸造AI脚本NFT — 内嵌 ScriptPanel 编辑器
// ══════════════════════════════════════════

function MintTab({ lang, signer, showToast, walletAddress, onMinted }: {
  lang: Lang;
  signer: Signer | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  walletAddress: string | null;
  onMinted?: () => void;
}) {
  const [scriptName, setScriptName] = useState('');
  const [minting, setMinting] = useState(false);
  const [scriptData, setScriptData] = useState<{ slots: any[]; rules: any[] }>({ slots: [], rules: [] });
  const panelRef = useRef<ScriptPanelHandle>(null);

  // 刷新脚本列表
  const addr = walletAddress || ADDRESSES.ScriptHub;
  const { refresh: refreshScripts } = useOwnedScripts(addr);

  const sanitizeName = (v: string) => v.replace(/\s/g, '').slice(0, 12);
  const MIN_NAME_LEN = 2;

  const handleMint = async () => {
    if (!signer) { showToast?.(t('toast.connectWalletFirst'), 'error'); return; }
    if (scriptName.length < MIN_NAME_LEN) { showToast?.(t('mint.nameTooShort'), 'error'); return; }

    // Get current data from ScriptPanel (handles both UI and raw JSON mode)
    const data = panelRef.current?.getData();
    if (!data) {
      showToast?.(t('script.jsonError'), 'error');
      return;
    }
    if (!data.rules || data.rules.length === 0) { showToast?.(t('script.validation.noRules'), 'error'); return; }

    const json = JSON.stringify(data);
    let bytes: Uint8Array;
    try {
      bytes = encodeScriptJson(json);
    } catch {
      showToast?.(t('script.jsonError'), 'error');
      return;
    }

    if (bytes.length <= 2) {
      showToast?.(t('script.validation.noRules'), 'error');
      return;
    }

    setMinting(true);
    try {
      await mintScriptNFT(signer, scriptName || 'Unnamed', bytes);
      showToast?.(t('mint.script.success'), 'success');
      setScriptData({ slots: [], rules: [] });
      setScriptName('');
      refreshScripts();
      onMinted?.();
    } catch (e) {
      const key = parseContractError(e);
      showToast?.(key ? t(key) : t('mint.script.failed') + ': ' + (e as Error).message?.slice(0, 80), 'error');
    }
    setMinting(false);
  };

  return (
    <>
      {/* ScriptPanel 占满中间区域，自带滚动 */}
      <div className="flex-1 min-h-0">
        <ScriptPanel
          ref={panelRef}
          editable
          script={scriptData}
          lang={lang}
          onSave={setScriptData}
          onClose={() => {}}
          showToast={showToast}
          inline
          noSave
        />
      </div>

      {/* Footer: name + cost + mint — one row */}
      <div className="px-3 py-2 border-t border-white/10 shrink-0 flex items-center gap-2">
        <span className="text-xs text-zinc-500 font-bold shrink-0">{lang === 'zh' ? '策略名' : lang === 'tw' ? '策略名' : 'Name'}</span>
        <input
          value={scriptName}
          onChange={e => setScriptName(sanitizeName(e.target.value))}
          placeholder={`${MIN_NAME_LEN}-12 chars`}
          className="w-56 min-w-0 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-500/50"
          disabled={minting}
        />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/10 shrink-0">
          <span className="text-[10px] text-zinc-500 font-bold">{t('wallet.estimatedCost')}</span>
          <PolAmount amount={MINT_BNB} size="sm" />
        </div>
        <button
          onClick={handleMint}
          disabled={minting}
          className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-bold text-sm tracking-wider hover:scale-[1.02] transition-transform shadow-lg disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {minting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LobsterCoinIcon className="w-4 h-4" /> {MINT_SCRIPT_COINS} {t('common.mint')}</>}
        </button>
      </div>
    </>
  );
}
