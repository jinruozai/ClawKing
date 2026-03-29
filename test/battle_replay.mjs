/**
 * Battle Replay — 用真实 DefaultData 脚本跑比赛，输出详细回合日志
 * Usage: npx tsx test/battle_replay.mjs
 */
import { runGame } from '../frontend/src/engine/game.ts';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// ── 从合约读取真实脚本字节码 ──
// 先编译获取 DefaultData 的脚本
function pack(hp, atk, atkRange, speed, manaMax, skillEffect, skillPower) {
  return BigInt(hp) | (BigInt(atk) << 8n) | (BigInt(atkRange) << 16n) | (BigInt(speed) << 24n)
    | (BigInt(manaMax) << 32n) | (BigInt(skillEffect) << 40n) | (BigInt(skillPower) << 56n);
}

const STATS = [
  pack(16,4,2,1,3,0x0001,2),  // 0: Iron Claw
  pack(20,2,1,0,4,0x0002,1),  // 1: Rock Lobs
  pack(10,5,2,4,3,0x0100,4),  // 2: Ghost Shr
  pack(14,3,2,1,4,0x0010,4),  // 3: Blood Cla
  pack(12,5,2,2,3,0x0040,4),  // 4: Executr
  pack(19,2,1,1,3,0x0200,2),  // 5: Thorn Shr
  pack(11,6,2,3,3,0x0400,3),  // 6: Crit Lobs
  pack(13,3,4,1,4,0x0080,3),  // 7: Blue Flam
  pack(8,3,4,1,3,0x0004,4),   // 8: Arctic Sh
  pack(11,3,3,0,4,0x0008,4),  // 9: Vent Shr
  pack(18,2,1,2,3,0x0800,2),  // 10: Hermit Sh
  pack(11,4,2,2,3,0x1000,4),  // 11: Lucky Shr
];

const NAMES = [
  'IronClaw', 'RockLobs', 'GhostShr', 'BloodCla',
  'Executr ', 'ThornShr', 'CritLobs', 'BlueFlam',
  'ArcticSh', 'VentShr ', 'HermitSh', 'LuckyShr',
];

// 用简化脚本（攻击最近+中心兜底）先跑，因为我们没有简单方法从合约提取脚本字节
// 但重点是看引擎行为
function makeAggressiveScript() {
  const b = new Uint8Array(1 + 8 + 1 + 47 * 3);
  b[0] = 1;       // 1 slot
  b[1] = 7;       // sortBy = DIST
  b[9] = 3;       // 3 rules

  // Rule 0: ring escape - SELF.RING_DIST LTE 1 -> MOVE CENTER
  const r0 = 10;
  b[r0] = 0; b[r0+1] = 8; b[r0+5] = 6; b[r0+6] = 255; b[r0+10] = 1;
  b[r0+44] = 3; b[r0+45] = 6;

  // Rule 1: attack T0 if in range
  const r1 = 10 + 47;
  b[r1] = 2; b[r1+1] = 7; b[r1+5] = 6; b[r1+6] = 0; b[r1+7] = 4;
  b[r1+44] = 2; b[r1+46] = 2;

  // Rule 2: move center
  const r2 = 10 + 47 * 2;
  b[r2+44] = 3; b[r2+45] = 6;

  return b;
}

const script = makeAggressiveScript();

function runBattle(heroIndices, seed, label) {
  const stats = heroIndices.map(i => STATS[i]);
  const scripts = heroIndices.map(() => script);

  const result = runGame(stats, scripts, seed);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}  (seed=${seed})`);
  console.log(`${'='.repeat(60)}`);

  // 排名
  console.log('\n--- Final Rankings ---');
  for (let r = 0; r < 8; r++) {
    const e = result.rankings[r];
    const name = NAMES[heroIndices[e.idx]];
    const alive = e.deathTurn === 0 ? 'ALIVE ' : `t=${String(e.deathTurn).padStart(2)}   `;
    console.log(`  #${r+1} ${name} | ${alive} | k=${e.kills} | xp=${String(e.exp).padStart(3)} | ${e.firstBlood ? 'FB' : '  '}`);
  }

  // 详细回合日志
  console.log('\n--- Turn-by-Turn ---');
  for (const turn of result.turns) {
    if (turn.turn === 0) continue; // skip init

    const aliveEnts = turn.entities.filter(e => e.alive);
    const aliveNames = aliveEnts.map(e => NAMES[heroIndices[e.idx]]).join(', ');

    if (turn.events.length === 0 && turn.turn > 1) continue; // skip empty turns

    console.log(`\n  Turn ${String(turn.turn).padStart(2)} | ring=${turn.ringRadius} | alive=${aliveEnts.length} [${aliveNames}]`);

    for (const ev of turn.events) {
      const actor = NAMES[heroIndices[ev.actorIdx]] || `?${ev.actorIdx}`;
      const target = ev.targetIdx != null ? (NAMES[heroIndices[ev.targetIdx]] || `?${ev.targetIdx}`) : '';

      switch (ev.type) {
        case 'move':
          console.log(`    ${actor} MOVE (${ev.fromX},${ev.fromY})->(${ev.toX},${ev.toY})`);
          break;
        case 'blink':
          console.log(`    ${actor} BLINK (${ev.fromX},${ev.fromY})->(${ev.toX},${ev.toY})`);
          break;
        case 'attack':
          console.log(`    ${actor} ATK ${target} dmg=${ev.damage || '?'}`);
          break;
        case 'skill':
          console.log(`    ${actor} SKILL -> ${target} dmg=${ev.damage || 0}`);
          break;
        case 'defend':
          console.log(`    ${actor} DEFEND`);
          break;
        case 'idle':
          console.log(`    ${actor} IDLE`);
          break;
        case 'kill':
        case 'death':
          console.log(`    ${actor} DIED`);
          break;
        case 'level_up':
          console.log(`    ${actor} LEVEL UP -> Lv${ev.newLevel}`);
          break;
        case 'ring_damage':
          console.log(`    ${actor} RING DMG`);
          break;
      }
    }

    // 每回合显示所有存活实体的 HP
    if (turn.turn % 5 === 0 || aliveEnts.length <= 3) {
      console.log(`    --- HP: ${aliveEnts.map(e => `${NAMES[heroIndices[e.idx]]}=${e.currentHp}/${e.hp}`).join(' | ')}`);
    }
  }
}

// ── 场景 1：苟苟虾 vs 全部 ──
console.log('\n\n========== SCENARIO: Hermit Focus ==========');
runBattle([10, 0, 1, 2, 3, 4, 5, 6], 12345, 'Hermit(#10) + IronClaw~CritLobs');

// ── 场景 2：苟苟虾 vs 远程组 ──
console.log('\n\n========== SCENARIO: Hermit vs Ranged ==========');
runBattle([10, 7, 8, 9, 0, 1, 2, 3], 54321, 'Hermit(#10) + BluFlam/Arctic/Vent + mixed');

// ── 场景 3：北极虾 focus ──
console.log('\n\n========== SCENARIO: Arctic Focus ==========');
runBattle([8, 0, 1, 2, 3, 4, 5, 6], 99999, 'Arctic(#8) + IronClaw~CritLobs');

// ── 场景 4: 荆棘虾 focus ──
console.log('\n\n========== SCENARIO: Thorn Focus ==========');
runBattle([5, 0, 1, 2, 3, 4, 10, 11], 77777, 'Thorn(#5) + mixed');
