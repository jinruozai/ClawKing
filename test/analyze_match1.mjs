import { runGame } from '../frontend/src/engine/game.ts';

const ARENA = '0x43afDAF260DC55ed5c646C4702c92D091169480a';
const RPC = 'https://opbnb-mainnet-rpc.bnbchain.org';

async function ethCall(to, data) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
  });
  return (await res.json()).result;
}

function encodeUint(v) { return v.toString(16).padStart(64, '0'); }

async function getAddresses() {
  const r = (await ethCall(ARENA, '0xa39fac12')).slice(2);
  return { lobster: '0x' + r.slice(24, 64), script: '0x' + r.slice(88, 128) };
}

async function getStats(hub, id) { return BigInt(await ethCall(hub, '0xc5c22e3e' + encodeUint(id))); }

async function getScript(hub, id) {
  const r = (await ethCall(hub, '0xa2c8bc98' + encodeUint(id))).slice(2);
  const off = parseInt(r.slice(0, 64), 16) * 2;
  const len = parseInt(r.slice(off, off + 64), 16);
  const hex = r.slice(off + 64, off + 64 + len * 2);
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

const addrs = await getAddresses();

// Match 1 used heroIds [0,1,2,3,4,5,6,7] and scriptIds [0,1,2,3,4,5,6,7]
const heroIds = [0,1,2,3,4,5,6,7];
const scriptIds = [0,1,2,3,4,5,6,7];

const stats = await Promise.all(heroIds.map(id => getStats(addrs.lobster, id)));
const scripts = await Promise.all(scriptIds.map(id => getScript(addrs.script, id)));

const seed = 0xe3a0d52b; // from match event
const result = runGame(stats, scripts, seed);

const ACTION_NAMES = ['IDLE', 'DEFEND', 'ATTACK', 'MOVE', 'BLINK'];
const HERO_NAMES = ['IronClaw', 'RockLobs', 'GhostShr', 'BloodCla', 'Executr', 'ThornShr', 'CritLobs', 'BluFlam'];

// Analyze each turn
for (const turn of result.turns) {
  if (turn.turn === 0) continue;
  const alive = turn.entities.filter(e => e.alive).length;
  console.log(`\n--- Turn ${turn.turn} | Ring: ${turn.ringRadius} | Alive: ${alive} ---`);

  for (const ev of turn.events) {
    const actor = HERO_NAMES[ev.actorIdx] || `#${ev.actorIdx}`;
    const target = ev.targetIdx != null ? (HERO_NAMES[ev.targetIdx] || `#${ev.targetIdx}`) : '';

    switch (ev.type) {
      case 'move': console.log(`  ${actor} MOVE to (${ev.toX},${ev.toY})`); break;
      case 'blink': console.log(`  ${actor} BLINK to (${ev.toX},${ev.toY})`); break;
      case 'attack': console.log(`  ${actor} ATTACK ${target} → ${ev.damage} dmg`); break;
      case 'skill': console.log(`  ${actor} SKILL ${target} → ${ev.damage} dmg`); break;
      case 'defend': console.log(`  ${actor} DEFEND`); break;
      case 'idle': console.log(`  ${actor} IDLE`); break;
      case 'death': console.log(`  *** ${actor} DIES ***`); break;
      case 'kill': console.log(`  *** ${actor} KILLS ${target} ***`); break;
      case 'ring_damage': console.log(`  ${actor} ring dmg ${ev.damage}`); break;
      case 'level_up': console.log(`  ${actor} LEVEL UP → L${(ev.newLevel||0)+1}`); break;
    }
  }
}

// Summary
console.log('\n=== RANKINGS ===');
for (let i = 0; i < 8; i++) {
  const r = result.rankings[i];
  console.log(`#${i+1} ${HERO_NAMES[r.idx]} | dt=${r.deathTurn} kills=${r.kills} exp=${r.exp}`);
}

// Action statistics
console.log('\n=== ACTION STATS ===');
const actionCount = {};
for (const turn of result.turns) {
  for (const ev of turn.events) {
    if (['attack','skill','defend','idle','move','blink'].includes(ev.type)) {
      const key = `${HERO_NAMES[ev.actorIdx]}.${ev.type}`;
      actionCount[key] = (actionCount[key] || 0) + 1;
    }
  }
}
for (const hero of HERO_NAMES) {
  const acts = Object.entries(actionCount).filter(([k]) => k.startsWith(hero + '.')).map(([k, v]) => `${k.split('.')[1]}=${v}`).join(' ');
  console.log(`  ${hero}: ${acts}`);
}
