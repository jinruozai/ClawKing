/**
 * Supplementary tests — mint script, play with custom NFTs, items
 */
import { ethers } from '../../frontend/node_modules/ethers/lib.esm/index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()];
  })
);

const RPC = env.RPC_URL || 'https://rpc-amoy.polygon.technology';
const ADDR = {
  Arena:   '0xCaB6d3a2d3EF5B08B621218814AE2Cfe5da9Bb2c',
  Lobster: '0xe1081f489744b12F4C3287C80D7bA3735189D294',
  Script:  '0x9208C94e871B35131Ba79361649a81BC6e9097c2',
  Utility: '0x14500c8Cd19a5fb15E478060d891cf091C44cd72',
};

const provider = new ethers.JsonRpcProvider(RPC);
const owner  = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
const player = new ethers.Wallet(env.BABATA_PRIVATE_KEY, provider);

const arenaABI = [
  'function playMatch(uint256,uint256,uint8) payable',
  'function getPlayer(address) view returns (tuple(bytes16 name, uint256 rating, uint256 coins, int256 streak, uint8 season, uint256 itemMask, int8 equippedNameplate, uint256 totalMatches, uint32 wins, uint32 totalKills, uint256 achievements, uint256 heroTokenId, uint256 scriptTokenId, uint56 poolIndex))',
  'function entryFee() view returns (uint256)',
  'function addCoins(address,uint256)',
];
const lobsterABI = [
  'function mint(bytes12 name) returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function getLobsterStats(uint256) view returns (uint256)',
  'function getLobsterName(uint256) view returns (bytes12)',
];
const scriptABI = [
  'function mintScript(bytes) returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function getScriptBytes(uint256) view returns (bytes)',
  'function scriptName(uint256) view returns (bytes12)',
];
const utilityABI = ['function buyItem(uint8)'];

function arena(s) { return new ethers.Contract(ADDR.Arena, arenaABI, s || provider); }
function lobster(s) { return new ethers.Contract(ADDR.Lobster, lobsterABI, s || provider); }
function script(s) { return new ethers.Contract(ADDR.Script, scriptABI, s || provider); }
function utility(s) { return new ethers.Contract(ADDR.Utility, utilityABI, s || provider); }

async function gas(w) {
  const f = await w.provider.getFeeData();
  return { gasPrice: (f.gasPrice ?? 30000000000n) * 12n / 10n };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message?.slice(0, 150)}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }

// ── Encode a simple script: attack nearest, move center ──
function makeSimpleScript() {
  const b = new Uint8Array(1 + 8 + 1 + 47 * 2);
  b[0] = 1;       // 1 slot
  b[1] = 7;       // sortBy = DIST
  b[9] = 2;       // 2 rules
  const r0 = 10;
  b[r0] = 2; b[r0+1] = 7; b[r0+5] = 6; b[r0+6] = 0; b[r0+7] = 4;
  b[r0+44] = 2; b[r0+46] = 2; // ATTACK T0
  const r1 = 10 + 47;
  b[r1+44] = 3; b[r1+45] = 6; // MOVE CENTER
  return b;
}

console.log('🦞 ClawKing — Supplementary Tests');
console.log(`   Player: ${player.address}\n`);

// ── Ensure player has coins ──
console.log('📋 A. Setup');
await test('Add 20000 coins to player', async () => {
  const g = await gas(owner);
  const tx = await arena(owner).addCoins(player.address, 20000, g);
  await tx.wait();
});

// ── Mint Script NFT ──
console.log('\n📋 B. Mint Script NFT');
let mintedScriptId;
await test('Mint script NFT with custom strategy', async () => {
  const g = await gas(player);
  const bytes = makeSimpleScript();
  const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const before = await script().totalSupply();
  const tx = await script(player).mintScript(hex, g);
  const r = await tx.wait();
  assert(r.status === 1);
  const after = await script().totalSupply();
  mintedScriptId = Number(after) - 1;
  assert(Number(after) === Number(before) + 1, `Supply didn't increase`);
});

await test('Minted script owned by player', async () => {
  const o = await script().ownerOf(mintedScriptId);
  assert(o.toLowerCase() === player.address.toLowerCase());
});

await test('Minted script has valid bytes', async () => {
  const b = await script().getScriptBytes(mintedScriptId);
  assert(b.length > 10, 'Script bytes too short');
});

// ── Mint Lobster NFT ──
console.log('\n📋 C. Mint Lobster NFT (with name)');
let mintedHeroId;
await test('Mint lobster NFT named "TestHero"', async () => {
  const g = await gas(player);
  const name = ethers.encodeBytes32String('TestHero').slice(0, 26); // bytes12
  const before = await lobster().totalSupply();
  const tx = await lobster(player).mint(name, g);
  const r = await tx.wait();
  assert(r.status === 1);
  const after = await lobster().totalSupply();
  mintedHeroId = Number(after) - 1;
});

await test('Lobster owned by player', async () => {
  const o = await lobster().ownerOf(mintedHeroId);
  assert(o.toLowerCase() === player.address.toLowerCase());
});

await test('Lobster has stats', async () => {
  const s = await lobster().getLobsterStats(mintedHeroId);
  assert(s > 0n);
  // Verify HP > 0 (bits 0:8)
  const hp = Number(s & 0xFFn);
  assert(hp >= 10, `HP should be >= 10, got ${hp}`);
});

