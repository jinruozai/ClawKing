/**
 * Game Types — v2 engine: 12 lobsters FFA (8 players + 4 AI bots)
 * No items, chests, orbs, monsters — only players
 */

// Entity types (v2: all are players/lobsters)
export const TYPE_PLAYER = 1;

// Engine event types (from runGame())
export type EngineEventType =
  | 'attack' | 'kill' | 'ring_kill' | 'ring_shrink'
  | 'first_blood' | 'streak' | 'move' | 'blink' | 'defend'
  | 'skill';

// Renderer event types (processed for display)
export type GameEventType =
  | 'init' | 'turn' | 'move' | 'attack' | 'hurt' | 'death'
  | 'evolve' | 'defend' | 'heal' | 'shrink' | 'gameover'
  | 'blink' | 'first_blood' | 'streak' | 'ring_kill'
  | 'status_update' | 'skill';

export interface GameEvent {
  type: GameEventType;
  turn?: number;
  eid?: number;
  target?: number;
  col?: number;
  row?: number;
  damage?: number;
  hp?: number;
  maxHp?: number;
  level?: number;
  amount?: number;
  killer?: number;
  winner?: number;
  radius?: number;
  // ring_shrink — center-based radius
  ringRadius?: number;
  // streak
  kills?: number;
  label?: string;
  // exp & evolve stats
  exp?: number;
  atk?: number;
  // exposure & blink
  exposure?: number;
  blinkCooldown?: number;
  // mana & skill
  mana?: number;
  maxMana?: number;
  statusFlags?: number;
  skillName?: string;
  skillTargets?: { idx: number; damage: number; hp: number; splash?: boolean; frozen?: boolean; exposure?: number }[];
  frozen?: boolean;
  // Turn action order
  order?: number[];
  // Init event data
  entities?: InitEntity[];
  mapSize?: number;
  tiles?: { col: number; row: number; type: number }[];
}

export interface InitEntity {
  eid: number;
  type: number;
  name: string;
  color: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  level?: number;
  heroId?: number;
  atk?: number;
  def?: number;
  atkRange?: number;
  vision?: number;
  exp?: number;
  kills?: number;
  isPlayer?: boolean;
  hpGrowth?: number;
  atkGrowth?: number;
  defGrowth?: number;
  maxMana?: number;
  skillName?: string;
  speed?: number;
  skillEffect?: number;
  skillPower?: number;
}

// Runtime entity state for renderer
export interface RenderEntity {
  eid: number;
  type: number;
  name: string;
  color: string;
  col: number;
  row: number;
  renderCol: number;
  renderRow: number;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  kills: number;
  atk: number;       // effective: baseAtk + level * atkGrowth
  def: number;       // effective: baseDef + level * defGrowth
  baseAtk: number;
  baseDef: number;
  baseHpMax: number;
  atkRange: number;
  vision: number;
  hpGrowth: number;
  atkGrowth: number;
  defGrowth: number;
  visible: boolean;
  scale: number;
  alpha: number;
  flashColor: string;
  flashAlpha: number;
  heroId: number;
  isPlayer: boolean;
  exposure: number;
  blinkCooldown: number;
  mana: number;
  maxMana: number;
  frozen: number;
  statusFlags: number;
  skillCasts: number;
  skillName: string;
  facing: number; // radians, current visual facing
  targetFacing: number; // radians, target facing (lerps toward this)
  attackAnim: number; // 0 = idle, >0 = attack progress timer (ms remaining)
  attackTargetEid: number; // eid of current attack target (-1 = none)
  evolveBounce: number; // 0 = idle, >0 = evolve bounce timer (ms remaining)
  displayExp: number; // smooth-lerped exp for ring animation
  speed: number;
  skillEffect: number;
  skillPower: number;
}

// Floater style types
export type FloaterStyle = 'normal' | 'damage' | 'crit' | 'heal' | 'skill' | 'status' | 'kill';

// Damage floater
export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
  duration: number;
  fontSize: number;
  style: FloaterStyle;
  dx?: number;  // horizontal drift direction
}

// VFX particle
export interface VFXInstance {
  type: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t0: number;
  duration: number;
  color: string;
  data?: Record<string, unknown>;
}

// Announcement
export interface Announcement {
  text: string;
  subtext?: string;
  color: string;
  t0: number;
  duration: number;
}
