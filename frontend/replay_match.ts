import { ethers } from 'ethers';
import { runGame } from './src/engine/index.ts';

const RPC = 'https://opbnb-mainnet-rpc.bnbchain.org';
const ARENA_ADDR = '0xCedB6Fa0428EA37FabB187708e2731640e459f42';
const LOBSTER_ADDR = '0x3a2BEFB6e87Ffa8D3eA5Ad838E5eE9fe5A03a64e';
const SCRIPT_ADDR = '0x7E1E59ad19385f948003Fa6C28DE32c7B3201DEa';

const provider = new ethers.JsonRpcProvider(RPC);
const arena = new ethers.Contract(ARENA_ADDR, [
  'event MatchCompleted(address indexed player, uint32 seed, uint8 playerRank, int16 ratingChange, uint16 coinsEarned, address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds)',
], provider);
const lobsterHub = new ethers.Contract(LOBSTER_ADDR, [
  'function getLobsterStats(uint256) view returns (uint256)',
], provider);
const scriptHub = new ethers.Contract(SCRIPT_ADDR, [
  'function getScriptBytes(uint256) view returns (bytes)',
], provider);

// 找 match 15 的事件
const logs = await provider.getLogs({
  address: ARENA_ADDR,
  topics: [ethers.id('MatchCompleted(address,uint32,uint8,int16,uint16,address[8],uint256[8],uint256[8])')],
  fromBlock: 126336000,
  toBlock: 'latest',
});

const iface = new ethers.Interface(['event MatchCompleted(address indexed player, uint32 seed, uint8 playerRank, int16 ratingChange, uint16 coinsEarned, address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds)']);

// 找 matchId=15 的 (最近一场，区块 126338266)
let matchEvent: any = null;
for (const log of logs) {
  if (log.blockNumber === 126338266) {
    matchEvent = iface.parseLog(log);
    break;
  }
}
if (!matchEvent) {
  // 取最后一条
  matchEvent = iface.parseLog(logs[logs.length - 1]);
}

const seed = Number(matchEvent.args.seed);
const heroIds: bigint[] = [...matchEvent.args.heroTokenIds];
const scriptIds: bigint[] = [...matchEvent.args.scriptTokenIds];

console.log('Seed:', seed);
console.log('Heroes:', heroIds.map(i => i.toString()).join(', '));
console.log('Scripts:', scriptIds.map(i => i.toString()).join(', '));

// 拉龙虾属性 + 脚本
const stats: bigint[] = await Promise.all(heroIds.map(id => lobsterHub.getLobsterStats(id)));
const scriptBytesHex: string[] = await Promise.all(scriptIds.map(id => scriptHub.getScriptBytes(id)));
const scripts = scriptBytesHex.map(hex => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(clean.match(/.{2}/g)!.map(b => parseInt(b, 16)));
});

console.log('\n--- 开始模拟 ---\n');
const result = runGame(stats, scripts, seed);

// 输出逐回合日志
const skillNames: Record<number, string> = {
  0x0001:'Immobilize', 0x0002:'Disarm', 0x0004:'Blind', 0x0008:'Silence',
  0x0010:'Lifesteal', 0x0020:'Vigor', 0x0040:'Execute', 0x0080:'ManaBurn',
  0x0100:'Stealth', 0x0200:'Thorns', 0x0400:'Critical', 0x0800:'Cleanse', 0x1000:'Haste',
};
const actionNames = ['Idle','Defend','Attack','Move','Blink'];

// 我的龙虾在第几位
const MY_ADDR = '0x7B6C127D6BECf8873903655C960eC89033eCA417'.toLowerCase();
const players: string[] = [...matchEvent.args.players];
const myIdx = players.findIndex(a => a.toLowerCase() === MY_ADDR);
console.log(`我是玩家 ${myIdx}（龙虾 tokenId ${heroIds[myIdx]}）\n`);

for (const snap of result.turns) {
  const alive = snap.entities.filter(e => e.alive).map(e => e.idx);
  console.log(`=== 回合 ${snap.turn} | 存活: [${alive.join(',')}] | 毒圈: ${snap.ringRadius} ===`);
  
  for (const ev of snap.events) {
    const actor = snap.entities.find(e => e.idx === ev.actorIdx);
    const target = ev.targetIdx !== undefined ? snap.entities.find(e => e.idx === ev.targetIdx) : null;
    const isMe = ev.actorIdx === myIdx ? '★' : ' ';
    
    switch (ev.type) {
      case 'attack':
        console.log(`${isMe} P${ev.actorIdx}→P${ev.targetIdx} 攻击 伤害${ev.damage} | P${ev.targetIdx} HP: ${target?.currentHp}/${target?.hp}`);
        break;
      case 'skill':
        const skillName = Object.entries(skillNames).find(([k]) => ev.skillEffect && (ev.skillEffect & parseInt(k)))?.[1] ?? '?';
        console.log(`${isMe} P${ev.actorIdx}→P${ev.targetIdx} 技能[${skillName}] 伤害${ev.damage ?? 0}${ev.heal ? ` 回血${ev.heal}` : ''}`);
        break;
      case 'move':
        console.log(`${isMe} P${ev.actorIdx} 移动 (${ev.fromX},${ev.fromY})→(${ev.toX},${ev.toY})`);
        break;
      case 'blink':
        console.log(`${isMe} P${ev.actorIdx} 闪现 (${ev.fromX},${ev.fromY})→(${ev.toX},${ev.toY})`);
        break;
      case 'defend':
        console.log(`${isMe} P${ev.actorIdx} 防御`);
        break;
      case 'kill':
        console.log(`${isMe} P${ev.actorIdx} 击杀 P${ev.targetIdx}！`);
        break;
      case 'death':
        console.log(`  💀 P${ev.actorIdx} 阵亡`);
        break;
      case 'ring_damage':
        console.log(`  🔴 P${ev.actorIdx} 毒圈伤害 ${ev.damage}`);
        break;
      case 'level_up':
        console.log(`  ⬆ P${ev.actorIdx} 升级！Lv${ev.newLevel}`);
        break;
    }
  }
}

console.log('\n=== 最终排名 ===');
for (const r of result.rankings) {
  const mark = r.idx === myIdx ? ' ★我' : '';
  console.log(`P${r.idx}${mark} | 死亡回合:${r.deathTurn === 255 ? '存活' : r.deathTurn} | 击杀:${r.kills} | EXP:${r.exp}`);
}
