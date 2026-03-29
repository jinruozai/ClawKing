// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";
import "../src/DefaultData.sol";

/// @title DetailedBattle — 直接调用引擎，输出每场比赛的完整排名
contract DetailedBattleTest is Test {

    function _allStats() internal pure returns (uint256[12] memory) {
        uint256[] memory s = DefaultData.getDefaultHeroStats();
        uint256[12] memory out;
        for (uint8 i = 0; i < 12; i++) out[i] = s[i];
        return out;
    }

    function _allScripts() internal pure returns (bytes[12] memory) {
        bytes[] memory s = DefaultData.getDefaultScripts();
        bytes[12] memory out;
        for (uint8 i = 0; i < 12; i++) out[i] = s[i];
        return out;
    }

    /// 跑 10 场比赛，每场随机 8 人，详细输出每人存活回合/击杀/经验
    function test_detailed10games() public {
        uint256[12] memory allStats = _allStats();
        bytes[12] memory allScripts = _allScripts();
        string[12] memory names = ["IronClaw", "RockLobs", "GhostShr", "BloodCla",
                                    "Executr ", "ThornShr", "CritLobs", "BlueFlam",
                                    "ArcticSh", "VentShr ", "HermitSh", "LuckyShr"];

        for (uint256 game = 0; game < 10; game++) {
            // 每场选 8 人（轮换选取）
            uint256[8] memory stats;
            bytes[8] memory scripts;
            uint8[8] memory heroIdx;

            for (uint8 i = 0; i < 8; i++) {
                uint8 idx = uint8((game * 3 + i) % 12); // 轮换不同组合
                heroIdx[i] = idx;
                stats[i] = allStats[idx];
                scripts[i] = allScripts[idx];
            }

            uint32 seed = uint32(uint256(keccak256(abi.encodePacked(game, block.timestamp))));
            (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(stats, scripts, seed);

            emit log(string.concat("== Game ", vm.toString(game), " =========================="));
            emit log("  Rank | Hero       | DeathTurn | Kills | Exp | 1st?");
            for (uint8 r = 0; r < 8; r++) {
                GameLib.RankingEntry memory e = rankings[r];
                string memory alive = e.deathTurn == 0 ? "ALIVE" : vm.toString(e.deathTurn);
                string memory fb = e.firstBlood ? " FB" : "";
                emit log(string.concat(
                    "  #", vm.toString(r + 1),
                    "    | ", names[heroIdx[e.idx]],
                    " | t=", alive,
                    "      | k=", vm.toString(e.kills),
                    " | xp=", vm.toString(e.exp),
                    fb
                ));
            }
        }
    }

    /// 专门看苟苟虾的对局：固定苟苟虾在位置 0，其余随机
    function test_hermitFocus() public {
        uint256[12] memory allStats = _allStats();
        bytes[12] memory allScripts = _allScripts();
        string[12] memory names = ["IronClaw", "RockLobs", "GhostShr", "BloodCla",
                                    "Executr ", "ThornShr", "CritLobs", "BlueFlam",
                                    "ArcticSh", "VentShr ", "HermitSh", "LuckyShr"];

        uint256 hermitWins = 0;
        uint256 hermitTotalKills = 0;

        for (uint256 game = 0; game < 10; game++) {
            uint256[8] memory stats;
            bytes[8] memory scripts;
            uint8[8] memory heroIdx;

            // 位置 0 = 苟苟虾
            heroIdx[0] = 10;
            stats[0] = allStats[10];
            scripts[0] = allScripts[10];

            // 其余 7 个位置轮换
            for (uint8 i = 1; i < 8; i++) {
                uint8 idx = uint8((game * 2 + i) % 12);
                if (idx == 10) idx = (idx + 1) % 12; // 避免重复苟苟虾
                heroIdx[i] = idx;
                stats[i] = allStats[idx];
                scripts[i] = allScripts[idx];
            }

            uint32 seed = uint32(uint256(keccak256(abi.encodePacked("hermit", game))));
            (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(stats, scripts, seed);

            // 找苟苟虾的排名
            uint8 hermitRank = 8;
            uint8 hermitKills = 0;
            uint8 hermitDeath = 0;
            for (uint8 r = 0; r < 8; r++) {
                if (heroIdx[rankings[r].idx] == 10) {
                    hermitRank = r + 1;
                    hermitKills = rankings[r].kills;
                    hermitDeath = rankings[r].deathTurn;
                    break;
                }
            }
            if (hermitRank == 1) hermitWins++;
            hermitTotalKills += hermitKills;

            // 输出完整排名
            string memory hermitResult = hermitRank == 1 ? " <<< WIN" : "";
            emit log(string.concat("== Hermit Game ", vm.toString(game), " (rank=", vm.toString(hermitRank), ")", hermitResult, " =="));
            for (uint8 r = 0; r < 8; r++) {
                GameLib.RankingEntry memory e = rankings[r];
                string memory alive = e.deathTurn == 0 ? "ALIVE" : string.concat("t=", vm.toString(e.deathTurn));
                string memory marker = heroIdx[e.idx] == 10 ? " <<<" : "";
                emit log(string.concat(
                    "  #", vm.toString(r + 1),
                    " ", names[heroIdx[e.idx]],
                    " | ", alive,
                    " | k=", vm.toString(e.kills),
                    " | xp=", vm.toString(e.exp),
                    marker
                ));
            }
        }

        emit log(string.concat(
            "Hermit 10 games: wins=", vm.toString(hermitWins),
            " kills=", vm.toString(hermitTotalKills)
        ));
    }
}
