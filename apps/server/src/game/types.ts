import type {
  BidAction,
  CardId,
  DealSummaryView,
  GameEvent,
  PairView,
  RulesConfig,
  Seat,
  Suit,
  Team,
} from '@card29/shared';

/** Internal (never sent as-is) server-side game state. */

export interface PriorityBidding {
  style: 'priority';
  /** Players who have not yet entered the auction, in speaking order. */
  queue: Seat[];
  holder: Seat | null;
  challenger: Seat | null;
  high: number | null;
  turn: Seat;
  passed: boolean[];
  history: BidAction[];
}

export interface OpenBidding {
  style: 'open';
  order: Seat[];
  high: number | null;
  highSeat: Seat | null;
  turn: Seat;
  passed: boolean[];
  history: BidAction[];
}

export type BiddingState = PriorityBidding | OpenBidding;

export interface Play {
  seat: Seat;
  card: CardId;
}

export interface CompletedTrick {
  index: number;
  leader: Seat;
  plays: Play[];
  winner: Seat;
  points: number;
}

export interface TrumpState {
  chosen: boolean;
  suit: Suit | null;
  /** Seventh card set aside face down (out of the bidder's hand until revealed). */
  seventhCard: CardId | null;
  usedSeventh: boolean;
  revealed: boolean;
  revealedBy: Seat | null;
  revealedAtTrick: number | null;
  /** Voluntary-reveal mode: the asker must trump this trick if able. */
  mustTrump: Seat | null;
}

export interface DoublingState {
  level: 0 | 1 | 2;
  stage: 'double' | 'redouble';
  /** Remaining seats to be asked, in order. */
  pending: Seat[];
}

export type DealPhase = 'BIDDING' | 'TRUMP_SELECTION' | 'DOUBLING' | 'PLAYING' | 'FINISHED';

export interface DealState {
  number: number;
  dealer: Seat;
  /** Speaking/playing order for this deal starting with the player after the dealer. */
  order: Seat[];
  phase: DealPhase;
  hands: CardId[][];
  /** Undealt remainder of the shuffled deck (second round). */
  stock: CardId[];
  bidding: BiddingState;
  contract: { bidder: Seat; bid: number; target: number } | null;
  trump: TrumpState;
  doubling: DoublingState | null;
  turn: Seat | null;
  currentTrick: { leader: Seat; plays: Play[] } | null;
  tricks: CompletedTrick[];
  pair: PairView | null;
  /** 'afterOwnTrickWin' timing: team allowed to declare until the next card is played. */
  pairWindowTeam: Team | null;
}

export interface MatchState {
  rules: RulesConfig;
  scores: [number, number];
  dealNumber: number;
  nextDealer: Seat;
  phase: 'DEALING' | 'DEAL_SUMMARY' | 'MATCH_FINISHED';
  deal: DealState | null;
  summary: DealSummaryView | null;
  ready: boolean[];
  winner: Team | null;
}

export interface EmittedEvent {
  event: GameEvent;
  /** Restrict delivery to these seats (default: everyone). */
  to?: Seat[];
}

export class RuleViolation extends Error {}
