/**
 * simulateMatch — v4 引擎桥接层
 *
 * 从 MatchEvent 获取 NFT 数据 → 运行新引擎 → 转换成老 ReplayEngine 格式
 */

import { runGame } from '../engine/game';
import type { GameResult, TurnSnapshot, GameEvent as EngineGameEvent, EntitySnapshot, Entity } from '../engine/types';
import type { GameEvent as OldGameEvent, InitEntity } from './types';
import { TYPE_PLAYER } from './types';
import type { MatchEvent, EngineEvent, RankingEntry } from '../types';
import { fetchLobsterNFT, fetchScriptBytes } from '../services/dataStore';
import type { LobsterNFT } from '../services/dataStore';
import { MAP_SIZE, parseSkillEffects, lobsterDisplayName } from '../config/game';
import { ethers } from 'ethers';

const ENGINE_VERSION = 2;

/** Pack Entity to uint256 (matching EntityLib.sol packed layout), then keccak256 all 8. */
function computeReplayHash(entities: Entity[]): string {
  const packed: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    const e = entities[i];
    let v = BigInt(e.currentHp & 0xFFFF);                       // [0..15]   int16
    v |= BigInt(e.x & 0xFF) << 16n;                             // [16..23]  int8
    v |= BigInt(e.y & 0xFF) << 24n;                             // [24..31]  int8
    v |= BigInt(e.mana & 0xFF) << 32n;                          // [32..39]  uint8
    v |= BigInt(e.exposure & 0xFF) << 40n;                      // [40..47]  uint8
    v |= BigInt(e.statusFlags & 0xFFFF) << 48n;                 // [48..63]  uint16
    v |= BigInt(e.blinkCooldown & 0xFF) << 64n;                 // [64..71]  uint8
    v |= BigInt(e.lastAction & 0xFF) << 72n;                    // [72..79]  uint8
    v |= BigInt(e.alive ? 1 : 0) << 80n;                        // [80..87]  uint8
    v |= BigInt(e.kills & 0xFF) << 88n;                         // [88..95]  uint8
    v |= BigInt(e.exp & 0xFFFF) << 96n;                         // [96..111] uint16
    v |= BigInt(e.level & 0xFF) << 112n;                        // [112..119] uint8
    v |= BigInt(e.deathTurn & 0xFF) << 120n;                    // [120..127] uint8
    v |= BigInt(e.idx & 0xFF) << 128n;                          // [128..135] uint8
    v |= BigInt(e.lastAtkIdx & 0xFF) << 136n;                   // [136..143] uint8
    v |= BigInt(e.lastTgtIdx & 0xFF) << 144n;                   // [144..151] uint8
    v |= BigInt(e.hp & 0xFF) << 152n;                           // [152..159] uint8
    v |= BigInt(e.atk & 0xFF) << 160n;                          // [160..167] uint8
    v |= BigInt(e.atkRange & 0xFF) << 168n;                     // [168..175] uint8
    v |= BigInt(e.speed & 0xFF) << 176n;                        // [176..183] uint8
    v |= BigInt(e.manaMax & 0xFF) << 184n;                      // [184..191] uint8
    v |= BigInt(e.skillEffect & 0xFFFF) << 192n;                // [192..207] uint16
    v |= BigInt(e.skillPower & 0xFF) << 208n;                   // [208..215] uint8
    v |= BigInt(e.lastBlockedBy & 0xFF) << 216n;                 // [216..223] uint8
    packed.push(v);
  }
  // abi.encodePacked(uint256[8]) = 8 × 32 bytes concatenated
  let hex = '0x';
  for (const p of packed) hex += p.toString(16).padStart(64, '0');
  return ethers.keccak256(hex);
}

