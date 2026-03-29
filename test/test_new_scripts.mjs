/**
 * Test new default scripts locally using the JS engine.
 * Simulates a game with the updated scripts that include "move to center" fallback.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ethers } = require('../frontend/node_modules/ethers');

// ── Build new script bytecodes matching updated DefaultData.sol ──

function setCond(b, off, lSub, lProp, lOp, lVal, cmp, rSub, rProp, rOp, rVal) {
  b[off] = lSub;
  b[off + 1] = lProp;
  b[off + 2] = lOp;
  b[off + 3] = (lVal >> 8) & 0xFF;
  b[off + 4] = lVal & 0xFF;
  b[off + 5] = cmp;
  b[off + 6] = rSub;
  b[off + 7] = rProp;
  b[off + 8] = rOp;
  b[off + 9] = (rVal >> 8) & 0xFF;
  b[off + 10] = rVal & 0xFF;
}

function setAction(b, ruleBase, action, arg, target) {
  const ab = ruleBase + 44;
  b[ab] = action;
  b[ab + 1] = arg;
  b[ab + 2] = target;
}

function aggressiveScript() {
  const numRules = 2;
  const b = new Uint8Array(1 + 8 + 1 + 47 * numRules);
  b[0] = 1; // numSlots
  b[1] = 7; // sortBy=DIST
  b[9] = numRules;

  const r0 = 10;
  setCond(b, r0, 0x00, 24, 0, 0, 3, 0xFF, 0, 0, 0); // SELF.VISIBLE_COUNT > 0
  setAction(b, r0, 2, 0, 2); // ATTACK T0

  const r1 = 10 + 47;
  setAction(b, r1, 3, 6, 0); // MOVE DIR_CENTER

  return b;
}

function defensiveScript() {
  const numRules = 3;
  const b = new Uint8Array(1 + 8 + 1 + 47 * numRules);
  b[0] = 1;
  b[9] = numRules;

  const r0 = 10;
  setCond(b, r0, 0x00, 2, 0, 0, 5, 0xFF, 0, 0, 30); // SELF.HP_PCT < 30
  setAction(b, r0, 1, 0, 0); // DEFEND

  const r1 = 10 + 47;
  setCond(b, r1, 0x00, 24, 0, 0, 3, 0xFF, 0, 0, 0); // SELF.VISIBLE_COUNT > 0
  setAction(b, r1, 2, 0, 2); // ATTACK T0

  const r2 = 10 + 47 * 2;
  setAction(b, r2, 3, 6, 0); // MOVE DIR_CENTER

  return b;
}

function kitingScript() {
  const numRules = 3;
  const b = new Uint8Array(1 + 8 + 1 + 47 * numRules);
  b[0] = 1;
  b[1] = 7; // sortBy=DIST
  b[9] = numRules;

  const r0 = 10;
  setCond(b, r0, 0x02, 7, 0, 0, 6, 0xFF, 0, 0, 2); // T0.DIST <= 2
  setAction(b, r0, 3, 1, 2); // MOVE AWAY from T0

  const r1 = 10 + 47;
  setCond(b, r1, 0x00, 24, 0, 0, 3, 0xFF, 0, 0, 0); // VISIBLE_COUNT > 0
  setAction(b, r1, 2, 0, 2); // ATTACK T0

  const r2 = 10 + 47 * 2;
  setAction(b, r2, 3, 6, 0); // MOVE DIR_CENTER

  return b;
}

// ── Fetch Room 6 hero stats from chain, then run with new scripts ──

const RPC_URL = 'https://rpc-amoy.polygon.technology';
const LOBSTER_ADDR = '0xe3e94cc5C142fd383dC2EE378fa5A61072b57dF9';
const ARENA_ADDR = '0x3C3D2552bbdFeEa59C85b619A24afE2472c69945';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lobster = new ethers.Contract(LOBSTER_ADDR, [
    'function getLobsterStats(uint256 tokenId) view returns (uint256)',
  ], provider);
  const arena = new ethers.Contract(ARENA_ADDR, [
    'function getRoom(uint256 roomId) view returns (tuple(address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds, uint8[8] itemFlags, uint8 playerCount, uint32 seed, uint8[8] rankings, int16[8] ratingChanges, uint16[8] coinsEarned))',
  ], provider);

  const room = await arena.getRoom(6);
  const seed = Number(room.seed);

  // Fetch stats
  const stats = [];
  for (let i = 0; i < 8; i++) {
    const packed = await lobster.getLobsterStats(Number(room.heroTokenIds[i]));
    stats.push(packed);
  }

  // Build scripts: assign based on original script mapping
  const scriptMap = [0, 0, 1, 2, 0, 1, 2, 0]; // from room data
  const scriptBuilders = [aggressiveScript, defensiveScript, kitingScript];
  const scripts = scriptMap.map(si => scriptBuilders[si]());

  // ── Minimal engine simulation ──
  // We need to do this inline since we can't import TS

  const PLAYERS_PER_MATCH = 8;
  const MAP_HALF = 10;
  const MAX_TURNS = 40;
  const RING_START_RADIUS = 12;
  const RING_SHRINK_INTERVAL = 3;
  const RING_DMG_DIVISOR = 5;
  const SPAWN_X = [9, 6, 0, -6, -9, -6, 0, 6];
  const SPAWN_Y = [0, 6, 9, 6, 0, -6, -9, -6];

  // Simple xorshift32
  let rng = seed ^ (seed << 13); rng ^= rng >>> 17; rng ^= rng << 5; rng = rng >>> 0;
  function nextRng() {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; rng = rng >>> 0;
    return rng;
  }

  // Shuffle spawns
  const sx = [...SPAWN_X];
  const sy = [...SPAWN_Y];
  for (let i = 7; i > 0; i--) {
    const val = nextRng();
    const j = val % (i + 1);
    [sx[i], sx[j]] = [sx[j], sx[i]];
    [sy[i], sy[j]] = [sy[j], sy[i]];
  }

  // Create entities
  const ents = [];
  for (let i = 0; i < 8; i++) {
    const p = stats[i];
    ents.push({
      idx: i,
      x: sx[i], y: sy[i],
      hp: Number(p & 0xFFn),
      atk: Number((p >> 8n) & 0xFFn),
      atkRange: Number((p >> 16n) & 0xFFn),
      speed: Number((p >> 24n) & 0xFFn),
      manaMax: Number((p >> 32n) & 0xFFn),
      skillEffect: Number((p >> 40n) & 0xFFFFn),
      skillPower: Number((p >> 56n) & 0xFFn),
      currentHp: Number(p & 0xFFn),
      mana: 0, exposure: 0, statusFlags: 0, blinkCooldown: 0,
      lastAction: 0, alive: true, kills: 0, exp: 0, level: 0,
      deathTurn: 0, lastAtkIdx: 255, lastTgtIdx: 255,
    });
  }

  console.log('=== Spawn positions ===');
  for (let i = 0; i < 8; i++) {
    console.log(`P${i}: (${ents[i].x}, ${ents[i].y}) hp=${ents[i].hp} atk=${ents[i].atk} range=${ents[i].atkRange}`);
  }

  // Sort action order
  const actionOrder = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = 1; i < 8; i++) {
    const key = actionOrder[i];
    const keySpd = ents[key].speed;
    let j = i;
    while (j > 0) {
      const prev = actionOrder[j - 1];
      const prevSpd = ents[prev].speed;
      if (prevSpd > keySpd) break;
      if (prevSpd === keySpd) {
        const tieVal = nextRng();
        if ((tieVal & 1) === 0) break;
      }
      actionOrder[j] = prev;
      j--;
    }
    actionOrder[j] = key;
  }

  console.log(`Action order: [${actionOrder.join(',')}]`);

  // Simple script executor matching the JS engine logic
  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function getVisibleIndices(selfIdx) {
    const self = ents[selfIdx];
    const result = [];
    if ((self.statusFlags & 0x0004) !== 0) return result; // blind
    for (let i = 0; i < 8; i++) {
      if (i === selfIdx) continue;
      if (!ents[i].alive) continue;
      if ((ents[i].statusFlags & 0x0100) !== 0) continue; // stealth
      if (manhattan(self, ents[i]) <= self.atkRange + ents[i].exposure) {
        result.push(i);
      }
    }
    return result;
  }

  // Simplified script execution
  function executeScript(selfIdx, script) {
    const result = { action: 1, actionArg: 0, targetIdx: 255 }; // DEFEND by default
    if (script.length === 0) return result;

    let numSlots = script[0];
    if (numSlots > 8) numSlots = 8;
    const rulesOffset = 1 + numSlots * 8;
    if (rulesOffset >= script.length) return result;
    let numRules = script[rulesOffset];
    if (numRules === 0) return result;
    if (numRules > 16) numRules = 16;
    const rulesStart = rulesOffset + 1;

    const vis = getVisibleIndices(selfIdx);

    // Compute slot 0 (nearest visible)
    let slot0 = 255;
    if (vis.length > 0) {
      const sortBy = script[1]; // first slot sortBy
      const order = script[2]; // 0=asc, 1=desc
      let bestVal = order === 0 ? 32767 : -32768;
      for (const vi of vis) {
        let sv;
        if (sortBy === 7) sv = manhattan(ents[selfIdx], ents[vi]); // DIST
        else if (sortBy === 0) sv = ents[vi].currentHp; // HP
        else sv = 0;
        if (slot0 === 255 || (order === 0 ? sv < bestVal : sv > bestVal)) {
          slot0 = vi;
          bestVal = sv;
        }
      }
    }

    // Evaluate rules
    for (let ri = 0; ri < numRules; ri++) {
      const rb = rulesStart + ri * 47;
      if (rb + 47 > script.length) break;

      let ruleMatch = true;
      for (let ci = 0; ci < 4; ci++) {
        const cb = rb + ci * 11;
        const cmp = script[cb + 5];
        if (cmp === 0) continue; // SKIP

        // Get left value
        const lSub = script[cb];
        const lProp = script[cb + 1];
        let lVal;
        if (lSub === 255) { // CONSTANT
          lVal = (script[cb + 3] << 8) | script[cb + 4];
          if (lVal >= 0x8000) lVal -= 0x10000;
        } else if (lSub === 0) { // SELF
          lVal = getProp(lProp, selfIdx, vis);
        } else if (lSub === 2) { // T0
          if (slot0 === 255) { ruleMatch = false; break; }
          lVal = getProp(lProp, slot0, vis);
        } else {
          ruleMatch = false; break;
        }

        // Get right value
        const rSub = script[cb + 6];
        const rProp = script[cb + 7];
        let rVal;
        if (rSub === 255) {
          rVal = (script[cb + 9] << 8) | script[cb + 10];
          if (rVal >= 0x8000) rVal -= 0x10000;
        } else if (rSub === 0) {
          rVal = getProp(rProp, selfIdx, vis);
        } else if (rSub === 2) {
          if (slot0 === 255) { ruleMatch = false; break; }
          rVal = getProp(rProp, slot0, vis);
        } else {
          ruleMatch = false; break;
        }

        // Compare
        let pass;
        switch (cmp) {
          case 1: pass = lVal === rVal; break;
          case 2: pass = lVal !== rVal; break;
          case 3: pass = lVal > rVal; break;
          case 4: pass = lVal >= rVal; break;
          case 5: pass = lVal < rVal; break;
          case 6: pass = lVal <= rVal; break;
          default: pass = false;
        }
        if (!pass) { ruleMatch = false; break; }
      }

      if (ruleMatch) {
        const ab = rb + 44;
        result.action = script[ab];
        result.actionArg = script[ab + 1];
        // Resolve target
        const tSub = script[ab + 2];
        if (tSub === 0) result.targetIdx = selfIdx;
        else if (tSub === 2) result.targetIdx = slot0;
        else result.targetIdx = 255;
        return result;
      }
    }
    return result;
  }

  function getProp(prop, entIdx, vis) {
    const e = ents[entIdx];
    switch (prop) {
      case 0: return e.currentHp;
      case 1: return e.hp;
      case 2: return e.hp > 0 ? Math.trunc(e.currentHp * 100 / e.hp) : 0;
      case 3: return e.atk;
      case 7: return manhattan(ents[0], e); // approximate
      case 24: return vis.length; // VISIBLE_COUNT
      default: return 0;
    }
  }

  // ── Run turns ──
  let aliveCount = 8;
  let ringRadius = RING_START_RADIUS;
  const ACTION_NAMES = ['idle', 'defend', 'attack', 'move', 'blink'];

  console.log('\n=== Game Turns ===');
  let totalMoves = 0, totalAttacks = 0, totalDefends = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (aliveCount <= 1) break;
    if (turn % RING_SHRINK_INTERVAL === 0 && ringRadius > 0) ringRadius--;

    const ringDmg = Math.trunc(turn / RING_DMG_DIVISOR) + 1;
    const turnActions = [];

    for (let oi = 0; oi < 8; oi++) {
      if (aliveCount <= 1) break;
      const idx = actionOrder[oi];
      if (!ents[idx].alive) continue;

      // Ring damage
      const cheb = Math.max(Math.abs(ents[idx].x), Math.abs(ents[idx].y));
      if (cheb > ringRadius) {
        ents[idx].currentHp -= ringDmg;
        if (ents[idx].currentHp <= 0) {
          ents[idx].alive = false;
          ents[idx].deathTurn = turn;
          aliveCount--;
          turnActions.push(`P${idx} RING_DEATH`);
          continue;
        }
      }

      const sr = executeScript(idx, scripts[scriptMap[idx]]);
      const actionName = ACTION_NAMES[sr.action] || `action${sr.action}`;

      if (sr.action === 3) { // MOVE
        totalMoves++;
        // Simple move: toward center (arg=6) or toward/away from target
        if (sr.actionArg === 6) { // DIR_CENTER
          const dx = ents[idx].x > 0 ? -1 : (ents[idx].x < 0 ? 1 : 0);
          const dy = ents[idx].y > 0 ? -1 : (ents[idx].y < 0 ? 1 : 0);
          if (Math.abs(ents[idx].x) >= Math.abs(ents[idx].y)) {
            ents[idx].x += dx;
          } else {
            ents[idx].y += dy;
          }
        }
        turnActions.push(`P${idx} MOVE(${ents[idx].x},${ents[idx].y})`);
      } else if (sr.action === 2) { // ATTACK
        totalAttacks++;
        if (sr.targetIdx < 8 && ents[sr.targetIdx].alive) {
          if (manhattan(ents[idx], ents[sr.targetIdx]) <= ents[idx].atkRange) {
            const dmg = Math.max(1, Math.trunc(ents[idx].atk * (100 + ents[sr.targetIdx].exposure * 20) / 100));
            ents[sr.targetIdx].currentHp -= dmg;
            ents[idx].exposure = Math.min(ents[idx].exposure + 1, 5);
            ents[idx].exp += 2;
            turnActions.push(`P${idx} ATK P${sr.targetIdx} -${dmg}hp (${ents[sr.targetIdx].currentHp}/${ents[sr.targetIdx].hp})`);
            if (ents[sr.targetIdx].currentHp <= 0) {
              ents[sr.targetIdx].alive = false;
              ents[sr.targetIdx].deathTurn = turn;
              ents[idx].kills++;
              aliveCount--;
              turnActions.push(`  P${sr.targetIdx} KILLED by P${idx}`);
            }
          } else {
            turnActions.push(`P${idx} ATK P${sr.targetIdx} out of range (dist=${manhattan(ents[idx], ents[sr.targetIdx])} range=${ents[idx].atkRange})`);
          }
        }
      } else if (sr.action === 1) { // DEFEND
        totalDefends++;
        ents[idx].exposure = 0;
        // Don't log defend to keep output short
      }
    }

    if (turnActions.length > 0) {
      console.log(`\nTurn ${turn} (ring=${ringRadius}):`);
      for (const a of turnActions) console.log(`  ${a}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total: ${totalMoves} moves, ${totalAttacks} attacks, ${totalDefends} defends`);
  console.log('\nFinal standings:');
  const sorted = [...ents].sort((a, b) => {
    if (a.alive !== b.alive) return b.alive ? 1 : -1;
    if (!a.alive && !b.alive) return b.deathTurn - a.deathTurn;
    return b.exp - a.exp;
  });
  for (let i = 0; i < 8; i++) {
    const e = sorted[i];
    console.log(`  #${i + 1}: P${e.idx} ${e.alive ? 'ALIVE' : `died turn ${e.deathTurn}`} kills=${e.kills} exp=${e.exp} pos=(${e.x},${e.y})`);
  }
}

main().catch(console.error);
