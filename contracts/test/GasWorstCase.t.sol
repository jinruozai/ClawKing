// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/Constants.sol";
import "../src/GameLib.sol";
import "../src/DefaultData.sol";

contract GasWorstCaseTest is Test {

    /// @notice 构建满配脚本：8 slot + 16 rules × 4 conditions
    function _buildFullScript() internal pure returns (bytes memory) {
        uint8 numSlots = MAX_SLOTS;      // 8
        uint8 numRules = MAX_RULES;      // 16
        uint256 size = 1 + uint256(numSlots) * 8 + 1 + uint256(numRules) * 47;
        bytes memory b = new bytes(size);
        uint256 off = 0;

        // ── 8 Slots ──
        b[off++] = bytes1(numSlots);
        for (uint8 s = 0; s < numSlots; s++) {
            // 每个 slot 用不同的排序属性，有过滤条件
            b[off]     = bytes1(s);             // sortBy = PROP_HP(0) ~ PROP_RING_DIST(7 for s<8)
            b[off + 1] = bytes1(s & 1);         // order: 交替升降序
            b[off + 2] = bytes1(uint8(PROP_HP_PCT)); // filterProp
            b[off + 3] = bytes1(uint8(CMP_GT));      // filterOp = GT
            b[off + 4] = bytes1(uint8(SUB_CONSTANT)); // filterRSub
            b[off + 5] = 0x00;                        // filterRProp
            b[off + 6] = 0x00;                        // filterVal hi
            b[off + 7] = bytes1(uint8(10));            // filterVal lo = 10 (HP% > 10)
            off += 8;
        }

        // ── 16 Rules ──
        b[off++] = bytes1(numRules);
        for (uint8 r = 0; r < numRules; r++) {
            // 每条规则 4 个条件全填满，引用不同的 slot
            for (uint8 c = 0; c < MAX_CONDITIONS; c++) {
                uint8 slotRef = (r + c) % numSlots;  // SUB_T0..T7
                uint8 condOff = uint8(off);

                b[off]     = bytes1(uint8(SUB_T0 + slotRef)); // lSub = T0~T7
                b[off + 1] = bytes1(uint8(PROP_HP_PCT));      // lProp
                b[off + 2] = bytes1(uint8(ARITH_NONE));        // lOp
                b[off + 3] = 0x00; b[off + 4] = 0x00;         // lVal = 0
                b[off + 5] = bytes1(uint8(CMP_GT));            // cmp = GT
                b[off + 6] = bytes1(uint8(SUB_CONSTANT));      // rSub
                b[off + 7] = 0x00;                             // rProp
                b[off + 8] = bytes1(uint8(ARITH_NONE));        // rOp
                // rVal = 不同的阈值让大部分条件通过
                b[off + 9]  = 0x00;
                b[off + 10] = bytes1(uint8(5 + r));   // rVal = 5~20 (HP% > 5~20, 大部分通过)
                off += 11;
            }

            // 最后一条规则 → 攻击 T0，其余 → 检查失败后继续下一条
            if (r == numRules - 1) {
                b[off]     = bytes1(uint8(ACTION_ATTACK)); // action
                b[off + 1] = 0x00;                          // actionArg
                b[off + 2] = bytes1(uint8(SUB_T0));         // actionTarget
            } else {
                // 设置一个不可能满足的额外条件让前面的规则失败
                // 改第一个条件的 rVal 为 200 (HP% > 200 永远 false)
                uint256 ruleStart = off - 47; // 回到这条规则的开头
                b[ruleStart + 10] = bytes1(uint8(200)); // rVal = 200, 条件永不满足

                b[off]     = bytes1(uint8(ACTION_DEFEND)); // fallback
                b[off + 1] = 0x00;
                b[off + 2] = 0x00;
            }
            off += 3;
        }

        return b;
    }

    /// @notice 测试满配脚本的 gas 消耗
    function test_worstCaseGas() public {
        // 8 个英雄，全部使用满配脚本
        uint256[] memory heroStats = DefaultData.getDefaultHeroStats();

        uint256[PLAYERS_PER_MATCH] memory stats;
        bytes[PLAYERS_PER_MATCH] memory scripts;

        bytes memory fullScript = _buildFullScript();

        for (uint8 i = 0; i < PLAYERS_PER_MATCH; i++) {
            stats[i] = heroStats[i];
            scripts[i] = fullScript;
        }

        uint256 gasBefore = gasleft();
        (GameLib.RankingEntry[PLAYERS_PER_MATCH] memory rankings, ) = GameLib.runGame(stats, scripts, 42069);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used (worst case full scripts)", gasUsed);
        for (uint8 i = 0; i < PLAYERS_PER_MATCH; i++) {
            emit log_named_uint(string.concat("Rank ", vm.toString(i), " idx"), rankings[i].idx);
            emit log_named_uint(string.concat("  deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("  kills"), rankings[i].kills);
            emit log_named_uint(string.concat("  exp"), rankings[i].exp);
        }
    }

    /// @notice 真实战斗满配脚本：能正常攻击、移动、释放技能
    function _buildCombatFullScript() internal pure returns (bytes memory) {
        uint8 numSlots = MAX_SLOTS;
        uint8 numRules = MAX_RULES;
        uint256 size = 1 + uint256(numSlots) * 8 + 1 + uint256(numRules) * 47;
        bytes memory b = new bytes(size);
        uint256 off = 0;

        b[off++] = bytes1(numSlots);

        // Slot 0: 最近敌人 (sortBy=DIST asc)
        _writeSlot(b, off, PROP_DIST, 0, 0, 0, 0, 0, 0); off += 8;
        // Slot 1: 最弱敌人 (sortBy=HP asc)
        _writeSlot(b, off, PROP_HP, 0, 0, 0, 0, 0, 0); off += 8;
        // Slot 2: 最强敌人 (sortBy=ATK desc)
        _writeSlot(b, off, PROP_ATK, 1, 0, 0, 0, 0, 0); off += 8;
        // Slot 3: 最低HP%敌人 (sortBy=HP_PCT asc)
        _writeSlot(b, off, PROP_HP_PCT, 0, 0, 0, 0, 0, 0); off += 8;
        // Slot 4: 暴露度最高 (sortBy=EXPOSURE desc)
        _writeSlot(b, off, PROP_EXPOSURE, 1, 0, 0, 0, 0, 0); off += 8;
        // Slot 5: 最近且HP>20% (sortBy=DIST asc, filter HP_PCT > 20)
        _writeSlot(b, off, PROP_DIST, 0, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 20); off += 8;
        // Slot 6: 击杀数最多 (sortBy=KILLS desc)
        _writeSlot(b, off, PROP_KILLS, 1, 0, 0, 0, 0, 0); off += 8;
        // Slot 7: 最远敌人 (sortBy=DIST desc)
        _writeSlot(b, off, PROP_DIST, 1, 0, 0, 0, 0, 0); off += 8;

        b[off++] = bytes1(numRules);

        // Rule 0: SELF.HP_PCT < 20 AND GAME.ALIVE > 2 → DEFEND
        _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_LT, SUB_CONSTANT, 0, 20); off += 11;
        _writeCond(b, off, SUB_GAME, GPROP_ALIVE_COUNT, CMP_GT, SUB_CONSTANT, 0, 2); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_DEFEND); off += 3;

        // Rule 1: T3.HP_PCT < 15 AND T3.DIST <= SELF.ATK_RANGE → ATTACK T3 (斩杀残血)
        _writeCond(b, off, SUB_T0+3, PROP_HP_PCT, CMP_LT, SUB_CONSTANT, 0, 15); off += 11;
        _writeCond(b, off, SUB_T0+3, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+3); off += 3;

        // Rule 2: T4.EXPOSURE >= 3 AND T4.DIST <= SELF.ATK_RANGE → ATTACK T4 (打暴露高的)
        _writeCond(b, off, SUB_T0+4, PROP_EXPOSURE, CMP_GTE, SUB_CONSTANT, 0, 3); off += 11;
        _writeCond(b, off, SUB_T0+4, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+4); off += 3;

        // Rule 3-6: 各种条件组合攻击不同目标（制造最坏条件评估）
        for (uint8 r = 0; r < 4; r++) {
            uint8 slot = r;
            _writeCond(b, off, SUB_T0+slot, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
            _writeCond(b, off, SUB_T0+slot, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 10); off += 11;
            _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 30); off += 11;
            _writeCond(b, off, SUB_GAME, GPROP_ALIVE_COUNT, CMP_GT, SUB_CONSTANT, 0, 3); off += 11;
            b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+slot); off += 3;
        }

        // Rule 7: T0.DIST > ATK_RANGE → MOVE_TOWARD T0
        _writeCond(b, off, SUB_T0, PROP_DIST, CMP_GT, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_MOVE); b[off+1] = bytes1(MOVE_TOWARD); b[off+2] = bytes1(SUB_T0); off += 3;

        // Rule 8: SELF.RING_DIST < 2 → MOVE toward center
        _writeCond(b, off, SUB_SELF, PROP_RING_DIST, CMP_LT, SUB_CONSTANT, 0, 2); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_MOVE); b[off+1] = bytes1(DIR_CENTER); off += 3;

        // Rule 9: SELF.BLINK_CD == 0 AND T2.DIST > 3 → BLINK_TOWARD T2
        _writeCond(b, off, SUB_SELF, PROP_BLINK_CD, CMP_EQ, SUB_CONSTANT, 0, 0); off += 11;
        _writeCond(b, off, SUB_T0+2, PROP_DIST, CMP_GT, SUB_CONSTANT, 0, 3); off += 11;
        _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 50); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_BLINK); b[off+1] = bytes1(MOVE_TOWARD); b[off+2] = bytes1(SUB_T0+2); off += 3;

        // Rule 10-14: 更多条件组合（4条件全填）
        for (uint8 r = 0; r < 5; r++) {
            uint8 slot = (r + 1) % numSlots;
            _writeCond(b, off, SUB_T0+slot, PROP_HP, CMP_GT, SUB_CONSTANT, 0, 5); off += 11;
            _writeCond(b, off, SUB_T0+slot, PROP_DIST, CMP_LTE, SUB_CONSTANT, 0, 4); off += 11;
            _writeCond(b, off, SUB_SELF, PROP_MP, CMP_LT, SUB_SELF, PROP_MP_MAX, 0); off += 11;
            _writeCond(b, off, SUB_GAME, GPROP_TURN, CMP_GT, SUB_CONSTANT, 0, r * 5); off += 11;
            b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+slot); off += 3;
        }

        // Rule 15: fallback → MOVE toward center
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_MOVE); b[off+1] = bytes1(DIR_CENTER); off += 3;

        return b;
    }

    function _writeSlot(bytes memory b, uint256 off, uint8 sortBy, uint8 order, uint8 filterProp, uint8 filterOp, uint8 filterRSub, uint8 filterRProp, uint8 filterVal) internal pure {
        b[off] = bytes1(sortBy);
        b[off+1] = bytes1(order);
        b[off+2] = bytes1(filterProp);
        b[off+3] = bytes1(filterOp);
        b[off+4] = bytes1(filterRSub);
        b[off+5] = bytes1(filterRProp);
        b[off+6] = 0x00;
        b[off+7] = bytes1(filterVal);
    }

    function _writeCond(bytes memory b, uint256 off, uint8 lSub, uint8 lProp, uint8 cmp, uint8 rSub, uint8 rProp, uint8 rVal) internal pure {
        b[off] = bytes1(lSub);
        b[off+1] = bytes1(lProp);
        b[off+2] = 0x00; // lOp = NONE
        b[off+3] = 0x00; b[off+4] = 0x00; // lVal
        b[off+5] = bytes1(cmp);
        b[off+6] = bytes1(rSub);
        b[off+7] = bytes1(rProp);
        b[off+8] = 0x00; // rOp = NONE
        b[off+9] = 0x00;
        b[off+10] = bytes1(rVal);
    }

    function _writeSkipCond(bytes memory b, uint256 off) internal pure {
        // All zeros = CMP_SKIP
    }

    /// @notice 真实战斗满配测试
    function test_combatFullScriptGas() public {
        uint256[] memory heroStats = DefaultData.getDefaultHeroStats();

        uint256[PLAYERS_PER_MATCH] memory stats;
        bytes[PLAYERS_PER_MATCH] memory scripts;

        bytes memory combatScript = _buildCombatFullScript();

        for (uint8 i = 0; i < PLAYERS_PER_MATCH; i++) {
            stats[i] = heroStats[i];
            scripts[i] = combatScript;
        }

        uint256 gasBefore = gasleft();
        (GameLib.RankingEntry[PLAYERS_PER_MATCH] memory rankings, ) = GameLib.runGame(stats, scripts, 42069);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used (combat full scripts)", gasUsed);
        uint8 totalKills = 0;
        for (uint8 i = 0; i < PLAYERS_PER_MATCH; i++) {
            emit log_named_uint(string.concat("Rank ", vm.toString(i), " idx"), rankings[i].idx);
            emit log_named_uint(string.concat("  deathTurn"), rankings[i].deathTurn);
            emit log_named_uint(string.concat("  kills"), rankings[i].kills);
            emit log_named_uint(string.concat("  exp"), rankings[i].exp);
            totalKills += rankings[i].kills;
        }
        emit log_named_uint("Total kills", totalKills);
    }

    /// @notice 测试简单脚本的 gas 消耗（对比基线）
    function test_baselineGas() public {
        uint256[] memory heroStats = DefaultData.getDefaultHeroStats();
        bytes[] memory defaultScripts = DefaultData.getDefaultScripts();

        uint256[PLAYERS_PER_MATCH] memory stats;
        bytes[PLAYERS_PER_MATCH] memory scripts;

        for (uint8 i = 0; i < PLAYERS_PER_MATCH; i++) {
            stats[i] = heroStats[i];
            scripts[i] = defaultScripts[i % 3];
        }

        uint256 gasBefore = gasleft();
        (GameLib.RankingEntry[PLAYERS_PER_MATCH] memory rankings, ) = GameLib.runGame(stats, scripts, 42069);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used (simple scripts)", gasUsed);
        emit log_named_uint("Rank 1 idx", rankings[0].idx);
        emit log_named_uint("Rank 1 kills", rankings[0].kills);
    }
}
