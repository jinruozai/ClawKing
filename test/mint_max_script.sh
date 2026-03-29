#!/bin/bash
source <(grep '^TEST_MNEMONIC' ../.env)

RPC=https://opbnb-mainnet-rpc.bnbchain.org
SCRIPT_HUB=0x4F22314Ebb3f23aaD1521a9fcb8532a3Af8C26EA

# Build 818-byte max script hex
SCRIPT_HEX=$(node -e "
const b = new Uint8Array(818);
b[0] = 8;
for (let i = 0; i < 8; i++) b[1 + i * 8 + 4] = 0xFF;
b[65] = 16;
for (let i = 0; i < 16; i++) { b[66 + i * 47 + 44] = 3; b[66 + i * 47 + 45] = 6; }
let h = '0x';
for (const x of b) h += x.toString(16).padStart(2, '0');
process.stdout.write(h);
")

echo "Hex length: ${#SCRIPT_HEX} chars = $(( (${#SCRIPT_HEX} - 2) / 2 )) bytes"

/c/Users/time_/.foundry/bin/cast send $SCRIPT_HUB \
  "mintScript(bytes12,bytes)" \
  "0x4d617853637269707400" \
  "$SCRIPT_HEX" \
  --value 0.001ether \
  --gas-limit 500000 \
  --mnemonic "$TEST_MNEMONIC" \
  --rpc-url $RPC
