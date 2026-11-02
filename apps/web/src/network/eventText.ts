import { SUIT_NAMES, TEAM_NAMES, type GameEvent, type RoomView, type Seat } from '@twentynine/shared';
import type { Toast } from '../state/store';

export function seatName(room: RoomView | null, seat: Seat | null, you: Seat | null = null): string {
  if (seat === null) return '—';
  if (seat === you) return 'You';
  return room?.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

/** Replace {seat:N} placeholders produced by the server with player names. */
export function formatServerText(text: string, room: RoomView | null, you: Seat | null): string {
  return text.replace(/\{seat:([0-3])\}/g, (_, n) => seatName(room, Number(n) as Seat, you));
}

export function describeEvent(
  e: GameEvent,
  room: RoomView | null,
  you: Seat | null,
): { text: string; tone: Toast['tone']; ms?: number } | null {
  const name = (s: Seat) => seatName(room, s, you);
  switch (e.type) {
    case 'REDEAL':
      return { text: formatServerText(e.reason, room, you), tone: 'warn', ms: 4500 };
    case 'BID': {
      const a = e.action;
      if (a.seat === you) return null;
      if (a.kind === 'pass') return { text: `${name(a.seat)} passes`, tone: 'info', ms: 1800 };
      if (a.kind === 'ditto') return { text: `${name(a.seat)} holds at ${a.amount}`, tone: 'info', ms: 1800 };
      if (a.kind === 'forced') return { text: `${name(a.seat)} (dealer) is forced to bid ${a.amount}`, tone: 'warn' };
      return { text: `${name(a.seat)} bids ${a.amount}`, tone: 'info', ms: 1800 };
    }
    case 'CONTRACT':
      return { text: `${name(e.bidder)} won the bidding at ${e.bid}`, tone: 'success' };
    case 'TRUMP_SELECTED':
      return {
        text: e.seventhCard ? `${name(e.bidder)} called the seventh card as trump` : `${name(e.bidder)} chose trump (hidden)`,
        tone: 'info',
      };
    case 'DOUBLED':
      return { text: `${name(e.seat)} ${e.level === 1 ? 'double' : 'redouble'}${e.seat === you ? '' : 's'}!`, tone: 'warn' };
    case 'DOUBLE_DECLINED':
      return null;
    case 'TRUMP_REVEALED':
      return { text: `Trump revealed: ${SUIT_NAMES[e.suit]} (asked by ${name(e.by)})`, tone: 'trump', ms: 4500 };
    case 'PAIR_DECLARED':
      return { text: `${name(e.pair.declaredBy)} ${e.pair.declaredBy === you ? 'declare' : 'declares'} the King–Queen pair. ${e.pair.note}`, tone: 'trump', ms: 5000 };
    case 'TRICK_COMPLETED':
      return null;
    case 'CARD_PLAYED':
      return null;
    case 'DEAL_SCORED':
      return null;
    case 'MATCH_COMPLETED':
      return { text: `Team ${TEAM_NAMES[e.winner]} wins the match!`, tone: 'success', ms: 6000 };
    case 'NOTICE':
      if (e.message.startsWith('__')) return null;
      return { text: formatServerText(e.message, room, you), tone: 'info' };
    case 'DEALT':
      return null;
  }
  return null;
}
