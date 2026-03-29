/**
 * Engine data constants — v4 版本
 * 替代老项目的 engine/data.js，所有英雄数据来自链上 NFT
 */

export const PLAYERS_PER_MATCH = 8;
export const PLAYER_SLOTS = 8;

// Script system constants
export const MAX_SLOTS = 8;
export const MAX_RULES = 16;
export const MAX_CONDITIONS = 4;

// Default hero names (matches DefaultData.sol order, 12 heroes)
export const DEFAULT_HERO_NAMES = [
  'Iron Claw', 'Rock Lobs', 'Ghost Shr', 'Blood Cla',
  'Executr', 'Thorn Shr', 'Crit Lobs', 'Blue Flam',
  'Arctic Sh', 'Vent Shr', 'Hermit Sh', 'Lucky Shr',
];

// Default script names (matches DefaultData.sol order, 12 scripts, 1:1 with heroes)
export const DEFAULT_SCRIPT_NAMES = [
  'IronClaw', 'RockLobs', 'GhostShr', 'BloodCla',
  'Executr', 'ThornShr', 'CritLobs', 'BlueFlam',
  'ArcticSh', 'VentShr', 'HermitSh', 'LuckyShr',
];

/** Placeholder: script builders not needed in v4 (scripts are on-chain NFTs) */
export interface EngineScript { slots: unknown[]; rules: unknown[] }
export const SCRIPT_BUILDERS: Array<() => EngineScript> = [];
export const SCRIPT_BUILDERS_MAP: Record<string, () => EngineScript> = {};
