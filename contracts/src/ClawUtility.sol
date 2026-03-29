// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Constants.sol";

interface IClawArenaShop {
    function spendCoins(address addr, uint256 amount) external;
    function grantItem(address addr, uint8 itemId) external;
    function updatePlayerName(address addr, bytes16 name) external;
    function updatePlayerNameplate(address addr, int8 id) external;
    function updatePlayerBadge(address addr, uint8 badge) external;
    function endSeason_resetLeaderboard() external;
    function getPlayerItemMask(address addr) external view returns (uint256);
    function getPlayerName(address addr) external view returns (bytes16);
    function getPlayerAchievements(address addr) external view returns (uint256);
    function getLeaderboard() external view returns (
        address[LEADERBOARD_SIZE] memory,
        uint256[LEADERBOARD_SIZE] memory,
        uint8[LEADERBOARD_SIZE] memory
    );
    function currentSeason() external view returns (uint8);
}

/// @title ClawUtility - 商店 + 改名 + 铭牌/徽章 + 赛季管理
contract ClawUtility is Ownable {

    // ── 费用 ──
    uint256 constant NAME_FEE             = 0.002 ether; // 0.002 BNB on opBNB

    // ── 铭牌 ──
    uint8   constant NAMEPLATE_ID_MIN     = 33;
    uint8   constant NAMEPLATE_ID_MAX     = 42;
    uint256 constant NAMEPLATE_BASE_PRICE = 500;
    uint256 constant NAMEPLATE_STEP_PRICE = 300;

    // ── 赛季 ──
    uint8   constant SEASON_BITS_PER      = 4;

    // ── 存储 ──
    IClawArenaShop public clawArena;

    constructor(address _arena) Ownable(msg.sender) {
        clawArena = IClawArenaShop(_arena);
    }

    // ── 商店 ──

    function buyItem(uint8 itemId) external {
        uint256 price = getItemPrice(itemId);
        require(price > 0, "Invalid item");
        uint256 mask = clawArena.getPlayerItemMask(msg.sender);
        require((mask & (uint256(1) << itemId)) == 0, "Already owned");
        clawArena.spendCoins(msg.sender, price);
        clawArena.grantItem(msg.sender, itemId);
    }

    function getItemPrice(uint8 itemId) public pure returns (uint256) {
        if (itemId == ITEM_ENTRY_TICKET)  return PRICE_ENTRY_TICKET;
        if (itemId == ITEM_RANK_SHIELD)   return PRICE_RANK_SHIELD;
        if (itemId == ITEM_RATING_BOOST)  return PRICE_RATING_BOOST;
        if (itemId == ITEM_COIN_BOOST)    return PRICE_COIN_BOOST;
        if (itemId >= NAMEPLATE_ID_MIN && itemId <= NAMEPLATE_ID_MAX) {
            uint256 n = uint256(itemId - NAMEPLATE_ID_MIN);
            return NAMEPLATE_BASE_PRICE + n * NAMEPLATE_STEP_PRICE;
        }
        return 0;
    }

    // ── 改名 ──

    function setName(bytes16 name) external payable {
        require(name != bytes16(0), "Empty name");
        bytes16 currentName = clawArena.getPlayerName(msg.sender);
        if (currentName != bytes16(0)) {
            require(msg.value == NAME_FEE, "Exact fee required");
            (bool ok,) = payable(owner()).call{value: msg.value}("");
            require(ok, "Transfer failed");
        } else {
            require(msg.value == 0, "First name is free");
        }
        clawArena.updatePlayerName(msg.sender, name);
    }

    // ── 铭牌 ──

    function equipNameplate(int8 nameplateId) external {
        if (nameplateId <= 0) {
            clawArena.updatePlayerNameplate(msg.sender, 0);
        } else {
            require(nameplateId >= int8(NAMEPLATE_ID_MIN) && nameplateId <= int8(NAMEPLATE_ID_MAX)
                    || (nameplateId >= 1 && nameplateId <= 32), "Invalid nameplate");
            uint256 mask = clawArena.getPlayerItemMask(msg.sender);
            require((mask & (uint256(1) << uint8(int8(nameplateId)))) != 0, "Not owned");
            clawArena.updatePlayerNameplate(msg.sender, nameplateId);
        }
    }

    // ── 徽章 ──

    function equipBadge(uint8 badgeValue) external {
        if (badgeValue == 0) {
            clawArena.updatePlayerBadge(msg.sender, 0);
        } else {
            require(badgeValue <= 255, "Invalid badge");
            uint256 achievements = clawArena.getPlayerAchievements(msg.sender);
            require((achievements & (uint256(1) << (badgeValue - 1))) != 0, "Not earned");
            clawArena.updatePlayerBadge(msg.sender, badgeValue);
        }
    }

    // ── 一键更新资料（名字+铭牌+徽章，只执行有变更的部分）──
    // CEI 模式：先校验全部输入 → 再变更状态 → 最后转账

    function updateProfile(bytes16 name, int8 nameplateId, uint8 badgeValue) external payable {
        // ── Phase 1: Validate ALL inputs before any state change ──
        bool needsNameFee = false;
        if (name != bytes16(0)) {
            bytes16 currentName = clawArena.getPlayerName(msg.sender);
            if (name != currentName) {
                if (currentName != bytes16(0)) {
                    require(msg.value == NAME_FEE, "Exact fee required");
                    needsNameFee = true;
                } else {
                    require(msg.value == 0, "First name is free");
                }
            } else {
                require(msg.value == 0, "Name unchanged");
            }
        } else {
            require(msg.value == 0, "No name change");
        }
        if (nameplateId > 0) {
            require(nameplateId >= int8(NAMEPLATE_ID_MIN) && nameplateId <= int8(NAMEPLATE_ID_MAX)
                    || (nameplateId >= 1 && nameplateId <= 32), "Invalid nameplate");
            uint256 mask = clawArena.getPlayerItemMask(msg.sender);
            require((mask & (uint256(1) << uint8(int8(nameplateId)))) != 0, "Not owned");
        }
        if (badgeValue > 0) {
            require(badgeValue <= 255, "Invalid badge");
            uint256 achievements = clawArena.getPlayerAchievements(msg.sender);
            require((achievements & (uint256(1) << (badgeValue - 1))) != 0, "Not earned");
        }

        // ── Phase 2: Apply state changes ──
        if (name != bytes16(0)) {
            bytes16 currentName = clawArena.getPlayerName(msg.sender);
            if (name != currentName) {
                clawArena.updatePlayerName(msg.sender, name);
            }
        }
        if (nameplateId < 0) {
            clawArena.updatePlayerNameplate(msg.sender, 0);
        } else if (nameplateId > 0) {
            clawArena.updatePlayerNameplate(msg.sender, nameplateId);
        }
        if (badgeValue > 0) {
            clawArena.updatePlayerBadge(msg.sender, badgeValue);
        }

        // ── Phase 3: Transfer ETH (after all state changes succeed) ──
        if (needsNameFee) {
            (bool ok,) = payable(owner()).call{value: msg.value}("");
            require(ok, "Transfer failed");
        }
    }

    // ── 赛季管理 ──

    function endSeason() external onlyOwner {
        (address[LEADERBOARD_SIZE] memory players,,) = clawArena.getLeaderboard();
        uint8 season = clawArena.currentSeason();
        uint8 baseBit = ((season - 1) % 8) * SEASON_BITS_PER + 1;

        for (uint8 i; i < LEADERBOARD_SIZE; i++) {
            if (players[i] == address(0)) break;
            uint8 tier;
            if (i == 0) tier = 0;
            else if (i == 1) tier = 1;
            else if (i == 2) tier = 2;
            else tier = 3;
            clawArena.grantItem(players[i], baseBit + tier);
        }

        clawArena.endSeason_resetLeaderboard();
    }

    // ── 管理员 ──

    function setClawArena(address _arena) external onlyOwner {
        clawArena = IClawArenaShop(_arena);
    }
}
