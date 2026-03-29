/**
 * lobsterCSS — Lobster SVG animation CSS for standalone rendering.
 *
 * Shared by: LobsterPanel (export spritesheets) + spriteCache (runtime frame generation).
 * Uses animation-play-state: paused + negative animation-delay to freeze at a specific frame.
 */

const KEYFRAMES = `
@keyframes breathe {
  0%, 100% { transform: scale(1) translateY(0); }
  50% { transform: scale(1.02) translateY(-3px); }
}
@keyframes tailSway {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
}
@keyframes floatLeft {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(5deg) scale(1.05) translate(2px, -5px); }
}
@keyframes floatRight {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(-5deg) scale(1.05) translate(-2px, -5px); }
}
@keyframes idleAntennaL {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(5deg); }
}
@keyframes idleAntennaR {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-5deg); }
}
@keyframes bodyBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes walkLeg {
  0%, 100% { transform: rotate(-10deg); }
  50% { transform: rotate(10deg); }
}
@keyframes walkLegReverse {
  0%, 100% { transform: rotate(10deg); }
  50% { transform: rotate(-10deg); }
}
@keyframes attackBody {
  0% { transform: translateY(0) scale(1); }
  15% { transform: translateY(10px) scale(0.95); }
  35% { transform: translateY(-15px) scale(1.05); }
  50% { transform: translateY(-5px) scale(1.02); }
  70% { transform: translateY(-15px) scale(1.05); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes attackTail {
  0% { transform: rotate(0deg); }
  15% { transform: rotate(8deg); }
  35% { transform: rotate(-6deg); }
  50% { transform: rotate(3deg); }
  70% { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); }
}
@keyframes attackLegs {
  0% { transform: rotate(0deg); }
  15% { transform: rotate(15deg); }
  35% { transform: rotate(-15deg); }
  50% { transform: rotate(5deg); }
  70% { transform: rotate(-15deg); }
  100% { transform: rotate(0deg); }
}
@keyframes attackAntennaL {
  0% { transform: rotate(0deg); }
  15% { transform: rotate(-15deg); }
  35% { transform: rotate(25deg); }
  50% { transform: rotate(-5deg); }
  70% { transform: rotate(25deg); }
  100% { transform: rotate(0deg); }
}
@keyframes attackAntennaR {
  0% { transform: rotate(0deg); }
  15% { transform: rotate(15deg); }
  35% { transform: rotate(-25deg); }
  50% { transform: rotate(5deg); }
  70% { transform: rotate(-25deg); }
  100% { transform: rotate(0deg); }
}
@keyframes fistBumpLeft {
  0% { transform: rotate(0deg) translate(0, 0) scale(1); }
  15% { transform: rotate(-10deg) translate(-5px, 5px) scale(0.9); }
  35% { transform: rotate(25deg) translate(20px, -15px) scale(1.1); }
  50% { transform: rotate(10deg) translate(10px, -5px) scale(1); }
  70% { transform: rotate(25deg) translate(20px, -15px) scale(1.1); }
  100% { transform: rotate(0deg) translate(0, 0) scale(1); }
}
@keyframes fistBumpRight {
  0% { transform: rotate(0deg) translate(0, 0) scale(1); }
  15% { transform: rotate(10deg) translate(5px, 5px) scale(0.9); }
  35% { transform: rotate(-25deg) translate(-20px, -15px) scale(1.1); }
  50% { transform: rotate(-10deg) translate(-10px, -5px) scale(1); }
  70% { transform: rotate(-25deg) translate(-20px, -15px) scale(1.1); }
  100% { transform: rotate(0deg) translate(0, 0) scale(1); }
}`;

const ORIGINS = `
.tail-1 { transform-origin: 256px 270px; }
.tail-2 { transform-origin: 256px 315px; }
.tail-3 { transform-origin: 256px 365px; }
.tail-4 { transform-origin: 256px 415px; }
.tail-5 { transform-origin: 256px 460px; }
.leg-l-1 { transform-origin: 212px 200px; }
.leg-l-2 { transform-origin: 218px 230px; }
.leg-l-3 { transform-origin: 226px 260px; }
.leg-r-1 { transform-origin: 300px 200px; }
.leg-r-2 { transform-origin: 294px 230px; }
.leg-r-3 { transform-origin: 286px 260px; }`;

