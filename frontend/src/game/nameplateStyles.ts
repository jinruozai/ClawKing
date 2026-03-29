/**
 * nameplateStyles — Shared nameplate visual definitions
 *
 * Two mappings for different rendering contexts:
 * - NAMEPLATE_STYLES: Tailwind CSS classes for UI elements (buttons, badges)
 * - NAMEPLATE_THEME: RGBA color values for card glow/background effects (LobsterCard)
 */

// ── Tailwind class-based styles (used in App.tsx for buttons/badges) ──

export const NAMEPLATE_STYLES: Record<number, string> = {
  // Season nameplates (bits 1-4: S1, 5-8: S2, ...; 0=no nameplate)
  1: 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/50',
  2: 'bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border-purple-500/50',
  3: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50',
  4: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50',
  5: 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 border-pink-500/50',
  // Shop nameplates (33-42, shifted +1)
  33: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/50',
  34: 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-500/50',
  35: 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 border-violet-500/50',
  36: 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border-sky-500/50',
  37: 'bg-gradient-to-r from-slate-500/20 to-zinc-500/20 border-slate-500/50',
  38: 'bg-gradient-to-r from-stone-500/20 to-gray-500/20 border-stone-500/50',
  39: 'bg-gradient-to-r from-amber-500/25 to-yellow-400/25 border-amber-400/60',
  40: 'bg-gradient-to-r from-rose-500/25 to-pink-400/25 border-rose-400/60',
  41: 'bg-gradient-to-r from-violet-600/40 via-fuchsia-500/40 to-purple-600/40 border-2 border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.5),inset_0_0_30px_rgba(139,92,246,0.15)]',
  42: 'bg-gradient-to-r from-yellow-500/45 via-orange-500/45 to-red-500/45 border-2 border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.6),0_0_48px_rgba(234,88,12,0.25),inset_0_0_30px_rgba(234,179,8,0.15)]',
};

// ── RGBA color-based theme (used in LobsterCard for glow/background effects) ──

export interface CardTheme { bg: string; glowFrom: string; glowTo: string }

export const NAMEPLATE_THEME: Record<number, CardTheme> = {
  // Season 1: bits 1-4 (Champion / 2nd / 3rd / Top 32)
  1:  { bg: 'rgba(234,179,8,0.08)',   glowFrom: 'rgba(234,179,8,0.3)',   glowTo: 'rgba(168,85,247,0.3)' },   // S1 Champion
  2:  { bg: 'rgba(148,163,184,0.08)', glowFrom: 'rgba(148,163,184,0.3)', glowTo: 'rgba(100,116,139,0.3)' },  // S1 2nd
  3:  { bg: 'rgba(217,119,6,0.08)',   glowFrom: 'rgba(217,119,6,0.3)',   glowTo: 'rgba(234,88,12,0.3)' },    // S1 3rd
  4:  { bg: 'rgba(6,182,212,0.06)',   glowFrom: 'rgba(6,182,212,0.25)',  glowTo: 'rgba(6,182,212,0.15)' },   // S1 Top 32
  // Season 2: bits 5-8
  5:  { bg: 'rgba(20,184,166,0.06)',  glowFrom: 'rgba(20,184,166,0.25)', glowTo: 'rgba(20,184,166,0.15)' },  // S2 Champion
  6:  { bg: 'rgba(14,165,233,0.06)',  glowFrom: 'rgba(14,165,233,0.2)',  glowTo: 'rgba(14,165,233,0.1)' },   // S2 2nd
  32: { bg: 'rgba(14,165,233,0.05)',  glowFrom: 'rgba(14,165,233,0.15)', glowTo: 'rgba(14,165,233,0.1)' },   // Ocean Wave
  33: { bg: 'rgba(244,63,94,0.05)',   glowFrom: 'rgba(244,63,94,0.15)',  glowTo: 'rgba(244,63,94,0.1)' },    // Flame Crest
  34: { bg: 'rgba(34,197,94,0.06)',   glowFrom: 'rgba(34,197,94,0.2)',   glowTo: 'rgba(34,197,94,0.1)' },    // Shadow Mark
  35: { bg: 'rgba(20,184,166,0.06)',  glowFrom: 'rgba(20,184,166,0.2)',  glowTo: 'rgba(20,184,166,0.1)' },   // Crystal Shard
  36: { bg: 'rgba(132,204,22,0.06)',  glowFrom: 'rgba(132,204,22,0.2)',  glowTo: 'rgba(132,204,22,0.1)' },   // Storm Sigil
  37: { bg: 'rgba(59,130,246,0.07)',  glowFrom: 'rgba(59,130,246,0.25)', glowTo: 'rgba(59,130,246,0.15)' },  // Iron Badge
  38: { bg: 'rgba(139,92,246,0.08)',  glowFrom: 'rgba(139,92,246,0.3)',  glowTo: 'rgba(168,85,247,0.2)' },   // Golden Crown
  39: { bg: 'rgba(245,158,11,0.10)',  glowFrom: 'rgba(245,158,11,0.35)', glowTo: 'rgba(234,179,8,0.2)' },   // Golden Harvest
  40: { bg: 'rgba(244,63,94,0.10)',   glowFrom: 'rgba(244,63,94,0.35)',  glowTo: 'rgba(236,72,153,0.2)' },   // Rose Bloom
  41: { bg: 'rgba(139,92,246,0.12)',  glowFrom: 'rgba(139,92,246,0.45)', glowTo: 'rgba(168,85,247,0.35)' },  // Violet Storm
  42: { bg: 'rgba(234,179,8,0.15)',   glowFrom: 'rgba(234,179,8,0.55)',  glowTo: 'rgba(249,115,22,0.4)' },   // Solar Crown
};

export const DEFAULT_CARD_THEME: CardTheme = {
  bg: 'rgba(20,20,20,0.15)',
  glowFrom: 'rgba(30,30,30,0.08)',
  glowTo: 'rgba(15,15,15,0.06)',
};
