// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title DefaultData - 默认英雄和脚本数据配置
/// @notice 修改此文件调整默认英雄/脚本，合约代码无需改动
library DefaultData {

    /// @notice 返回默认英雄的 packed stats 数组
    /// stats 打包格式: hp[0:8] atk[8:16] atkRange[16:24] speed[24:32] manaMax[32:40] skillEffect[40:56] skillPower[56:64]
    function getDefaultHeroStats() internal pure returns (uint256[] memory) {
        uint256[] memory stats = new uint256[](12);

        // 属性点计算: 初始16 + 自由12 = 28基础
        // 射程每多1点(超过初始1) cost=3(额外-2)，蓝量每多1点(超过初始3) cost=-1(返还+1)
        // 初始值: hp=10, atk=1, range=1, speed=0, mana=3, skillPower=1
        // 上  限: hp=40, atk=11, range=4, speed=5, mana=6, skillPower=10
        //                    hp  atk range spd mana  skillEffect           pw    净点数
        stats[0]  = _pack(   14,   4,   2,   1,   3,  0x0001,              2);  // Iron Claw   range2(-2)              =26
        stats[1]  = _pack(   21,   2,   1,   0,   4,  0x0002,              1);  // Rock Lobs   mana4(+1)               =29
        stats[2]  = _pack(   11,   5,   2,   3,   3,  0x0100,              2);  // Ghost Shr   range2(-2) hp+3,spd-1,pw-2  =26
        stats[3]  = _pack(   10,   5,   2,   1,   4,  0x0010,              4);  // Blood Cla   range2(-2) mana4(+1) atk+2,hp-3 =27
        stats[4]  = _pack(   10,   5,   2,   2,   3,  0x0040,              4);  // Executr     range2(-2)              =26
        stats[5]  = _pack(   17,   3,   1,   1,   3,  0x0200,              3);  // Thorn Shr   atk+1,pw+1,hp-2         =28
        stats[6]  = _pack(    9,   6,   2,   3,   3,  0x0400,              3);  // Crit Lobs   range2(-2)              =26
        stats[7]  = _pack(   10,   2,   4,   1,   4,  0x0080,              3);  // Blue Flam   range4(-6) mana4(+1)    =23
        stats[8]  = _pack(    8,   3,   4,   1,   3,  0x0004,              4);  // Arctic Sh   range4(-6)              =22
        stats[9]  = _pack(   11,   3,   3,   0,   4,  0x0008,              4);  // Vent Shr    range3(-4) mana4(+1)    =25
        stats[10] = _pack(   18,   2,   1,   2,   3,  0x0800,              2);  // Hermit Sh                           =28
        stats[11] = _pack(   11,   4,   2,   2,   3,  0x1000,              4);  // Lucky Shr   range2(-2)              =26

        return stats;
    }

    /// @notice 返回默认英雄的 packed visual 数组 (7×RGB = 21 bytes per hero)
    function getDefaultHeroVisuals() internal pure returns (uint256[] memory) {
        uint256[] memory visuals = new uint256[](12);
        //              shell       claw        leg         eye         tail        aura        sub
        visuals[0]  = _packRGB7(255,85,0,   255,51,0,   255,170,0,  0,243,255,  255,85,0,   255,85,0,   204,34,0);       // 铁钳 - 经典橙红（保留）
        visuals[1]  = _packRGB7(140,145,150, 100,110,125, 80,85,95, 0,255,180,  120,128,135, 60,90,120,  160,155,145);    // 岩虾 - 灰蓝岩石
        visuals[2]  = _packRGB7(80,10,20,   60,5,30,    30,0,15,    255,20,50,  50,0,25,    140,0,200,  45,15,35);        // 幽灵 - 暗红+紫
        visuals[3]  = _packRGB7(220,20,30,  180,10,40,  140,0,25,   255,60,0,   200,15,50,  255,40,60,  100,0,20);       // 血钳 - 深红+暗橙
        visuals[4]  = _packRGB7(20,150,230, 10,100,190, 0,60,130,   0,255,255,  30,120,200, 60,200,255, 0,40,80);        // 斩杀 - 海蓝+青
        visuals[5]  = _packRGB7(85,120,40,  110,140,50, 50,70,15,   180,255,60, 75,105,35,  60,200,100, 30,50,10);       // 荆棘 - 苔绿+翠绿
        visuals[6]  = _packRGB7(240,50,90,  220,30,70,  170,20,60,  255,240,60, 210,40,100, 255,150,180, 60,10,30);      // 暴击 - 粉红+金眼
        visuals[7]  = _packRGB7(30,80,180,  20,60,150,  10,40,100,  200,220,255, 25,70,160, 100,140,255, 5,20,60);       // 蓝焰 - 深蓝+靛蓝
        visuals[8]  = _packRGB7(140,200,230, 170,220,240, 90,150,190, 220,245,255, 130,190,220, 180,230,255, 200,235,250); // 北极 - 冰白+浅蓝
        visuals[9]  = _packRGB7(90,30,170,  120,50,200, 50,10,100,  220,120,255, 80,25,150, 150,60,230, 35,5,70);        // 盲虾 - 深紫+品红
        visuals[10] = _packRGB7(155,120,55, 175,140,65, 110,80,35,  230,210,80, 140,105,50, 180,150,60, 100,75,30);      // 苟苟 - 土黄+赭石
        visuals[11] = _packRGB7(230,185,20, 250,210,40, 190,150,10, 255,250,180, 235,195,30, 255,220,80, 200,160,50);    // 福星 - 金黄+暖橙
        return visuals;
    }

    /// @notice 返回默认英雄的名字数组
    function getDefaultHeroNames() internal pure returns (bytes12[] memory) {
        bytes12[] memory names = new bytes12[](12);
        names[0]  = "Iron Claw";
        names[1]  = "Rock Lobs";
        names[2]  = "Ghost Shr";
        names[3]  = "Blood Cla";
        names[4]  = "Executr";
        names[5]  = "Thorn Shr";
        names[6]  = "Crit Lobs";
        names[7]  = "Blue Flam";
        names[8]  = "Arctic Sh";
        names[9]  = "Vent Shr";
        names[10] = "Hermit Sh";
        names[11] = "Lucky Shr";
        return names;
    }

    /// @notice 返回默认脚本的字节码数组 (12 scripts, 1:1 mapping to heroes)
    /// 格式: [numSlots(1)] [Slot(8)...] [numRules(1)] [Rule(47)...]
    function getDefaultScripts() internal pure returns (bytes[] memory) {
        bytes[] memory scripts = new bytes[](12);

        scripts[0]  = _script0_IronWall();
        scripts[1]  = _script1_Fortress();
        scripts[2]  = _script2_ShadowBlade();
        scripts[3]  = _script3_BloodFrenzy();
        scripts[4]  = _script4_Executioner();
        scripts[5]  = _script5_ThornArmor();
        scripts[6]  = _script6_CritStrike();
        scripts[7]  = _script7_FrostKite();
        scripts[8]  = _script8_IceSniper();
        scripts[9]  = _script9_VoidSilence();
        scripts[10] = _script10_LastStand();
        scripts[11] = _script11_FortuneAll();

        return scripts;
    }

    /// @notice 返回默认脚本的策略名字数组
    function getDefaultScriptNames() internal pure returns (bytes12[] memory) {
        bytes12[] memory names = new bytes12[](12);
        names[0]  = "IronWall";
        names[1]  = "Fortress";
        names[2]  = "ShadowBlade";
        names[3]  = "BloodFrenzy";
        names[4]  = "Executioner";
        names[5]  = "ThornArmor";
        names[6]  = "CritStrike";
        names[7]  = "FrostKite";
        names[8]  = "IceSniper";
        names[9]  = "VoidSilence";
        names[10] = "LastStand";
        names[11] = "FortuneAll";
        return names;
    }

    // ── 打包辅助 ──

    function _pack(uint8 hp, uint8 atk, uint8 atkRange, uint8 speed, uint8 manaMax, uint16 skillEffect, uint8 skillPower) private pure returns (uint256) {
        return uint256(hp)
            | (uint256(atk) << 8)
            | (uint256(atkRange) << 16)
            | (uint256(speed) << 24)
            | (uint256(manaMax) << 32)
            | (uint256(skillEffect) << 40)
            | (uint256(skillPower) << 56);
    }

    function _packRGB7(
        uint8 sr, uint8 sg, uint8 sb, uint8 cr, uint8 cg, uint8 cb,
        uint8 lr, uint8 lg, uint8 lb, uint8 er, uint8 eg, uint8 eb,
        uint8 tr, uint8 tg, uint8 tb, uint8 ar, uint8 ag, uint8 ab,
        uint8 ur, uint8 ug, uint8 ub
    ) private pure returns (uint256) {
        return uint256(sr) | (uint256(sg)<<8) | (uint256(sb)<<16)
            | (uint256(cr)<<24) | (uint256(cg)<<32) | (uint256(cb)<<40)
            | (uint256(lr)<<48) | (uint256(lg)<<56) | (uint256(lb)<<64)
            | (uint256(er)<<72) | (uint256(eg)<<80) | (uint256(eb)<<88)
            | (uint256(tr)<<96) | (uint256(tg)<<104) | (uint256(tb)<<112)
            | (uint256(ar)<<120) | (uint256(ag)<<128) | (uint256(ab)<<136)
            | (uint256(ur)<<144) | (uint256(ug)<<152) | (uint256(ub)<<160);
    }

    // ── 脚本构建辅助 ──
    // v3 actions: IDLE=0, DEFEND=1, ATTACK=2, MOVE=3(arg: 0=toward,1=away,2-6=dir), BLINK=4(arg: 0=toward,1=away,6=center)
    // Subjects: SELF=0, GAME=1, T0=2..T7=9, LAST_ATK=12, LAST_TGT=13, CONSTANT=255
    // CMP: SKIP=0, EQ=1, NEQ=2, GT=3, GTE=4, LT=5, LTE=6

    /// @dev Set a slot at index slotIdx. filterRSub=255(CONSTANT) for constant filter values.
    function _setSlot(bytes memory b, uint256 slotIdx,
        uint8 sortBy, uint8 order,
        uint8 filterProp, uint8 filterOp, uint8 filterRSub, int16 filterVal
    ) private pure {
        uint256 sb = 1 + slotIdx * 8;
        b[sb]     = bytes1(sortBy);
        b[sb + 1] = bytes1(order);
        b[sb + 2] = bytes1(filterProp);
        b[sb + 3] = bytes1(filterOp);
        b[sb + 4] = bytes1(filterRSub);  // filterRSub
        b[sb + 5] = 0;                   // filterRProp (0 for constant)
        b[sb + 6] = bytes1(uint8(uint16(filterVal) >> 8));  // hi
        b[sb + 7] = bytes1(uint8(uint16(filterVal)));       // lo
    }

    function _setCond(bytes memory b, uint256 off,
        uint8 lSub, uint8 lProp, uint8 lOp, int16 lVal,
        uint8 cmp,
        uint8 rSub, uint8 rProp, uint8 rOp, int16 rVal
    ) private pure {
        b[off]     = bytes1(lSub);
        b[off + 1] = bytes1(lProp);
        b[off + 2] = bytes1(lOp);
        b[off + 3] = bytes1(uint8(uint16(lVal) >> 8));
        b[off + 4] = bytes1(uint8(uint16(lVal)));
        b[off + 5] = bytes1(cmp);
        b[off + 6] = bytes1(rSub);
        b[off + 7] = bytes1(rProp);
        b[off + 8] = bytes1(rOp);
        b[off + 9] = bytes1(uint8(uint16(rVal) >> 8));
        b[off + 10] = bytes1(uint8(uint16(rVal)));
    }

    function _setAction(bytes memory b, uint256 ruleBase, uint8 action, uint8 arg, uint8 target) private pure {
        uint256 ab = ruleBase + 44; // 4 conditions × 11 bytes
        b[ab]     = bytes1(action);
        b[ab + 1] = bytes1(arg);
        b[ab + 2] = bytes1(target);
    }

    /// @dev Allocate script bytes: numSlots slots + numRules rules
    function _alloc(uint8 numSlots, uint8 numRules) private pure returns (bytes memory b, uint256 rulesStart) {
        b = new bytes(1 + uint256(numSlots) * 8 + 1 + 47 * uint256(numRules));
        b[0] = bytes1(numSlots);
        rulesStart = 1 + uint256(numSlots) * 8;
        b[rulesStart] = bytes1(numRules);
        rulesStart += 1; // now points to first rule
    }

    // ── Shared rule helpers ──

    /// Blocked in ring: if LAST_BLOCKED.HP > 0 AND SELF.RING_DIST <= 2 → ATTACK LAST_BLOCKED
    /// When stuck near ring edge, attack whoever is blocking the escape path.
    function _setBlockedAttackRule(bytes memory b, uint256 rBase) private pure {
        _setCond(b, rBase,       14, 0, 0, 0,  3,  255, 0, 0, 0); // LAST_BLOCKED.HP GT 0
        _setCond(b, rBase + 11,   0, 8, 0, 0,  6,  255, 0, 0, 2); // SELF.RING_DIST LTE 2
        _setAction(b, rBase, 2, 0, 14); // ATTACK LAST_BLOCKED
    }

    /// Ring rule: if SELF.RING_DIST <= 0 → MOVE DIR_CENTER
    /// Threshold 0 = at or beyond ring edge.
    function _setRingRule(bytes memory b, uint256 rBase) private pure {
        _setCond(b, rBase, 0, 8, 0, 0,  6,  255, 0, 0, 0); // SELF.RING_DIST LTE 0
        _setAction(b, rBase, 3, 6, 0); // MOVE DIR_CENTER
    }

    /// Center fallback rule: unconditional MOVE DIR_CENTER
    function _setCenterRule(bytes memory b, uint256 rBase) private pure {
        _setAction(b, rBase, 3, 6, 0); // MOVE DIR_CENTER
    }

    /// Flee rule: if SELF.HITS_TO_DIE <= 2 AND SELF.BLINK_CD == 0 AND SELF.THREAT_COUNT >= 1 → BLINK AWAY T0
    function _setFleeRule(bytes memory b, uint256 rBase) private pure {
        _setCond(b, rBase,       0, 19, 0, 0,  6,  255, 0, 0, 2); // SELF.HITS_TO_DIE LTE 2
        _setCond(b, rBase + 11,  0, 23, 0, 0,  1,  255, 0, 0, 0); // SELF.BLINK_CD EQ 0
        _setCond(b, rBase + 22,  0, 25, 0, 0,  4,  255, 0, 0, 1); // SELF.THREAT_COUNT GTE 1
        _setAction(b, rBase, 4, 1, 2); // BLINK AWAY from T0
    }

    /// Exposure defend rule: if SELF.EXPOSURE >= threshold → DEFEND
    function _setExposureDefendRule(bytes memory b, uint256 rBase, int16 threshold) private pure {
        _setCond(b, rBase, 0, 11, 0, 0,  4,  255, 0, 0, threshold); // SELF.EXPOSURE GTE threshold
        _setAction(b, rBase, 1, 0, 0); // DEFEND
    }

    /// Attack nearest fallback: ATTACK T0 if T0 exists (HP > 0)
    /// Without this condition, ATTACK NO_TARGET gains exposure for nothing,
    /// triggering defend cycle instead of moving toward enemies.
    function _setAttackNearestRule(bytes memory b, uint256 rBase) private pure {
        _setCond(b, rBase, 2, 0, 0, 0,  3,  255, 0, 0, 0); // T0.HP GT 0
        _setAction(b, rBase, 2, 0, 2); // ATTACK T0
    }

    // ===== Script 0: IronWall (铁壁反击) — Tank/Counter, Immobilize, Range 2 =====
    // Tank: exposure >= 4 defend. Counter-attack focus.
    // 2 slots, 10 rules
    function _script0_IronWall() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 10);

        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);   // nearest
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);   // easiest kill

        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);                // 0: blocked near ring → attack blocker
        r = rs + 47;        _setRingRule(b, r);                         // 1: ring escape
        r = rs + 47 * 2;    _setFleeRule(b, r);                         // 2: flee when dying
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 4);            // 3: exposure >= 4 defend
        r = rs + 47 * 4;                                                // 4: counter-attack last attacker
        _setCond(b, r, 12, 7, 0, 0,  6,  0, 4, 0, 0);
        _setAction(b, r, 2, 0, 12);
        r = rs + 47 * 5;                                                // 5: one-hit kill T1
        _setCond(b, r, 3, 18, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);                // 6: attack nearest T0
        r = rs + 47 * 7;                                                // 7: chase nearest T0
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 5);
        _setAction(b, r, 3, 0, 2);
        r = rs + 47 * 8;    _setAttackNearestRule(b, r);                // 8: attack fallback
        r = rs + 47 * 9;    _setCenterRule(b, r);                       // 9: center fallback

        return b;
    }

    // ===== Script 1: Fortress (磐石堡垒) — Pure Tank, Disarm, HP:21 Range:1 =====
    function _script1_Fortress() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 4);
        r = rs + 47 * 4;
        _setCond(b, r, 12, 7, 0, 0, 6, 0, 4, 0, 0);
        _setAction(b, r, 2, 0, 12);
        r = rs + 47 * 5;
        _setCond(b, r, 3, 18, 0, 0, 6, 255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 2, 7, 0, 0, 6, 255, 0, 0, 5);
        _setAction(b, r, 3, 0, 2);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Scripts 2-11: Optimized for new exposure mechanics =====
    // Common pattern: ring → flee → exposure defend → special rules → attack T0 → attack fallback → center
    //
    // Key changes from v1:
    // - Removed unnecessary dist checks on attack rules (slot guarantees in range)
    // - Added exposure defend rule (threshold varies by tankiness)
    // - Removed overly defensive THREAT_COUNT rules that caused late-game stalling
    // - Added attack fallback before center fallback (prevents standing idle)

    // ===== Script 2: ShadowBlade (暗影突袭) — Assassin, Stealth =====
    function _script2_ShadowBlade() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r,       0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setCond(b, r + 11,  3, 18, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 4, 0, 3);
        r = rs + 47 * 5;
        _setCond(b, r, 0, 2, 0, 0,  6,  255, 0, 0, 30);
        _setAction(b, r, 3, 1, 2);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 5);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 3: BloodFrenzy (嗜血狂潮) — Sustain, Lifesteal =====
    function _script3_BloodFrenzy() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 2, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 5;
        _setCond(b, r, 12, 7, 0, 0,  6,  0, 4, 0, 0);
        _setAction(b, r, 2, 0, 12);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 5);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 4: Executioner (死刑宣判) — Burst, Execute =====
    function _script4_Executioner() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 2, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r,       0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setCond(b, r + 11,  3, 2, 0, 0,   6,  255, 0, 0, 40);
        _setAction(b, r, 4, 0, 3);
        r = rs + 47 * 5;
        _setCond(b, r, 3, 2, 0, 0,  6,  255, 0, 0, 50);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 5: ThornArmor (荆棘壁垒) — Reflect Tank, Thorns =====
    function _script5_ThornArmor() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 10);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 4);
        r = rs + 47 * 4;
        _setCond(b, r, 12, 7, 0, 0,  6,  0, 4, 0, 0);
        _setAction(b, r, 2, 0, 12);
        r = rs + 47 * 5;    _setAttackNearestRule(b, r);
        r = rs + 47 * 6;
        _setCond(b, r,       0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setCond(b, r + 11,  2, 7, 0, 0,   6,  255, 0, 0, 4);
        _setAction(b, r, 4, 0, 2);
        r = rs + 47 * 7;
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 5);
        _setAction(b, r, 3, 0, 2);
        r = rs + 47 * 8;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 9;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 6: CritStrike (致命暴击) — Burst DPS, Critical =====
    function _script6_CritStrike() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 16, 1, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r,       0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setCond(b, r + 11,  0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setAction(b, r, 4, 0, 3);
        r = rs + 47 * 5;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 7: FrostKite (远程消耗) — Ranged Kiter, ManaBurn =====
    function _script7_FrostKite() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 10);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r,       2, 7, 0, 0,   6,  255, 0, 0, 1);
        _setCond(b, r + 11,  0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setAction(b, r, 4, 1, 2);
        r = rs + 47 * 5;
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 2);
        _setAction(b, r, 3, 1, 2);
        r = rs + 47 * 6;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 7;    _setAttackNearestRule(b, r);
        r = rs + 47 * 8;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 7);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 9;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 8: IceSniper (冰霜狙击) — Ranged, Blind =====
    function _script8_IceSniper() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(3, 10);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 18, 6, 255, 1);
        _setSlot(b, 2, 3, 1, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r,       2, 7, 0, 0,   6,  255, 0, 0, 1);
        _setCond(b, r + 11,  0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setAction(b, r, 4, 1, 2);
        r = rs + 47 * 5;
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 2);
        _setAction(b, r, 3, 1, 2);
        r = rs + 47 * 6;
        _setCond(b, r, 3, 0, 0, 0,  3,  255, 0, 0, 0);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 7;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 4);
        r = rs + 47 * 8;    _setAttackNearestRule(b, r);
        r = rs + 47 * 9;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 9: VoidSilence (深渊沉默) — Control, Silence =====
    function _script9_VoidSilence() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(3, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 26, 1, 0, 0, 255, 0);
        _setSlot(b, 2, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 3);
        r = rs + 47 * 4;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 5;    _setAttackNearestRule(b, r);
        r = rs + 47 * 6;
        _setCond(b, r, 4, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 4);
        r = rs + 47 * 7;
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 2);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 10: LastStand (末日求生) — Survivor, Cleanse =====
    function _script10_LastStand() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 10);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 4);
        r = rs + 47 * 4;
        _setCond(b, r, 1, 0, 0, 0,  5,  255, 0, 0, 10);
        _setAction(b, r, 1, 0, 0);
        r = rs + 47 * 5;
        _setCond(b, r, 3, 18, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 3);
        r = rs + 47 * 6;
        _setCond(b, r, 0, 11, 0, 0,  6,  255, 0, 0, 2);
        _setAction(b, r, 2, 0, 2);
        r = rs + 47 * 7;    _setAttackNearestRule(b, r);
        r = rs + 47 * 8;
        _setCond(b, r, 3, 7, 0, 0,  6,  255, 0, 0, 4);
        _setAction(b, r, 3, 0, 3);
        r = rs + 47 * 9;    _setCenterRule(b, r);
        return b;
    }

    // ===== Script 11: FortuneAll (命运全押) — Gambler, Haste =====
    function _script11_FortuneAll() private pure returns (bytes memory) {
        (bytes memory b, uint256 rs) = _alloc(2, 9);
        _setSlot(b, 0, 7, 0, 0, 0, 255, 0);
        _setSlot(b, 1, 18, 0, 0, 0, 255, 0);
        uint256 r;
        r = rs;             _setBlockedAttackRule(b, r);
        r = rs + 47;        _setRingRule(b, r);
        r = rs + 47 * 2;    _setFleeRule(b, r);
        r = rs + 47 * 3;    _setExposureDefendRule(b, r, 4);
        r = rs + 47 * 4;
        _setCond(b, r,       0, 23, 0, 0,  1,  255, 0, 0, 0);
        _setCond(b, r + 11,  3, 7, 0, 0,   6,  255, 0, 0, 5);
        _setAction(b, r, 4, 0, 3);
        r = rs + 47 * 5;
        _setCond(b, r, 0, 15, 0, 0,  6,  255, 0, 0, 1);
        _setAction(b, r, 2, 0, 2);
        r = rs + 47 * 6;    _setAttackNearestRule(b, r);
        r = rs + 47 * 7;
        _setCond(b, r, 2, 7, 0, 0,  6,  255, 0, 0, 6);
        _setAction(b, r, 3, 0, 2);
        r = rs + 47 * 8;    _setCenterRule(b, r);
        return b;
    }
}
