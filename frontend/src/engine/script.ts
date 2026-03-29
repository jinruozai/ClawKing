// ── Script interpreter (matches ScriptLib.sol exactly) ──

import type { Entity, ScriptResult } from './types.ts';
import { manhattan } from './entity.ts';
import { PLAYERS_PER_MATCH } from '../config/constants.ts';

// ── Constants (from Constants.sol) ──
const MAX_SLOTS = 8;
const MAX_CONDITIONS = 4;
const MAX_RULES = 16;

const SLOT_SIZE = 8;
const COND_SIZE = 11;
const RULE_SIZE = 47; // 4 * COND_SIZE + 3

const SLOT_UNCOMPUTED = 254;
const NO_TARGET = 255;

const ACTION_DEFEND = 1;

// Subject
const SUB_SELF = 0;
const SUB_GAME = 1;
const SUB_T0 = 2;
const SUB_T7 = 9;
const SUB_LAST_ATK = 12;
const SUB_LAST_TGT = 13;
const SUB_LAST_BLOCKED = 14;
const SUB_CONSTANT = 255;

// Comparison
const CMP_SKIP = 0;
const CMP_EQ = 1;
const CMP_NEQ = 2;
const CMP_GT = 3;
const CMP_GTE = 4;
const CMP_LT = 5;
const CMP_LTE = 6;

// Arithmetic
const ARITH_NONE = 0;
const ARITH_ADD = 1;
const ARITH_SUB = 2;
const ARITH_MUL = 3;

// Property
const PROP_HP = 0;
const PROP_HP_MAX = 1;
const PROP_HP_PCT = 2;
const PROP_ATK = 3;
const PROP_ATK_RANGE = 4;
const PROP_X = 5;
const PROP_Y = 6;
const PROP_DIST = 7;
const PROP_RING_DIST = 8;
const PROP_EXP = 9;
const PROP_KILLS = 10;
const PROP_EXPOSURE = 11;
const PROP_LAST_ACTION = 12;
const PROP_MP = 13;
const PROP_MP_MAX = 14;
const PROP_TURNS_TO_SKILL = 15;
const PROP_DMG_TO = 16;
const PROP_DMG_FROM = 17;
const PROP_HITS_TO_KILL = 18;
const PROP_HITS_TO_DIE = 19;
const PROP_KILL_EXP = 20;
const PROP_DEBUFF = 21;
const PROP_STEALTH = 22;
const PROP_BLINK_CD = 23;
const PROP_VISIBLE_COUNT = 24;
const PROP_THREAT_COUNT = 25;
const PROP_POWER = 26;

const GPROP_TURN = 0;
const GPROP_ALIVE_COUNT = 1;
const GPROP_RING_RADIUS = 2;
const GPROP_MAP_SIZE = 3;

// Status flags
const STATUS_BLIND = 0x0004;
const STATUS_STEALTH = 0x0100;
const STATUS_DEBUFF_MASK = 0x00FF;

// Combat constants used in estimation
const EXPOSURE_DMG_PCT = 20;
const DEFEND_REDUCE_PCT = 20;
const KILL_EXP_PCT = 60;
const KILL_EXP_MIN = 10;
const MAP_SIZE = 15;

interface ScriptCtx {
  selfIdx: number;
  turn: number;
  aliveCount: number;
  ringRadius: number;
  numSlots: number;
  visCount: number;
}