await test('Lobster name stored', async () => {
  const raw = await lobster().getLobsterName(mintedHeroId);
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (b === 0) break;
    bytes.push(b);
  }
  const name = new TextDecoder().decode(new Uint8Array(bytes));
  assert(name === 'TestHero', `Expected TestHero, got ${name}`);
});

// ── Play match with custom hero + custom script ──
console.log('\n📋 D. Play with Custom NFTs');
await test('Play match with minted hero + minted script', async () => {
  const fee = await arena().entryFee();
  const g = await gas(player);
  const tx = await arena(player).playMatch(mintedHeroId, mintedScriptId, 0, { ...g, value: fee });
  const r = await tx.wait();
  assert(r.status === 1);
});

await test('Player data updated (heroTokenId/scriptTokenId stored)', async () => {
  const p = await arena().getPlayer(player.address);
  assert(Number(p.heroTokenId) === mintedHeroId, `heroTokenId mismatch: ${p.heroTokenId} vs ${mintedHeroId}`);
  assert(Number(p.scriptTokenId) === mintedScriptId, `scriptTokenId mismatch: ${p.scriptTokenId} vs ${mintedScriptId}`);
});

// ── Buy items + play with items ──
console.log('\n📋 E. Items in Match');
await test('Buy entry ticket (2000 coins)', async () => {
  const g = await gas(player);
  const p = await arena().getPlayer(player.address);
  const hasTkt = (BigInt(p.itemMask) & (1n << 64n)) !== 0n;
  if (hasTkt) { console.log('    (already owned, skip)'); return; }
  const tx = await utility(player).buyItem(64, g);
  await tx.wait();
});

await test('Buy rank shield (800 coins)', async () => {
  const g = await gas(player);
  const p = await arena().getPlayer(player.address);
  const has = (BigInt(p.itemMask) & (1n << 65n)) !== 0n;
  if (has) { console.log('    (already owned, skip)'); return; }
  const tx = await utility(player).buyItem(65, g);
  await tx.wait();
});

await test('Buy rating boost (1000 coins)', async () => {
  const g = await gas(player);
  const p = await arena().getPlayer(player.address);
  const has = (BigInt(p.itemMask) & (1n << 66n)) !== 0n;
  if (has) { console.log('    (already owned, skip)'); return; }
  const tx = await utility(player).buyItem(66, g);
  await tx.wait();
});

await test('Buy coin boost (50 coins)', async () => {
  const g = await gas(player);
  const p = await arena().getPlayer(player.address);
  const has = (BigInt(p.itemMask) & (1n << 67n)) !== 0n;
  if (has) { console.log('    (already owned, skip)'); return; }
  const tx = await utility(player).buyItem(67, g);
  await tx.wait();
});

await test('Verify all 4 items owned', async () => {
  const p = await arena().getPlayer(player.address);
  const m = BigInt(p.itemMask);
  assert((m & (1n << 64n)) !== 0n, 'Missing entry ticket');
  assert((m & (1n << 65n)) !== 0n, 'Missing rank shield');
  assert((m & (1n << 66n)) !== 0n, 'Missing rating boost');
  assert((m & (1n << 67n)) !== 0n, 'Missing coin boost');
});

await test('Play match with FREE TICKET (no POL needed)', async () => {
  const g = await gas(player);
  // itemFlags: bit 0 = entry ticket (1 << (64-64) = 1)
  const tx = await arena(player).playMatch(mintedHeroId, mintedScriptId, 1, { ...g, value: 0 });
  const r = await tx.wait();
  assert(r.status === 1);
});

await test('Entry ticket consumed', async () => {
  const p = await arena().getPlayer(player.address);
  assert((BigInt(p.itemMask) & (1n << 64n)) === 0n, 'Ticket should be consumed');
});

await test('Play match with rank shield + rating boost + coin boost', async () => {
  const fee = await arena().entryFee();
  const g = await gas(player);
  // itemFlags: bit 1=shield(2), bit 2=rating(4), bit 3=coin(8) = 14
  const tx = await arena(player).playMatch(mintedHeroId, mintedScriptId, 14, { ...g, value: fee });
  const r = await tx.wait();
  assert(r.status === 1);
});

await test('Consumable items consumed after use', async () => {
  const p = await arena().getPlayer(player.address);
  const m = BigInt(p.itemMask);
  // coin boost is always consumed, rank shield consumed if lost, rating boost consumed if won
  // At least coin boost should be gone
  assert((m & (1n << 67n)) === 0n, 'Coin boost should be consumed');
});

// ── Play with mixed: default hero + custom script ──
console.log('\n📋 F. Mixed NFT Combos');
await test('Default hero 5 + custom script', async () => {
  const fee = await arena().entryFee();
  const g = await gas(player);
  const tx = await arena(player).playMatch(5, mintedScriptId, 0, { ...g, value: fee });
  const r = await tx.wait();
  assert(r.status === 1);
});

await test('Custom hero + default script 3', async () => {
  const fee = await arena().entryFee();
  const g = await gas(player);
  const tx = await arena(player).playMatch(mintedHeroId, 3, 0, { ...g, value: fee });
  const r = await tx.wait();
  assert(r.status === 1);
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`🏁 Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
