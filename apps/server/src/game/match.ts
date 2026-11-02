import {
  cardPoints,
  cardRank,
  cardSuit,
  nextSeat,
  partnerOf,
  teamOf,
  type CardId,
  type GameEvent,
  type RulesConfig,
  type Seat,
  type Suit,
} from '@card29/shared';
import { applyBid, createBidding, type BidInput } from './bidding';
import { secureRandomInt, shuffledDeck } from './deck';
import { canDeclarePair, computePairEffect } from './pair';
import { playOptions, trickPoints, trickWinner } from './play';
import { annulledSummary, matchWinner, scoreDeal } from './scoring';
import { RuleViolation, type DealState, type EmittedEvent, type MatchState } from './types';

/**
 * Authoritative match state machine.
 *
 *   start → [deal] BIDDING → TRUMP_SELECTION → (DOUBLING) → PLAYING ×8 tricks
 *         → DEAL_SUMMARY → next deal … → MATCH_FINISHED
 *
 * Automatic redeals (all pass, Bangladesh no-point annulment) restart the deal
 * immediately with the same dealer. Annulments discovered after the final deal
 * or after play go to DEAL_SUMMARY with no score.
 */
export class Match {
  readonly state: MatchState;
  private events: EmittedEvent[] = [];

  constructor(rules: RulesConfig) {
    this.state = {
      rules,
      scores: [0, 0],
      dealNumber: 0,
      nextDealer: secureRandomInt(4) as Seat,
      phase: 'DEALING',
      deal: null,
      summary: null,
      ready: [false, false, false, false],
      winner: null,
    };
  }

  get rules(): RulesConfig {
    return this.state.rules;
  }

  drainEvents(): EmittedEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(event: GameEvent, to?: Seat[]): void {
    this.events.push({ event, to });
  }

  private next(seat: Seat): Seat {
    return nextSeat(seat, this.rules.direction);
  }

  private requireDeal(phase: DealState['phase']): DealState {
    const deal = this.state.deal;
    if (this.state.phase !== 'DEALING' || !deal || deal.phase !== phase) {
      throw new RuleViolation('That action is not allowed in the current phase.');
    }
    return deal;
  }

  // ---------------------------------------------------------------- dealing

  start(): void {
    this.state.dealNumber += 1;
    this.beginDeal();
  }

  private beginDeal(attempt = 0): void {
    const dealer = this.state.nextDealer;
    const order: Seat[] = [];
    let s = dealer;
    for (let i = 0; i < 4; i++) {
      s = this.next(s);
      order.push(s);
    }
    const deck = shuffledDeck();
    const hands: CardId[][] = [[], [], [], []];
    // First round: four cards each, one at a time, starting after the dealer.
    for (let round = 0; round < 4; round++) for (const p of order) hands[p].push(deck.pop()!);

    const deal: DealState = {
      number: this.state.dealNumber,
      dealer,
      order,
      phase: 'BIDDING',
      hands,
      stock: deck,
      bidding: createBidding(this.rules, order),
      contract: null,
      trump: {
        chosen: false,
        suit: null,
        seventhCard: null,
        usedSeventh: false,
        revealed: false,
        revealedBy: null,
        revealedAtTrick: null,
        mustTrump: null,
      },
      doubling: null,
      turn: order[0],
      currentTrick: null,
      tricks: [],
      pair: null,
      pairWindowTeam: null,
    };
    this.state.deal = deal;
    this.state.phase = 'DEALING';
    this.state.summary = null;
    this.emit({ type: 'DEALT', round: 1, dealer });

    if (this.rules.redealFirstTwoNoPoints && attempt < 50) {
      const pointless = order.slice(0, 2).find((p) => hands[p].every((c) => cardPoints(c) === 0));
      if (pointless !== undefined) {
        this.emit({ type: 'REDEAL', reason: `{seat:${pointless}} had no point card in the first four cards — redeal.` });
        this.beginDeal(attempt + 1);
      }
    }
  }

  // ---------------------------------------------------------------- bidding

  bid(seat: Seat, input: BidInput): void {
    const deal = this.requireDeal('BIDDING');
    const outcome = applyBid(this.rules, deal.bidding, seat, input);
    this.emit({ type: 'BID', action: deal.bidding.history[deal.bidding.history.length - 1] });
    if (outcome.status === 'continue') {
      deal.turn = deal.bidding.turn;
    } else if (outcome.status === 'won') {
      this.setContract(deal, outcome.bidder, outcome.bid);
    } else if (this.rules.allPass === 'redeal') {
      this.emit({ type: 'REDEAL', reason: 'The first three players passed — the cards are redealt.' });
      this.beginDeal();
    } else {
      deal.bidding.history.push({ seat: deal.dealer, kind: 'forced', amount: this.rules.minBid });
      this.emit({ type: 'BID', action: { seat: deal.dealer, kind: 'forced', amount: this.rules.minBid } });
      this.setContract(deal, deal.dealer, this.rules.minBid);
    }
  }

