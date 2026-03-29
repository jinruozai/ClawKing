import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * NFT 地址显示组件 — 显示 0x1234...abcd #tokenId，复制完整地址+编号
 */
export function CopyNFTAddress({
  address,
  tokenId,
  chars = [6, 4],
  className = '',
  iconSize = 12,
}: {
  address: string;
  tokenId: number;
  chars?: [number, number];
  className?: string;
  iconSize?: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(`${address} #${tokenId}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address, tokenId]);

  const shortAddr = address.length > chars[0] + chars[1] + 3
    ? `${address.slice(0, chars[0])}...${address.slice(-chars[1])}`
    : address;

  return (
    <span
      onClick={handleCopy}
      title={`${address} #${tokenId}`}
      className={`inline-flex items-center gap-1 cursor-pointer font-mono transition-colors hover:text-orange-400 ${className}`}
    >
      <span className="text-zinc-400">NFT:</span>{shortAddr} <span className="text-zinc-500">#{tokenId}</span>
      {copied
        ? <Check style={{ width: iconSize, height: iconSize }} className="text-green-400 shrink-0" />
        : <Copy style={{ width: iconSize, height: iconSize }} className="opacity-40 shrink-0" />
      }
    </span>
  );
}
