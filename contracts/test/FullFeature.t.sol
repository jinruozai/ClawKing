// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/ClawUtility.sol";
import "../src/DefaultData.sol";
import "../src/Constants.sol";

contract FullFeatureTest is Test {
    ClawArena arena;
    LobsterHub lobsterHub;
    ScriptHub scriptHub;
    ClawUtility utility;

    address[8] testPlayers;
    address owner;

    // 接收 BNB（owner 收入场费）
    receive() external payable {}

    function setUp() public {
        owner = address(this);

        scriptHub = new ScriptHub();
        lobsterHub = new LobsterHub();
        arena = new ClawArena();
        arena.initialize(address(lobsterHub), address(scriptHub));
        utility = new ClawUtility(address(arena));

        lobsterHub.setClawArena(address(arena));
        scriptHub.setClawArena(address(arena));
        arena.setClawUtility(address(utility));

        lobsterHub.initDefaultHeroes(
            DefaultData.getDefaultHeroStats(),
            DefaultData.getDefaultHeroVisuals(),
            DefaultData.getDefaultHeroNames()
        );
        scriptHub.initDefaultScripts(DefaultData.getDefaultScriptNames(), DefaultData.getDefaultScripts());

        for (uint8 i = 0; i < 8; i++) {
            testPlayers[i] = address(uint160(0x1000 + i));
            vm.deal(testPlayers[i], 100 ether);
        }
    }

    // ═══════════════════════════════════════
    // 比赛流程
    // ═══════════════════════════════════════

    function test_playMatch() public {
        _playAll();

        // 所有玩家有结算数据
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            assertEq(p.totalMatches, 1);
            assertGt(p.coins, 0);
        }
    }

    function test_wrongFeeReverts() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert(ClawArena.WrongFee.selector);
        arena.playMatch{value: ENTRY_FEE + 1}(0, 0, 0);
    }

    // ═══════════════════════════════════════
    // 积分和排行榜
    // ═══════════════════════════════════════

    function test_ratingAndLeaderboard() public {
        _playAll();

        (address[LEADERBOARD_SIZE] memory topAddr,,) = arena.getLeaderboard();

        bool hasEntry = false;
        for (uint8 i = 0; i < LEADERBOARD_SIZE; i++) {
            if (topAddr[i] != address(0)) {
                hasEntry = true;
                break;
            }
        }
        assertTrue(hasEntry);
    }

    function test_ratingAfterMultipleMatches() public {
        _playAll();
        _playAll();

        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            assertEq(p.totalMatches, 2);
        }
    }

    // ═══════════════════════════════════════
    // 成就
    // ═══════════════════════════════════════

    function test_achievementsAfterMatch() public {
        _playAll();

        // 所有玩家应该有 bit 0（首战成就）
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            assertTrue(p.achievements & (1 << 0) != 0, "First match achievement");
        }

        // 多打几局确保有人拿到冠军成就（rank 0 取决于种子，单局不保证）
        for (uint8 r = 0; r < 10; r++) {
            for (uint8 i = 0; i < 8; i++) {
                vm.roll(block.number + 1);
                vm.warp(block.timestamp + 15);
                vm.prank(testPlayers[i]);
                arena.playMatch{value: ENTRY_FEE}(i, i % 3, 0);
            }
        }
        bool foundChampion = false;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.achievements & (1 << 6) != 0) {
                foundChampion = true;
                break;
            }
        }
        assertTrue(foundChampion, "Champion achievement");
    }

    // ═══════════════════════════════════════
    // 改名
    // ═══════════════════════════════════════

    function test_setNameFirstTime() public {
        vm.prank(testPlayers[0]);
        utility.setName(bytes16("Gooooo"));

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.name, bytes16("Gooooo"));
    }

    function test_renameRequiresFee() public {
        vm.prank(testPlayers[0]);
        utility.setName(bytes16("First"));

        vm.prank(testPlayers[0]);
        vm.expectRevert("Exact fee required");
        utility.setName(bytes16("Second"));

        vm.prank(testPlayers[0]);
        utility.setName{value: 0.002 ether}(bytes16("Second"));

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.name, bytes16("Second"));
    }

    // ═══════════════════════════════════════
    // 商店购买
    // ═══════════════════════════════════════

    function test_buyItem() public {
        _playAll();

        address buyer;
        uint256 coins;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.coins >= 50) {
                buyer = testPlayers[i];
                coins = p.coins;
                break;
            }
        }
        require(buyer != address(0), "No player with enough coins");

        vm.prank(buyer);
        utility.buyItem(ITEM_COIN_BOOST);

        ClawArena.Player memory p = arena.getPlayer(buyer);
        assertEq(p.coins, coins - 50);
        assertTrue(p.itemMask & (uint256(1) << ITEM_COIN_BOOST) != 0, "Item owned");
    }

    function test_itemPrices() public view {
        assertEq(utility.getItemPrice(ITEM_ENTRY_TICKET), 2000);
        assertEq(utility.getItemPrice(ITEM_RANK_SHIELD), 800);
        assertEq(utility.getItemPrice(ITEM_RATING_BOOST), 500);
        assertEq(utility.getItemPrice(ITEM_COIN_BOOST), 50);
        assertEq(utility.getItemPrice(33), 500);
        assertEq(utility.getItemPrice(34), 800);
        assertEq(utility.getItemPrice(35), 1100);
        assertEq(utility.getItemPrice(99), 0);
    }

    // ═══════════════════════════════════════
    // 铭牌装备
    // ═══════════════════════════════════════

    function test_equipNameplate() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address buyer = testPlayers[0];
        ClawArena.Player memory p = arena.getPlayer(buyer);
        if (p.coins >= 500) {
            vm.prank(buyer);
            utility.buyItem(33);

            vm.prank(buyer);
            utility.equipNameplate(33);

            p = arena.getPlayer(buyer);
            assertEq(p.equippedNameplate, 33);

            vm.prank(buyer);
            utility.equipNameplate(0);

            p = arena.getPlayer(buyer);
            assertEq(p.equippedNameplate, 0);
        }
    }

    function test_equipNameplateNotOwned() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert("Not owned");
        utility.equipNameplate(33);
    }

    // ═══════════════════════════════════════
    // 徽章装备
    // ═══════════════════════════════════════

    function test_equipBadge() public {
        _playAll();

        vm.prank(testPlayers[0]);
        utility.equipBadge(1);

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        uint8 equipped = uint8(p.achievements >> 248);
        assertEq(equipped, 1);

        vm.prank(testPlayers[0]);
        utility.equipBadge(0);

        p = arena.getPlayer(testPlayers[0]);
        equipped = uint8(p.achievements >> 248);
        assertEq(equipped, 0);
    }

    function test_equipBadgeNotEarned() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert("Not earned");
        utility.equipBadge(5);
    }

    // ═══════════════════════════════════════
    // 道具效果（入场券免费参赛）
    // ═══════════════════════════════════════

    function test_entryTicketFreeEntry() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address buyer = testPlayers[0];
        ClawArena.Player memory p = arena.getPlayer(buyer);
        if (p.coins >= 2000) {
            vm.prank(buyer);
            utility.buyItem(ITEM_ENTRY_TICKET);

            uint256 balBefore = buyer.balance;
            vm.prank(buyer);
            arena.playMatch{value: 0}(0, 0, 1); // itemFlags = 1

            assertEq(buyer.balance, balBefore); // 没花 POL

            p = arena.getPlayer(buyer);
            assertTrue(p.itemMask & (uint256(1) << ITEM_ENTRY_TICKET) == 0, "Ticket consumed");
        }
    }

    // ═══════════════════════════════════════
    // 赛季管理
    // ═══════════════════════════════════════

    function test_endSeason() public {
        _playAll();

        uint8 seasonBefore = arena.currentSeason();
        utility.endSeason();

        assertEq(arena.currentSeason(), seasonBefore + 1);

        (address[LEADERBOARD_SIZE] memory topAddr,,) = arena.getLeaderboard();
        assertEq(topAddr[0], address(0));

        assertEq(arena.streakKing(), address(0));
        assertEq(arena.streakRecord(), 0);
    }

    function test_seasonResetOnPlay() public {
        _playAll();
        utility.endSeason();

        ClawArena.Player memory pBefore = arena.getPlayer(testPlayers[0]);
        uint256 ratingBefore = pBefore.rating;

        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        ClawArena.Player memory pAfter = arena.getPlayer(testPlayers[0]);
        if (ratingBefore > 0) {
            // rating 被重置后重新计算，不应该等于旧值
            assertTrue(pAfter.season == arena.currentSeason(), "Season updated");
        }
    }

    // ═══════════════════════════════════════
    // 连胜
    // ═══════════════════════════════════════

    function test_streakTracking() public {
        _playAll();

        bool foundStreak = false;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.streak == 1) {
                foundStreak = true;
                break;
            }
        }
        assertTrue(foundStreak, "Winner has streak 1");
    }

    // ═══════════════════════════════════════
    // Pause
    // ═══════════════════════════════════════

    function test_pauseUnpause() public {
        arena.pause();

        vm.prank(testPlayers[0]);
        vm.expectRevert(ClawArena.Paused.selector);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        arena.unpause();

        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.totalMatches, 1);
    }

    // ═══════════════════════════════════════
    // NFT 所有权验证
    // ═══════════════════════════════════════

    function test_cannotUseOthersNFT() public {
        arena.addCoins(testPlayers[0], 1000);
        vm.prank(testPlayers[0]);
        uint256 heroId = lobsterHub.mint{value: 0.001 ether}("MyLobster");

        vm.prank(testPlayers[1]);
        vm.expectRevert(ClawArena.NotYourHero.selector);
        arena.playMatch{value: ENTRY_FEE}(heroId, 0, 0);
    }

    // ═══════════════════════════════════════
    // 全局统计
    // ═══════════════════════════════════════

    function test_totalPlayers() public {
        assertEq(arena.totalPlayers(), 0);
        _playAll();
        assertEq(arena.totalPlayers(), 8);

        // 再打一局，人数不增加（同样的玩家）
        _playAll();
        assertEq(arena.totalPlayers(), 8);
    }

    function test_streakKing() public {
        _playAll();

        address king = arena.streakKing();
        uint16 record = arena.streakRecord();

        assertTrue(king != address(0), "Streak king set");
        assertEq(record, 1);

        _playAll();

        uint16 newRecord = arena.streakRecord();
        assertGe(newRecord, 1);
    }

    // ═══════════════════════════════════════
    // 商店重复购买
    // ═══════════════════════════════════════

    function test_cannotBuyDuplicateItem() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address buyer = testPlayers[0];
        ClawArena.Player memory p = arena.getPlayer(buyer);
        if (p.coins >= 100) {
            vm.prank(buyer);
            utility.buyItem(ITEM_COIN_BOOST);

            vm.prank(buyer);
            vm.expectRevert("Already owned");
            utility.buyItem(ITEM_COIN_BOOST);
        }
    }

    // ═══════════════════════════════════════
    // 道具使用效果
    // ═══════════════════════════════════════

    function test_ratingBoostEffect() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address booster;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.rating > 0 && p.coins >= 1000) {
                booster = testPlayers[i];
                break;
            }
        }
        if (booster == address(0)) return;

        vm.prank(booster);
        utility.buyItem(ITEM_RATING_BOOST);

        ClawArena.Player memory pBefore = arena.getPlayer(booster);
        assertTrue(pBefore.itemMask & (uint256(1) << ITEM_RATING_BOOST) != 0, "Boost owned");

        // 打一局（带积分加成 itemFlags bit 2 = 4）
        vm.prank(booster);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 4);

        ClawArena.Player memory pAfter = arena.getPlayer(booster);
        assertTrue(pAfter.itemMask & (uint256(1) << ITEM_RATING_BOOST) == 0, "Boost consumed");
    }

    function test_rankShieldEffect() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address shielder;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.coins >= 800) {
                shielder = testPlayers[i];
                break;
            }
        }
        if (shielder == address(0)) return;

        vm.prank(shielder);
        utility.buyItem(ITEM_RANK_SHIELD);

        vm.prank(shielder);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 2); // itemFlags = 2

        ClawArena.Player memory pAfter = arena.getPlayer(shielder);
        assertTrue(pAfter.itemMask & (uint256(1) << ITEM_RANK_SHIELD) == 0, "Shield consumed");
    }

    function test_coinBoostEffect() public {
        for (uint8 m = 0; m < 3; m++) _playAll();

        address booster;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            if (p.coins >= 50) {
                booster = testPlayers[i];
                break;
            }
        }
        if (booster == address(0)) return;

        vm.prank(booster);
        utility.buyItem(ITEM_COIN_BOOST);

        uint256 coinsBefore = arena.getPlayer(booster).coins;

        vm.prank(booster);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 8); // itemFlags = 8

        ClawArena.Player memory pAfter = arena.getPlayer(booster);
        assertTrue(pAfter.itemMask & (uint256(1) << ITEM_COIN_BOOST) == 0, "Coin boost consumed");
        assertGt(pAfter.coins, coinsBefore, "Got boosted coins");
    }

    // ═══════════════════════════════════════
    // 入场费直接转 owner
    // ═══════════════════════════════════════

    function test_entryFeeGoesToOwner() public {
        uint256 ownerBalBefore = owner.balance;

        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        assertEq(owner.balance, ownerBalBefore + ENTRY_FEE, "Owner received entry fee");
    }

    // ═══════════════════════════════════════
    // 对手池
    // ═══════════════════════════════════════

    function test_poolUpdatedAfterMatch() public {
        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        // 玩家应该被写入对手池
        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.heroTokenId, 0);
        assertEq(p.scriptTokenId, 0);
        assertEq(p.totalMatches, 1);
    }

    function test_matchCompletedEvent() public {
        vm.recordLogs();
        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 matchCompletedSig = keccak256("MatchCompleted(address,uint32,uint8,int16,uint16,address[8],uint256[8],uint256[8],bytes32)");

        uint256 completedCount;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == matchCompletedSig) {
                completedCount++;
            }
        }
        assertEq(completedCount, 1, "1 MatchCompleted event");
    }

    // ═══════════════════════════════════════
    // 铸造 NFT
    // ═══════════════════════════════════════

    function test_mintLobster() public {
        arena.addCoins(testPlayers[0], 1000);
        uint256 balBefore = testPlayers[0].balance;

        vm.prank(testPlayers[0]);
        uint256 tokenId = lobsterHub.mint{value: 0.001 ether}("TestLob");

        assertGt(tokenId, 11, "Minted after defaults");
        assertEq(lobsterHub.ownerOf(tokenId), testPlayers[0]);
        assertEq(testPlayers[0].balance, balBefore - 0.001 ether);

        // 能用自己铸造的龙虾打比赛
        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(tokenId, 0, 0);

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.heroTokenId, tokenId);
    }

    function test_mintLobsterWrongFee() public {
        arena.addCoins(testPlayers[0], 1000);

        vm.prank(testPlayers[0]);
        vm.expectRevert("Pay 0.001 BNB");
        lobsterHub.mint{value: 0.01 ether}("BadFee");
    }

    function test_mintScript() public {
        // 构建最简脚本字节：1 slot + 1 rule (move center)
        bytes memory script = new bytes(1 + 8 + 1 + 47);
        script[0] = 0x01; // 1 slot
        script[1] = 0x07; // sortBy=DIST
        script[9] = 0x01; // 1 rule
        script[10 + 44] = 0x03; // action=MOVE
        script[10 + 45] = 0x06; // arg=DIR_CENTER

        arena.addCoins(testPlayers[0], 100);
        vm.prank(testPlayers[0]);
        uint256 tokenId = scriptHub.mintScript{value: 0.001 ether}("MyScript", script);

        assertGt(tokenId, 11, "Minted after defaults");
        assertEq(scriptHub.ownerOf(tokenId), testPlayers[0]);

        // 能用自己铸造的脚本打比赛
        vm.prank(testPlayers[0]);
        arena.playMatch{value: ENTRY_FEE}(0, tokenId, 0);
    }

    // ═══════════════════════════════════════
    // 费用边界
    // ═══════════════════════════════════════

    function test_wrongFeeZero() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert(ClawArena.WrongFee.selector);
        arena.playMatch{value: 0}(0, 0, 0); // 没有入场券却付 0
    }

    function test_wrongFeeOverpay() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert(ClawArena.WrongFee.selector);
        arena.playMatch{value: 1 ether}(0, 0, 0); // 大额多付
    }

    function test_renameOverpay() public {
        vm.prank(testPlayers[0]);
        utility.setName(bytes16("First"));

        vm.prank(testPlayers[0]);
        vm.expectRevert("Exact fee required");
        utility.setName{value: 1 ether}(bytes16("Second")); // 多付也 revert
    }

    function test_mintLobsterNoCoins() public {
        // 有 BNB 但没金币
        vm.prank(testPlayers[0]);
        vm.expectRevert(); // spendCoins 会 revert
        lobsterHub.mint{value: 0.001 ether}("NoCoin");
    }

    // ═══════════════════════════════════════
    // 未持有道具不能使用
    // ═══════════════════════════════════════

    function test_useItemNotOwned() public {
        vm.prank(testPlayers[0]);
        vm.expectRevert(ClawArena.ItemNotOwned.selector);
        arena.playMatch{value: ENTRY_FEE}(0, 0, 2); // rank shield 没买就用
    }

    // ═══════════════════════════════════════
    // updateProfile 一笔交易
    // ═══════════════════════════════════════

    function test_updateProfile() public {
        _playAll(); // 让玩家有成就

        // 首次设名（免费）+ 装备徽章
        vm.prank(testPlayers[0]);
        utility.updateProfile(bytes16("Hero1"), 0, 1);

        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.name, bytes16("Hero1"));
        uint8 badge = uint8(p.achievements >> 248);
        assertEq(badge, 1);
    }

    // ═══════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════

    /// @notice 8 人依次即时匹配
    function _playAll() internal {
        for (uint8 i = 0; i < 8; i++) {
            vm.prank(testPlayers[i]);
            arena.playMatch{value: ENTRY_FEE}(i, i % 3, 0);
        }
    }
}
