/**
 * SpriteCache — SVG 龙虾 → 帧动画缓存
 *
 * dataStore.fetchLobsterSprites(tokenId) 调用此模块
 * 根据 LobsterNFT 配色生成 3 状态 × 8 帧序列图
 */

import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Lobster, type LobsterTheme, type LobsterPartColors, partColorsToTheme } from '../components/Lobster';
import type { LobsterNFT } from '../services/dataStore';
import { getLobsterCSS, STATE_DEFS } from './lobsterCSS';

const FRAME_SIZE = 128;
const FRAMES_PER_STATE = 8;

export type SpriteFrame = HTMLCanvasElement | HTMLImageElement;

export interface SpriteSet {
  idle: SpriteFrame[];      // 8 frames
  walking: SpriteFrame[];   // 8 frames
  attacking: SpriteFrame[]; // 8 frames
}

/** 从 NFT 配色+属性 生成 LobsterTheme（含体型） */
export function nftToTheme(nft: LobsterNFT): LobsterTheme {
  const parts: LobsterPartColors = {
    shell: nft.shell, claw: nft.claw, leg: nft.leg,
    eye: nft.eye, tail: nft.tail, aura: nft.aura, sub: nft.sub,
  };
  return partColorsToTheme(parts, {
    hp: nft.hp, atk: nft.atk, speed: nft.speed,
    atkRange: nft.atkRange, manaMax: nft.manaMax, skillPower: nft.skillPower,
  });
}

/**
 * Render a single animation frame by embedding CSS seek into the SVG.
 * Same technique as LobsterPanel export: animation-play-state: paused + negative delay.
 */
async function renderFrame(svgMarkup: string, stateName: string, timeOffset: number): Promise<HTMLCanvasElement> {
  // Parse the SVG, inject CSS, re-serialize
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const svgEl = doc.documentElement;

  // Remove page-level state classes
  svgEl.classList.remove('is-idle', 'is-walking', 'is-attacking', 'is-charging');
  svgEl.setAttribute('width', FRAME_SIZE.toString());
  svgEl.setAttribute('height', FRAME_SIZE.toString());

  // Embed animation CSS with seek
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = getLobsterCSS(stateName, timeOffset);
  svgEl.insertBefore(style, svgEl.firstChild);

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_SIZE;
      canvas.height = FRAME_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, FRAME_SIZE, FRAME_SIZE);
      resolve(canvas);
    };
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

/** Generate 8 frames for one animation state */
async function generateStateFrames(svgMarkup: string, stateName: string, duration: number, looping: boolean): Promise<SpriteFrame[]> {
  const frames: Promise<HTMLCanvasElement>[] = [];
  for (let i = 0; i < FRAMES_PER_STATE; i++) {
    const timeOffset = looping
      ? (i / FRAMES_PER_STATE) * duration
      : (i / (FRAMES_PER_STATE - 1)) * duration;
    frames.push(renderFrame(svgMarkup, stateName, timeOffset));
  }
  return Promise.all(frames);
}

/** 从 NFT 数据生成 3×8 帧 SpriteSet */
export async function generateSprites(nft: LobsterNFT): Promise<SpriteSet> {
  const theme = nftToTheme(nft);

  // Render SVG markup once (without state class — CSS injection handles state)
  const markup = renderToStaticMarkup(
    React.createElement(Lobster, { theme, state: 'idle', className: '' })
  );

  const [idle, walking, attacking] = await Promise.all(
    STATE_DEFS.map(s => generateStateFrames(markup, s.name, s.duration, s.looping))
  );

  return { idle, walking, attacking };
}
