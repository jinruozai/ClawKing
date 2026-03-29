// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./Constants.sol";
import "./GameLib.sol";

interface ILobsterHub {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getLobsterStats(uint256 tokenId) external view returns (uint256);
    function defaultCount() external view returns (uint256);
    function nextTokenId() external view returns (uint256);
}

interface IScriptHub {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getScriptBytes(uint256 tokenId) external view returns (bytes memory);
    function defaultCount() external view returns (uint256);
    function nextTokenId() external view returns (uint256);
}

/// @title ClawArena - v4 即时匹配（可升级代理模式）
contract ClawArena is Initializable {

    // ── Owner (lightweight, no OZ dependency) ──
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    function transferOwnership(address newOwner) external onlyOwner { require(newOwner != address(0)); owner = newOwner; }

    // ── Reentrancy guard (proxy-safe) ──
    uint256 private _reentrancyStatus;
    modifier nonReentrant() { require(_reentrancyStatus != 2, "Reentrant"); _reentrancyStatus = 2; _; _reentrancyStatus = 1; }

    // ── Errors ──
    error Paused();
    error NotYourHero();
    error NotYourScript();
    error WrongFee();
    error ItemNotOwned();
    error Unauthorized();
    error InsufficientCoins();
    error TransferFailed();

    // ── Events ──
    event MatchCompleted(
        address indexed player,
        uint32  seed,
        uint8   playerRank,
        int16   ratingChange,
        uint16  coinsEarned,
        address[PLAYERS_PER_MATCH] players,
        uint256[PLAYERS_PER_MATCH] heroTokenIds,
        uint256[PLAYERS_PER_MATCH] scriptTokenIds,
        bytes32 replayHash
    );
    event SeasonEnded(uint8 season);

    // ── Structs ──
    struct Player {
        bytes16  name;
        uint256  rating;
        uint256  coins;
        int256   streak;
        uint8    season;
        uint256  itemMask;
        int8     equippedNameplate;
        uint256  totalMatches;
        uint32   wins;
        uint32   totalKills;
        uint256  achievements;
        // v4 新增
        uint256  heroTokenId;       // 上次使用的英雄 NFT
        uint256  scriptTokenId;     // 上次使用的脚本 NFT
        uint56   poolIndex;         // 7×uint8 packed，每段位的池内位置（255=未写入）
    }

    // ── 比赛记录链表 ──
    struct MatchRecord {
        uint32 blockNumber;        // 定位事件的区块号
        uint32 playerPrevMatchId;  // 玩家链表指针（上一场的 matchId）
    }

    // ── State ──
    uint8 public currentSeason;
    bool public paused;

    ILobsterHub public lobsterHub;
    IScriptHub public scriptHub;
    address public clawUtility;

    mapping(address => Player) public players;
    uint256 public totalPlayers;

    // ── 比赛记录 ──
    uint32 public matchCount;
    mapping(uint32 => MatchRecord) public matches;
    mapping(address => uint32) public playerLastMatchId;

    // ── 排行榜 ──
    address[LEADERBOARD_SIZE] public topPlayers;
    uint256[LEADERBOARD_SIZE] public topRatings;
    uint8[LEADERBOARD_SIZE]   public topSeasons;

    address public streakKing;
    uint16  public streakRecord;

    // ── 对手池（v4） ──
    address[POOL_SIZE][RANK_COUNT] internal _pool;     // 7 个段位 × 256 个地址
    uint8[RANK_COUNT] internal _poolHead;             // 每段写指针

    // ── Rating / Coin tables ──
    function _getRatingDelta(uint8 rank) internal pure returns (int16) {
        if (rank == 0) return 45;  if (rank == 1) return 30;
        if (rank == 2) return 15;  if (rank == 3) return 5;
        if (rank == 4) return -5;  if (rank == 5) return -15;
        if (rank == 6) return -30; return -45;
    }

    function _getCoinReward(uint8 rank) internal pure returns (uint16) {
        if (rank == 0) return 120; if (rank == 1) return 100;
        if (rank == 2) return 85;  if (rank == 3) return 70;
        if (rank == 4) return 55;  if (rank == 5) return 45;
        if (rank == 6) return 35;  return 25;
    }

    // ── Initializer (replaces constructor for proxy pattern) ──
    function initialize(address _lobsterHub, address _scriptHub) external initializer {
        owner = msg.sender;
        _reentrancyStatus = 1;
        lobsterHub = ILobsterHub(_lobsterHub);
        scriptHub = IScriptHub(_scriptHub);
        currentSeason = 1;
    }

    // ═══════════════════════════════════════
    // playMatch（v4 即时匹配）
    // ═══════════════════════════════════════

    function playMatch(uint256 heroTokenId, uint256 scriptTokenId, uint8 itemFlags) external payable nonReentrant {
        if (paused) revert Paused();

        Player storage p = players[msg.sender];

        // 验证 NFT 所有权
        address heroOwner = lobsterHub.ownerOf(heroTokenId);
        if (heroOwner != address(lobsterHub) && heroOwner != msg.sender) revert NotYourHero();
        address scriptOwner = scriptHub.ownerOf(scriptTokenId);
        if (scriptOwner != address(scriptHub) && scriptOwner != msg.sender) revert NotYourScript();

        // 赛季惰性重置
        if (p.season < currentSeason) {
            p.rating = 0;
            p.streak = 0;
            p.season = currentSeason;
        }

        // 道具验证（在费用转账之前，防止费用已转但道具校验失败）
        bool hasTicket = (itemFlags & 1) != 0 && (p.itemMask & (uint256(1) << ITEM_ENTRY_TICKET)) != 0;
        if ((itemFlags & 1) != 0 && !hasTicket) revert ItemNotOwned();
        if ((itemFlags & 2) != 0 && (p.itemMask & (uint256(1) << ITEM_RANK_SHIELD)) == 0) revert ItemNotOwned();
        if ((itemFlags & 4) != 0 && (p.itemMask & (uint256(1) << ITEM_RATING_BOOST)) == 0) revert ItemNotOwned();
        if ((itemFlags & 8) != 0 && (p.itemMask & (uint256(1) << ITEM_COIN_BOOST)) == 0) revert ItemNotOwned();

        // 费用
        if (hasTicket) {
            if (msg.value != 0) revert WrongFee();
            p.itemMask &= ~(uint256(1) << ITEM_ENTRY_TICKET);
        } else {
            if (msg.value != ENTRY_FEE) revert WrongFee();
            (bool ok,) = payable(owner).call{value: msg.value}("");
            if (!ok) revert TransferFailed();
        }

        // 生成 seed
        uint32 seed = uint32(uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, p.totalMatches))));
        if (seed == 0) seed = 1;

        // 确定段位，选对手
        uint256 _t = p.rating / TIER_DIVISOR;
        uint8 tier = uint8(_t < RANK_COUNT - 1 ? _t : RANK_COUNT - 1);
        address[PLAYERS_PER_MATCH - 1] memory opponents = _selectOpponents(msg.sender, tier, seed);

        // 构建所有数组（单次循环）
        address[PLAYERS_PER_MATCH] memory matchPlayers;
        uint256[PLAYERS_PER_MATCH] memory matchHeroIds;
        uint256[PLAYERS_PER_MATCH] memory matchScriptIds;
        uint256[PLAYERS_PER_MATCH] memory lobsterStats;
        bytes[PLAYERS_PER_MATCH] memory scriptBytes;

        matchPlayers[0] = msg.sender;
        matchHeroIds[0] = heroTokenId;
        matchScriptIds[0] = scriptTokenId;
        lobsterStats[0] = lobsterHub.getLobsterStats(heroTokenId);
        scriptBytes[0] = scriptHub.getScriptBytes(scriptTokenId);

        for (uint8 i; i < PLAYERS_PER_MATCH - 1; i++) {
            address opp = opponents[i];
            matchPlayers[i + 1] = opp;
            matchHeroIds[i + 1] = players[opp].heroTokenId;
            matchScriptIds[i + 1] = players[opp].scriptTokenId;
            lobsterStats[i + 1] = lobsterHub.getLobsterStats(matchHeroIds[i + 1]);
            scriptBytes[i + 1] = scriptHub.getScriptBytes(matchScriptIds[i + 1]);
        }

        // 运行引擎
        bytes32 replayHash;
        GameLib.RankingEntry[PLAYERS_PER_MATCH] memory rankings;
        (rankings, replayHash) = GameLib.runGame(lobsterStats, scriptBytes, seed);

        // 找玩家排名（idx==0 的那个 entry）
        uint8 playerRank;
        GameLib.RankingEntry memory playerEntry;
        for (uint8 i; i < PLAYERS_PER_MATCH; i++) {
            if (rankings[i].idx == 0) {
                playerRank = i;
                playerEntry = rankings[i];
                break;
            }
        }

        // 计算对手平均 rating（address(0) 的 AI 对手用玩家自己的 rating）
        uint256 myRating = p.rating;
        uint256 avgRating;
        for (uint8 i = 1; i < PLAYERS_PER_MATCH; i++) {
            avgRating += matchPlayers[i] == address(0) ? myRating : players[matchPlayers[i]].rating;
        }
        avgRating /= (PLAYERS_PER_MATCH - 1);

        // 结算（只结算发起者）
        (int256 rc, uint256 coinGain) = _settlePlayer(msg.sender, playerEntry, playerRank, itemFlags, avgRating);

        // 更新 Player 的英雄/脚本记录
        p.heroTokenId = heroTokenId;
        p.scriptTokenId = scriptTokenId;

        // 写入对手池
        uint256 _nt = p.rating / TIER_DIVISOR;
        uint8 newTier = uint8(_nt < RANK_COUNT - 1 ? _nt : RANK_COUNT - 1);
        _updatePool(msg.sender, newTier);

        // 发出事件
        emit MatchCompleted(
            msg.sender,
            seed,
            playerRank,
            int16(rc),
            uint16(coinGain),
            matchPlayers,
            matchHeroIds,
            matchScriptIds,
            replayHash
        );

        // 写入比赛记录链表
        matchCount++;
        matches[matchCount] = MatchRecord({
            blockNumber: uint32(block.number),
            playerPrevMatchId: playerLastMatchId[msg.sender]
        });
        playerLastMatchId[msg.sender] = matchCount;
    }

    // ═══════════════════════════════════════
    // 对手池
    // ═══════════════════════════════════════

    function _selectOpponents(
        address self,
        uint8 tier,
        uint32 seed
    ) internal view returns (address[PLAYERS_PER_MATCH - 1] memory matched) {
        uint8 count;

        // 从当前段位往下找，直到凑够 7 个对手
        for (uint8 t = tier; ; ) {
            uint8 head = _poolHead[t];
            bool full = _pool[t][POOL_SIZE - 1] != address(0);
            uint16 poolLen = full ? POOL_SIZE : uint16(head);

            if (poolLen >= PLAYERS_PER_MATCH) {
                // 池子够大：随机连续选
                uint8 half = (PLAYERS_PER_MATCH - 1) / 2;
                uint16 pos = uint16(half + (seed % (poolLen - PLAYERS_PER_MATCH + 2)));
                for (uint16 j = pos - half; j <= pos + half && count < PLAYERS_PER_MATCH - 1; j++) {
                    address a = _pool[t][j];
                    if (a != self) matched[count++] = a;
                }
            } else if (poolLen > 0) {
                // 池子不够大：全取
                for (uint16 j; j < poolLen && count < PLAYERS_PER_MATCH - 1; j++) {
                    address a = _pool[t][uint8(j)];
                    if (a != self) matched[count++] = a;
                }
            }

            if (count >= PLAYERS_PER_MATCH - 1 || t == 0) break;
            t--; // 降一个段位继续找
        }
    }

    function _updatePool(address player, uint8 tier) internal {
        Player storage p = players[player];

        // 提取该段位的 poolIndex
        uint8 idx = uint8(p.poolIndex >> (tier * 8));

        // 检查该位置是否还是自己
        if (idx != 255 && _pool[tier][idx] == player) {
            return; // 已在池中
        }

        // 写入新位置
        uint8 head = _poolHead[tier];
        _pool[tier][head] = player;

        // 更新 poolIndex 中对应 tier 的 uint8
        uint56 mask = uint56(0xFF) << (tier * 8);
        p.poolIndex = (p.poolIndex & ~mask) | (uint56(head) << (tier * 8));

        // 推进写指针（环形）
        _poolHead[tier] = uint8((uint16(head) + 1) % POOL_SIZE);
    }

    // ═══════════════════════════════════════
    // Settlement
    // ═══════════════════════════════════════

    function _settlePlayer(
        address addr,
        GameLib.RankingEntry memory re,
        uint8 r,
        uint8 itemFlags,
        uint256 avgRating
    ) internal returns (int256 rc, uint256 coinGain) {
        Player storage p = players[addr];

        rc = _calcRatingChange(r, re, p.rating, avgRating);
        rc = _applyRatingItems(p, rc, itemFlags);
        _applyRating(p, rc);

        coinGain = _applyCoins(p, r, itemFlags);
        _updateStreakAndStats(p, addr, re.kills, rc);
        _updateAchievements(p, re, r);
        _updateLeaderboard(addr, p.rating);
    }

    function _applyRatingItems(Player storage p, int256 rc, uint8 itemFlags) internal returns (int256) {
        if ((itemFlags & 4) != 0 && rc > 0) {
            rc = rc * int256(uint256(BOOST_MULTIPLIER_PCT)) / 100;
            p.itemMask &= ~(uint256(1) << ITEM_RATING_BOOST);
        }
        if ((itemFlags & 2) != 0 && rc < 0) {
            rc = 0;
            p.itemMask &= ~(uint256(1) << ITEM_RANK_SHIELD);
        }
        return rc;
    }

    function _applyRating(Player storage p, int256 rc) internal {
        if (rc > 0) {
            p.rating += uint256(rc);
        } else if (rc < 0) {
            uint256 penalty = uint256(-rc);
            uint256 tierFloor = (p.rating / TIER_DIVISOR) * TIER_DIVISOR;
            if (p.rating <= penalty) p.rating = 0;
            else if (p.rating - penalty < tierFloor) p.rating = tierFloor;
            else p.rating -= penalty;
        }
    }

    function _applyCoins(Player storage p, uint8 r, uint8 itemFlags) internal returns (uint256) {
        uint256 coinGain = uint256(_getCoinReward(r));
        if ((itemFlags & 8) != 0) {
            coinGain = coinGain * BOOST_MULTIPLIER_PCT / 100;
            p.itemMask &= ~(uint256(1) << ITEM_COIN_BOOST);
        }
        p.coins += coinGain;
        return coinGain;
    }

    function _updateStreakAndStats(Player storage p, address addr, uint8 kills, int256 rc) internal {
        if (rc > 0) {
            p.wins++;
            p.streak = p.streak >= 0 ? p.streak + 1 : int256(1);
        } else {
            p.streak = p.streak <= 0 ? p.streak - 1 : int256(-1);
        }
        if (p.totalMatches == 0) totalPlayers++;
        p.totalMatches++;
        p.totalKills += uint32(kills);
        if (p.streak > 0 && uint16(uint256(p.streak)) > streakRecord) {
            streakKing = addr;
            streakRecord = uint16(uint256(p.streak));
        }
    }

    function _calcRatingChange(uint8 r, GameLib.RankingEntry memory re, uint256 playerRating, uint256 avgRating) internal pure returns (int256) {
        int256 rc = int256(_getRatingDelta(r));
        if (re.firstBlood) rc += FIRSTBLOOD_BONUS;
        if (re.kills >= KILL_BONUS_THRESHOLD) rc += int256(uint256(re.kills)) * KILL_BONUS_PER_KILL;

        uint256 selfR = playerRating + ANTI_BOOST_SMOOTHING;
        uint256 roomR = avgRating + ANTI_BOOST_SMOOTHING;
        if (rc > 0) {
            uint256 mult = roomR * 100 / selfR;
            if (mult > ANTI_BOOST_GAIN_MAX) mult = ANTI_BOOST_GAIN_MAX;
            if (mult < ANTI_BOOST_GAIN_MIN) mult = ANTI_BOOST_GAIN_MIN;
            rc = rc * int256(mult) / 100;
            if (rc == 0) rc = 1;
        } else if (rc < 0) {
            uint256 mult = selfR * 100 / roomR;
            if (mult > ANTI_BOOST_LOSS_MAX) mult = ANTI_BOOST_LOSS_MAX;
            if (mult < ANTI_BOOST_LOSS_MIN) mult = ANTI_BOOST_LOSS_MIN;
            rc = rc * int256(mult) / 100;
        }
        return rc;
    }

    // ── Achievements ──

    function _updateAchievements(Player storage p, GameLib.RankingEntry memory re, uint8 r) internal {
        uint256 a = p.achievements;
        // 比赛次数
        a |= (1 << 0); // 首战（totalMatches 已 >= 1）
        if (p.totalMatches >= 100) a |= (1 << 1);
        if (p.totalMatches >= 1000) a |= (1 << 2);
        // 战斗
        if (re.firstBlood) a |= (1 << 3);
        if (re.kills >= 3) a |= (1 << 4);
        if (re.kills >= 5) a |= (1 << 5);
        if (r == 0) a |= (1 << 6);
        // 连胜
        if (p.streak >= 10) a |= (1 << 8);
        if (p.streak >= 50) a |= (1 << 9);
        if (p.streak >= 100) a |= (1 << 10);
        // 击杀
        if (p.totalKills >= 100) a |= (1 << 13);
        if (p.totalKills >= 500) a |= (1 << 14);
        if (p.totalKills >= 1000) a |= (1 << 15);
        // 胜场
        if (p.wins >= 10) a |= (1 << 16);
        if (p.wins >= 100) a |= (1 << 17);
        if (p.wins >= 1000) a |= (1 << 18);
        // 段位 — 用位移代替循环
        uint256 ri = p.rating / TIER_DIVISOR;
        if (ri > RANK_COUNT - 1) ri = RANK_COUNT - 1;
        a |= ((uint256(1) << (ri + 1)) - 1) << 200;
        p.achievements = a;
    }

    // ── Leaderboard ──

    function _updateLeaderboard(address addr, uint256 rating) internal {
        int256 existingPos = -1;
        for (uint8 i; i < LEADERBOARD_SIZE; i++) {
            if (topPlayers[i] == addr) { existingPos = int256(uint256(i)); break; }
        }
        if (existingPos >= 0) {
            for (uint8 i = uint8(uint256(existingPos)); i < LEADERBOARD_SIZE - 1; i++) {
                topPlayers[i] = topPlayers[i + 1];
                topRatings[i] = topRatings[i + 1];
                topSeasons[i] = topSeasons[i + 1];
            }
            topPlayers[LEADERBOARD_SIZE - 1] = address(0);
            topRatings[LEADERBOARD_SIZE - 1] = 0;
            topSeasons[LEADERBOARD_SIZE - 1] = 0;
        } else {
            if (topPlayers[LEADERBOARD_SIZE - 1] != address(0) && rating <= topRatings[LEADERBOARD_SIZE - 1]) return;
        }
        uint8 lo;
        while (lo < LEADERBOARD_SIZE && topPlayers[lo] != address(0) && topRatings[lo] >= rating) lo++;
        for (uint8 i = LEADERBOARD_SIZE - 1; i > lo; i--) {
            topPlayers[i] = topPlayers[i - 1];
            topRatings[i] = topRatings[i - 1];
            topSeasons[i] = topSeasons[i - 1];
        }
        topPlayers[lo] = addr;
        topRatings[lo] = rating;
        topSeasons[lo] = currentSeason;
    }

    // ═══════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════

    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }
    function setLobsterHub(address _hub) external onlyOwner { lobsterHub = ILobsterHub(_hub); }
    function setScriptHub(address _hub) external onlyOwner { scriptHub = IScriptHub(_hub); }
    function setClawUtility(address _addr) external onlyOwner { clawUtility = _addr; }

    /// @notice 添加默认玩家到对手池（管理员从后台调用）
    function addDefaultPlayer(bytes12 name, uint256 heroTokenId, uint256 scriptTokenId) external onlyOwner {
        require(name != bytes12(0), "Empty name");
        // 校验 NFT 存在
        require(heroTokenId < lobsterHub.nextTokenId(), "Hero not exist");
        require(scriptTokenId < scriptHub.nextTokenId(), "Script not exist");
        // 用 name 生成确定性地址
        address ai = address(uint160(uint256(keccak256(abi.encodePacked("AI", name)))));
        Player storage p = players[ai];
        require(p.totalMatches == 0, "Already exists");
        p.name = bytes16(name);
        p.heroTokenId = heroTokenId;
        p.scriptTokenId = scriptTokenId;
        p.totalMatches = 1;
        p.season = currentSeason;
        totalPlayers++;
        _updatePool(ai, 0); // 写入最低段位池
    }

    // ═══════════════════════════════════════
    // 供外部合约调用
    // ═══════════════════════════════════════

    modifier onlyAuthorized() {
        if (msg.sender != clawUtility && msg.sender != address(lobsterHub) && msg.sender != address(scriptHub) && msg.sender != owner) revert Unauthorized();
        _;
    }

    function spendCoins(address addr, uint256 amount) external onlyAuthorized {
        if (players[addr].coins < amount) revert InsufficientCoins();
        players[addr].coins -= amount;
    }

    /// @notice 测试用：给玩家加金币（部署后可移除）
    function addCoins(address addr, uint256 amount) external onlyOwner {
        players[addr].coins += amount;
    }

    function grantItem(address addr, uint8 itemId) external onlyAuthorized {
        players[addr].itemMask |= (uint256(1) << itemId);
    }

    function updatePlayerName(address addr, bytes16 name) external onlyAuthorized {
        players[addr].name = name;
    }

    function updatePlayerNameplate(address addr, int8 id) external onlyAuthorized {
        players[addr].equippedNameplate = id;
    }

    function updatePlayerBadge(address addr, uint8 badge) external onlyAuthorized {
        if (badge == 0) {
            players[addr].achievements &= ~(uint256(0xFF) << 248);
        } else {
            players[addr].achievements = (players[addr].achievements & ~(uint256(0xFF) << 248)) | (uint256(badge) << 248);
        }
    }

    function endSeason_resetLeaderboard() external onlyAuthorized {
        for (uint8 i; i < LEADERBOARD_SIZE; i++) {
            topPlayers[i] = address(0);
            topRatings[i] = 0;
            topSeasons[i] = 0;
        }
        streakKing = address(0);
        streakRecord = 0;

        emit SeasonEnded(currentSeason);
        currentSeason++;
    }

    // ═══════════════════════════════════════
    // View
    // ═══════════════════════════════════════

    function getPlayer(address addr) external view returns (Player memory) { return players[addr]; }
    function getPlayerItemMask(address addr) external view returns (uint256) { return players[addr].itemMask; }
    function getPlayerName(address addr) external view returns (bytes16) { return players[addr].name; }
    function getPlayerAchievements(address addr) external view returns (uint256) { return players[addr].achievements; }
    function getLeaderboard() external view returns (address[LEADERBOARD_SIZE] memory, uint256[LEADERBOARD_SIZE] memory, uint8[LEADERBOARD_SIZE] memory) {
        return (topPlayers, topRatings, topSeasons);
    }
    function entryFee() external pure returns (uint256) { return ENTRY_FEE; }

    /// @notice 一次性返回所有子合约地址（前端启动时调一次）
    function getAddresses() external view returns (address _lobsterHub, address _scriptHub, address _clawUtility) {
        return (address(lobsterHub), address(scriptHub), clawUtility);
    }

    /// @notice 读取某段位池的所有地址
    function getPool(uint8 tier) external view returns (address[] memory addrs, uint8 head) {
        head = _poolHead[tier];
        bool full = _pool[tier][POOL_SIZE - 1] != address(0);
        uint16 len = full ? POOL_SIZE : uint16(head);
        addrs = new address[](len);
        for (uint16 i; i < len; i++) {
            addrs[i] = _pool[tier][uint8(i)];
        }
    }

    /// @notice 批量读全局比赛记录（从 startId 往回读 count 条）
    function getMatchRecords(uint32 startId, uint8 count) external view returns (uint32[] memory ids, MatchRecord[] memory records) {
        if (startId == 0 || startId > matchCount) startId = matchCount;
        uint8 actual = 0;
        for (uint32 id = startId; id > 0 && actual < count; id--) {
            actual++;
        }
        ids = new uint32[](actual);
        records = new MatchRecord[](actual);
        uint32 id = startId;
        for (uint8 i = 0; i < actual; i++) {
            ids[i] = id;
            records[i] = matches[id];
            id--;
        }
    }

    /// @notice 批量读玩家比赛记录（沿链表读 count 条）
    function getPlayerMatchRecords(address player, uint32 startId, uint8 count) external view returns (uint32[] memory ids, MatchRecord[] memory records) {
        if (startId == 0) startId = playerLastMatchId[player];
        // 先数实际条数
        uint8 actual = 0;
        uint32 cursor = startId;
        while (cursor > 0 && actual < count) {
            actual++;
            cursor = matches[cursor].playerPrevMatchId;
        }
        ids = new uint32[](actual);
        records = new MatchRecord[](actual);
        cursor = startId;
        for (uint8 i = 0; i < actual; i++) {
            ids[i] = cursor;
            records[i] = matches[cursor];
            cursor = matches[cursor].playerPrevMatchId;
        }
    }

}
