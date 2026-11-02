import { z } from 'zod';
import { SUITS, isCardId, type CardId } from './constants/cards';
import { PROTOCOL_VERSION } from './protocol/messages';

/**
 * Zod schemas, used by the server to validate every client message. Kept in
 * their own module (exported from index.ts, not browser.ts) so the web client
 * bundle doesn't ship Zod; the client only needs the inferred types.
 */

/**
 * Ruleset configuration. Every option here has precisely defined engine
 * behaviour; see docs/rules.md for sources and the reasoning behind defaults.
 */
export const rulesSchema = z.object({
  preset: z.enum(['bangladesh', 'standard', 'custom']),
  /** Direction of dealing, bidding and play. */
  direction: z.enum(['counterclockwise', 'clockwise']),
  /** Lowest legal opening bid. Maximum is 28 (29 with the last-trick point). */
  minBid: z.union([z.literal(15), z.literal(16)]),
  /**
   * 'priority' – Bangladesh/Indian two-at-a-time auction: an earlier speaker
   *   holds priority and may stay in by equalling ("ditto") the challenger's bid.
   * 'open' – each player in turn bids higher or passes until three pass.
   */
  biddingStyle: z.enum(['priority', 'open']),
  /** When the first three players pass: annul and redeal, or force the dealer to bid the minimum. */
  allPass: z.enum(['redeal', 'dealerForced']),
  /** One extra card point for winning the last trick (deck total becomes 29). */
  lastTrickBonus: z.boolean(),
  /** Allow the bidder to call the seventh card instead of naming trump. */
  seventhCard: z.boolean(),
  /**
   * 'mandatory' – the first player unable to follow suit must ask for trump to be
   *   revealed; nobody is then obliged to trump.
   * 'voluntary' – a player unable to follow may discard without asking; a player
   *   who asks must then play a trump if able.
   */
  revealMode: z.enum(['mandatory', 'voluntary']),
  pair: z.object({
    enabled: z.boolean(),
    /**
     * 'afterRevealTrick' – any time after the trick in which trump was revealed ends (Bangladesh).
     * 'afterOwnTrickWin' – only immediately after the holder's side wins a trick
     *   (the reveal trick or later), before the next card is played (standard).
     */
    timing: z.enum(['afterRevealTrick', 'afterOwnTrickWin']),
    /** Points subtracted from the bidders' target when the bidding side holds the pair. */
    bidderReduction: z.number().int().min(0).max(8),
    /** Points added to the bidders' target when the opponents hold the pair. */
    opponentIncrease: z.number().int().min(0).max(8),
    /** The target can never be reduced below this. */
    minTarget: z.number().int().min(14).max(20),
    /** The bidders' pair only helps when the bid is at least this (Bangladesh: 19). */
    bidderMinBid: z.number().int().min(0).max(29),
  }),
  /** 'off', 'double' (opponents may double), 'redouble' (bidding side may then redouble). */
  doubling: z.enum(['off', 'double', 'redouble']),
  /** Bangladesh: annul if either of the first two players has no point card in their first four cards. */
  redealFirstTwoNoPoints: z.boolean(),
  /**
   * Bangladesh: annul a seventh-card deal if the caller holds no point-scoring trump
   * besides the seventh card, or the opponents hold no trump or only the 7 of trump.
   */
  redealSeventhCardWeak: z.boolean(),
  /** Game points needed to win (a side reaching the negative value loses). */
  matchTarget: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
});

const nameField = z.string().min(1).max(64);
const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}$/);
const token = z.string().regex(/^[a-f0-9]{32}$/);
const seat = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const card = z.string().refine(isCardId, 'invalid card').transform((c) => c as CardId);

const base = { v: z.literal(PROTOCOL_VERSION), id: z.number().int().nonnegative().optional() };

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('HELLO') }),
  z.object({
    ...base,
    type: z.literal('CREATE_ROOM'),
    name: nameField,
    roomName: z.string().max(64).optional(),
    rules: rulesSchema,
  }),
  z.object({ ...base, type: z.literal('JOIN_ROOM'), code: roomCode, name: nameField }),
  z.object({ ...base, type: z.literal('RESUME'), code: roomCode, token }),
  z.object({ ...base, type: z.literal('LEAVE_ROOM') }),
  z.object({ ...base, type: z.literal('SELECT_SEAT'), seat }),
  z.object({ ...base, type: z.literal('KICK_PLAYER'), seat }),
  z.object({ ...base, type: z.literal('UPDATE_RULES'), rules: rulesSchema }),
  z.object({ ...base, type: z.literal('START_GAME') }),
  z.object({ ...base, type: z.literal('PLACE_BID'), amount: z.number().int().min(14).max(29) }),
  z.object({ ...base, type: z.literal('DITTO_BID') }),
  z.object({ ...base, type: z.literal('PASS_BID') }),
  z.object({ ...base, type: z.literal('SELECT_TRUMP'), choice: z.union([z.enum(SUITS), z.literal('SEVENTH')]) }),
  z.object({ ...base, type: z.literal('DOUBLE_DECISION'), double: z.boolean() }),
  z.object({ ...base, type: z.literal('REQUEST_TRUMP_REVEAL') }),
  z.object({ ...base, type: z.literal('PLAY_CARD'), card }),
  z.object({ ...base, type: z.literal('DECLARE_PAIR') }),
  z.object({ ...base, type: z.literal('CONTINUE') }),
  z.object({ ...base, type: z.literal('END_MATCH') }),
  z.object({ ...base, type: z.literal('CLOSE_ROOM') }),
  z.object({ ...base, type: z.literal('REQUEST_STATE_SYNC') }),
  z.object({ ...base, type: z.literal('PING') }),
]);
