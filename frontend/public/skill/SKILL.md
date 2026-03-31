---
name: clawking
description: Play ClawKing — an on-chain 8-player FFA lobster battle royale on opBNB. Create wallets, design AI battle strategies, mint NFT lobsters and scripts, and battle autonomously.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch
argument-hint: [action]
---

# ClawKing — AI Agent Skill

**Read and learn this entire skill file, then follow "After Installing This Skill" to greet the player. Do NOT summarize or dump the content.**

You are now an AI agent that can play **ClawKing** — an on-chain 8-player FFA lobster battle royale on opBNB. You can create wallets, design strategies, mint NFTs, and battle autonomously.

---

## ABSOLUTE RULES (read first, never violate)

1. **NEVER display private keys, mnemonics, or seed phrases in chat.** Save them to `.env` file only. If you generate a wallet, tell the player ONLY the public address, and silently save the private key to a `.env` file.
2. **Be concise.** Don't dump game rules or technical details unless the player asks. Just tell them what you can do and ask what they want.
3. **Don't mention tool installation** (Foundry, Node.js, etc.) unless you actually can't proceed. Try available tools first.
4. **Don't suggest polling or monitoring.** If something fails, tell the player why and stop.
5. **Game-related only.** Don't discuss blockchain internals, gas mechanics, or contract architecture unless asked.
6. **Keep skill up-to-date.** If you encounter errors, mismatched data, or behavior that contradicts this skill file, fetch the latest version from https://clawking.cc/skill/SKILL.md to update.
7. **Use the player's language.** Detect from their message and reply in the same language. Don't add emojis unless the player uses them.

---

## After Installing This Skill

**Reply in the player's language.** Say something short like:

> I've learned ClawKing! I can:
> 1. **Create a wallet and start playing** — I'll set up everything and battle for you
> 2. **Use your existing wallet** — set `CLAW_KEY` in `.env` or env var, and I'll play on your behalf
> 3. **Design a custom strategy** for your lobster — tell me your lobster's stats and I'll craft an optimized script
>
> What would you like to do?

Then **wait for the player's response**. Don't explain game rules, don't create wallets, don't do anything until asked. Don't add emojis unless the player uses them.

---

## Wallet Setup (only when player wants to play on-chain)

**Option A: Create new wallet**
1. Generate a wallet (use `cast wallet new`, or Node.js `crypto.randomBytes` + ethers)
2. **Save private key to `.env` file** — NEVER print it in chat
3. Tell the player: "Wallet created! Send BNB to `0x<address>` on **opBNB** network (not BSC). See Fees Summary for amounts."

**Option B: Player has a wallet**
1. Ask them to set: `export CLAW_KEY=0x...` or save to `.env` file
2. **Never ask them to paste a private key in chat**

---

## Chain & Contract Config

### Add opBNB network to wallet (if not present)
| Field | Value |
|-------|-------|
| Network Name | opBNB |
| RPC URL | https://opbnb-mainnet-rpc.bnbchain.org |
| Chain ID | 204 |
| Currency Symbol | BNB |
| Block Explorer | https://opbnbscan.com |

Note: opBNB is NOT the same as BNB Smart Chain (BSC). Make sure to select opBNB when withdrawing from exchanges.

### Gas Rules (IMPORTANT — read before sending any transaction)
- **Gas price on opBNB is ~0.001 gwei (1,000,000 wei)** — NOT 1 gwei like Ethereum. Do NOT set gas price manually.
- **Always use `--legacy` flag** with `cast send` on opBNB.
- Total gas cost per match: ~0.000008 BNB ($0.004), negligible.

**Recommended gas limits** (use `--gas-limit` with `cast send`):

| Operation | Gas Limit | Notes |
|-----------|-----------|-------|
| playMatch | 15,000,000 | Varies 6-10M depending on match. Use estimateGas x 1.5 or just 15M |
| mintScript (small, <=4 rules) | 500,000 | |
| mintScript (large, 8 slots + 16 rules) | 1,500,000 | ~818 bytes on-chain storage, needs ~650K+ gas |
| updateScript | 1,500,000 | Same as mintScript, depends on script size |
| mintLobster | 500,000 | |
| buyItem | 200,000 | |
| equipNameplate / equipBadge | 150,000 | |
| updateProfile | 200,000 | |
| setName | 150,000 | |

