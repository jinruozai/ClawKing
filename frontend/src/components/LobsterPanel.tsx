import React, { useState } from 'react';
import { X, Download, Activity } from 'lucide-react';
import { DEFAULT_HERO_NAMES } from '../game/engineData';
import { DEFAULT_THEME } from './Lobster';
import { t, type Lang } from '../i18n';
import { InteractiveLobsterCard } from './InteractiveLobsterCard';
import { getLobsterCSS, STATE_DEFS } from '../game/lobsterCSS';

function LobsterPreviewCard({ heroId, lang }: { heroId: number; lang: Lang }) {
  const hero = DEFAULT_HERO_NAMES[heroId];
  return (
    <InteractiveLobsterCard id={`lobster-svg-${heroId}`}>
      <div>
        <h3 className="text-lg font-bold text-white">{t(`hero.name.${heroId}` as any)}</h3>
        <p className="text-xs text-white/50 mt-1 line-clamp-3">{t(`hero.desc.${heroId}` as any)}</p>
      </div>
    </InteractiveLobsterCard>
  );
}

function LobsterPanel({ onClose, lang }: { onClose: () => void; lang: Lang }) {
  const [exporting, setExporting] = useState(false);

  const handleExportAll = async () => {
    setExporting(true);
    const heroIds = DEFAULT_HERO_NAMES.map((_: any, i: number) => i);

    for (const hId of heroIds) {
      const svgElement = document.getElementById(`lobster-svg-${hId}`);
      if (!svgElement) continue;

      const canvas = document.createElement('canvas');
      const frameSize = 128;
      canvas.width = frameSize * 8;
      canvas.height = frameSize * 3;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let row = 0; row < STATE_DEFS.length; row++) {
        const state = STATE_DEFS[row];
        for (let col = 0; col < 8; col++) {
          const timeOffset = state.looping
            ? (col / 8) * state.duration
            : (col / 7) * state.duration;

          await new Promise<void>((resolve) => {
            const clone = svgElement.cloneNode(true) as SVGElement;
            clone.setAttribute('width', frameSize.toString());
            clone.setAttribute('height', frameSize.toString());

            // Remove page-level state classes (they depend on page CSS which won't be available)
            clone.classList.remove('is-idle', 'is-walking', 'is-attacking', 'is-charging');

            // FIX: Embed ALL animation CSS (keyframes + rules + seek) directly into the SVG.
            // The original bug was that serialized SVGs lose access to page stylesheets,
            // so every frame rendered identically as the un-animated default state.
            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.textContent = getLobsterCSS(state.name, timeOffset);
            clone.insertBefore(style, clone.firstChild);

            const svgData = new XMLSerializer().serializeToString(clone);
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, col * frameSize, row * frameSize, frameSize, frameSize);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
          });
        }
      }

      const link = document.createElement('a');
      link.download = `lobster_${hId}_spritesheet.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      await new Promise((r) => setTimeout(r, 500));
    }
    setExporting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white z-10">
          <X className="w-6 h-6" />
        </button>

        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
          <h2 className="text-2xl font-display uppercase tracking-wider text-white">Lobster Variants</h2>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {DEFAULT_HERO_NAMES.map((h: any, i: number) => (
            <LobsterPreviewCard key={h.id} heroId={i} lang={lang} />
          ))}
        </div>

        <div className="p-6 border-t border-white/10 flex justify-center shrink-0">
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-xl font-bold uppercase text-sm disabled:opacity-50 transition-colors"
          >
            {exporting ? <Activity className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {exporting ? 'Exporting...' : 'Export All Spritesheets'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LobsterPanel;
