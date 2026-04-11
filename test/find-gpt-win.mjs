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

async function withRetry(fn, { retries = 7, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || i === retries) throw e;
      await sleep(baseDelayMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function throttled(fn, { minDelayMs = 260 } = {}) {
  const t0 = Date.now();
  const res = await fn();
  const dt = Date.now() - t0;
  if (dt < minDelayMs) await sleep(minDelayMs - dt);
  return res;
}

function includesGpt(name) {
  return (name ?? '').toString().trim().toLowerCase().includes('gpt');
}

function clampUint32(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.floor(x);
}

function scoreWin(ev) {
  const rc = Number(ev.ratingChange ?? 0);
  const coins = Number(ev.coinsEarned ?? 0);
  return rc * 30 + coins;
}

async function fetchPlayerWinBest({ arena, provider, player, pageSize = 30 }) {
  let cursor = 0;
  let best = null;

  while (true) {
    const [ids, records] = await withRetry(() => arena.getPlayerMatchRecords(player, cursor, pageSize));
    if (!ids || ids.length === 0) break;

    for (let i = 0; i < ids.length; i++) {
      const matchId = clampUint32(ids[i]);
      const bn = clampUint32(records[i].blockNumber);
      if (!bn) continue;

      const logs = await throttled(() =>
        withRetry(() => arena.queryFilter(arena.filters.MatchCompleted(player), bn, bn)),
      );
      const log = logs[0];
      if (!log?.args) continue;

      const playerRank = Number(log.args.playerRank);
      if (playerRank !== 0) continue;

      const block = await throttled(() => withRetry(() => provider.getBlock(bn)), { minDelayMs: 120 });
      const ev = {
        matchId,
        blockNumber: bn,
        timestamp: block?.timestamp ? Number(block.timestamp) : null,
        txHash: log.transactionHash,
        seed: Number(log.args.seed),
        playerRank,
        playerRankOneBased: playerRank + 1,
        ratingChange: Number(log.args.ratingChange),
        coinsEarned: Number(log.args.coinsEarned),
        players: Array.from(log.args.players ?? []).map((a) => (a ? a.toLowerCase() : a)),
        heroTokenIds: Array.from(log.args.heroTokenIds ?? []).map((x) => x?.toString?.() ?? String(x)),
        scriptTokenIds: Array.from(log.args.scriptTokenIds ?? []).map((x) => x?.toString?.() ?? String(x)),
        replayHash: log.args.replayHash,
      };
      ev.score = scoreWin(ev);

      if (!best || ev.score > best.score) best = ev;
    }

    const lastRecord = records[records.length - 1];
    cursor = clampUint32(lastRecord.playerPrevMatchId);
    if (cursor === 0) break;
  }

  return best;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });
  const arena = new ethers.Contract(ARENA_PROXY, ARENA_ABI, provider);

  const seenPlayers = new Set();
  const gptPlayersQueue = [];
  const gptPlayersFound = [];
  const nameCache = new Map();
  let bestWin = null;

  const matchCount = clampUint32(await withRetry(() => arena.matchCount()));
  let startId = 0;

  const maxGptPlayers = 12;
  const scanPages = 140;
  const pageSize = 35;

  for (let page = 0; page < scanPages; page++) {
    const [ids, records] = await withRetry(() => arena.getMatchRecords(startId, pageSize));
    if (!ids || ids.length === 0) break;

    for (let i = 0; i < ids.length; i++) {
      const bn = clampUint32(records[i].blockNumber);
      if (!bn) continue;
      const logs = await throttled(() => withRetry(() => arena.queryFilter(arena.filters.MatchCompleted(), bn, bn)));
      for (const log of logs) {
        const p = (log?.args?.player ?? '').toString().toLowerCase();
        if (p && !seenPlayers.has(p)) seenPlayers.add(p);
      }
    }

    const candidates = Array.from(seenPlayers).filter((a) => !nameCache.has(a));
    for (const addr of candidates) {
      let name = '';
      try {
        const hex = await throttled(() => withRetry(() => arena.getPlayerName(addr)), { minDelayMs: 120 });
        name = decodeBytes16(hex);
      } catch {
        name = '';
      }
      nameCache.set(addr, name);
      if (includesGpt(name)) {
        const entry = { address: addr, name };
        gptPlayersFound.push(entry);
        gptPlayersQueue.push(entry);
        if (gptPlayersFound.length >= maxGptPlayers) break;
      }
    }

    while (gptPlayersQueue.length > 0) {
      const p = gptPlayersQueue.shift();
      const win = await fetchPlayerWinBest({ arena, provider, player: p.address });
      if (win) {
        win.playerAddress = p.address;
        win.playerName = p.name;
        if (!bestWin || win.score > bestWin.score) bestWin = win;
      }
    }

    if (bestWin) break;

    const lastId = clampUint32(ids[ids.length - 1]);
    startId = Math.max(0, lastId - 1);
    if (startId === 0 || startId >= matchCount) break;
  }

  if (!bestWin) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'NO_GPT_WIN_FOUND_IN_SCAN',
          matchCount,
          uniqueEventPlayersScanned: seenPlayers.size,
          gptPlayersFound,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        bestWin,
        replayUrl: `https://clawking.cc/?replay=${bestWin.matchId}`,
        txUrl: `https://opbnb.bscscan.com/tx/${bestWin.txHash}`,
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

