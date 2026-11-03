import type { CardId, Suit } from '../constants/cards';
import type { RulesConfig } from '../rules/config';
import type { Seat, Team } from './seats';

/** Player-specific snapshots. The server builds one per seat; nothing hidden is ever included. */

export type RoomPhase = 'LOBBY' | 'IN_GAME' | 'CLOSED';

export interface SeatView {
  seat: Seat;
  occupied: boolean;
  name: string | null;
  connected: boolean;
  isHost: boolean;
  isYou: boolean;
  /** Computer-controlled seat. */
  isBot: boolean;
}

export interface RoomView {
  code: string;
  name: string;
  phase: RoomPhase;
  rules: RulesConfig;
  seats: SeatView[];
  youAreHost: boolean;
  yourSeat: Seat | null;
}

export type GamePhase =
  | 'BIDDING'
  | 'TRUMP_SELECTION'
  | 'DOUBLING'
  | 'PLAYING'
  | 'DEAL_SUMMARY'
  | 'MATCH_FINISHED';

export type BidAction =
  | { seat: Seat; kind: 'bid'; amount: number }
  | { seat: Seat; kind: 'ditto'; amount: number }
  | { seat: Seat; kind: 'pass' }
  | { seat: Seat; kind: 'forced'; amount: number };

export interface BiddingView {
  style: RulesConfig['biddingStyle'];
  highBid: number | null;
  /** Player currently holding the bid (would become declarer if bidding ended now). */
  highBidder: Seat | null;
  /** In the priority auction: the two players currently contesting. */
  holder: Seat | null;
  challenger: Seat | null;
  passed: boolean[];
  history: BidAction[];
  /** Actions available to the receiving player (empty when it is not their turn). */
  yourOptions: { minBid: number; maxBid: number; canDitto: boolean; canPass: boolean } | null;
}

export interface PlayView {
  seat: Seat;
  card: CardId;
}

export interface TrickView {
  leader: Seat;
  plays: PlayView[];
}

export interface CompletedTrickView extends TrickView {
  winner: Seat;
  points: number;
  index: number;
}

export interface ContractView {
  bidder: Seat;
  bid: number;
  /** Card points the bidding side currently needs (bid adjusted by any pair). */
  target: number;
  doubleLevel: 0 | 1 | 2;
  seventhCard: boolean;
}

export interface TrumpView {
  /** Chosen yet? (true once the bidder has chosen a suit or the seventh card) */
  chosen: boolean;
  revealed: boolean;
  /** Present only if revealed, or the receiver is the bidder. */
  suit: Suit | null;
  revealedBy: Seat | null;
  revealedAtTrick: number | null;
  /** The seventh card, shown only to the bidder before it is revealed. */
  seventhCard: CardId | null;
  /** Whether a face-down seventh card lies in front of the bidder. */
  seventhCardFaceDown: boolean;
}

export interface PairView {
  declaredBy: Seat;
  team: Team;
  /** Change applied to the target (negative = easier for bidders). */
  adjustment: number;
  note: string;
}

export interface DoublingView {
  stage: 'double' | 'redouble';
  awaiting: Seat;
}

export interface DealSummaryView {
  dealNumber: number;
  annulled: boolean;
  reason: string | null;
  bidder: Seat | null;
  bid: number | null;
  target: number | null;
  trump: Suit | null;
  seventhCard: boolean;
  doubleLevel: 0 | 1 | 2;
  cardPoints: [number, number];
  lastTrickBonus: { team: Team; points: number } | null;
  pair: PairView | null;
  success: boolean | null;
  gamePoints: number;
  scoresAfter: [number, number];
}

export interface YourActions {
  /** Cards you may legally play right now (empty if not your turn). */
  legalCards: CardId[];
  /** You are void in the led suit and may (or must) ask for trump. */
  canRequestReveal: boolean;
  mustRequestReveal: boolean;
  canDeclarePair: boolean;
  canSelectTrump: boolean;
  canDouble: boolean;
  canContinue: boolean;
}

export interface GameView {
  phase: GamePhase;
  dealNumber: number;
  dealer: Seat;
  turn: Seat | null;
  scores: [number, number];
  handCounts: number[];
  yourSeat: Seat;
  yourHand: CardId[];
  bidding: BiddingView | null;
  contract: ContractView | null;
  trump: TrumpView;
  doubling: DoublingView | null;
  currentTrick: TrickView | null;
  lastTrick: CompletedTrickView | null;
  tricksWon: [number, number];
  cardPointsWon: [number, number];
  trickNumber: number;
  pair: PairView | null;
  summary: DealSummaryView | null;
  readyForNext: boolean[];
  matchWinner: Team | null;
  actions: YourActions;
}

/** Transient events used for notifications and animations. State always comes from snapshots. */
export type GameEvent =
  | { type: 'DEALT'; round: 1 | 2; dealer: Seat }
  | { type: 'REDEAL'; reason: string }
  | { type: 'BID'; action: BidAction }
  | { type: 'CONTRACT'; bidder: Seat; bid: number }
  | { type: 'TRUMP_SELECTED'; bidder: Seat; seventhCard: boolean }
  | { type: 'DOUBLED'; seat: Seat; level: 1 | 2 }
  | { type: 'DOUBLE_DECLINED'; seat: Seat; stage: 'double' | 'redouble' }
  | { type: 'CARD_PLAYED'; seat: Seat; card: CardId }
  | { type: 'TRUMP_REVEALED'; suit: Suit; by: Seat; bidder: Seat }
  | { type: 'TRICK_COMPLETED'; trick: CompletedTrickView }
  | { type: 'PAIR_DECLARED'; pair: PairView }
  | { type: 'DEAL_SCORED'; summary: DealSummaryView }
  | { type: 'MATCH_COMPLETED'; winner: Team; scores: [number, number] }
  | { type: 'NOTICE'; message: string };
