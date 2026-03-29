// ── Engine types for Claw Arena v3 ──

/** Unpacked entity state (mirrors EntityLib.sol packed uint256 layout) */
export interface Entity {
  currentHp: number;   // int16
  x: number;           // int8
  y: number;           // int8
  mana: number;        // uint8
  exposure: number;    // uint8
  statusFlags: number; // uint16
  blinkCooldown: number; // uint8
  lastAction: number;  // uint8
  alive: boolean;
  kills: number;       // uint8
  exp: number;         // uint16
  level: number;       // uint8
  deathTurn: number;   // uint8
  idx: number;         // uint8
  lastAtkIdx: number;  // uint8
  lastTgtIdx: number;  // uint8
  hp: number;          // uint8 (max HP, grows on level up)
  atk: number;         // uint8 (attack, grows on level up)
  atkRange: number;    // uint8
  speed: number;       // uint8
  manaMax: number;     // uint8
  skillEffect: number; // uint16
  skillPower: number;  // uint8
  lastBlockedBy: number; // uint8 (idx of entity that blocked move/blink, 255=none)
}

/** Result from script evaluation */
export interface ScriptResult {
  action: number;
  actionArg: number;
  targetIdx: number;
}

/** Ranking entry for match results */
export interface RankingEntry {
  idx: number;
  deathTurn: number;
  exp: number;
  kills: number;
  firstBlood: boolean;
}

/** Snapshot of a single entity for replay */
export interface EntitySnapshot {
  idx: number;
  x: number;
  y: number;
  currentHp: number;
  hp: number;          // max HP
  alive: boolean;
  mana: number;
  manaMax: number;
  exposure: number;
  statusFlags: number;
  lastAction: number;
  kills: number;
  exp: number;
  level: number;
  atk: number;
  atkRange: number;
  speed: number;
  skillEffect: number;
  skillPower: number;
  blinkCooldown: number;
}

/** Game event types */
export type GameEventType =
  | 'attack'
  | 'skill'
  | 'move'
  | 'blink'
  | 'defend'
  | 'idle'
  | 'ring_damage'
  | 'kill'
  | 'level_up'
  | 'death';

/** A game event emitted during a turn */
export interface GameEvent {
  type: GameEventType;
  actorIdx: number;
  targetIdx?: number;
  damage?: number;
  heal?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  skillEffect?: number;
  newLevel?: number;
  expGained?: number;
}

/** Per-turn snapshot for replay */
export interface TurnSnapshot {
  turn: number;
  ringRadius: number;
  actionOrder: number[];
  entities: EntitySnapshot[];
  events: GameEvent[];
}

/** Full game result */
export interface GameResult {
  rankings: RankingEntry[];
  turns: TurnSnapshot[];
  finalEntities: Entity[];
}
