/**
 * Cloudflare Pages Function: /api/log/:id
 *
 * Fetches match data from opBNB chain, runs the SAME game engine as frontend,
 * returns plain-text battle log that any agent can curl/fetch.
 *
 * Engine code is imported from src/engine/ — single source of truth.
 */

import { runGame } from '../../../src/engine/game';
import type { TurnSnapshot, GameEvent, Entity } from '../../../src/engine/types';
import { keccak256 as ethersKeccak256 } from 'ethers';

// ── Chain config ──
const RPC_URL = 'https://opbnb-mainnet-rpc.bnbchain.org';
const ARENA = '0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10';

// ── Function signature hashes ──
const SIG = {
  matches: '0x3a7fb595',
  getAddresses: '0xa39fac12',
  getLobsterStats: '0xc5c22e3e',
  getLobsterName: '0xf6c64dc3',
  getScriptBytes: '0xa2c8bc98',
  getPlayerName: '0xe18d38ce',
};

// ── RPC helpers ──
async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function encodeUint(v: number): string {
  return v.toString(16).padStart(64, '0');
}

async function getMatchBlock(matchId: number): Promise<number> {
  const result = await ethCall(ARENA, SIG.matches + encodeUint(matchId));
  return parseInt(result.slice(2, 66), 16);
}

async function getAddresses(): Promise<{ lobster: string; script: string }> {
  const result = await ethCall(ARENA, SIG.getAddresses);
  const hex = result.slice(2);
  return { lobster: '0x' + hex.slice(24, 64), script: '0x' + hex.slice(88, 128) };
}

async function getLobsterStats(hub: string, tokenId: number): Promise<bigint> {
  return BigInt(await ethCall(hub, SIG.getLobsterStats + encodeUint(tokenId)));
}

async function getLobsterName(hub: string, tokenId: number): Promise<string> {
  const result = await ethCall(hub, SIG.getLobsterName + encodeUint(tokenId));
  const hex = result.slice(2, 26);
  let name = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.slice(i, i + 2), 16);
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return name;
}

async function getPlayerName(addr: string): Promise<string> {
  const padded = addr.replace('0x', '').toLowerCase().padStart(64, '0');
  const result = await ethCall(ARENA, SIG.getPlayerName + padded);
  const hex = result.slice(2, 34); // bytes16 = 32 hex chars
  let name = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.slice(i, i + 2), 16);
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return name;
}

async function getScriptBytes(hub: string, tokenId: number): Promise<Uint8Array> {
  const result = await ethCall(hub, SIG.getScriptBytes + encodeUint(tokenId));
  const hex = result.slice(2);
  const offset = parseInt(hex.slice(0, 64), 16) * 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16);
  const bytesHex = hex.slice(offset + 64, offset + 64 + length * 2);
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) arr[i] = parseInt(bytesHex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

async function getMatchEvent(blockNumber: number) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_getLogs', id: 1,
      params: [{ fromBlock: '0x' + blockNumber.toString(16), toBlock: '0x' + blockNumber.toString(16), address: ARENA }],
    }),
  });
  const json: any = await res.json();
  if (!json.result || json.result.length === 0) return null;
  const log = json.result[0];
  const d = log.data.slice(2);
  const seed = parseInt(d.slice(0, 64), 16);
  const players: string[] = [], heroTokenIds: number[] = [], scriptTokenIds: number[] = [];
  for (let i = 0; i < 8; i++) {
    players.push('0x' + d.slice(256 + i * 64 + 24, 256 + (i + 1) * 64));
    heroTokenIds.push(parseInt(d.slice(256 + 512 + i * 64, 256 + 512 + (i + 1) * 64), 16));
    scriptTokenIds.push(parseInt(d.slice(256 + 1024 + i * 64, 256 + 1024 + (i + 1) * 64), 16));
  }
  // replayHash is after the 3 fixed-size arrays: offset = 256 + 3*512 = 1792
  const replayHash = '0x' + d.slice(1792, 1792 + 64);
  return { seed, players, heroTokenIds, scriptTokenIds, replayHash };
}

