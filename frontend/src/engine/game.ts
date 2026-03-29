// ── Main game loop (matches GameLib.runGame exactly) ──

import type {
  Entity, RankingEntry, GameEvent, TurnSnapshot,
  EntitySnapshot, GameResult,
} from './types.ts';
import { init as rngInit, next as rngNext } from './rng.ts';
import { createEntity, cloneEntities } from './entity.ts';
import { executeScript } from './script.ts';
import {
  processAttack, applyDefend, applyIdle,
  STATUS_STUN, STATUS_IMMOBILIZE, STATUS_DISARM,
  ACTION_IDLE, ACTION_DEFEND, ACTION_ATTACK, ACTION_MOVE, ACTION_BLINK,
  BLINK_COOLDOWN,
} from './combat.ts';
import { executeMove, executeBlink } from './movement.ts';
import { PLAYERS_PER_MATCH, MAX_TURNS, RING_START_RADIUS, RING_SHRINK_INTERVAL, RING_DMG_DIVISOR, SPAWN_X, SPAWN_Y } from '../config/constants.ts';

// ── Constants ──

function entitySnapshot(e: Entity): EntitySnapshot {
  return {
    idx: e.idx,
    x: e.x,
    y: e.y,
    currentHp: e.currentHp,
    hp: e.hp,
    alive: e.alive,
    mana: e.mana,
    manaMax: e.manaMax,
    exposure: e.exposure,
    statusFlags: e.statusFlags,
    lastAction: e.lastAction,
    kills: e.kills,
    exp: e.exp,
    level: e.level,
    atk: e.atk,
    atkRange: e.atkRange,
    speed: e.speed,
    skillEffect: e.skillEffect,
    skillPower: e.skillPower,
    blinkCooldown: e.blinkCooldown,
  };
}

function snapshotEntities(ents: Entity[]): EntitySnapshot[] {
  return ents.map(entitySnapshot);
}

/**
 * Run a full game match. Produces rankings and per-turn snapshots for replay.
 *
 * @param lobsterStats - 8 packed BigInt NFT stats (same format as contract)
 * @param scripts - 8 script bytearrays
 * @param seed - uint32 seed
 */
export function runGame(
  lobsterStats: bigint[],
  scripts: Uint8Array[],
  seed: number,
): GameResult {
  let rng = rngInit(seed);
  const turns: TurnSnapshot[] = [];

  // ── Initialize entities with shuffled spawn points ──
  const sx = [...SPAWN_X];
  const sy = [...SPAWN_Y];

  // Fisher-Yates shuffle (matches Solidity: i from 7 down to 1)
  for (let i = PLAYERS_PER_MATCH - 1; i > 0; i--) {
    let val: number;
    [rng, val] = rngNext(rng);
    const j = val % (i + 1);
    [sx[i], sx[j]] = [sx[j], sx[i]];
    [sy[i], sy[j]] = [sy[j], sy[i]];
  }

  const ents: Entity[] = [];
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    ents.push(createEntity(lobsterStats[i], sx[i], sy[i], i));
  }

  // ── Sort action order by speed DESC (tie-break with rng) ──
  const actionOrder: number[] = [];
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    actionOrder.push(i);
  }
  // Insertion sort (matches Solidity exactly)
  for (let i = 1; i < PLAYERS_PER_MATCH; i++) {
    const key = actionOrder[i];
    const keySpd = ents[key].speed;
    let j = i;
    while (j > 0) {
      const prev = actionOrder[j - 1];
      const prevSpd = ents[prev].speed;
      if (prevSpd > keySpd) break;
      if (prevSpd === keySpd) {
        let tieVal: number;
        [rng, tieVal] = rngNext(rng);
        if ((tieVal & 1) === 0) break;
      }
      actionOrder[j] = prev;
      j--;
    }
    actionOrder[j] = key;
  }

  let aliveCount = PLAYERS_PER_MATCH;
  let ringRadius = RING_START_RADIUS;
  const firstBloodFlags: boolean[] = new Array(PLAYERS_PER_MATCH).fill(false);

  // Record initial state (turn 0)
  turns.push({
    turn: 0,
    ringRadius,
    actionOrder: [...actionOrder],
    entities: snapshotEntities(ents),
    events: [],
  });

  // ═══════ Turn loop ═══════
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (aliveCount <= 1) break;

    if (turn % RING_SHRINK_INTERVAL === 0 && ringRadius > 0) {
      ringRadius--;
    }

    const ringDmg = Math.trunc(turn / RING_DMG_DIVISOR) + 1;
    const turnEvents: GameEvent[] = [];

    for (let oi = 0; oi < PLAYERS_PER_MATCH; oi++) {
      if (aliveCount <= 1) break;
      const idx = actionOrder[oi];
      if (!ents[idx].alive) continue;

      // Ring damage
      const ringApplied = applyRingDamage(ents[idx], ringDmg, ringRadius, turn, turnEvents);
      if (ringApplied && !ents[idx].alive) {
        aliveCount--;
        continue;
      }

      // Cooldown tick
      if (ents[idx].blinkCooldown > 0) {
        ents[idx].blinkCooldown--;
      }

      // Entity action
      const sf = ents[idx].statusFlags;

      // Stun = forced idle
      if ((sf & STATUS_STUN) === STATUS_STUN) {
        ents[idx].lastAction = ACTION_IDLE;
        turnEvents.push({ type: 'idle', actorIdx: idx });
        ents[idx].statusFlags = 0;
        continue;
      }

      // Execute AI script
      const sr = executeScript(idx, ents, scripts[idx], turn, aliveCount, ringRadius);
      ents[idx].lastAction = sr.action;
      ents[idx].lastBlockedBy = 255;

      let newbuff = 0;
      let killed = false;

      if (sr.action === ACTION_IDLE) {
        applyIdle(ents[idx], turnEvents);
      } else if (sr.action === ACTION_DEFEND) {
        applyDefend(ents[idx], turnEvents);
      } else if (sr.action === ACTION_ATTACK) {
        if ((sf & STATUS_DISARM) !== 0) {
          ents[idx].lastAction = ACTION_IDLE;
          turnEvents.push({ type: 'idle', actorIdx: idx });
        } else {
          const result = processAttack(idx, sr.targetIdx, ents, turn, turnEvents);
          newbuff = result.newbuff;
          killed = result.killed;
        }
      } else if (sr.action === ACTION_MOVE) {
        if (ents[idx].exposure > 0) ents[idx].exposure--;
        if ((sf & STATUS_IMMOBILIZE) !== 0) {
          ents[idx].lastAction = ACTION_IDLE;
          turnEvents.push({ type: 'idle', actorIdx: idx });
        } else {
          const fromX = ents[idx].x;
          const fromY = ents[idx].y;
          executeMove(idx, sr.targetIdx, sr.actionArg, ents);
          turnEvents.push({
            type: 'move',
            actorIdx: idx,
            targetIdx: sr.targetIdx,
            fromX, fromY,
            toX: ents[idx].x,
            toY: ents[idx].y,
          });
        }
      } else if (sr.action === ACTION_BLINK) {
        if (ents[idx].exposure > 0) ents[idx].exposure--;
        if ((sf & STATUS_IMMOBILIZE) !== 0) {
          ents[idx].lastAction = ACTION_IDLE;
          turnEvents.push({ type: 'idle', actorIdx: idx });
        } else if (ents[idx].blinkCooldown > 0) {
          ents[idx].lastAction = ACTION_IDLE;
          turnEvents.push({ type: 'idle', actorIdx: idx });
        } else {
          const fromX = ents[idx].x;
          const fromY = ents[idx].y;
          executeBlink(idx, sr.targetIdx, sr.actionArg, ents);
          ents[idx].blinkCooldown = BLINK_COOLDOWN;
          turnEvents.push({
            type: 'blink',
            actorIdx: idx,
            targetIdx: sr.targetIdx,
            fromX, fromY,
            toX: ents[idx].x,
            toY: ents[idx].y,
          });
        }
      }

      if (killed) {
        // Update firstBloodFlags
        const atkIdx = idx;
        if (sr.targetIdx < PLAYERS_PER_MATCH && !ents[sr.targetIdx].alive) {
          if (!firstBloodFlags[atkIdx]) {
            let anyPrevKill = false;
            for (let fi = 0; fi < PLAYERS_PER_MATCH; fi++) {
              if (firstBloodFlags[fi]) { anyPrevKill = true; break; }
            }
            if (!anyPrevKill) firstBloodFlags[atkIdx] = true;
          }
        }
        aliveCount--;
      }

      // Clear status: keep only this turn's new buff
      ents[idx].statusFlags = newbuff;
    }

    turns.push({
      turn,
      ringRadius,
      actionOrder: [...actionOrder],
      entities: snapshotEntities(ents),
      events: turnEvents,
    });
  }

  const rankings = buildRankings(ents, firstBloodFlags);

  return {
    rankings,
    turns,
    finalEntities: cloneEntities(ents),
  };
}

