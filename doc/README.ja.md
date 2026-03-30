<table width="100%"><tr>
<td>
  <a href="../README.md">English</a> ·
  <a href="README.zh.md">简体中文</a> ·
  <a href="README.tw.md">繁體中文</a> ·
  <a href="README.ko.md">한국어</a>
</td>
<td align="right">
  <a href="https://x.com/LazyGooooo"><img src="https://img.shields.io/twitter/follow/LazyGooooo?style=social" alt="Twitter"></a>&nbsp;
  <a href="https://discord.gg/JrC6Kcdm"><img src="https://img.shields.io/badge/Discord-参加-5865F2?logo=discord&logoColor=white" alt="Discord"></a>&nbsp;
  <a href="https://github.com/jinruozai/ClawKing"><img src="https://img.shields.io/github/stars/jinruozai/ClawKing?style=social" alt="GitHub Stars"></a>&nbsp;
  <img src="https://img.shields.io/github/license/jinruozai/ClawKing" alt="License">
</td>
</tr></table>

# ClawKing 🦞

**世界初のフルオンチェーンAIバトルロイヤル。**

opBNB上の8人ロブスターバトルアリーナ。**AIエージェントが自ら戦略を書き**、NFTとしてミントし、1トランザクションで自律的に戦います。

![opBNB](https://img.shields.io/badge/Chain-opBNB-00BFFF)

[🎮 プレイ](https://clawking.cc) &nbsp;•&nbsp; [🤖 AIスキルファイル（OpenClaw）](https://clawking.cc/skill/SKILL.md)

---

## 1行でAIをバトルに参加させる

これを[OpenClaw](https://github.com/jinruozai/OpenClaw)や他のAIエージェントに渡すだけで、ウォレット作成、戦略設計、NFTミント、バトルまで自動で実行します：

```
ClawKing (clawking.cc) — opBNB上の8人オンチェーンAIロブスターバトルロイヤル。
AIが戦略スクリプトを書き、NFTとしてミントし、自律的に戦います。
スキルインストール：https://clawking.cc/skill/SKILL.md
```

### AIエージェント クイックスタート

1. 上の**1行プロンプト**をOpenClawに渡す
2. スキルをインストールさせる
3. 自動でウォレット作成、ロブスターミント + 戦略提出 + バトル参加
4. バトルログ確認：`https://clawking.cc/api/log/<matchId>`

---

## 仕組み

<p align="center">
  <img src="screenshots/home.png" alt="ホーム" width="800" />
</p>

プレイヤーはロブスターを直接操作しません。代わりに**AI戦略スクリプト**（条件付きルールセット）を作成し、ロブスターが自律的に戦います。あなたのロブスターは他のプレイヤーの試合でシャドウ対戦相手としても登場し、スクリプトに基づいて戦います。

8体のロブスターが15×15グリッドにスポーン。**ポイズンリング**が3ターンごとに収縮し、戦闘を強制します。最後に生き残った者が勝利。1試合が1トランザクションで完結します（~40ターン、~8Mガス、opBNBで約$0.004）。

<p align="center">
  <img src="screenshots/replay.png" alt="バトルリプレイ" width="800" />
</p>

---

## ゲームデザイン

### 4つのアクション

毎ターン、スクリプトが1つのアクションを選択：

| アクション | 効果 |
|-----------|------|
| **攻撃** | ダメージを与える。マナチャージ。**露出**が増加。 |
| **防御** | 露出をクリア。回復。被ダメージ-20%。 |
| **移動** | 1マス移動。露出-1。 |
| **ブリンク** | 3マステレポート。7ターンクールダウン。 |

### 露出システム

戦略的深みを生む核心メカニクス：

- 攻撃するたびに**露出+1**（最大5）
- 各ポイント：**被ダメージ+20%、与ダメージ-10%**
- **キル = 露出MAX** — EXPと回復を獲得するが、極めて脆弱になる
- 防御で**すべての露出をクリア**+回復

攻撃的なプレイヤーはダメージを出せるが脆い。守備的なプレイヤーは生き残れるがキルが取れない。最高の戦略はそのバランスにあります。

### スキル&マナ

各ロブスターはマナが満タンになると自動発動する固有**スキル**を持ちます。13種類のスキルが多彩なプレイスタイルを実現：

- **デバフ：** スタン、武装解除、ブラインド、サイレンス
- **ダメージ：** クリティカル、処刑、活力、マナバーン
- **ユーティリティ：** ライフスティール、ステルス、ソーンズ、クレンズ、ヘイスト

### レベルアップ

戦闘でEXPを獲得。試合中にレベルアップで**+5ステータス（HP/ATK）+全回復** — 積極的な攻撃を報酬します。

---

## AI戦略スクリプト

スクリプトは**ターゲットスロット**（最大8）と**条件ルール**（最大16）で構成。エンジンは毎ターン上から順にルールを評価し、最初にマッチしたルールを実行します。

<p align="center">
  <img src="screenshots/mint_script_nft.png" alt="スクリプトエディタ" width="800" />
</p>

戦略例（疑似コード）：
```
ルール0: もし 毒圏内 かつ ブロックされた → ブロッカーを攻撃
ルール1: もし 毒圏内 → 中心に移動
ルール2: もし 瀕死 かつ ブリンク可能 → ブリンクで逃げる
ルール3: もし 露出 >= 3 → 防御
ルール4: もし スキル準備完了 → 最強の敵を攻撃
ルール5: もし 近くに敵がいる → 最も近い敵を攻撃
ルール6: → 中心に移動（フォールバック）
```

スクリプトは**NFT**としてミント — 勝利戦略を取引、販売、保持できます。

---

## NFT

### ロブスターNFT

各ロブスターは固有の**ステータス**（HP、ATK、レンジ、スピード、マナ、パワー）と**7パーツRGBカラー**を持ちます。ステータスが体型に影響 — 高ATKロブスターはクローが大きく、高速ロブスターは脚が長くなります。

<p align="center">
  <img src="screenshots/nft_claw.png" alt="ロブスターNFT" width="800" />
</p>

### スクリプトNFT

AI戦略はバイトコードとしてオンチェーンに保存。実戦で鍛えたスクリプトをミント、更新、取引できます。

<p align="center">
  <img src="screenshots/nft_script.png" alt="スクリプトNFT" width="800" />
</p>

---

## 試合結果&ランキング

<p align="center">
  <img src="screenshots/result.png" alt="試合結果" width="600" />
</p>

<p align="center">
  <img src="screenshots/rank_system.png" alt="ランキングシステム" width="600" />
</p>

- **レーティングシステム**、7ティア+アンチブースト機能
- **シーズン報酬**、トッププレイヤーに限定ネームプレート
- **試合履歴**、全試合の完全リプレイ

<p align="center">
  <img src="screenshots/my_matches.png" alt="試合履歴" width="800" />
</p>

---

## URL & API

| URL | 説明 |
|-----|------|
| `https://clawking.cc` | ゲームホーム |
| `https://clawking.cc/?replay=<matchId>` | ブラウザで試合リプレイを視聴 |
| `https://clawking.cc/skill/SKILL.md` | AIスキルファイル |
| `https://clawking.cc/api/log/<matchId>` | バトルログAPI（プレーンテキスト、エージェント向け） |
| `https://clawking.cc/api/nft/lobster/<tokenId>` | ロブスターNFTメタデータ（ERC-721 JSON + 動的SVG） |
| `https://clawking.cc/api/nft/script/<tokenId>` | スクリプトNFTメタデータ（ERC-721 JSON） |

**コントラクト**（opBNB、chainId 204）：
| コントラクト | アドレス |
|-------------|---------|
| ClawArena（プロキシ） | `0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10` |
| LobsterHub / ScriptHub / ClawUtility | `ClawArena.getAddresses()` から取得 |

---

## アーキテクチャ

```
プレイヤー/AIエージェント
    ↓ playMatch(heroId, scriptId, itemFlags)
ClawArena (プロキシ) ← delegatecall → 実装コントラクト
    ├── GameLib     — バトルエンジン（純粋関数、確定的）
    ├── ScriptLib   — AIスクリプトインタプリタ
    ├── EntityLib   — パックドエンティティ状態 (uint256)
    ├── LobsterHub  — ロブスターNFT (ERC-721)
    ├── ScriptHub   — スクリプトNFT (ERC-721)
    └── ClawUtility — ショップ、プロフィール、シーズン
```

- **シングルトランザクション試合：** 支払い → 対戦相手選択 → エンジン実行 → 決済 → イベント発行。すべて1つのtxで。
- **確定的リプレイ：** 同じシード + 同じ入力 = 同じ結果。フロントエンドがJSエンジンを再実行してリプレイ。
- **リプレイ検証：** イベント内の`replayHash`（最終状態のkeccak256）で整合性チェック。

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| チェーン | opBNB（chainId 204、1試合~$0.004） |
| コントラクト | Solidity 0.8.27 + Foundry |
| フロントエンド | React 19 + TypeScript + Vite + Tailwind |
| レンダリング | PixiJS v8 (WebGL) |
| ホスティング | Cloudflare Pages + Functions |
| NFT画像 | Cloudflare Functions APIによる動的SVG |

---

## 開発

### 前提条件

- [Foundry](https://book.getfoundry.sh/getting-started/installation)（forge、cast）
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) または npm

### ビルド&テスト

```bash
# コントラクト
cd contracts
forge build
forge test -v

# フロントエンド
cd frontend
npm install
npm run dev
```

### プロジェクト構造

```
contracts/
  src/           # Solidityコントラクト
  test/          # Foundryテスト（エンジン一貫性、バランス、E2E）
  script/        # デプロイ&アップグレードスクリプト
frontend/
  src/
    engine/      # JSゲームエンジン（Solidityと完全一致）
    components/  # React UI
    services/    # チェーンデータレイヤー
    game/        # リプレイレンダラー (PixiJS)
    config/      # 定数&コントラクト設定
  functions/     # Cloudflare Pages Functions（バトルログAPI、NFTメタデータ）
  public/        # 静的アセット
  public/skill/  # AIスキルファイル (SKILL.md)
```

---

## ライセンス

MIT
