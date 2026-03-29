/**
 * DataStore - 统一数据中心（缓存 + 状态管理 + 订阅通知）
 *
 * 每种数据类型有独立的 state: 'idle' | 'loading' | 'ready' | 'error'
 * 组件通过 hooks 订阅，数据更新自动通知所有订阅者。
 */
import { ethers } from 'ethers';
import { ADDRESSES, ARENA_PROXY, ARENA_ABI, ARENA_ADMIN_ABI, LOBSTER_ABI, SCRIPT_ABI, UTILITY_ABI } from '../config/contracts';
import { getReadProvider } from './wallet';
import { unpackLobsterStats, unpackLobsterVisual } from '../config/game';

// ── Resolve sub-contract addresses from proxy (once) ──
let _addressesResolved = false;
async function ensureAddresses() {
  if (_addressesResolved) return;
  try {
    const c = new ethers.Contract(ARENA_PROXY, ARENA_ABI, getReadProvider());
    const r = await c.getAddresses();
    ADDRESSES.LobsterHub = String(r._lobsterHub);
    ADDRESSES.ScriptHub = String(r._scriptHub);
    ADDRESSES.ClawUtility = String(r._clawUtility);
    _addressesResolved = true;
  } catch {
    // Retry next time
  }
}

// Gas 完全交给 MetaMask 处理，不手动干预
// MetaMask 会自动处理 opBNB 的 gas 模式

// ── 合约错误 → 友好提示 ──
const CONTRACT_ERRORS: Record<string, string> = {
  '0x9e87fac8': 'error.paused',
  '0x2c9f01ba': 'error.notYourHero',
  '0x016930d8': 'error.notYourScript',
  '0x9a0833b6': 'error.wrongFee',
  '0x0d5efa99': 'error.itemNotOwned',
  '0x82b42900': 'error.unauthorized',
  '0xec411ae6': 'error.insufficientCoins',
  '0x90b8ec18': 'error.transferFailed',
};

/** 从合约 revert 错误中提取友好的 i18n key，找不到则返回原始消息 */
export function parseContractError(e: any): string {
  // ethers v6: e.data 包含 revert selector
  const data = e?.data ?? e?.error?.data ?? '';
  if (typeof data === 'string' && data.startsWith('0x')) {
    const selector = data.slice(0, 10);
    const key = CONTRACT_ERRORS[selector];
    if (key) return key;
  }
  // 尝试从 message 中匹配 data="0x..."
  const msg = e?.message ?? e?.reason ?? '';
  const match = msg.match(/data="(0x[0-9a-fA-F]+)"/);
  if (match) {
    const selector = match[1].slice(0, 10);
    const key = CONTRACT_ERRORS[selector];
    if (key) return key;
  }
  // fallback: 用户取消交易
  if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED')) return 'toast.transactionCancelled';
  if (msg.includes('insufficient funds')) return 'toast.insufficientFunds';
  return '';
}

function decodeBytes12(raw: string): string {
  try {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    const bytes = [];
    for (let i = 0; i < Math.min(hex.length, 24); i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16);
      if (b === 0) break;
      bytes.push(b);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch { return ''; }
}

// ── 类型 ──
export interface PlayerData {
  name: string;
  rating: number;
  coins: number;
  streak: number;
  season: number;
  itemMask: bigint;
  equippedNameplate: number;
  equippedBadge: number;
  totalMatches: number;
  wins: number;
  totalKills: number;
  achievements: bigint;
  heroTokenId: number;
  scriptTokenId: number;
}

export interface MatchResult {
  matchId?: number;
  seed: number;
  playerRank: number;
  ratingChange: number;
  coinsEarned: number;
  players: string[];
  heroTokenIds: number[];
  scriptTokenIds: number[];
  replayHash?: string;   // keccak256 of final entity states from contract
  gasUsed?: string;      // gas units consumed
  gasCostPol?: string;   // total gas cost in BNB
  timestamp?: number;    // 区块时间戳（秒）
}

export interface LobsterNFT {
  tokenId: number;
  owner: string;
  hp: number; atk: number; atkRange: number; speed: number; manaMax: number;
  skillEffect: number; skillPower: number;
  // 7×RGB 配色
  shell: [number, number, number];
  claw: [number, number, number];
  leg: [number, number, number];
  eye: [number, number, number];
  tail: [number, number, number];
  aura: [number, number, number];
  sub: [number, number, number];
  name: string;
}

export interface GlobalStats {
  totalPlayers: number;
  streakKing: string;
  streakRecord: number;
  currentSeason: number;
  paused: boolean;
  entryFeePol: number;
}

export interface LeaderboardEntry {
  address: string;
  rating: number;
  season: number;
}

export interface ScriptNFT {
  tokenId: number;
  isDefault: boolean;
  name: string;
}

// ── 数据状态 ──
export type DataState = 'idle' | 'loading' | 'ready' | 'error';

export interface DataSlice<T> {
  data: T | null;
  state: DataState;
  error: string | null;
  ts: number; // last fetch timestamp
}

function emptySlice<T>(): DataSlice<T> {
  return { data: null, state: 'idle', error: null, ts: 0 };
}

// ── 合约实例 ──
function arena() { return new ethers.Contract(ADDRESSES.ClawArena, ARENA_ABI, getReadProvider()); }
function lobsterHub() { return new ethers.Contract(ADDRESSES.LobsterHub, LOBSTER_ABI, getReadProvider()); }
function scriptHub() { return new ethers.Contract(ADDRESSES.ScriptHub, SCRIPT_ABI, getReadProvider()); }
function utility(signer: ethers.Signer) { return new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer); }

