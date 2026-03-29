// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// ── 地图 ──
uint8 constant MAP_SIZE              = 15;
int8  constant MAP_HALF              = 7;

// ── 比赛 ──
uint8 constant PLAYERS_PER_MATCH     = 8;
uint8 constant MAX_TURNS             = 40;

// ── 脚本 ──
uint8 constant MAX_RULES             = 16;
uint8 constant MAX_SLOTS             = 8;
uint8 constant MAX_CONDITIONS        = 4;

// ── 毒圈 ──
uint8 constant RING_START_RADIUS     = 12;
uint8 constant RING_SHRINK_INTERVAL  = 3;
uint8 constant RING_DMG_DIVISOR      = 5;

// ── 战斗 ──
uint8 constant DEFEND_REDUCE_PCT     = 20;
uint8 constant DEFEND_HEAL_PCT       = 5;
uint8 constant ATTACK_EXP            = 2;
uint8 constant KILL_EXP_PCT          = 60;
uint8 constant KILL_EXP_MIN          = 10;
uint8 constant KILL_HEAL_PCT         = 50;

// ── 升级 ──
uint8 constant EXP_PER_LEVEL         = 10;
uint8 constant EXP_LEVEL_STEP        = 5;
uint8 constant POINTS_PER_LEVEL      = 5;

// ── 暴露度 ──
uint8 constant EXPOSURE_MAX          = 5;
uint8 constant EXPOSURE_DMG_PCT      = 20;   // 每点破绽受伤 +20%
uint8 constant EXPOSURE_ATK_PCT      = 10;   // 每点破绽伤害 -10%

// ── 距离伤害衰减 ──
uint8 constant RANGE_DECAY_PCT       = 20;   // 每远1格伤害减 20%（距离1=100%, 2=80%, 3=60%, 4=40%）

// ── 闪现 ──
uint8 constant BLINK_RANGE           = 3;
uint8 constant BLINK_COOLDOWN        = 7;

// ── 费用 ──
uint256 constant ENTRY_FEE            = 0.001 ether; // 0.001 BNB on opBNB

// ── 道具 ID ──
uint8 constant ITEM_ENTRY_TICKET     = 64;
uint8 constant ITEM_RANK_SHIELD      = 65;
uint8 constant ITEM_RATING_BOOST     = 66;
uint8 constant ITEM_COIN_BOOST       = 67;

// ── 商店价格（龙虾币）──
uint256 constant PRICE_ENTRY_TICKET   = 2000;
uint256 constant PRICE_RANK_SHIELD    = 800;
uint256 constant PRICE_RATING_BOOST   = 500;
uint256 constant PRICE_COIN_BOOST     = 50;

// ── 结算 ──
int16  constant FIRSTBLOOD_BONUS     = 10;
uint8 constant KILL_BONUS_THRESHOLD  = 2;
int16  constant KILL_BONUS_PER_KILL  = 5;
uint8 constant BOOST_MULTIPLIER_PCT  = 150;
uint8 constant ANTI_BOOST_SMOOTHING  = 50;
uint8 constant ANTI_BOOST_GAIN_MIN   = 20;
uint8 constant ANTI_BOOST_GAIN_MAX   = 150;
uint8 constant ANTI_BOOST_LOSS_MIN   = 50;
uint8 constant ANTI_BOOST_LOSS_MAX   = 200;
uint8 constant TIER_DIVISOR          = 100;

// ── 排行榜 ──
uint8 constant LEADERBOARD_SIZE      = 32;

// ── 技能公式 ──
uint8 constant SKILL_RATIO           = 10;
uint8 constant SKILL_RATIO_CRITICAL  = 10;
uint8 constant SKILL_RATIO_LIFESTEAL = 5;
uint8 constant SKILL_RATIO_VIGOR     = 10;
uint8 constant SKILL_RATIO_EXECUTE   = 10;
uint8 constant SKILL_RATIO_MANA_BURN = 5;
uint8 constant SKILL_RATIO_THORNS    = 6;

// ── 出生点 ──
uint8 constant SPAWN_RADIUS          = 6;

// ── Actions ──
uint8 constant ACTION_IDLE           = 0;
uint8 constant ACTION_DEFEND         = 1;
uint8 constant ACTION_ATTACK         = 2;
uint8 constant ACTION_MOVE           = 3;
uint8 constant ACTION_BLINK          = 4;

// ACTION_MOVE / ACTION_BLINK 的 actionArg
uint8 constant MOVE_TOWARD           = 0;
uint8 constant MOVE_AWAY             = 1;
uint8 constant DIR_UP                = 2;
uint8 constant DIR_DOWN              = 3;
uint8 constant DIR_LEFT              = 4;
uint8 constant DIR_RIGHT             = 5;
uint8 constant DIR_CENTER            = 6;

