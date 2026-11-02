/** Deck definition for 29: 32 cards, ranks 7–A in four suits. */

export const SUITS = ['H', 'D', 'C', 'S'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'] as const; // low → high
export type Rank = (typeof RANKS)[number];

/** Card identifier, e.g. "JH" (Jack of Hearts) or "10S". */
export type CardId = `${Rank}${Suit}`;

export const SUIT_NAMES: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};

export const RANK_NAMES: Record<Rank, string> = {
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

/** Trick-taking strength. Higher wins: J > 9 > A > 10 > K > Q > 8 > 7. */
export const RANK_STRENGTH: Record<Rank, number> = {
  J: 8,
  '9': 7,
  A: 6,
  '10': 5,
  K: 4,
  Q: 3,
  '8': 2,
  '7': 1,
};

/** Card points (not game points). The deck totals 28. */
export const CARD_POINTS: Record<Rank, number> = {
  J: 3,
  '9': 2,
  A: 1,
  '10': 1,
  K: 0,
  Q: 0,
  '8': 0,
  '7': 0,
};

export const DECK_CARD_POINTS = 28;
export const CARDS_PER_PLAYER = 8;
export const TRICKS_PER_DEAL = 8;

export function makeCard(rank: Rank, suit: Suit): CardId {
  return `${rank}${suit}` as CardId;
}

export function cardSuit(card: CardId): Suit {
  return card[card.length - 1] as Suit;
}

export function cardRank(card: CardId): Rank {
  return card.slice(0, -1) as Rank;
}

export function cardPoints(card: CardId): number {
  return CARD_POINTS[cardRank(card)];
}

export function cardStrength(card: CardId): number {
  return RANK_STRENGTH[cardRank(card)];
}

export function cardName(card: CardId): string {
  return `${RANK_NAMES[cardRank(card)]} of ${SUIT_NAMES[cardSuit(card)]}`;
}

export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

const ALL_CARDS = new Set<string>(fullDeck());
export function isCardId(value: string): value is CardId {
  return ALL_CARDS.has(value);
}

/** Display sort: by suit (alternating colours), then strength high → low. */
const SUIT_SORT: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
export function sortHand(cards: CardId[]): CardId[] {
  return [...cards].sort((a, b) => {
    const s = SUIT_SORT[cardSuit(a)] - SUIT_SORT[cardSuit(b)];
    return s !== 0 ? s : cardStrength(b) - cardStrength(a);
  });
}