/** Execute AI script. Returns action/actionArg/targetIdx. */
export function executeScript(
  selfIdx: number,
  ents: Entity[],
  script: Uint8Array,
  turn: number,
  aliveCount: number,
  ringRadius: number,
): ScriptResult {
  const result: ScriptResult = {
    action: ACTION_DEFEND,
    actionArg: 0,
    targetIdx: NO_TARGET,
  };

  if (script.length === 0) return result;

  let numSlots = script[0];
  if (numSlots > MAX_SLOTS) numSlots = MAX_SLOTS;
  const rulesOffset = 1 + numSlots * SLOT_SIZE;
  if (rulesOffset >= script.length) return result;
  let numRules = script[rulesOffset];
  if (numRules === 0) return result;
  if (numRules > MAX_RULES) numRules = MAX_RULES;
  const rulesStart = rulesOffset + 1;

  // Visible enemies (computed once)
  const visIndices: number[] = [];
  getVisibleIndices(selfIdx, ents, visIndices);
  const visCount = visIndices.length;

  // Lazy slot cache
  const slotCache = new Array<number>(MAX_SLOTS).fill(SLOT_UNCOMPUTED);

  const ctx: ScriptCtx = {
    selfIdx,
    turn,
    aliveCount,
    ringRadius,
    numSlots,
    visCount,
  };

  // Evaluate rules
  for (let ri = 0; ri < numRules; ri++) {
    const ruleBase = rulesStart + ri * RULE_SIZE;
    if (ruleBase + RULE_SIZE > script.length) break;

    if (!evalRule(ruleBase, ents, script, visIndices, slotCache, ctx)) continue;

    // Rule matched
    const ab = ruleBase + MAX_CONDITIONS * COND_SIZE;
    result.action = script[ab];
    result.actionArg = script[ab + 1];
    result.targetIdx = resolveSubjectIdx(script[ab + 2], ents, script, visIndices, slotCache, ctx);
    return result;
  }

  return result;
}

function getVisibleIndices(selfIdx: number, ents: Entity[], out: number[]): void {
  const self = ents[selfIdx];
  const myRange = self.atkRange;
  const amBlind = (self.statusFlags & STATUS_BLIND) !== 0;

  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    if (i === selfIdx) continue;
    const other = ents[i];
    if (!other.alive) continue;
    if (amBlind) continue;
    if ((other.statusFlags & STATUS_STEALTH) !== 0) continue;
    const dist = manhattan(self, other);
    if (dist <= myRange + other.exposure) {
      out.push(i);
    }
  }
}

function evalRule(
  ruleBase: number,
  ents: Entity[],
  script: Uint8Array,
  visIndices: number[],
  slotCache: number[],
  ctx: ScriptCtx,
): boolean {
  for (let ci = 0; ci < MAX_CONDITIONS; ci++) {
    const cb = ruleBase + ci * COND_SIZE;
    const cmp = script[cb + 5];
    if (cmp === CMP_SKIP) continue;

    const lRes = getSideValue(script[cb], script[cb + 1], script[cb + 2], readInt16(script, cb + 3), ents, script, visIndices, slotCache, ctx);
    if (!lRes.ok) return false;

    const rRes = getSideValue(script[cb + 6], script[cb + 7], script[cb + 8], readInt16(script, cb + 9), ents, script, visIndices, slotCache, ctx);
    if (!rRes.ok) return false;

    if (!cmpOp(cmp, lRes.value, rRes.value)) return false;
  }
  return true;
}

function getSideValue(
  sub: number, prop: number, op: number, val: number,
  ents: Entity[], script: Uint8Array,
  visIndices: number[], slotCache: number[],
  ctx: ScriptCtx,
): { value: number; ok: boolean } {
  if (sub === SUB_CONSTANT) return { value: val, ok: true };
  if (sub === SUB_GAME) return { value: arith(op, getGameProp(prop, ctx), val), ok: true };

  const entIdx = resolveSubjectIdx(sub, ents, script, visIndices, slotCache, ctx);
  if (entIdx === NO_TARGET) return { value: 0, ok: false };

  const pv = getProp(prop, entIdx, ents, visIndices, ctx);
  return { value: arith(op, pv, val), ok: true };
}