// ── 缓存 TTL ──
const CACHE_TTL = 10_000;       // 10 秒
const NFT_TTL = 60_000;         // NFT 不常变，缓存 1 分钟

function isFresh(ts: number, ttl = CACHE_TTL) { return Date.now() - ts < ttl; }

// ══════════════════════════════════════════
// DataCenter Singleton
// ══════════════════════════════════════════

type DataKey = 'player' | 'globalStats' | 'leaderboard' | 'lobsterNFTs' | 'scripts' | 'matchHistory';
type Listener = (key: DataKey) => void;

class DataCenter {
  // ── 当前钱包地址 ──
  connectedAddress: string | null = null;

  // ── 数据 slices ──
  player = new Map<string, DataSlice<PlayerData>>();
  globalStats: DataSlice<GlobalStats> = emptySlice();
  leaderboard: DataSlice<LeaderboardEntry[]> = emptySlice();
  lobsterNFTs = new Map<string, DataSlice<LobsterNFT[]>>(); // keyed by owner address
  scripts = new Map<string, DataSlice<ScriptNFT[]>>();       // keyed by owner address
  matchHistory = new Map<string, DataSlice<MatchResult[]> & { dirty: boolean }>();

  // ── 单个 NFT 缓存 (内部用) ──
  private lobsterCache = new Map<number, { data: LobsterNFT; ts: number }>();
  private scriptCache = new Map<number, { data: ScriptNFT; ts: number }>();

  // ── 订阅者 ──
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(key: DataKey) {
    this.listeners.forEach(fn => fn(key));
  }

  // ── Player ──
  getPlayerSlice(address: string): DataSlice<PlayerData> {
    return this.player.get(address.toLowerCase()) ?? emptySlice();
  }

  // 确保子合约地址已从链上加载（首次调用时触发，后续跳过）
  private async ensureReady() { await ensureAddresses(); }

  async fetchPlayer(address: string, force = false): Promise<PlayerData> {
    await this.ensureReady();
    const key = address.toLowerCase();
    const existing = this.player.get(key);
    if (existing && !force && existing.state === 'ready' && isFresh(existing.ts)) {
      return existing.data!;
    }

    this.player.set(key, { ...(existing ?? emptySlice()), state: existing?.data ? existing.state : 'loading', error: null });
    this.notify('player');

    try {
      const c = arena();
      const p = await c.getPlayer(address);
      const ach = BigInt(p.achievements);
      const data: PlayerData = {
        name: decodeBytes16(p.name),
        rating: Number(p.rating),
        coins: Number(p.coins),
        streak: Number(p.streak),
        season: Number(p.season),
        itemMask: BigInt(p.itemMask),
        equippedNameplate: Number(p.equippedNameplate),
        equippedBadge: Number((ach >> 248n) & 0xFFn),
        totalMatches: Number(p.totalMatches),
        wins: Number(p.wins),
        totalKills: Number(p.totalKills),
        achievements: ach,
        heroTokenId: Number(p.heroTokenId),
        scriptTokenId: Number(p.scriptTokenId),
      };
      this.player.set(key, { data, state: 'ready', error: null, ts: Date.now() });
      this.notify('player');
      return data;
    } catch (e: any) {
      this.player.set(key, { data: existing?.data ?? null, state: 'error', error: e.message, ts: Date.now() });
      this.notify('player');
      throw e;
    }
  }

