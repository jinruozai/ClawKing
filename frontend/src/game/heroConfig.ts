/**
 * Sprite layout constants for BattleRenderer.
 * v4: spritesheets are dynamically generated per NFT (not pre-loaded by heroId).
 */

// Sprite layout
export const SPRITE_FRAME_SIZE = 128;
export const SPRITE_COLS = 8;
export const SPRITE_ROWS = 3; // row 0=idle, 1=walk, 2=attack

export type SpriteRow = 0 | 1 | 2;
export const SPRITE_ROW_IDLE: SpriteRow = 0;
export const SPRITE_ROW_WALK: SpriteRow = 1;
export const SPRITE_ROW_ATTACK: SpriteRow = 2;
