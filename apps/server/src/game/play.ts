import { cardPoints, cardStrength, cardSuit, type CardId, type RulesConfig, type Seat, type Suit } from '@twentynine/shared';
import type { DealState, Play } from './types';

/**
 * Trick-play rules.
 *
 * - A player must follow the led suit if able. The bidder's face-down seventh
 *   card is not part of the hand for this purpose until trump is revealed.
 * - A player unable to follow while trump is hidden:
 *     mandatory mode → must ask for trump to be revealed before playing; may then play any card.
 *     voluntary mode → may discard any card, or ask; after asking must trump if able.
 * - The seventh card can only be led before revelation when it is the bidder's
 *   last card; leading it reveals trump.
 * - Once trump is revealed, trump-suit cards played earlier in the same trick count as trumps.
 */

export interface PlayOptions {
  legal: CardId[];
  canReveal: boolean;
  mustReveal: boolean;
}

const NONE: PlayOptions = { legal: [], canReveal: false, mustReveal: false };

export function playOptions(rules: RulesConfig, deal: DealState, seat: Seat): PlayOptions {
  if (deal.phase !== 'PLAYING' || deal.turn !== seat || !deal.currentTrick) return NONE;
  const hand = deal.hands[seat];
  const trump = deal.trump;
  const hiddenSeventh = !trump.revealed && trump.seventhCard && deal.contract?.bidder === seat ? trump.seventhCard : null;
  const plays = deal.currentTrick.plays;

  if (plays.length === 0) {
    if (hand.length === 0 && hiddenSeventh) return { legal: [hiddenSeventh], canReveal: false, mustReveal: false };
    return { legal: [...hand], canReveal: false, mustReveal: false };
  }

  const led = cardSuit(plays[0].card);
  const follow = hand.filter((c) => cardSuit(c) === led);
  if (follow.length > 0) return { legal: follow, canReveal: false, mustReveal: false };

  if (!trump.revealed) {
    if (rules.revealMode === 'mandatory' || hand.length === 0) return { legal: [], canReveal: true, mustReveal: true };
    return { legal: [...hand], canReveal: true, mustReveal: false };
  }

  if (trump.mustTrump === seat && trump.suit) {
    const trumps = hand.filter((c) => cardSuit(c) === trump.suit);
    if (trumps.length > 0) return { legal: trumps, canReveal: false, mustReveal: false };
  }
  return { legal: [...hand], canReveal: false, mustReveal: false };
}

/** Winner of a complete trick given the trump suit in force (null = trump not revealed). */
export function trickWinner(plays: Play[], trump: Suit | null): Seat {
  const led = cardSuit(plays[0].card);
  let best = plays[0];
  for (const p of plays.slice(1)) {
    if (beats(p.card, best.card, led, trump)) best = p;
  }
  return best.seat;
}

function beats(challenger: CardId, current: CardId, led: Suit, trump: Suit | null): boolean {
  const cs = cardSuit(challenger);
  const ks = cardSuit(current);
  if (trump) {
    if (cs === trump && ks !== trump) return true;
    if (cs !== trump && ks === trump) return false;
    if (cs === trump && ks === trump) return cardStrength(challenger) > cardStrength(current);
  }
  if (cs === led && ks !== led) return true;
  if (cs !== led) return false;
  return cardStrength(challenger) > cardStrength(current);
}

export function trickPoints(plays: Play[]): number {
  return plays.reduce((sum, p) => sum + cardPoints(p.card), 0);
}
