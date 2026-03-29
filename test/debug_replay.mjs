/**
 * Debug script: fetch Room data from Amoy testnet, run JS engine, check output.
 * Usage: node test/debug_replay.mjs [roomId]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ethers } = require('../frontend/node_modules/ethers');

const RPC_URL = 'https://rpc-amoy.polygon.technology';
const ARENA_ADDR = '0x3C3D2552bbdFeEa59C85b619A24afE2472c69945';
const LOBSTER_ADDR = '0xe3e94cc5C142fd383dC2EE378fa5A61072b57dF9';
const SCRIPT_ADDR = '0x501DABAC8cc2800cfe819bC3ED005B8e39D223f3';

const ARENA_ABI = [
  'function getRoom(uint256 roomId) view returns (tuple(address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds, uint8[8] itemFlags, uint8 playerCount, uint32 seed, uint8[8] rankings, int16[8] ratingChanges, uint16[8] coinsEarned))',
];
const LOBSTER_ABI = [
  'function getLobsterStats(uint256 tokenId) view returns (uint256)',
];
const SCRIPT_ABI = [
  'function getScriptBytes(uint256 tokenId) view returns (bytes)',
];

const roomId = parseInt(process.argv[2] || '6');

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const arena = new ethers.Contract(ARENA_ADDR, ARENA_ABI, provider);
  const lobster = new ethers.Contract(LOBSTER_ADDR, LOBSTER_ABI, provider);
  const scriptHub = new ethers.Contract(SCRIPT_ADDR, SCRIPT_ABI, provider);

  console.log(`=== Fetching Room ${roomId} ===`);
  const room = await arena.getRoom(roomId);
  console.log(`playerCount: ${room.playerCount}`);
  console.log(`seed: ${room.seed}`);
  console.log(`rankings: [${room.rankings.join(', ')}]`);
  console.log();

  // Fetch all data
  const stats = [];
  const scripts = [];

  for (let i = 0; i < 8; i++) {
    const heroId = Number(room.heroTokenIds[i]);
    const scriptId = Number(room.scriptTokenIds[i]);
    console.log(`Player ${i}: hero=${heroId}, script=${scriptId}, player=${room.players[i]}`);

    const packed = await lobster.getLobsterStats(heroId);
    stats.push(packed);

    const hp = Number(packed & 0xFFn);
    const atk = Number((packed >> 8n) & 0xFFn);
    const atkRange = Number((packed >> 16n) & 0xFFn);
    const speed = Number((packed >> 24n) & 0xFFn);
    const manaMax = Number((packed >> 32n) & 0xFFn);
    const skillEffect = Number((packed >> 40n) & 0xFFFFn);
    const skillPower = Number((packed >> 56n) & 0xFFn);
    console.log(`  stats: hp=${hp} atk=${atk} range=${atkRange} speed=${speed} mana=${manaMax} skill=${skillEffect}/${skillPower}`);

    const bytesHex = await scriptHub.getScriptBytes(scriptId);
    const bytes = ethers.getBytes(bytesHex);
    scripts.push(bytes);
    console.log(`  script: ${bytes.length} bytes, first 20: [${Array.from(bytes.slice(0, 20)).join(', ')}]`);

    if (bytes.length > 0) {
      const numSlots = bytes[0];
      const SLOT_SIZE = 8;
      const rulesOffset = 1 + numSlots * SLOT_SIZE;
      if (rulesOffset < bytes.length) {
        const numRules = bytes[rulesOffset];
        console.log(`  script decoded: numSlots=${numSlots}, numRules=${numRules}`);
      } else {
        console.log(`  script decoded: numSlots=${numSlots}, rulesOffset=${rulesOffset} >= len=${bytes.length} -> NO RULES`);
      }
    }
    console.log();
  }

  // Now run the engine
  console.log('=== Running JS Engine ===');

  // Import engine modules (ESM from frontend/src/engine)
  // We can't directly import TS files, so let's just do the logic inline

  // -- Minimal engine run --
  // Since we can't import TS modules, let's just analyze the script data
  console.log('\n=== Script Analysis ===');
  for (let i = 0; i < 8; i++) {
    const s = scripts[i];
    if (s.length === 0) {
      console.log(`Player ${i}: EMPTY SCRIPT -> will always DEFEND`);
      continue;
    }
    const numSlots = s[0];
    const SLOT_SIZE = 8;
    const rulesOffset = 1 + numSlots * SLOT_SIZE;
    if (rulesOffset >= s.length) {
      console.log(`Player ${i}: numSlots=${numSlots} but no rules data -> will always DEFEND`);
      continue;
    }
    const numRules = s[rulesOffset];
    if (numRules === 0) {
      console.log(`Player ${i}: numRules=0 -> will always DEFEND`);
      continue;
    }

    const COND_SIZE = 11;
    const RULE_SIZE = 47; // 4 * COND_SIZE + 3
    const rulesStart = rulesOffset + 1;

    console.log(`Player ${i}: ${numSlots} slots, ${numRules} rules, ${s.length} bytes total`);

    for (let ri = 0; ri < numRules && ri < 5; ri++) {
      const ruleBase = rulesStart + ri * RULE_SIZE;
      if (ruleBase + RULE_SIZE > s.length) {
        console.log(`  Rule ${ri}: truncated (need ${ruleBase + RULE_SIZE}, have ${s.length})`);
        break;
      }
      const ab = ruleBase + 4 * COND_SIZE;
      const action = s[ab];
      const actionArg = s[ab + 1];
      const targetSub = s[ab + 2];
      const ACTION_NAMES = ['idle', 'defend', 'attack', 'move', 'blink'];
      console.log(`  Rule ${ri}: action=${ACTION_NAMES[action] || action}, arg=${actionArg}, target=sub${targetSub}`);

      // Check conditions
      for (let ci = 0; ci < 4; ci++) {
        const cb = ruleBase + ci * COND_SIZE;
        const cmp = s[cb + 5];
        if (cmp === 0) continue; // SKIP
        const lSub = s[cb];
        const lProp = s[cb + 1];
        const lOp = s[cb + 2];
        const lVal = (s[cb + 3] << 8) | s[cb + 4];
        const rSub = s[cb + 6];
        const rProp = s[cb + 7];
        const rOp = s[cb + 8];
        const rVal = (s[cb + 9] << 8) | s[cb + 10];
        const CMP_NAMES = ['skip', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
        console.log(`    Cond ${ci}: sub${lSub}.prop${lProp} ${CMP_NAMES[cmp] || cmp} sub${rSub}.prop${rProp} (vals: ${lVal}, ${rVal})`);
      }
    }
  }

  // Check visibility: with spawn radius 9, initial manhattan distance between neighbors
  console.log('\n=== Spawn Distance Analysis ===');
  const SPAWN_X = [9, 6, 0, -6, -9, -6, 0, 6];
  const SPAWN_Y = [0, 6, 9, 6, 0, -6, -9, -6];
  for (let i = 0; i < 8; i++) {
    const hp = Number(stats[i] & 0xFFn);
    const atk = Number((stats[i] >> 8n) & 0xFFn);
    const range = Number((stats[i] >> 16n) & 0xFFn);
    let minDist = Infinity;
    for (let j = 0; j < 8; j++) {
      if (i === j) continue;
      const dist = Math.abs(SPAWN_X[i] - SPAWN_X[j]) + Math.abs(SPAWN_Y[i] - SPAWN_Y[j]);
      if (dist < minDist) minDist = dist;
    }
    console.log(`Player ${i}: spawn(${SPAWN_X[i]},${SPAWN_Y[i]}) range=${range} nearest_dist=${minDist} can_see=${range >= minDist ? 'YES' : 'NO (range < dist)'}`);
  }
}

main().catch(console.error);
