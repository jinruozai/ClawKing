/**
 * Engine Consistency Test — JS engine vs Solidity engine
 *
 * Runs the same scenarios, computes replayHash, compares with Solidity output.
 * Usage: node --experimental-strip-types test/engine_consistency.mjs
 *
 * To get Solidity hashes:
 *   cd contracts && forge test --match-contract EngineMatchMinTest -vv 2>&1 | grep replayHash
 */
import { runGame } from '../frontend/src/engine/game.ts';
import { keccak256 } from '../frontend/node_modules/ethers/lib.esm/crypto/index.js';

// ── Stats ──
function pack(hp, atk, atkRange, speed, manaMax, skillEffect, skillPower) {
  return BigInt(hp) | (BigInt(atk) << 8n) | (BigInt(atkRange) << 16n) | (BigInt(speed) << 24n)
    | (BigInt(manaMax) << 32n) | (BigInt(skillEffect) << 40n) | (BigInt(skillPower) << 56n);
}

const STATS = [
  pack(16,4,2,1,3,0x0001,2), pack(20,2,1,0,4,0x0002,1), pack(10,5,2,4,3,0x0100,4), pack(14,3,2,1,4,0x0010,4),
  pack(12,5,2,2,3,0x0040,4), pack(19,2,1,1,3,0x0200,2), pack(11,6,2,3,3,0x0400,3), pack(13,3,4,1,4,0x0080,3),
  pack(12,4,4,1,3,0x0004,4), pack(14,3,3,0,4,0x0008,4), pack(18,2,1,2,3,0x0800,2), pack(13,4,2,2,3,0x1000,4),
];

// ── Minimal script: just "attack nearest or move center" ──
function makeMinScript() {
  const b = new Uint8Array(1 + 8 + 1 + 47 * 2);
  b[0] = 1; b[1] = 7; b[9] = 2;
  const r0 = 10;
  b[r0] = 2; b[r0+1] = 7; b[r0+5] = 6; b[r0+6] = 0; b[r0+7] = 4;
  b[r0+44] = 2; b[r0+46] = 2;
  const r1 = 10 + 47;
  b[r1+44] = 3; b[r1+45] = 6;
  return b;
}

// ── Pack Entity to uint256 (matching EntityLib.sol layout) ──
function packEntity(e) {
  let v = BigInt(e.currentHp & 0xFFFF);
  v |= BigInt(e.x & 0xFF) << 16n;
  v |= BigInt(e.y & 0xFF) << 24n;
  v |= BigInt(e.mana & 0xFF) << 32n;
  v |= BigInt(e.exposure & 0xFF) << 40n;
  v |= BigInt(e.statusFlags & 0xFFFF) << 48n;
  v |= BigInt(e.blinkCooldown & 0xFF) << 64n;
  v |= BigInt(e.lastAction & 0xFF) << 72n;
  v |= BigInt(e.alive ? 1 : 0) << 80n;
  v |= BigInt(e.kills & 0xFF) << 88n;
  v |= BigInt(e.exp & 0xFFFF) << 96n;
  v |= BigInt(e.level & 0xFF) << 112n;
  v |= BigInt(e.deathTurn & 0xFF) << 120n;
  v |= BigInt(e.idx & 0xFF) << 128n;
  v |= BigInt(e.lastAtkIdx & 0xFF) << 136n;
  v |= BigInt(e.lastTgtIdx & 0xFF) << 144n;
  v |= BigInt(e.hp & 0xFF) << 152n;
  v |= BigInt(e.atk & 0xFF) << 160n;
  v |= BigInt(e.atkRange & 0xFF) << 168n;
  v |= BigInt(e.speed & 0xFF) << 176n;
  v |= BigInt(e.manaMax & 0xFF) << 184n;
  v |= BigInt(e.skillEffect & 0xFFFF) << 192n;
  v |= BigInt(e.skillPower & 0xFF) << 208n;
  v |= BigInt(e.lastBlockedBy & 0xFF) << 216n;
  return v;
}

function computeReplayHash(entities) {
  let hex = '0x';
  for (let i = 0; i < 8; i++) hex += packEntity(entities[i]).toString(16).padStart(64, '0');
  return keccak256(hex);
}

const script = makeMinScript();

// ── Run tests ──
let passed = 0, failed = 0;

function test(name, stats, scripts, seed, expectedHash) {
  const result = runGame(stats, scripts, seed);
  const hash = computeReplayHash(result.finalEntities);
  const match = hash === expectedHash;
  if (match) { passed++; } else { failed++; }
  console.log(`${match ? 'PASS' : 'FAIL'} ${name}  hash=${hash}${match ? '' : `  expected=${expectedHash}`}`);
}

// Run Solidity first to get hashes, then paste them here.
// To regenerate: cd contracts && forge test --match-contract EngineMatchMinTest -vv 2>&1 | grep replayHash
console.log('=== Step 1: Getting Solidity hashes ===');
console.log('Run: cd contracts && forge test --match-contract EngineMatchMinTest -vv 2>&1 | grep replayHash');
console.log('');

// For now, compute JS hashes and print them for manual comparison
console.log('=== JS Engine Replay Hashes ===');
const scenarios = [
  ['MinScript seed12345', STATS.slice(0,8), 12345],
  ['MinScript seed99999', STATS.slice(0,8), 99999],
  ['AllTanks seed7777', Array(8).fill(STATS[1]), 7777],
  ['AllAssassins seed5555', Array(8).fill(STATS[2]), 5555],
  ['MixedStats seed42', [STATS[8], STATS[9], STATS[10], STATS[11], STATS[0], STATS[1], STATS[2], STATS[3]], 42],
];

const jsHashes = [];
for (const [name, stats, seed] of scenarios) {
  const result = runGame(stats, Array(8).fill(script), seed);
  const hash = computeReplayHash(result.finalEntities);
  jsHashes.push(hash);
  console.log(`  ${name}: ${hash}`);
}

// Auto-verify if Solidity hashes are provided via env
const solHashes = process.env.SOL_HASHES?.split(',') || [];
if (solHashes.length === 5) {
  console.log('\n=== Cross-verification ===');
  for (let i = 0; i < 5; i++) {
    const match = jsHashes[i] === solHashes[i];
    if (match) passed++; else failed++;
    console.log(`${match ? 'PASS' : 'FAIL'} ${scenarios[i][0]}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
} else {
  console.log('\nTo auto-verify, run with SOL_HASHES env var (comma-separated).');
  console.log('Or compare manually with forge output above.');
}
