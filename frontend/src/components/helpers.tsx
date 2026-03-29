import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { t } from '../i18n';

// ── Feature Card ──
export function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl hover:bg-white/[0.04] transition-all duration-300 group hover:-translate-y-1 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <div className="w-14 h-14 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-gradient-to-br group-hover:from-orange-500 group-hover:to-red-600 group-hover:text-white group-hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]">
        {icon}
      </div>
      <h3 className="text-white font-display text-2xl tracking-wide mb-3">{title}</h3>
      <p className="text-zinc-400 font-sans text-sm leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

// ── Tier color helper ──
export function tierColor(rankId: string) {
  const map: Record<string, string> = {
    'lobster-emperor': 'bg-red-500/20 text-red-400',
    'lobster-king': 'bg-pink-500/20 text-pink-400',
    'divine-lobster': 'bg-purple-500/20 text-purple-400',
    'lobster-general': 'bg-teal-500/20 text-teal-400',
    'lobster-soldier': 'bg-yellow-500/20 text-yellow-400',
    'big-lobster': 'bg-zinc-400/20 text-zinc-300',
    'little-lobster': 'bg-amber-700/20 text-amber-500',
  };
  return map[rankId] || 'bg-zinc-500/20 text-zinc-400';
}

// ── Item helpers ──
export function hasItemBit(mask: bigint | string, bitId: number): boolean {
  try {
    const m = typeof mask === 'string' ? BigInt(mask || '0') : mask;
    return (m & (1n << BigInt(bitId))) !== 0n;
  } catch { return false; }
}

// ── Flag SVG icons ──
export function FlagIcon({ code, className = '' }: { code: string; className?: string }) {
  const flags: Record<string, React.ReactNode> = {
    US: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#B22234" />
        {[1,3,5,7,9,11].map(i => <rect key={i} y={i * 16/13} width="24" height={16/13} fill="#fff" />)}
        <rect width="10" height={16*7/13} fill="#3C3B6E" />
        {[0,1,2,3,4].map(r => [0,1,2,3,4,5].map(c => <circle key={`${r}-${c}`} cx={0.8+c*1.6} cy={0.6+r*1.6} r="0.4" fill="#fff" />))}
      </svg>
    ),
    CN: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#DE2910" />
        <polygon points="4,2.4 4.6,4.2 6.4,4.2 5,5.2 5.5,7.2 4,6 2.5,7.2 3,5.2 1.6,4.2 3.4,4.2" fill="#FFDE00" />
        <polygon points="8,1 8.3,1.8 9.2,1.8 8.5,2.3 8.7,3.2 8,2.7 7.3,3.2 7.5,2.3 6.8,1.8 7.7,1.8" fill="#FFDE00" />
        <polygon points="10,2.8 10.3,3.6 11.2,3.6 10.5,4.1 10.7,5 10,4.5 9.3,5 9.5,4.1 8.8,3.6 9.7,3.6" fill="#FFDE00" />
        <polygon points="10,5.6 10.3,6.4 11.2,6.4 10.5,6.9 10.7,7.8 10,7.3 9.3,7.8 9.5,6.9 8.8,6.4 9.7,6.4" fill="#FFDE00" />
        <polygon points="8,7.6 8.3,8.4 9.2,8.4 8.5,8.9 8.7,9.8 8,9.3 7.3,9.8 7.5,8.9 6.8,8.4 7.7,8.4" fill="#FFDE00" />
      </svg>
    ),
    JP: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#fff" />
        <circle cx="12" cy="8" r="4.8" fill="#BC002D" />
      </svg>
    ),
    KR: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#fff" />
        <circle cx="12" cy="8" r="3.8" fill="#003478" />
        <path d="M12,4.2 A3.8,3.8 0 0,1 12,8 A1.9,1.9 0 0,0 12,11.8 A3.8,3.8 0 0,1 12,4.2" fill="#C60C30" />
        <path d="M12,4.2 A1.9,1.9 0 0,1 12,8" fill="#C60C30" />
        <rect x="3" y="3" width="1" height="3.5" rx="0.3" fill="#000" transform="rotate(-30 4 5)" />
        <rect x="4.2" y="2.5" width="1" height="3.5" rx="0.3" fill="#000" transform="rotate(-30 5 4.5)" />
        <rect x="19" y="9.5" width="1" height="3.5" rx="0.3" fill="#000" transform="rotate(-30 19.5 11)" />
        <rect x="20.2" y="9" width="1" height="3.5" rx="0.3" fill="#000" transform="rotate(-30 20.7 10.5)" />
      </svg>
    ),
    ES: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="4" fill="#AA151B" />
        <rect y="4" width="24" height="8" fill="#F1BF00" />
        <rect y="12" width="24" height="4" fill="#AA151B" />
      </svg>
    ),
    BR: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#009B3A" />
        <polygon points="12,1.5 22,8 12,14.5 2,8" fill="#FEDF00" />
        <circle cx="12" cy="8" r="3.5" fill="#002776" />
      </svg>
    ),
    RU: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="5.33" fill="#fff" />
        <rect y="5.33" width="24" height="5.33" fill="#0039A6" />
        <rect y="10.66" width="24" height="5.34" fill="#D52B1E" />
      </svg>
    ),
    TR: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#E30A17" />
        <circle cx="9.5" cy="8" r="4" fill="#fff" />
        <circle cx="10.5" cy="8" r="3.2" fill="#E30A17" />
        <polygon points="14,8 12.5,7 13.2,8.5 12.5,9 13.8,8.5" fill="#fff" />
      </svg>
    ),
    VN: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#DA251D" />
        <polygon points="12,3 13.2,6.8 17,6.8 14,9 15,13 12,10.5 9,13 10,9 7,6.8 10.8,6.8" fill="#FFFF00" />
      </svg>
    ),
    TW: (
      <svg viewBox="0 0 24 16" className={className}>
        <rect width="24" height="16" fill="#FE0000" />
        <rect width="12" height="8" fill="#000095" />
        <circle cx="6" cy="4" r="2.5" fill="#fff" />
        <circle cx="6" cy="4" r="1.8" fill="#000095" />
      </svg>
    ),
  };
  return <>{flags[code] || code}</>;
}

// ── Time formatting ──
export function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.mAgo').replace('{n}', String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('time.hAgo').replace('{n}', String(hrs));
  return t('time.dAgo').replace('{n}', String(Math.floor(hrs / 24)));
}

// ── Toast system ──
export interface ToastItem {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

let _toastId = 0;
export function nextToastId() { return ++_toastId; }

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`pointer-events-auto px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 cursor-pointer max-w-md ${
              toast.type === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-300' :
              toast.type === 'success' ? 'bg-green-500/20 border-green-500/40 text-green-300' :
              'bg-white/10 border-white/20 text-zinc-200'
            }`}
            onClick={() => onDismiss(toast.id)}
          >
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
