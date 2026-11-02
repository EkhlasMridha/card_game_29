import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 128-bit session token, hex-encoded. Identifies a player's seat for reconnection. */
export function newSessionToken(): string {
  return randomBytes(16).toString('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function newRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function newId(): string {
  return randomBytes(8).toString('hex');
}
