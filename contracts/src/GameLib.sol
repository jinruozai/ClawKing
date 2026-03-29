// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./Constants.sol";
import "./EntityLib.sol";
import "./RngLib.sol";
import "./ScriptLib.sol";

/// @title GameLib - Core game engine for Claw Arena v3
/// @notice 8-player FFA battle royale. All functions internal (inlined into caller).
library GameLib {
    using EntityLib for uint256;
    using RngLib for uint32;

    struct RankingEntry {
        uint8 idx;
        uint8 deathTurn;
        uint16 exp;
        uint8 kills;
        bool firstBlood;
    }

    struct GameState {
        uint256[8] ents;
        bytes[8] scripts;
        uint8[8] actionOrder;
        uint8 aliveCount;
        uint8 ringRadius;
        bool[8] firstBloodFlags;
    }

    // ── Precomputed spawn points (radius 6, 8 angles) ──
    // Angles: 0, 45, 90, 135, 180, 225, 270, 315 degrees
    int8 constant SP0_X =  6; int8 constant SP0_Y =  0;
    int8 constant SP1_X =  4; int8 constant SP1_Y =  4;
    int8 constant SP2_X =  0; int8 constant SP2_Y =  6;
    int8 constant SP3_X = -4; int8 constant SP3_Y =  4;
    int8 constant SP4_X = -6; int8 constant SP4_Y =  0;
    int8 constant SP5_X = -4; int8 constant SP5_Y = -4;
    int8 constant SP6_X =  0; int8 constant SP6_Y = -6;
    int8 constant SP7_X =  4; int8 constant SP7_Y = -4;

    // ═══════════════════════════════════════════════════
    //  Main entry point
    // ═══════════════════════════════════════════════════

    function runGame(
        uint256[8] memory lobsterStats,
        bytes[8] memory scripts,
        uint32 seed
    ) public pure returns (RankingEntry[8] memory rankings, bytes32 replayHash) {
        uint32 rng = seed.init();

        // ── Initialize entities with shuffled spawn points ──
        uint256[8] memory ents;
        {
            // Load spawn points into temp arrays for shuffle
            int8[8] memory sx = [SP0_X, SP1_X, SP2_X, SP3_X, SP4_X, SP5_X, SP6_X, SP7_X];
            int8[8] memory sy = [SP0_Y, SP1_Y, SP2_Y, SP3_Y, SP4_Y, SP5_Y, SP6_Y, SP7_Y];

            // Fisher-Yates shuffle
            for (uint8 i = PLAYERS_PER_MATCH - 1; i > 0;) {
                rng = rng.next();
                uint8 j = uint8(rng % (i + 1));
                (sx[i], sx[j]) = (sx[j], sx[i]);
                (sy[i], sy[j]) = (sy[j], sy[i]);
                unchecked { i--; }
            }

            for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
                ents[i] = EntityLib.create(lobsterStats[i], sx[i], sy[i], i);
                unchecked { i++; }
            }
        }

        // ── Sort action order by speed DESC (tie-break with rng) ──
        uint8[8] memory actionOrder;
        {
            for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
                actionOrder[i] = i;
                unchecked { i++; }
            }
            // Insertion sort (8 elements, simple and gas-cheap)
            for (uint8 i = 1; i < PLAYERS_PER_MATCH;) {
                uint8 key = actionOrder[i];
                uint8 keySpd = ents[key].getSpeed();
                uint8 j = i;
                while (j > 0) {
                    uint8 prev = actionOrder[j - 1];
                    uint8 prevSpd = ents[prev].getSpeed();
                    if (prevSpd > keySpd) break;
                    if (prevSpd == keySpd) {
                        rng = rng.next();
                        if ((rng & 1) == 0) break;
                    }
                    actionOrder[j] = prev;
                    unchecked { j--; }
                }
                actionOrder[j] = key;
                unchecked { i++; }
            }
        }

        uint8 aliveCount = PLAYERS_PER_MATCH;
        uint8 ringRadius = RING_START_RADIUS;
        bool[8] memory firstBloodFlags;

        // ═══════ Turn loop ═══════
        for (uint8 turn = 1; turn <= MAX_TURNS;) {
            if (aliveCount <= 1) break;

            if (turn % RING_SHRINK_INTERVAL == 0 && ringRadius > 0) {
                unchecked { ringRadius--; }
            }

            uint16 ringDmg = uint16(turn) / RING_DMG_DIVISOR + 1;

            for (uint8 oi = 0; oi < PLAYERS_PER_MATCH;) {
                if (aliveCount <= 1) break;
                uint8 idx = actionOrder[oi];
                if (!ents[idx].isAlive()) { unchecked { oi++; } continue; }

                // Ring damage
                ents[idx] = _applyRingDamage(ents[idx], ringDmg, ringRadius, turn);
                if (!ents[idx].isAlive()) {
                    unchecked { aliveCount--; oi++; }
                    continue;
                }

                // Cooldown tick
                if (ents[idx].getBlinkCd() > 0) {
                    ents[idx] = ents[idx].setBlinkCd(ents[idx].getBlinkCd() - 1);
                }

                // Entity action (extracted to reduce stack depth)
                uint16 newbuff;
                bool killed;
                (ents, newbuff, killed, firstBloodFlags) = _processEntityAction(
                    idx, ents, scripts[idx], turn, aliveCount, ringRadius, firstBloodFlags
                );
                if (killed) aliveCount--;

                // Clear status: keep only this turn's new buff
                ents[idx] = ents[idx].setStatusFlags(newbuff);

                unchecked { oi++; }
            }
            unchecked { turn++; }
        }

        rankings = _buildRankings(ents, firstBloodFlags);
        replayHash = keccak256(abi.encodePacked(ents[0], ents[1], ents[2], ents[3], ents[4], ents[5], ents[6], ents[7]));
    }

    // ═══════════════════════════════════════════════════
    //  Ring damage
    // ═══════════════════════════════════════════════════

    function _applyRingDamage(uint256 ent, uint16 ringDmg, uint8 ringRadius, uint8 turn) private pure returns (uint256) {
        int8 ex = ent.getX();
        int8 ey = ent.getY();
        int16 ax = ex < 0 ? -int16(ex) : int16(ex);
        int16 ay = ey < 0 ? -int16(ey) : int16(ey);
        int16 chebyshev = ax > ay ? ax : ay;
        if (chebyshev > int16(uint16(ringRadius))) {
            int16 hp = ent.getCurrentHp() - int16(ringDmg);
            ent = ent.setCurrentHp(hp);
            if (hp <= 0) {
                ent = ent.setAlive(0);
                ent = ent.setDeathTurn(turn);
            }
        }
        return ent;
    }

    // ═══════════════════════════════════════════════════
    //  Entity action processing (extracted from main loop)
    // ═══════════════════════════════════════════════════

    function _processEntityAction(
        uint8 idx,
        uint256[8] memory ents,
        bytes memory script,
        uint8 turn,
        uint8 aliveCount,
        uint8 ringRadius,
        bool[8] memory firstBloodFlags
    ) private pure returns (uint256[8] memory, uint16 newbuff, bool killed, bool[8] memory) {
        uint256 ent = ents[idx];
        uint16 sf = ent.getStatusFlags();

        // Stun = forced idle
        if ((sf & STATUS_STUN) == STATUS_STUN) {
            ent = ent.setLastAction(ACTION_IDLE);
            ents[idx] = ent;
            return (ents, 0, false, firstBloodFlags);
        }

        // Execute AI script
        ScriptLib.ScriptResult memory sr = ScriptLib.executeScript(idx, ents, script, turn, aliveCount, ringRadius);
        ent = ent.setLastAction(sr.action);
        ent = ent.setLastBlockedBy(NO_TARGET);

        if (sr.action == ACTION_IDLE) {
            if (ent.getExposure() > 0) ent = ent.setExposure(ent.getExposure() - 1);
            ents[idx] = ent;
        } else if (sr.action == ACTION_DEFEND) {
            ent = ent.setExposure(0);
            uint16 maxHp = uint16(ent.getHp());
            uint16 healAmt = maxHp * DEFEND_HEAL_PCT / 100;
            if (healAmt < 1) healAmt = 1;
            int16 healed = ent.getCurrentHp() + int16(healAmt);
            if (healed > int16(maxHp)) healed = int16(maxHp);
            ent = ent.setCurrentHp(healed);
            ents[idx] = ent;
        } else if (sr.action == ACTION_ATTACK) {
            if ((sf & STATUS_DISARM) != 0) {
                ent = ent.setLastAction(ACTION_IDLE);
                ents[idx] = ent;
            } else {
                ents[idx] = ent;
                (ents, newbuff, killed, firstBloodFlags) = _processAttack(idx, sr.targetIdx, ents, sf, turn, firstBloodFlags);
            }
        } else if (sr.action == ACTION_MOVE) {
            if (ent.getExposure() > 0) ent = ent.setExposure(ent.getExposure() - 1);
            if ((sf & STATUS_IMMOBILIZE) != 0) {
                ent = ent.setLastAction(ACTION_IDLE);
            } else {
                ents[idx] = ent;
                ent = _executeMove(idx, sr.targetIdx, sr.actionArg, ents);
            }
            ents[idx] = ent;
        } else if (sr.action == ACTION_BLINK) {
            if (ent.getExposure() > 0) ent = ent.setExposure(ent.getExposure() - 1);
            if ((sf & STATUS_IMMOBILIZE) != 0) {
                ent = ent.setLastAction(ACTION_IDLE);
            } else if (ent.getBlinkCd() > 0) {
                ent = ent.setLastAction(ACTION_IDLE);
            } else {
                ents[idx] = ent;
                ent = _executeBlink(idx, sr.targetIdx, sr.actionArg, ents);
                ent = ent.setBlinkCd(BLINK_COOLDOWN);
            }
            ents[idx] = ent;
        }

        return (ents, newbuff, killed, firstBloodFlags);
    }

    // ═══════════════════════════════════════════════════
    //  Attack processing
    // ═══════════════════════════════════════════════════

    function _processAttack(
        uint8 atkIdx,
        uint8 tgtIdx,
        uint256[8] memory ents,
        uint16 statusFlags,
        uint8 turn,
        bool[8] memory firstBloodFlags
    ) private pure returns (uint256[8] memory, uint16 newbuff, bool killed, bool[8] memory) {
        uint256 ent = ents[atkIdx];

        // Exposure increase
        uint8 exp_ = ent.getExposure();
        ent = ent.setExposure(exp_ < EXPOSURE_MAX ? exp_ + 1 : EXPOSURE_MAX);
        // Clear stealth on attack
        ent = ent.setStatusFlags(ent.getStatusFlags() & ~STATUS_STEALTH);

        // Skill or normal attack
        uint8 mana = ent.getMana();
        uint8 manaMax = ent.getManaMax();
        if (mana >= manaMax && manaMax > 0 && ((statusFlags & STATUS_SILENCE) == 0)) {
            // Mana full → cast skill, reset mana
            ent = ent.setMana(0);
            ents[atkIdx] = ent;
            (newbuff, ents) = _executeSkill(atkIdx, tgtIdx, ents, turn, 0, false);
        } else {
            // Normal attack, then charge mana
            if (mana < manaMax) mana++;
            ent = ent.setMana(mana);
            ents[atkIdx] = ent;
            if (tgtIdx < PLAYERS_PER_MATCH && ents[tgtIdx].isAlive()) {
                if (EntityLib.manhattan(ent, ents[tgtIdx]) <= uint16(ent.getAtkRange()) + uint16(ents[tgtIdx].getExposure())) {
                    ents = _normalAttack(atkIdx, tgtIdx, ents, turn, 0, false);
                }
            }
        }

        // Check for kills
        killed = false;
        if (tgtIdx < PLAYERS_PER_MATCH && !ents[tgtIdx].isAlive()) {
            killed = true;
            if (!firstBloodFlags[atkIdx]) {
                // Check if this is the first kill of the match
                bool anyPrevKill = false;
                for (uint8 i; i < PLAYERS_PER_MATCH; i++) {
                    if (firstBloodFlags[i]) { anyPrevKill = true; break; }
                }
                if (!anyPrevKill) firstBloodFlags[atkIdx] = true;
            }
        }
        // Check if attacker died (thorns)
        if (!ents[atkIdx].isAlive()) killed = true;

        return (ents, newbuff, killed, firstBloodFlags);
    }

    // ═══════════════════════════════════════════════════
    //  Skill execution
    // ═══════════════════════════════════════════════════

    function _executeSkill(
        uint8 atkIdx,
        uint8 tgtIdx,
        uint256[8] memory ents,
        uint8 turn,
        uint8 /*aliveCount*/,
        bool /*firstBloodClaimed*/
    ) private pure returns (uint16 newbuff, uint256[8] memory) {
        uint256 atk = ents[atkIdx];
        if (tgtIdx >= PLAYERS_PER_MATCH || !ents[tgtIdx].isAlive()) {
            return (0, ents);
        }
        uint256 tgt = ents[tgtIdx];
        // Range check: same as visibility (atkRange + target exposure)
        if (EntityLib.manhattan(atk, tgt) > uint16(atk.getAtkRange()) + uint16(tgt.getExposure())) {
            return (0, ents);
        }

        uint16 effect = atk.getSkillEffect();
        uint8 sp = atk.getSkillPower();

        // Skill damage = ATK * (100 + bonus + exposure * EXPOSURE_DMG_PCT) / 100
        uint16 bonus = uint16(sp) * SKILL_RATIO;

        if ((effect & SKILL_CRITICAL) != 0) {
            bonus += uint16(sp) * SKILL_RATIO_CRITICAL;
        }
        if ((effect & SKILL_MANA_BURN) != 0) {
            uint8 tgtMana = tgt.getMana();
            uint8 burned = tgtMana < sp ? tgtMana : sp;
            tgt = tgt.setMana(tgtMana - burned);
            bonus += uint16(burned) * SKILL_RATIO_MANA_BURN;
        }
        if ((effect & SKILL_VIGOR) != 0) {
            uint8 maxHp = atk.getHp();
            if (maxHp > 0) {
                int16 curHp = atk.getCurrentHp();
                if (curHp > 0) {
                    bonus += uint16(curHp) * uint16(sp) * SKILL_RATIO_VIGOR / uint16(maxHp);
                }
            }
        }
        if ((effect & SKILL_EXECUTE) != 0) {
            uint8 tgtMaxHp = tgt.getHp();
            if (tgtMaxHp > 0) {
                int16 tgtCurHp = tgt.getCurrentHp();
                int16 missing = int16(uint16(tgtMaxHp)) - tgtCurHp;
                if (missing > 0) {
                    bonus += uint16(missing) * uint16(sp) * SKILL_RATIO_EXECUTE / uint16(tgtMaxHp);
                }
            }
        }

        uint16 rawDmg = uint16(atk.getAtk()) * (100 + bonus + uint16(tgt.getExposure()) * EXPOSURE_DMG_PCT) / 100;

        // Defend reduction
        if (tgt.getLastAction() == ACTION_DEFEND) {
            rawDmg = rawDmg * (100 - DEFEND_REDUCE_PCT) / 100;
        }
        // 距离衰减：每远1格减 RANGE_DECAY_PCT%，最低伤害=1
        {
            uint16 dist = uint16(EntityLib.manhattan(atk, tgt));
            if (dist > 1) {
                uint16 decay = (dist - 1) * RANGE_DECAY_PCT;
                rawDmg = decay >= 100 ? 0 : rawDmg * (100 - decay) / 100;
            }
        }
        if (rawDmg < 1) rawDmg = 1;

        // Apply damage
        ents[tgtIdx] = tgt;
        ents[atkIdx] = atk;
        ents = _applyDamage(tgtIdx, atkIdx, int16(uint16(rawDmg)), ents, turn);
        atk = ents[atkIdx];
        tgt = ents[tgtIdx];

        // Debuff on target
        uint16 tgtFlags = tgt.getStatusFlags();
        tgtFlags |= (effect & SKILL_DEBUFF_MASK);
        tgt = tgt.setStatusFlags(tgtFlags);

        // Lifesteal
        if ((effect & SKILL_LIFESTEAL) != 0) {
            int16 heal = atk.getCurrentHp() + int16(uint16(rawDmg * uint16(sp) * SKILL_RATIO_LIFESTEAL / 100));
            int16 cap = int16(uint16(atk.getHp()));
            if (heal > cap) heal = cap;
            atk = atk.setCurrentHp(heal);
        }

        // Buff
        newbuff = effect & SKILL_BUFF_MASK;
        uint16 atkFlags = atk.getStatusFlags();
        atkFlags |= newbuff;
        atk = atk.setStatusFlags(atkFlags);

        // Cleanse
        if ((effect & SKILL_CLEANSE) != 0) {
            atkFlags &= STATUS_BUFF_MASK;
            atk = atk.setStatusFlags(atkFlags);
        }

        // Haste
        if ((effect & SKILL_HASTE) != 0) {
            atk = atk.setBlinkCd(0);
        }

        ents[atkIdx] = atk;
        ents[tgtIdx] = tgt;
        return (newbuff, ents);
    }

    // ═══════════════════════════════════════════════════
    //  Normal attack
    // ═══════════════════════════════════════════════════

    function _normalAttack(
        uint8 atkIdx,
        uint8 tgtIdx,
        uint256[8] memory ents,
        uint8 turn,
        uint8 /*aliveCount*/,
        bool /*firstBloodClaimed*/
    ) private pure returns (uint256[8] memory) {
        uint256 atk = ents[atkIdx];
        uint256 tgt = ents[tgtIdx];

        // calcDamage
        uint16 dmg = uint16(atk.getAtk()) * (100 + uint16(tgt.getExposure()) * EXPOSURE_DMG_PCT) / 100;
        if (tgt.getLastAction() == ACTION_DEFEND) {
            dmg = dmg * (100 - DEFEND_REDUCE_PCT) / 100;
        }
        // 距离衰减：每远1格减 RANGE_DECAY_PCT%，最低伤害=1
        uint16 dist = uint16(EntityLib.manhattan(atk, tgt));
        if (dist > 1) {
            uint16 decay = (dist - 1) * RANGE_DECAY_PCT;
            dmg = decay >= 100 ? 0 : dmg * (100 - decay) / 100;
        }
        if (dmg < 1) dmg = 1;

        return _applyDamage(tgtIdx, atkIdx, int16(uint16(dmg)), ents, turn);
    }

    // ═══════════════════════════════════════════════════
    //  Damage application
    // ═══════════════════════════════════════════════════

    function _applyDamage(
        uint8 tgtIdx,
        uint8 atkIdx,
        int16 dmg,
        uint256[8] memory ents,
        uint8 turn
    ) private pure returns (uint256[8] memory) {
        uint256 tgt = ents[tgtIdx];
        uint256 atk = ents[atkIdx];

        // Attacker exposure reduces outgoing damage
        uint8 atkExposure = atk.getExposure();
        if (atkExposure > 0) {
            dmg = dmg * int16(uint16(100 - uint16(atkExposure) * EXPOSURE_ATK_PCT)) / 100;
            if (dmg < 1) dmg = 1;
        }

        // Deal damage
        int16 newHp = tgt.getCurrentHp() - dmg;
        tgt = tgt.setCurrentHp(newHp);
        tgt = tgt.setLastAtkIdx(atkIdx);
        atk = atk.setLastTgtIdx(tgtIdx);

        // Attacker gains exp
        uint16 atkExp = atk.getExp() + ATTACK_EXP;
        atk = atk.setExp(atkExp);

        if (newHp <= 0) {
            // Target dies
            tgt = tgt.setAlive(0);
            tgt = tgt.setDeathTurn(turn);

            // Kill rewards — max exposure as cost
            atk = atk.setKills(atk.getKills() + 1);
            atk = atk.setExposure(EXPOSURE_MAX);
            uint16 killExp = tgt.getExp() * KILL_EXP_PCT / 100;
            if (killExp < KILL_EXP_MIN) killExp = KILL_EXP_MIN;
            atkExp += killExp;
            atk = atk.setExp(atkExp);

            // Kill heal
            uint8 atkMaxHp = atk.getHp();
            int16 curHp = atk.getCurrentHp();
            int16 missingHp = int16(uint16(atkMaxHp)) - curHp;
            if (missingHp > 0) {
                int16 heal = missingHp * int16(int8(int16(uint16(KILL_HEAL_PCT)))) / 100;
                curHp += heal;
                if (curHp > int16(uint16(atkMaxHp))) curHp = int16(uint16(atkMaxHp));
                atk = atk.setCurrentHp(curHp);
            }
        } else {
            // Thorns reflection
            if ((tgt.getStatusFlags() & STATUS_THORNS) != 0) {
                int16 reflect = dmg * int16(uint16(tgt.getSkillPower())) * int16(int8(int16(uint16(SKILL_RATIO_THORNS)))) / 100;
                int16 atkHp = atk.getCurrentHp() - reflect;
                atk = atk.setCurrentHp(atkHp);
                if (atkHp <= 0) {
                    atk = atk.setAlive(0);
                    atk = atk.setDeathTurn(turn);
                    ents[tgtIdx] = tgt;
                    ents[atkIdx] = atk;
                    return ents;
                }
            }
        }

        // Level up check
        atk = _checkLevelUp(atk);

        ents[tgtIdx] = tgt;
        ents[atkIdx] = atk;
        return ents;
    }

    // ═══════════════════════════════════════════════════
    //  Level up
    // ═══════════════════════════════════════════════════

    function _checkLevelUp(uint256 ent) private pure returns (uint256) {
        uint8 oldLevel = ent.getLevel();
        uint8 newLevel = _calcLevel(ent.getExp());
        if (newLevel <= oldLevel) return ent;

        ent = ent.setLevel(newLevel);
        uint16 bonus = uint16(newLevel - oldLevel) * POINTS_PER_LEVEL;
        uint8 hp = ent.getHp();
        uint8 a = ent.getAtk();
        uint16 total = uint16(hp) + uint16(a);
        uint16 hpGain = bonus * uint16(hp) / total;
        uint16 atkGain = bonus - hpGain;

        // Apply gains (capped at uint8 max via truncation, unlikely to overflow)
        uint8 newHp = hp + uint8(hpGain);
        uint8 newAtk = a + uint8(atkGain);
        ent = ent.setHp(newHp);
        ent = ent.setAtk(newAtk);
        // Full heal on level up
        ent = ent.setCurrentHp(int16(uint16(newHp)));
        return ent;
    }

    function _calcLevel(uint16 exp) private pure returns (uint8) {
        uint8 level = 0;
        uint16 threshold = EXP_PER_LEVEL;
        uint16 remaining = exp;
        while (remaining >= threshold) {
            remaining -= threshold;
            level++;
            threshold += EXP_LEVEL_STEP;
        }
        return level;
    }

    // ═══════════════════════════════════════════════════
    //  Movement
    // ═══════════════════════════════════════════════════

    function _executeMove(
        uint8 selfIdx,
        uint8 targetIdx,
        uint8 actionArg,
        uint256[8] memory ents
    ) private pure returns (uint256) {
        uint256 ent = ents[selfIdx];
        int8 nx;
        int8 ny;

        if (actionArg == MOVE_TOWARD && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].isAlive()) {
            (nx, ny) = _stepToward(ent, ents[targetIdx]);
        } else if (actionArg == MOVE_AWAY && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].isAlive()) {
            (nx, ny) = _stepAway(ent, ents[targetIdx]);
        } else {
            (nx, ny) = _stepDirection(ent, actionArg);
        }

        (nx, ny) = _clampToMap(nx, ny);
        uint8 occ = _findOccupant(nx, ny, selfIdx, ents);
        if (occ == NO_TARGET) {
            ent = ent.setX(nx);
            ent = ent.setY(ny);
        } else {
            ent = ent.setLastBlockedBy(occ);
        }
        return ent;
    }

    function _stepToward(uint256 a, uint256 b) private pure returns (int8 nx, int8 ny) {
        int8 ax = a.getX(); int8 ay = a.getY();
        int8 bx = b.getX(); int8 by = b.getY();
        int8 dx = bx > ax ? int8(1) : (bx < ax ? int8(-1) : int8(0));
        int8 dy = by > ay ? int8(1) : (by < ay ? int8(-1) : int8(0));
        // Move on the axis with greater distance
        int16 adx = int16(bx) - int16(ax); if (adx < 0) adx = -adx;
        int16 ady = int16(by) - int16(ay); if (ady < 0) ady = -ady;
        if (adx >= ady) {
            nx = ax + dx; ny = ay;
        } else {
            nx = ax; ny = ay + dy;
        }
    }

    function _stepAway(uint256 a, uint256 b) private pure returns (int8 nx, int8 ny) {
        int8 ax = a.getX(); int8 ay = a.getY();
        int8 bx = b.getX(); int8 by = b.getY();
        int8 dx = bx > ax ? int8(-1) : (bx < ax ? int8(1) : int8(0));
        int8 dy = by > ay ? int8(-1) : (by < ay ? int8(1) : int8(0));
        int16 adx = int16(bx) - int16(ax); if (adx < 0) adx = -adx;
        int16 ady = int16(by) - int16(ay); if (ady < 0) ady = -ady;
        if (adx >= ady) {
            nx = ax + dx; ny = ay;
        } else {
            nx = ax; ny = ay + dy;
        }
    }

    function _stepDirection(uint256 ent, uint8 dir) private pure returns (int8 nx, int8 ny) {
        int8 x = ent.getX();
        int8 y = ent.getY();
        if (dir == DIR_UP) { nx = x; ny = y + 1; }
        else if (dir == DIR_DOWN) { nx = x; ny = y - 1; }
        else if (dir == DIR_LEFT) { nx = x - 1; ny = y; }
        else if (dir == DIR_RIGHT) { nx = x + 1; ny = y; }
        else if (dir == DIR_CENTER) {
            // Step toward (0,0)
            int8 dx = x > 0 ? int8(-1) : (x < 0 ? int8(1) : int8(0));
            int8 dy = y > 0 ? int8(-1) : (y < 0 ? int8(1) : int8(0));
            int16 adx = x < 0 ? -int16(x) : int16(x);
            int16 ady = y < 0 ? -int16(y) : int16(y);
            if (adx >= ady) { nx = x + dx; ny = y; }
            else { nx = x; ny = y + dy; }
        } else {
            nx = x; ny = y;
        }
    }

    // ═══════════════════════════════════════════════════
    //  Blink (Bresenham pathfinding)
    // ═══════════════════════════════════════════════════

    function _executeBlink(
        uint8 selfIdx,
        uint8 targetIdx,
        uint8 actionArg,
        uint256[8] memory ents
    ) private pure returns (uint256) {
        uint256 ent = ents[selfIdx];
        int8 destX;
        int8 destY;

        if (actionArg == MOVE_TOWARD && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].isAlive()) {
            (destX, destY) = _posToward(ent, ents[targetIdx], BLINK_RANGE);
        } else if (actionArg == MOVE_AWAY && targetIdx < PLAYERS_PER_MATCH && ents[targetIdx].isAlive()) {
            (destX, destY) = _posAway(ent, ents[targetIdx], BLINK_RANGE);
        } else {
            (destX, destY) = _posDirection(ent, actionArg, BLINK_RANGE);
        }

        (destX, destY) = _clampToMap(destX, destY);

        // Bresenham line from ent to dest, find farthest unoccupied cell
        int8 ox = ent.getX();
        int8 oy = ent.getY();

        // Collect path cells via Bresenham
        int16 dx = int16(destX) - int16(ox);
        int16 dy = int16(destY) - int16(oy);
        int16 adx = dx < 0 ? -dx : dx;
        int16 ady = dy < 0 ? -dy : dy;
        int8 sx = dx > 0 ? int8(1) : (dx < 0 ? int8(-1) : int8(0));
        int8 sy = dy > 0 ? int8(1) : (dy < 0 ? int8(-1) : int8(0));

        // Max path length = BLINK_RANGE * 2 + 1 (diagonal), but practically small
        int8[16] memory pathX;
        int8[16] memory pathY;
        uint8 pathLen = 0;

        int8 cx = ox;
        int8 cy = oy;
        int16 err = adx - ady;

        // Bresenham loop
        for (uint8 step = 0; step < 16;) {
            // Skip the starting cell
            if (cx != ox || cy != oy) {
                pathX[pathLen] = cx;
                pathY[pathLen] = cy;
                pathLen++;
            }
            if (cx == destX && cy == destY) break;

            int16 e2 = err * 2;
            if (e2 > -ady) {
                err -= ady;
                cx += sx;
            }
            if (e2 < adx) {
                err += adx;
                cy += sy;
            }
            unchecked { step++; }
        }

        // From farthest to nearest, find first unoccupied
        for (uint8 i = pathLen; i > 0;) {
            unchecked { i--; }
            int8 px = pathX[i];
            int8 py = pathY[i];
            if (!_isOccupied(px, py, selfIdx, ents)) {
                ent = ent.setX(px);
                ent = ent.setY(py);
                return ent;
            }
        }
        // All occupied — record blocker at destination
        if (pathLen > 0) {
            uint8 blocker = _findOccupant(pathX[pathLen - 1], pathY[pathLen - 1], selfIdx, ents);
            ent = ent.setLastBlockedBy(blocker);
        }
        return ent;
    }

    function _posToward(uint256 a, uint256 b, uint8 range) private pure returns (int8, int8) {
        int8 ax = a.getX(); int8 ay = a.getY();
        int8 bx = b.getX(); int8 by = b.getY();
        int16 dx = int16(bx) - int16(ax);
        int16 dy = int16(by) - int16(ay);
        int16 adx = dx < 0 ? -dx : dx;
        int16 ady = dy < 0 ? -dy : dy;
        int16 dist = adx + ady;
        if (dist == 0) return (ax, ay);
        if (dist <= int16(uint16(range))) return (bx, by);
        // Scale down to range
        int8 nx = ax + int8(dx * int16(uint16(range)) / dist);
        int8 ny = ay + int8(dy * int16(uint16(range)) / dist);
        return (nx, ny);
    }

    function _posAway(uint256 a, uint256 b, uint8 range) private pure returns (int8, int8) {
        int8 ax = a.getX(); int8 ay = a.getY();
        int8 bx = b.getX(); int8 by = b.getY();
        int16 dx = int16(ax) - int16(bx);
        int16 dy = int16(ay) - int16(by);
        int16 adx = dx < 0 ? -dx : dx;
        int16 ady = dy < 0 ? -dy : dy;
        int16 dist = adx + ady;
        if (dist == 0) {
            return (ax + int8(int16(uint16(range))), ay);
        }
        int8 nx = ax + int8(dx * int16(uint16(range)) / dist);
        int8 ny = ay + int8(dy * int16(uint16(range)) / dist);
        return (nx, ny);
    }

    function _posDirection(uint256 ent, uint8 dir, uint8 range) private pure returns (int8, int8) {
        int8 x = ent.getX();
        int8 y = ent.getY();
        int8 r = int8(uint8(range));
        if (dir == DIR_UP) return (x, y + r);
        if (dir == DIR_DOWN) return (x, y - r);
        if (dir == DIR_LEFT) return (x - r, y);
        if (dir == DIR_RIGHT) return (x + r, y);
        if (dir == DIR_CENTER) {
            // Toward (0,0) by range steps
            int16 dx = -int16(x);
            int16 dy = -int16(y);
            int16 adx = dx < 0 ? -dx : dx;
            int16 ady = dy < 0 ? -dy : dy;
            int16 dist = adx + ady;
            if (dist == 0) return (x, y);
            if (dist <= int16(uint16(range))) return (int8(0), int8(0));
            return (x + int8(dx * int16(uint16(range)) / dist), y + int8(dy * int16(uint16(range)) / dist));
        }
        return (x, y);
    }

    // ═══════════════════════════════════════════════════
    //  Utility functions
    // ═══════════════════════════════════════════════════

    function _clampToMap(int8 x, int8 y) private pure returns (int8, int8) {
        if (x > MAP_HALF) x = MAP_HALF;
        else if (x < -MAP_HALF) x = -MAP_HALF;
        if (y > MAP_HALF) y = MAP_HALF;
        else if (y < -MAP_HALF) y = -MAP_HALF;
        return (x, y);
    }

    function _isOccupied(int8 x, int8 y, uint8 excludeIdx, uint256[8] memory ents) private pure returns (bool) {
        for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
            if (i != excludeIdx && ents[i].isAlive() && ents[i].getX() == x && ents[i].getY() == y) {
                return true;
            }
            unchecked { i++; }
        }
        return false;
    }

    function _findOccupant(int8 x, int8 y, uint8 excludeIdx, uint256[8] memory ents) private pure returns (uint8) {
        for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
            if (i != excludeIdx && ents[i].isAlive() && ents[i].getX() == x && ents[i].getY() == y) {
                return i;
            }
            unchecked { i++; }
        }
        return NO_TARGET;
    }


    // ═══════════════════════════════════════════════════
    //  Rankings
    // ═══════════════════════════════════════════════════

    function _buildRankings(
        uint256[8] memory ents,
        bool[8] memory firstBloodFlags
    ) private pure returns (RankingEntry[8] memory rankings) {
        // Build index array
        uint8[8] memory order;
        for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
            order[i] = i;
            unchecked { i++; }
        }

        // Sort: alive DESC, deathTurn DESC, exp DESC (insertion sort)
        for (uint8 i = 1; i < PLAYERS_PER_MATCH;) {
            uint8 key = order[i];
            uint256 ke = ents[key];
            uint8 j = i;
            while (j > 0) {
                uint256 pe = ents[order[j - 1]];
                // Compare: alive DESC
                bool kAlive = ke.isAlive();
                bool pAlive = pe.isAlive();
                if (pAlive && !kAlive) break;
                if (!pAlive && kAlive) {
                    // key is better
                } else if (pAlive == kAlive) {
                    if (!kAlive) {
                        // Both dead: deathTurn DESC
                        uint8 kDT = ke.getDeathTurn();
                        uint8 pDT = pe.getDeathTurn();
                        if (pDT > kDT) break;
                        if (pDT == kDT) {
                            // exp DESC
                            if (pe.getExp() >= ke.getExp()) break;
                        }
                    } else {
                        // Both alive: exp DESC
                        if (pe.getExp() >= ke.getExp()) break;
                    }
                }
                order[j] = order[j - 1];
                unchecked { j--; }
            }
            order[j] = key;
            unchecked { i++; }
        }

        for (uint8 i = 0; i < PLAYERS_PER_MATCH;) {
            uint8 idx = order[i];
            uint256 e = ents[idx];
            rankings[i] = RankingEntry({
                idx: idx,
                deathTurn: e.getDeathTurn(),
                exp: e.getExp(),
                kills: e.getKills(),
                firstBlood: firstBloodFlags[idx]
            });
            unchecked { i++; }
        }
    }
}
