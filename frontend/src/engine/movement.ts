// ── Movement and blink (matches GameLib.sol) ──

import type { Entity } from './types.ts';
import { MAP_HALF, PLAYERS_PER_MATCH, BLINK_RANGE } from '../config/constants.ts';

// ── Direction constants ──
const MOVE_TOWARD = 0;
const MOVE_AWAY = 1;
const DIR_UP = 2;
const DIR_DOWN = 3;
const DIR_LEFT = 4;
const DIR_RIGHT = 5;
const DIR_CENTER = 6;

export function clampToMap(x: number, y: number): [number, number] {
  if (x > MAP_HALF) x = MAP_HALF;
  else if (x < -MAP_HALF) x = -MAP_HALF;
  if (y > MAP_HALF) y = MAP_HALF;
  else if (y < -MAP_HALF) y = -MAP_HALF;
  return [x, y];
}

export function isOccupied(x: number, y: number, excludeIdx: number, ents: Entity[]): boolean {
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    if (i !== excludeIdx && ents[i].alive && ents[i].x === x && ents[i].y === y) {
      return true;
    }
  }
  return false;
}

export function findOccupant(x: number, y: number, excludeIdx: number, ents: Entity[]): number {
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) {
    if (i !== excludeIdx && ents[i].alive && ents[i].x === x && ents[i].y === y) {
      return i;
    }
  }
  return 255; // NO_TARGET
}

function stepToward(a: Entity, b: Entity): [number, number] {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const dx = bx > ax ? 1 : (bx < ax ? -1 : 0);
  const dy = by > ay ? 1 : (by < ay ? -1 : 0);
  const adx = Math.abs(bx - ax);
  const ady = Math.abs(by - ay);
  if (adx >= ady) {
    return [ax + dx, ay];
  } else {
    return [ax, ay + dy];
  }
}

function stepAway(a: Entity, b: Entity): [number, number] {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const dx = bx > ax ? -1 : (bx < ax ? 1 : 0);
  const dy = by > ay ? -1 : (by < ay ? 1 : 0);
  const adx = Math.abs(bx - ax);
  const ady = Math.abs(by - ay);
  if (adx >= ady) {
    return [ax + dx, ay];
  } else {
    return [ax, ay + dy];
  }
}

function stepDirection(ent: Entity, dir: number): [number, number] {
  const x = ent.x, y = ent.y;
  if (dir === DIR_UP) return [x, y + 1];
  if (dir === DIR_DOWN) return [x, y - 1];
  if (dir === DIR_LEFT) return [x - 1, y];
  if (dir === DIR_RIGHT) return [x + 1, y];
  if (dir === DIR_CENTER) {
    const dx = x > 0 ? -1 : (x < 0 ? 1 : 0);
    const dy = y > 0 ? -1 : (y < 0 ? 1 : 0);
    const adx = Math.abs(x);
    const ady = Math.abs(y);
    if (adx >= ady) return [x + dx, y];
    else return [x, y + dy];
  }
  return [x, y];
}

/** Execute a 1-step move. Mutates ent in place. */
export function executeMove(
  selfIdx: number,
  targetIdx: number,
  actionArg: number,
  ents: Entity[]
): void {
  const ent = ents[selfIdx];
  let nx: number, ny: number;

  if (actionArg === MOVE_TOWARD && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].alive) {
    [nx, ny] = stepToward(ent, ents[targetIdx]);
  } else if (actionArg === MOVE_AWAY && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].alive) {
    [nx, ny] = stepAway(ent, ents[targetIdx]);
  } else {
    [nx, ny] = stepDirection(ent, actionArg);
  }

  [nx, ny] = clampToMap(nx, ny);
  const occ = findOccupant(nx, ny, selfIdx, ents);
  if (occ === 255) {
    ent.x = nx;
    ent.y = ny;
  } else {
    ent.lastBlockedBy = occ;
  }
}

// ── Blink helpers ──

function posToward(a: Entity, b: Entity, range: number): [number, number] {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const dx = bx - ax;
  const dy = by - ay;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const dist = adx + ady;
  if (dist === 0) return [ax, ay];
  if (dist <= range) return [bx, by];
  const nx = ax + Math.trunc(dx * range / dist);
  const ny = ay + Math.trunc(dy * range / dist);
  return [nx, ny];
}

function posAway(a: Entity, b: Entity, range: number): [number, number] {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const dx = ax - bx;
  const dy = ay - by;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const dist = adx + ady;
  if (dist === 0) {
    return [ax + range, ay];
  }
  const nx = ax + Math.trunc(dx * range / dist);
  const ny = ay + Math.trunc(dy * range / dist);
  return [nx, ny];
}

function posDirection(ent: Entity, dir: number, range: number): [number, number] {
  const x = ent.x, y = ent.y;
  if (dir === DIR_UP) return [x, y + range];
  if (dir === DIR_DOWN) return [x, y - range];
  if (dir === DIR_LEFT) return [x - range, y];
  if (dir === DIR_RIGHT) return [x + range, y];
  if (dir === DIR_CENTER) {
    const dx = -x;
    const dy = -y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dist = adx + ady;
    if (dist === 0) return [x, y];
    if (dist <= range) return [0, 0];
    return [x + Math.trunc(dx * range / dist), y + Math.trunc(dy * range / dist)];
  }
  return [x, y];
}

/** Execute a blink (teleport up to BLINK_RANGE). Mutates ent in place. */
export function executeBlink(
  selfIdx: number,
  targetIdx: number,
  actionArg: number,
  ents: Entity[]
): void {
  const ent = ents[selfIdx];
  let destX: number, destY: number;

  if (actionArg === MOVE_TOWARD && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].alive) {
    [destX, destY] = posToward(ent, ents[targetIdx], BLINK_RANGE);
  } else if (actionArg === MOVE_AWAY && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].alive) {
    [destX, destY] = posAway(ent, ents[targetIdx], BLINK_RANGE);
  } else {
    [destX, destY] = posDirection(ent, actionArg, BLINK_RANGE);
  }

  [destX, destY] = clampToMap(destX, destY);

  // Bresenham line from ent to dest, collect path cells
  const ox = ent.x;
  const oy = ent.y;
  const dx = destX - ox;
  const dy = destY - oy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);

  const pathX: number[] = [];
  const pathY: number[] = [];

  let cx = ox;
  let cy = oy;
  let err = adx - ady;

  for (let step = 0; step < 16; step++) {
    // Skip starting cell
    if (cx !== ox || cy !== oy) {
      pathX.push(cx);
      pathY.push(cy);
    }
    if (cx === destX && cy === destY) break;

    const e2 = err * 2;
    if (e2 > -ady) {
      err -= ady;
      cx += sx;
    }
    if (e2 < adx) {
      err += adx;
      cy += sy;
    }
  }

  // From farthest to nearest, find first unoccupied
  for (let i = pathX.length - 1; i >= 0; i--) {
    if (!isOccupied(pathX[i], pathY[i], selfIdx, ents)) {
      ent.x = pathX[i];
      ent.y = pathY[i];
      return;
    }
  }
  // All occupied — record blocker at destination
  if (pathX.length > 0) {
    ent.lastBlockedBy = findOccupant(pathX[pathX.length - 1], pathY[pathY.length - 1], selfIdx, ents);
  }
}
