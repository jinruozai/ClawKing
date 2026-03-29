// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/ScriptHub.sol";
import "../src/DefaultData.sol";

contract E2EMatchTest is Test {
    ClawArena arena;
    LobsterHub lobsterHub;
    ScriptHub scriptHub;

    address[8] testPlayers;

    // 接收 POL（owner 收入场费）
    receive() external payable {}

    function setUp() public {
        // 部署合约
        scriptHub = new ScriptHub();
        lobsterHub = new LobsterHub();
        arena = new ClawArena();
        arena.initialize(address(lobsterHub), address(scriptHub));
        lobsterHub.setClawArena(address(arena));
        scriptHub.setClawArena(address(arena));

        // 初始化默认英雄和脚本
        lobsterHub.initDefaultHeroes(
            DefaultData.getDefaultHeroStats(),
            DefaultData.getDefaultHeroVisuals(),
            DefaultData.getDefaultHeroNames()
        );
        scriptHub.initDefaultScripts(DefaultData.getDefaultScriptNames(), DefaultData.getDefaultScripts());

        // 创建 8 个玩家地址并充值
        for (uint8 i = 0; i < 8; i++) {
            testPlayers[i] = address(uint160(0x1000 + i));
            vm.deal(testPlayers[i], 100 ether);
        }
    }

    /// @notice 端到端：即时匹配（默认脚本）
    function test_e2e_defaultScripts() public {
        uint256 fee = arena.entryFee();

        // 玩家 0 发起即时匹配
        vm.prank(testPlayers[0]);
        uint256 gasBefore = gasleft();
        arena.playMatch{value: fee}(0, 0, 0);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("E2E gas (default scripts, instant match)", gasUsed);

        // 验证结算结果
        ClawArena.Player memory p = arena.getPlayer(testPlayers[0]);
        assertEq(p.totalMatches, 1);
        assertGt(p.coins, 0);
        emit log_named_uint("Player 0 rating", p.rating);
        emit log_named_uint("Player 0 coins", p.coins);
    }

    /// @notice 端到端：多人依次匹配（池子逐步填充）
    function test_e2e_multiplePlayersSequential() public {
        uint256 fee = arena.entryFee();

        // 8 个玩家依次匹配
        for (uint8 i = 0; i < 8; i++) {
            vm.prank(testPlayers[i]);
            arena.playMatch{value: fee}(i, i % 3, 0);
        }

        // 验证所有玩家都有结算数据
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            assertEq(p.totalMatches, 1);
            assertGt(p.coins, 0);
            emit log_named_uint(
                string.concat("Player ", vm.toString(i), " rating"),
                p.rating
            );
        }
    }

    /// @notice 端到端：满配自定义脚本
    function test_e2e_fullCustomScripts() public {
        uint256 fee = arena.entryFee();

        // 每个玩家铸造自己的满配脚本 NFT（100 金币 + 0.001 BNB）
        bytes memory fullScript = _buildCombatFullScript();
        uint256[8] memory scriptTokenIds;
        for (uint8 i = 0; i < 8; i++) {
            arena.addCoins(testPlayers[i], 100);
            vm.prank(testPlayers[i]);
            scriptTokenIds[i] = scriptHub.mintScript{value: 0.001 ether}("", fullScript);
        }

        // 8 人依次匹配（池子逐渐填满后可互为对手）
        for (uint8 i = 0; i < 8; i++) {
            vm.prank(testPlayers[i]);
            arena.playMatch{value: fee}(i, scriptTokenIds[i], 0);
        }

        // 验证
        uint256 totalKills;
        for (uint8 i = 0; i < 8; i++) {
            ClawArena.Player memory p = arena.getPlayer(testPlayers[i]);
            emit log_named_uint(
                string.concat("Player ", vm.toString(i), " rating"),
                p.rating
            );
            totalKills += p.totalKills;
        }
        emit log_named_uint("Total kills", totalKills);
    }

    /// @notice 验证 MatchCompleted 事件
    function test_matchCompletedEvent() public {
        uint256 fee = arena.entryFee();

        vm.recordLogs();
        vm.prank(testPlayers[0]);
        arena.playMatch{value: fee}(0, 0, 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 matchCompletedSig = keccak256("MatchCompleted(address,uint32,uint8,int16,uint16,address[8],uint256[8],uint256[8],bytes32)");

        uint256 completedCount;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == matchCompletedSig) {
                completedCount++;
                // topics[1] = indexed player address
                address eventPlayer = address(uint160(uint256(logs[i].topics[1])));
                assertEq(eventPlayer, testPlayers[0]);
            }
        }
        assertEq(completedCount, 1, "1 MatchCompleted event per match");
    }

    // ── 满配脚本构建 ──

    function _buildCombatFullScript() internal pure returns (bytes memory) {
        uint8 numSlots = MAX_SLOTS;
        uint8 numRules = MAX_RULES;
        uint256 size = 1 + uint256(numSlots) * 8 + 1 + uint256(numRules) * 47;
        bytes memory b = new bytes(size);
        uint256 off = 0;

        b[off++] = bytes1(numSlots);
        _writeSlot(b, off, PROP_DIST, 0, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_HP, 0, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_ATK, 1, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_HP_PCT, 0, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_EXPOSURE, 1, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_DIST, 0, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 20); off += 8;
        _writeSlot(b, off, PROP_KILLS, 1, 0, 0, 0, 0, 0); off += 8;
        _writeSlot(b, off, PROP_DIST, 1, 0, 0, 0, 0, 0); off += 8;

        b[off++] = bytes1(numRules);

        _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_LT, SUB_CONSTANT, 0, 20); off += 11;
        _writeCond(b, off, SUB_GAME, GPROP_ALIVE_COUNT, CMP_GT, SUB_CONSTANT, 0, 2); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_DEFEND); off += 3;

        _writeCond(b, off, SUB_T0+3, PROP_HP_PCT, CMP_LT, SUB_CONSTANT, 0, 15); off += 11;
        _writeCond(b, off, SUB_T0+3, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+3); off += 3;

        _writeCond(b, off, SUB_T0+4, PROP_EXPOSURE, CMP_GTE, SUB_CONSTANT, 0, 3); off += 11;
        _writeCond(b, off, SUB_T0+4, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+4); off += 3;

        for (uint8 r = 0; r < 4; r++) {
            uint8 slot = r;
            _writeCond(b, off, SUB_T0+slot, PROP_DIST, CMP_LTE, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
            _writeCond(b, off, SUB_T0+slot, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 10); off += 11;
            _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 30); off += 11;
            _writeCond(b, off, SUB_GAME, GPROP_ALIVE_COUNT, CMP_GT, SUB_CONSTANT, 0, 3); off += 11;
            b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+slot); off += 3;
        }

        _writeCond(b, off, SUB_T0, PROP_DIST, CMP_GT, SUB_SELF, PROP_ATK_RANGE, 0); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_MOVE); b[off+1] = bytes1(MOVE_TOWARD); b[off+2] = bytes1(SUB_T0); off += 3;

        _writeCond(b, off, SUB_SELF, PROP_RING_DIST, CMP_LT, SUB_CONSTANT, 0, 2); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_MOVE); b[off+1] = bytes1(DIR_CENTER); off += 3;

        _writeCond(b, off, SUB_SELF, PROP_BLINK_CD, CMP_EQ, SUB_CONSTANT, 0, 0); off += 11;
        _writeCond(b, off, SUB_T0+2, PROP_DIST, CMP_GT, SUB_CONSTANT, 0, 3); off += 11;
        _writeCond(b, off, SUB_SELF, PROP_HP_PCT, CMP_GT, SUB_CONSTANT, 0, 50); off += 11;
        _writeSkipCond(b, off); off += 11;
        b[off] = bytes1(ACTION_BLINK); b[off+1] = bytes1(MOVE_TOWARD); b[off+2] = bytes1(SUB_T0+2); off += 3;

        for (uint8 r = 0; r < 5; r++) {
            uint8 slot = (r + 1) % numSlots;
            _writeCond(b, off, SUB_T0+slot, PROP_HP, CMP_GT, SUB_CONSTANT, 0, 5); off += 11;
            _writeCond(b, off, SUB_T0+slot, PROP_DIST, CMP_LTE, SUB_CONSTANT, 0, 4); off += 11;
            _writeCond(b, off, SUB_SELF, PROP_MP, CMP_LT, SUB_SELF, PROP_MP_MAX, 0); off += 11;
            _writeCond(b, off, SUB_GAME, GPROP_TURN, CMP_GT, SUB_CONSTANT, 0, r * 5); off += 11;
            b[off] = bytes1(ACTION_ATTACK); b[off+2] = bytes1(SUB_T0+slot); off += 3;
        }

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
        b[off+5] = bytes1(cmp);
        b[off+6] = bytes1(rSub);
        b[off+7] = bytes1(rProp);
        b[off+10] = bytes1(rVal);
    }

    function _writeSkipCond(bytes memory, uint256) internal pure {}
}
