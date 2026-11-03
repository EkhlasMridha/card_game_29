import {
  SUITS,
  cardPoints,
  cardRank,
  cardStrength,
  cardSuit,
  fullDeck,
  partnerOf,
  teamOf,
  type CardId,
  type Seat,
  type Suit,
} from '@card29/shared';
import { biddingOptions, type BidInput } from './bidding';
import type { Match } from './match';
import { canDeclarePair } from './pair';
import { playOptions, trickWinner } from './play';
import type { DealState, Play } from './types';

/**
 * Computer player. Plays fairly: it decides only from what that seat could see
 * at the table: its own hand, the cards already played, the public bidding,
 * and the trump suit only once revealed (or when the bot chose it as bidder).
 * It never looks at other hands or the undealt stock.
 */

export type BotAction =
  | { kind: 'bid'; input: BidInput }
  | { kind: 'trump'; suit: Suit }
  | { kind: 'double'; double: boolean }
  | { kind: 'reveal' }
  | { kind: 'play'; card: CardId }
  | { kind: 'pair' }
  | { kind: 'ready' };

/** What the bot in `seat` wants to do now, or null if it is not its move. */
export function botAction(match: Match, seat: Seat): BotAction | null {
  const { state, rules } = match;
  if (state.phase === 'DEAL_SUMMARY') return state.ready[seat] ? null : { kind: 'ready' };
  if (state.phase !== 'DEALING' || !state.deal) return null;
  const deal = state.deal;

  // Declaring the pair is always good for the declaring side's target maths
  // (it lowers our target or raises theirs), so do it as soon as it is allowed.
  if (canDeclarePair(rules, deal, seat)) return { kind: 'pair' };

  switch (deal.phase) {
    case 'BIDDING': {
      const opts = biddingOptions(rules, deal.bidding, seat);
      return opts ? { kind: 'bid', input: chooseBid(deal, seat, opts) } : null;
    }
    case 'TRUMP_SELECTION':
      return deal.contract?.bidder === seat ? { kind: 'trump', suit: bestSuit(deal.hands[seat]).suit } : null;
    case 'DOUBLING':
      return deal.doubling?.pending[0] === seat ? { kind: 'double', double: false } : null;
    case 'PLAYING': {
      if (deal.turn !== seat) return null;
      const opts = playOptions(rules, deal, seat);
      if (opts.mustReveal) return { kind: 'reveal' };
      if (opts.legal.length === 0) return null;
      return { kind: 'play', card: chooseCard(deal, seat, opts.legal) };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- bidding

interface SuitInfo {
  suit: Suit;
  count: number;
  points: number;
  hasJack: boolean;
}

function bestSuit(hand: CardId[]): SuitInfo {
  const infos = SUITS.map((suit) => {
    const cards = hand.filter((c) => cardSuit(c) === suit);
    return {
      suit,
      count: cards.length,
      points: cards.reduce((s, c) => s + cardPoints(c), 0),
      hasJack: cards.some((c) => cardRank(c) === 'J'),
    };
  });
  // Longest suit, then most points, then the strongest top card.
  return infos.sort((a, b) => b.count - a.count || b.points - a.points || Number(b.hasJack) - Number(a.hasJack))[0];
}

/** Highest bid this hand is worth, judged from the first four cards. */
function handValue(hand: CardId[]): number {
  const points = hand.reduce((s, c) => s + cardPoints(c), 0);
  const best = bestSuit(hand);
  const value = 13 + Math.round(points * 0.8) + Math.max(0, best.count - 1) + (best.hasJack ? 1 : 0);
  return Math.min(value, 22);
}

function chooseBid(
  deal: DealState,
  seat: Seat,
  opts: { minBid: number; maxBid: number; canDitto: boolean },
): BidInput {
  const b = deal.bidding;
  const highBidder = b.style === 'priority' ? b.holder : b.highSeat;
  // Never bid against our own partner.
  if (highBidder !== null && highBidder === partnerOf(seat)) return { kind: 'pass' };
  const value = handValue(deal.hands[seat]);
  if (opts.canDitto && b.high !== null && b.high <= value) return { kind: 'ditto' };
  if (opts.minBid <= Math.min(value, opts.maxBid)) return { kind: 'bid', amount: opts.minBid };
  return { kind: 'pass' };
}

// ---------------------------------------------------------------- play

/** Cards this seat has seen leave play (completed tricks and the current trick). */
function seenCards(deal: DealState): Set<CardId> {
  const seen = new Set<CardId>();
  for (const t of deal.tricks) for (const p of t.plays) seen.add(p.card);
  for (const p of deal.currentTrick?.plays ?? []) seen.add(p.card);
  return seen;
}

/** No unseen card of the same suit can beat this one (ignoring trumps). */
function isMaster(card: CardId, hand: CardId[], seen: Set<CardId>): boolean {
  const suit = cardSuit(card);
  return fullDeck().every(
    (c) => cardSuit(c) !== suit || cardStrength(c) <= cardStrength(card) || seen.has(c) || hand.includes(c),
  );
}

/** Cheapest card first: fewest points, then weakest, keeping trumps for later. */
function byCheapness(trump: Suit | null) {
  return (a: CardId, b: CardId) =>
    Number(cardSuit(a) === trump) - Number(cardSuit(b) === trump) ||
    cardPoints(a) - cardPoints(b) ||
    cardStrength(a) - cardStrength(b);
}

function chooseCard(deal: DealState, seat: Seat, legal: CardId[]): CardId {
  const hand = deal.hands[seat];
  const plays: Play[] = deal.currentTrick?.plays ?? [];
  const seen = seenCards(deal);
  const trumpInForce = deal.trump.revealed ? deal.trump.suit : null;
  // The bidder knows the trump suit before it is revealed; nobody else does.
  const knownTrump = trumpInForce ?? (deal.contract?.bidder === seat ? deal.trump.suit : null);
  const cheapest = [...legal].sort(byCheapness(knownTrump));

  if (plays.length === 0) {
    const biddingSide = deal.contract ? teamOf(deal.contract.bidder) === teamOf(seat) : false;
    // Bidding side with trump out in the open: pull trumps with a master trump.
    if (trumpInForce && biddingSide) {
      const masterTrump = legal.find((c) => cardSuit(c) === trumpInForce && isMaster(c, hand, seen));
      if (masterTrump) return masterTrump;
    }
    // Cash a sure winner in a plain suit (best when it carries points).
    const masters = legal
      .filter((c) => cardSuit(c) !== knownTrump && isMaster(c, hand, seen))
      .sort((a, b) => cardPoints(b) - cardPoints(a) || cardStrength(b) - cardStrength(a));
    if (masters.length > 0) return masters[0];
    // Otherwise lead something cheap.
    return cheapest[0];
  }

  const last = plays.length === 3;
  const winner = trickWinner(plays, trumpInForce);
  const partnerWinning = teamOf(winner) === teamOf(seat);
  const winnerCard = plays.find((p) => p.seat === winner)!.card;
  const pointsOnTable = plays.reduce((s, p) => s + cardPoints(p.card), 0);

  if (partnerWinning) {
    // Partner holds the trick for sure: give them points (but keep our own trumps).
    const safe = last || (isMaster(winnerCard, hand, seen) && (trumpInForce === null || cardSuit(winnerCard) === trumpInForce));
    if (safe) {
      const gifts = [...legal].sort(
        (a, b) => Number(cardSuit(a) === knownTrump) - Number(cardSuit(b) === knownTrump) || cardPoints(b) - cardPoints(a),
      );
      return gifts[0];
    }
    return cheapest[0];
  }

  const winners = legal.filter((c) => trickWinner([...plays, { seat, card: c }], trumpInForce) === seat);
  if (winners.length > 0) {
    const cheapestWinner = [...winners].sort((a, b) => cardStrength(a) - cardStrength(b) || cardPoints(a) - cardPoints(b))[0];
    // Win if it is worth it: points at stake, we are last, or the winner costs nothing.
    if (pointsOnTable > 0 || last || cardPoints(cheapestWinner) === 0) return cheapestWinner;
  }
  return cheapest[0];
}
