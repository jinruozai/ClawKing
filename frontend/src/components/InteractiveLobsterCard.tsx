import React, { useState } from 'react';
import { Lobster, type LobsterTheme, DEFAULT_THEME } from './Lobster';

export interface InteractiveLobsterCardProps {
  theme?: LobsterTheme;
  id?: string;
  selected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'lg';
}

export function InteractiveLobsterCard({
  theme = DEFAULT_THEME,
  id,
  selected,
  onClick,
  children,
  className = '',
  size = 'sm',
}: InteractiveLobsterCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCharging, setIsCharging] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);

  const state = isAttacking ? 'attacking' as const : isCharging ? 'charging' as const : isHovered ? 'walking' as const : 'idle' as const;
  const isLarge = size === 'lg';

  return (
    <div
      className={`bg-black/50 border rounded-xl flex flex-col transition-colors cursor-pointer group ${
        isLarge ? 'p-0 gap-0' : 'p-4 gap-4'
      } ${selected ? 'border-orange-500/60 bg-orange-500/10' : 'border-white/5 hover:border-white/20'} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsCharging(false); setIsAttacking(false); }}
      onMouseDown={() => setIsCharging(true)}
      onMouseUp={() => { setIsCharging(false); setIsAttacking(true); setTimeout(() => setIsAttacking(false), 600); onClick?.(); }}
    >
      <div className={`relative overflow-hidden flex items-center justify-center group-hover:bg-white/10 transition-colors ${
        isLarge
          ? 'w-[15rem] h-[15rem] rounded-[32px] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]'
          : 'aspect-square bg-white/5 rounded-lg'
      }`}>
        {isLarge && <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />}
        <Lobster id={id} theme={theme} state={state} className={isLarge ? 'w-[10.5rem] h-[10.5rem] relative z-10 drop-shadow-lg' : 'w-full h-full'} />
      </div>
      {children}
    </div>
  );
}
