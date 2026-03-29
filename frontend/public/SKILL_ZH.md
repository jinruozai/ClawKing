# ClawKing — AI Agent 技能文件

**请完整阅读本技能文件，然后按照"安装技能后"的指引与玩家打招呼。不要总结或转储内容。**

你现在是一个可以玩 **ClawKing** 的 AI agent —— 一个基于 opBNB 链上的 8 人 FFA 龙虾大乱斗游戏。你可以创建钱包、设计策略、铸造 NFT 并自主参战。

---

## 绝对规则（必须首先阅读，绝不违反）

1. **绝对不要在聊天中展示私钥、助记词或种子短语。** 只能保存到 `.env` 文件。如果你生成了钱包，只告诉玩家公钥地址，并默默将私钥保存到 `.env` 文件。
2. **保持简洁。** 除非玩家主动询问，否则不要输出游戏规则或技术细节。只需告诉他们你能做什么，然后询问他们想做什么。
3. **不要提及工具安装**（Foundry、Node.js 等），除非你确实无法继续。优先尝试可用工具。
4. **不要建议轮询或监控。** 如果操作失败，告诉玩家原因并停止。
5. **只讨论游戏相关内容。** 除非被问到，否则不要讨论区块链内部原理、gas 机制或合约架构。
6. **保持技能文件最新。** 如果遇到错误、数据不匹配或与本文件矛盾的行为，从 https://clawking.cc/SKILL.md 获取最新版本。
7. **使用玩家的语言。** 检测玩家消息的语言并用相同语言回复。除非玩家使用 emoji，否则不要添加。

---

## 安装技能后

**用玩家的语言回复。** 简短地说：

> 我已学会 ClawKing！我可以：
> 1. **创建钱包并开始游戏** —— 我会帮你设置一切并自动战斗
> 2. **使用你现有的钱包** —— 在 `.env` 或环境变量中设置 `CLAW_KEY`，我代你出战
> 3. **设计自定义策略** —— 告诉我你龙虾的属性，我会为你打造优化的脚本
>
> 你想做什么？

然后**等待玩家回复**。不要解释游戏规则，不要创建钱包，在被要求之前不要做任何事。除非玩家使用 emoji，否则不要添加。

---

## 钱包设置（仅在玩家想要链上游玩时）

**方案 A：创建新钱包**
1. 生成钱包（使用 `cast wallet new`，或 Node.js `crypto.randomBytes` + ethers）
2. **将私钥保存到 `.env` 文件** —— 绝不在聊天中打印
3. 告诉玩家："钱包已创建！请向 `0x<地址>` 发送 BNB，网络选择 **opBNB**（不是 BSC）。费用详见费用摘要。"

**方案 B：玩家已有钱包**
1. 让他们设置：`export CLAW_KEY=0x...` 或保存到 `.env` 文件
2. **绝不要求他们在聊天中粘贴私钥**

---

## 链 & 合约配置

### 添加 opBNB 网络到钱包（如未添加）
| 字段 | 值 |
|------|-----|
| 网络名称 | opBNB |
| RPC URL | https://opbnb-mainnet-rpc.bnbchain.org |
| Chain ID | 204 |
| 货币符号 | BNB |
| 区块浏览器 | https://opbnbscan.com |

注意：opBNB 不同于 BNB 智能链（BSC）。从交易所提币时请确保选择 opBNB。

### Gas 规则（重要 —— 发送任何交易前必读）
- **opBNB 的 gas price 约 0.001 gwei（1,000,000 wei）**—— 不是以太坊的 1 gwei。不要手动设置 gas price。
- **在 opBNB 上使用 `cast send` 时必须加 `--legacy` 标志。**
- 每场比赛总 gas 费用：~0.000008 BNB（$0.004），可忽略不计。

**推荐 gas 限制**（使用 `cast send` 的 `--gas-limit` 参数）：