/** 解码脚本字节 → { slots, rules } */
function decodeScriptBytes(data: Uint8Array): { slots: unknown[]; rules: unknown[] } {
  let p = 0;
  const r = () => data[p++] ?? 0;
  const r16 = () => { const hi = r(), lo = r(); const v = (hi << 8) | lo; return v > 32767 ? v - 65536 : v; };

  const numSlots = r();
  const slots: unknown[] = [];
  for (let i = 0; i < numSlots; i++) {
    slots.push({ sortBy: r(), order: r(), filterProp: r(), filterOp: r(), filterRSub: r(), filterRProp: r(), filterVal: r16() });
  }

  const numRules = r();
  const rules: unknown[] = [];
  for (let i = 0; i < numRules; i++) {
    const conds: Record<string, unknown> = {};
    for (const cKey of ['c0', 'c1', 'c2', 'c3']) {
      conds[cKey] = { lSub: r(), lProp: r(), lOp: r(), lVal: r16(), cmp: r(), rSub: r(), rProp: r(), rOp: r(), rVal: r16() };
    }
    rules.push({ ...conds, action: r(), actionArg: r(), actionTarget: r() });
  }

  return { slots, rules };
}

export interface SimulationResult {
  versionMatch: boolean;
  hashMatch: boolean | null;
  localHash: string;
  engineVersion: number;
  chainVersion: number | undefined;
}

/**
 * 将新引擎 TurnSnapshot[] 转成老 ReplayEngine 的 OldGameEvent[]
 * 精确匹配 ReplayEngine.processEvent 期望的字段名
 */