  // ── Global Stats ──
  async fetchGlobalStats(force = false): Promise<GlobalStats> {
    await this.ensureReady();
    const existing = this.globalStats;
    if (!force && existing.state === 'ready' && isFresh(existing.ts)) {
      return existing.data!;
    }

    this.globalStats = { ...existing, state: existing.data ? existing.state : 'loading', error: null };
    this.notify('globalStats');

    try {
      const c = arena();
      const [total, king, record, season, paused, fee] = await Promise.all([
        c.totalPlayers(), c.streakKing(), c.streakRecord(),
        c.currentSeason(), c.paused(), c.entryFee(),
      ]);
      const data: GlobalStats = {
        totalPlayers: Number(total),
        streakKing: String(king),
        streakRecord: Number(record),
        currentSeason: Number(season),
        paused: Boolean(paused),
        entryFeePol: Number(ethers.formatEther(fee)),
      };
      this.globalStats = { data, state: 'ready', error: null, ts: Date.now() };
      this.notify('globalStats');
      return data;
    } catch (e: any) {
      this.globalStats = { data: existing.data, state: 'error', error: e.message, ts: Date.now() };
      this.notify('globalStats');
      throw e;
    }
  }

  // ── Leaderboard ──
  async fetchLeaderboard(force = false): Promise<LeaderboardEntry[]> {
    await this.ensureReady();
    const existing = this.leaderboard;
    if (!force && existing.state === 'ready' && isFresh(existing.ts)) {
      return existing.data!;
    }

    this.leaderboard = { ...existing, state: existing.data ? existing.state : 'loading', error: null };
    this.notify('leaderboard');

    try {
      const c = arena();
      const [addrs, ratings, seasons] = await c.getLeaderboard();
      const data: LeaderboardEntry[] = [];
      for (let i = 0; i < 32; i++) {
        if (addrs[i] === ethers.ZeroAddress) break;
        data.push({ address: String(addrs[i]), rating: Number(ratings[i]), season: Number(seasons[i]) });
      }
      this.leaderboard = { data, state: 'ready', error: null, ts: Date.now() };
      this.notify('leaderboard');
      return data;
    } catch (e: any) {
      this.leaderboard = { data: existing.data, state: 'error', error: e.message, ts: Date.now() };
      this.notify('leaderboard');
      throw e;
    }
  }

  // ── Lobster NFT (single) ──
  async fetchSingleLobster(tokenId: number, force = false): Promise<LobsterNFT> {
    const cached = this.lobsterCache.get(tokenId);
    if (cached && !force && isFresh(cached.ts, NFT_TTL)) return cached.data;

    const hub = lobsterHub();
    const [owner, stats, visual, rawName] = await Promise.all([
      hub.ownerOf(tokenId),
      hub.getLobsterStats(tokenId),
      hub.getLobsterVisual(tokenId),
      hub.getLobsterName(tokenId),
    ]);
    const s = unpackLobsterStats(BigInt(stats));
    const v = unpackLobsterVisual(BigInt(visual));
    const name = decodeBytes12(rawName);
    const data: LobsterNFT = { tokenId, owner: String(owner), ...s, ...v, name };
    this.lobsterCache.set(tokenId, { data, ts: Date.now() });
    return data;
  }

  // ── Owned Lobsters ──
  getLobsterSlice(address: string): DataSlice<LobsterNFT[]> {
    return this.lobsterNFTs.get(address.toLowerCase()) ?? emptySlice();
  }

