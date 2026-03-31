import { t } from '../i18n';
import { lobsterDisplayName } from '../config/game';
import { InteractiveLobsterCard } from './InteractiveLobsterCard';
import { partColorsToTheme, type LobsterPartColors, type LobsterStats } from './Lobster';
import type { LobsterNFT } from '../services/dataStore';

function nftToPartColors(nft: LobsterNFT): LobsterPartColors {
  return { shell: nft.shell, claw: nft.claw, leg: nft.leg, eye: nft.eye, tail: nft.tail, aura: nft.aura, sub: nft.sub };
}

function nftToStats(nft: LobsterNFT): LobsterStats {
  return { hp: nft.hp, atk: nft.atk, speed: nft.speed, atkRange: nft.atkRange, manaMax: nft.manaMax, skillPower: nft.skillPower };
}

export function MintSuccessDialog({ nft, onClose }: {
  nft: LobsterNFT;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6" onMouseDown={e => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4 py-4">
          {/* 闪光背景 */}
          <div className="relative">
            <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-orange-500/30 via-yellow-400/20 to-orange-500/30 blur-xl animate-pulse" />
            <div className="relative w-40 h-40">
              <InteractiveLobsterCard
                theme={partColorsToTheme(nftToPartColors(nft), nftToStats(nft))}
                selected={false}
                onClick={() => {}}
                className="!p-2 !gap-1 pointer-events-none"
              >
                <p className="text-xs font-bold text-white text-center truncate">{lobsterDisplayName(nft.tokenId, nft.name)}</p>
              </InteractiveLobsterCard>
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-display text-orange-400 tracking-wider">{t('mint.lobster.success')}</p>
            <p className="text-sm text-white font-bold">{lobsterDisplayName(nft.tokenId, nft.name)}</p>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm hover:scale-[1.02] transition-transform shadow-lg"
          >
            {t('hero.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
