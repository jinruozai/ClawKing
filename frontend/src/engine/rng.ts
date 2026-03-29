// ── xorshift32 PRNG (matches RngLib.sol exactly) ──

/** Initialize RNG state. Zero seed becomes 1. */
export function init(seed: number): number {
  const s = (seed >>> 0) || 1;
  return s;
}

/** Advance state, return [newState, value]. Matches Solidity xorshift32. */
export function next(state: number): [number, number] {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state = state >>> 0; // keep as uint32
  return [state, state];
}
