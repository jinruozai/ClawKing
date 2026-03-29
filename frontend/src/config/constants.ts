// ── 游戏常量（与合约 Constants.sol 一致）──
export const MAP_SIZE = 15;
export const MAP_HALF = 7;
export const PLAYERS_PER_MATCH = 8;
export const MAX_TURNS = 40;
export const ENTRY_FEE_POL = 0.001;      // 0.001 BNB per match
export const NAME_FEE_POL = 0.002;       // 0.002 BNB rename fee
export const MINT_LOBSTER_COINS = 1000;  // 龙虾铸造金币费用
export const MINT_SCRIPT_COINS = 100;    // 脚本铸造金币费用
export const MINT_BNB = 0.001;           // NFT 铸造 BNB 费用（龙虾/脚本统一）

// ── 战斗常量（与合约 Constants.sol 一致）──
export const DEFEND_REDUCE_PCT = 20;    // 防御减伤 20%
export const DEFEND_HEAL_PCT = 5;       // 防御回血 5% maxHP（至少1）
export const ATTACK_EXP = 2;            // 攻击 +2 经验
export const KILL_EXP_PCT = 60;         // 击杀获得对方 60% 经验
export const KILL_HEAL_PCT = 50;        // 击杀回复 50% 缺失血量
export const EXPOSURE_MAX = 5;          // 破绽上限
export const EXPOSURE_DMG_PCT = 20;     // 每点破绽受伤 +20%
export const EXPOSURE_ATK_PCT = 10;     // 每点破绽伤害 -10%
export const RANGE_DECAY_PCT = 20;      // 每远1格伤害 -20%
export const BLINK_RANGE = 3;           // 闪现距离
export const BLINK_COOLDOWN = 7;        // 闪现冷却
export const EXP_PER_LEVEL = 10;        // 基础升级经验
export const POINTS_PER_LEVEL = 5;      // 每级 +5 属性点

// ── 引擎常量 ──
// Poison ring
export const RING_START_RADIUS = 12;
export const RING_SHRINK_INTERVAL = 3;
export const RING_DMG_DIVISOR = 5;

// Spawn points (radius 6, 8 angles: 0, 45, 90, ..., 315 degrees)
export const SPAWN_X = [6, 4, 0, -4, -6, -4, 0, 4];
export const SPAWN_Y = [0, 4, 6, 4, 0, -4, -6, -4];

// ── 道具（与合约 Constants.sol 一致）──
export const ITEM_ENTRY_TICKET = 64;
export const ITEM_RANK_SHIELD = 65;
export const ITEM_RATING_BOOST = 66;
export const ITEM_COIN_BOOST = 67;

export const SHOP_ITEMS = [
  { id: ITEM_ENTRY_TICKET, price: 2000 },
  { id: ITEM_RANK_SHIELD,  price: 800 },
  { id: ITEM_RATING_BOOST, price: 500 },
  { id: ITEM_COIN_BOOST,   price: 50 },
];

// 铭牌商品（33-42）
export const NAMEPLATE_BASE_PRICE = 500;
export const NAMEPLATE_STEP_PRICE = 300;
export const NAMEPLATE_IDS = Array.from({ length: 10 }, (_, i) => ({
  id: 33 + i,
  price: NAMEPLATE_BASE_PRICE + i * NAMEPLATE_STEP_PRICE,
}));

// ── 段位 ──
export const RANKS = [
  { id: 'little-lobster',  color: '#cd7f32', min: 0,   max: 99 },
  { id: 'big-lobster',     color: '#c0c0c0', min: 100, max: 199 },
  { id: 'lobster-soldier', color: '#ffd700', min: 200, max: 299 },
  { id: 'lobster-general', color: '#00cec9', min: 300, max: 399 },
  { id: 'divine-lobster',  color: '#6c5ce7', min: 400, max: 499 },
  { id: 'lobster-king',    color: '#e84393', min: 500, max: 599 },
  { id: 'lobster-emperor', color: '#ff3838', min: 600, max: Infinity },
] as const;

// ── 属性（与合约 LobsterHub 一致）──
export const ATTR_INIT = [10, 1, 1, 0, 3, 1]; // hp, atk, range, speed, mana, skillPower
export const ATTR_CAP  = [30, 10, 3, 5, 3, 9];
export const ATTR_COST = [1, 1, 3, 1, -1, 1]; // 射程cost=3, 蓝量cost=-1(返还1点), 其余1
export const ATTR_NAMES = ['HP', 'ATK', 'Range', 'Speed', 'Mana', 'Skill Power'];
export const FREE_POINTS = 12;
export const NAME_MAX_LEN = 12;

// ── 技能效果 bit → i18n key 映射 ──
export const SKILL_EFFECT_BITS: { bit: number; key: string; type: 'debuff' | 'buff' }[] = [
  { bit: 0x0001, key: 'immobilize', type: 'debuff' },
  { bit: 0x0002, key: 'disarm', type: 'debuff' },
  { bit: 0x0004, key: 'blind', type: 'debuff' },
  { bit: 0x0008, key: 'silence', type: 'debuff' },
  { bit: 0x0010, key: 'lifesteal', type: 'buff' },
  { bit: 0x0020, key: 'vigor', type: 'buff' },
  { bit: 0x0040, key: 'execute', type: 'buff' },
  { bit: 0x0080, key: 'manaBurn', type: 'buff' },
  { bit: 0x0100, key: 'stealth', type: 'buff' },
  { bit: 0x0200, key: 'thorns', type: 'buff' },
  { bit: 0x0400, key: 'critical', type: 'buff' },
  { bit: 0x0800, key: 'cleanse', type: 'buff' },
  { bit: 0x1000, key: 'haste', type: 'buff' },
];