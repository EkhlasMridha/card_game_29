import type { rulesSchema } from '../schemas';
import type { z } from 'zod';

/** Ruleset configuration; the schema with per-option docs is in ../schemas.ts. */
export type RulesConfig = z.infer<typeof rulesSchema>;

export const BANGLADESH_RULES: RulesConfig = {
  preset: 'bangladesh',
  direction: 'counterclockwise',
  minBid: 16,
  biddingStyle: 'priority',
  allPass: 'redeal',
  lastTrickBonus: false,
  seventhCard: true,
  revealMode: 'mandatory',
  pair: {
    enabled: true,
    timing: 'afterRevealTrick',
    bidderReduction: 4,
    opponentIncrease: 4,
    minTarget: 16,
    bidderMinBid: 19,
  },
  doubling: 'redouble',
  redealFirstTwoNoPoints: true,
  redealSeventhCardWeak: true,
  matchTarget: 6,
};

export const STANDARD_RULES: RulesConfig = {
  preset: 'standard',
  direction: 'clockwise',
  minBid: 15,
  biddingStyle: 'open',
  allPass: 'dealerForced',
  lastTrickBonus: false,
  seventhCard: true,
  revealMode: 'mandatory',
  pair: {
    enabled: true,
    timing: 'afterOwnTrickWin',
    bidderReduction: 4,
    opponentIncrease: 4,
    minTarget: 15,
    bidderMinBid: 0,
  },
  doubling: 'redouble',
  redealFirstTwoNoPoints: false,
  redealSeventhCardWeak: false,
  matchTarget: 6,
};

export const RULE_PRESETS = { bangladesh: BANGLADESH_RULES, standard: STANDARD_RULES } as const;

export function maxBid(rules: RulesConfig): number {
  return rules.lastTrickBonus ? 29 : 28;
}

/** Short human-readable summary lines for lobby display. */
export function describeRules(rules: RulesConfig): string[] {
  const lines: string[] = [];
  lines.push(
    rules.preset === 'bangladesh'
      ? 'Bangladesh variation'
      : rules.preset === 'standard'
        ? 'Standard (pagat) rules'
        : 'Custom house rules',
  );
  lines.push(`Play ${rules.direction === 'clockwise' ? 'clockwise' : 'counter-clockwise'}`);
  lines.push(
    `Bidding ${rules.minBid}–${maxBid(rules)}, ${rules.biddingStyle === 'priority' ? 'priority auction (ditto to hold)' : 'open auction'}`,
  );
  lines.push(rules.allPass === 'redeal' ? 'If the first three pass: redeal' : 'If the first three pass: dealer must bid');
  lines.push(rules.seventhCard ? 'Seventh-card trump allowed' : 'No seventh-card trump');
  lines.push(
    rules.revealMode === 'mandatory'
      ? 'First player void in the led suit must ask for trump'
      : 'Asking for trump is optional; asker must trump if able',
  );
  if (rules.pair.enabled) {
    const benefit = rules.pair.bidderMinBid > rules.minBid ? ` (bids ≥ ${rules.pair.bidderMinBid})` : '';
    lines.push(
      `King–Queen pair: bidders −${rules.pair.bidderReduction}${benefit}, min ${rules.pair.minTarget}; opponents +${rules.pair.opponentIncrease}`,
    );
  } else lines.push('King–Queen pair disabled');
  lines.push(rules.lastTrickBonus ? 'Last trick worth 1 point (29 total)' : 'No last-trick point (28 total)');
  lines.push(
    rules.doubling === 'off' ? 'No doubling' : rules.doubling === 'double' ? 'Double allowed' : 'Double & redouble allowed',
  );
  if (rules.redealFirstTwoNoPoints) lines.push('Redeal if either first-two player has no point card in four');
  if (rules.redealSeventhCardWeak) lines.push('Seventh-card deal annulled when trumps are too weak');
  lines.push(`Match to ±${rules.matchTarget} game points`);
  return lines;
}
