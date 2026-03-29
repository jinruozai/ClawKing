// ── Claw Arena v3 Game Engine ──
// Client-side replay engine, ported 1:1 from Solidity contracts.

export { runGame } from './game.ts';
export { createEntity, manhattan, cloneEntity, cloneEntities } from './entity.ts';
export { init as rngInit, next as rngNext } from './rng.ts';
export { executeScript } from './script.ts';
export { calcLevel } from './combat.ts';
export { executeMove, executeBlink, clampToMap, isOccupied } from './movement.ts';

export type {
  Entity, ScriptResult, RankingEntry,
  GameEvent, GameEventType, TurnSnapshot,
  EntitySnapshot, GameResult,
} from './types.ts';
