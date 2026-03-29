/**
 * scriptLabels — shared label/name mappings for script display
 *
 * Uses i18n for translations. Functions rebuild on each call to get current language.
 * Must match Constants.sol definitions exactly.
 */
import { t } from '../i18n';

// SUB subjects
export function SUB_NAMES(): Record<number, string> {
  return {
    0: t('sl.self'), 1: t('sl.game'),
    2: 'T0', 3: 'T1', 4: 'T2', 5: 'T3', 6: 'T4', 7: 'T5', 8: 'T6', 9: 'T7', 10: 'T8', 11: 'T9',
    12: t('sl.lastAttacker'), 13: t('sl.lastTarget'),
    255: t('sl.const'),
  };
}

// Entity properties — must match Constants.sol PROP_* exactly
export function PROP_NAMES(): Record<number, string> {
  return {
    0: t('sl.hp'),            // PROP_HP
    1: t('sl.maxHp'),         // PROP_HP_MAX
    2: t('sl.hpPct'),         // PROP_HP_PCT
    3: t('sl.atk'),           // PROP_ATK
    4: t('sl.atkRange'),      // PROP_ATK_RANGE
    5: 'X',                   // PROP_X
    6: 'Y',                   // PROP_Y
    7: t('sl.dist'),          // PROP_DIST
    8: t('sl.ringDist'),      // PROP_RING_DIST
    9: t('sl.exp'),           // PROP_EXP
    10: t('sl.kills'),        // PROP_KILLS
    11: t('sl.exposure'),     // PROP_EXPOSURE
    12: t('sl.lastAction'),   // PROP_LAST_ACTION
    13: t('sl.mp'),           // PROP_MP
    14: t('sl.maxMp'),        // PROP_MP_MAX
    15: t('sl.turnsToSkill'), // PROP_TURNS_TO_SKILL
    16: t('sl.dmgTo'),        // PROP_DMG_TO
    17: t('sl.dmgFrom'),      // PROP_DMG_FROM
    18: t('sl.hitsToKill'),   // PROP_HITS_TO_KILL
    19: t('sl.hitsToDie'),    // PROP_HITS_TO_DIE
    20: t('sl.killExp'),      // PROP_KILL_EXP
    21: t('sl.debuff'),       // PROP_DEBUFF
    22: t('sl.stealth'),      // PROP_STEALTH
    23: t('sl.blinkCd'),      // PROP_BLINK_CD
    24: t('sl.visibleCount'), // PROP_VISIBLE_COUNT
    25: t('sl.threatCount'),  // PROP_THREAT_COUNT
    26: t('sl.power'),        // PROP_POWER
  };
}

// Game properties
export function GPROP_NAMES(): Record<number, string> {
  return { 0: t('sl.turn'), 1: t('sl.aliveCount'), 2: t('sl.ringRadius'), 3: t('sl.mapSize') };
}

// Comparison operators — no translation needed
export const OP_SYMBOLS: Record<number, string> = { 0: '-', 1: '=', 2: '≠', 3: '>', 4: '≥', 5: '<', 6: '≤' };

// Actions — must match Constants.sol ACTION_* exactly
export function ACTION_NAMES(): Record<number, string> {
  return { 0: t('sl.idle'), 1: t('sl.defend'), 2: t('sl.attack'), 3: t('sl.move'), 4: t('sl.blink') };
}

// Action targets
export function ATARGET_NAMES(): Record<number, string> {
  return {
    2: 'T0', 3: 'T1', 4: 'T2', 5: 'T3', 6: 'T4', 7: 'T5', 8: 'T6', 9: 'T7',
    12: t('sl.lastAtk'), 13: t('sl.lastTgt'), 14: t('sl.lastBlocked'),
  };
}

// MOVE/BLINK actionArg — must match Constants.sol MOVE_*/DIR_* exactly
export function MOVE_ARG_NAMES(): Record<number, string> {
  return {
    0: t('sl.toward'),        // MOVE_TOWARD
    1: t('sl.away'),          // MOVE_AWAY
    2: t('sl.dirUp'),         // DIR_UP
    3: t('sl.dirDown'),       // DIR_DOWN
    4: t('sl.dirLeft'),       // DIR_LEFT
    5: t('sl.dirRight'),      // DIR_RIGHT
    6: t('sl.dirCenter'),     // DIR_CENTER
  };
}

export function SORT_NAMES(): Record<number, string> { return PROP_NAMES(); }
