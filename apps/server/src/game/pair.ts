import { makeCard, maxBid, teamOf, type PairView, type RulesConfig, type Seat } from '@twentynine/shared';
import type { DealState } from './types';

/**
 * King–Queen of trumps ("pair" / "marriage").
 *
 * Qualifies: one player holds both the King and Queen of the trump suit in hand
 * (neither yet played). Trump must be revealed. Only one pair exists per deal.
 *
 * Timing:
 *   afterRevealTrick – any time once the trick in which trump was revealed has ended (Bangladesh).
 *   afterOwnTrickWin – immediately after the holder's side wins a trick (reveal trick or later),
 *                      before the next card is played (standard).
 *
 * Effect on the bidders' target:
 *   bidding side holds it → target − bidderReduction, never below minTarget,
 *                           and only if bid ≥ bidderMinBid (Bangladesh: 19).
 *   opponents hold it     → target + opponentIncrease, never above the maximum bid.
 */

export function canDeclarePair(rules: RulesConfig, deal: DealState, seat: Seat): boolean {
  if (!rules.pair.enabled || deal.phase !== 'PLAYING' || deal.pair) return false;
  const { trump, contract } = deal;
  if (!trump.revealed || !trump.suit || trump.revealedAtTrick === null || !contract) return false;
  if (deal.tricks.length <= trump.revealedAtTrick) return false; // reveal trick not finished yet
  const hand = deal.hands[seat];
  if (!hand.includes(makeCard('K', trump.suit)) || !hand.includes(makeCard('Q', trump.suit))) return false;
  if (rules.pair.timing === 'afterOwnTrickWin') return deal.pairWindowTeam === teamOf(seat);
  return true;
}

export function computePairEffect(rules: RulesConfig, deal: DealState, seat: Seat): PairView {
  const contract = deal.contract!;
  const team = teamOf(seat);
  const bidderTeam = teamOf(contract.bidder);
  let newTarget = contract.target;
  let note: string;
  if (team === bidderTeam) {
    if (contract.bid >= rules.pair.bidderMinBid) {
      newTarget = Math.max(rules.pair.minTarget, contract.target - rules.pair.bidderReduction);
      note =
        newTarget === contract.target
          ? 'Target already at the minimum — no change.'
          : `Bidding side's pair: target lowered to ${newTarget}.`;
    } else {
      note = `Bidding side's pair has no effect on a bid below ${rules.pair.bidderMinBid}.`;
    }
  } else {
    newTarget = Math.min(maxBid(rules), contract.target + rules.pair.opponentIncrease);
    note = `Opponents' pair: bidders' target raised to ${newTarget}.`;
  }
  return { declaredBy: seat, team, adjustment: newTarget - contract.target, note };
}
