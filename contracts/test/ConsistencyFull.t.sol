// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/ClawUtility.sol";
import "../src/DefaultData.sol";
import "../src/GameLib.sol";

/// @title ConsistencyFullTest — Compare Solidity engine output with JS engine
/// Uses real default heroes 0-7 with their actual scripts.
contract ConsistencyFullTest is Test {
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

    function _runAndLog(uint32 seed) internal {
        uint256[8] memory stats;
        bytes[8] memory scripts;
        for (uint256 i = 0; i < 8; i++) {
            stats[i] = lobsterHub.getLobsterStats(i);
            scripts[i] = scriptHub.getScriptBytes(i);
        }

        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(stats, scripts, seed);

        emit log_named_uint("seed", seed);
        for (uint256 i = 0; i < 8; i++) {
            emit log_named_string(
                string(abi.encodePacked("rank[", vm.toString(i), "]")),
                string(abi.encodePacked(
                    "idx=", vm.toString(rankings[i].idx),
                    " dt=", vm.toString(rankings[i].deathTurn),
                    " k=", vm.toString(rankings[i].kills),
                    " exp=", vm.toString(rankings[i].exp),
                    " fb=", rankings[i].firstBlood ? "1" : "0"
                ))
            );
        }
    }

    function _runMixedAndLog(uint32 seed) internal {
        uint256[8] memory stats;
        bytes[8] memory scripts;
        for (uint256 i = 0; i < 8; i++) {
            stats[i] = lobsterHub.getLobsterStats(i);
            scripts[i] = scriptHub.getScriptBytes(11 - i);
        }

        (GameLib.RankingEntry[8] memory rankings, ) = GameLib.runGame(stats, scripts, seed);

        emit log_named_string("type", "mixed");
        emit log_named_uint("seed", seed);
        for (uint256 i = 0; i < 8; i++) {
            emit log_named_string(
                string(abi.encodePacked("rank[", vm.toString(i), "]")),
                string(abi.encodePacked(
                    "idx=", vm.toString(rankings[i].idx),
                    " dt=", vm.toString(rankings[i].deathTurn),
                    " k=", vm.toString(rankings[i].kills),
                    " exp=", vm.toString(rankings[i].exp),
                    " fb=", rankings[i].firstBlood ? "1" : "0"
                ))
            );
        }
    }

    function test_consistency_default() public {
        uint32[10] memory seeds = [uint32(1), 42, 123, 999, 12345, 55555, 77777, 99999, 314159, 1000000];
        for (uint256 i = 0; i < seeds.length; i++) {
            _runAndLog(seeds[i]);
        }
    }

    function test_consistency_mixed() public {
        _runMixedAndLog(42);
        _runMixedAndLog(12345);
        _runMixedAndLog(77777);
    }
}