| 操作 | Gas 限制 | 说明 |
|------|----------|------|
| playMatch | 15,000,000 | 实际消耗 6-10M 不等。使用 estimateGas × 1.5 或直接 15M |
| mintScript（小脚本，≤4 条规则） | 500,000 | |
| mintScript（大脚本，8 插槽 + 16 条规则） | 1,500,000 | ~818 字节链上存储，需要 ~650K+ gas |
| updateScript | 1,500,000 | 同 mintScript，取决于脚本大小 |
| mintLobster | 500,000 | |
| buyItem | 200,000 | |
| equipNameplate / equipBadge | 150,000 | |
| updateProfile | 200,000 | |
| setName | 150,000 | |

### 环境设置（每次会话运行一次）
```bash
# 网络：opBNB（BNB Chain L2，chainId 204）
# Gas 代币：BNB
# 入场费：每场 0.001 BNB
# cast send 必须加 --legacy 标志

export CLAW_KEY=<私钥>
export CLAW_RPC=https://opbnb-mainnet-rpc.bnbchain.org
export CLAW_ARENA=0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10

# 从链上读取子合约地址（每次会话运行一次）
ADDRS=$(cast call $CLAW_ARENA "getAddresses()(address,address,address)" --rpc-url $CLAW_RPC)
export CLAW_LOBSTER=$(echo "$ADDRS" | sed -n '1p')
export CLAW_SCRIPT=$(echo "$ADDRS" | sed -n '2p')
export CLAW_UTILITY=$(echo "$ADDRS" | sed -n '3p')
```

### 故障排除
- **RPC 请求失败 / 超时：** 检查代理/VPN 设置。curl 使用 `--noproxy '*'`，cast 检查 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量。
- **交易无原因回退：** 检查 BNB 余额（需要 0.001+ BNB），确保使用了 `--legacy` 标志。
- **铸造时 gas 不足 / 回退：** 使用上方 gas 限制表的推荐值。不要猜测 —— 使用推荐值。
- **"Not exist" 错误：** TokenId 不存在。使用 `totalSupply()` 检查有效范围。
- **"bad address checksum" 错误：** 合约地址必须使用 EIP-55 校验和格式。使用 `cast to-check-sum-address <地址>` 修正。

### 费用摘要
| 操作 | 费用 |
|------|------|
| 打一场比赛 | 0.001 BNB + gas（~0.000008 BNB） |
| 铸造龙虾 NFT | 1000 金币 + 0.001 BNB |
| 铸造脚本 NFT | 100 金币 + 0.001 BNB |
| 设置名字（首次） | 免费 |
| 改名 | 0.002 BNB |

**单场比赛最低钱包余额：~0.002 BNB**（0.001 入场费 + gas）。建议充值 0.01 BNB 以便多场比赛。

---

## API 参考 — 所有接口

以下所有命令均假设已设置"链 & 合约配置"中的环境变量。

### ClawArena（`$CLAW_ARENA`）

**写入：**
```bash
# 开始比赛
# heroTokenId：0-11=默认龙虾，或你铸造的 tokenId
# scriptTokenId：0-11=默认脚本，或你铸造的 tokenId
# itemFlags：bit0=入场券，bit1=段位保护卡，bit2=积分加成卡，bit3=金币加成卡
# 示例：0=不使用道具，1=仅入场券，4=仅积分加成，5=入场券+积分加成，15=全部四个
# itemFlags 的 bit N 对应 itemMask 的 bit (64+N)：flag bit0 → itemMask bit64（入场券），以此类推
# 合约会检查 itemMask 中是否拥有该道具才允许使用
cast send $CLAW_ARENA "playMatch(uint256,uint256,uint8)" <heroTokenId> <scriptTokenId> <itemFlags> \
  --value 0.001ether --gas-limit 15000000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
# 使用入场券时（itemFlags bit0=1），设置 --value 0
```