  private setContract(deal: DealState, bidder: Seat, bid: number): void {
    deal.contract = { bidder, bid, target: bid };
    deal.phase = 'TRUMP_SELECTION';
    deal.turn = bidder;
    this.emit({ type: 'CONTRACT', bidder, bid });
  }

  // ---------------------------------------------------------------- trump

  selectTrump(seat: Seat, choice: Suit | 'SEVENTH'): void {
    const deal = this.requireDeal('TRUMP_SELECTION');
    if (deal.contract!.bidder !== seat) throw new RuleViolation('Only the winning bidder chooses trump.');
    if (choice === 'SEVENTH') {
      if (!this.rules.seventhCard) throw new RuleViolation('Seventh-card trump is not enabled.');
      deal.trump.usedSeventh = true;
    } else {
      deal.trump.suit = choice;
    }
    deal.trump.chosen = true;
    this.emit({ type: 'TRUMP_SELECTED', bidder: seat, seventhCard: choice === 'SEVENTH' });

    if (this.rules.doubling !== 'off') {
      const first = this.next(seat);
      deal.doubling = { level: 0, stage: 'double', pending: [first, partnerOf(first)] };
      deal.phase = 'DOUBLING';
      deal.turn = first;
    } else {
      this.finalDeal(deal);
    }
  }

  doubleDecision(seat: Seat, double: boolean): void {
    const deal = this.requireDeal('DOUBLING');
    const d = deal.doubling!;
    if (d.pending[0] !== seat) throw new RuleViolation('It is not your decision to make.');
    if (double) {
      d.level = (d.level + 1) as 1 | 2;
      this.emit({ type: 'DOUBLED', seat, level: d.level as 1 | 2 });
      if (d.stage === 'double' && this.rules.doubling === 'redouble') {
        const bidder = deal.contract!.bidder;
        d.stage = 'redouble';
        d.pending = [bidder, partnerOf(bidder)];
        deal.turn = bidder;
        return;
      }
      this.finalDeal(deal);
      return;
    }
    this.emit({ type: 'DOUBLE_DECLINED', seat, stage: d.stage });
    d.pending.shift();
    if (d.pending.length === 0) this.finalDeal(deal);
    else deal.turn = d.pending[0];
  }

  private finalDeal(deal: DealState): void {
    for (let round = 0; round < 4; round++) for (const p of deal.order) deal.hands[p].push(deal.stock.pop()!);
    this.emit({ type: 'DEALT', round: 2, dealer: deal.dealer });
    const bidder = deal.contract!.bidder;

    if (deal.trump.usedSeventh) {
      // The seventh card dealt to the bidder (third card of the second round) is set aside face down.
      const seventh = deal.hands[bidder][6];
      deal.hands[bidder].splice(6, 1);
      deal.trump.seventhCard = seventh;
      deal.trump.suit = cardSuit(seventh);

      if (this.rules.redealSeventhCardWeak) {
        const suit = deal.trump.suit;
        const callerHasPointTrump = deal.hands[bidder].some((c) => cardSuit(c) === suit && cardPoints(c) > 0);
        const oppTrumps = [this.next(bidder), partnerOf(this.next(bidder))].flatMap((p) =>
          deal.hands[p].filter((c) => cardSuit(c) === suit),
        );
        const oppWeak = oppTrumps.length === 0 || (oppTrumps.length === 1 && cardRank(oppTrumps[0]) === '7');
        if (!callerHasPointTrump || oppWeak) {
          this.annul(
            deal,
            !callerHasPointTrump
              ? 'Seventh-card annulment: the bidder held no point-scoring trump besides the seventh card.'
              : 'Seventh-card annulment: the opponents held no trump or only the 7 of trump.',
          );
          return;
        }
      }
    }

    deal.phase = 'PLAYING';
    deal.currentTrick = { leader: deal.order[0], plays: [] };
    deal.turn = deal.order[0];
  }

  // ---------------------------------------------------------------- play

  requestReveal(seat: Seat): void {
    const deal = this.requireDeal('PLAYING');
    const opts = playOptions(this.rules, deal, seat);
    if (!opts.canReveal) throw new RuleViolation('You may only ask for trump when you cannot follow suit.');
    this.reveal(deal, seat);
  }

