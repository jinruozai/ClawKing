// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/GameLib.sol";

/// @title EngineMatchMin — 用最简脚本对比，排除脚本构建差异
contract EngineMatchMinTest is Test {

    function _p(uint8 hp, uint8 atk, uint8 r, uint8 sp, uint8 m, uint16 se, uint8 pw) internal pure returns (uint256) {
        return uint256(hp)|(uint256(atk)<<8)|(uint256(r)<<16)|(uint256(sp)<<24)|(uint256(m)<<32)|(uint256(se)<<40)|(uint256(pw)<<56);
    }

    function _defaultStats() internal pure returns (uint256[8] memory s) {
        s[0]=_p(16,4,2,1,3,0x0001,2); s[1]=_p(20,2,1,0,4,0x0002,1); s[2]=_p(10,5,2,4,3,0x0100,4); s[3]=_p(14,3,2,1,4,0x0010,4);
        s[4]=_p(12,5,2,2,3,0x0040,4); s[5]=_p(19,2,1,1,3,0x0200,2); s[6]=_p(11,6,2,3,3,0x0400,3); s[7]=_p(13,3,4,1,4,0x0080,3);
    }

    // Minimal script: 1 slot(DIST asc), 2 rules(attack nearest if in range, center fallback)
    function _minScript() internal pure returns (bytes memory) {
        bytes memory b = new bytes(1 + 8 + 1 + 47 * 2);
        b[0] = bytes1(uint8(1));  // 1 slot
        b[1] = bytes1(uint8(7));  // sortBy = DIST
        b[9] = bytes1(uint8(2));  // 2 rules

        // Rule 0: T0.DIST <= SELF.ATK_RANGE → ATTACK T0
        uint256 r0 = 10;
        b[r0]   = bytes1(uint8(2));  // lSub=T0
        b[r0+1] = bytes1(uint8(7));  // lProp=DIST
        b[r0+5] = bytes1(uint8(6));  // CMP_LTE
        b[r0+6] = bytes1(uint8(0));  // rSub=SELF
        b[r0+7] = bytes1(uint8(4));  // rProp=ATK_RANGE
        b[r0+44] = bytes1(uint8(2)); // ACTION_ATTACK
        b[r0+46] = bytes1(uint8(2)); // target=T0

        // Rule 1: MOVE DIR_CENTER
        uint256 r1 = 10 + 47;
        b[r1+44] = bytes1(uint8(3)); // ACTION_MOVE
        b[r1+45] = bytes1(uint8(6)); // DIR_CENTER

        return b;
    }

    function _logResults(GameLib.RankingEntry[8] memory r, bytes32 h) internal {
        emit log_named_bytes32("replayHash", h);
        for (uint8 i; i < 8; i++) {
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].idx"), r[i].idx);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].deathTurn"), r[i].deathTurn);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].kills"), r[i].kills);
            emit log_named_uint(string.concat("rank[", vm.toString(i), "].exp"), r[i].exp);
        }
    }

    function _run(uint256[8] memory s, uint32 seed) internal {
        bytes memory sc = _minScript();
        bytes[8] memory scripts; for (uint8 i; i < 8; i++) scripts[i] = sc;
        (GameLib.RankingEntry[8] memory r, bytes32 h) = GameLib.runGame(s, scripts, seed);
        _logResults(r, h);
    }

    function test_min_seed12345() public { _run(_defaultStats(), 12345); }
    function test_min_seed99999() public { _run(_defaultStats(), 99999); }

    function test_min_allTanks_seed7777() public {
        uint256[8] memory s; for (uint8 i; i < 8; i++) s[i] = _p(20,2,1,0,4,0x0002,1);
        _run(s, 7777);
    }

    function test_min_allAssassins_seed5555() public {
        uint256[8] memory s; for (uint8 i; i < 8; i++) s[i] = _p(10,5,2,4,3,0x0100,4);
        _run(s, 5555);
    }

    function test_min_mixed_seed42() public {
        uint256[8] memory s;
        s[0]=_p(12,4,4,1,3,0x0004,4); s[1]=_p(14,3,3,0,4,0x0008,4); s[2]=_p(18,2,1,2,3,0x0800,2); s[3]=_p(13,4,2,2,3,0x1000,4);
        s[4]=_p(16,4,2,1,3,0x0001,2); s[5]=_p(20,2,1,0,4,0x0002,1); s[6]=_p(10,5,2,4,3,0x0100,4); s[7]=_p(14,3,2,1,4,0x0010,4);
        _run(s, 42);
    }
}
