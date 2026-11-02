import { teamOf, type DealSummaryView, type RulesConfig, type Team } from '@twentynine/shared';
import type { DealState } from './types';

/**
 * Deal scoring. Card points (from captured cards) decide whether the contract
 * was made; game points (±1, ×2 doubled, ×4 redoubled) go to the bidding side
 * only. The opposing side's game score does not change (pagat; Bangladesh).
 */

export function cardPointsByTeam(deal: DealState, rules: RulesConfig): {
  points: [number, number];
  lastTrickBonus: { team: Team; points: number } | null;
} {
  const points: [number, number] = [0, 0];
  for (const t of deal.tricks) points[teamOf(t.winner)] += t.points;
  let lastTrickBonus: { team: Team; points: number } | null = null;
  const last = deal.tricks[deal.tricks.length - 1];
  if (rules.lastTrickBonus && last && deal.tricks.length === 8) {
    lastTrickBonus = { team: teamOf(last.winner), points: 1 };
    points[lastTrickBonus.team] += 1;
  }
  return { points, lastTrickBonus };
}

export function scoreDeal(
  deal: DealState,
  rules: RulesConfig,
  scoresBefore: [number, number],
): DealSummaryView {
  const contract = deal.contract!;
  const { points, lastTrickBonus } = cardPointsByTeam(deal, rules);
  const bidderTeam = teamOf(contract.bidder);
  const success = points[bidderTeam] >= contract.target;
  const multiplier = [1, 2, 4][deal.doubling?.level ?? 0];
  const gamePoints = success ? multiplier : -multiplier;
  const scoresAfter: [number, number] = [...scoresBefore];
  scoresAfter[bidderTeam] += gamePoints;
  return {
    dealNumber: deal.number,
    annulled: false,
    reason: null,
    bidder: contract.bidder,
    bid: contract.bid,
    target: contract.target,
    trump: deal.trump.suit,
    seventhCard: deal.trump.usedSeventh,
    doubleLevel: deal.doubling?.level ?? 0,
    cardPoints: points,
    lastTrickBonus,
    pair: deal.pair,
    success,
    gamePoints,
    scoresAfter,
  };
}

export function annulledSummary(deal: DealState, reason: string, scores: [number, number]): DealSummaryView {
  return {
    dealNumber: deal.number,
    annulled: true,
    reason,
    bidder: deal.contract?.bidder ?? null,
    bid: deal.contract?.bid ?? null,
    target: deal.contract?.target ?? null,
    trump: deal.trump.suit,
    seventhCard: deal.trump.usedSeventh,
    doubleLevel: deal.doubling?.level ?? 0,
    cardPoints: [0, 0],
    lastTrickBonus: null,
    pair: deal.pair,
    success: null,
    gamePoints: 0,
    scoresAfter: [...scores],
  };
}

export function matchWinner(scores: [number, number], target: number): Team | null {
  for (const t of [0, 1] as Team[]) {
    if (scores[t] >= target) return t;
    if (scores[t] <= -target) return (1 - t) as Team;
  }
  return null;
}