const STATE_RULES: Record<string, string> = {
  'is-idle': `
.lobster-body-inner { animation: breathe 2s ease-in-out infinite; transform-origin: 256px 256px; }
.tail-1 { animation: tailSway 2s ease-in-out infinite; }
.tail-2 { animation: tailSway 2s ease-in-out infinite -0.2s; }
.tail-3 { animation: tailSway 2s ease-in-out infinite -0.4s; }
.tail-4 { animation: tailSway 2s ease-in-out infinite -0.6s; }
.tail-5 { animation: tailSway 2s ease-in-out infinite -0.8s; }
.claw-left { animation: floatLeft 2s ease-in-out infinite; transform-origin: 226px 150px; }
.claw-right { animation: floatRight 2s ease-in-out infinite; transform-origin: 286px 150px; }
.antenna-l { animation: idleAntennaL 3s ease-in-out infinite; transform-origin: 256px 120px; }
.antenna-r { animation: idleAntennaR 3s ease-in-out infinite; transform-origin: 256px 120px; }`,

  'is-walking': `
.lobster-body-inner { animation: bodyBob 0.5s ease-in-out infinite; transform-origin: 256px 256px; }
.tail-1 { animation: tailSway 0.5s ease-in-out infinite; }
.tail-2 { animation: tailSway 0.5s ease-in-out infinite -0.05s; }
.tail-3 { animation: tailSway 0.5s ease-in-out infinite -0.1s; }
.tail-4 { animation: tailSway 0.5s ease-in-out infinite -0.15s; }
.tail-5 { animation: tailSway 0.5s ease-in-out infinite -0.2s; }
.leg-l-1, .leg-l-3, .leg-r-2 { animation: walkLeg 0.5s ease-in-out infinite; }
.leg-l-2, .leg-r-1, .leg-r-3 { animation: walkLegReverse 0.5s ease-in-out infinite; }
.claw-left { animation: floatLeft 0.5s ease-in-out infinite; transform-origin: 226px 150px; }
.claw-right { animation: floatRight 0.5s ease-in-out infinite; transform-origin: 286px 150px; }
.antenna-l { animation: idleAntennaL 0.5s ease-in-out infinite; transform-origin: 256px 120px; }
.antenna-r { animation: idleAntennaR 0.5s ease-in-out infinite; transform-origin: 256px 120px; }`,

  'is-attacking': `
.lobster-body-inner { animation: attackBody 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; transform-origin: 256px 256px; }
.tail-1, .tail-2, .tail-3, .tail-4, .tail-5 { animation: attackTail 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
.leg-l-1, .leg-l-2, .leg-l-3, .leg-r-1, .leg-r-2, .leg-r-3 { animation: attackLegs 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
.antenna-l { animation: attackAntennaL 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; transform-origin: 256px 120px; }
.antenna-r { animation: attackAntennaR 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; transform-origin: 256px 120px; }
.claw-left { animation: fistBumpLeft 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; transform-origin: 226px 150px; }
.claw-right { animation: fistBumpRight 0.6s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; transform-origin: 286px 150px; }
.energy-core { fill: #ffffff; r: 35px; filter: drop-shadow(0 0 30px #fff); }`,
};

/** Animation durations per state (seconds) */
export const STATE_DEFS = [
  { name: 'is-idle', duration: 2, looping: true },
  { name: 'is-walking', duration: 0.5, looping: true },
  { name: 'is-attacking', duration: 0.6, looping: false },
] as const;

/**
 * Generate embedded CSS that freezes SVG animation at `timeOffset` seconds.
 * Used for both spritesheet export and runtime frame generation.
 */
export function getLobsterCSS(stateName: string, timeOffset: number): string {
  const stateRules = STATE_RULES[stateName] || '';
  const seekRule = `
* {
  animation-play-state: paused !important;
  animation-delay: -${timeOffset}s !important;
}`;
  return KEYFRAMES + ORIGINS + stateRules + seekRule;
}
