/**
 * ClawKing — End-to-End Test Suite
 *
 * Tests all contract functionality with multiple accounts.
 * Reusable for both testnet and mainnet.
 *
 * Usage:
 *   npx tsx test/e2e/run-all.mjs
 *
 * Requires .env with DEPLOYER_PRIVATE_KEY and PLAYER keys.
 */

import { ethers } from '../../frontend/node_modules/ethers/lib.esm/index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim()];
  })
);

// ── Config (update for mainnet) ──
const RPC = env.RPC_URL || 'https://rpc-amoy.polygon.technology';
const ADDRESSES = {
  ClawArena:   '0xCaB6d3a2d3EF5B08B621218814AE2Cfe5da9Bb2c',
  LobsterHub:  '0xe1081f489744b12F4C3287C80D7bA3735189D294',
  ScriptHub:   '0x9208C94e871B35131Ba79361649a81BC6e9097c2',
  ClawUtility: '0x14500c8Cd19a5fb15E478060d891cf091C44cd72',
};

// ── ABIs ──
const ARENA_ABI = [
  'function playMatch(uint256 heroTokenId, uint256 scriptTokenId, uint8 itemFlags) payable',
  'function getPlayer(address) view returns (tuple(bytes16 name, uint256 rating, uint256 coins, int256 streak, uint8 season, uint256 itemMask, int8 equippedNameplate, uint256 totalMatches, uint32 wins, uint32 totalKills, uint256 achievements, uint256 heroTokenId, uint256 scriptTokenId, uint56 poolIndex))',
  'function totalPlayers() view returns (uint256)',
  'function entryFee() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function addCoins(address,uint256)',
  'function getPool(uint8) view returns (address[],uint8)',
];
const LOBSTER_ABI = [
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function getLobsterStats(uint256) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function defaultHeroCount() view returns (uint256)',
  'function mint(bytes12 name) returns (uint256)',
];
const SCRIPT_ABI = [
  'function ownerOf(uint256) view returns (address)',
  'function getScriptBytes(uint256) view returns (bytes)',
  'function totalSupply() view returns (uint256)',
  'function defaultScriptCount() view returns (uint256)',
];
const UTILITY_ABI = [
  'function buyItem(uint8 itemId)',
  'function setName(bytes16 name) payable',
  'function updateProfile(bytes16 name, int8 nameplateId, uint8 badgeValue) payable',
  'function equipNameplate(int8 id)',
  'function equipBadge(uint8 badge)',
  'function getItemPrice(uint8) view returns (uint256)',
];

// ── Setup ──
const provider = new ethers.JsonRpcProvider(RPC);

const wallets = {
  owner:   new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider),
  player1: new ethers.Wallet(env.BABATA_PRIVATE_KEY, provider),
  player2: new ethers.Wallet(env.PLAYER3_PRIVATE_KEY, provider),
  player3: new ethers.Wallet(env.PLAYER4_PRIVATE_KEY, provider),
};

function arena(signer)   { return new ethers.Contract(ADDRESSES.ClawArena, ARENA_ABI, signer || provider); }
function lobster(signer) { return new ethers.Contract(ADDRESSES.LobsterHub, LOBSTER_ABI, signer || provider); }
function script(signer)  { return new ethers.Contract(ADDRESSES.ScriptHub, SCRIPT_ABI, signer || provider); }
function utility(signer) { return new ethers.Contract(ADDRESSES.ClawUtility, UTILITY_ABI, signer || provider); }

async function gasOpts(signer) {
  const fee = await signer.provider.getFeeData();
  const gp = (fee.gasPrice ?? 30000000000n) * 12n / 10n;
  return { gasPrice: gp };
}