function convertTurnsToOldEvents(
  turns: TurnSnapshot[],
  nfts: Map<number, LobsterNFT>,
  players: string[],
  heroTokenIds: number[],
): OldGameEvent[] {
  const events: OldGameEvent[] = [];
  if (turns.length === 0) return events;

  const t0 = turns[0];

  // ── init 事件 ──
  const initEntities: InitEntity[] = t0.entities.map(ent => {
    const nft = nfts.get(ent.idx);
    const heroTokenId = heroTokenIds[ent.idx] ?? ent.idx;
    const addr = players[ent.idx] || '';
    const name = lobsterDisplayName(heroTokenId, nft?.name) || ('Claw' + (addr ? addr.slice(-4) : ent.idx));
    const skillNames = nft ? parseSkillEffects(nft.skillEffect).map(s => s.key).join('+') : '';
    return {
      eid: ent.idx,
      type: TYPE_PLAYER,
      name,
      isPlayer: true,  // v4: 所有参与者都是玩家（含 AI 预注册玩家）
      color: nft ? `rgb(${nft.shell[0]},${nft.shell[1]},${nft.shell[2]})` : '#ff5500',
      col: ent.x,
      row: ent.y,
      hp: ent.currentHp,
      maxHp: ent.hp,
      heroId: heroTokenId,
      level: ent.level,
      atk: ent.atk,
      def: 0,
      atkRange: ent.atkRange,
      vision: ent.atkRange,
      speed: nft?.speed ?? 0,
      exp: ent.exp,
      kills: ent.kills,
      maxMana: ent.manaMax,
      skillName: skillNames,
      skillEffect: nft?.skillEffect ?? 0,
      skillPower: nft?.skillPower ?? 0,
    };
  });

  events.push({ type: 'init', mapSize: MAP_SIZE, tiles: [], entities: initEntities });

  // ── 每回合事件 ──
  for (let ti = 1; ti < turns.length; ti++) {
    const turn = turns[ti];
    const prevTurn = turns[ti - 1];

    // turn 开始
    events.push({ type: 'turn', turn: turn.turn, order: turn.actionOrder });

    // 毒圈缩小
    if (turn.ringRadius < prevTurn.ringRadius) {
      events.push({ type: 'shrink', ringRadius: turn.ringRadius, turn: turn.turn });
    }

    // 毒圈伤害现在从引擎事件里直接获取（ring_damage），不再猜测

    // 引擎事件
    for (const ev of turn.events) {
      switch (ev.type) {
        case 'move':
          events.push({ type: 'move', eid: ev.actorIdx, col: ev.toX, row: ev.toY, turn: turn.turn });
          break;

        case 'blink':
          events.push({ type: 'blink', eid: ev.actorIdx, col: ev.toX, row: ev.toY, turn: turn.turn });
          break;

        case 'attack':
          events.push({ type: 'attack', eid: ev.actorIdx, target: ev.targetIdx, turn: turn.turn });
          // 紧跟 hurt 事件
          if (ev.targetIdx != null && ev.damage) {
            const targetSnap = turn.entities.find(e => e.idx === ev.targetIdx);
            events.push({
              type: 'hurt', eid: ev.targetIdx,
              damage: ev.damage,
              hp: targetSnap?.currentHp ?? 0,
              maxHp: targetSnap?.hp ?? 0,
              turn: turn.turn,
            });
          }
          // 攻击后立即更新攻击者状态（mana/exp/kills/exposure）
          {
            const attackerSnap = turn.entities.find(e => e.idx === ev.actorIdx);
            if (attackerSnap) {
              events.push({ type: 'status_update', eid: ev.actorIdx, mana: attackerSnap.mana, exp: attackerSnap.exp, kills: attackerSnap.kills, exposure: attackerSnap.exposure, turn: turn.turn });
            }
          }
          break;

        case 'skill': {
          // 查找技能影响的目标
          const skillAttackerSnap = turn.entities.find(e => e.idx === ev.actorIdx);
          if (ev.targetIdx != null && ev.damage) {
            const targetSnap = turn.entities.find(e => e.idx === ev.targetIdx);
            events.push({
              type: 'skill', eid: ev.actorIdx,
              skillName: '',
              exposure: skillAttackerSnap?.exposure,
              skillTargets: [{
                idx: ev.targetIdx,
                damage: ev.damage,
                hp: targetSnap?.currentHp ?? 0,
              }],
              turn: turn.turn,
            });
          } else {
            events.push({ type: 'skill', eid: ev.actorIdx, skillName: '', exposure: skillAttackerSnap?.exposure, turn: turn.turn });
          }
        }
          break;

        case 'defend':
          events.push({ type: 'defend', eid: ev.actorIdx, turn: turn.turn });
          break;

        case 'kill':
          // 引擎已单独发了 death 事件，kill 只用于击杀奖励统计，不重复转 death
          break;

        case 'death':
          events.push({ type: 'death', eid: ev.actorIdx, turn: turn.turn });
          break;

        case 'level_up': {
          const lvSnap = turn.entities.find(e => e.idx === ev.actorIdx);
          events.push({
            type: 'evolve', eid: ev.actorIdx,
            level: ev.newLevel,
            exp: lvSnap?.exp ?? 0,
            kills: lvSnap?.kills ?? 0,
            hp: lvSnap?.hp ?? 0,
            maxHp: lvSnap?.hp ?? 0,
            atk: lvSnap?.atk ?? 0,
            turn: turn.turn,
          });
          break;
        }

        case 'ring_damage': {
          // 发 hurt 事件显示毒圈伤害
          const ringEnt = turn.entities.find(e => e.idx === ev.actorIdx);
          events.push({ type: 'hurt', eid: ev.actorIdx, damage: ev.damage, hp: ringEnt?.currentHp ?? 0, maxHp: ringEnt?.hp ?? 0, turn: turn.turn });
          // 死亡
          if (ringEnt && !ringEnt.alive) {
            events.push({ type: 'ring_kill', eid: ev.actorIdx, turn: turn.turn });
            events.push({ type: 'death', eid: ev.actorIdx, turn: turn.turn });
          }
          break;
        }
      }
    }

    // status_update：每个活着的实体更新 exp/kills/exposure/mana/blinkCooldown
    for (const ent of turn.entities) {
      if (!ent.alive) continue;
      events.push({
        type: 'status_update', eid: ent.idx,
        exp: ent.exp,
        kills: ent.kills,
        exposure: ent.exposure,
        blinkCooldown: ent.blinkCooldown,
        mana: ent.mana,
        statusFlags: ent.statusFlags,
        turn: turn.turn,
      });
    }
  }

  // gameover
  const lastTurn = turns[turns.length - 1];
  const winner = lastTurn.entities.find(e => e.alive);
  if (winner) {
    events.push({ type: 'gameover', winner: winner.idx, turn: lastTurn.turn });
  }

  return events;
}