// ── Ring damage ──

function applyRingDamage(
  ent: Entity, ringDmg: number, ringRadius: number,
  turn: number, events: GameEvent[],
): boolean {
  const ax = Math.abs(ent.x);
  const ay = Math.abs(ent.y);
  const chebyshev = ax > ay ? ax : ay;
  if (chebyshev > ringRadius) {
    ent.currentHp -= ringDmg;
    events.push({ type: 'ring_damage', actorIdx: ent.idx, damage: ringDmg });
    if (ent.currentHp <= 0) {
      ent.alive = false;
      ent.deathTurn = turn;
      events.push({ type: 'death', actorIdx: ent.idx });
      return true;
    }
  }
  return false;
}

// ── Rankings ──

function buildRankings(ents: Entity[], firstBloodFlags: boolean[]): RankingEntry[] {
  const order: number[] = [];
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) order.push(i);

  // Insertion sort: alive DESC, deathTurn DESC, exp DESC
  for (let i = 1; i < PLAYERS_PER_MATCH; i++) {
    const key = order[i];
    const ke = ents[key];
    let j = i;
    while (j > 0) {
      const pe = ents[order[j - 1]];
      const kAlive = ke.alive;
      const pAlive = pe.alive;

      if (pAlive && !kAlive) break;
      if (!pAlive && kAlive) {
        // key is better, continue shifting
      } else if (pAlive === kAlive) {
        if (!kAlive) {
          // Both dead: deathTurn DESC
          if (pe.deathTurn > ke.deathTurn) break;
          if (pe.deathTurn === ke.deathTurn) {
            if (pe.exp >= ke.exp) break;
          }
        } else {
          // Both alive: exp DESC
          if (pe.exp >= ke.exp) break;
        }
      }
      order[j] = order[j - 1];
      j--;
    }
    order[j] = key;
  }

  const rankings: RankingEntry[] = [];
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    const idx = order[i];
    const e = ents[idx];
    rankings.push({
      idx,
      deathTurn: e.deathTurn,
      exp: e.exp,
      kills: e.kills,
      firstBlood: firstBloodFlags[idx],
    });
  }
  return rankings;
}

// Re-export key types and utilities
export type { GameResult, TurnSnapshot, GameEvent, EntitySnapshot, RankingEntry };
