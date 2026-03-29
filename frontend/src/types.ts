/**
 * 核心类型定义 — 全局共享
 */

export interface PlayerData {
  address: string;
  name: string;
  rating: number;
  coins: number;
  streak: number;
  season: number;
  itemMask: string;
  equippedNameplate: number;
  totalMatches: number;
  wins: number;
  totalKills: number;
  achievements: string;
  badge: number;
  heroId: number;
  script: { slots: unknown[]; rules: unknown[] } | null;
}

export interface RankInfo {
  rankId: string;
  rankName: string;
  tier: number;
  tierName: string;
  displayName: string;
  color: string;
  rating: number;
}

export interface MatchEvent {
  version?: number;    // engine version for replay compatibility
  seed: number;
  heroIds: number[];
  players: string[];
  isPlayer: boolean[];
  scripts: unknown[];
  customScripts?: Map<number, number[]>; // slotIndex → raw bytes for scriptId=255 players
  itemFlags: number;
  rankings: RankingEntry[];
  events: EngineEvent[];
  turn: number;
  replayHash?: string; // keccak256 from on-chain MatchPlayed event
}

export interface RankingEntry {
  idx: number;
  heroId: number;
  alive: boolean;
  deathTurn: number;
  exp: number;
  kills: number;
  firstBlood: boolean;
  hp: number;
  hpMax: number;
  atk: number;
  def: number;
  atkRange: number;
  vision: number;
  x: number;
  y: number;
  rank?: number;
}

export interface EngineEvent {
  type: string;
  turn: number;
  attacker?: number;
  defender?: number;
  damage?: number;
  targetHp?: number;
  killer?: number;
  victim?: number;
  exp?: number;
  healed?: number;
  kills?: number;
  entity?: number;
  label?: string;
  x?: number;
  y?: number;
  radius?: number;
  exposure?: number;
  blinkCooldown?: number;
  mana?: number;
  frozen?: boolean;
  caster?: number;
  heroId?: number;
  targets?: Array<{ idx: number; damage: number; hp: number; splash?: boolean; frozen?: boolean; exposure?: number }>;
  order?: number[];
}

export interface SettlementResult {
  rank12: number;
  rank8: number;
  kills: number;
  firstBlood: boolean;
  ratingChange: number;
  coinsEarned: number;
  oldRating: number;
  newRating: number;
  oldStreak: number;
  newStreak: number;
  oldRank: RankInfo;
  newRank: RankInfo;
}

export interface NameplateInfo {
  id: number;
  name: string;
  desc?: string;
  price?: number;
  season: boolean;
  owned: boolean;
  equipped: boolean;
}

export interface ShopItem {
  id: number;
  name: string;
  price: number;
  desc?: string;
  owned: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  rating: number;
  season: number;
  rankInfo: RankInfo;
}

export interface MatchRecord {
  seed: number;
  roomId: string;
  heroId: number;
  rank12: number;
  rank8: number;
  kills: number;
  firstBlood: boolean;
  ratingChange: number;
  coinsEarned: number;
  newRating: number;
  streak: number;
  turn: number;
  timestamp: number;
}

// PlayerBrief and RoomStatus removed in v4