/**
 * 异步版：获取 NFT 数据 → 运行引擎 → 转换事件 → 填充到 matchEvent
 */
export async function simulateMatchAsync(matchEvent: MatchEvent): Promise<SimulationResult> {
  const chainVersion = matchEvent.version;
  const versionMatch = chainVersion === undefined || chainVersion === ENGINE_VERSION;

  if (!matchEvent.events || matchEvent.events.length === 0) {
    const heroTokenIds: number[] = (matchEvent as any).heroTokenIds || matchEvent.heroIds || [];
    const scriptTokenIds: number[] = (matchEvent as any).scriptTokenIds || [];
    const matchPlayers: string[] = matchEvent.players || [];

    // 并行获取所有 NFT 和脚本
    const lobsterStats: bigint[] = [];
    const nftMap = new Map<number, LobsterNFT>();

    await Promise.all(heroTokenIds.map(async (tokenId, i) => {
      try {
        const nft = await fetchLobsterNFT(tokenId);
        nftMap.set(i, nft);
        lobsterStats[i] = BigInt(nft.hp) | (BigInt(nft.atk) << 8n) | (BigInt(nft.atkRange) << 16n) |
          (BigInt(nft.speed) << 24n) | (BigInt(nft.manaMax) << 32n) |
          (BigInt(nft.skillEffect) << 40n) | (BigInt(nft.skillPower) << 56n);
      } catch {
        lobsterStats[i] = 16n | (4n << 8n) | (2n << 16n) | (1n << 24n) | (3n << 32n) | (1n << 40n) | (2n << 56n);
      }
    }));

    const scripts: Uint8Array[] = [];
    await Promise.all(scriptTokenIds.map(async (tokenId, i) => {
      try { scripts[i] = await fetchScriptBytes(tokenId); }
      catch { scripts[i] = new Uint8Array(0); }
    }));

    // 解码脚本字节 → { slots, rules }，填充到 matchEvent.scripts 供回放 ScriptPanel 使用
    matchEvent.scripts = scripts.map(s => s.length > 0 ? decodeScriptBytes(s) : { slots: [], rules: [] });

    // 运行引擎
    const result: GameResult = runGame(lobsterStats, scripts, matchEvent.seed);

    // 计算本地 replay hash
    const localHash = computeReplayHash(result.finalEntities);
    const chainHash = (matchEvent as any).replayHash as string | undefined;
    const hashMatch = chainHash ? localHash === chainHash.toLowerCase() : null;

    // 转换成老格式（含 init）
    matchEvent.events = convertTurnsToOldEvents(result.turns, nftMap, matchPlayers, heroTokenIds) as EngineEvent[];
    matchEvent.rankings = result.rankings.map((r, i) => ({
      idx: r.idx,
      heroId: heroTokenIds[r.idx] ?? 0,
      alive: r.deathTurn === 0,
      deathTurn: r.deathTurn,
      exp: r.exp,
      kills: r.kills,
      firstBlood: r.firstBlood,
      hp: 0, hpMax: 0, atk: 0, def: 0, atkRange: 0, vision: 0, x: 0, y: 0,
      rank: i,
    })) as RankingEntry[];
    matchEvent.turn = result.turns.length > 0 ? result.turns[result.turns.length - 1].turn : 0;

    return { versionMatch, hashMatch, localHash, engineVersion: ENGINE_VERSION, chainVersion };
  }

  return { versionMatch, hashMatch: null, localHash: '', engineVersion: ENGINE_VERSION, chainVersion };
}

/**
 * 同步版（兼容老调用方式，要求 events 已预填充）
 */
export function simulateMatch(matchEvent: MatchEvent): SimulationResult {
  return {
    versionMatch: true, hashMatch: null, localHash: '',
    engineVersion: ENGINE_VERSION, chainVersion: matchEvent.version,
  };
}
