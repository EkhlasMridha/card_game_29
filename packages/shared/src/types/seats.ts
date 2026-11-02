export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Partners sit opposite: seats 0 & 2 form team 0, seats 1 & 3 form team 1. */
export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function isSeat(n: unknown): n is Seat {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

/**
 * Seats are numbered clockwise around the table (viewed from above).
 * Clockwise play moves seat → seat+1, counter-clockwise moves seat → seat-1.
 */
export function nextSeat(seat: Seat, direction: 'clockwise' | 'counterclockwise'): Seat {
  return (direction === 'clockwise' ? (seat + 1) % 4 : (seat + 3) % 4) as Seat;
}

export const TEAM_NAMES: Record<Team, string> = { 0: 'Emerald', 1: 'Crimson' };