function resolveSubjectIdx(
  sub: number,
  ents: Entity[],
  script: Uint8Array,
  visIndices: number[],
  slotCache: number[],
  ctx: ScriptCtx,
): number {
  if (sub === SUB_SELF) return ctx.selfIdx;

  if (sub >= SUB_T0 && sub <= SUB_T7) {
    const si = sub - SUB_T0;
    if (si >= ctx.numSlots) return NO_TARGET;
    if (slotCache[si] === SLOT_UNCOMPUTED) {
      slotCache[si] = computeSlot(si, ents, script, visIndices, ctx);
    }
    return slotCache[si];
  }

  if (sub === SUB_LAST_ATK) {
    const lai = ents[ctx.selfIdx].lastAtkIdx;
    if (lai >= PLAYERS_PER_MATCH) return NO_TARGET;
    if (!ents[lai].alive) return NO_TARGET;
    return lai;
  }

  if (sub === SUB_LAST_TGT) {
    const lti = ents[ctx.selfIdx].lastTgtIdx;
    if (lti >= PLAYERS_PER_MATCH) return NO_TARGET;
    if (!ents[lti].alive) return NO_TARGET;
    return lti;
  }

  if (sub === SUB_LAST_BLOCKED) {
    const lbi = ents[ctx.selfIdx].lastBlockedBy;
    if (lbi >= PLAYERS_PER_MATCH) return NO_TARGET;
    if (!ents[lbi].alive) return NO_TARGET;
    return lbi;
  }

  return NO_TARGET;
}

function computeSlot(
  slotIdx: number,
  ents: Entity[],
  script: Uint8Array,
  visIndices: number[],
  ctx: ScriptCtx,
): number {
  if (ctx.visCount === 0) return NO_TARGET;

  const sb = 1 + slotIdx * SLOT_SIZE;
  const sortBy = script[sb];
  const order = script[sb + 1];
  const filterProp = script[sb + 2];
  const filterOp = script[sb + 3];

  let bestIdx = NO_TARGET;
  let bestVal = order === 0 ? 32767 : -32768; // int16 max/min

  for (let vi = 0; vi < ctx.visCount; vi++) {
    const eidx = visIndices[vi];

    // Apply filter
    if (filterOp !== CMP_SKIP) {
      const fLeft = getProp(filterProp, eidx, ents, visIndices, ctx);
      const fRight = getFilterRight(script[sb + 4], script[sb + 5], readInt16(script, sb + 6), ents, visIndices, ctx);
      if (!cmpOp(filterOp, fLeft, fRight)) continue;
    }

    const sv = getProp(sortBy, eidx, ents, visIndices, ctx);

    if (bestIdx === NO_TARGET) {
      bestIdx = eidx;
      bestVal = sv;
    } else {
      const better = order === 0 ? sv < bestVal : sv > bestVal;
      if (better) {
        bestIdx = eidx;
        bestVal = sv;
      }
    }
  }

  return bestIdx;
}

function getFilterRight(
  sub: number, prop: number, val: number,
  ents: Entity[], visIndices: number[], ctx: ScriptCtx,
): number {
  if (sub === SUB_CONSTANT) return val;
  if (sub === SUB_GAME) return getGameProp(prop, ctx);
  if (sub === SUB_SELF) return getProp(prop, ctx.selfIdx, ents, visIndices, ctx);
  return val;
}

function getProp(
  prop: number, entIdx: number,
  ents: Entity[], visIndices: number[],
  ctx: ScriptCtx,
): number {
  const e = ents[entIdx];
  const self = ents[ctx.selfIdx];

  switch (prop) {
    case PROP_HP: return e.currentHp;
    case PROP_HP_MAX: return e.hp;
    case PROP_HP_PCT: {
      if (e.hp === 0) return 0;
      if (e.currentHp <= 0) return 0;
      return Math.trunc(e.currentHp * 100 / e.hp);
    }
    case PROP_ATK: return e.atk;
    case PROP_ATK_RANGE: return e.atkRange;
    case PROP_X: return e.x;
    case PROP_Y: return e.y;
    case PROP_DIST: return manhattan(self, e);
    case PROP_RING_DIST: return ringDist(e, ctx.ringRadius);
    case PROP_EXP: return e.exp;
    case PROP_KILLS: return e.kills;
    case PROP_EXPOSURE: return e.exposure;
    case PROP_LAST_ACTION: return e.lastAction;
    case PROP_MP: return e.mana;
    case PROP_MP_MAX: return e.manaMax;
    case PROP_TURNS_TO_SKILL: return e.manaMax > e.mana ? e.manaMax - e.mana : 0;
    case PROP_DMG_TO: return estimateDmg(self, e);
    case PROP_DMG_FROM: return estimateDmg(e, self);
    case PROP_HITS_TO_KILL: return hitsNeeded(self, e);
    case PROP_HITS_TO_DIE: return hitsNeeded(e, self);
    case PROP_KILL_EXP: {
      const r = Math.trunc(e.exp * KILL_EXP_PCT / 100);
      return r < KILL_EXP_MIN ? KILL_EXP_MIN : r;
    }
    case PROP_DEBUFF: return e.statusFlags & STATUS_DEBUFF_MASK;
    case PROP_STEALTH: return (e.statusFlags & STATUS_STEALTH) !== 0 ? 1 : 0;
    case PROP_BLINK_CD: return e.blinkCooldown;
    case PROP_VISIBLE_COUNT: return ctx.visCount;
    case PROP_THREAT_COUNT: return countThreats(entIdx, ents);
    case PROP_POWER: {
      if (e.currentHp <= 0) return 0;
      return Math.trunc(e.currentHp * e.atk / 10);
    }
    default: return 0;
  }
}