  async fetchOwnedLobsters(ownerAddress: string, force = false): Promise<LobsterNFT[]> {
    await this.ensureReady();
    const key = ownerAddress.toLowerCase();
    const existing = this.lobsterNFTs.get(key);
    if (existing && !force && existing.state === 'ready' && isFresh(existing.ts, NFT_TTL)) {
      return existing.data!;
    }

    this.lobsterNFTs.set(key, { ...(existing ?? emptySlice()), state: existing?.data ? existing.state : 'loading', error: null });
    this.notify('lobsterNFTs');

    try {
      const hub = lobsterHub();
      // 两次 tokensOfOwnerPaged：系统默认 + 玩家自己
      const PAGE_LIMIT = 1000;
      const [defaultIds, myIds] = await Promise.all([
        hub.tokensOfOwnerPaged(ADDRESSES.LobsterHub, 0, PAGE_LIMIT),
        hub.tokensOfOwnerPaged(ownerAddress, 0, PAGE_LIMIT),
      ]);

      // 合并去重（玩家可能没有 NFT，默认的一定有）
      const allIds: number[] = [];
      for (const id of defaultIds) allIds.push(Number(id));
      for (const id of myIds) allIds.push(Number(id));

      const results = await Promise.all(allIds.map(id => this.fetchSingleLobster(id)));

      this.lobsterNFTs.set(key, { data: results, state: 'ready', error: null, ts: Date.now() });
      this.notify('lobsterNFTs');
      return results;
    } catch (e: any) {
      this.lobsterNFTs.set(key, { data: existing?.data ?? null, state: 'error', error: e.message, ts: Date.now() });
      this.notify('lobsterNFTs');
      throw e;
    }
  }

  // ── Owned Scripts ──
  getScriptSlice(address: string): DataSlice<ScriptNFT[]> {
    return this.scripts.get(address.toLowerCase()) ?? emptySlice();
  }

  async fetchOwnedScripts(ownerAddress: string, force = false): Promise<ScriptNFT[]> {
    await this.ensureReady();
    const key = ownerAddress.toLowerCase();
    const existing = this.scripts.get(key);
    if (existing && !force && existing.state === 'ready' && isFresh(existing.ts, NFT_TTL)) {
      return existing.data!;
    }

    this.scripts.set(key, { ...(existing ?? emptySlice()), state: existing?.data ? existing.state : 'loading', error: null });
    this.notify('scripts');

    try {
      const hub = scriptHub();
      // 两次 tokensOfOwnerPaged：系统默认 + 玩家自己
      const PAGE_LIMIT = 1000;
      const [defaultIds, myIds] = await Promise.all([
        hub.tokensOfOwnerPaged(ADDRESSES.ScriptHub, 0, PAGE_LIMIT),
        hub.tokensOfOwnerPaged(ownerAddress, 0, PAGE_LIMIT),
      ]);

      const results: ScriptNFT[] = [];
      const fetchName = async (id: bigint, isDefault: boolean) => {
        const tokenId = Number(id);
        const rawName = await hub.getScriptName(tokenId);
        const name = decodeBytes12(rawName);
        return { tokenId, isDefault, name } as ScriptNFT;
      };
      const promises = [
        ...Array.from(defaultIds).map((id: bigint) => fetchName(id, true)),
        ...Array.from(myIds).map((id: bigint) => fetchName(id, false)),
      ];
      results.push(...await Promise.all(promises));

      this.scripts.set(key, { data: results, state: 'ready', error: null, ts: Date.now() });
      const now = Date.now();
      for (const s of results) this.scriptCache.set(s.tokenId, { data: s, ts: now });
      this.notify('scripts');
      return results;
    } catch (e: any) {
      if (import.meta.env.DEV) console.error('[Scripts] fetchOwnedScripts error:', e);
      this.scripts.set(key, { data: existing?.data ?? null, state: 'error', error: e.message, ts: Date.now() });
      this.notify('scripts');
      throw e;
    }
  }

  // ── 单个脚本 NFT ──
  async fetchScriptNFT(tokenId: number): Promise<ScriptNFT> {
    await this.ensureReady();
    const cached = this.scriptCache.get(tokenId);
    if (cached && isFresh(cached.ts, NFT_TTL)) return cached.data;
    const hub = scriptHub();
    const [owner, rawName] = await Promise.all([
      hub.ownerOf(tokenId),
      hub.getScriptName(tokenId),
    ]);
    const isDefault = String(owner).toLowerCase() === ADDRESSES.ScriptHub.toLowerCase();
    const name = decodeBytes12(rawName);
    const data: ScriptNFT = { tokenId, isDefault, name };
    this.scriptCache.set(tokenId, { data, ts: Date.now() });
    return data;
  }

  // ── Match History ──

  getMatchHistorySlice(address: string) {
    return this.matchHistory.get(address.toLowerCase()) ?? { ...emptySlice<MatchResult[]>(), dirty: false };
  }

