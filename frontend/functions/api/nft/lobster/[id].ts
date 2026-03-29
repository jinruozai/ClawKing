/**
 * Cloudflare Pages Function: /api/nft/lobster/:id
 * Returns ERC721 metadata JSON with dynamically generated lobster SVG.
 */
import { getAddresses, getLobsterData } from '../_chain';
import { getLobsterCSS } from '../../../../src/game/lobsterCSS';

type RGB = [number, number, number];

// ── Color math (mirrors Lobster.tsx) ──
function rgb(c: RGB): string { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function lighten(c: RGB, t: number): RGB {
  return [Math.min(255, Math.round(c[0] + (255 - c[0]) * t)), Math.min(255, Math.round(c[1] + (255 - c[1]) * t)), Math.min(255, Math.round(c[2] + (255 - c[2]) * t))];
}
function satDarken(c: RGB, power: number, factor: number): RGB {
  const mx = Math.max(c[0], c[1], c[2]) || 1;
  return [Math.round(c[0] * Math.pow(c[0] / mx, power) * factor), Math.round(c[1] * Math.pow(c[1] / mx, power) * factor), Math.round(c[2] * Math.pow(c[2] / mx, power) * factor)];
}
function partColors(main: RGB) {
  return {
    primary: rgb(main), mid: rgb(satDarken(main, 1, 0.8)), dark: rgb(satDarken(main, 1, 0.3)),
    clawEnd: rgb(satDarken(main, 1, 0.5)), legEnd: rgb(satDarken(main, 4, 1.0)),
    highlight: rgb(lighten(main, 0.4)), stroke: rgb(lighten(main, 0.25)),
  };
}
function lerp(v: number, min: number, max: number, oMin: number, oMax: number): number {
  return oMin + Math.max(0, Math.min(1, (v - min) / (max - min))) * (oMax - oMin);
}

const SKILL_NAMES: Record<number, string> = {
  0x0001: 'Immobilize', 0x0002: 'Disarm', 0x0004: 'Blind', 0x0008: 'Silence',
  0x0010: 'Lifesteal', 0x0020: 'Vigor', 0x0040: 'Execute', 0x0080: 'ManaBurn',
  0x0100: 'Stealth', 0x0200: 'Thorns', 0x0400: 'Critical', 0x0800: 'Cleanse', 0x1000: 'Haste',
};

function skillName(effect: number): string {
  for (const [bit, name] of Object.entries(SKILL_NAMES)) if ((effect & Number(bit)) !== 0) return name;
  return 'None';
}

function generateSVG(data: Awaited<ReturnType<typeof getLobsterData>>): string {
  const s = partColors(data.shell);
  const c = partColors(data.claw);
  const l = partColors(data.leg);
  const t = partColors(data.tail);
  const strokeColor = s.stroke;
  const neonEye = rgb(data.eye);
  const neonAntenna = rgb(data.aura);
  const eyeHighlight = partColors(data.eye).highlight;
  const tailMid = t.mid;

  const clawScale = lerp(data.atk, 1, 11, 0.6, 1.6).toFixed(2);
  const headScale = lerp(data.hp, 10, 40, 0.8, 1.4).toFixed(2);
  const legScale = lerp(data.speed, 0, 5, 0.8, 1.5).toFixed(2);
  const antennaScale = lerp(data.atkRange, 1, 4, 0.4, 1.5).toFixed(2);
  const coreRadius = Math.round(12 * lerp(data.manaMax, 3, 6, 0.8, 1.5));
  const tailScaleV = lerp(data.skillPower, 1, 10, 0.6, 1.6).toFixed(2);

  const skill = skillName(data.skillEffect);

  const SZ = 512;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SZ} ${SZ}" width="${SZ}" height="${SZ}">
<defs>
  <linearGradient id="gc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${s.primary}"/><stop offset="50%" stop-color="${s.mid}"/><stop offset="100%" stop-color="${s.dark}"/></linearGradient>
  <linearGradient id="gl" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${l.primary}"/><stop offset="100%" stop-color="${l.legEnd}"/></linearGradient>
  <linearGradient id="gk" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c.primary}"/><stop offset="100%" stop-color="${c.clawEnd}"/></linearGradient>
  <linearGradient id="gt" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${t.primary}"/><stop offset="50%" stop-color="${t.mid}"/><stop offset="100%" stop-color="${t.dark}"/></linearGradient>
  <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<!-- Lobster with CSS animation frozen at idle frame 5 (t=1.0s) -->
