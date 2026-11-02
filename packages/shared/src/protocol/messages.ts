import type { z } from 'zod';
import type { clientMessageSchema } from '../schemas';
import type { GameEvent, GameView, RoomView } from '../types/views';

/** WebSocket protocol, version 1. The server validates every client message against ../schemas.ts. */

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 8 * 1024;
export const NAME_MAX = 16;
export const ROOM_NAME_MAX = 24;
export const ROOM_CODE_LENGTH = 4;

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
/** Client messages as authored by the client (protocol version is added by the transport). */
export type OutgoingMessage = ClientMessage extends infer M
  ? M extends { v: number }
    ? Omit<M, 'v' | 'id'>
    : never
  : never;

export interface NetworkAddress {
  interface: string;
  address: string;
}

export interface OpenRoomInfo {
  code: string;
  name: string;
  players: number;
  inGame: boolean;
}

export interface ServerInfo {
  appVersion: string;
  protocol: number;
  port: number;
  addresses: NetworkAddress[];
  rooms: OpenRoomInfo[];
  discoveredHosts: { name: string; url: string }[];
}

export type ServerMessage =
  | { v: 1; type: 'SERVER_INFO'; info: ServerInfo }
  | { v: 1; type: 'ROOM_JOINED'; code: string; token: string; rejoined: boolean }
  | { v: 1; type: 'STATE'; rev: number; room: RoomView; game: GameView | null }
  | { v: 1; type: 'EVENT'; rev: number; event: GameEvent }
  | { v: 1; type: 'ACTION_REJECTED'; id?: number; action: string; reason: string }
  | { v: 1; type: 'ERROR'; code: ErrorCode; message: string }
  | { v: 1; type: 'LEFT_ROOM'; reason: string }
  | { v: 1; type: 'PONG' };

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'PROTOCOL_MISMATCH'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'SESSION_INVALID'
  | 'NOT_IN_ROOM'
  | 'TOO_MANY_ROOMS';
