/** Responsive table geometry, in device pixels. Relative seats: 0 = you (bottom), 1 = left, 2 = top, 3 = right. */

export type RelSeat = 0 | 1 | 2 | 3;

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  W: number;
  H: number;
  d: number;
  top: number;
  portrait: boolean;
  handW: number;
  handH: number;
  handY: number;
  handTop: number;
  smallW: number;
  smallH: number;
  trickW: number;
  trickH: number;
  center: Point;
  /** Centre of each player's hand/fan — origin for card animations. */
  origin: Record<RelSeat, Point>;
  /** Where each player's played card lands in the trick. */
  spot: Record<RelSeat, Point & { angle: number }>;
  plate: Record<RelSeat, Point>;
  plateW: number;
  plateH: number;
  /** True when the bottom corners beside your hand are free (your plate and the action buttons sit there). */
  cornerPlate: boolean;
  /** Where the trump indicator sits for each player's seat. */
  indicator: Record<RelSeat, Point>;
  table: { x: number; y: number; w: number; h: number; r: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** HUD bar height in CSS pixels (rendered by React above the canvas). */
export const HUD_CSS_HEIGHT = 60;

export function computeLayout(W: number, H: number, d: number): Layout {
  const top = HUD_CSS_HEIGHT * d;
  const portrait = H > W * 1.05;
  const margin = 10 * d;

  const handW = clamp(Math.min(W / (portrait ? 5.4 : 10.5), (H - top) / (portrait ? 5.6 : 4.4)), 50 * d, 128 * d);
  const handH = handW * 1.4;
  const handY = H - handH / 2 - 22 * d;
  const handTop = H - handH - 22 * d;

  const smallW = clamp(handW * 0.5, 26 * d, 64 * d);
  const smallH = smallW * 1.4;
  const fanLen = smallW * 3.2;

  const plateW = clamp((portrait ? W * 0.3 : 150 * d), 96 * d, 170 * d);
  const plateH = 46 * d;

  const topFanY = top + smallH / 2 + 6 * d;
  const topBottom = topFanY + smallH / 2;
  const playTop = topBottom + 8 * d;
  const playBottom = handTop - plateH - 14 * d;
  const center: Point = { x: W / 2, y: (playTop + playBottom) / 2 };

  const avail = Math.max(60 * d, playBottom - playTop);
  const trickH = clamp(Math.min(handH * 0.85, avail / 2.05), 44 * d, 150 * d);
  const trickW = trickH / 1.4;

  const sideX = margin + smallH / 2;
  const origin: Record<RelSeat, Point> = {
    0: { x: W / 2, y: handY },
    1: { x: sideX, y: center.y - plateH / 2 },
    2: { x: W / 2, y: topFanY },
    3: { x: W - sideX, y: center.y - plateH / 2 },
  };

  const dx = Math.min(trickW * 0.85, (W / 2 - sideX - smallH / 2 - trickW / 2) * 0.9);
  const dy = trickH * 0.42;
  const spot = {
    0: { x: center.x, y: center.y + dy, angle: 2 },
    1: { x: center.x - dx, y: center.y, angle: -6 },
    2: { x: center.x, y: center.y - dy, angle: -2 },
    3: { x: center.x + dx, y: center.y, angle: 6 },
  } as Layout['spot'];

  // Full eight-card hand span (mirrors TableScene.handSlot) — decides whether
  // your plate fits in the bottom-left corner beside the hand.
  const handStep = Math.min(handW * 0.68, (W - 24 * d - handW) / 7);
  const handLeft = W / 2 - (handStep * 7) / 2 - handW / 2;
  const cornerPlate = handLeft - margin * 2 >= plateW;

  const plate: Record<RelSeat, Point> = {
    0: cornerPlate
      ? { x: margin + plateW / 2, y: H - plateH / 2 - 22 * d }
      : { x: margin + plateW / 2, y: handTop - plateH / 2 - 8 * d },
    1: { x: margin + plateW / 2, y: origin[1].y + fanLen / 2 + plateH / 2 + 6 * d },
    2: { x: Math.min(W - margin - plateW / 2, W / 2 + fanLen / 2 + plateW / 2 + 10 * d), y: topFanY },
    3: { x: W - margin - plateW / 2, y: origin[3].y + fanLen / 2 + plateH / 2 + 6 * d },
  };
  // Never let the side plates sit on top of yours (short landscape screens).
  const sideLimit = plate[0].y - plateH - 8 * d;
  if (!cornerPlate) {
    plate[1].y = Math.min(plate[1].y, sideLimit);
    plate[3].y = Math.min(plate[3].y, sideLimit);
  }

  const indicator: Record<RelSeat, Point> = {
    0: cornerPlate
      ? { x: margin + smallW * 0.8, y: plate[0].y - plateH / 2 - smallH / 2 - 24 * d }
      : { x: margin + plateW + smallW * 0.9, y: handTop - plateH / 2 - 8 * d },
    1: { x: sideX + smallH * 0.9, y: origin[1].y - fanLen / 2 - smallH * 0.2 },
    2: { x: Math.max(margin + smallW, W / 2 - fanLen / 2 - smallW * 1.2), y: topFanY },
    3: { x: W - sideX - smallH * 0.9, y: origin[3].y - fanLen / 2 - smallH * 0.2 },
  };

  const table = { x: 6 * d, y: top + 2 * d, w: W - 12 * d, h: H - top - 8 * d, r: Math.min(W, H) * 0.08 };

  return {
    W, H, d, top, portrait, handW, handH, handY, handTop, smallW, smallH, trickW, trickH,
    center, origin, spot, plate, plateW, plateH, cornerPlate, indicator, table,
  };
}