  markMatchHistoryDirty(address: string) {
    const key = address.toLowerCase();
    const existing = this.matchHistory.get(key);
    if (existing) {
      existing.dirty = true;
      this.matchHistory.set(key, existing);
    } else {
      this.matchHistory.set(key, { ...emptySlice<MatchResult[]>(), dirty: true });
    }
    this.notify('matchHistory');
  }

  async fetchMatchHistory(address: string, force = false): Promise<MatchResult[]> {
    await this.ensureReady();
    const key = address.toLowerCase();
    const existing = this.matchHistory.get(key);

    // If fresh and not dirty and not forced, return cached
    if (existing && !force && !existing.dirty && existing.state === 'ready' && existing.data) {
      return existing.data;
    }

    // Set loading state but keep existing data visible
    const prev = existing?.data ?? null;
    this.matchHistory.set(key, { data: prev, state: 'loading', error: null, ts: existing?.ts ?? 0, dirty: existing?.dirty ?? false });
    this.notify('matchHistory');

    try {
      const result = await fetchPlayerMatchHistory(address);
      this.matchHistory.set(key, { data: result.matches, state: 'ready', error: null, ts: Date.now(), dirty: false });
      this.notify('matchHistory');
      return result.matches;
    } catch (e: any) {
      this.matchHistory.set(key, { data: prev, state: 'error', error: e.message, ts: existing?.ts ?? 0, dirty: existing?.dirty ?? false });
      this.notify('matchHistory');
      return prev ?? [];
    }
  }
}

// ── Singleton ──
export const dataCenter = new DataCenter();

// ── 统一发送交易（estimateGas × 1.3 + gas price 交给 MetaMask）──

async function sendTx(
  contract: ethers.Contract,
  method: string,
  args: unknown[],
  value?: bigint,
): Promise<ethers.TransactionReceipt> {
  const fn = contract[method];
  const overrides: { value?: bigint; gasLimit?: bigint } = {};
  if (value != null && value > 0n) overrides.value = value;
  const estimated = await fn.estimateGas(...args, overrides);
  overrides.gasLimit = estimated * 15n / 10n;
  const tx = await fn(...args, overrides);
  return tx.wait();
}

/** 估算 playMatch gas 费用（BNB），用于 UI 显示 */
export async function estimateMatchGasCost(): Promise<string> {
  try {
    const provider = getReadProvider();
    const feeData = await provider.getFeeData();
    const effectivePrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 1_000_000n; // opBNB default ~0.001 gwei
    const estimatedGas = 8_000_000n;
    const costWei = estimatedGas * effectivePrice;
    const costBnb = Number(ethers.formatEther(costWei));
    if (costBnb < 0.00001) return '<0.00001';
    return costBnb.toFixed(5);
  } catch {
    return '0.00001';
  }
}

// ── 写入函数（不经过 DataCenter 状态管理）──

export async function playMatch(signer: ethers.Signer, heroTokenId: number, scriptTokenId: number, itemFlags = 0): Promise<MatchResult> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ARENA_ABI, signer);
  const fee = await c.entryFee();
  const freeTicket = (itemFlags & 1) !== 0;
  const value = freeTicket ? 0n : fee;
  const receipt = await sendTx(c, 'playMatch', [heroTokenId, scriptTokenId, itemFlags], value);
  // 从回执中解析 MatchCompleted 事件
  const iface = new ethers.Interface(ARENA_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === 'MatchCompleted') {
        const gasUsed = receipt.gasUsed.toString();
        const gasCostWei = receipt.gasUsed * receipt.gasPrice;
        const gasCostPol = ethers.formatEther(gasCostWei);
        return {
          seed: Number(parsed.args.seed),
          playerRank: Number(parsed.args.playerRank),
          ratingChange: Number(parsed.args.ratingChange),
          coinsEarned: Number(parsed.args.coinsEarned),
          players: parsed.args.players.map(String),
          heroTokenIds: parsed.args.heroTokenIds.map(Number),
          scriptTokenIds: parsed.args.scriptTokenIds.map(Number),
          replayHash: parsed.args.replayHash,
          gasUsed,
          gasCostPol,
        };
      }
    } catch { /* skip non-matching logs */ }
  }
  throw new Error('MatchCompleted event not found in receipt');
}

// ── 通过链表 + 单区块事件查询比赛记录 ──

