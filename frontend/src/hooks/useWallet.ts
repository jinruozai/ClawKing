import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { connectWallet } from '../services/wallet';
import { toast } from '../services/toast';
import { t } from '../i18n';

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [balance, setBalance] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const r = await connectWallet();
      setAddress(r.address);
      setSigner(r.signer);
      setBalance(r.balance);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg === 'NO_WALLET') {
        toast.error(t('toast.noWallet'));
      } else if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED')) {
        // User cancelled — no toast needed
      } else {
        toast.error(t('toast.walletConnectFailed'));
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  // 自动重连：页面加载时检查 MetaMask 是否已授权
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts.length > 0) connect();
    }).catch(() => {});

    // 账号切换时直接用新账户重连
    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length > 0) {
        try {
          const r = await connectWallet();
          setAddress(r.address);
          setSigner(r.signer);
          setBalance(r.balance);
        } catch {}
      } else {
        setAddress(null); setSigner(null); setBalance(0);
      }
    };
    const handleChainChanged = () => { window.location.reload(); };
    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setBalance(0);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!signer) return;
    try {
      const bal = await signer.provider!.getBalance(await signer.getAddress());
      setBalance(Number(ethers.formatEther(bal)));
    } catch {}
  }, [signer]);

  // 每30秒自动刷新余额
  useEffect(() => {
    if (!signer) return;
    const id = setInterval(refreshBalance, 30_000);
    return () => clearInterval(id);
  }, [signer, refreshBalance]);

  return {
    address,
    signer,
    balance,
    connecting,
    connect,
    disconnect,
    refreshBalance,
    shortAddr: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '',
    connected: !!address,
  };
}
