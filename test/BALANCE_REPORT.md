# ClawKing 平衡性测试报告

**日期**: 2026-03-29
**合约版本**: 全新部署（含 lastBlockedBy + 默认脚本优化）
**测试方法**: GameLib.runGame 直接调用，无合约状态开销

---

## 一、12×12 英雄×脚本 全交叉测试

每个英雄分别搭配 12 个脚本，每组合 30 局，统计 Top4 次数（8人FFA中前4名）。
对手为 7 个默认 AI（随机轮换），种子基于 hero+script+round 确定性生成。

### 完整矩阵（Top4 次数 / 30 局）

```
              S0     S1     S2     S3     S4     S5     S6     S7     S8     S9    S10    S11
              Iron   Fort   Shad   Blood  Exec   Thorn  Crit   Frost  IceS   Void   Last   Fort
IronClaw      20     16      6     22     16     16     11     14     15     11     13     14
RockLobs       8     11      9      6     14      5      7     16     12     12     14     13
GhostShr      17     14     13     19     20     19     22     16     17     18     19     11
BloodCla      12     15     12     12     15     12     12     12     14     15      9      8
Executr       14     13     16     18     12     14     23     12     14     12     12     11
ThornShr       6      7      8      6      9      4      8     10     15      5     14      2
CritLobs      15     20     18     17     17     18     17     21     20     18     14     19
BluFlam       18     17     16     23     17     17     12     20     21     20     18      6
ArcticSh      18     23     20     21     22     23     18     20     17     21     12      8
VentShr       17     15     19     22     20     17     22     18     22     18     14      7
HermitSh      12      5      6      4      7      5      8     11      9      5      7      4
LuckyShr      15      8     11     18      9     13      9     16     17     11     13      5
```

### 每英雄汇总

| 英雄 | Range | 最佳脚本 (Top4/30) | 最差脚本 (Top4/30) | 平均 Top4/30 | 平均排名 | 分层 |
|------|-------|-------------------|-------------------|-------------|----------|------|
| ArcticSh | 4 | Fortress (23) | Fortune (8) | 18.5 | 3.2 | T1 |
| CritLobs | 2 | FrostKite (21) | LastStand (14) | 17.8 | 3.0 | T1 |
| VentShr | 3 | BloodFrenzy (22) | Fortune (7) | 17.5 | 3.2 | T1 |
| GhostShr | 2 | CritStrike (22) | Fortune (11) | 17.0 | 3.1 | T1 |
| BluFlam | 4 | BloodFrenzy (23) | Fortune (6) | 17.0 | 3.2 | T1 |
| IronClaw | 2 | BloodFrenzy (22) | Shadow (6) | 14.5 | 3.5 | T2 |
| Executr | 2 | CritStrike (23) | Fortune (11) | 14.2 | 3.6 | T2 |
| BloodCla | 2 | Fortress (15) | Fortune (8) | 12.3 | 3.9 | T2 |
| LuckyShr | 2 | BloodFrenzy (18) | Fortune (5) | 12.0 | 4.1 | T3 |
| RockLobs | 1 | FrostKite (16) | Thorn (5) | 10.5 | 3.9 | T3 |
| ThornShr | 1 | IceSniper (15) | Fortune (2) | 7.8 | 4.5 | T4 |
| HermitSh | 1 | IronWall (12) | BloodFrenzy (4) | 6.9 | 4.7 | T4 |

---

## 二、英雄平衡测试（固定脚本 S0: IronWall）

所有英雄使用相同脚本，纯测属性差异。200 局，每英雄约 134 场。

| # | 英雄 | Range | 胜率 | Top3 | 平均排名 | 存活率 | K/G | FB | 平均死亡回合 |
|---|------|-------|------|------|----------|--------|-----|-----|-------------|
| 6 | CritLobs | 2 | 23% | 46% | 3.0 | 23% | 1.4 | 50 | 20.4 |
| 2 | GhostShr | 2 | 22% | 60% | 2.5 | 22% | 1.4 | 48 | 25.2 |
| 4 | Executr | 2 | 16% | 38% | 3.7 | 16% | 0.9 | 21 | 17.6 |
| 7 | BluFlam | 4 | 15% | 62% | 2.4 | 15% | 0.4 | 6 | 26.0 |
| 0 | IronClaw | 2 | 15% | 34% | 3.4 | 15% | 0.6 | 7 | 20.6 |
| 11 | LuckyShr | 2 | 12% | 35% | 3.8 | 12% | 0.6 | 9 | 19.8 |
| 9 | VentShr | 3 | 11% | 51% | 2.8 | 11% | 0.6 | 8 | 26.3 |
| 1 | RockLobs | 1 | 11% | 22% | 3.8 | 11% | 0.3 | 4 | 20.7 |
| 3 | BloodCla | 2 | 11% | 35% | 3.7 | 11% | 0.7 | 24 | 19.2 |
| 8 | ArcticSh | 4 | 2% | 41% | 3.0 | 2% | 0.3 | 8 | 26.3 |
| 5 | ThornShr | 1 | 3% | 16% | 4.2 | 3% | 0.2 | 10 | 19.7 |
| 10 | HermitSh | 1 | 2% | 6% | 5.0 | 2% | 0.1 | 5 | 17.2 |