interface MatchRecordRaw {
  id: number;
  blockNumber: number;
  playerPrevMatchId: number;
}

/** 通过 blockNumber 批量查事件，拿完整 MatchResult */
async function fetchMatchEventsByBlocks(records: MatchRecordRaw[]): Promise<MatchResult[]> {
  if (records.length === 0) return [];
  const c = arena();

  // 按 blockNumber 去重，每个区块只查一次
  const blockSet = [...new Set(records.map(r => r.blockNumber))];
  const eventsByBlock = new Map<number, any[]>();
  const tsMap = new Map<number, number>();
  const provider = getReadProvider();

  await Promise.all(blockSet.map(async (bn) => {
    try {
      const [events, block] = await Promise.all([
        c.queryFilter(c.filters.MatchCompleted(), bn, bn),
        provider.getBlock(bn),
      ]);
      eventsByBlock.set(bn, events);
      if (block) tsMap.set(bn, block.timestamp);
    } catch {
      eventsByBlock.set(bn, []);
    }
  }));

  // 每条 record 从对应区块的事件中匹配
  const results: MatchResult[] = [];
  for (const rec of records) {
    const events = eventsByBlock.get(rec.blockNumber) || [];
    // 通常一个区块只有一场比赛，如果有多场，取第一个匹配的
    const event = events.length === 1 ? events[0] : events.shift();
    if (event) {
      const args = (event as any).args;
      results.push({
        matchId: rec.id,
        seed: Number(args.seed),
        playerRank: Number(args.playerRank),
        ratingChange: Number(args.ratingChange),
        coinsEarned: Number(args.coinsEarned),
        players: args.players.map(String),
        heroTokenIds: args.heroTokenIds.map(Number),
        scriptTokenIds: args.scriptTokenIds.map(Number),
        replayHash: args.replayHash,
        timestamp: tsMap.get(rec.blockNumber) ?? 0,
      });
    }
  }
  return results;
}

/** 通过 matchId 获取单场比赛数据 */
export async function fetchMatchById(matchId: number): Promise<MatchResult | null> {
  const c = arena();
  const provider = getReadProvider();
  try {
    const rec = await c.matches(matchId);
    const bn = Number(rec.blockNumber);
    if (bn === 0) return null;
    const [events, block] = await Promise.all([
      c.queryFilter(c.filters.MatchCompleted(), bn, bn),
      provider.getBlock(bn),
    ]);
    if (events.length === 0) return null;
    const args = (events[0] as any).args;
    return {
      matchId,
      seed: Number(args.seed),
      playerRank: Number(args.playerRank),
      ratingChange: Number(args.ratingChange),
      coinsEarned: Number(args.coinsEarned),
      players: args.players.map(String),
      heroTokenIds: args.heroTokenIds.map(Number),
      scriptTokenIds: args.scriptTokenIds.map(Number),
      replayHash: args.replayHash,
      timestamp: block?.timestamp ?? 0,
    };
  } catch { return null; }
}

/** 查询玩家比赛历史（链表方式） */
export async function fetchPlayerMatchHistory(address: string, startId = 0, pageSize = 20): Promise<{ matches: MatchResult[]; nextId: number }> {
  const c = arena();
  try {
    const [ids, records] = await c.getPlayerMatchRecords(address, startId, pageSize);
    if (!ids || ids.length === 0) return { matches: [], nextId: 0 };

    const rawRecords: MatchRecordRaw[] = ids.map((id: any, i: number) => ({
      id: Number(id),
      blockNumber: Number(records[i].blockNumber),
      playerPrevMatchId: Number(records[i].playerPrevMatchId),
    }));

    const matches = await fetchMatchEventsByBlocks(rawRecords);
    const lastRecord = rawRecords[rawRecords.length - 1];
    return { matches, nextId: lastRecord ? lastRecord.playerPrevMatchId : 0 };
  } catch {
    return { matches: [], nextId: 0 };
  }
}

/** 查询全局比赛记录（admin 用，分页） */
export async function fetchAllMatches(page = 0, pageSize = 20): Promise<{ matches: MatchResult[]; total: number }> {
  const c = arena();
  const total = Number(await c.matchCount());
  if (total === 0) return { matches: [], total: 0 };

  const startId = Math.max(1, total - page * pageSize);
  const [ids, records] = await c.getMatchRecords(startId, pageSize);

  const rawRecords: MatchRecordRaw[] = ids.map((id: any, i: number) => ({
    id: Number(id),
    blockNumber: Number(records[i].blockNumber),
    playerPrevMatchId: Number(records[i].playerPrevMatchId),
  }));

  const matches = await fetchMatchEventsByBlocks(rawRecords);
  return { matches, total };
}

