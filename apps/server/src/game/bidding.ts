import { maxBid, type RulesConfig, type Seat } from '@card29/shared';
import { RuleViolation, type BiddingState, type OpenBidding, type PriorityBidding } from './types';

/**
 * Two auction styles:
 *
 * Priority (Bangladesh / Indian): the first speaker opens (≥ minimum) or passes.
 * Once there is an opening bid, the bid holder faces one challenger at a time,
 * in speaking order. The challenger must bid higher or pass. The holder, who has
 * priority, may then equal the bid ("ditto"), raise, or pass. Whoever passes
 * drops out and the next unheard player becomes the challenger. Partners may
 * bid over each other. The last remaining holder wins at the current bid.
 *
 * Open: each player in turn bids higher than the current bid or passes;
 * a passed player is out. Ends when three players have passed after a bid.
 */

export type BidInput = { kind: 'bid'; amount: number } | { kind: 'ditto' } | { kind: 'pass' };

export type BidOutcome =
  | { status: 'continue' }
  | { status: 'won'; bidder: Seat; bid: number }
  | { status: 'allPassed' };

export interface BidOptions {
  minBid: number;
  maxBid: number;
  canDitto: boolean;
  canPass: boolean;
}

export function createBidding(rules: RulesConfig, order: Seat[]): BiddingState {
  const passed = [false, false, false, false];
  if (rules.biddingStyle === 'priority') {
    const queue = order.slice(1);
    return { style: 'priority', queue, holder: null, challenger: null, high: null, turn: order[0], passed, history: [] };
  }
  return { style: 'open', order: [...order], high: null, highSeat: null, turn: order[0], passed, history: [] };
}

export function currentHighBidder(b: BiddingState): Seat | null {
  return b.style === 'priority' ? b.holder : b.highSeat;
}

export function biddingOptions(rules: RulesConfig, b: BiddingState, seat: Seat): BidOptions | null {
  if (b.turn !== seat) return null;
  const max = maxBid(rules);
  if (b.style === 'priority') {
    if (b.holder === null) return { minBid: rules.minBid, maxBid: max, canDitto: false, canPass: true };
    const isHolder = seat === b.holder;
    return { minBid: (b.high ?? rules.minBid - 1) + 1, maxBid: max, canDitto: isHolder, canPass: true };
  }
  return { minBid: b.high === null ? rules.minBid : b.high + 1, maxBid: max, canDitto: false, canPass: true };
}

export function applyBid(rules: RulesConfig, b: BiddingState, seat: Seat, input: BidInput): BidOutcome {
  const opts = biddingOptions(rules, b, seat);
  if (!opts) throw new RuleViolation('It is not your turn to bid.');
  if (input.kind === 'bid' && (input.amount < opts.minBid || input.amount > opts.maxBid)) {
    throw new RuleViolation(
      opts.minBid > opts.maxBid ? 'No higher bid is possible; you must pass.' : `Bid must be between ${opts.minBid} and ${opts.maxBid}.`,
    );
  }
  if (input.kind === 'ditto' && !opts.canDitto) throw new RuleViolation('You cannot hold (ditto) right now.');
  return b.style === 'priority' ? applyPriority(rules, b, seat, input) : applyOpen(b, seat, input);
}

function applyPriority(rules: RulesConfig, b: PriorityBidding, seat: Seat, input: BidInput): BidOutcome {
  if (b.holder === null) {
    // Opening round: nobody has bid yet.
    if (input.kind === 'pass') {
      b.passed[seat] = true;
      b.history.push({ seat, kind: 'pass' });
      const next = b.queue.shift();
      // The dealer is last in the queue; the first three passing means nobody opened.
      if (next === undefined || b.passed.filter(Boolean).length >= 3) return { status: 'allPassed' };
      b.turn = next;
      return { status: 'continue' };
    }
    if (input.kind !== 'bid') throw new RuleViolation('You must open with a bid or pass.');
    b.holder = seat;
    b.high = input.amount;
    b.history.push({ seat, kind: 'bid', amount: input.amount });
    return advanceChallenger(b);
  }

  const high = b.high as number;
  if (seat === b.challenger) {
    if (input.kind === 'pass') {
      b.passed[seat] = true;
      b.history.push({ seat, kind: 'pass' });
      return advanceChallenger(b);
    }
    if (input.kind !== 'bid') throw new RuleViolation('Bid higher or pass.');
    b.high = input.amount;
    b.history.push({ seat, kind: 'bid', amount: input.amount });
    b.turn = b.holder;
    return { status: 'continue' };
  }

  // Holder responding to the challenger.
  if (input.kind === 'pass') {
    b.passed[seat] = true;
    b.history.push({ seat, kind: 'pass' });
    b.holder = b.challenger;
    return advanceChallenger(b);
  }
  if (input.kind === 'ditto') {
    b.history.push({ seat, kind: 'ditto', amount: high });
  } else {
    b.high = input.amount;
    b.history.push({ seat, kind: 'bid', amount: input.amount });
  }
  b.turn = b.challenger as Seat;
  void rules;
  return { status: 'continue' };
}

function advanceChallenger(b: PriorityBidding): BidOutcome {
  const next = b.queue.shift();
  if (next === undefined) {
    b.challenger = null;
    return { status: 'won', bidder: b.holder as Seat, bid: b.high as number };
  }
  b.challenger = next;
  b.turn = next;
  return { status: 'continue' };
}

function applyOpen(b: OpenBidding, seat: Seat, input: BidInput): BidOutcome {
  if (input.kind === 'ditto') throw new RuleViolation('Ditto is not part of the open auction.');
  if (input.kind === 'pass') {
    b.passed[seat] = true;
    b.history.push({ seat, kind: 'pass' });
  } else {
    b.high = input.amount;
    b.highSeat = seat;
    b.history.push({ seat, kind: 'bid', amount: input.amount });
  }
  const active = b.order.filter((s) => !b.passed[s]);
  if (b.highSeat === null && active.length === 1) return { status: 'allPassed' };
  if (b.highSeat !== null && active.length === 1) return { status: 'won', bidder: b.highSeat, bid: b.high as number };
  // Next non-passed player in speaking order.
  const idx = b.order.indexOf(seat);
  for (let i = 1; i <= 4; i++) {
    const s = b.order[(idx + i) % 4];
    if (!b.passed[s]) {
      b.turn = s;
      break;
    }
  }
  return { status: 'continue' };
}
