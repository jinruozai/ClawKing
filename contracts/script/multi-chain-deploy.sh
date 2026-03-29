#!/bin/bash
# ── 多链快速部署测试 ──
# 用法：
#   1. 先 source ../.env 加载 DEPLOYER_PRIVATE_KEY
#   2. ./script/multi-chain-deploy.sh [chain_name]
#      不传参数 = 列出所有链
#      传参数   = 只部署到指定链
#
# 每条链只需要：免费测试网 RPC + 测试币
# 主网测试也行，部署 gas 大约 5-10M，成本参考下表

set -e

# ── 候选链配置（名称 / RPC / chainId / 区块浏览器）──
declare -A CHAINS
declare -A CHAIN_IDS
declare -A EXPLORERS

# --- 测试网 ---
CHAINS[mantle_testnet]="https://rpc.sepolia.mantle.xyz"
CHAIN_IDS[mantle_testnet]=5003
EXPLORERS[mantle_testnet]="https://sepolia.mantlescan.xyz"

CHAINS[opbnb_testnet]="https://opbnb-testnet-rpc.bnbchain.org"
CHAIN_IDS[opbnb_testnet]=5611
EXPLORERS[opbnb_testnet]="https://testnet.opbnbscan.com"

CHAINS[sonic_testnet]="https://rpc.blaze.soniclabs.com"
CHAIN_IDS[sonic_testnet]=57054
EXPLORERS[sonic_testnet]="https://testnet.sonicscan.org"

CHAINS[celo_testnet]="https://alfajores-forno.celo-testnet.org"
CHAIN_IDS[celo_testnet]=44787
EXPLORERS[celo_testnet]="https://alfajores.celoscan.io"

CHAINS[base_sepolia]="https://sepolia.base.org"
CHAIN_IDS[base_sepolia]=84532
EXPLORERS[base_sepolia]="https://sepolia.basescan.org"

CHAINS[arb_sepolia]="https://sepolia-rollup.arbitrum.io/rpc"
CHAIN_IDS[arb_sepolia]=421614
EXPLORERS[arb_sepolia]="https://sepolia.arbiscan.io"

# --- 主网（小心，要真金白银）---
CHAINS[mantle]="https://rpc.mantle.xyz"
CHAIN_IDS[mantle]=5000
EXPLORERS[mantle]="https://mantlescan.xyz"

CHAINS[opbnb]="https://opbnb-mainnet-rpc.bnbchain.org"
CHAIN_IDS[opbnb]=204
EXPLORERS[opbnb]="https://opbnbscan.com"

CHAINS[sonic]="https://rpc.soniclabs.com"
CHAIN_IDS[sonic]=146
EXPLORERS[sonic]="https://sonicscan.org"

CHAINS[celo]="https://forno.celo.org"
CHAIN_IDS[celo]=42220
EXPLORERS[celo]="https://celoscan.io"

CHAINS[polygon]="https://polygon-mainnet.g.alchemy.com/v2/aqa2zHkdB_rcT3GwfvsJV"
CHAIN_IDS[polygon]=137
EXPLORERS[polygon]="https://polygonscan.com"

# ── 检查环境 ──
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "ERROR: DEPLOYER_PRIVATE_KEY not set. Run: source ../.env"
  exit 1
fi

# ── 列出所有链 ──
list_chains() {
  echo "=== Available Chains ==="
  echo ""
  echo "Testnets (free):"
  for name in mantle_testnet opbnb_testnet sonic_testnet celo_testnet base_sepolia arb_sepolia; do
    echo "  $name  (chainId: ${CHAIN_IDS[$name]})"
  done
  echo ""
  echo "Mainnets (costs real tokens):"
  for name in mantle opbnb sonic celo polygon; do
    echo "  $name  (chainId: ${CHAIN_IDS[$name]})"
  done
  echo ""
  echo "Usage: $0 <chain_name>"
  echo "Example: $0 mantle_testnet"
}

# ── 部署到指定链 ──
deploy_to() {
  local name=$1
  local rpc=${CHAINS[$name]}
  local chain_id=${CHAIN_IDS[$name]}
  local explorer=${EXPLORERS[$name]}

  if [ -z "$rpc" ]; then
    echo "ERROR: Unknown chain '$name'"
    list_chains
    exit 1
  fi

  echo "============================================"
  echo "Deploying to: $name (chainId: $chain_id)"
  echo "RPC: $rpc"
  echo "Explorer: $explorer"
  echo "============================================"

  # 先检查连接
  echo "Testing RPC connection..."
  local block=$(cast block-number --rpc-url "$rpc" 2>/dev/null)
  if [ -z "$block" ]; then
    echo "FAILED: Cannot connect to $name RPC"
    return 1
  fi
  echo "Connected! Current block: $block"

  # 检查余额
  local deployer=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
  local balance=$(cast balance "$deployer" --rpc-url "$rpc" --ether 2>/dev/null)
  echo "Deployer: $deployer"
  echo "Balance: $balance"

  # 检查 gas price
  local gas_price=$(cast gas-price --rpc-url "$rpc" 2>/dev/null)
  echo "Gas price: $gas_price wei ($(echo "scale=4; $gas_price / 1000000000" | bc) gwei)"

  echo ""
  read -p "Proceed with deployment? (y/N) " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Skipped."
    return 0
  fi

  # 部署
  forge script script/Deploy.s.sol \
    --rpc-url "$rpc" \
    --broadcast \
    -vvv \
    2>&1 | tee "deploy_${name}.log"

  echo ""
  echo "=== Deployment to $name complete ==="
  echo "Log saved to: deploy_${name}.log"
  echo "Check contracts at: $explorer"

  # 部署后测试 playMatch gas 估算
  echo ""
  echo "Extracting deployed addresses from log..."
  local arena_proxy=$(grep "ArenaProxy:" "deploy_${name}.log" | awk '{print $2}' | head -1)
  if [ -n "$arena_proxy" ]; then
    echo "ArenaProxy: $arena_proxy"
    echo ""
    echo "Testing playMatch gas estimate..."
    # 估算 playMatch gas（用默认龙虾0和脚本0）
    local entry_fee="8000000000000000000" # 8 ether in wei
    cast estimate "$arena_proxy" \
      "playMatch(uint256,uint256,uint8)" 0 0 0 \
      --value "$entry_fee" \
      --from "$deployer" \
      --rpc-url "$rpc" 2>/dev/null && echo "Gas estimate obtained!" || echo "Gas estimate failed (might need entry fee adjustment)"
  fi
}

# ── Main ──
if [ -z "$1" ]; then
  list_chains
else
  deploy_to "$1"
fi
