/**
 * Full Engine Consistency Test — JS engine vs Solidity engine
 *
 * Uses REAL default lobster stats + default scripts (not simplified).
 * Runs multiple seeds and compares rankings field by field.
 *
 * Usage:
 *   1. Run this script:  node --loader tsx test/consistency_full.mjs
 *   2. Run Solidity test: forge test --match-contract ConsistencyFullTest -vv
 *   3. Compare output
 */
import { runGame } from '../frontend/src/engine/game.ts';
import { ethers } from '../frontend/node_modules/ethers/lib.esm/index.js';

// ── Read default data from deployed contract ──
const RPC = 'https://rpc-amoy.polygon.technology';
const ARENA = '0x64c467feaFed4592537Ce33Ae52228B936C5d84a';
const LOBSTER = '0x72eEA00e0b9652Db2D8d2Eb4b72eadEBA76440Bd';
const SCRIPT = '0x429862F1fBd621D15C48f1E16E6301f322e7CCAe';

const provider = new ethers.JsonRpcProvider(RPC);
const lobsterHub = new ethers.Contract(LOBSTER, [
  'function getLobsterStats(uint256) view returns (uint256)',
], provider);
const scriptHub = new ethers.Contract(SCRIPT, [
  'function getScriptBytes(uint256) view returns (bytes)',
], provider);

console.log('Fetching default lobster stats and scripts from chain...');

const stats = [];
const scripts = [];
for (let i = 0; i < 8; i++) {
  stats.push(await lobsterHub.getLobsterStats(i));
  const bytes = await scriptHub.getScriptBytes(i);
  scripts.push(ethers.getBytes(bytes));
}

console.log('Stats loaded:', stats.map((s, i) => `#${i}=${s.toString(16)}`).join(', '));

// ── Test seeds ──
const SEEDS = [1, 42, 123, 999, 12345, 55555, 77777, 99999, 314159, 1000000];

console.log(`\nRunning ${SEEDS.length} tests with default heroes 0-7...\n`);

for (const seed of SEEDS) {
  const result = runGame(stats, scripts, seed);
  console.log(`=== seed=${seed} ===`);
  for (let i = 0; i < 8; i++) {
    const r = result.rankings[i];
    console.log(`  rank[${i}]: idx=${r.idx} dt=${r.deathTurn} k=${r.kills} exp=${r.exp} fb=${r.firstBlood ? 1 : 0}`);
  }
}

// ── Also test with mixed hero/script combos ──
console.log('\n=== Mixed combos (hero i, script 11-i) ===\n');
const mixedStats = [];
const mixedScripts = [];
for (let i = 0; i < 8; i++) {
  mixedStats.push(await lobsterHub.getLobsterStats(i));
  mixedScripts.push(ethers.getBytes(await scriptHub.getScriptBytes(11 - i)));
}

for (const seed of [42, 12345, 77777]) {
  const result = runGame(mixedStats, mixedScripts, seed);
  console.log(`=== mixed seed=${seed} ===`);
  for (let i = 0; i < 8; i++) {
    const r = result.rankings[i];
    console.log(`  rank[${i}]: idx=${r.idx} dt=${r.deathTurn} k=${r.kills} exp=${r.exp} fb=${r.firstBlood ? 1 : 0}`);
  }
}

console.log('\nDone. Compare with: forge test --match-contract ConsistencyFullTest -vv');