function getGameProp(prop: number, ctx: ScriptCtx): number {
  switch (prop) {
    case GPROP_TURN: return ctx.turn;
    case GPROP_ALIVE_COUNT: return ctx.aliveCount;
    case GPROP_RING_RADIUS: return ctx.ringRadius;
    case GPROP_MAP_SIZE: return MAP_SIZE;
    default: return 0;
  }
}

function cmpOp(op: number, a: number, b: number): boolean {
  switch (op) {
    case CMP_EQ: return a === b;
    case CMP_NEQ: return a !== b;
    case CMP_GT: return a > b;
    case CMP_GTE: return a >= b;
    case CMP_LT: return a < b;
    case CMP_LTE: return a <= b;
    default: return false;
  }
}

/** Wrap result to int16 range [-32768, 32767], matching Solidity unchecked int16. */
function toInt16(v: number): number {
  v = v & 0xFFFF;
  return v >= 0x8000 ? v - 0x10000 : v;
}

function arith(op: number, base: number, val: number): number {
  switch (op) {
    case ARITH_NONE: return base;
    case ARITH_ADD: return toInt16(base + val);
    case ARITH_SUB: return toInt16(base - val);
    case ARITH_MUL: return toInt16(base * val);
    default: return base;
  }
}

function ringDist(e: Entity, ringRadius: number): number {
  const ax = Math.abs(e.x);
  const ay = Math.abs(e.y);
  const cheb = ax > ay ? ax : ay;
  return ringRadius - cheb;
}

function estimateDmg(attacker: Entity, target: Entity): number {
  const atk = attacker.atk;
  const exp_ = target.exposure;
  let dmg = Math.trunc(atk * (100 + exp_ * EXPOSURE_DMG_PCT) / 100);
  if (target.lastAction === ACTION_DEFEND) {
    dmg = Math.trunc(dmg * (100 - DEFEND_REDUCE_PCT) / 100);
  }
  if (dmg < 1) dmg = 1;
  return dmg;
}

function hitsNeeded(attacker: Entity, target: Entity): number {
  const dmg = estimateDmg(attacker, target);
  if (dmg <= 0) return 127;
  const hp = target.currentHp;
  if (hp <= 0) return 0;
  return Math.trunc((hp + dmg - 1) / dmg);
}

function countThreats(entIdx: number, ents: Entity[]): number {
  const e = ents[entIdx];
  let count = 0;
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    if (i === entIdx) continue;
    const other = ents[i];
    if (!other.alive) continue;
    if ((other.statusFlags & STATUS_BLIND) !== 0) continue;
    if ((e.statusFlags & STATUS_STEALTH) !== 0) continue;
    const dist = manhattan(e, other);
    if (dist <= other.atkRange + e.exposure) {
      count++;
    }
  }
  return count;
}

function readInt16(script: Uint8Array, offset: number): number {
  // Big-endian int16, matching Solidity: (uint8 << 8) | uint8, then interpret as int16
  const raw = (script[offset] << 8) | script[offset + 1];
  // Convert uint16 to int16
  return raw >= 0x8000 ? raw - 0x10000 : raw;
}

// Re-export ACTION_DEFEND for use in other modules
export { ACTION_DEFEND };