// ── statusFlags uint16 ──
uint16 constant STATUS_IMMOBILIZE    = 0x0001;
uint16 constant STATUS_DISARM        = 0x0002;
uint16 constant STATUS_BLIND         = 0x0004;
uint16 constant STATUS_SILENCE       = 0x0008;
uint16 constant STATUS_STEALTH       = 0x0100;
uint16 constant STATUS_THORNS        = 0x0200;
uint16 constant STATUS_STUN          = STATUS_IMMOBILIZE | STATUS_DISARM;
uint16 constant STATUS_DEBUFF_MASK   = 0x00FF;
uint16 constant STATUS_BUFF_MASK     = 0xFF00;

// ── skillEffect bitmask ──
uint16 constant SKILL_LIFESTEAL      = 0x0010;
uint16 constant SKILL_VIGOR          = 0x0020;
uint16 constant SKILL_EXECUTE        = 0x0040;
uint16 constant SKILL_MANA_BURN      = 0x0080;
uint16 constant SKILL_STEALTH        = STATUS_STEALTH;   // 0x0100
uint16 constant SKILL_THORNS         = STATUS_THORNS;    // 0x0200
uint16 constant SKILL_CRITICAL       = 0x0400;
uint16 constant SKILL_CLEANSE        = 0x0800;
uint16 constant SKILL_HASTE          = 0x1000;
uint16 constant SKILL_DEBUFF_MASK    = 0x000F;
uint16 constant SKILL_BUFF_MASK      = SKILL_STEALTH | SKILL_THORNS;

// ── 脚本 Subject ──
uint8 constant SUB_SELF              = 0;
uint8 constant SUB_GAME              = 1;
uint8 constant SUB_T0                = 2;
uint8 constant SUB_T7                = 9;
uint8 constant SUB_LAST_ATK          = 12;
uint8 constant SUB_LAST_TGT          = 13;
uint8 constant SUB_LAST_BLOCKED      = 14;
uint8 constant SUB_CONSTANT          = 255;

// ── 脚本 Comparison ──
uint8 constant CMP_SKIP              = 0;
uint8 constant CMP_EQ                = 1;
uint8 constant CMP_NEQ               = 2;
uint8 constant CMP_GT                = 3;
uint8 constant CMP_GTE               = 4;
uint8 constant CMP_LT                = 5;
uint8 constant CMP_LTE               = 6;

// ── 脚本 Arithmetic ──
uint8 constant ARITH_NONE            = 0;
uint8 constant ARITH_ADD             = 1;
uint8 constant ARITH_SUB             = 2;
uint8 constant ARITH_MUL             = 3;

// ── 脚本 Property ──
uint8 constant PROP_HP               = 0;
uint8 constant PROP_HP_MAX           = 1;
uint8 constant PROP_HP_PCT           = 2;
uint8 constant PROP_ATK              = 3;
uint8 constant PROP_ATK_RANGE        = 4;
uint8 constant PROP_X                = 5;
uint8 constant PROP_Y                = 6;
uint8 constant PROP_DIST             = 7;
uint8 constant PROP_RING_DIST        = 8;
uint8 constant PROP_EXP              = 9;
uint8 constant PROP_KILLS            = 10;
uint8 constant PROP_EXPOSURE         = 11;
uint8 constant PROP_LAST_ACTION      = 12;
uint8 constant PROP_MP               = 13;
uint8 constant PROP_MP_MAX           = 14;
uint8 constant PROP_TURNS_TO_SKILL   = 15;
uint8 constant PROP_DMG_TO           = 16;
uint8 constant PROP_DMG_FROM         = 17;
uint8 constant PROP_HITS_TO_KILL     = 18;
uint8 constant PROP_HITS_TO_DIE      = 19;
uint8 constant PROP_KILL_EXP         = 20;
uint8 constant PROP_DEBUFF           = 21;
uint8 constant PROP_STEALTH          = 22;
uint8 constant PROP_BLINK_CD         = 23;
uint8 constant PROP_VISIBLE_COUNT    = 24;
uint8 constant PROP_THREAT_COUNT     = 25;
uint8 constant PROP_POWER            = 26;

// ── 游戏全局属性 ──
uint8 constant GPROP_TURN            = 0;
uint8 constant GPROP_ALIVE_COUNT     = 1;
uint8 constant GPROP_RING_RADIUS     = 2;
uint8 constant GPROP_MAP_SIZE        = 3;

// ── 对手池 ──
uint16 constant POOL_SIZE            = 256;

// ── 其他 ──
uint8 constant RANK_COUNT            = PLAYERS_PER_MATCH - 1;
uint8 constant NO_TARGET             = 255;
uint8 constant ENGINE_VERSION        = 2;