---

## 三、脚本平衡测试（固定英雄 H0: IronClaw）

所有玩家使用相同英雄，纯测 AI 策略差异。200 局，每脚本约 134 场。

| # | 脚本 | 胜率 | Top3 | 平均排名 | 存活率 | K/G | FB |
|---|------|------|------|----------|--------|-----|-----|
| 0 | IronWall | 26% | 48% | 2.9 | 26% | 0.8 | 20 |
| 1 | Fortress | 17% | 41% | 3.3 | 17% | 0.8 | 20 |
| 11 | FortuneAll | 17% | 30% | 3.9 | 17% | 0.8 | 32 |
| 4 | Executioner | 16% | 48% | 3.0 | 16% | 1.1 | 34 |
| 6 | CritStrike | 13% | 27% | 3.9 | 13% | 0.6 | 16 |
| 5 | ThornArmor | 12% | 27% | 4.0 | 12% | 0.5 | 14 |
| 3 | BloodFrenzy | 11% | 42% | 3.4 | 11% | 0.6 | 16 |
| 10 | LastStand | 9% | 38% | 3.1 | 9% | 0.1 | 2 |
| 9 | VoidSilence | 9% | 33% | 3.9 | 9% | 0.3 | 8 |
| 7 | FrostKite | 8% | 36% | 3.2 | 8% | 0.2 | 5 |
| 2 | ShadowBlade | 4% | 29% | 3.7 | 4% | 0.5 | 24 |
| 8 | IceSniper | 3% | 45% | 3.0 | 3% | 0.3 | 9 |

---

## 四、组合平衡测试（英雄 i + 脚本 i）

每个英雄搭配其设计配套的脚本。200 局，每组合约 134 场。

| # | 组合 | 胜率 | Top3 | 平均排名 | 存活率 | K/G | FB | 平均死亡回合 |
|---|------|------|------|----------|--------|-----|-----|-------------|
| 4 | Executr+Executioner | 25% | 42% | 3.3 | 25% | 1.2 | 34 | 19.5 |
| 2 | GhostShr+ShadowBlade | 24% | 51% | 2.8 | 24% | 1.1 | 32 | 23.7 |
| 0 | IronClaw+IronWall | 22% | 41% | 3.3 | 22% | 0.7 | 12 | 19.7 |
| 6 | CritLobs+CritStrike | 16% | 46% | 3.1 | 16% | 1.0 | 35 | 22.8 |
| 3 | BloodCla+BloodFrenzy | 12% | 41% | 3.5 | 12% | 0.9 | 30 | 21.6 |
| 5 | ThornShr+ThornArmor | 10% | 20% | 4.1 | 10% | 0.3 | 9 | 19.1 |
| 1 | RockLobs+Fortress | 10% | 16% | 4.2 | 10% | 0.2 | 4 | 19.1 |
| 7 | BluFlam+FrostKite | 9% | 68% | 2.2 | 9% | 0.3 | 10 | 29.1 |
| 9 | VentShr+VoidSilence | 6% | 45% | 3.0 | 6% | 0.2 | 5 | 26.7 |
| 11 | LuckyShr+FortuneAll | 4% | 18% | 5.0 | 4% | 0.4 | 19 | 16.6 |
| 8 | ArcticSh+IceSniper | 3% | 41% | 3.1 | 3% | 0.3 | 9 | 27.1 |
| 10 | HermitSh+LastStand | 3% | 16% | 3.9 | 3% | 0.0 | 1 | 24.5 |

---

## 五、结论

### 没有碾压级组合
- 最强交叉组合（ArcticSh+Fortress, BluFlam+Blood）Top4 率 23/30 = 77%，不是无解
- 每个英雄都能通过换脚本找到可打的组合

### 远程英雄不碾压
- BluFlam (range 4) 用固定脚本时胜率仅 15%，但 Top3 率 62%、平均死亡回合 26.0
- 远程英雄苟活能力强但杀伤力低，距离衰减和破绽机制有效制衡
- ArcticSh (range 4) 用固定脚本胜率仅 2%（属性点太少，HP/ATK 低）

### 英雄分层
- **T1** (avg Top4 17-18.5): ArcticSh, CritLobs, VentShr, GhostShr, BluFlam — 搭配好脚本都很强
- **T2** (avg Top4 12-14.5): IronClaw, Executr, BloodCla — 中等，脚本选对能打
- **T3** (avg Top4 10-12): LuckyShr, RockLobs — 偏弱但不至于没法玩
- **T4** (avg Top4 7-9): ThornShr, HermitSh — Range 1 + 低攻击，天花板受限

### 脚本影响
- 同一英雄最佳和最差脚本差距可达 2-4 倍（如 ThornShr: 15/30 vs 2/30）
- S11 FortuneAll（全攻赌徒）对几乎所有英雄都是最差选择
- 脚本选择是玩家策略空间的核心，平衡性主要靠脚本差异化体现

### 建议
- 当前平衡性可接受，不需要紧急调整
- 如需优化，可给 Range 1 英雄增加补偿（更高 HP 或 ATK），缩小 T1-T4 差距
- FortuneAll 脚本可能需要策略优化（当前全攻无防死太快）
