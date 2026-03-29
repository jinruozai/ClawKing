/**
 * useData -- 统一数据 hooks，订阅 DataCenter
 *
 * 每个 hook 返回 { data, state, error, refresh }
 * state 来自 DataCenter，不是 hook 本地状态
 */
import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  dataCenter,
  type DataState,
  type PlayerData,
  type GlobalStats,
  type LeaderboardEntry,
  type LobsterNFT,
  type ScriptNFT,
  type MatchResult,
} from '../services/dataStore';

// ── 通用返回类型 ──
export interface DataResult<T> {
  data: T | null;
  state: DataState;
  error: string | null;
  loading: boolean;    // convenience: state === 'loading'
  refresh: () => void;
}

// ── 内部: 订阅 DataCenter 特定 key 的变更 ──
function useDataCenterKey(key: string) {
  // 每次 DataCenter notify 对应 key 时，触发组件重渲染
  const versionRef = useRef(0);
  const subscribe = useCallback((onStoreChange: () => void) => {
    return dataCenter.subscribe((changedKey) => {
      if (changedKey === key) {
        versionRef.current++;
        onStoreChange();
      }
    });
  }, [key]);
  const getSnapshot = useCallback(() => versionRef.current, []);
  useSyncExternalStore(subscribe, getSnapshot);
}

// ── 自动定时刷新 ──
function useInterval(callback: () => void, intervalMs: number, enabled: boolean) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

// ── 玩家数据 ──
export function usePlayer(address: string | null): DataResult<PlayerData> {
  useDataCenterKey('player');

  const slice = address ? dataCenter.getPlayerSlice(address) : null;

  const refresh = useCallback(() => {
    if (address) dataCenter.fetchPlayer(address, true).catch(() => {});
  }, [address]);

  // 初始加载
  useEffect(() => {
    if (address) dataCenter.fetchPlayer(address).catch(() => {});
  }, [address]);

  // 定时刷新
  useInterval(refresh, 10_000, !!address);

  const st = slice?.state ?? 'idle';
  return {
    data: slice?.data ?? null,
    state: st,
    error: slice?.error ?? null,
    loading: st === 'loading',
    refresh,
  };
}

// ── 全局统计 ──
export function useGlobalStats(): DataResult<GlobalStats> {
  useDataCenterKey('globalStats');

  const slice = dataCenter.globalStats;

  const refresh = useCallback(() => {
    dataCenter.fetchGlobalStats(true).catch(() => {});
  }, []);

  useEffect(() => { dataCenter.fetchGlobalStats().catch(() => {}); }, []);
  useInterval(refresh, 15_000, true);

  return {
    data: slice.data,
    state: slice.state,
    error: slice.error,
    loading: slice.state === 'loading',
    refresh,
  };
}

// ── 排行榜 ──
export function useLeaderboard(): DataResult<LeaderboardEntry[]> {
  useDataCenterKey('leaderboard');

  const slice = dataCenter.leaderboard;

  const refresh = useCallback(() => {
    dataCenter.fetchLeaderboard(true).catch(() => {});
  }, []);

  useEffect(() => { dataCenter.fetchLeaderboard().catch(() => {}); }, []);
  useInterval(refresh, 30_000, true);

  return {
    data: slice.data,
    state: slice.state,
    error: slice.error,
    loading: slice.state === 'loading',
    refresh,
  };
}

// ── 玩家拥有的龙虾 NFT ──
export function useOwnedLobsters(address: string | null): DataResult<LobsterNFT[]> {
  useDataCenterKey('lobsterNFTs');

  const slice = address ? dataCenter.getLobsterSlice(address) : null;

  const refresh = useCallback(() => {
    if (address) dataCenter.fetchOwnedLobsters(address, true).catch(() => {});
  }, [address]);

  useEffect(() => {
    if (address) dataCenter.fetchOwnedLobsters(address).catch(() => {});
  }, [address]);

  const lst = slice?.state ?? 'idle';
  return {
    data: slice?.data ?? null,
    state: lst,
    error: slice?.error ?? null,
    loading: lst === 'loading',
    refresh,
  };
}

// ── 玩家拥有的脚本 NFT ──
export function useOwnedScripts(address: string | null): DataResult<ScriptNFT[]> {
  useDataCenterKey('scripts');

  const slice = address ? dataCenter.getScriptSlice(address) : null;

  const refresh = useCallback(() => {
    if (address) dataCenter.fetchOwnedScripts(address, true).catch(() => {});
  }, [address]);

  useEffect(() => {
    if (address) dataCenter.fetchOwnedScripts(address).catch(() => {});
  }, [address]);

  const sst = slice?.state ?? 'idle';
  return {
    data: slice?.data ?? null,
    state: sst,
    error: slice?.error ?? null,
    loading: sst === 'loading',
    refresh,
  };
}

// ── 比赛记录 ──
export function useMatchHistory(address: string | null): DataResult<MatchResult[]> & { dirty: boolean } {
  useDataCenterKey('matchHistory');

  const slice = address ? dataCenter.getMatchHistorySlice(address) : null;

  const refresh = useCallback(() => {
    if (address) dataCenter.fetchMatchHistory(address, true).catch(() => {});
  }, [address]);

  // 首次加载或面板打开时触发
  useEffect(() => {
    if (address) dataCenter.fetchMatchHistory(address).catch(() => {});
  }, [address]);

  const st = slice?.state ?? 'idle';
  return {
    data: slice?.data ?? null,
    state: st,
    error: slice?.error ?? null,
    loading: st === 'loading',
    dirty: slice?.dirty ?? false,
    refresh,
  };
}
