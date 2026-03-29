/**
 * Battle Replay (Real Scripts) — 用真实 DefaultData 脚本跑比赛
 * Usage: npx tsx test/battle_replay_real.mjs
 */
import { runGame } from '../frontend/src/engine/game.ts';
import { readFileSync } from 'fs';

function pack(hp, atk, atkRange, speed, manaMax, skillEffect, skillPower) {
  return BigInt(hp) | (BigInt(atk) << 8n) | (BigInt(atkRange) << 16n) | (BigInt(speed) << 24n)
    | (BigInt(manaMax) << 32n) | (BigInt(skillEffect) << 40n) | (BigInt(skillPower) << 56n);
}

const STATS = [
  pack(16,4,2,1,3,0x0001,2),  pack(20,2,1,0,4,0x0002,1),
  pack(10,5,2,4,3,0x0100,4),  pack(14,3,2,1,4,0x0010,4),
  pack(12,5,2,2,3,0x0040,4),  pack(19,2,1,1,3,0x0200,2),
  pack(11,6,2,3,3,0x0400,3),  pack(13,3,4,1,4,0x0080,3),
  pack(8,3,4,1,3,0x0004,4),   pack(11,3,3,0,4,0x0008,4),
  pack(18,2,1,2,3,0x0800,2),  pack(11,4,2,2,3,0x1000,4),
];

const NAMES = [
  'IronClaw', 'RockLobs', 'GhostShr', 'BloodCla',
  'Executr ', 'ThornShr', 'CritLobs', 'BlueFlam',
  'ArcticSh', 'VentShr ', 'HermitSh', 'LuckyShr',
];

// 加载真实脚本
const scriptHexes = JSON.parse(readFileSync('test/default_scripts.json', 'utf-8'));
const SCRIPTS = scriptHexes.map(hex => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return arr;
});

function runBattle(heroIndices, seed, label) {
  const stats = heroIndices.map(i => STATS[i]);
  const scripts = heroIndices.map(i => SCRIPTS[i]);
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

  // 回合日志
  console.log('\n--- Turn-by-Turn ---');
  for (const turn of result.turns) {
    if (turn.turn === 0) continue;
    const aliveEnts = turn.entities.filter(e => e.alive);

    console.log(`\n  Turn ${String(turn.turn).padStart(2)} | ring=${turn.ringRadius} | alive=${aliveEnts.length}`);

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
        case 'kill': case 'death':
          console.log(`    ${ev.targetIdx != null ? NAMES[heroIndices[ev.targetIdx]] : actor} DIED`);
          break;
        case 'level_up':
          console.log(`    ${actor} LEVEL UP -> Lv${ev.newLevel}`);
          break;
        case 'ring_damage':
          console.log(`    ${actor} RING DMG`);
          break;
      }
    }

    // 每 5 回合或决赛圈显示 HP
    if (turn.turn % 5 === 0 || aliveEnts.length <= 3) {
      console.log(`    --- HP: ${aliveEnts.map(e => `${NAMES[heroIndices[e.idx]]}=${e.currentHp}/${e.hp}(Lv${e.level})`).join(' | ')}`);
    }
  }
}

// ── 场景 1：苟苟虾 + 混合 ──
runBattle([10, 0, 1, 2, 3, 4, 5, 6], 12345, 'Hermit(#10) vs Iron~Crit');

// ── 场景 2：苟苟虾 + 远程 ──
runBattle([10, 7, 8, 9, 0, 1, 2, 3], 54321, 'Hermit(#10) vs Ranged+mixed');

// ── 场景 3：北极虾 focus ──
runBattle([8, 0, 1, 2, 3, 4, 5, 6], 99999, 'Arctic(#8) vs Iron~Crit');

// ── 场景 4：荆棘虾 focus ──
runBattle([5, 0, 1, 2, 3, 4, 10, 11], 77777, 'Thorn(#5) vs mixed');

// ── 场景 5：全 12 取前 8（标准对手池） ──
runBattle([0, 1, 2, 3, 4, 5, 6, 7], 11111, 'Standard 0-7');

// ── 场景 6：后 8 只 ──
runBattle([4, 5, 6, 7, 8, 9, 10, 11], 22222, 'Standard 4-11');
