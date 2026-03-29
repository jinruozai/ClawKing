import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * 统一地址显示组件 — 点击复制完整地址
 *
 * @param address  完整地址
 * @param short    是否缩短显示（默认 true，显示 0x1234...abcd）
 * @param chars    前后各显示多少字符（默认 [6, 4]）
 * @param className 自定义样式
 * @param iconSize 复制图标大小（默认 12）
 * @param showIcon 是否显示复制图标（默认 true）
 */
export function CopyAddress({
  address,
  short = true,
  chars = [6, 4],
  className = '',
  iconSize = 12,
  showIcon = true,
}: {
  address: string;
  short?: boolean;
  chars?: [number, number];
  className?: string;
  iconSize?: number;
  showIcon?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  const display = short && address.length > chars[0] + chars[1] + 3
    ? `${address.slice(0, chars[0])}...${address.slice(-chars[1])}`
    : address;

  return (
    <span
      onClick={handleCopy}
      title={address}
      className={`inline-flex items-center gap-1 cursor-pointer font-mono transition-colors hover:text-orange-400 ${className}`}
    >
      {display}
      {showIcon && (
        copied
          ? <Check style={{ width: iconSize, height: iconSize }} className="text-green-400 shrink-0" />
          : <Copy style={{ width: iconSize, height: iconSize }} className="opacity-40 group-hover:opacity-100 shrink-0" />
      )}
    </span>
  );
}
