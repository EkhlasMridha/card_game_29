import { cardRank, cardSuit, type CardId, type Rank, type Suit } from '@twentynine/shared';

/**
 * Procedurally generated SVG card art (no image assets, nothing downloaded).
 * Used for Phaser textures and for small DOM previews.
 */

export const CARD_W = 240;
export const CARD_H = 336;

/** Suit glyphs drawn in a 100×100 box. */
const SUIT_PATHS: Record<Suit, string> = {
  H: '<path d="M50 90 C46 84 6 60 6 32 C6 16 18 6 31 6 C40 6 47 11 50 19 C53 11 60 6 69 6 C82 6 94 16 94 32 C94 60 54 84 50 90 Z"/>',
  D: '<path d="M50 3 C60 20 74 36 92 50 C74 64 60 80 50 97 C40 80 26 64 8 50 C26 36 40 20 50 3 Z"/>',
  S: '<path d="M50 4 C56 16 92 36 92 60 C92 73 82 81 70 81 C62 81 56 77 53 72 C54 82 58 89 66 95 L34 95 C42 89 46 82 47 72 C44 77 38 81 30 81 C18 81 8 73 8 60 C8 36 44 16 50 4 Z"/>',
  C: '<circle cx="50" cy="28" r="19"/><circle cx="27" cy="58" r="19"/><circle cx="73" cy="58" r="19"/><path d="M42 50 L58 50 C56 70 59 84 67 95 L33 95 C41 84 44 70 42 50 Z"/><circle cx="50" cy="52" r="10"/>',
};

const RED = '#b8202c';
const BLACK = '#18202c';
const FOUR_COLOR: Record<Suit, string> = { H: '#c8222e', D: '#1f5fbf', C: '#1d7a3e', S: '#18202c' };

export function suitColor(suit: Suit, fourColor = false): string {
  if (fourColor) return FOUR_COLOR[suit];
  return suit === 'H' || suit === 'D' ? RED : BLACK;
}

export function suitSvg(suit: Suit, color: string, size = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"><g fill="${color}">${SUIT_PATHS[suit]}</g></svg>`;
}

function glyph(suit: Suit, x: number, y: number, size: number, color: string, rotate = false): string {
  const s = size / 100;
  const t = rotate
    ? `translate(${x + size / 2} ${y + size / 2}) rotate(180) translate(${-size / 2} ${-size / 2}) scale(${s})`
    : `translate(${x} ${y}) scale(${s})`;
  return `<g transform="${t}" fill="${color}">${SUIT_PATHS[suit]}</g>`;
}

