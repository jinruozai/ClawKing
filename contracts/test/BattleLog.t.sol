// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/ClawUtility.sol";
import "../src/DefaultData.sol";

/// @title BattleLog — 跑几场比赛输出详细回合日志，分析平衡性
contract BattleLogTest is Test {
    ClawArena arena;
    LobsterHub lobsterHub;
    ScriptHub scriptHub;
    ClawUtility utility;

    receive() external payable {}

    function setUp() public {
        scriptHub = new ScriptHub();
        lobsterHub = new LobsterHub();
        arena = new ClawArena();
        arena.initialize(address(lobsterHub), address(scriptHub));
        utility = new ClawUtility(address(arena));
        lobsterHub.setClawArena(address(arena));
        arena.setClawUtility(address(utility));

        lobsterHub.initDefaultHeroes(
            DefaultData.getDefaultHeroStats(),
            DefaultData.getDefaultHeroVisuals(),
            DefaultData.getDefaultHeroNames()
        );
        scriptHub.initDefaultScripts(DefaultData.getDefaultScriptNames(), DefaultData.getDefaultScripts());

        bytes12[] memory aiNames = DefaultData.getDefaultHeroNames();
        for (uint8 i = 0; i < 12; i++) {
            arena.addDefaultPlayer(aiNames[i], i, i);
        }
    }

    /// 跑 5 场比赛，每场用不同 seed，输出排名
    function test_battleLog5() public {
        uint256 entryFee = arena.entryFee();

        for (uint256 game = 0; game < 5; game++) {
            address p = address(uint160(0x5000 + game));
            vm.deal(p, 100 ether);

            // 每场用不同的 hero (0-4)
            uint256 heroId = game % 12;
            uint256 scriptId = heroId;

            vm.roll(block.number + game + 1);
            vm.warp(block.timestamp + 15 * (game + 1));

            vm.prank(p);
            arena.playMatch{value: entryFee}(heroId, scriptId, 0);

            // 读取结果
            ClawArena.Player memory pl = arena.getPlayer(p);
            emit log(string.concat(
                "Game ", vm.toString(game),
                " hero=", vm.toString(heroId),
                " rank=", vm.toString(8 - pl.wins), // wins=1 means rank1
                " rating=", vm.toString(pl.rating),
                " kills=", vm.toString(pl.totalKills)
            ));
        }
    }

    /// 重点分析：苟苟虾(#10) vs 其他龙虾的对局
    /// 让苟苟虾打 20 场，看它的详细胜负
    function test_hermitAnalysis() public {
        uint256 entryFee = arena.entryFee();
        uint256 wins = 0;
        uint256 totalKills = 0;

        for (uint256 game = 0; game < 20; game++) {
            address p = address(uint160(0x6000 + game));
            vm.deal(p, 100 ether);

            vm.roll(block.number + game + 1);
            vm.warp(block.timestamp + 15 * (game + 1));

            vm.prank(p);
            arena.playMatch{value: entryFee}(10, 10, 0); // hero=Hermit, script=Hermit

            ClawArena.Player memory pl = arena.getPlayer(p);
            string memory result = pl.wins > 0 ? "WIN" : string.concat("rank=", vm.toString(uint256(8)));

            // 读取 ratingChange (从 rating 推算，初始=0)
            emit log(string.concat(
                "  Hermit game ", vm.toString(game),
                " | ", result,
                " | rating=", vm.toString(pl.rating),
                " | kills=", vm.toString(pl.totalKills)
            ));

            if (pl.wins > 0) wins++;
            totalKills += pl.totalKills;
        }

        emit log(string.concat(
            "Hermit 20 games: wins=", vm.toString(wins),
            " winRate=", vm.toString(wins * 100 / 20),
            "% totalKills=", vm.toString(totalKills)
        ));
    }

    /// Arctic Shrimp (#8) 分析
    function test_arcticAnalysis() public {
        uint256 entryFee = arena.entryFee();
        uint256 wins = 0;
        uint256 totalKills = 0;

        for (uint256 game = 0; game < 20; game++) {
            address p = address(uint160(0x7000 + game));
            vm.deal(p, 100 ether);

            vm.roll(block.number + game + 1);
            vm.warp(block.timestamp + 15 * (game + 1));

            vm.prank(p);
            arena.playMatch{value: entryFee}(8, 8, 0);

            ClawArena.Player memory pl = arena.getPlayer(p);
            string memory result = pl.wins > 0 ? "WIN" : "LOSE";

            emit log(string.concat(
                "  Arctic game ", vm.toString(game),
                " | ", result,
                " | rating=", vm.toString(pl.rating),
                " | kills=", vm.toString(pl.totalKills)
            ));

            if (pl.wins > 0) wins++;
            totalKills += pl.totalKills;
        }

        emit log(string.concat(
            "Arctic 20 games: wins=", vm.toString(wins),
            " winRate=", vm.toString(wins * 100 / 20),
            "% totalKills=", vm.toString(totalKills)
        ));
    }

    /// Thorn Shrimp (#5) 最弱分析
    function test_thornAnalysis() public {
        uint256 entryFee = arena.entryFee();
        uint256 wins = 0;
        uint256 totalKills = 0;

        for (uint256 game = 0; game < 20; game++) {
            address p = address(uint160(0x8000 + game));
            vm.deal(p, 100 ether);

            vm.roll(block.number + game + 1);
            vm.warp(block.timestamp + 15 * (game + 1));

            vm.prank(p);
            arena.playMatch{value: entryFee}(5, 5, 0);

            ClawArena.Player memory pl = arena.getPlayer(p);
            string memory result = pl.wins > 0 ? "WIN" : "LOSE";

            emit log(string.concat(
                "  Thorn game ", vm.toString(game),
                " | ", result,
                " | rating=", vm.toString(pl.rating),
                " | kills=", vm.toString(pl.totalKills)
            ));

            if (pl.wins > 0) wins++;
            totalKills += pl.totalKills;
        }

        emit log(string.concat(
            "Thorn 20 games: wins=", vm.toString(wins),
            " winRate=", vm.toString(wins * 100 / 20),
            "% totalKills=", vm.toString(totalKills)
        ));
    }
}