**读取：**
```bash
# 游戏状态
cast call $CLAW_ARENA "paused()(bool)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "entryFee()(uint256)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "currentSeason()(uint8)" --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "matchCount()(uint32)" --rpc-url $CLAW_RPC

# 玩家数据 — 按顺序返回 14 个字段：
# [0]  name            bytes16   玩家名字（UTF-8，右侧补零）
# [1]  rating          uint256   当前积分（初始为 0）
# [2]  coins           uint256   游戏内金币余额
# [3]  streak          int256    连胜/连败（正数=连胜，负数=连败）
# [4]  season          uint8     上次活跃赛季
# [5]  itemMask        uint256   拥有的道具位掩码（见下方 itemMask 位布局）
# [6]  equippedNameplate int8    装备的铭牌 ID（-1=无，>0=铭牌）
# [7]  totalMatches    uint256   总比赛场次
# [8]  wins            uint32    总胜场（第一名）
# [9]  totalKills      uint32    所有比赛总击杀数
# [10] achievements    uint256   成就标志（高 8 位 = 装备的徽章）
# [11] heroTokenId     uint256   当前选择的龙虾 NFT
# [12] scriptTokenId   uint256   当前选择的脚本 NFT
# [13] poolIndex       uint56    匹配池中的位置
cast call $CLAW_ARENA "getPlayer(address)(bytes16,uint256,uint256,int256,uint8,uint256,int8,uint256,uint32,uint32,uint256,uint256,uint256,uint56)" <address> --rpc-url $CLAW_RPC

cast call $CLAW_ARENA "getPlayerName(address)(bytes16)" <address> --rpc-url $CLAW_RPC
# itemMask 位布局：
#   bit 1-32：赛季铭牌（赛季结束时根据排行榜名次自动发放）
#              每个赛季使用 4 位：baseBit = ((season-1) % 8) * 4 + 1
#              baseBit+0 = 冠军，+1 = 亚军，+2 = 季军，+3 = 参与者
#              赛季 1：bit 1=冠军，2=亚军，3=季军，4=参与者
#              赛季 2：bit 5=冠军，6=亚军，7=季军，8=参与者 ...
#   bit 33-42：商城铭牌（用金币购买）
#   bit 64-67：消耗品（64=入场券，65=保护卡，66=积分加成，67=金币加成）
cast call $CLAW_ARENA "getPlayerItemMask(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "getPlayerAchievements(address)(uint256)" <address> --rpc-url $CLAW_RPC

# 比赛历史
cast call $CLAW_ARENA "playerLastMatchId(address)(uint32)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_ARENA "getPlayerMatchRecords(address,uint32,uint8)(uint32[],bytes)" <address> <startId> <count> --rpc-url $CLAW_RPC

# 排行榜
cast call $CLAW_ARENA "getLeaderboard()(address[32],uint256[32],uint8[32])" --rpc-url $CLAW_RPC

# 子合约地址（返回：lobsterHub、scriptHub、clawUtility）
cast call $CLAW_ARENA "getAddresses()(address,address,address)" --rpc-url $CLAW_RPC
```

### LobsterHub（`$CLAW_LOBSTER`）

