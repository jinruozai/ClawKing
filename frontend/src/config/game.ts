// ── 默认名字 ──
export function defaultName(address: string): string {
  return address ? 'Claw' + address.slice(-4) : '???';
}

/** 龙虾显示名：i18n翻译（默认12只）→ NFT链上名 → fallback */
export function lobsterDisplayName(tokenId: number, nftName?: string): string {
  const key = `hero.name.${tokenId}`;
  const translated = t(key as any);
  if (translated !== key) return translated;
  return nftName || `#${tokenId}`;
}

/** 脚本显示名：i18n翻译（默认12个）→ NFT链上名 → fallback */
export function scriptDisplayName(tokenId: number, nftName?: string): string {
  const key = `script.name.${tokenId}`;
  const translated = t(key as any);
  if (translated !== key) return translated;
  return nftName || `Script #${tokenId}`;
}

import { t } from '../i18n';

// ── 导入常量 ──
import {
  RANKS as _RANKS,
  MAP_SIZE, MAP_HALF, PLAYERS_PER_MATCH, MAX_TURNS, ENTRY_FEE_POL, NAME_FEE_POL,
  RING_START_RADIUS, RING_SHRINK_INTERVAL, RING_DMG_DIVISOR, SPAWN_X, SPAWN_Y,
  ITEM_ENTRY_TICKET, ITEM_RANK_SHIELD, ITEM_RATING_BOOST, ITEM_COIN_BOOST,
  SHOP_ITEMS, NAMEPLATE_BASE_PRICE, NAMEPLATE_STEP_PRICE, NAMEPLATE_IDS,
  ATTR_INIT, ATTR_CAP, ATTR_NAMES, FREE_POINTS, NAME_MAX_LEN,
  SKILL_EFFECT_BITS
} from './constants';

// 重新导出供外部使用
export {
  MAP_SIZE, MAP_HALF, PLAYERS_PER_MATCH, MAX_TURNS, ENTRY_FEE_POL, NAME_FEE_POL,
  RING_START_RADIUS, RING_SHRINK_INTERVAL, RING_DMG_DIVISOR, SPAWN_X, SPAWN_Y,
  ITEM_ENTRY_TICKET, ITEM_RANK_SHIELD, ITEM_RATING_BOOST, ITEM_COIN_BOOST,
  SHOP_ITEMS, NAMEPLATE_BASE_PRICE, NAMEPLATE_STEP_PRICE, NAMEPLATE_IDS,
  _RANKS as RANKS, ATTR_INIT, ATTR_CAP, ATTR_NAMES, FREE_POINTS, NAME_MAX_LEN,
  SKILL_EFFECT_BITS
};

export function getRankInfo(rating: number) {
  const rank = _RANKS.find(r => rating >= r.min && rating <= r.max) ?? _RANKS[0];
  const tier = Math.min(Math.floor((rating - rank.min) / 20) + 1, 5);
  return { ...rank, tier, tierName: ['V', 'IV', 'III', 'II', 'I'][tier - 1] ?? 'V' };
}

// ── NFT 属性解包 ──
export function unpackLobsterStats(packed: bigint) {
  return {
    hp:          Number(packed & 0xFFn),
    atk:         Number((packed >> 8n) & 0xFFn),
    atkRange:    Number((packed >> 16n) & 0xFFn),
    speed:       Number((packed >> 24n) & 0xFFn),
    manaMax:     Number((packed >> 32n) & 0xFFn),
    skillEffect: Number((packed >> 40n) & 0xFFFFn),
    skillPower:  Number((packed >> 56n) & 0xFFn),
  };
}

/** 解包 7×RGB 视觉数据 (21 bytes) */
export function unpackLobsterVisual(packed: bigint) {
  const rgb = (offset: number): [number, number, number] => [
    Number((packed >> BigInt(offset * 8)) & 0xFFn),
    Number((packed >> BigInt((offset + 1) * 8)) & 0xFFn),
    Number((packed >> BigInt((offset + 2) * 8)) & 0xFFn),
  ];
  return {
    shell: rgb(0),   // 甲壳
    claw:  rgb(3),   // 钳子
    leg:   rgb(6),   // 腿
    eye:   rgb(9),   // 眼睛
    tail:  rgb(12),  // 尾巴
    aura:  rgb(15),  // 须子
    sub:   rgb(18),  // 全局辅色
  };
}

function decodeBytes12(val: bigint): string {
  const bytes = [];
  for (let i = 0; i < 12; i++) {
    const b = Number((val >> BigInt(i * 8)) & 0xFFn);
    if (b === 0) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes);
}

/** 解析 skillEffect uint16 → 技能效果列表 */
export function parseSkillEffects(skillEffect: number): { key: string; type: 'debuff' | 'buff' }[] {
  return SKILL_EFFECT_BITS.filter(e => (skillEffect & e.bit) !== 0);
}

// ── 从 hue 派生颜色（兼容旧格式，用于还未迁移到 RGB 的地方） ──
export function hueToColors(primaryHue: number, secondaryHue: number) {
  const h1 = Math.round(primaryHue * 360 / 256);
  const h2 = Math.round(secondaryHue * 360 / 256);
  return {
    coreColors: [`hsl(${h1},70%,45%)`, `hsl(${h1},70%,30%)`, `hsl(${h1},70%,15%)`] as [string, string, string],
    highlightColors: [`hsl(${h1},80%,60%)`, `hsl(${h1},70%,40%)`] as [string, string],
    clawColors: [`hsl(${h2},70%,45%)`, `hsl(${h2},70%,25%)`] as [string, string],
    neonAntenna: `hsl(${h1},90%,60%)`,
    neonEye: '#00f3ff',
    innerCutout: `hsl(${h1},50%,8%)`,
    carapaceInner: `hsl(${h1},60%,20%)`,
  };
}