<style>${getLobsterCSS('is-idle', 1.0)}</style>
<g transform="translate(0, 10) scale(0.95)">
  <g class="lobster-body"><g class="lobster-body-inner">
  <!-- Legs Left -->
  <g transform="translate(212,200) scale(${legScale}) translate(-212,-200)">
    <polyline class="leg-l-1" points="212,200 160,190 140,230" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
    <polyline class="leg-l-2" points="218,230 160,240 140,280" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
    <polyline class="leg-l-3" points="226,260 170,280 150,330" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
  </g>
  <!-- Legs Right -->
  <g transform="translate(300,200) scale(${legScale}) translate(-300,-200)">
    <polyline class="leg-r-1" points="300,200 352,190 372,230" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
    <polyline class="leg-r-2" points="294,230 352,240 372,280" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
    <polyline class="leg-r-3" points="286,260 342,280 362,330" fill="none" stroke="url(#gl)" stroke-width="10" stroke-linejoin="bevel"/>
  </g>
  <!-- Tail (nested for cascading rotation) -->
  <g transform="translate(256,270) scale(1,${tailScaleV}) translate(-256,-270)">
  <g class="tail-1">
    <polygon points="236,270 276,270 286,310 226,310" fill="url(#gt)" stroke="${strokeColor}" stroke-width="2"/>
    <g class="tail-2">
      <polygon points="230,320 282,320 276,360 236,360" fill="url(#gt)" stroke="${strokeColor}" stroke-width="2"/>
      <g class="tail-3">
        <polygon points="236,370 276,370 266,410 246,410" fill="url(#gt)" stroke="${strokeColor}" stroke-width="2"/>
        <g class="tail-4">
          <polygon points="240,420 272,420 260,460 252,460" fill="url(#gt)" stroke="${strokeColor}" stroke-width="2"/>
          <g class="tail-5">
            <polygon points="256,460 286,500 256,520 226,500" fill="${tailMid}" stroke="#fff" stroke-width="1"/>
          </g>
        </g>
      </g>
    </g>
  </g>
  </g>
  <!-- Left Claw -->
  <g transform="translate(226,150) scale(${clawScale}) translate(-226,-150)">
    <g class="claw-left">
      <polygon points="230,160 160,110 180,90 240,140" fill="url(#gc)" stroke="${strokeColor}" stroke-width="2"/>
      <polygon points="160,110 130,50 160,10 200,30 190,70 180,90" fill="url(#gk)" stroke="${strokeColor}" stroke-width="3"/>
      <polygon points="160,10 170,50 200,30" fill="${s.dark}"/>
      <polygon points="130,50 160,10 180,90" fill="url(#gl)" opacity="0.6"/>
    </g>
  </g>
  <!-- Right Claw -->
  <g transform="translate(286,150) scale(${clawScale}) translate(-286,-150)">
    <g class="claw-right">
      <polygon points="282,160 352,110 332,90 272,140" fill="url(#gc)" stroke="${strokeColor}" stroke-width="2"/>
      <polygon points="352,110 382,50 352,10 312,30 322,70 332,90" fill="url(#gk)" stroke="${strokeColor}" stroke-width="3"/>
      <polygon points="352,10 342,50 312,30" fill="${s.dark}"/>
      <polygon points="382,50 352,10 332,90" fill="url(#gl)" opacity="0.6"/>
    </g>
  </g>
  <!-- Carapace -->
  <g transform="translate(256,200) scale(${headScale}) translate(-256,-200)">
    <polygon points="256,120 286,150 300,200 286,260 256,280 226,260 212,200 226,150" fill="url(#gc)" stroke="${strokeColor}" stroke-width="3"/>
    <polygon points="256,120 286,150 256,200 226,150" fill="url(#gl)" opacity="0.8"/>
    <polygon points="256,200 286,260 256,280 226,260" fill="${s.mid}" opacity="0.6"/>
  </g>
  <!-- Eyes -->
  <circle cx="256" cy="180" r="${coreRadius}" fill="${neonEye}" filter="url(#glow)" class="energy-core"/>
  <polygon points="256,160 266,180 256,200 246,180" fill="${eyeHighlight}"/>
  <circle cx="236" cy="140" r="4" fill="${neonEye}" filter="url(#glow)"/>
  <circle cx="276" cy="140" r="4" fill="${neonEye}" filter="url(#glow)"/>
  <!-- Antennae -->
  <g transform="translate(256,120) scale(1,${antennaScale}) translate(-256,-120)">
    <path class="antenna-l" d="M256 120 Q 245 50 220 -20" fill="none" stroke="${neonAntenna}" stroke-width="4" stroke-linecap="round" filter="url(#glow)"/>
    <path class="antenna-r" d="M256 120 Q 267 50 292 -20" fill="none" stroke="${neonAntenna}" stroke-width="4" stroke-linecap="round" filter="url(#glow)"/>
  </g>
  </g></g><!-- end lobster-body -->
</g>
</svg>`;
}

export const onRequest: PagesFunction = async (context) => {
  const tokenId = Number(context.params.id);
  if (isNaN(tokenId) || tokenId < 0) return new Response('Invalid token ID', { status: 400 });

  try {
    const addrs = await getAddresses();
    const data = await getLobsterData(addrs.lobster, tokenId);
    const svg = generateSVG(data);
    const skill = skillName(data.skillEffect);

    // ?image → return SVG directly for browser preview
    const url = new URL(context.request.url);
    if (url.searchParams.has('image')) {
      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const metadata = {
      name: data.name,
      description: `ClawKing Lobster NFT — ${skill} warrior`,
      image: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))),
      attributes: [
        { trait_type: 'HP', value: data.hp },
        { trait_type: 'ATK', value: data.atk },
        { trait_type: 'Range', value: data.atkRange },
        { trait_type: 'Speed', value: data.speed },
        { trait_type: 'Mana', value: data.manaMax },
        { trait_type: 'Skill', value: skill },
        { trait_type: 'Power', value: data.skillPower },
      ],
    };

    return new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
};