  private reveal(deal: DealState, by: Seat): void {
    const t = deal.trump;
    t.revealed = true;
    t.revealedBy = by;
    t.revealedAtTrick = deal.tricks.length;
    const bidder = deal.contract!.bidder;
    if (t.seventhCard) {
      deal.hands[bidder].push(t.seventhCard);
      t.seventhCard = null;
    }
    if (this.rules.revealMode === 'voluntary') t.mustTrump = by;
    this.emit({ type: 'TRUMP_REVEALED', suit: t.suit!, by, bidder });
  }

  playCard(seat: Seat, card: CardId): void {
    const deal = this.requireDeal('PLAYING');
    const opts = playOptions(this.rules, deal, seat);
    if (deal.turn !== seat) throw new RuleViolation('It is not your turn.');
    if (!opts.legal.includes(card)) {
      throw new RuleViolation(
        opts.mustReveal ? 'You cannot follow suit — ask for trump to be revealed first.' : 'That card cannot be played now.',
      );
    }
    if (deal.trump.seventhCard === card) this.reveal(deal, seat); // leading the last card: the seventh card itself

    const hand = deal.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    const trick = deal.currentTrick!;
    trick.plays.push({ seat, card });
    deal.pairWindowTeam = null;
    this.emit({ type: 'CARD_PLAYED', seat, card });

    if (trick.plays.length < 4) {
      deal.turn = this.next(seat);
      return;
    }

    const trumpInForce = deal.trump.revealed ? deal.trump.suit : null;
    const winner = trickWinner(trick.plays, trumpInForce);
    const completed = {
      index: deal.tricks.length,
      leader: trick.leader,
      plays: trick.plays,
      winner,
      points: trickPoints(trick.plays),
    };
    deal.tricks.push(completed);
    deal.trump.mustTrump = null;
    this.emit({ type: 'TRICK_COMPLETED', trick: completed });
    if (deal.trump.revealed) deal.pairWindowTeam = teamOf(winner);

    if (deal.tricks.length === 8) {
      deal.currentTrick = null;
      this.endDeal(deal);
    } else {
      deal.currentTrick = { leader: winner, plays: [] };
      deal.turn = winner;
    }
  }

  declarePair(seat: Seat): void {
    const deal = this.requireDeal('PLAYING');
    if (!canDeclarePair(this.rules, deal, seat)) throw new RuleViolation('You cannot declare the pair now.');
    const effect = computePairEffect(this.rules, deal, seat);
    deal.contract!.target += effect.adjustment;
    deal.pair = effect;
    this.emit({ type: 'PAIR_DECLARED', pair: effect });
  }

  // ---------------------------------------------------------------- scoring

  private endDeal(deal: DealState): void {
    if (!deal.trump.revealed) {
      this.annul(deal, 'Trump was never revealed — the deal is annulled.');
      return;
    }
    deal.phase = 'FINISHED';
    deal.turn = null;
    const summary = scoreDeal(deal, this.rules, this.state.scores);
    this.state.scores = summary.scoresAfter;
    this.state.summary = summary;
    this.emit({ type: 'DEAL_SCORED', summary });
    this.state.nextDealer = this.next(deal.dealer);

    const winner = matchWinner(this.state.scores, this.rules.matchTarget);
    if (winner !== null) {
      this.state.phase = 'MATCH_FINISHED';
      this.state.winner = winner;
      this.emit({ type: 'MATCH_COMPLETED', winner, scores: this.state.scores });
    } else {
      this.state.phase = 'DEAL_SUMMARY';
      this.state.ready = [false, false, false, false];
    }
  }

  private annul(deal: DealState, reason: string): void {
    deal.phase = 'FINISHED';
    deal.turn = null;
    const summary = annulledSummary(deal, reason, this.state.scores);
    this.state.summary = summary;
    this.state.phase = 'DEAL_SUMMARY';
    this.state.ready = [false, false, false, false];
    // Same dealer deals again after an annulled deal.
    this.emit({ type: 'DEAL_SCORED', summary });
  }

  /** A player acknowledges the deal summary. The next deal starts when every connected player is ready. */
  markReady(seat: Seat, connected: boolean[]): void {
    if (this.state.phase !== 'DEAL_SUMMARY') throw new RuleViolation('Nothing to continue.');
    this.state.ready[seat] = true;
    this.maybeAdvance(connected);
  }

  maybeAdvance(connected: boolean[]): void {
    if (this.state.phase !== 'DEAL_SUMMARY') return;
    const allReady = [0, 1, 2, 3].every((s) => this.state.ready[s] || !connected[s]);
    if (allReady && connected.some(Boolean)) {
      this.state.dealNumber += 1;
      this.beginDeal();
    }
  }
}