export async function buyItem(signer: ethers.Signer, itemId: number): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const receipt = await sendTx(c, 'buyItem', [itemId]);
  return receipt.hash;
}

// ── Admin / Profile 写入函数 ──

export async function setName(signer: ethers.Signer, name: string, feePol = 0): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const encoded = ethers.encodeBytes32String(name).slice(0, 34); // bytes16
  const value = feePol > 0 ? ethers.parseEther(String(feePol)) : undefined;
  const receipt = await sendTx(c, 'setName', [encoded], value);
  return receipt.hash;
}

export async function equipNameplate(signer: ethers.Signer, id: number): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const receipt = await sendTx(c, 'equipNameplate', [id]);
  return receipt.hash;
}

export async function equipBadge(signer: ethers.Signer, badge: number): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const receipt = await sendTx(c, 'equipBadge', [badge]);
  return receipt.hash;
}

/**
 * One-tx profile update: name + nameplate + badge.
 * nameplateId: >0 = equip, -1 = unequip, 0 = no change
 * badgeValue: >0 = equip, 0 = no change
 */
export async function updateProfile(
  signer: ethers.Signer,
  name: string | null,
  nameplateId: number,
  badgeValue: number,
  feePol = 0,
): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const encoded = name ? ethers.encodeBytes32String(name).slice(0, 34) : '0x00000000000000000000000000000000';
  const value = feePol > 0 ? ethers.parseEther(String(feePol)) : undefined;
  const receipt = await sendTx(c, 'updateProfile', [encoded, nameplateId, badgeValue], value);
  return receipt.hash;
}

export async function pauseArena(signer: ethers.Signer): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ARENA_ADMIN_ABI, signer);
  const receipt = await sendTx(c, 'pause', []);
  return receipt.hash;
}

export async function unpauseArena(signer: ethers.Signer): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ARENA_ADMIN_ABI, signer);
  const receipt = await sendTx(c, 'unpause', []);
  return receipt.hash;
}

export async function endSeason(signer: ethers.Signer): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer);
  const receipt = await sendTx(c, 'endSeason', []);
  return receipt.hash;
}

/// 玩家铸造龙虾 NFT（1000 金币 + 0.001 BNB），返回新 tokenId
export async function mintLobsterNFT(signer: ethers.Signer, name: string): Promise<number> {
  const c = new ethers.Contract(ADDRESSES.LobsterHub, LOBSTER_ABI, signer);
  const encoded = ethers.encodeBytes32String(name).slice(0, 26); // bytes12
  const mintValue = ethers.parseEther('0.001');
  const receipt = await sendTx(c, 'mint', [encoded], mintValue);
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  const log = receipt.logs.find((l: any) => l.topics[0] === transferTopic);
  if (log) return Number(BigInt(log.topics[3]));
  return -1;
}

/// 玩家铸造脚本 NFT（100 金币 + 0.001 BNB）
export async function mintScriptNFT(signer: ethers.Signer, name: string, scriptBytes: Uint8Array): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ScriptHub, SCRIPT_ABI, signer);
  const encodedName = ethers.encodeBytes32String(name).slice(0, 26); // bytes12
  const mintValue = ethers.parseEther('0.001');
  const receipt = await sendTx(c, 'mintScript', [encodedName, scriptBytes], mintValue);
  return receipt.hash;
}

/// 管理员铸造默认龙虾（owner=合约）
export async function mintDefaultLobster(signer: ethers.Signer, name: string, packedStats: bigint, packedVisual: bigint): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.LobsterHub, LOBSTER_ABI, signer);
  const encoded = ethers.encodeBytes32String(name).slice(0, 26); // bytes12
  const receipt = await sendTx(c, 'mintDefaultLobster', [encoded, packedStats, packedVisual]);
  return receipt.hash;
}

/// 管理员铸造默认脚本（owner=合约）
export async function mintDefaultScript(signer: ethers.Signer, name: string, scriptBytes: Uint8Array): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ScriptHub, SCRIPT_ABI, signer);
  const encoded = ethers.encodeBytes32String(name).slice(0, 26); // bytes12
  const receipt = await sendTx(c, 'mintDefaultScript', [encoded, scriptBytes]);
  return receipt.hash;
}

