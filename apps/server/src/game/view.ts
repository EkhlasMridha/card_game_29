import { sortHand, teamOf, type GameView, type Seat } from '@twentynine/shared';
import { biddingOptions, currentHighBidder } from './bidding';
import type { Match } from './match';
import { canDeclarePair } from './pair';
import { playOptions } from './play';
import { cardPointsByTeam } from './scoring';

/**
 * Builds the snapshot for one seat. This is the only path by which game state
 * leaves the server, so every hidden field is filtered here:
 *  - other players' hands are reduced to counts;
 *  - the trump suit is included only once revealed, for the bidder, or after the deal ends;
 *  - the face-down seventh card is shown only to the bidder.
 */
export function buildGameView(match: Match, seat: Seat): GameView {
  const { state, rules } = match;
  const deal = state.deal!;
  const playing = state.phase === 'DEALING';
  const dealOver = !playing || deal.phase === 'FINISHED';
  const bidder = deal.contract?.bidder ?? null;
  const isBidder = bidder === seat;
  const trump = deal.trump;

  const phase: GameView['phase'] =
    state.phase === 'MATCH_FINISHED'
      ? 'MATCH_FINISHED'
      : state.phase === 'DEAL_SUMMARY'
        ? 'DEAL_SUMMARY'
        : (deal.phase as Exclude<typeof deal.phase, 'FINISHED'>);

  const play = playing ? playOptions(rules, deal, seat) : { legal: [], canReveal: false, mustReveal: false };
  const bidOpts = playing && deal.phase === 'BIDDING' ? biddingOptions(rules, deal.bidding, seat) : null;
  const lastTrick = deal.tricks[deal.tricks.length - 1] ?? null;
  const tricksWon: [number, number] = [0, 0];
  for (const t of deal.tricks) tricksWon[teamOf(t.winner)] += 1;
  const b = deal.bidding;

  return {
    phase,
    dealNumber: deal.number,
    dealer: deal.dealer,
    turn: playing ? deal.turn : null,
    scores: [...state.scores],
    handCounts: deal.hands.map((h) => h.length),
    yourSeat: seat,
    yourHand: sortHand(deal.hands[seat]),
    bidding: {
      style: b.style,
      highBid: b.high,
      highBidder: currentHighBidder(b),
      holder: b.style === 'priority' ? b.holder : null,
      challenger: b.style === 'priority' ? b.challenger : null,
      passed: [...b.passed],
      history: [...b.history],
      yourOptions: bidOpts,
    },
    contract: deal.contract
      ? {
          bidder: deal.contract.bidder,
          bid: deal.contract.bid,
          target: deal.contract.target,
          doubleLevel: deal.doubling?.level ?? 0,
          seventhCard: trump.usedSeventh,
        }
      : null,
    trump: {
      chosen: trump.chosen,
      revealed: trump.revealed,
      suit: trump.revealed || isBidder || dealOver ? trump.suit : null,
      revealedBy: trump.revealedBy,
      revealedAtTrick: trump.revealedAtTrick,
      seventhCard: isBidder && !trump.revealed ? trump.seventhCard : null,
      seventhCardFaceDown: !!trump.seventhCard && !trump.revealed,
    },
    doubling:
      playing && deal.phase === 'DOUBLING' && deal.doubling
        ? { stage: deal.doubling.stage, awaiting: deal.doubling.pending[0] }
        : null,
    currentTrick: deal.currentTrick ? { leader: deal.currentTrick.leader, plays: [...deal.currentTrick.plays] } : null,
    lastTrick,
    tricksWon,
    cardPointsWon: cardPointsByTeam(deal, rules).points,
    trickNumber: Math.min(deal.tricks.length + 1, 8),
    pair: deal.pair,
    summary: state.summary,
    readyForNext: [...state.ready],
    matchWinner: state.winner,
    actions: {
      legalCards: play.legal,
      canRequestReveal: play.canReveal,
      mustRequestReveal: play.mustReveal,
      canDeclarePair: playing && canDeclarePair(rules, deal, seat),
      canSelectTrump: playing && deal.phase === 'TRUMP_SELECTION' && isBidder,
      canDouble: playing && deal.phase === 'DOUBLING' && deal.doubling?.pending[0] === seat,
      canContinue: state.phase === 'DEAL_SUMMARY' && !state.ready[seat],
    },
  };
}
