// ── Combat system (matches GameLib.sol damage/skill logic) ──

import type { Entity, GameEvent } from './types.ts';
import { manhattan } from './entity.ts';
import { PLAYERS_PER_MATCH } from '../config/constants.ts';

// ── Constants (from Constants.sol) ──
const EXPOSURE_MAX = 5;
const EXPOSURE_DMG_PCT = 20;  // 每点破绽受伤 +20%
const EXPOSURE_ATK_PCT = 10;  // 每点破绽伤害 -10%
const DEFEND_REDUCE_PCT = 20;
const RANGE_DECAY_PCT = 20;   // 每远1格伤害减20%
const DEFEND_HEAL_PCT = 5;
const ATTACK_EXP = 2;
const KILL_EXP_PCT = 60;
const KILL_EXP_MIN = 10;
const KILL_HEAL_PCT = 50;
const EXP_PER_LEVEL = 10;
const EXP_LEVEL_STEP = 5;
const POINTS_PER_LEVEL = 5;
const ACTION_DEFEND = 1;

// Skill ratios
const SKILL_RATIO = 10;
const SKILL_RATIO_CRITICAL = 10;
const SKILL_RATIO_LIFESTEAL = 5;
const SKILL_RATIO_VIGOR = 10;
const SKILL_RATIO_EXECUTE = 10;
const SKILL_RATIO_MANA_BURN = 5;
const SKILL_RATIO_THORNS = 6;

// Skill effect bits
const SKILL_LIFESTEAL = 0x0010;
const SKILL_VIGOR = 0x0020;
const SKILL_EXECUTE = 0x0040;
const SKILL_MANA_BURN = 0x0080;
const SKILL_STEALTH = 0x0100;
const SKILL_THORNS = 0x0200;
const SKILL_CRITICAL = 0x0400;
const SKILL_CLEANSE = 0x0800;
const SKILL_HASTE = 0x1000;
const SKILL_DEBUFF_MASK = 0x000F;
const SKILL_BUFF_MASK = SKILL_STEALTH | SKILL_THORNS;

// Status flags
const STATUS_STEALTH = 0x0100;
const STATUS_THORNS = 0x0200;
const STATUS_DISARM = 0x0002;
const STATUS_SILENCE = 0x0008;
const STATUS_BUFF_MASK = 0xFF00;

const ACTION_IDLE = 0;

/** Calculate level from exp (matches _calcLevel in GameLib.sol) */
export function calcLevel(exp: number): number {
  let level = 0;
  let threshold = EXP_PER_LEVEL;
  let remaining = exp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level++;
    threshold += EXP_LEVEL_STEP;
  }
  return level;
}

/** Check and apply level up. Mutates entity. Returns events. */
export function checkLevelUp(ent: Entity, events: GameEvent[]): void {
  const oldLevel = ent.level;
  const newLevel = calcLevel(ent.exp);
  if (newLevel <= oldLevel) return;

  ent.level = newLevel;
  const bonus = (newLevel - oldLevel) * POINTS_PER_LEVEL;
  const oldHp = ent.hp;
  const oldAtk = ent.atk;
  const total = oldHp + oldAtk;
  const hpGain = Math.trunc(bonus * oldHp / total);
  const atkGain = bonus - hpGain;

  ent.hp = oldHp + hpGain;
  ent.atk = oldAtk + atkGain;
  // Full heal on level up
  ent.currentHp = ent.hp;

  events.push({
    type: 'level_up',
    actorIdx: ent.idx,
    newLevel,
  });
}