const RANK_LABEL: Record<Rank, string> = { '7': '7', '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const COURT_TITLE: Partial<Record<Rank, string>> = { J: 'JACK', Q: 'QUEEN', K: 'KING' };

/** Classic pip positions (fractions of the inner area). */
const PIPS: Partial<Record<Rank, [number, number, boolean?][]>> = {
  '7': [[0.25, 0.1], [0.75, 0.1], [0.5, 0.3], [0.25, 0.5], [0.75, 0.5], [0.25, 0.9, true], [0.75, 0.9, true]],
  '8': [[0.25, 0.1], [0.75, 0.1], [0.5, 0.3], [0.25, 0.5], [0.75, 0.5], [0.5, 0.7, true], [0.25, 0.9, true], [0.75, 0.9, true]],
  '9': [[0.25, 0.1], [0.75, 0.1], [0.25, 0.37], [0.75, 0.37], [0.5, 0.5], [0.25, 0.63, true], [0.75, 0.63, true], [0.25, 0.9, true], [0.75, 0.9, true]],
  '10': [[0.25, 0.1], [0.75, 0.1], [0.5, 0.24], [0.25, 0.37], [0.75, 0.37], [0.25, 0.63, true], [0.75, 0.63, true], [0.5, 0.76, true], [0.25, 0.9, true], [0.75, 0.9, true]],
};

export function cardFaceSvg(card: CardId, fourColor = false): string {
  const suit = cardSuit(card);
  const rank = cardRank(card);
  const color = suitColor(suit, fourColor);
  const label = RANK_LABEL[rank];
  const fs = label === '10' ? 46 : 52;

  let center = '';
  const pips = PIPS[rank];
  if (pips) {
    const ix = 58, iy = 52, iw = CARD_W - 116, ih = CARD_H - 104, ps = 38;
    center = pips.map(([fx, fy, r]) => glyph(suit, ix + fx * iw - ps / 2, iy + fy * ih - ps / 2, ps, color, !!r)).join('');
  } else if (rank === 'A') {
    center = glyph(suit, CARD_W / 2 - 62, CARD_H / 2 - 62, 124, color);
  } else {
    // Court cards: an engraved-style frame with a monogram.
    const title = COURT_TITLE[rank]!;
    center = `
      <rect x="44" y="52" width="${CARD_W - 88}" height="${CARD_H - 104}" rx="10" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.55" stroke-width="2"/>
      <rect x="52" y="60" width="${CARD_W - 104}" height="${CARD_H - 120}" rx="7" fill="none" stroke="#c9a54a" stroke-width="1.5"/>
      <path d="M${CARD_W / 2 - 34} 104 l12 -22 l10 16 l12 -24 l12 24 l10 -16 l12 22 z" fill="#c9a54a" opacity="${rank === 'J' ? 0 : 0.95}"/>
      <text x="${CARD_W / 2}" y="${CARD_H / 2 + 34}" font-family="Georgia, 'Times New Roman', serif" font-size="104" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>
      ${glyph(suit, CARD_W / 2 - 18, CARD_H / 2 + 50, 36, color)}
      <text x="${CARD_W / 2}" y="${CARD_H - 74}" font-family="Georgia, serif" font-size="15" letter-spacing="5" fill="${color}" fill-opacity="0.75" text-anchor="middle">${title}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#f1ead8"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="18" fill="url(#paper)" stroke="#cdbf9c" stroke-width="3"/>
  <text x="14" y="${14 + fs * 0.82}" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" font-weight="700" fill="${color}" ${label === '10' ? 'letter-spacing="-4"' : ''}>${label}</text>
  ${glyph(suit, 16, 22 + fs * 0.82, 30, color)}
  <g transform="rotate(180 ${CARD_W / 2} ${CARD_H / 2})">
    <text x="14" y="${14 + fs * 0.82}" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" font-weight="700" fill="${color}" ${label === '10' ? 'letter-spacing="-4"' : ''}>${label}</text>
    ${glyph(suit, 16, 22 + fs * 0.82, 30, color)}
  </g>
  ${center}
</svg>`;
}

export function cardBackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
  <defs>
    <pattern id="lat" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="24" height="24" fill="#5d1424"/>
      <path d="M0 12 H24 M12 0 V24" stroke="#c9a54a" stroke-opacity="0.35" stroke-width="1.4"/>
      <circle cx="12" cy="12" r="2.2" fill="#e2bf62" fill-opacity="0.55"/>
    </pattern>
    <radialGradient id="sheen" cx="0.3" cy="0.2" r="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="18" fill="#f6f0e1" stroke="#cdbf9c" stroke-width="3"/>
  <rect x="14" y="14" width="${CARD_W - 28}" height="${CARD_H - 28}" rx="11" fill="url(#lat)" stroke="#c9a54a" stroke-width="3"/>
  <rect x="24" y="24" width="${CARD_W - 48}" height="${CARD_H - 48}" rx="8" fill="none" stroke="#e2bf62" stroke-opacity="0.6" stroke-width="1.5"/>
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="44" fill="#5d1424" stroke="#e2bf62" stroke-width="3"/>
  <text x="${CARD_W / 2}" y="${CARD_H / 2 + 17}" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#f0d68a" text-anchor="middle">29</text>
  <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="18" fill="url(#sheen)"/>
</svg>`;
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