// ── Replay hash computation (matches GameLib.sol keccak256(abi.encodePacked(ents))) ──
function packEntity(e: Entity): bigint {
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

function computeReplayHash(entities: Entity[]): string {
  let hex = '0x';
  for (let i = 0; i < 8; i++) {
    hex += packEntity(entities[i]).toString(16).padStart(64, '0');
  }
  return ethersKeccak256(hex);
}

// ── Skill name helper ──
const SKILL_NAMES: Record<number, string> = {
  0x0001: 'Immobilize', 0x0002: 'Disarm', 0x0004: 'Blind', 0x0008: 'Silence',
  0x0010: 'Lifesteal', 0x0020: 'Vigor', 0x0040: 'Execute', 0x0080: 'ManaBurn',
  0x0100: 'Stealth', 0x0200: 'Thorns', 0x0400: 'CriticalHit', 0x0800: 'Cleanse', 0x1000: 'Haste',
};
function skillName(effect: number): string {
  const names: string[] = [];
  for (const [bit, name] of Object.entries(SKILL_NAMES)) if ((effect & Number(bit)) !== 0) names.push(name);
  return names.join('+') || 'None';
}

// ── Format engine events to text ──
function formatEvent(ev: GameEvent, turn: TurnSnapshot, names: string[]): string | null {
  const actor = names[ev.actorIdx] ?? `#${ev.actorIdx}`;
  const target = ev.targetIdx != null ? (names[ev.targetIdx] ?? `#${ev.targetIdx}`) : '';
  const targetSnap = ev.targetIdx != null ? turn.entities.find(e => e.idx === ev.targetIdx) : null;
  const actorSnap = turn.entities.find(e => e.idx === ev.actorIdx);

  switch (ev.type) {
    case 'move': return `  ${actor} moves to (${ev.toX},${ev.toY})`;
    case 'blink': return `  ${actor} blinks to (${ev.toX},${ev.toY})`;
    case 'attack': {
      const hp = targetSnap ? ` (HP: ${targetSnap.currentHp}/${targetSnap.hp})` : '';
      return ev.damage ? `  ${actor} attacks ${target} -> ${ev.damage} dmg${hp}` : `  ${actor} attacks ${target}`;
    }
    case 'skill': {
      const eff = actorSnap ? skillName(actorSnap.skillEffect) : '';
      if (ev.damage && ev.targetIdx != null) {
        const hp = targetSnap ? ` (HP: ${targetSnap.currentHp}/${targetSnap.hp})` : '';
        return `  ${actor} SKILL [${eff}] on ${target} -> ${ev.damage} dmg${hp}`;
      }
      return `  ${actor} SKILL [${eff}]`;
    }
    case 'defend': return `  ${actor} defends`;
    case 'idle': return `  ${actor} idles`;
    case 'ring_damage': {
      const hp = actorSnap ? ` (HP: ${actorSnap.currentHp}/${actorSnap.hp})` : '';
      return `  ${actor} takes ${ev.damage} ring damage${hp}`;
    }
    case 'kill': return `  ${actor} KILLS ${target}!`;
    case 'death': return `  ${actor} DIES`;
    case 'level_up': return `  ${actor} levels up to L${(ev.newLevel ?? 0) + 1}`;
    default: return null;
  }
}

// ══════════════════════════════════════════
// Main handler
// ══════════════════════════════════════════

export const onRequest: PagesFunction = async (context) => {
  const matchId = Number(context.params.id);
  if (!matchId || isNaN(matchId)) return new Response('Invalid match ID', { status: 400 });

  try {
    const blockNumber = await getMatchBlock(matchId);
    if (blockNumber === 0) return new Response('Match not found', { status: 404 });

    const event = await getMatchEvent(blockNumber);
    if (!event) return new Response('Match event not found', { status: 404 });

    const addrs = await getAddresses();

    const [statsArr, lobsterNames, playerNames, scriptsArr] = await Promise.all([
      Promise.all(event.heroTokenIds.map(id => getLobsterStats(addrs.lobster, id))),
      Promise.all(event.heroTokenIds.map(id => getLobsterName(addrs.lobster, id))),
      Promise.all(event.players.map(addr => getPlayerName(addr))),
      Promise.all(event.scriptTokenIds.map(id => getScriptBytes(addrs.script, id))),
    ]);

    // Name: playerName > lobsterName > address. Always append last 4 chars of address for uniqueness.
    const namesArr = event.players.map((addr: string, i: number) => {
      const name = playerNames[i] || lobsterNames[i] || 'Claw';
      const suffix = addr.slice(-4);
      return `${name}#${suffix}`;
    });

    // Run the SAME engine as frontend
    const result = runGame(statsArr, scriptsArr, event.seed);

    // Verify replay hash
    const localHash = computeReplayHash(result.finalEntities);
    const chainHash = event.replayHash;
    const hashMatch = localHash === chainHash;

    // Format output
    const lines: string[] = [];
    lines.push(`=== ClawKing Battle Log #${matchId} ===`);
    lines.push(`Seed: ${event.seed}`);
    lines.push(`Verification: ${hashMatch ? 'PASS — engine output matches on-chain hash' : 'MISMATCH — engine version differs from contract'}`);
    lines.push('');
    lines.push('--- Players ---');
    for (let i = 0; i < 8; i++) {
      const s = statsArr[i];
      const hp = Number(s & 0xFFn), atk = Number((s >> 8n) & 0xFFn);
      const range = Number((s >> 16n) & 0xFFn), speed = Number((s >> 24n) & 0xFFn);
      const manaMax = Number((s >> 32n) & 0xFFn), skillEff = Number((s >> 40n) & 0xFFFFn);
      const skillPow = Number((s >> 56n) & 0xFFn);
      const addr = event.players[i];
      const shortAddr = addr === '0x0000000000000000000000000000000000000000' ? 'AI' : (addr.slice(0, 6) + '..' + addr.slice(-4));
      lines.push(`[${i}] ${namesArr[i]} (${shortAddr}) | HP:${hp} ATK:${atk} Range:${range} Speed:${speed} Mana:${manaMax} Skill:${skillName(skillEff)} Power:${skillPow}`);
    }
    lines.push('');

    // Turn-by-turn log from engine TurnSnapshot[]
    for (let ti = 1; ti < result.turns.length; ti++) {
      const turn = result.turns[ti];
      const prevTurn = result.turns[ti - 1];
      const ringChanged = turn.ringRadius < prevTurn.ringRadius;
      const alive = turn.entities.filter(e => e.alive).length;
      lines.push(`--- Turn ${turn.turn} | Ring: ${turn.ringRadius}${ringChanged ? ' (shrunk)' : ''} | Alive: ${alive} ---`);
      for (const ev of turn.events) {
        const text = formatEvent(ev, turn, namesArr);
        if (text) lines.push(text);
      }
    }

    // Rankings
    lines.push('');
    lines.push('=== Result ===');
    for (let i = 0; i < result.rankings.length; i++) {
      const r = result.rankings[i];
      const status = r.deathTurn > 0 ? `died T${r.deathTurn}` : 'alive';
      lines.push(`#${i + 1} ${namesArr[r.idx]} | Kills: ${r.kills} | EXP: ${r.exp} | ${status}${r.firstBlood ? ' | FIRST BLOOD' : ''}`);
    }
    lines.push('');
    lines.push(`Replay: https://clawking.cc/?replay=${matchId}`);

    return new Response(lines.join('\n'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
};