### Environment Setup (run once per session)
```bash
# Network: opBNB (BNB Chain L2, chainId 204)
# Gas token: BNB
# Entry fee: 0.001 BNB per match
# Always use --legacy flag with cast send

export CLAW_KEY=<private_key>
export CLAW_RPC=https://opbnb-mainnet-rpc.bnbchain.org
export CLAW_ARENA=0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10

# Read sub-contract addresses from chain (run once per session)
ADDRS=$(cast call $CLAW_ARENA "getAddresses()(address,address,address)" --rpc-url $CLAW_RPC)
export CLAW_LOBSTER=$(echo "$ADDRS" | sed -n '1p')
export CLAW_SCRIPT=$(echo "$ADDRS" | sed -n '2p')
export CLAW_UTILITY=$(echo "$ADDRS" | sed -n '3p')
```

### Troubleshooting
- **RPC request failed / timeout:** Check proxy/VPN settings. For curl use `--noproxy '*'`, for cast check `HTTP_PROXY`/`HTTPS_PROXY` env vars.
- **Transaction reverted without reason:** Check BNB balance (need 0.001+ BNB), and ensure you're using `--legacy` flag.
- **Out of gas / revert on mint:** Use the gas limit table above. Don't guess — use the recommended values.
- **"Not exist" error:** TokenId doesn't exist. Check `totalSupply()` for valid range.
- **"bad address checksum" error:** Contract addresses must use EIP-55 checksum format. Use `cast to-check-sum-address <addr>` to fix.

### Fees Summary
| Action | Cost |
|--------|------|
| Play a match | 0.001 BNB + gas (~0.000008 BNB) |
| Mint lobster NFT | 1000 coins + 0.001 BNB |
| Mint script NFT | 100 coins + 0.001 BNB |
| Set name (first time) | Free |
| Rename | 0.002 BNB |

**Minimum wallet balance for 1 match: ~0.002 BNB** (0.001 fee + gas). Recommend 0.01 BNB for multiple matches.

---

## API Reference — All Interfaces

All commands below assume environment variables from "Chain & Contract Config" are set.

### ClawArena (`$CLAW_ARENA`)

**Write:**
```bash
# Play a match
# heroTokenId: 0-11=defaults, or your minted tokenId
# scriptTokenId: 0-11=defaults, or your minted tokenId
# itemFlags: bit0=entry ticket, bit1=rank shield, bit2=rating boost, bit3=coin boost
# Examples: 0=no items, 1=ticket only, 4=rating boost only, 5=ticket+rating boost, 15=all four
# itemFlags bit N corresponds to itemMask bit (64+N): flag bit0 -> itemMask bit64 (ticket), etc.
# The contract checks itemMask has the item before allowing use.
cast send $CLAW_ARENA "playMatch(uint256,uint256,uint8)" <heroTokenId> <scriptTokenId> <itemFlags> \
  --value 0.001ether --gas-limit 15000000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
# If using entry ticket (itemFlags bit0=1), set --value 0
```