/** Apply damage from attacker to target. Handles kills, thorns, exp, level up. Mutates entities. */
export function applyDamage(
  tgtIdx: number, atkIdx: number,
  dmg: number, ents: Entity[],
  turn: number, events: GameEvent[],
): void {
  const tgt = ents[tgtIdx];
  const atk = ents[atkIdx];

  // Attacker exposure reduces outgoing damage
  if (atk.exposure > 0) {
    dmg = Math.max(1, Math.trunc(dmg * (100 - atk.exposure * EXPOSURE_ATK_PCT) / 100));
  }

  // Deal damage
  tgt.currentHp -= dmg;
  tgt.lastAtkIdx = atkIdx;
  atk.lastTgtIdx = tgtIdx;

  // Attacker gains exp
  atk.exp += ATTACK_EXP;

  if (tgt.currentHp <= 0) {
    // Target dies
    tgt.alive = false;
    tgt.deathTurn = turn;

    events.push({ type: 'death', actorIdx: tgtIdx });

    // Kill rewards — max exposure as cost
    atk.kills++;
    atk.exposure = EXPOSURE_MAX;
    let killExp = Math.trunc(tgt.exp * KILL_EXP_PCT / 100);
    if (killExp < KILL_EXP_MIN) killExp = KILL_EXP_MIN;
    atk.exp += killExp;

    events.push({ type: 'kill', actorIdx: atkIdx, targetIdx: tgtIdx, expGained: killExp });

    // Kill heal
    const missingHp = atk.hp - atk.currentHp;
    if (missingHp > 0) {
      const heal = Math.trunc(missingHp * KILL_HEAL_PCT / 100);
      atk.currentHp += heal;
      if (atk.currentHp > atk.hp) atk.currentHp = atk.hp;
    }
  } else {
    // Thorns reflection
    if ((tgt.statusFlags & STATUS_THORNS) !== 0) {
      const reflect = Math.trunc(dmg * tgt.skillPower * SKILL_RATIO_THORNS / 100);
      atk.currentHp -= reflect;
      if (atk.currentHp <= 0) {
        atk.alive = false;
        atk.deathTurn = turn;
        events.push({ type: 'death', actorIdx: atkIdx });
        return; // Skip level up if attacker died
      }
    }
  }

  // Level up check
  checkLevelUp(atk, events);
}

/** Execute a normal attack. Returns true if target was killed. */
export function normalAttack(
  atkIdx: number, tgtIdx: number,
  ents: Entity[], turn: number,
  events: GameEvent[],
): void {
  const atk = ents[atkIdx];
  const tgt = ents[tgtIdx];

  // calcDamage
  let dmg = Math.trunc(atk.atk * (100 + tgt.exposure * EXPOSURE_DMG_PCT) / 100);
  if (tgt.lastAction === ACTION_DEFEND) {
    dmg = Math.trunc(dmg * (100 - DEFEND_REDUCE_PCT) / 100);
  }
  // 距离衰减
  const dist = manhattan(atk, tgt);
  if (dist > 1) {
    dmg = Math.trunc(dmg * (100 - (dist - 1) * RANGE_DECAY_PCT) / 100);
  }
  if (dmg < 1) dmg = 1;

  events.push({
    type: 'attack',
    actorIdx: atkIdx,
    targetIdx: tgtIdx,
    damage: dmg,
  });

  applyDamage(tgtIdx, atkIdx, dmg, ents, turn, events);
}

/** Execute a skill attack. Returns newbuff flags for this turn. */
export function executeSkill(
  atkIdx: number, tgtIdx: number,
  ents: Entity[], turn: number,
  events: GameEvent[],
): number {
  const atk = ents[atkIdx];
  if (tgtIdx >= PLAYERS_PER_MATCH || !ents[tgtIdx].alive) {
    return 0;
  }
  const tgt = ents[tgtIdx];
  // Range check: same as visibility (atkRange + target exposure)
  if (manhattan(atk, tgt) > atk.atkRange + tgt.exposure) {
    return 0;
  }

  const effect = atk.skillEffect;
  const sp = atk.skillPower;

  // Skill damage = ATK * (100 + bonus + exposure * EXPOSURE_DMG_PCT) / 100
  let bonus = sp * SKILL_RATIO;

  if ((effect & SKILL_CRITICAL) !== 0) {
    bonus += sp * SKILL_RATIO_CRITICAL;
  }
  if ((effect & SKILL_MANA_BURN) !== 0) {
    const tgtMana = tgt.mana;
    const burned = tgtMana < sp ? tgtMana : sp;
    tgt.mana -= burned;
    bonus += burned * SKILL_RATIO_MANA_BURN;
  }
  if ((effect & SKILL_VIGOR) !== 0) {
    if (atk.hp > 0 && atk.currentHp > 0) {
      bonus += Math.trunc(atk.currentHp * sp * SKILL_RATIO_VIGOR / atk.hp);
    }
  }
  if ((effect & SKILL_EXECUTE) !== 0) {
    if (tgt.hp > 0) {
      const missing = tgt.hp - tgt.currentHp;
      if (missing > 0) {
        bonus += Math.trunc(missing * sp * SKILL_RATIO_EXECUTE / tgt.hp);
      }
    }
  }

  let rawDmg = Math.trunc(atk.atk * (100 + bonus + tgt.exposure * EXPOSURE_DMG_PCT) / 100);

  // Defend reduction
  if (tgt.lastAction === ACTION_DEFEND) {
    rawDmg = Math.trunc(rawDmg * (100 - DEFEND_REDUCE_PCT) / 100);
  }
  // 距离衰减
  const dist = manhattan(atk, tgt);
  if (dist > 1) {
    rawDmg = Math.trunc(rawDmg * (100 - (dist - 1) * RANGE_DECAY_PCT) / 100);
  }
  if (rawDmg < 1) rawDmg = 1;

  events.push({
    type: 'skill',
    actorIdx: atkIdx,
    targetIdx: tgtIdx,
    damage: rawDmg,
    skillEffect: effect,
  });

  // Apply damage
  applyDamage(tgtIdx, atkIdx, rawDmg, ents, turn, events);

  // Debuff on target
  tgt.statusFlags |= (effect & SKILL_DEBUFF_MASK);

  // Lifesteal
  if ((effect & SKILL_LIFESTEAL) !== 0) {
    const heal = Math.trunc(rawDmg * sp * SKILL_RATIO_LIFESTEAL / 100);
    atk.currentHp += heal;
    if (atk.currentHp > atk.hp) atk.currentHp = atk.hp;
  }

  // Buff
  const newbuff = effect & SKILL_BUFF_MASK;
  atk.statusFlags |= newbuff;

  // Cleanse
  if ((effect & SKILL_CLEANSE) !== 0) {
    atk.statusFlags &= STATUS_BUFF_MASK;
  }

  // Haste
  if ((effect & SKILL_HASTE) !== 0) {
    atk.blinkCooldown = 0;
  }

  return newbuff;
}

