// ── 链配置 ──
export const CHAIN_ID = 204;
export const CHAIN_NAME = 'opBNB';
export const RPC_URL = 'https://opbnb-mainnet-rpc.bnbchain.org';

// ── 合约地址（只需要 Proxy 地址，其他从链上读取）──
export const ARENA_PROXY = '0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10';

// 运行时从 ArenaProxy 读取的子合约地址（dataStore 初始化时填充）
export const ADDRESSES: { ClawArena: string; LobsterHub: string; ScriptHub: string; ClawUtility: string } = {
  ClawArena:   ARENA_PROXY,
  LobsterHub:  '', // resolved at runtime
  ScriptHub:   '', // resolved at runtime
  ClawUtility: '', // resolved at runtime
};

// ── ABI（只含前端调用的函数，按合约分组）──
export const ARENA_ABI = [
  // 写入
  'function playMatch(uint256 heroTokenId, uint256 scriptTokenId, uint8 itemFlags) payable',
  // 读取
  'function getPlayer(address) view returns (tuple(bytes16 name, uint256 rating, uint256 coins, int256 streak, uint8 season, uint256 itemMask, int8 equippedNameplate, uint256 totalMatches, uint32 wins, uint32 totalKills, uint256 achievements, uint256 heroTokenId, uint256 scriptTokenId, uint56 poolIndex))',
  'function currentSeason() view returns (uint8)',
  'function totalPlayers() view returns (uint256)',
  'function streakKing() view returns (address)',
  'function streakRecord() view returns (uint16)',
  'function getLeaderboard() view returns (address[32], uint256[32], uint8[32])',
  'function entryFee() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function getAddresses() view returns (address _lobsterHub, address _scriptHub, address _clawUtility)',
  // 比赛记录链表
  'function matchCount() view returns (uint32)',
  'function matches(uint32) view returns (uint32 blockNumber, uint32 playerPrevMatchId)',
  'function playerLastMatchId(address) view returns (uint32)',
  'function getMatchRecords(uint32 startId, uint8 count) view returns (uint32[] ids, tuple(uint32 blockNumber, uint32 playerPrevMatchId)[] records)',
  'function getPlayerMatchRecords(address player, uint32 startId, uint8 count) view returns (uint32[] ids, tuple(uint32 blockNumber, uint32 playerPrevMatchId)[] records)',
  // 事件
  'event MatchCompleted(address indexed player, uint32 seed, uint8 playerRank, int16 ratingChange, uint16 coinsEarned, address[8] players, uint256[8] heroTokenIds, uint256[8] scriptTokenIds, bytes32 replayHash)',
] as const;

export const LOBSTER_ABI = [
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function getLobsterStats(uint256) view returns (uint256)',
  'function getLobsterVisual(uint256) view returns (uint256)',
  'function getLobsterName(uint256) view returns (bytes12)',
  'function totalSupply() view returns (uint256)',
  'function defaultCount() view returns (uint256)',
  'function nextTokenId() view returns (uint256)',
  'function tokensOfOwnerPaged(address, uint256, uint256) view returns (uint256[])',
  'function ownedCount(address) view returns (uint256)',
  'function mint(bytes12 name) payable returns (uint256)',
  'function mintDefaultLobster(bytes12 name, uint256 packedStats, uint256 packedVisual) returns (uint256)',
] as const;

export const UTILITY_ABI = [
  'function buyItem(uint8 itemId)',
  'function setName(bytes16 name) payable',
  'function equipNameplate(int8 id)',
  'function equipBadge(uint8 badge)',
  'function updateProfile(bytes16 name, int8 nameplateId, uint8 badgeValue) payable',
  'function endSeason()',
] as const;

export const ARENA_ADMIN_ABI = [
  'function pause()',
  'function unpause()',
  'function addDefaultPlayer(bytes12 name, uint256 heroTokenId, uint256 scriptTokenId)',
  'function addCoins(address addr, uint256 amount)',
] as const;

export const SCRIPT_ABI = [
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function getScriptBytes(uint256) view returns (bytes)',
  'function getScriptName(uint256) view returns (bytes12)',
  'function totalSupply() view returns (uint256)',
  'function defaultCount() view returns (uint256)',
  'function nextTokenId() view returns (uint256)',
  'function tokensOfOwnerPaged(address, uint256, uint256) view returns (uint256[])',
  'function ownedCount(address) view returns (uint256)',
  'function mintScript(bytes12 name, bytes scriptBytes) payable returns (uint256)',
  'function mintDefaultScript(bytes12 name, bytes scriptBytes) returns (uint256)',
  'function updateScript(uint256, bytes)',
] as const;
