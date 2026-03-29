/**
 * 成就徽章定义 — 统一数据源
 *
 * bit: 成就位编号 (achievements uint256 中的 bit index)
 * badge value = bit + 1 (0 表示不佩戴)
 * nameKey / desc: i18n message key
 */
import type { MessageKey } from '../i18n';

export interface BadgeDef {
  bit: number;
  nameKey: MessageKey;
  icon: string;
  desc: MessageKey;
}

export const BADGE_DEFS: BadgeDef[] = [
  // 场次 (bit 0-2)
  { bit: 0,   nameKey: 'badge.name.0',   icon: '🎯', desc: 'badge.desc.0' },
  { bit: 1,   nameKey: 'badge.name.1',   icon: '⚔️', desc: 'badge.desc.1' },
  { bit: 2,   nameKey: 'badge.name.2',   icon: '👑', desc: 'badge.desc.2' },
  // 单场表现 (bit 3-7)
  { bit: 3,   nameKey: 'badge.name.3',   icon: '🩸', desc: 'badge.desc.3' },
  { bit: 4,   nameKey: 'badge.name.4',   icon: '💀', desc: 'badge.desc.4' },
  { bit: 5,   nameKey: 'badge.name.5',   icon: '☠️', desc: 'badge.desc.5' },
  { bit: 6,   nameKey: 'badge.name.6',   icon: '🏆', desc: 'badge.desc.6' },
  { bit: 7,   nameKey: 'badge.name.7',   icon: '🐔', desc: 'badge.desc.7' },
  // 连胜 (bit 8-10)
  { bit: 8,   nameKey: 'badge.name.8',   icon: '🔥', desc: 'badge.desc.8' },
  { bit: 9,   nameKey: 'badge.name.9',   icon: '🔥', desc: 'badge.desc.9' },
  { bit: 10,  nameKey: 'badge.name.10',  icon: '💎', desc: 'badge.desc.10' },
  // 击杀里程碑 (bit 13-15)
  { bit: 13,  nameKey: 'badge.name.13',  icon: '🗡️', desc: 'badge.desc.13' },
  { bit: 14,  nameKey: 'badge.name.14',  icon: '💀', desc: 'badge.desc.14' },
  { bit: 15,  nameKey: 'badge.name.15',  icon: '☠️', desc: 'badge.desc.15' },
  // 胜利里程碑 (bit 16-18)
  { bit: 16,  nameKey: 'badge.name.16',  icon: '🎉', desc: 'badge.desc.16' },
  { bit: 17,  nameKey: 'badge.name.17',  icon: '🏅', desc: 'badge.desc.17' },
  { bit: 18,  nameKey: 'badge.name.18',  icon: '⚡', desc: 'badge.desc.18' },
  // 段位成就 (bit 200-206)
  { bit: 200, nameKey: 'badge.name.200', icon: '🦐', desc: 'badge.desc.200' },
  { bit: 201, nameKey: 'badge.name.201', icon: '🦞', desc: 'badge.desc.201' },
  { bit: 202, nameKey: 'badge.name.202', icon: '⚔️', desc: 'badge.desc.202' },
  { bit: 203, nameKey: 'badge.name.203', icon: '🎖️', desc: 'badge.desc.203' },
  { bit: 204, nameKey: 'badge.name.204', icon: '✨', desc: 'badge.desc.204' },
  { bit: 205, nameKey: 'badge.name.205', icon: '👑', desc: 'badge.desc.205' },
  { bit: 206, nameKey: 'badge.name.206', icon: '♛', desc: 'badge.desc.206' },
];

/** bit → BadgeDef 快速查找 */
export const BADGE_BY_BIT: Record<number, BadgeDef> = Object.fromEntries(
  BADGE_DEFS.map(b => [b.bit, b])
);

/** 检查 BigInt 成就位掩码中某 bit 是否已解锁 */
export function hasAchBit(achStr: string, bit: number): boolean {
  try { return (BigInt(achStr || '0') >> BigInt(bit) & 1n) === 1n; }
  catch { return false; }
}
