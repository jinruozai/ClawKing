// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/DefaultData.sol";
import "../src/Constants.sol";

/// @title RatingSimulation — Comprehensive balance testing
/// Directly calls GameLib.runGame for speed. 3 perspectives × 200 matches each.
contract RatingSimulationTest is Test {
    uint8 constant NUM = 12;
    uint8 constant MATCHES = 200;

    uint256[NUM] defaultStats;
    bytes[NUM]   defaultScripts;

    function setUp() public {
        // Load default hero stats
        uint256[] memory stats = DefaultData.getDefaultHeroStats();
        for (uint8 i = 0; i < NUM; i++) defaultStats[i] = stats[i];
        // Load default scripts
        bytes[] memory scripts = DefaultData.getDefaultScripts();
        for (uint8 i = 0; i < NUM; i++) defaultScripts[i] = scripts[i];
    }

    struct Stats {
        uint256 wins;        // rank 0
        uint256 top3;        // rank 0-2
        uint256 totalRank;   // sum of ranks
        uint256 totalKills;
        uint256 survived;    // deathTurn == 0
        uint256 totalDeathT; // sum of deathTurn for dead entities
        uint256 firstBloods;
    }

    function _run(uint256[8] memory lobsters, bytes[8] memory scripts, uint32 seed)
        internal returns (GameLib.RankingEntry[8] memory)
    {
        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(lobsters, scripts, seed);
        return r;
    }

    function _simulate(
        uint256[NUM] memory heroPool,
        bytes[NUM]   memory scriptPool,
        string memory label
    ) internal {
        emit log(label);
        emit log("  [idx w%=win t3%=top3 avgR=avgRank surv%=survived k/g=kills/game fb=firstBloods avgDT=deathTurn]");

        Stats[NUM] memory stats;

        for (uint256 m = 0; m < MATCHES; m++) {
            uint32 seed = uint32(uint256(keccak256(abi.encodePacked(label, m))));

            // Pick 8 players: rotate through 12 so each gets ~equal games
            // Each match: players [m*8..m*8+7] mod 12
            uint8[8] memory picked;
            uint256[8] memory lobsters;
            bytes[8] memory scripts;
            for (uint8 i = 0; i < 8; i++) {
                picked[i] = uint8((m * 8 + i) % NUM);
                lobsters[i] = heroPool[picked[i]];
                scripts[i]  = scriptPool[picked[i]];
            }

            GameLib.RankingEntry[8] memory r = _run(lobsters, scripts, seed);

            for (uint8 rank = 0; rank < 8; rank++) {
                uint8 pi = picked[r[rank].idx];
                stats[pi].totalRank += rank;
                if (rank == 0) stats[pi].wins++;
                if (rank < 3) stats[pi].top3++;
                stats[pi].totalKills += r[rank].kills;
                if (r[rank].deathTurn == 0) {
                    stats[pi].survived++;
                } else {
                    stats[pi].totalDeathT += r[rank].deathTurn;
                }
                if (r[rank].firstBlood) stats[pi].firstBloods++;
            }
        }

        // Each player appears in ~(200*8/12) = ~133 matches
        for (uint8 i = 0; i < NUM; i++) {
            uint256 games = 0;
            // Count actual games per player
            for (uint256 m = 0; m < MATCHES; m++) {
                for (uint8 j = 0; j < 8; j++) {
                    if (uint8((m * 8 + j) % NUM) == i) games++;
                }
            }
            if (games == 0) continue;

            uint256 winPct = stats[i].wins * 100 / games;
            uint256 t3Pct = stats[i].top3 * 100 / games;
            uint256 avgR10 = stats[i].totalRank * 10 / games;
            uint256 survPct = stats[i].survived * 100 / games;
            uint256 avgK10 = stats[i].totalKills * 10 / games;
            uint256 dead = games - stats[i].survived;
            uint256 avgDT10 = dead > 0 ? stats[i].totalDeathT * 10 / dead : 400; // 40.0 = never died

            emit log(string.concat(
                "  #", vm.toString(i),
                " w%=", vm.toString(winPct),
                " t3%=", vm.toString(t3Pct),
                " avgR=", vm.toString(avgR10 / 10), ".", vm.toString(avgR10 % 10),
                " surv%=", vm.toString(survPct),
                " k/g=", vm.toString(avgK10 / 10), ".", vm.toString(avgK10 % 10),
                " fb=", vm.toString(stats[i].firstBloods),
                " avgDT=", vm.toString(avgDT10 / 10), ".", vm.toString(avgDT10 % 10),
                " (", vm.toString(games), "g)"
            ));
        }
    }

    /// Hero balance: all 12 heroes use the same script (Script 0, balanced)
    function test_heroBalance() public {
        uint256[NUM] memory heroes = defaultStats;
        bytes[NUM] memory scripts;
        for (uint8 i = 0; i < NUM; i++) scripts[i] = defaultScripts[0];
        _simulate(heroes, scripts, "====== HERO BALANCE (all use Script 0: IronWall) ======");
    }

    /// Script balance: all 12 scripts use the same hero (Hero 0, balanced stats)
    function test_scriptBalance() public {
        uint256[NUM] memory heroes;
        for (uint8 i = 0; i < NUM; i++) heroes[i] = defaultStats[0];
        bytes[NUM] memory scripts = defaultScripts;
        _simulate(heroes, scripts, "====== SCRIPT BALANCE (all use Hero 0: IronClaw) ======");
    }

    /// Combo balance: each hero with its designed paired script
    function test_comboBalance() public {
        _simulate(defaultStats, defaultScripts, "====== COMBO BALANCE (Hero i + Script i) ======");
    }
}
