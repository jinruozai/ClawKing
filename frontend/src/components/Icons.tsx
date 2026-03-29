/** Reusable SVG icons */

export const MiniLobsterIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 4L15 10L13.5 16L12 20L10.5 16L9 10Z" />
    <path d="M8 7L3 3L2 9L6 12Z" />
    <path d="M16 7L21 3L22 9L18 12Z" />
    <path d="M10 4C8 2 5 2 3 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M14 4C16 2 19 2 21 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const LobsterCoinIcon = ({ className }: { className?: string }) => (
  <div className={`relative rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center border border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.5)] ${className}`}>
    <MiniLobsterIcon className="text-yellow-900 w-[85%] h-[85%]" />
  </div>
);

/** BNB icon — opBNB logo circle */
export const PolIcon = ({ className }: { className?: string }) => (
  <img src="/bnb_logo.png" alt="BNB" className={`rounded-full object-cover ${className}`} />
);

/** BNB amount display: icon + number + "BNB" label */
export const PolAmount = ({ amount, className, size = 'md', color }: {
  amount: number | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}) => {
  const sizes = {
    sm:  { icon: 'w-4 h-4', num: 'text-sm', label: 'text-[10px]' },
    md:  { icon: 'w-5 h-5', num: 'text-base', label: 'text-xs' },
    lg:  { icon: 'w-10 h-10 border border-purple-500/30', num: 'text-3xl', label: 'text-lg' },
  };
  const s = sizes[size];
  const textColor = color || 'text-white';
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <PolIcon className={s.icon} />
      <span className={`font-tech font-bold ${s.num} ${textColor}`}>{amount}</span>
      <span className={`${s.label} text-zinc-400`}>BNB</span>
    </span>
  );
};
