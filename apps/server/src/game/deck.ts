import { randomInt } from 'node:crypto';
import { fullDeck, type CardId } from '@twentynine/shared';

/** Fisher–Yates shuffle driven by the OS CSPRNG (crypto.randomInt). */
export function shuffledDeck(): CardId[] {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function secureRandomInt(maxExclusive: number): number {
  return randomInt(maxExclusive);
}
