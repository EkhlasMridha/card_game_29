import { useMemo } from 'react';
import { SUIT_NAMES, cardName, type CardId, type Suit } from '@card29/shared';
import { cardFaceSvg, suitColor, suitSvg, svgToDataUri } from '../game/entities/cardArt';
import { useStore } from '../state/hooks';

/** Small DOM card (used in dialogs, rulebook and tutorial — the table itself is Phaser). */
export function MiniCard({ card, size = 56, dim = false, ring = false }: { card: CardId; size?: number; dim?: boolean; ring?: boolean }) {
  const fourColor = useStore((s) => s.settings.fourColor);
  const src = useMemo(() => svgToDataUri(cardFaceSvg(card, fourColor)), [card, fourColor]);
  return (
    <img
      src={src}
      alt={cardName(card)}
      width={size}
      height={size * 1.4}
      className={`inline-block rounded-md shadow-md ${dim ? 'opacity-40 grayscale' : ''} ${ring ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-900' : ''}`}
      draggable={false}
    />
  );
}

export function SuitIcon({ suit, size = 20, light = false }: { suit: Suit; size?: number; light?: boolean }) {
  const src = useMemo(() => svgToDataUri(suitSvg(suit, light && (suit === 'S' || suit === 'C') ? '#e9efe9' : suitColor(suit))), [suit, light]);
  return <img src={src} alt={SUIT_NAMES[suit]} width={size} height={size} className="inline-block" draggable={false} />;
}