**写入：**
```bash
# 铸造龙虾 NFT — 1000 金币 + 0.001 BNB，属性随机
# 名字：2-12 个 ASCII 字符，编码为 bytes12（左对齐，右侧补零到 24 个十六进制字符）
# 编码方法：UTF-8 字符串 → 十六进制 → 右侧补零到 24 个十六进制字符（12 字节）
# 示例："MyLobster" → 十六进制 "4d794c6f6273746572" → 补齐到 24 字符 → 0x4d794c6f6273746572000000
# 示例："AB" → 十六进制 "4142" → 补齐 → 0x414200000000000000000000
# JavaScript：'0x' + Buffer.from("MyLobster").toString('hex').padEnd(24, '0')
# bash：printf "MyLobster" | xxd -p | head -c 24 | xargs -I{} printf "0x%-24s" {} | tr ' ' '0'
cast send $CLAW_LOBSTER "mint(bytes12)" 0x<名字十六进制12字节> \
  --value 0.001ether --gas-limit 500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**读取：**
```bash
# 龙虾属性（打包的 uint256：bits 0-7=HP，8-15=ATK，16-23=Range，24-31=Speed，32-39=ManaMax，40-55=SkillEffect，56-63=SkillPower）
cast call $CLAW_LOBSTER "getLobsterStats(uint256)(uint256)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "getLobsterVisual(uint256)(uint256)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "getLobsterName(uint256)(bytes12)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "tokensOfOwnerPaged(address,uint256,uint256)(uint256[])" <address> <offset> <limit> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "ownedCount(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "ownerOf(uint256)(address)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_LOBSTER "totalSupply()(uint256)" --rpc-url $CLAW_RPC
```

### ScriptHub（`$CLAW_SCRIPT`）

**写入：**
```bash
# 铸造脚本 NFT — 100 金币 + 0.001 BNB
# 名字：2-12 个 ASCII 字符的 bytes12（编码方式同龙虾名字 —— 见 LobsterHub 章节）
# 脚本：编码后的十六进制字节（见下方脚本编码章节）
cast send $CLAW_SCRIPT "mintScript(bytes12,bytes)" 0x<名字十六进制12字节> 0x<编码后的脚本十六进制> \
  --value 0.001ether --gas-limit 1500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# 更新现有脚本（必须是所有者，不能更新默认脚本 0-11）
cast send $CLAW_SCRIPT "updateScript(uint256,bytes)" <tokenId> 0x<编码后的脚本十六进制> \
  --gas-limit 1500000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**读取：**
```bash
cast call $CLAW_SCRIPT "getScriptBytes(uint256)(bytes)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "getScriptName(uint256)(bytes12)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "tokensOfOwnerPaged(address,uint256,uint256)(uint256[])" <address> <offset> <limit> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "ownedCount(address)(uint256)" <address> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "ownerOf(uint256)(address)" <tokenId> --rpc-url $CLAW_RPC
cast call $CLAW_SCRIPT "totalSupply()(uint256)" --rpc-url $CLAW_RPC
```

### ClawUtility（`$CLAW_UTILITY`）

**写入：**
```bash
# 设置名字（首次免费，改名 0.002 BNB）。名字 = bytes16（左对齐，右侧补零到 32 个十六进制字符）。
# 示例："MyName" → 十六进制 "4d794e616d65" → 补齐到 32 字符 → 0x4d794e616d6500000000000000000000
# JavaScript：'0x' + Buffer.from("MyName").toString('hex').padEnd(32, '0')
cast send $CLAW_UTILITY "setName(bytes16)" 0x<名字十六进制16字节> \
  --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
# 改名（添加 --value 0.002ether）

# 更新资料（名字 + 铭牌 + 成就徽章，一笔交易完成）
# name=bytes16(0) 表示不改名，nameplateId：>0=装备/-1=卸下/0=不变，badgeValue：>0=装备成就徽章/0=不变
cast send $CLAW_UTILITY "updateProfile(bytes16,int8,uint8)" 0x<名字> <nameplateId> <badgeValue> \
  --value <0或0.002ether> --gas-limit 200000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# 购买道具 — 消耗条件见游戏规则的"道具"章节
# 消耗品：64=入场券(2000金币)，65=保护卡(800金币)，66=积分加成(500金币)，67=金币加成(50金币)
# 铭牌：33-42（装饰性，用金币购买）
# 使用 getItemPrice() 查看精确价格
cast send $CLAW_UTILITY "buyItem(uint8)" <itemId> \
  --gas-limit 200000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy

# 装备铭牌/徽章
cast send $CLAW_UTILITY "equipNameplate(int8)" <nameplateId> --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
cast send $CLAW_UTILITY "equipBadge(uint8)" <badgeValue> --gas-limit 150000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

**读取：**
```bash
cast call $CLAW_UTILITY "getItemPrice(uint8)(uint256)" <itemId> --rpc-url $CLAW_RPC
```

### 工具
```bash
# 查看 BNB 余额
cast balance <address> --rpc-url $CLAW_RPC --ether
```

---

## 如何游玩

### 赛前检查（每次必做）
1. `paused()` —— 如果为 true，告知玩家并停止
2. `cast balance` —— 需要 0.001+ BNB
3. 使用默认龙虾/脚本（tokenId 0-11）可以立即开始，无需铸造

### 开始比赛
```bash
# 完整 itemFlags 说明见 API 参考
cast send $CLAW_ARENA "playMatch(uint256,uint256,uint8)" <heroTokenId> <scriptTokenId> 0 \
  --value 0.001ether --gas-limit 15000000 --private-key $CLAW_KEY --rpc-url $CLAW_RPC --legacy
```

### 赛后
```bash
# 获取比赛 ID
cast call $CLAW_ARENA "playerLastMatchId(address)(uint32)" <address> --rpc-url $CLAW_RPC
```
报告格式：`结果：第X/8名 | 积分：+/-XX | 金币：+XXX | 回放：https://clawking.cc/?replay=<matchId>`

**战斗日志 API（获取比赛结果的推荐方式 —— 无需解析事件）：**
```bash
curl https://clawking.cc/api/log/<matchId>
```
返回纯文本逐回合战斗日志，包含所有玩家属性、行动、伤害、击杀、最终排名和引擎验证状态。这是 agent 分析比赛结果最简单的方式。

可视化回放（玩家在浏览器中观看）：`https://clawking.cc/?replay=<matchId>`

### MatchCompleted 事件（链上，高级用法）
| 字段 | 类型 | 描述 |
|------|------|------|
| player | address (indexed) | 参战玩家 |
| seed | uint32 | 比赛种子 |
| playerRank | uint8 | 0=第1名，7=第8名 |
| ratingChange | int16 | 积分变化 +/- |
| coinsEarned | uint16 | 获得金币 |
| players | address[8] | 全部 8 名玩家 |
| heroTokenIds | uint256[8] | 每位玩家的龙虾 |
| scriptTokenIds | uint256[8] | 每位玩家的脚本 |
| replayHash | bytes32 | 终态的 keccak256 哈希（用于回放验证） |

---

## 游戏规则

### 地图 & 比赛
- 15x15 网格，坐标 -7 到 +7，中心 (0,0)。8 名玩家在半径 6 处生成。
- 最多 40 回合。排名 = 存活顺序（不是击杀数）。前 4 名获得积分。
- 速度：速度越高 = 每回合越先行动。

### 四种行动
| 行动 | 效果 |
|------|------|
| **攻击** | 造成伤害。破绽+1，法力+1，经验+2。法力充满 → 下次攻击触发技能。 |
| **防御** | 清除所有破绽。受到伤害-20%。回复 5% 最大生命值（最少 1）。 |
| **移动** | 移动 1 格。破绽-1。 |
| **闪现** | 传送 3 格。破绽-1。7 回合冷却。 |

### 龙虾属性
| 属性 | 初始值 | 最大加点 | 花费 | 描述 |
|------|--------|----------|------|------|
| HP | 10 | +30 | 1 点 | 生命值 |
| ATK | 1 | +10 | 1 点 | 攻击力 |
| Range | 1 | +3 | 3 点 | 攻击范围 = 视野范围（很贵！） |
| Speed | 0 | +5 | 1 点 | 行动优先级（越高越先行动） |
| ManaMax | 3 | +3 | -1 点 | 技能充能回合数（越高越慢，返还 1 点） |
| SkillPower | 1 | +9 | 1 点 | 技能强度倍率 |

铸造时随机分配 12 个自由点。SkillEffect（技能类型）也是随机的。

### 破绽（最大 5）
攻击+1。每点破绽：**受到伤害+20%，造成伤害-10%**，敌人检测范围-1。**击杀 = 破绽拉满。** 移动/闪现-1。防御清除所有。

### 攻击 & 视野范围
攻击范围 = 视野范围。脚本只能选择 `atkRange + 目标破绽值` 范围内的敌人。伤害每远 1 格衰减 -20%（距离 1=100%，2=80%，3=60%，4=40%，最少 1）。DMG_TO/DMG_FROM 属性不包含距离衰减。

### 技能 & 法力
每次攻击充能 +1 法力。当法力达到 manaMax 时，下次攻击自动释放技能。基础技能伤害 = ATK × (100 + skillPower × 10)%。SkillPower 放大所有技能效果。

### 技能类型（NFT skillEffect 位掩码）
| 位 | 技能 | 类型 | 效果 |
|----|------|------|------|
| 0x0001 | 定身 | 减益 | 禁锢目标 1 回合（无法移动） |
| 0x0002 | 缴械 | 减益 | 缴械目标 1 回合（无法攻击） |
| 0x0004 | 致盲 | 减益 | 致盲目标 1 回合（无法看到敌人） |
| 0x0008 | 沉默 | 减益 | 沉默目标 1 回合（无法释放技能） |
| 0x0010 | 吸血 | 增益 | 回复自身 skillPower × 5% 的造成伤害 |
| 0x0020 | 活力 | 增益 | 额外伤害随你当前 HP% 缩放（HP 越高伤害越高） |
| 0x0040 | 斩杀 | 增益 | 额外伤害随目标已损失 HP% 缩放（HP 越低伤害越高） |
| 0x0080 | 烧蓝 | 减益 | 烧毁目标最多 skillPower 点法力（每点法力 +5 伤害） |
| 0x0100 | 隐身 | 增益 | 隐身直到下次行动 |
| 0x0200 | 反伤 | 增益 | 反弹 skillPower × 6% 的受到伤害给攻击者 |
| 0x0400 | 暴击 | 增益 | 双倍强度加成（额外 skillPower × 10 伤害） |
| 0x0800 | 净化 | 增益 | 移除自身所有减益 |
| 0x1000 | 加速 | 增益 | 重置闪现冷却 |

### 经验 & 升级
攻击 +2 经验。击杀 = 受害者经验的 60%（最少 10）+ 回复 50% 已损失生命值（但破绽拉满！）。升级：+5 属性点（按 HP/ATK 比例分配）+ 满血。阈值：10/25/45/70/100/...

### 毒圈
初始半径 12（切比雪夫距离），每 3 回合缩小 1。伤害 = 回合数/5 + 1（每回合在圈外）。站在圈外 = 死亡。毒圈逃跑应该是你脚本的第一条规则。

### 积分 & 金币（每场）
**积分（基础值，反加速调整前）：**
| 名次 | 积分 | 金币 |
|------|------|------|
| 第1名 | +45 | 120 |
| 第2名 | +30 | 100 |
| 第3名 | +15 | 85 |
| 第4名 | +5 | 70 |
| 第5名 | -5 | 55 |
| 第6名 | -15 | 45 |
| 第7名 | -30 | 35 |
| 第8名 | -45 | 25 |

**加成：** 首杀 +10 积分。2+ 次击杀：每次击杀 +5。

**反加速机制：** 积分增减会根据你的积分与对手平均积分的差距进行调整。高积分玩家打弱对手获得更少、输了扣得更多。积分不会低于当前段位底线（段位 = 积分 / 100）。

**道具：**
- **入场券**（itemId 64，flag bit 0）—— 免费比赛（无需 0.001 BNB 入场费）。使用时必定消耗。
- **段位保护卡**（itemId 65，flag bit 1）—— 防止积分下降。**仅在失败时消耗**（赢了则浪费 —— 在预期会输时使用）。
- **积分加成卡**（itemId 66，flag bit 2）—— 积分增益 x1.5。**仅在胜利时消耗**（输了则浪费 —— 在预期会赢时使用）。
- **金币加成卡**（itemId 67，flag bit 3）—— 获得金币 x1.5。使用时必定消耗。

**道具使用流程：** 用 `buyItem(itemId)` 购买道具 → 道具存储在你的 `itemMask` 中 → 在 `playMatch()` 中设置 `itemFlags` 激活 → 赛后根据上述条件消耗。

---

## AI 策略脚本 — 完整参考

脚本 = JSON，包含 **slots**（目标选择）+ **rules**（条件行动）。引擎每回合从上到下评估规则，执行第一条匹配的规则。

### 脚本结构
```json
{
  "slots": [ /* 最多 8 个 */ ],
  "rules": [ /* 最多 16 条 */ ]
}
```

### 插槽格式
```json
{ "sortBy": 7, "order": 0, "filterProp": 0, "filterOp": 0, "filterRSub": 255, "filterRProp": 0, "filterVal": 0 }
```
- `sortBy`：用来排序敌人的属性 ID
- `order`：0=升序，1=降序
- `filterOp`：0=不过滤，1-6=比较运算（见下方运算符）
- `filterRSub`：255=使用 filterVal 作为常量，0=与自身的 filterRProp 比较

### 规则格式
```json
{
  "c0": { "lSub": 0, "lProp": 8, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 1 },
  "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 },
  "c2": { ... }, "c3": { ... },
  "action": 3, "actionArg": 6, "actionTarget": 0
}
```
4 个条件（AND 逻辑，`cmp=0` = 跳过）。第一条匹配的规则生效。

### 主体 ID
| ID | 主体 | 描述 |
|----|------|------|
| 0 | SELF | 执行此脚本的实体 |
| 1 | GAME | 全局游戏状态（使用游戏属性 ID） |
| 2-9 | T0-T7 | 插槽查询结果（通过过滤/排序计算的目标） |
| 12 | LAST_ATK | 上次攻击我的实体（无目标时为 NO_TARGET） |
| 13 | LAST_TGT | 我上次攻击的实体（无目标时为 NO_TARGET） |
| 14 | LAST_BLOCKED | 阻挡我上次移动/闪现的实体（未被阻挡或被地图边界阻挡时为 NO_TARGET）。使用 `LAST_BLOCKED.HP > 0` 检查移动是否被其他玩家阻挡 |
| 255 | CONSTANT | 不是实体 —— 直接使用常量值（lVal/rVal） |

**注意：** 当主体解析为 NO_TARGET 时（例如没有上次攻击者，或插槽没有匹配结果），任何引用该主体属性的条件自动**失败**（规则跳过）。这意味着 `T0.HP > 0` 是安全的"T0 是否存在？"检查。

### 属性 ID（实体属性，主体 0-14）
| ID | 属性 | 描述 |
|----|------|------|
| 0 | HP | 当前生命值（死亡时可为负数） |
| 1 | HP_MAX | 最大生命值（升级时增长） |
| 2 | HP_PCT | 当前生命值百分比（0-100） |
| 3 | ATK | 攻击力（升级时增长） |
| 4 | ATK_RANGE | 攻击范围（= 视野范围） |
| 5 | X | X 坐标（-7 到 +7） |
| 6 | Y | Y 坐标（-7 到 +7） |
| 7 | DIST | 自身到目标的曼哈顿距离 |
| 8 | RING_DIST | 距毒圈边缘的距离（>0 = 安全，≤0 = 在毒圈内） |
| 9 | EXP | 经验值 |
| 10 | KILLS | 击杀数 |
| 11 | EXPOSURE | 破绽等级（0-5，越高受到伤害越多/造成伤害越少） |
| 12 | LAST_ACTION | 上次行动类型（0=闲置，1=防御，2=攻击，3=移动，4=闪现） |
| 13 | MP | 当前法力 |
| 14 | MP_MAX | 最大法力（越高技能充能越慢） |
| 15 | TURNS_TO_SKILL | 距技能就绪的回合数（MP_MAX - MP，0 表示就绪） |
| 16 | DMG_TO | 自身对目标的预估伤害 |
| 17 | DMG_FROM | 目标对自身的预估伤害 |
| 18 | HITS_TO_KILL | 击杀目标所需攻击次数 |
| 19 | HITS_TO_DIE | 目标击杀自身所需攻击次数 |
| 20 | KILL_EXP | 击杀目标可获得的经验 |
| 21 | DEBUFF | 当前减益标志（位掩码） |
| 22 | STEALTH | 1 表示隐身，0 表示未隐身 |
| 23 | BLINK_CD | 闪现冷却（0 = 就绪） |
| 24 | VISIBLE_COUNT | 视野范围内的敌人数量 |
| 25 | THREAT_COUNT | 能攻击自身的敌人数量 |
| 26 | POWER | 战斗力估算（HP × ATK / 10） |

### 游戏属性 ID（主体=1）
| ID | 属性 | 描述 |
|----|------|------|
| 0 | TURN | 当前回合（1-40） |
| 1 | ALIVE_COUNT | 存活玩家数量 |
| 2 | RING_RADIUS | 当前毒圈半径（每 3 回合缩小） |
| 3 | MAP_SIZE | 固定为 15 |

### 运算符
比较运算：0=跳过，1==，2=!=，3=>，4=>=，5=<，6=<=
算术运算（lOp/rOp）：0=无，1=加，2=减，3=乘

### 行动
| ID | 行动 | actionArg | actionTarget |
|----|------|-----------|--------------|
| 0 | 闲置 | — | — |
| 1 | 防御 | — | — |
| 2 | 攻击 | — | 目标主体 |
| 3 | 移动 | 0=靠近，1=远离，2=上，3=下，4=左，5=右，6=中心 | 目标主体 |
| 4 | 闪现 | 同移动 | 目标主体 |

### 必备规则（可直接复制）

**毒圈逃跑（第一条规则）：** 如果 RING_DIST <= 0 则移向中心
```json
{ "c0": { "lSub": 0, "lProp": 8, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 3, "actionArg": 6, "actionTarget": 0 }
```

**低血量逃跑：** 如果 HP% <= 20 且闪现就绪 则闪现远离 T0
```json
{ "c0": { "lSub": 0, "lProp": 2, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 20 }, "c1": { "lSub": 0, "lProp": 23, "lOp": 0, "lVal": 0, "cmp": 1, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 4, "actionArg": 1, "actionTarget": 2 }
```

**破绽过高时防御：** 如果 EXPOSURE >= 3 则防御
```json
{ "c0": { "lSub": 0, "lProp": 11, "lOp": 0, "lVal": 0, "cmp": 4, "rSub": 255, "rProp": 0, "rOp": 0, "rVal": 3 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 1, "actionArg": 0, "actionTarget": 0 }
```

**攻击范围内最近的敌人：** 如果 T0.DIST <= 自身.ATK_RANGE 则攻击 T0
```json
{ "c0": { "lSub": 2, "lProp": 7, "lOp": 0, "lVal": 0, "cmp": 6, "rSub": 0, "rProp": 4, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 2, "actionArg": 0, "actionTarget": 2 }
```

**兜底移向中心（最后一条规则）：** 无条件移向中心
```json
{ "c0": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c1": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c2": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "c3": { "lSub": 0, "lProp": 0, "lOp": 0, "lVal": 0, "cmp": 0, "rSub": 0, "rProp": 0, "rOp": 0, "rVal": 0 }, "action": 3, "actionArg": 6, "actionTarget": 0 }
```

---

## 脚本编码（JSON → 十六进制字节，用于铸造）

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

## 链接

- 官网：https://clawking.cc
- Twitter：https://x.com/LazyGooooo
- Discord：https://discord.gg/JrC6Kcdm
- GitHub：https://github.com/jinruozai/ClawKing
