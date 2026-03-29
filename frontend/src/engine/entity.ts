// ── Entity operations (matches EntityLib.sol packed uint256 layout) ──

import type { Entity } from './types.ts';

const NO_TARGET = 255;

/**
 * Create an Entity from packedNftStats (same format as contract).
 * packedNftStats layout (low to high):
 *   [0..7]   hp          uint8
 *   [8..15]  atk         uint8
 *   [16..23] atkRange    uint8
 *   [24..31] speed       uint8
 *   [32..39] manaMax     uint8
 *   [40..55] skillEffect uint16
 *   [56..63] skillPower  uint8
 */
export function createEntity(packedNftStats: bigint, x: number, y: number, idx: number): Entity {
  const hp = Number(packedNftStats & 0xFFn);
  const atk = Number((packedNftStats >> 8n) & 0xFFn);
  const atkRange = Number((packedNftStats >> 16n) & 0xFFn);
  const speed = Number((packedNftStats >> 24n) & 0xFFn);
  const manaMax = Number((packedNftStats >> 32n) & 0xFFn);
  const skillEffect = Number((packedNftStats >> 40n) & 0xFFFFn);
  const skillPower = Number((packedNftStats >> 56n) & 0xFFn);

  return {
    currentHp: hp,  // int16(int8(hp)) in Solidity — hp is uint8 so same value
    x,
    y,
    mana: 0,
    exposure: 0,
    statusFlags: 0,
    blinkCooldown: 0,
    lastAction: 0,
    alive: true,
    kills: 0,
    exp: 0,
    level: 0,
    deathTurn: 0,
    idx,
    lastAtkIdx: NO_TARGET,
    lastTgtIdx: NO_TARGET,
    hp,
    atk,
    atkRange,
    speed,
    manaMax,
    skillEffect,
    skillPower,
    lastBlockedBy: NO_TARGET,
  };
}

/** Manhattan distance between two entities */
export function manhattan(a: Entity, b: Entity): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy;
}

/** Clone an entity (shallow copy is sufficient since all fields are primitives) */
export function cloneEntity(e: Entity): Entity {
  return { ...e };
}

/** Create a snapshot-safe copy of entities array */
export function cloneEntities(ents: Entity[]): Entity[] {
  return ents.map(e => ({ ...e }));
}
