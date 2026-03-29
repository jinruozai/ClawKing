import { runGame } from '../../frontend/src/engine/game.ts';
const stats = [
  144185569721910284n,
  0x20001030102040en, 0x100020400010215n, 0x20100030302050bn,
  0x40010040102050an, 0x40040030202050an, 0x302000301010311n,
  0x304000303020609n,
];
const s = new Uint8Array([1,7,0,0,0,0,0,0,0,2,2,7,0,0,0,6,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,6,0]);
const scripts = Array(8).fill(s);
try {
  const r = runGame(stats, scripts, 42);
  console.log('JS engine OK, winner idx=' + r.rankings[0].idx);
} catch(e) {
  console.log('JS engine ERROR:', e.message);
}