/// 添加默认玩家到对手池
export async function addDefaultPlayer(signer: ethers.Signer, name: string, heroTokenId: number, scriptTokenId: number): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ARENA_ADMIN_ABI, signer);
  const encoded = ethers.encodeBytes32String(name).slice(0, 26); // bytes12
  const receipt = await sendTx(c, 'addDefaultPlayer', [encoded, heroTokenId, scriptTokenId]);
  return receipt.hash;
}

/// 测试用：给玩家加金币
export async function addCoins(signer: ethers.Signer, address: string, amount: number): Promise<string> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ['function addCoins(address,uint256) external'], signer);
  const receipt = await sendTx(c, 'addCoins', [address, amount]);
  return receipt.hash;
}

export async function getOwner(): Promise<string> {
  const c = arena();
  return String(await c.owner());
}

/// 获取某段位池的所有玩家地址
export async function fetchPool(tier: number): Promise<{ addresses: string[]; head: number }> {
  const c = new ethers.Contract(ADDRESSES.ClawArena, ['function getPool(uint8) view returns (address[],uint8)'], getReadProvider());
  const [addrs, head] = await c.getPool(tier);
  return { addresses: addrs.map(String), head: Number(head) };
}

export async function fetchScriptBytes(tokenId: number): Promise<Uint8Array> {
  const hub = scriptHub();
  const bytes = await hub.getScriptBytes(tokenId);
  return ethers.getBytes(bytes);
}

export async function fetchScriptName(tokenId: number): Promise<string> {
  const hub = scriptHub();
  const raw = await hub.getScriptName(tokenId);
  return decodeBytes12(raw);
}

// ── 龙虾序列帧缓存（LRU，最多 50 条，防止内存无限增长）──
import { generateSprites, type SpriteSet } from '../game/spriteCache';
const SPRITE_CACHE_MAX = 50;
const spriteCache = new Map<number, SpriteSet>();

/** 根据 NFT tokenId 获取序列帧（有缓存直接返回，没有就加载 NFT → 生成 → 缓存） */
export async function fetchLobsterSprites(tokenId: number): Promise<SpriteSet> {
  const cached = spriteCache.get(tokenId);
  if (cached) {
    // LRU: 移到末尾
    spriteCache.delete(tokenId);
    spriteCache.set(tokenId, cached);
    return cached;
  }
  const nft = await fetchLobsterNFT(tokenId);
  const sprites = await generateSprites(nft);
  if (spriteCache.size >= SPRITE_CACHE_MAX) {
    // 淘汰最老的
    const oldest = spriteCache.keys().next().value;
    if (oldest !== undefined) spriteCache.delete(oldest);
  }
  spriteCache.set(tokenId, sprites);
  return sprites;
}

// ── 工具 ──

function decodeBytes16(hex: string): string {
  try {
    const clean = hex.replace(/0+$/, '');
    if (clean === '0x' || clean === '') return '';
    const bytes = ethers.getBytes(hex);
    return new TextDecoder().decode(bytes).replace(/\0/g, '');
  } catch { return ''; }
}

// ── Legacy 兼容：保留旧的 subscribe/fetch 导出 ──
// （逐步迁移到 dataCenter 后可删除）

export function subscribe(fn: () => void) {
  return dataCenter.subscribe(() => fn());
}

export async function fetchPlayer(address: string, force = false) {
  return dataCenter.fetchPlayer(address, force);
}
export async function fetchGlobalStats(force = false) {
  return dataCenter.fetchGlobalStats(force);
}
export async function fetchLeaderboard(force = false) {
  return dataCenter.fetchLeaderboard(force);
}
export async function fetchLobsterNFT(tokenId: number, force = false): Promise<LobsterNFT> {
  return dataCenter.fetchSingleLobster(tokenId, force);
}
export async function fetchOwnedLobsters(ownerAddress: string, force = false) {
  return dataCenter.fetchOwnedLobsters(ownerAddress, force);
}
export async function fetchOwnedScripts(ownerAddress: string) {
  return dataCenter.fetchOwnedScripts(ownerAddress);
}
export async function fetchScriptNFT(tokenId: number): Promise<ScriptNFT> {
  return dataCenter.fetchScriptNFT(tokenId);
}
