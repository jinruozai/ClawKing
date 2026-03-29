// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/ClawUtility.sol";
import "../src/DefaultData.sol";
import "../src/GameLib.sol";

contract MaxScriptTest is Test {
    ClawArena arena;
    LobsterHub lobsterHub;
    ScriptHub scriptHub;
    ClawUtility utility;
    address player = address(0x1234);

    receive() external payable {}

    function setUp() public {
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
        bytes12[] memory aiNames = DefaultData.getDefaultHeroNames();
        for (uint8 i = 0; i < 12; i++) arena.addDefaultPlayer(aiNames[i], i, i);
        vm.deal(player, 100 ether);
        arena.addCoins(player, 1000);
    }

    function _buildMaxScript() internal pure returns (bytes memory) {
        // 8 slots + 16 rules = 818 bytes, ALL 4 conditions per rule filled
        uint8 numSlots = 8;
        uint8 numRules = 16;
        bytes memory b = new bytes(1 + uint256(numSlots) * 8 + 1 + uint256(numRules) * 47);
        b[0] = bytes1(numSlots);
        for (uint8 i = 0; i < numSlots; i++) {
            uint256 off = 1 + uint256(i) * 8;
            b[off]     = bytes1(uint8(7));   // sortBy = DIST
            b[off + 3] = bytes1(uint8(3));   // filterOp = GT
            b[off + 4] = bytes1(uint8(255)); // filterRSub = CONSTANT
            b[off + 7] = bytes1(uint8(5));   // filterVal = 5
        }
        uint256 rulesOff = 1 + uint256(numSlots) * 8;
        b[rulesOff] = bytes1(numRules);
        for (uint8 i = 0; i < numRules; i++) {
            uint256 rBase = rulesOff + 1 + uint256(i) * 47;
            // Fill ALL 4 conditions: SELF.HP GT CONSTANT(i)
            for (uint8 c = 0; c < 4; c++) {
                uint256 cOff = rBase + uint256(c) * 11;
                b[cOff + 5]  = bytes1(uint8(3));   // cmp = GT
                b[cOff + 6]  = bytes1(uint8(255)); // rSub = CONSTANT
                b[cOff + 10] = bytes1(i);           // rVal = i
            }
            b[rBase + 44] = bytes1(uint8(2)); // ACTION_ATTACK
            b[rBase + 46] = bytes1(uint8(2)); // target = T0
        }
        // Last rule: unconditional center fallback
        uint256 last = rulesOff + 1 + 15 * 47;
        for (uint8 c = 0; c < 4; c++) b[last + uint256(c) * 11 + 5] = bytes1(uint8(0)); // CMP_SKIP
        b[last + 44] = bytes1(uint8(3)); // ACTION_MOVE
        b[last + 45] = bytes1(uint8(6)); // DIR_CENTER
        return b;
    }

    function test_mintMaxScript() public {
        bytes memory maxScript = _buildMaxScript();
        emit log(string.concat("Script length: ", vm.toString(maxScript.length)));

        vm.prank(player);
        uint256 tokenId = scriptHub.mintScript{value: 0.001 ether}("MaxScript", maxScript);
        emit log(string.concat("Minted tokenId: ", vm.toString(tokenId)));

        // Verify it was stored correctly
        bytes memory stored = scriptHub.getScriptBytes(tokenId);
        assertEq(stored.length, maxScript.length, "Stored length mismatch");
    }

    function test_playWithMaxScript() public {
        bytes memory maxScript = _buildMaxScript();
        vm.prank(player);
        uint256 scriptId = scriptHub.mintScript{value: 0.001 ether}("MaxScript", maxScript);

        // Play a match using the max script
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 15);
        vm.prank(player);
        arena.playMatch{value: 0.001 ether}(0, scriptId, 0);
        emit log("playMatch with 818-byte script: SUCCESS");
    }

    function test_engineDirectMaxScript() public {
        bytes memory maxScript = _buildMaxScript();

        // Run engine directly with max script
        uint256[8] memory stats;
        bytes[8] memory scripts;
        uint256[] memory s = DefaultData.getDefaultHeroStats();
        for (uint8 i = 0; i < 8; i++) {
            stats[i] = s[i];
            scripts[i] = (i == 0) ? maxScript : DefaultData.getDefaultScripts()[i];
        }

        (GameLib.RankingEntry[8] memory rankings,) = GameLib.runGame(stats, scripts, 12345);
        for (uint8 i = 0; i < 8; i++) {
            if (rankings[i].idx == 0) {
                emit log(string.concat("Player 0 (max script) rank: ", vm.toString(i)));
                break;
            }
        }
    }
}
