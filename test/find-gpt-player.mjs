import { ethers } from 'ethers';

const RPC_URL = 'https://opbnb-mainnet-rpc.bnbchain.org';
const ARENA_PROXY = '0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10';

const ARENA_ABI = [
  'function matchCount() view returns (uint32)',
  'function getMatchRecords(uint32 startId, uint8 count) view returns (uint32[] ids, tuple(uint32 blockNumber, uint32 playerPrevMatchId)[] records)',
  'function getPlayerMatchRecords(address player, uint32 startId, uint8 count) view returns (uint32[] ids, tuple(uint32 blockNumber, uint32 playerPrevMatchId)[] records)',
  'function getPlayerName(address addr) view returns (bytes16)',
  'event MatchCompleted(address indexed player, uint32 seed, uint8 playerRank, int16 ratingChange, uint16 coinsEarned, address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds, bytes32 replayHash)',
];

function decodeBytes16(hex) {
  try {
    const clean = hex.replace(/0+$/, '');
    if (clean === '0x' || clean === '') return '';
    const bytes = ethers.getBytes(hex);
    return new TextDecoder().decode(bytes).replace(/\0/g, '');
  } catch {
    return '';
  }
}

async function mapLimit(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return ret;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(e) {
  const msg = (e?.shortMessage || e?.message || '').toString().toLowerCase();
  const nestedCode =
    e?.error?.code ??
    e?.error?.error?.code ??
    e?.info?.error?.code ??
    e?.info?.error?.error?.code ??
    null;
  return (
    msg.includes('rate limit') ||
    msg.includes('limit exceeded') ||
    msg.includes('-32005') ||
    nestedCode === -32005 ||
    e?.code === 'BAD_DATA' ||
    e?.code === 'UNKNOWN_ERROR'
  );
}

async function withRetry(fn, { retries = 6, baseDelayMs = 350 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || i === retries) throw e;
      const delay = baseDelayMs * Math.pow(2, i);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function normName(s) {
  return (s ?? '').toString().trim();
}

function includesGpt(name) {
  return normName(name).toLowerCase().includes('gpt');
}

function clampUint32(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.floor(x);
}

async function throttled(fn, { minDelayMs = 250 } = {}) {
  const t0 = Date.now();
  const res = await fn();
  const dt = Date.now() - t0;
  if (dt < minDelayMs) await sleep(minDelayMs - dt);
  return res;
}

async function findFirstGptAddress({ arena, provider, scanPages = 80, pageSize = 50 }) {
  const resolved = new Map();
  const pending = new Set();

  clampUint32(await arena.matchCount());
  let startId = 0;
  let found = null;

  for (let page = 0; page < scanPages; page++) {
    const [ids, records] = await arena.getMatchRecords(startId, pageSize);
    if (!ids || ids.length === 0) break;

    const blocks = records.map((r) => clampUint32(r.blockNumber));
    await mapLimit(blocks, 1, async (bn) => {
      const logs = await throttled(() => withRetry(() => arena.queryFilter(arena.filters.MatchCompleted(), bn, bn)));
      for (const log of logs) {
        const players = log?.args?.players ?? [];
        for (const addr of players) {
          if (!addr) continue;
          const a = addr.toLowerCase();
          if (!resolved.has(a)) pending.add(a);
        }
      }
    });

    const toResolve = Array.from(pending);
    pending.clear();
    await mapLimit(toResolve, 6, async (addr) => {
      try {
        const hex = await withRetry(() => arena.getPlayerName(addr));
        const name = decodeBytes16(hex);
        resolved.set(addr, name);
        if (!found && includesGpt(name)) {
          found = { address: addr, name };
        }
      } catch {
        resolved.set(addr, '');
      }
    });

    if (found) break;
    const lastId = clampUint32(ids[ids.length - 1]);
    startId = Math.max(0, lastId - 1);
    if (startId === 0) break;
  }

  if (!found) return null;
  const block = await provider.getBlockNumber();
  return { ...found, scannedToId: startId, currentBlock: block };
}

function scoreMatch(ev) {
  const rc = Number(ev.ratingChange ?? 0);
  const coins = Number(ev.coinsEarned ?? 0);
  const rank = Number(ev.playerRank ?? 0);
  return Math.abs(rc) * 20 + coins + (rank === 0 ? 200 : 0);
}

async function fetchAllMatchesForPlayer({ arena, provider, player, pageSize = 50 }) {
  const matches = [];
  const nameCache = new Map();

  let cursor = 0;
  while (true) {
    const [ids, records] = await arena.getPlayerMatchRecords(player, cursor, pageSize);
    if (!ids || ids.length === 0) break;

    const items = ids.map((id, idx) => ({
      id: clampUint32(id),
      blockNumber: clampUint32(records[idx].blockNumber),
    }));

    const events = await mapLimit(items, 1, async ({ id, blockNumber }) => {
      const logs = await throttled(() =>
        withRetry(() => arena.queryFilter(arena.filters.MatchCompleted(player), blockNumber, blockNumber)),
      );
      const log = logs[0];
      if (!log?.args) return null;
      const b = await throttled(() => withRetry(() => provider.getBlock(blockNumber)), { minDelayMs: 120 });
      return {
        matchId: id,
        blockNumber,
        timestamp: b?.timestamp ? Number(b.timestamp) : null,
        player: log.args.player,
        seed: Number(log.args.seed),
        playerRank: Number(log.args.playerRank),
        playerRankOneBased: Number(log.args.playerRank) + 1,
        ratingChange: Number(log.args.ratingChange),
        coinsEarned: Number(log.args.coinsEarned),
        players: Array.from(log.args.players ?? []).map((a) => (a ? a.toLowerCase() : a)),
        heroTokenIds: Array.from(log.args.heroTokenIds ?? []).map((x) => x?.toString?.() ?? String(x)),
        scriptTokenIds: Array.from(log.args.scriptTokenIds ?? []).map((x) => x?.toString?.() ?? String(x)),
        replayHash: log.args.replayHash,
      };
    });

    for (const ev of events) {
      if (ev) matches.push(ev);
    }

    const lastRecord = records[records.length - 1];
    const nextCursor = clampUint32(lastRecord.playerPrevMatchId);
    cursor = nextCursor;
    if (cursor === 0) break;
  }

  const allAddresses = new Set();
  for (const m of matches) {
    for (const a of m.players) allAddresses.add(a);
  }

  const toResolve = Array.from(allAddresses).filter((a) => a && !nameCache.has(a));
  await mapLimit(toResolve, 6, async (addr) => {
    try {
      const hex = await withRetry(() => arena.getPlayerName(addr));
      nameCache.set(addr, decodeBytes16(hex));
    } catch {
      nameCache.set(addr, '');
    }
  });

  for (const m of matches) {
    m.playerNames = m.players.map((a) => {
      const name = nameCache.get(a) ?? '';
      return name ? name : `Claw${a?.slice?.(-4) ?? ''}`;
    });
    m.score = scoreMatch(m);
  }

  matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return matches;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });
  const arena = new ethers.Contract(ARENA_PROXY, ARENA_ABI, provider);

  const found = await findFirstGptAddress({ arena, provider, scanPages: 60, pageSize: 40 });
  if (!found) {
    console.log(JSON.stringify({ ok: false, reason: 'NO_GPT_NAME_FOUND_IN_SCAN' }, null, 2));
    return;
  }

  const player = found.address;
  const matches = await fetchAllMatchesForPlayer({ arena, provider, player });
  const best = matches[0] ?? null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        gptPlayer: found,
        matchCount: matches.length,
        bestMatch: best,
        bestThree: matches.slice(0, 3),
        allMatches: matches,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e?.stack || e?.message || String(e);
  console.error(msg);
  process.exitCode = 1;
});