/**
 * Process a full attack action (exposure, mana charge, skill or normal).
 * Returns { newbuff, killed }.
 */
export function processAttack(
  atkIdx: number, tgtIdx: number,
  ents: Entity[], turn: number,
  events: GameEvent[],
): { newbuff: number; killed: boolean } {
  const atk = ents[atkIdx];
  const sf = atk.statusFlags;

  // Exposure increase
  atk.exposure = atk.exposure < EXPOSURE_MAX ? atk.exposure + 1 : EXPOSURE_MAX;

  // Clear stealth on attack
  atk.statusFlags &= ~STATUS_STEALTH;

  let newbuff = 0;

  // Skill or normal attack
  if (atk.mana >= atk.manaMax && atk.manaMax > 0 && (sf & STATUS_SILENCE) === 0) {
    // Mana full → cast skill, reset mana
    atk.mana = 0;
    newbuff = executeSkill(atkIdx, tgtIdx, ents, turn, events);
  } else {
    // Normal attack, then charge mana
    if (atk.mana < atk.manaMax) atk.mana++;
    if (tgtIdx < PLAYERS_PER_MATCH && ents[tgtIdx].alive) {
      if (manhattan(atk, ents[tgtIdx]) <= atk.atkRange + ents[tgtIdx].exposure) {
        normalAttack(atkIdx, tgtIdx, ents, turn, events);
      }
    }
  }

  // Check for kills
  let killed = false;
  if (tgtIdx < PLAYERS_PER_MATCH && !ents[tgtIdx].alive) {
    killed = true;
  }
  if (!ents[atkIdx].alive) killed = true;

  return { newbuff, killed };
}

/** Apply defend action: clear exposure, heal. */
export function applyDefend(ent: Entity, events: GameEvent[]): void {
  ent.exposure = 0;
  const maxHp = ent.hp;
  const healAmt = Math.max(1, Math.trunc(maxHp * DEFEND_HEAL_PCT / 100));
  let healed = ent.currentHp + healAmt;
  if (healed > maxHp) healed = maxHp;
  ent.currentHp = healed;

  events.push({ type: 'defend', actorIdx: ent.idx });
}

/** Apply idle action: reduce exposure. */
export function applyIdle(ent: Entity, events: GameEvent[]): void {
  if (ent.exposure > 0) ent.exposure--;
  events.push({ type: 'idle', actorIdx: ent.idx });
}

/** Count alive entities */

// Re-export constants needed by game.ts
export {
  ACTION_IDLE,
  ACTION_DEFEND,
  STATUS_DISARM,
  EXPOSURE_MAX,
};
export const STATUS_STUN = 0x0003; // STATUS_IMMOBILIZE | STATUS_DISARM
export const STATUS_IMMOBILIZE = 0x0001;
export const ACTION_ATTACK = 2;
export const ACTION_MOVE = 3;
export const ACTION_BLINK = 4;
export { BLINK_COOLDOWN } from '../config/constants.ts';
