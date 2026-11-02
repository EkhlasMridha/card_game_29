import Phaser from 'phaser';
import { SUITS, fullDeck, type CardId, type Suit } from '@twentynine/shared';
import { cardBackSvg, cardFaceSvg, loadSvgImage, suitColor, suitSvg } from './cardArt';

export const BACK_KEY = 'card-back';

export function cardKey(card: CardId, fourColor: boolean): string {
  return `card-${card}-${fourColor ? 4 : 2}`;
}

export function suitKey(suit: Suit): string {
  return `suit-${suit}`;
}

/** Rasterise all procedural SVG art into Phaser textures. */
export async function loadCardTextures(scene: Phaser.Scene): Promise<void> {
  const jobs: Promise<void>[] = [];
  const add = (key: string, svg: string) => {
    if (scene.textures.exists(key)) return;
    jobs.push(
      loadSvgImage(svg).then((img) => {
        if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      }),
    );
  };
  for (const card of fullDeck()) {
    add(cardKey(card, false), cardFaceSvg(card, false));
    add(cardKey(card, true), cardFaceSvg(card, true));
  }
  add(BACK_KEY, cardBackSvg());
  for (const suit of SUITS) {
    const color = suitColor(suit, false);
    const disc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="56" fill="#f6f0e1" stroke="#c9a54a" stroke-width="5"/>
      <g transform="translate(28 28) scale(0.64)">${suitSvg(suit, color).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;
    add(suitKey(suit), disc);
  }
  await Promise.all(jobs);
}
