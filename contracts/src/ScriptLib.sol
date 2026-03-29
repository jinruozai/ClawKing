// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./Constants.sol";
import "./EntityLib.sol";

/// @title ScriptLib - AI script interpreter for Claw Arena v3
/// @notice Decodes binary script format, evaluates conditions, resolves targets via slots.
///         All functions are internal pure (inlined into caller).
library ScriptLib {
    using EntityLib for uint256;

    struct ScriptResult {
        uint8 action;
        uint8 actionArg;
        uint8 targetIdx;
    }

    // ── Sizes ──
    uint256 private constant SLOT_SIZE = 8;
    uint256 private constant COND_SIZE = 11;
    uint256 private constant RULE_SIZE = 47; // 4 * COND_SIZE + 3

    // Sentinel for uncomputed slot cache
    uint8 private constant SLOT_UNCOMPUTED = 254;

    /// @dev Packed context to avoid stack-too-deep.
    struct Ctx {
        uint8 selfIdx;
        uint8 turn;
        uint8 aliveCount;
        uint8 ringRadius;
        uint8 numSlots;
        uint8 visCount;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Main entry point
    // ────────────────────────────────────────────────────────────────────

    function executeScript(
        uint8 selfIdx,
        uint256[8] memory ents,
        bytes memory script,
        uint8 turn,
        uint8 aliveCount,
        uint8 ringRadius
    ) internal pure returns (ScriptResult memory result) {
        result.action = ACTION_DEFEND;
        result.targetIdx = NO_TARGET;

        if (script.length == 0) return result;

        uint8 numSlots = uint8(script[0]);
        if (numSlots > MAX_SLOTS) numSlots = MAX_SLOTS;
        uint256 rulesOffset = 1 + uint256(numSlots) * SLOT_SIZE;
        if (rulesOffset >= script.length) return result;
        uint8 numRules = uint8(script[rulesOffset]);
        if (numRules == 0) return result;
        if (numRules > MAX_RULES) numRules = MAX_RULES;
        rulesOffset += 1;

        // Visible enemies (computed once)
        uint8[8] memory visIndices;
        uint8 visCount;
        (visIndices, visCount) = _getVisibleIndices(selfIdx, ents);

        // Lazy slot cache
        uint8[8] memory slotCache;
        for (uint256 s; s < MAX_SLOTS; ++s) {
            slotCache[s] = SLOT_UNCOMPUTED;
        }

        // Pack context
        Ctx memory ctx;
        ctx.selfIdx = selfIdx;
        ctx.turn = turn;
        ctx.aliveCount = aliveCount;
        ctx.ringRadius = ringRadius;
        ctx.numSlots = numSlots;
        ctx.visCount = visCount;

        // Evaluate rules
        for (uint256 ri; ri < numRules; ++ri) {
            uint256 ruleBase = rulesOffset + ri * RULE_SIZE;
            if (ruleBase + RULE_SIZE > script.length) break;

            bool matched = _evalRule(ruleBase, ents, script, visIndices, slotCache, ctx);
            if (!matched) continue;

            // Rule matched - read action bytes
            uint256 ab = ruleBase + MAX_CONDITIONS * COND_SIZE;
            result.action = uint8(script[ab]);
            result.actionArg = uint8(script[ab + 1]);
            result.targetIdx = _resolveSubjectIdx(
                uint8(script[ab + 2]), ents, script, visIndices, slotCache, ctx
            );
            return result;
        }
        return result;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Rule evaluation (4 conditions AND)
    // ────────────────────────────────────────────────────────────────────

    function _evalRule(
        uint256 ruleBase,
        uint256[8] memory ents,
        bytes memory script,
        uint8[8] memory visIndices,
        uint8[8] memory slotCache,
        Ctx memory ctx
    ) private pure returns (bool) {
        for (uint256 ci; ci < MAX_CONDITIONS; ++ci) {
            uint256 cb = ruleBase + ci * COND_SIZE;
            uint8 cmp = uint8(script[cb + 5]);
            if (cmp == CMP_SKIP) continue;

            (int16 lv, bool lOk) = _getSideValue(
                uint8(script[cb]), uint8(script[cb + 1]),
                uint8(script[cb + 2]), _readInt16(script, cb + 3),
                ents, script, visIndices, slotCache, ctx
            );
            if (!lOk) return false;

            (int16 rv, bool rOk) = _getSideValue(
                uint8(script[cb + 6]), uint8(script[cb + 7]),
                uint8(script[cb + 8]), _readInt16(script, cb + 9),
                ents, script, visIndices, slotCache, ctx
            );
            if (!rOk) return false;

            if (!_cmpOp(cmp, lv, rv)) return false;
        }
        return true;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Visibility
    // ────────────────────────────────────────────────────────────────────

    function _getVisibleIndices(
        uint8 selfIdx,
        uint256[8] memory ents
    ) private pure returns (uint8[8] memory indices, uint8 count) {
        uint256 self = ents[selfIdx];
        uint8 myRange = self.getAtkRange();
        bool amBlind = (self.getStatusFlags() & STATUS_BLIND) != 0;

        for (uint8 i; i < PLAYERS_PER_MATCH; ++i) {
            if (i == selfIdx) continue;
            uint256 other = ents[i];
            if (!other.isAlive()) continue;
            if (amBlind) continue;
            if ((other.getStatusFlags() & STATUS_STEALTH) != 0) continue;
            uint16 dist = EntityLib.manhattan(self, other);
            if (dist <= uint16(myRange) + uint16(other.getExposure())) {
                indices[count] = i;
                ++count;
            }
        }
    }

    // ────────────────────────────────────────────────────────────────────
    //  Side value resolution
    // ────────────────────────────────────────────────────────────────────

    function _getSideValue(
        uint8 sub,
        uint8 prop,
        uint8 op,
        int16 val,
        uint256[8] memory ents,
        bytes memory script,
        uint8[8] memory visIndices,
        uint8[8] memory slotCache,
        Ctx memory ctx
    ) private pure returns (int16 result, bool ok) {
        if (sub == SUB_CONSTANT) return (val, true);

        if (sub == SUB_GAME) {
            return (_arith(op, _getGameProp(prop, ctx), val), true);
        }

        uint8 entIdx = _resolveSubjectIdx(sub, ents, script, visIndices, slotCache, ctx);
        if (entIdx == NO_TARGET) return (0, false);

        int16 pv = _getProp(prop, entIdx, ents, visIndices, ctx);
        return (_arith(op, pv, val), true);
    }

    // ────────────────────────────────────────────────────────────────────
    //  Subject resolution
    // ────────────────────────────────────────────────────────────────────

    function _resolveSubjectIdx(
        uint8 sub,
        uint256[8] memory ents,
        bytes memory script,
        uint8[8] memory visIndices,
        uint8[8] memory slotCache,
        Ctx memory ctx
    ) private pure returns (uint8) {
        if (sub == SUB_SELF) return ctx.selfIdx;

        if (sub >= SUB_T0 && sub <= SUB_T7) {
            uint8 si = sub - SUB_T0;
            if (si >= ctx.numSlots) return NO_TARGET;
            if (slotCache[si] == SLOT_UNCOMPUTED) {
                slotCache[si] = _computeSlot(si, ents, script, visIndices, ctx);
            }
            return slotCache[si];
        }

        if (sub == SUB_LAST_ATK) {
            uint8 lai = ents[ctx.selfIdx].getLastAtkIdx();
            if (lai >= PLAYERS_PER_MATCH) return NO_TARGET;
            if (!ents[lai].isAlive()) return NO_TARGET;
            return lai;
        }

        if (sub == SUB_LAST_TGT) {
            uint8 lti = ents[ctx.selfIdx].getLastTgtIdx();
            if (lti >= PLAYERS_PER_MATCH) return NO_TARGET;
            if (!ents[lti].isAlive()) return NO_TARGET;
            return lti;
        }

        if (sub == SUB_LAST_BLOCKED) {
            uint8 lbi = ents[ctx.selfIdx].getLastBlockedBy();
            if (lbi >= PLAYERS_PER_MATCH) return NO_TARGET;
            if (!ents[lbi].isAlive()) return NO_TARGET;
            return lbi;
        }

        return NO_TARGET;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Slot computation
    // ────────────────────────────────────────────────────────────────────

    function _computeSlot(
        uint8 slotIdx,
        uint256[8] memory ents,
        bytes memory script,
        uint8[8] memory visIndices,
        Ctx memory ctx
    ) private pure returns (uint8 bestIdx) {
        bestIdx = NO_TARGET;
        if (ctx.visCount == 0) return bestIdx;

        uint256 sb = 1 + uint256(slotIdx) * SLOT_SIZE;
        uint8 sortBy = uint8(script[sb]);
        uint8 order = uint8(script[sb + 1]);
        uint8 filterProp = uint8(script[sb + 2]);
        uint8 filterOp = uint8(script[sb + 3]);

        int16 bestVal = order == 0 ? type(int16).max : type(int16).min;

        for (uint8 vi; vi < ctx.visCount; ++vi) {
            uint8 eidx = visIndices[vi];

            // Apply filter
            if (filterOp != CMP_SKIP) {
                int16 fLeft = _getProp(filterProp, eidx, ents, visIndices, ctx);
                int16 fRight = _getFilterRight(
                    uint8(script[sb + 4]), uint8(script[sb + 5]),
                    _readInt16(script, sb + 6), ents, visIndices, ctx
                );
                if (!_cmpOp(filterOp, fLeft, fRight)) continue;
            }

            int16 sv = _getProp(sortBy, eidx, ents, visIndices, ctx);

            if (bestIdx == NO_TARGET) {
                bestIdx = eidx;
                bestVal = sv;
            } else {
                bool better = order == 0 ? sv < bestVal : sv > bestVal;
                if (better) {
                    bestIdx = eidx;
                    bestVal = sv;
                }
            }
        }
    }

    function _getFilterRight(
        uint8 sub,
        uint8 prop,
        int16 val,
        uint256[8] memory ents,
        uint8[8] memory visIndices,
        Ctx memory ctx
    ) private pure returns (int16) {
        if (sub == SUB_CONSTANT) return val;
        if (sub == SUB_GAME) return _getGameProp(prop, ctx);
        if (sub == SUB_SELF) return _getProp(prop, ctx.selfIdx, ents, visIndices, ctx);
        return val;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Property getter
    // ────────────────────────────────────────────────────────────────────

    function _getProp(
        uint8 prop,
        uint8 entIdx,
        uint256[8] memory ents,
        uint8[8] memory visIndices,
        Ctx memory ctx
    ) private pure returns (int16) {
        uint256 e = ents[entIdx];
        uint256 self = ents[ctx.selfIdx];

        if (prop == PROP_HP) return e.getCurrentHp();
        if (prop == PROP_HP_MAX) return int16(uint16(e.getHp()));
        if (prop == PROP_HP_PCT) {
            int16 curHp = e.getCurrentHp();
            uint8 maxHp = e.getHp();
            if (maxHp == 0) return 0;
            if (curHp <= 0) return 0;
            return int16(int256(curHp) * 100 / int256(uint256(maxHp)));
        }
        if (prop == PROP_ATK) return int16(uint16(e.getAtk()));
        if (prop == PROP_ATK_RANGE) return int16(uint16(e.getAtkRange()));
        if (prop == PROP_X) return int16(e.getX());
        if (prop == PROP_Y) return int16(e.getY());
        if (prop == PROP_DIST) return int16(EntityLib.manhattan(self, e));
        if (prop == PROP_RING_DIST) return _ringDist(e, ctx.ringRadius);
        if (prop == PROP_EXP) return int16(uint16(e.getExp()));
        if (prop == PROP_KILLS) return int16(uint16(e.getKills()));
        if (prop == PROP_EXPOSURE) return int16(uint16(e.getExposure()));
        if (prop == PROP_LAST_ACTION) return int16(uint16(e.getLastAction()));
        if (prop == PROP_MP) return int16(uint16(e.getMana()));
        if (prop == PROP_MP_MAX) return int16(uint16(e.getManaMax()));
        if (prop == PROP_TURNS_TO_SKILL) {
            uint8 mm = e.getManaMax();
            uint8 m = e.getMana();
            return int16(uint16(mm > m ? mm - m : 0));
        }
        if (prop == PROP_DMG_TO) return _estimateDmg(self, e);
        if (prop == PROP_DMG_FROM) return _estimateDmg(e, self);
        if (prop == PROP_HITS_TO_KILL) return _hitsNeeded(self, e);
        if (prop == PROP_HITS_TO_DIE) return _hitsNeeded(e, self);
        if (prop == PROP_KILL_EXP) {
            uint16 te = e.getExp();
            int16 r = int16(uint16(te * KILL_EXP_PCT / 100));
            if (r < int16(uint16(KILL_EXP_MIN))) r = int16(uint16(KILL_EXP_MIN));
            return r;
        }
        if (prop == PROP_DEBUFF) return int16(uint16(e.getStatusFlags() & STATUS_DEBUFF_MASK));
        if (prop == PROP_STEALTH) return (e.getStatusFlags() & STATUS_STEALTH) != 0 ? int16(1) : int16(0);
        if (prop == PROP_BLINK_CD) return int16(uint16(e.getBlinkCd()));
        if (prop == PROP_VISIBLE_COUNT) return int16(uint16(ctx.visCount));
        if (prop == PROP_THREAT_COUNT) return _countThreats(entIdx, ents);
        if (prop == PROP_POWER) {
            int16 hp = e.getCurrentHp();
            if (hp <= 0) return 0;
            return int16(int256(hp) * int256(uint256(e.getAtk())) / 10);
        }
        return 0;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Game property
    // ────────────────────────────────────────────────────────────────────

    function _getGameProp(uint8 prop, Ctx memory ctx) private pure returns (int16) {
        if (prop == GPROP_TURN) return int16(uint16(ctx.turn));
        if (prop == GPROP_ALIVE_COUNT) return int16(uint16(ctx.aliveCount));
        if (prop == GPROP_RING_RADIUS) return int16(uint16(ctx.ringRadius));
        if (prop == GPROP_MAP_SIZE) return int16(uint16(MAP_SIZE));
        return 0;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Operators
    // ────────────────────────────────────────────────────────────────────

    function _cmpOp(uint8 op, int16 a, int16 b) private pure returns (bool) {
        if (op == CMP_EQ) return a == b;
        if (op == CMP_NEQ) return a != b;
        if (op == CMP_GT) return a > b;
        if (op == CMP_GTE) return a >= b;
        if (op == CMP_LT) return a < b;
        if (op == CMP_LTE) return a <= b;
        return false;
    }

    /// @dev Unchecked: player scripts may supply extreme values; overflow wraps instead of reverting.
    function _arith(uint8 op, int16 base, int16 val) private pure returns (int16) {
        unchecked {
            if (op == ARITH_ADD) return base + val;
            if (op == ARITH_SUB) return base - val;
            if (op == ARITH_MUL) return base * val;
        }
        return base;
    }

    // ────────────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────────────

    function _ringDist(uint256 e, uint8 ringRadius) private pure returns (int16) {
        int8 ex = e.getX();
        int8 ey = e.getY();
        int16 ax = ex < 0 ? -int16(ex) : int16(ex);
        int16 ay = ey < 0 ? -int16(ey) : int16(ey);
        int16 cheb = ax > ay ? ax : ay;
        return int16(uint16(ringRadius)) - cheb;
    }

    function _estimateDmg(uint256 attacker, uint256 target) private pure returns (int16) {
        uint256 atk = uint256(attacker.getAtk());
        uint256 exp_ = uint256(target.getExposure());
        int256 dmg = int256(atk * (100 + exp_ * EXPOSURE_DMG_PCT) / 100);
        if (target.getLastAction() == ACTION_DEFEND) {
            dmg = dmg * (100 - int256(uint256(DEFEND_REDUCE_PCT))) / 100;
        }
        if (dmg < 1) dmg = 1;
        return int16(dmg);
    }

    function _hitsNeeded(uint256 attacker, uint256 target) private pure returns (int16) {
        int16 dmg = _estimateDmg(attacker, target);
        if (dmg <= 0) return int16(127);
        int16 hp = target.getCurrentHp();
        if (hp <= 0) return 0;
        return (hp + dmg - 1) / dmg;
    }

    function _countThreats(
        uint8 entIdx,
        uint256[8] memory ents
    ) private pure returns (int16) {
        uint256 e = ents[entIdx];
        int16 count;
        for (uint8 i; i < PLAYERS_PER_MATCH; ++i) {
            if (i == entIdx) continue;
            uint256 other = ents[i];
            if (!other.isAlive()) continue;
            if ((other.getStatusFlags() & STATUS_BLIND) != 0) continue;
            if ((e.getStatusFlags() & STATUS_STEALTH) != 0) continue;
            uint16 dist = EntityLib.manhattan(e, other);
            if (dist <= uint16(other.getAtkRange()) + uint16(e.getExposure())) {
                ++count;
            }
        }
        return count;
    }

    function _readInt16(bytes memory script, uint256 offset) private pure returns (int16) {
        return int16(uint16(uint16(uint8(script[offset])) << 8 | uint16(uint8(script[offset + 1]))));
    }
}
