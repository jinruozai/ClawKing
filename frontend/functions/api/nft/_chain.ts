/**
 * Shared chain helpers for NFT metadata API.
 * Reads lobster/script data from opBNB via raw RPC calls (no ethers dependency).
 */

/** Decode bytes12 hex (24 hex chars) as UTF-8 string, trimming trailing zeros. */
function decodeBytes12(hex24: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex24.length; i += 2) {
    const b = parseInt(hex24.slice(i, i + 2), 16);
    if (b === 0) break;
    bytes.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const RPC_URL = 'https://opbnb-mainnet-rpc.bnbchain.org';
const ARENA = '0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10';

const SIG = {
  getAddresses: '0xa39fac12',
  getLobsterStats: '0xc5c22e3e',
  getLobsterVisual: '0x1ced1de5',
  getLobsterName: '0xf6c64dc3',
  getScriptBytes: '0xa2c8bc98',
  getScriptName: '0xad3e770a',
};

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function encodeUint(v: number): string {
  return v.toString(16).padStart(64, '0');
}

export async function getAddresses(): Promise<{ lobster: string; script: string }> {
  const r = (await ethCall(ARENA, SIG.getAddresses)).slice(2);
  return { lobster: '0x' + r.slice(24, 64), script: '0x' + r.slice(88, 128) };
}

export async function getLobsterData(hub: string, tokenId: number) {
  const [statsHex, visualHex, nameHex] = await Promise.all([
    ethCall(hub, SIG.getLobsterStats + encodeUint(tokenId)),
    ethCall(hub, SIG.getLobsterVisual + encodeUint(tokenId)),
    ethCall(hub, SIG.getLobsterName + encodeUint(tokenId)),
  ]);

  const s = BigInt(statsHex);
  const v = BigInt(visualHex);

  const rgb = (offset: number): [number, number, number] => [
    Number((v >> BigInt(offset * 8)) & 0xFFn),
    Number((v >> BigInt((offset + 1) * 8)) & 0xFFn),
    Number((v >> BigInt((offset + 2) * 8)) & 0xFFn),
  ];

  const name = decodeBytes12(nameHex.slice(2, 26));

  return {
    hp: Number(s & 0xFFn),
    atk: Number((s >> 8n) & 0xFFn),
    atkRange: Number((s >> 16n) & 0xFFn),
    speed: Number((s >> 24n) & 0xFFn),
    manaMax: Number((s >> 32n) & 0xFFn),
    skillEffect: Number((s >> 40n) & 0xFFFFn),
    skillPower: Number((s >> 56n) & 0xFFn),
    shell: rgb(0), claw: rgb(3), leg: rgb(6), eye: rgb(9), tail: rgb(12), aura: rgb(15), sub: rgb(18),
    name: name || `Lobster #${tokenId}`,
  };
}

export async function getScriptData(hub: string, tokenId: number) {
  const [bytesHex, nameHex] = await Promise.all([
    ethCall(hub, SIG.getScriptBytes + encodeUint(tokenId)),
    ethCall(hub, SIG.getScriptName + encodeUint(tokenId)),
  ]);

  // Decode bytes
  const hex = bytesHex.slice(2);
  const offset = parseInt(hex.slice(0, 64), 16) * 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16);
  const bytesData = hex.slice(offset + 64, offset + 64 + length * 2);

  // Parse script structure
  let numSlots = 0, numRules = 0;
  if (length > 0) {
    numSlots = parseInt(bytesData.slice(0, 2), 16);
    if (numSlots > 8) numSlots = 8;
    const rulesOff = (1 + numSlots * 8) * 2;
    if (rulesOff < bytesData.length) {
      numRules = parseInt(bytesData.slice(rulesOff, rulesOff + 2), 16);
      if (numRules > 16) numRules = 16;
    }
  }

  const name = decodeBytes12(nameHex.slice(2, 26));

  return {
    name: name || `Script #${tokenId}`,
    numSlots,
    numRules,
    size: length,
  };
}
