// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";
import "../src/DefaultData.sol";
import "../src/Constants.sol";

/// @title EngineConsistency — 验证合约引擎结果，用于与前端 JS 引擎对比
/// @dev 每个 test 输出确定性结果（排名、击杀、死亡回合），前端可用相同输入验证一致性
contract EngineConsistencyTest is Test {

    /// @dev 用默认龙虾 stats + 默认脚本，seed=12345，跑一场完整 8 人对战
    function test_defaultScripts_seed12345() public {
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        bytes[] memory scripts = DefaultData.getDefaultScripts();

        // 取前 8 个龙虾 stats 和 scripts
        uint256[8] memory s;
        bytes[8] memory sc;
        for (uint8 i; i < 8; i++) {
            s[i] = stats[i];
            sc[i] = scripts[i];
        }

        uint32 seed = 12345;
        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(s, sc, seed);

        // 输出结果到日志
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), rankings[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), rankings[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), rankings[i].exp);
        }
    }

    /// @dev 用默认龙虾 stats + 默认脚本，seed=99999
    function test_defaultScripts_seed99999() public {
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        bytes[] memory scripts = DefaultData.getDefaultScripts();

        uint256[8] memory s;
        bytes[8] memory sc;
        for (uint8 i; i < 8; i++) {
            s[i] = stats[i];
            sc[i] = scripts[i];
        }

        uint32 seed = 99999;
        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(s, sc, seed);

        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), rankings[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), rankings[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), rankings[i].exp);
        }
    }

    /// @dev 后 4 只龙虾(8-11) vs 前 4 只(0-3), seed=42
    function test_mixedHeroes_seed42() public {
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        bytes[] memory scripts = DefaultData.getDefaultScripts();

        uint256[8] memory s;
        bytes[8] memory sc;
        // 8,9,10,11,0,1,2,3 顺序
        for (uint8 i; i < 4; i++) {
            s[i] = stats[i + 8];
            sc[i] = scripts[i + 8];
            s[i + 4] = stats[i];
            sc[i + 4] = scripts[i];
        }

        uint32 seed = 42;
        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(s, sc, seed);

        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), rankings[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), rankings[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), rankings[i].exp);
        }
    }

    /// @dev 全坦克(Rock Lobster)对战，测试纯防守场景, seed=7777
    function test_allTanks_seed7777() public {
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        bytes[] memory scripts = DefaultData.getDefaultScripts();

        uint256[8] memory s;
        bytes[8] memory sc;
        for (uint8 i; i < 8; i++) {
            s[i] = stats[1]; // 全用 Rock Lobster stats
            sc[i] = scripts[1]; // 全用 Fortress script
        }

        uint32 seed = 7777;
        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(s, sc, seed);

        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), rankings[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), rankings[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), rankings[i].exp);
        }
    }

    /// @dev 全刺客(Ghost Shrimp)对战，测试高速纯输出场景, seed=5555
    function test_allAssassins_seed5555() public {
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        bytes[] memory scripts = DefaultData.getDefaultScripts();

        uint256[8] memory s;
        bytes[8] memory sc;
        for (uint8 i; i < 8; i++) {
            s[i] = stats[2]; // 全用 Ghost Shrimp stats
            sc[i] = scripts[2]; // 全用 ShadowBlade script
        }

        uint32 seed = 5555;
        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(s, sc, seed);

        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), rankings[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), rankings[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), rankings[i].exp);
        }
    }
}