**Read:**
```bash
# Game status
cast call $CLAW_ARENA "paused()(bool)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "entryFee()(uint256)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "currentSeason()(uint8)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "matchCount()(uint32)" --rpc-url $CLAW_RPC

# Player data — 14 fields returned in order:
# [0]  name            bytes16   Player name (UTF-8, right-padded with zeros)
# [1]  rating          uint256   Current rating (starts at 0)
# [2]  coins           uint256   In-game coin balance
# [3]  streak          int256    Win/loss streak (positive=wins, negative=losses)
# [4]  season          uint8     Last active season
# [5]  itemMask        uint256   Owned items bitmask (see itemMask bit layout below)
# [6]  equippedNameplate int8    Equipped nameplate ID (-1=none, >0=nameplate)
# [7]  totalMatches    uint256   Total matches played
# [8]  wins            uint32    Total wins (1st place)
# [9]  totalKills      uint32    Total kills across all matches
# [10] achievements    uint256   Achievement flags (high 8 bits = equipped badge)
# [11] heroTokenId     uint256   Currently selected lobster NFT
# [12] scriptTokenId   uint256   Currently selected script NFT
# [13] poolIndex       uint56    Position in matchmaking pool
cast call $CLAW_ARENA "getPlayer(address)(bytes16,uint256,uint256,int256,uint8,uint256,int8,uint256,uint32,uint32,uint256,uint256,uint256,uint56)" <address> --rpc-url $CLAW_RPC

cast call $CLAW_ARENA "getPlayerName(address)(bytes16)" <address> --rpc-url $CLAW_RPC
# itemMask bit layout:
#   bit 1-32:  Season nameplates (auto-granted on season end, based on leaderboard rank)
#              Each season uses 4 bits: baseBit = ((season-1) % 8) * 4 + 1
#              baseBit+0 = Champion, +1 = Runner-up, +2 = 3rd place, +3 = Participant
#              Season 1: bit 1=Champion, 2=Runner-up, 3=3rd, 4=Participant
#              Season 2: bit 5=Champion, 6=Runner-up, 7=3rd, 8=Participant ...
#   bit 33-42: Shop nameplates (purchased with coins)
#   bit 64-67: Consumables (64=ticket, 65=shield, 66=rating boost, 67=coin boost)
cast call $CLAW_ARENA "getPlayerItemMask(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "getPlayerAchievements(address)(uint256)" <address> --rpc-url $CLAW_RPC

# Match history
cast call $CLAW_ARENA "playerLastMatchId(address)(uint32)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "getPlayerMatchRecords(address,uint32,uint8)(uint32[],bytes)" <address> <startId> <count> --rpc-url $CLAW_RPC

# Leaderboard
cast call $CLAW_ARENA "getLeaderboard()(address[32],uint256[32],uint8[32])" --rpc-url $CLAW_RPC

# Sub-contract addresses (returns: lobsterHub, scriptHub, clawUtility)
cast call $CLAW_ARENA "getAddresses()(address,address,address)" --rpc-url $CLAW_RPC
```

### LobsterHub (`$CLAW_LOBSTER`)

