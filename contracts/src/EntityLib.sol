// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./Constants.sol";

/// @title EntityLib - packed uint256 实体操作
/// @notice Entity packed layout (216 bits):
///   [0..15]    currentHp     int16
///   [16..23]   x             int8
///   [24..31]   y             int8
///   [32..39]   mana          uint8
///   [40..47]   exposure      uint8
///   [48..63]   statusFlags   uint16
///   [64..71]   blinkCooldown uint8
///   [72..79]   lastAction    uint8
///   [80..87]   alive         uint8
///   [88..95]   kills         uint8
///   [96..111]  exp           uint16
///   [112..119] level         uint8
///   [120..127] deathTurn     uint8
///   [128..135] idx           uint8
///   [136..143] lastAtkIdx    uint8
///   [144..151] lastTgtIdx    uint8
///   [152..159] hp            uint8  (max HP, grows on level up)
///   [160..167] atk           uint8  (attack, grows on level up)
///   [168..175] atkRange      uint8
///   [176..183] speed         uint8
///   [184..191] manaMax       uint8
///   [192..207] skillEffect   uint16
///   [208..215] skillPower    uint8
///   [216..223] lastBlockedBy uint8  (idx of entity that blocked move/blink, NO_TARGET if none)
library EntityLib {
    // ── Getters ──
    function getCurrentHp(uint256 e) internal pure returns (int16) { return int16(uint16(e & 0xFFFF)); }
    function getX(uint256 e) internal pure returns (int8) { return int8(uint8(e >> 16)); }
    function getY(uint256 e) internal pure returns (int8) { return int8(uint8(e >> 24)); }
    function getMana(uint256 e) internal pure returns (uint8) { return uint8(e >> 32); }
    function getExposure(uint256 e) internal pure returns (uint8) { return uint8(e >> 40); }
    function getStatusFlags(uint256 e) internal pure returns (uint16) { return uint16(e >> 48); }
    function getBlinkCd(uint256 e) internal pure returns (uint8) { return uint8(e >> 64); }
    function getLastAction(uint256 e) internal pure returns (uint8) { return uint8(e >> 72); }
    function isAlive(uint256 e) internal pure returns (bool) { return uint8(e >> 80) != 0; }
    function getKills(uint256 e) internal pure returns (uint8) { return uint8(e >> 88); }
    function getExp(uint256 e) internal pure returns (uint16) { return uint16(e >> 96); }
    function getLevel(uint256 e) internal pure returns (uint8) { return uint8(e >> 112); }
    function getDeathTurn(uint256 e) internal pure returns (uint8) { return uint8(e >> 120); }
    function getIdx(uint256 e) internal pure returns (uint8) { return uint8(e >> 128); }
    function getLastAtkIdx(uint256 e) internal pure returns (uint8) { return uint8(e >> 136); }
    function getLastTgtIdx(uint256 e) internal pure returns (uint8) { return uint8(e >> 144); }
    function getHp(uint256 e) internal pure returns (uint8) { return uint8(e >> 152); }
    function getAtk(uint256 e) internal pure returns (uint8) { return uint8(e >> 160); }
    function getAtkRange(uint256 e) internal pure returns (uint8) { return uint8(e >> 168); }
    function getSpeed(uint256 e) internal pure returns (uint8) { return uint8(e >> 176); }
    function getManaMax(uint256 e) internal pure returns (uint8) { return uint8(e >> 184); }
    function getSkillEffect(uint256 e) internal pure returns (uint16) { return uint16(e >> 192); }
    function getSkillPower(uint256 e) internal pure returns (uint8) { return uint8(e >> 208); }
    function getLastBlockedBy(uint256 e) internal pure returns (uint8) { return uint8(e >> 216); }

    // ── Setters (return new entity) ──
    function setCurrentHp(uint256 e, int16 v) internal pure returns (uint256) {
        return (e & ~uint256(0xFFFF)) | uint256(uint16(v));
    }
    function setX(uint256 e, int8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 16)) | (uint256(uint8(v)) << 16);
    }
    function setY(uint256 e, int8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 24)) | (uint256(uint8(v)) << 24);
    }
    function setMana(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 32)) | (uint256(v) << 32);
    }
    function setExposure(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 40)) | (uint256(v) << 40);
    }
    function setStatusFlags(uint256 e, uint16 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFFFF) << 48)) | (uint256(v) << 48);
    }
    function setBlinkCd(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 64)) | (uint256(v) << 64);
    }
    function setLastAction(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 72)) | (uint256(v) << 72);
    }
    function setAlive(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 80)) | (uint256(v) << 80);
    }
    function setKills(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 88)) | (uint256(v) << 88);
    }
    function setExp(uint256 e, uint16 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFFFF) << 96)) | (uint256(v) << 96);
    }
    function setLevel(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 112)) | (uint256(v) << 112);
    }
    function setDeathTurn(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 120)) | (uint256(v) << 120);
    }
    function setLastAtkIdx(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 136)) | (uint256(v) << 136);
    }
    function setLastTgtIdx(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 144)) | (uint256(v) << 144);
    }
    function setHp(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 152)) | (uint256(v) << 152);
    }
    function setAtk(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 160)) | (uint256(v) << 160);
    }
    function setLastBlockedBy(uint256 e, uint8 v) internal pure returns (uint256) {
        return (e & ~(uint256(0xFF) << 216)) | (uint256(v) << 216);
    }

    // ── 创建实体 ──
    function create(uint256 packedNftStats, int8 x, int8 y, uint8 idx) internal pure returns (uint256) {
        uint8 hp = uint8(packedNftStats);
        uint8 atk = uint8(packedNftStats >> 8);
        uint8 atkRange = uint8(packedNftStats >> 16);
        uint8 speed = uint8(packedNftStats >> 24);
        uint8 manaMax = uint8(packedNftStats >> 32);
        uint16 skillEffect = uint16(packedNftStats >> 40);
        uint8 skillPower = uint8(packedNftStats >> 56);

        uint256 e;
        e = uint256(uint16(int16(int8(hp))));           // currentHp = hp
        e |= uint256(uint8(x)) << 16;
        e |= uint256(uint8(y)) << 24;
        // mana = 0, exposure = 0, statusFlags = 0, blinkCd = 0, lastAction = 0
        e |= uint256(1) << 80;                          // alive = 1
        // kills = 0, exp = 0, level = 0, deathTurn = 0
        e |= uint256(idx) << 128;
        e |= uint256(NO_TARGET) << 136;                 // lastAtkIdx
        e |= uint256(NO_TARGET) << 144;                 // lastTgtIdx
        e |= uint256(hp) << 152;
        e |= uint256(atk) << 160;
        e |= uint256(atkRange) << 168;
        e |= uint256(speed) << 176;
        e |= uint256(manaMax) << 184;
        e |= uint256(skillEffect) << 192;
        e |= uint256(skillPower) << 208;
        e |= uint256(NO_TARGET) << 216;                 // lastBlockedBy
        return e;
    }

    // ── 距离 ──
    function manhattan(uint256 a, uint256 b) internal pure returns (uint16) {
        int8 ax = getX(a); int8 ay = getY(a);
        int8 bx = getX(b); int8 by = getY(b);
        int16 dx = int16(ax) - int16(bx);
        int16 dy = int16(ay) - int16(by);
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        return uint16(dx + dy);
    }
}