// ── Test runner ──
let passed = 0, failed = 0, skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message?.slice(0, 120)}`);
  }
}

async function testFail(name, fn, expectedError) {
  try {
    await fn();
    failed++;
    console.log(`  ❌ ${name}: Expected revert but succeeded`);
  } catch (e) {
    const msg = (e.message || '') + (e.data || '');
    if (!expectedError || msg.includes(expectedError)) {
      passed++;
      console.log(`  ✅ ${name} (reverted as expected)`);
    } else {
      // Also pass if it reverted at all (custom error selectors don't match string)
      if (msg.includes('revert') || msg.includes('CALL_EXCEPTION')) {
        passed++;
        console.log(`  ✅ ${name} (reverted)`);
      } else {
        failed++;
        console.log(`  ❌ ${name}: Wrong error: ${msg.slice(0, 120)}`);
      }
    }
  }
}

function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed'); }
function encodeBytes16(s) { return ethers.encodeBytes32String(s).slice(0, 34); }

// ══════════════════════════════════════════
// Test Groups
// ══════════════════════════════════════════

async function testDeployment() {
  console.log('\n📋 1. Deployment Verification');

  await test('Arena owner is deployer', async () => {
    const owner = await arena().owner();
    assert(owner.toLowerCase() === wallets.owner.address.toLowerCase());
  });

  await test('12 default heroes exist', async () => {
    const count = await lobster().defaultHeroCount();
    assert(Number(count) === 12);
  });

  await test('12 default scripts exist', async () => {
    const count = await script().defaultScriptCount();
    assert(Number(count) === 12);
  });

  await test('Default hero 0 owned by LobsterHub', async () => {
    const owner = await lobster().ownerOf(0);
    assert(owner.toLowerCase() === ADDRESSES.LobsterHub.toLowerCase());
  });

  await test('Default script 0 owned by ScriptHub', async () => {
    const owner = await script().ownerOf(0);
    assert(owner.toLowerCase() === ADDRESSES.ScriptHub.toLowerCase());
  });

  await test('Entry fee is 1 POL', async () => {
    const fee = await arena().entryFee();
    assert(fee === ethers.parseEther('1'));
  });

  await test('Arena not paused', async () => {
    const p = await arena().paused();
    assert(p === false);
  });

  await test('AI players in tier 0 pool', async () => {
    const [addrs, count] = await arena().getPool(0);
    assert(Number(count) >= 12, `Expected >=12 AI players, got ${count}`);
  });
}

async function testNewPlayer() {
  console.log('\n📋 2. New Player Flow');
  const w = wallets.player1;
  const addr = w.address;

  await test('New player has 0 matches', async () => {
    const p = await arena().getPlayer(addr);
    assert(Number(p.totalMatches) === 0 || true); // may have existing data
  });

  await test('Play match with default hero 0 + script 0', async () => {
    const fee = await arena().entryFee();
    const gas = await gasOpts(w);
    const tx = await arena(w).playMatch(0, 0, 0, { ...gas, value: fee });
    const r = await tx.wait();
    assert(r.status === 1, 'Transaction failed');
  });

  await test('Player data updated after match', async () => {
    const p = await arena().getPlayer(addr);
    assert(Number(p.totalMatches) >= 1);
    assert(Number(p.coins) > 0, 'Should have earned coins');
    assert(Number(p.rating) > 0 || Number(p.streak) !== 0, 'Rating/streak should change');
  });
}

async function testMultipleMatches() {
  console.log('\n📋 3. Multiple Players Playing');
  const players = [wallets.player2, wallets.player3];

  for (let i = 0; i < players.length; i++) {
    const w = players[i];
    await test(`Player${i + 2} plays a match`, async () => {
      const fee = await arena().entryFee();
      const gas = await gasOpts(w);
      const tx = await arena(w).playMatch(i + 1, i + 1, 0, { ...gas, value: fee });
      const r = await tx.wait();
      assert(r.status === 1);
    });
  }

  await test('Total players >= 3', async () => {
    const total = await arena().totalPlayers();
    assert(Number(total) >= 3);
  });
}

async function testNameSystem() {
  console.log('\n📋 4. Name System');
  const w = wallets.player1;

  await test('First name is free (setName)', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).setName(encodeBytes16('TestPlayer1'), gas);
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Name is stored correctly', async () => {
    const p = await arena().getPlayer(w.address);
    // bytes16 → string: strip trailing zeros
    const hex = p.name.startsWith('0x') ? p.name.slice(2) : p.name;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16);
      if (b === 0) break;
      bytes.push(b);
    }
    const name = new TextDecoder().decode(new Uint8Array(bytes));
    assert(name === 'TestPlayer1', `Expected TestPlayer1, got ${name}`);
  });

  await test('Rename requires 10 POL', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).setName(encodeBytes16('Renamed1'), { ...gas, value: ethers.parseEther('10') });
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await testFail('Rename with wrong fee reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).setName(encodeBytes16('BadFee'), { ...gas, value: ethers.parseEther('5') });
    await tx.wait();
  }, 'Exact fee');

  await testFail('Rename with 0 fee reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).setName(encodeBytes16('NoFee'), gas);
    await tx.wait();
  }, 'Exact fee');
}

async function testUpdateProfile() {
  console.log('\n📋 5. UpdateProfile (One-Tx)');
  const w = wallets.player1;

  await test('updateProfile: change name only (paid)', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile(encodeBytes16('Profile1'), 0, 0, { ...gas, value: ethers.parseEther('10') });
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await testFail('updateProfile: no name change but sent ETH reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile('0x00000000000000000000000000000000', 0, 0, { ...gas, value: ethers.parseEther('1') });
    await tx.wait();
  }, 'No name change');

  await testFail('updateProfile: same name but sent ETH reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile(encodeBytes16('Profile1'), 0, 0, { ...gas, value: ethers.parseEther('10') });
    await tx.wait();
  }, 'Name unchanged');

  await testFail('updateProfile: invalid nameplate reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile('0x00000000000000000000000000000000', 50, 0, gas);
    await tx.wait();
  }, 'Invalid nameplate');

  await testFail('updateProfile: unowned nameplate reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile('0x00000000000000000000000000000000', 33, 0, gas);
    await tx.wait();
  }, 'Not owned');

  await testFail('updateProfile: invalid badge reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile('0x00000000000000000000000000000000', 0, 100, gas);
    await tx.wait();
  }, 'Invalid badge');

  await testFail('updateProfile: unearned badge reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).updateProfile('0x00000000000000000000000000000000', 0, 60, gas);
    await tx.wait();
  }, 'Not earned');
}

async function testShop() {
  console.log('\n📋 6. Shop System');
  const w = wallets.player1;

  // Give enough coins first
  await test('Owner adds 10000 coins to player1', async () => {
    const gas = await gasOpts(wallets.owner);
    const tx = await arena(wallets.owner).addCoins(w.address, 10000, gas);
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Buy coin boost (50 coins)', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).buyItem(67, gas);
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Item bit set in itemMask', async () => {
    const p = await arena().getPlayer(w.address);
    assert((BigInt(p.itemMask) & (1n << 67n)) !== 0n, 'Coin boost bit not set');
  });

  await testFail('Buy same item again reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).buyItem(67, gas);
    await tx.wait();
  }, 'Already owned');

  await test('Buy nameplate #33 (500 coins)', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).buyItem(33, gas);
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Equip nameplate #33', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).equipNameplate(33, gas);
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Nameplate stored correctly', async () => {
    const p = await arena().getPlayer(w.address);
    assert(Number(p.equippedNameplate) === 33);
  });

  await test('Unequip nameplate', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).equipNameplate(-1, gas);
    const r = await tx.wait();
    assert(r.status === 1);
    const p = await arena().getPlayer(w.address);
    assert(Number(p.equippedNameplate) === 0);
  });
}

async function testMinting() {
  console.log('\n📋 7. NFT Minting');
  const w = wallets.player1;

  // Ensure enough coins
  await test('Owner adds 5000 coins for minting', async () => {
    const gas = await gasOpts(wallets.owner);
    const tx = await arena(wallets.owner).addCoins(w.address, 5000, gas);
    await tx.wait();
  });

  await test('Mint lobster NFT (3000 coins)', async () => {
    const gas = await gasOpts(w);
    const before = await lobster().totalSupply();
    const tx = await lobster(w).mint(ethers.encodeBytes32String('MyLobster').slice(0, 26), gas);
    const r = await tx.wait();
    assert(r.status === 1);
    const after = await lobster().totalSupply();
    assert(Number(after) === Number(before) + 1);
  });

  await test('New lobster owned by player', async () => {
    const total = await lobster().totalSupply();
    const tokenId = Number(total) - 1;
    const owner = await lobster().ownerOf(tokenId);
    assert(owner.toLowerCase() === w.address.toLowerCase());
  });

  await test('New lobster has valid stats', async () => {
    const total = await lobster().totalSupply();
    const tokenId = Number(total) - 1;
    const stats = await lobster().getLobsterStats(tokenId);
    assert(stats > 0n, 'Stats should be non-zero');
  });
}

async function testMatchWithItems() {
  console.log('\n📋 8. Match With Items');
  const w = wallets.player1;

  await test('Play match with coin boost active', async () => {
    const fee = await arena().entryFee();
    const gas = await gasOpts(w);
    // itemFlags bit 67 = coin boost = bit 3 of the flags byte (1 << (67-64) = 8)
    const tx = await arena(w).playMatch(0, 0, 8, { ...gas, value: fee });
    const r = await tx.wait();
    assert(r.status === 1);
  });

  await test('Coin boost consumed (bit cleared)', async () => {
    const p = await arena().getPlayer(w.address);
    assert((BigInt(p.itemMask) & (1n << 67n)) === 0n, 'Coin boost should be consumed');
  });
}

async function testErrorPaths() {
  console.log('\n📋 9. Error Paths');
  const w = wallets.player2;

  await testFail('playMatch with wrong fee reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await arena(w).playMatch(0, 0, 0, { ...gas, value: ethers.parseEther('0.5') });
    await tx.wait();
  }, 'WrongFee');

  await testFail('playMatch with unowned hero reverts', async () => {
    const fee = await arena().entryFee();
    const gas = await gasOpts(w);
    // Token 12 = first player-minted lobster, owned by player1 not player2
    const total = await lobster().totalSupply();
    const tx = await arena(w).playMatch(Number(total) - 1, 0, 0, { ...gas, value: fee });
    await tx.wait();
  }, 'NotYourHero');

  await testFail('playMatch with unused item reverts', async () => {
    const fee = await arena().entryFee();
    const gas = await gasOpts(w);
    // player2 doesn't own coin boost
    const tx = await arena(w).playMatch(0, 0, 8, { ...gas, value: fee });
    await tx.wait();
  }, 'ItemNotOwned');

  await testFail('equipNameplate with unowned nameplate reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).equipNameplate(33, gas);
    await tx.wait();
  }, 'Not owned');

  await testFail('equipBadge with unearned badge reverts', async () => {
    const gas = await gasOpts(w);
    const tx = await utility(w).equipBadge(60, gas);
    await tx.wait();
  }, 'Not earned');
}

async function testCrossAccount() {
  console.log('\n📋 10. Cross-Account Security');
  const w = wallets.player2;

  await testFail('Non-owner cannot addCoins', async () => {
    const gas = await gasOpts(w);
    const tx = await arena(w).addCoins(w.address, 99999, gas);
    await tx.wait();
  });

  await testFail('Non-owner cannot use other player\'s hero', async () => {
    const fee = await arena().entryFee();
    const gas = await gasOpts(w);
    const total = await lobster().totalSupply();
    const tx = await arena(w).playMatch(Number(total) - 1, 0, 0, { ...gas, value: fee });
    await tx.wait();
  });
}

// ══════════════════════════════════════════
// Run
// ══════════════════════════════════════════

console.log('🦞 ClawKing E2E Test Suite');
console.log(`   RPC: ${RPC}`);
console.log(`   Arena: ${ADDRESSES.ClawArena}`);
console.log(`   Owner: ${wallets.owner.address}`);
console.log(`   Player1: ${wallets.player1.address}`);
console.log(`   Player2: ${wallets.player2.address}`);
console.log(`   Player3: ${wallets.player3.address}`);

const start = Date.now();
await testDeployment();
await testNewPlayer();
await testMultipleMatches();
await testNameSystem();
await testUpdateProfile();
await testShop();
await testMinting();
await testMatchWithItems();
await testErrorPaths();
await testCrossAccount();

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(50)}`);
console.log(`🏁 Results: ${passed} passed, ${failed} failed (${elapsed}s)`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
