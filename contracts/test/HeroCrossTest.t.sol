// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";
import "../src/DefaultData.sol";
import "../src/Constants.sol";

/// @title HeroCrossTest — 12 heroes × 12 scripts full cross-test
/// For each hero, test with ALL 12 scripts against standard AI opponents.
/// Shows each hero's ceiling (best script) and floor (worst script).
contract HeroCrossTest is Test {
    uint256[12] heroStats;
    bytes[12]   defaultScripts;

    function setUp() public {
        uint256[] memory s = DefaultData.getDefaultHeroStats();
        bytes[]   memory sc = DefaultData.getDefaultScripts();
        for (uint8 i = 0; i < 12; i++) { heroStats[i] = s[i]; defaultScripts[i] = sc[i]; }
    }

    /// Each hero × each script × 30 matches. Player is idx 0, opponents are 7 random defaults.
    function test_fullCross() public {
        uint8 ROUNDS = 30;

        // results[hero][script] = wins out of ROUNDS
        uint8[12][12] memory wins;
        uint16[12][12] memory totalRank; // sum of ranks

        for (uint8 hero = 0; hero < 12; hero++) {
            for (uint8 script = 0; script < 12; script++) {
                for (uint8 r = 0; r < ROUNDS; r++) {
                    uint32 seed = uint32(uint256(keccak256(abi.encodePacked(hero, script, r))));

                    // Build 8 players: [0]=test hero+script, [1-7]=defaults
                    uint256[8] memory lobsters;
                    bytes[8] memory scripts;
                    lobsters[0] = heroStats[hero];
                    scripts[0]  = defaultScripts[script];

                    // Opponents: pick 7 from defaults using seed-based rotation
                    uint8 opp = uint8(seed % 12);
                    for (uint8 j = 1; j < 8; j++) {
                        lobsters[j] = heroStats[opp];
                        scripts[j]  = defaultScripts[opp];
                        opp = (opp + 1) % 12;
                    }

                    (GameLib.RankingEntry[8] memory rankings,) = GameLib.runGame(lobsters, scripts, seed);

                    // Find player 0's rank
                    for (uint8 ri = 0; ri < 8; ri++) {
                        if (rankings[ri].idx == 0) {
                            totalRank[hero][script] += ri;
                            if (ri < 4) wins[hero][script]++;
                            break;
                        }
                    }
                }
            }
        }

        // Output: per-hero summary (best/worst script, avg)
        string[12] memory heroNames = ["IronClaw", "RockLobs", "GhostShr", "BloodCla", "Executr ", "ThornShr", "CritLobs", "BluFlam ", "ArcticSh", "VentShr ", "HermitSh", "LuckyShr"];
        string[12] memory scriptNames = ["IronWall", "Fortress", "Shadow  ", "Blood   ", "Execute ", "Thorn   ", "Crit    ", "Frost   ", "IceSnip ", "Void    ", "LastStnd", "Fortune "];

        emit log("====== 12x12 HERO x SCRIPT CROSS-TEST (30 matches each, win=top4) ======");
        emit log("");

        // Full matrix
        emit log("Win rates (top4 out of 30):");
        // Header
        {
            string memory header = "           ";
            for (uint8 s = 0; s < 12; s++) header = string.concat(header, " S", vm.toString(s), "  ");
            emit log(header);
        }

        for (uint8 h = 0; h < 12; h++) {
            string memory row = string.concat("  ", heroNames[h], " ");
            uint16 bestWin = 0; uint8 bestS = 0;
            uint16 worstWin = 30; uint8 worstS = 0;
            uint16 totalWin = 0;

            for (uint8 s = 0; s < 12; s++) {
                uint8 w = wins[h][s];
                totalWin += w;
                if (w > bestWin) { bestWin = w; bestS = s; }
                if (w < worstWin) { worstWin = w; worstS = s; }

                string memory cell;
                if (w < 10) cell = string.concat(" ", vm.toString(w), "  ");
                else cell = string.concat(vm.toString(w), "  ");
                row = string.concat(row, cell);
            }
            emit log(row);
        }

        emit log("");
        emit log("Per-hero summary:");
        emit log("  Hero       | Best Script (w/30) | Worst Script (w/30) | Avg w/30 | avgRank");

        for (uint8 h = 0; h < 12; h++) {
            uint256 bestWin = 0; uint8 bestS = 0;
            uint256 worstWin = 30; uint8 worstS = 0;
            uint256 totalWin = 0;
            uint256 totalR = 0;

            for (uint8 s = 0; s < 12; s++) {
                uint256 w = uint256(wins[h][s]);
                totalWin += w;
                totalR += uint256(totalRank[h][s]);
                if (w > bestWin) { bestWin = w; bestS = s; }
                if (w < worstWin) { worstWin = w; worstS = s; }
            }

            uint256 avgWin10 = totalWin * 10 / 12;
            uint256 avgR10 = totalR * 10 / (12 * uint256(ROUNDS));

            emit log(string.concat(
                "  ", heroNames[h],
                " | ", scriptNames[bestS], " (", vm.toString(bestWin), "/30)",
                " | ", scriptNames[worstS], " (", vm.toString(worstWin), "/30)",
                " | ", vm.toString(avgWin10 / 10), ".", vm.toString(avgWin10 % 10),
                " | ", vm.toString(avgR10 / 10), ".", vm.toString(avgR10 % 10)
            ));
        }
    }
}
