import { ethers } from 'ethers';
import { CHAIN_ID, CHAIN_NAME, RPC_URL } from '../config/contracts';

let _readProvider: ethers.JsonRpcProvider | null = null;

export function getReadProvider(): ethers.JsonRpcProvider {
  if (!_readProvider) _readProvider = new ethers.JsonRpcProvider(RPC_URL);
  return _readProvider;
}

export async function connectWallet() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('NO_WALLET');

  const provider = new ethers.BrowserProvider(ethereum);
  await provider.send('eth_requestAccounts', []);

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
    });
  } catch (e: any) {
    if (e.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${CHAIN_ID.toString(16)}`,
          chainName: CHAIN_NAME,
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          blockExplorerUrls: ['https://opbnbscan.com'],
        }],
      });
    }
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const balance = Number(ethers.formatEther(await provider.getBalance(address)));
  return { provider, signer, address, balance };
}