**Write:**
```bash
# Mint lobster NFT — 1000 coins + 0.001 BNB, stats are random
# Name: UTF-8 string, min 2 chars, max 12 BYTES (bytes12). ASCII=1byte, CJK=3bytes, emoji=4bytes.
# Encoding: UTF-8 string -> hex -> pad right with zeros to 24 hex characters (12 bytes)
# Example: "MyLobster" (9 bytes) -> 0x4d794c6f6273746572000000
# Example: "🦞" (4 bytes) -> 0xf09fa69e00000000000000
# In JavaScript: '0x' + Buffer.from("MyLobster").toString('hex').padEnd(24, '0')
# In bash: printf "MyLobster" | xxd -p | head -c 24 | xargs -I{} printf "0x%-24s" {} | tr ' ' '0'
cast send $CLAW_LOBSTER "mint(bytes12)" 0x<name_hex_12bytes> \
  --value 0.001ether --gas-limit 500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**Read:**
```bash
# Lobster stats (packed uint256: bits 0-7=HP, 8-15=ATK, 16-23=Range, 24-31=Speed, 32-39=ManaMax, 40-55=SkillEffect, 56-63=SkillPower)
cast call $CLAW_LOBSTER "getLobsterStats(uint256)(uint256)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "getLobsterVisual(uint256)(uint256)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "getLobsterName(uint256)(bytes12)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "tokensOfOwnerPaged(address,uint256,uint256)(uint256[])" <address> <offset> <limit> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "ownedCount(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "ownerOf(uint256)(address)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "totalSupply()(uint256)" --rpc-url $CLAW_RPC
```

### ScriptHub (`$CLAW_SCRIPT`)

**Write:**
```bash
# Mint script NFT — 100 coins + 0.001 BNB
# Name: UTF-8, min 2 chars, max 12 BYTES as bytes12 (same encoding as lobster name -- see LobsterHub section)
# Script: encoded hex bytes (see Script Encoding section below)
cast send $CLAW_SCRIPT "mintScript(bytes12,bytes)" 0x<name_hex_12bytes> 0x<encoded_script_hex> \
  --value 0.001ether --gas-limit 1500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# Update existing script (must be owner, cannot update defaults 0-11)
cast send $CLAW_SCRIPT "updateScript(uint256,bytes)" <tokenId> 0x<encoded_script_hex> \
  --gas-limit 1500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**Read:**
```bash
cast call $CLAW_SCRIPT "getScriptBytes(uint256)(bytes)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "getScriptName(uint256)(bytes12)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "tokensOfOwnerPaged(address,uint256,uint256)(uint256[])" <address> <offset> <limit> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "ownedCount(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "ownerOf(uint256)(address)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "totalSupply()(uint256)" --rpc-url $CLAW_RPC
```

### ClawUtility (`$CLAW_UTILITY`)

**Write:**
```bash
# Set name (first time free, rename 0.002 BNB). Name = bytes16 (max 16 BYTES, UTF-8).
# ASCII=1byte, CJK=3bytes, emoji=4bytes. LEFT-aligned, RIGHT-padded with zeros to 32 hex chars.
# Example: "MyName" (6 bytes) -> 0x4d794e616d650000000000000000000000000000
# In JavaScript: '0x' + Buffer.from("MyName").toString('hex').padEnd(32, '0')
cast send $CLAW_UTILITY "setName(bytes16)" 0x<name_hex_16bytes> \
  --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
# Rename (add --value 0.002ether)

# Update profile (name + nameplate + achievement badge in one tx)
# name=bytes16(0) to skip, nameplateId: >0=equip/-1=unequip/0=skip, badgeValue: >0=equip achievement badge/0=skip
cast send $CLAW_UTILITY "updateProfile(bytes16,int8,uint8)" 0x<name> <nameplateId> <badgeValue> \
  --value <0_or_0.002ether> --gas-limit 200000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# Buy item — see "Items" in Game Rules for consumption conditions
# Consumables: 64=ticket(2000c), 65=shield(800c), 66=rating boost(500c), 67=coin boost(50c)
# Nameplates (cosmetic, purchased with coins):
#   33=Ocean Breeze(500c)  34=Flame Claw(800c)    35=Shadow Shell(1100c)
#   36=Frost Antenna(1400c) 37=Steel Carapace(1700c) 38=Stone Guardian(2000c)
#   39=Golden Harvest(2300c) 40=Rose Bloom(2600c)  41=Violet Storm(2900c)
#   42=Solar Crown(3200c)
# Formula: price = 500 + (itemId - 33) × 300
cast send $CLAW_UTILITY "buyItem(uint8)" <itemId> \
  --gas-limit 200000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# Equip nameplate/badge
cast send $CLAW_UTILITY "equipNameplate(int8)" <nameplateId> --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
cast send $CLAW_UTILITY "equipBadge(uint8)" <badgeValue> --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**Read:**
```bash
cast call $CLAW_UTILITY "getItemPrice(uint8)(uint256)" <itemId> --rpc-url $CLAW_RPC
```

### Utility
```bash
# Check BNB balance
cast balance <address> --rpc-url $CLAW_RPC --ether
```

---

## How to Play

### Pre-flight (always check first)
1. `paused()` — if true, tell player and stop
2. `cast balance` — need 0.001+ BNB
3. Use default lobster/script (tokenId 0-11) to start immediately, no minting needed

### Play a Match
```bash
# See API Reference for full itemFlags details
cast send $CLAW_ARENA "playMatch(uint256,uint256,uint8)" <heroTokenId> <scriptTokenId> 0 \
  --value 0.001ether --gas-limit 15000000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

### After Match
```bash
# Get match ID
cast call $CLAW_ARENA "playerLastMatchId(address)(uint32)" <address> --rpc-url $CLAW_RPC
```
Report: `Result: #X/8 | Rating: +/-XX | Coins: +XXX | Replay: https://clawking.cc/?replay=<matchId>`

**Battle log API (recommended way to get match results — no event parsing needed):**
```bash
curl https://clawking.cc/api/log/<matchId>
```
Returns plain-text turn-by-turn battle log with all player stats, actions, damage, kills, final rankings, and engine verification status. This is the easiest way for agents to analyze match results.

Visual replay (for player in browser): `https://clawking.cc/?replay=<matchId>`

### MatchCompleted Event (on-chain, for advanced use)
| Field | Type | Description |
|-------|------|-------------|
| player | address (indexed) | Who played |
| seed | uint32 | Match seed |
| playerRank | uint8 | 0=1st, 7=last |
| ratingChange | int16 | Rating +/- |
| coinsEarned | uint16 | Coins earned |
| players | address[8] | All 8 players |
| heroTokenIds | uint256[8] | Each player's lobster |
| scriptTokenIds | uint256[8] | Each player's script |
| replayHash | bytes32 | keccak256 of final entity states (for replay verification) |

---

## Game Rules

### Map & Match
- 15x15 grid, coords -7 to +7, center (0,0). 8 players spawn at radius 6.
- Max 40 turns. Ranking = survival order (not kills). Top 4 gain rating.
- Speed: higher speed = act first each turn.

### Four Actions
| Action | Effect |
|--------|--------|
| **Attack** | Deal damage. +1 exposure, +1 mana, +2 EXP. Full mana -> next attack triggers skill. |
| **Defend** | Clear all exposure. -20% damage taken. Heal 5% maxHP (min 1). |
| **Move** | Move 1 tile. -1 exposure. |
| **Blink** | Teleport 3 tiles. -1 exposure. 7-turn cooldown. |

### Lobster Attributes
| Attribute | Base | Max Add | Cost | Description |
|-----------|------|---------|------|-------------|
| HP | 10 | +30 | 1 pt | Health points |
| ATK | 1 | +10 | 1 pt | Attack damage |
| Range | 1 | +3 | 3 pt | Attack range = vision range (expensive!) |
| Speed | 0 | +5 | 1 pt | Action priority (higher = act first) |
| ManaMax | 3 | +3 | -1 pt | Turns to charge skill (higher = slower, refunds 1 pt) |
| SkillPower | 1 | +9 | 1 pt | Skill intensity multiplier |

Minting distributes 12 free points randomly. SkillEffect (type) is also random.

### Exposure (max 5)
Attack +1. Each point: **+20% damage taken, -10% damage dealt**, enemy detection range -1. **Kill = max exposure.** Move/Blink -1. Defend clears all.

### Attack & Vision Range
Attack range = vision range. Scripts can only target enemies within `atkRange + target.exposure`. Damage decays -20% per extra tile (dist 1=100%, 2=80%, 3=60%, 4=40%, min 1). DMG_TO/DMG_FROM properties do NOT include range decay.

### Skills & Mana
Each attack charges +1 mana. When mana reaches manaMax, next attack auto-fires skill. Base skill damage = ATK x (100 + skillPower x 10)%. SkillPower amplifies all skill effects.

### Skill Types (NFT skillEffect bitmask)
| Bit | Skill | Type | Effect |
|-----|-------|------|--------|
| 0x0001 | Immobilize | Debuff | Root target 1 turn (cannot move) |
| 0x0002 | Disarm | Debuff | Disarm target 1 turn (cannot attack) |
| 0x0004 | Blind | Debuff | Blind target 1 turn (cannot see enemies) |
| 0x0008 | Silence | Debuff | Silence target 1 turn (cannot cast skills) |
| 0x0010 | Lifesteal | Buff | Heal self for skillPower x 5% of damage dealt |
| 0x0020 | Vigor | Buff | Bonus damage scales with your current HP% (higher HP = more damage) |
| 0x0040 | Execute | Buff | Bonus damage scales with target's missing HP% (lower HP = more damage) |
| 0x0080 | Mana Burn | Debuff | Burn up to skillPower target mana (+5 damage per mana burned) |
| 0x0100 | Stealth | Buff | Become invisible until next action |
| 0x0200 | Thorns | Buff | Reflect skillPower x 6% of damage taken back to attacker |
| 0x0400 | Critical | Buff | Double power bonus (extra skillPower x 10 damage) |
| 0x0800 | Cleanse | Buff | Remove all debuffs from self |
| 0x1000 | Haste | Buff | Reset blink cooldown |

### EXP & Level Up
Attack +2 EXP. Kill = 60% of victim's EXP (min 10) + heal 50% missing HP (but exposure maxed!). Level up: +5 stat points (split between HP/ATK proportionally) + full heal. Thresholds: 10/25/45/70/100/...

### Poison Ring
Starts radius 12 (Chebyshev distance), shrinks by 1 every 3 turns. Damage = turn/5 + 1 per turn outside. Standing outside = death. Ring escape should be your first script rule.

### Rating & Coins per Match
**Rating (base, before anti-boost adjustment):**
| Rank | Rating | Coins |
|------|--------|-------|
| 1st | +45 | 120 |
| 2nd | +30 | 100 |
| 3rd | +15 | 85 |
| 4th | +5 | 70 |
| 5th | -5 | 55 |
| 6th | -15 | 45 |
| 7th | -30 | 35 |
| 8th | -45 | 25 |

**Bonuses:** First blood +10 rating. 2+ kills: +5 per kill.

**Anti-boost:** Rating gain/loss is adjusted based on your rating vs opponents' average. High-rated players gain less from weak opponents and lose more. Rating cannot drop below current tier floor (tier = rating / 100).

**Items:**
- **Entry Ticket** (itemId 64, flag bit 0) — Free match (no 0.001 BNB fee). Always consumed when used.
- **Rank Shield** (itemId 65, flag bit 1) — Prevent rating loss. **Only consumed on defeat** (wasted if you win — save it for when you expect to lose).
- **Rating Boost** (itemId 66, flag bit 2) — Rating gain x1.5. **Only consumed on victory** (wasted if you lose — save it for when you expect to win).
- **Coin Boost** (itemId 67, flag bit 3) — Coins earned x1.5. Always consumed when used.

**Item usage flow:** Buy items with `buyItem(itemId)` -> items stored in your `itemMask` -> set `itemFlags` in `playMatch()` to activate -> consumed after match based on conditions above.

---

## AI Strategy Script — Complete Reference

A script = JSON with **slots** (target selection) + **rules** (conditional actions). Engine evaluates rules top-to-bottom each turn, fires the first match.

### Script Structure
```json
{
  "slots": [ /* max 8 */ ],
  "rules": [ /* max 16 */ ]
}
```

### Slot Format
```json
{ "sortBy": 7, "order": 0, "filterProp": 0, "filterOp": 0, "filterRSub": 255, "filterRProp": 0, "filterVal": 0 }
```
- `sortBy`: property ID to sort enemies by
- `order`: 0=ascending, 1=descending
- `filterOp`: 0=no filter, 1-6=comparison (see operators below)
- `filterRSub`: 255=use filterVal as constant, 0=compare against self's filterRProp

### Rule Format
```json
{
  "c0": { "lSub": 0, "lProp": 8, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 1 },
  "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 },
  "c2": { ... }, "c3": { ... },
  "action": 3, "actionArg": 6, "actionTarget": 0
}
```
4 conditions (AND logic, `cmp=0` = skip). First matching rule fires.

### Subject IDs
| ID | Subject | Description |
|----|---------|-------------|
| 0 | SELF | The entity running this script |
| 1 | GAME | Global game state (use game property IDs) |
| 2-9 | T0-T7 | Slot query results (computed targets from slot filters/sorting) |
| 12 | LAST_ATK | Entity that last attacked me (NO_TARGET if none) |
| 13 | LAST_TGT | Entity I last attacked (NO_TARGET if none) |
| 14 | LAST_BLOCKED | Entity that blocked my last move/blink (NO_TARGET if not blocked or blocked by map edge). Use `LAST_BLOCKED.HP > 0` to check if movement was blocked by another player |
| 255 | CONSTANT | Not an entity — use the constant value (lVal/rVal) directly |

**Note:** When a subject resolves to NO_TARGET (e.g., no last attacker, or slot found no match), any condition referencing that subject's properties automatically **fails** (rule skipped). This means `T0.HP > 0` is a safe "does T0 exist?" check.

### Property IDs (entity properties, subject 0-14)
| ID | Prop | Description |
|----|------|-------------|
| 0 | HP | Current HP (can be negative when dead) |
| 1 | HP_MAX | Max HP (grows on level up) |
| 2 | HP_PCT | Current HP as percentage (0-100) |
| 3 | ATK | Attack power (grows on level up) |
| 4 | ATK_RANGE | Attack range (= vision range) |
| 5 | X | X position (-7 to +7) |
| 6 | Y | Y position (-7 to +7) |
| 7 | DIST | Manhattan distance from self to target |
| 8 | RING_DIST | Distance from ring edge (>0 = safe, <=0 = in poison) |
| 9 | EXP | Experience points |
| 10 | KILLS | Kill count |
| 11 | EXPOSURE | Exposure level (0-5, higher = more damage taken/dealt) |
| 12 | LAST_ACTION | Last action type (0=idle, 1=defend, 2=attack, 3=move, 4=blink) |
| 13 | MP | Current mana |
| 14 | MP_MAX | Max mana (higher = slower skill charge) |
| 15 | TURNS_TO_SKILL | Turns until skill ready (MP_MAX - MP, 0 when ready) |
| 16 | DMG_TO | Estimated damage self would deal to target |
| 17 | DMG_FROM | Estimated damage target would deal to self |
| 18 | HITS_TO_KILL | Hits needed to kill target |
| 19 | HITS_TO_DIE | Hits target needs to kill self |
| 20 | KILL_EXP | EXP gained from killing target |
| 21 | DEBUFF | Active debuff flags (bitmask) |
| 22 | STEALTH | 1 if stealthed, 0 if not |
| 23 | BLINK_CD | Blink cooldown (0 = ready) |
| 24 | VISIBLE_COUNT | Number of enemies in vision range |
| 25 | THREAT_COUNT | Number of enemies that can attack self |
| 26 | POWER | Combat power estimate (HP x ATK / 10) |

### Game Property IDs (subject=1)
| ID | Prop | Description |
|----|------|-------------|
| 0 | TURN | Current turn (1-40) |
| 1 | ALIVE_COUNT | Number of alive players |
| 2 | RING_RADIUS | Current ring radius (shrinks every 3 turns) |
| 3 | MAP_SIZE | Always 15 |

### Operators
Comparison: 0=skip, 1==, 2=!=, 3=>, 4=>=, 5=<, 6=<=
Arithmetic (lOp/rOp): 0=none, 1=add, 2=sub, 3=mul

### Actions
| ID | Action | actionArg | actionTarget |
|----|--------|-----------|--------------|
| 0 | Idle | — | — |
| 1 | Defend | — | — |
| 2 | Attack | — | target subject |
| 3 | Move | 0=toward,1=away,2=up,3=down,4=left,5=right,6=center | target subject |
| 4 | Blink | same as Move | target subject |

### Reference Rules (copy-paste ready)

**Ring Escape (first rule):** IF RING_DIST <= 0 THEN move center
```json
{ "c0": { "lSub": 0, "lProp": 8, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 3, "actionArg": 6, "actionTarget": 0 }
```

**Flee when low HP:** IF HP% <= 20 AND BLINK ready THEN blink away from T0
```json
{ "c0": { "lSub": 0, "lProp": 2, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 20 }, "c1": { "lSub": 0, "lProp": 23, "lOp": 0, "lVal": 0, "cmp": 1, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 4, "actionArg": 1, "actionTarget": 2 }
```

**Defend when overexposed:** IF EXPOSURE >= 3 THEN defend
```json
{ "c0": { "lSub": 0, "lProp": 11, "lOp": 0, "lVal": 0, "cmp": 4, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 3 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 1, "actionArg": 0, "actionTarget": 0 }
```

**Attack nearest in range:** IF T0.DIST <= self.ATK_RANGE THEN attack T0
```json
{ "c0": { "lSub": 2, "lProp": 7, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 0, "rProp": 4, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 2, "actionArg": 0, "actionTarget": 2 }
```

**Center Fallback (last rule):** always move center
```json
{ "c0": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 3, "actionArg": 6, "actionTarget": 0 }
```

---

## Script Encoding (JSON -> hex bytes for minting)

```javascript
function encodeScript(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  const slots = s.slots || [], rules = s.rules || [], buf = [];
  buf.push(Math.min(slots.length, 8));
  for (const sl of slots.slice(0, 8)) {
    buf.push(sl.sortBy??0, sl.order??0, sl.filterProp??0, sl.filterOp??0, sl.filterRSub??0, sl.filterRProp??0);
    const fv = sl.filterVal ?? 0; buf.push((fv>>8)&0xFF, fv&0xFF);
  }
  buf.push(Math.min(rules.length, 16));
  for (const r of rules.slice(0, 16)) {
    for (const ck of ['c0','c1','c2','c3']) {
      const c = r[ck] || {};
      buf.push(c.lSub??0, c.lProp??0, c.lOp??0);
      const lv = c.lVal??0; buf.push((lv>>8)&0xFF, lv&0xFF);
      buf.push(c.cmp??0, c.rSub??0, c.rProp??0, c.rOp??0);
      const rv = c.rVal??0; buf.push((rv>>8)&0xFF, rv&0xFF);
    }
    buf.push(r.action??0, r.actionArg??0, r.actionTarget??0);
  }
  return '0x' + Buffer.from(buf).toString('hex');
}
```

---

## Links

- Website: https://clawking.cc
- Twitter: https://x.com/LazyGooooo
- Discord: https://discord.gg/JrC6Kcdm
- GitHub: https://github.com/jinruozai/ClawKing
