// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";
import "../src/DefaultData.sol";

/// @title EngineMatch — 用简单脚本对比合约/前端引擎结果
contract EngineMatchTest is Test {

    function _packStats(uint8 hp, uint8 atk, uint8 atkRange, uint8 speed, uint8 manaMax, uint16 skillEffect, uint8 skillPower) internal pure returns (uint256) {
        return uint256(hp) | (uint256(atk) << 8) | (uint256(atkRange) << 16) | (uint256(speed) << 24)
            | (uint256(manaMax) << 32) | (uint256(skillEffect) << 40) | (uint256(skillPower) << 56);
    }

    function _defaultStats() internal pure returns (uint256[8] memory s) {
        s[0] = _packStats(16, 4, 2, 1, 3, 0x0001, 2);
        s[1] = _packStats(20, 2, 1, 0, 4, 0x0002, 1);
        s[2] = _packStats(10, 5, 2, 4, 3, 0x0100, 4);
        s[3] = _packStats(14, 3, 2, 1, 4, 0x0010, 4);
        s[4] = _packStats(12, 5, 2, 2, 3, 0x0040, 4);
        s[5] = _packStats(19, 2, 1, 1, 3, 0x0200, 2);
        s[6] = _packStats(11, 6, 2, 3, 3, 0x0400, 3);
        s[7] = _packStats(13, 3, 4, 1, 4, 0x0080, 3);
    }

    // ── Simple aggressive script: 1 slot(nearest), 3 rules(ring/attack/center) ──
    function _aggressiveScript() internal pure returns (bytes memory) {
        bytes memory b = new bytes(1 + 8 + 1 + 47 * 3);
        b[0] = bytes1(uint8(1)); // 1 slot
        b[1] = bytes1(uint8(7)); // sortBy=DIST
        // order=0 (asc), rest zeros for no filter
        b[9] = bytes1(uint8(3)); // 3 rules

        uint256 rs = 10;

        // Rule 0: ring escape - SELF.RING_DIST(8) LTE(6) 1
        b[rs] = 0; b[rs+1] = bytes1(uint8(8)); // lSub=SELF, lProp=RING_DIST
        b[rs+5] = bytes1(uint8(6)); // CMP_LTE
        b[rs+6] = bytes1(uint8(255)); // rSub=CONSTANT
        b[rs+10] = bytes1(uint8(1)); // rVal=1
        b[rs+44] = bytes1(uint8(3)); // ACTION_MOVE
        b[rs+45] = bytes1(uint8(6)); // DIR_CENTER

        // Rule 1: attack T0 if in range - T0.DIST(7) LTE(6) SELF.ATK_RANGE(4)
        uint256 r1 = rs + 47;
        b[r1] = bytes1(uint8(2)); // lSub=T0
        b[r1+1] = bytes1(uint8(7)); // lProp=DIST
        b[r1+5] = bytes1(uint8(6)); // CMP_LTE
        b[r1+6] = 0; // rSub=SELF
        b[r1+7] = bytes1(uint8(4)); // rProp=ATK_RANGE
        b[r1+44] = bytes1(uint8(2)); // ACTION_ATTACK
        b[r1+46] = bytes1(uint8(2)); // target=T0

        // Rule 2: center fallback
        uint256 r2 = rs + 47 * 2;
        b[r2+44] = bytes1(uint8(3)); // ACTION_MOVE
        b[r2+45] = bytes1(uint8(6)); // DIR_CENTER

        return b;
    }

    // ── Simple defensive script: 1 slot(nearest), 4 rules ──
    function _defensiveScript() internal pure returns (bytes memory) {
        bytes memory b = new bytes(1 + 8 + 1 + 47 * 4);
        b[0] = bytes1(uint8(1));
        b[1] = bytes1(uint8(7)); // DIST asc
        b[9] = bytes1(uint8(4));

        uint256 rs = 10;

        // Rule 0: ring escape
        b[rs] = 0; b[rs+1] = bytes1(uint8(8));
        b[rs+5] = bytes1(uint8(6));
        b[rs+6] = bytes1(uint8(255));
        b[rs+10] = bytes1(uint8(1));
        b[rs+44] = bytes1(uint8(3)); b[rs+45] = bytes1(uint8(6));

        // Rule 1: defend if SELF.HP_PCT(2) < 50
        uint256 r1 = rs + 47;
        b[r1] = 0; b[r1+1] = bytes1(uint8(2)); // HP_PCT
        b[r1+5] = bytes1(uint8(5)); // CMP_LT
        b[r1+6] = bytes1(uint8(255));
        b[r1+10] = bytes1(uint8(50));
        b[r1+44] = bytes1(uint8(1)); // DEFEND

        // Rule 2: attack T0 if in range
        uint256 r2 = rs + 47 * 2;
        b[r2] = bytes1(uint8(2)); b[r2+1] = bytes1(uint8(7));
        b[r2+5] = bytes1(uint8(6));
        b[r2+6] = 0; b[r2+7] = bytes1(uint8(4));
        b[r2+44] = bytes1(uint8(2)); b[r2+46] = bytes1(uint8(2));

        // Rule 3: center fallback
        uint256 r3 = rs + 47 * 3;
        b[r3+44] = bytes1(uint8(3)); b[r3+45] = bytes1(uint8(6));

        return b;
    }

    function test_allAggressive_seed12345() public {
        uint256[8] memory s = _defaultStats();
        bytes memory sc = _aggressiveScript();
        bytes[8] memory scripts;
        for (uint8 i; i < 8; i++) scripts[i] = sc;

        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(s, scripts, 12345);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }

    function test_allDefensive_seed99999() public {
        uint256[8] memory s = _defaultStats();
        bytes memory sc = _defensiveScript();
        bytes[8] memory scripts;
        for (uint8 i; i < 8; i++) scripts[i] = sc;

        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(s, scripts, 99999);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }

    function test_mixedAggDef_seed42() public {
        uint256[8] memory s = _defaultStats();
        bytes memory agg = _aggressiveScript();
        bytes memory def = _defensiveScript();
        bytes[8] memory scripts;
        for (uint8 i; i < 8; i++) scripts[i] = (i % 2 == 0) ? agg : def;

        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(s, scripts, 42);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }

    function test_allTanksDefensive_seed7777() public {
        uint256[8] memory s;
        uint256 tank = _packStats(20, 2, 1, 0, 4, 0x0002, 1);
        for (uint8 i; i < 8; i++) s[i] = tank;

        bytes memory sc = _defensiveScript();
        bytes[8] memory scripts;
        for (uint8 i; i < 8; i++) scripts[i] = sc;

        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(s, scripts, 7777);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }

    function test_allAssassinsAggressive_seed5555() public {
        uint256[8] memory s;
        uint256 assassin = _packStats(10, 5, 2, 4, 3, 0x0100, 4);
        for (uint8 i; i < 8; i++) s[i] = assassin;

        bytes memory sc = _aggressiveScript();
        bytes[8] memory scripts;
        for (uint8 i; i < 8; i++) scripts[i] = sc;

        (GameLib.RankingEntry[8] memory r, ) = GameLib.runGame(s, scripts, 5555);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }
}
