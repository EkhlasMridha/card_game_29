import type { WebSocket } from 'ws';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  clientMessageSchema,
  type ClientMessage,
  type ErrorCode,
  type ServerInfo,
  type ServerMessage,
} from '@twentynine/shared';
import { RoomError, type Connection, type GameAction, type Player, type Room } from '../rooms/room';
import type { RoomManager } from '../rooms/roomManager';
import { RateLimiter } from '../security/rateLimiter';
import { newId } from '../security/tokens';

const GAME_ACTIONS = new Set<ClientMessage['type']>([
  'PLACE_BID',
  'DITTO_BID',
  'PASS_BID',
  'SELECT_TRUMP',
  'DOUBLE_DECISION',
  'REQUEST_TRUMP_REVEAL',
  'PLAY_CARD',
  'DECLARE_PAIR',
  'CONTINUE',
]);

/**
 * One WebSocket client. Validates every message (size, rate, JSON, schema,
 * protocol version), then routes it. A connection is bound to at most one
 * seat; all actions are performed as that seat, so a client cannot act for others.
 */
export class ClientConnection implements Connection {
  readonly id = newId();
  private limiter = new RateLimiter();
  private room: Room | null = null;
  private player: Player | null = null;
  private strikes = 0;

  constructor(
    private readonly ws: WebSocket,
    private readonly rooms: RoomManager,
    private readonly serverInfo: () => ServerInfo,
  ) {
    ws.on('message', (data, isBinary) => this.onMessage(data as Buffer, isBinary));
    ws.on('close', () => this.onClose());
    ws.on('error', () => ws.terminate());
    this.send({ v: PROTOCOL_VERSION, type: 'SERVER_INFO', info: serverInfo() });
  }

  send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
    if (msg.type === 'LEFT_ROOM') {
      this.room = null;
      this.player = null;
    }
  }

  private error(code: ErrorCode, message: string): void {
    this.send({ v: PROTOCOL_VERSION, type: 'ERROR', code, message });
  }

  private onClose(): void {
    if (this.room && this.player) this.room.disconnect(this.player.id, this.id);
    this.room = null;
    this.player = null;
  }

  private onMessage(data: Buffer, isBinary: boolean): void {
    if (!this.limiter.take()) {
      this.error('RATE_LIMITED', 'Too many messages — slow down.');
      if (++this.strikes > 20) this.ws.close(1008, 'rate limit');
      return;
    }
    if (isBinary || data.length > MAX_MESSAGE_BYTES) {
      this.error('BAD_MESSAGE', 'Message rejected.');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString('utf8'));
    } catch {
      this.error('BAD_MESSAGE', 'Malformed JSON.');
      return;
    }
    if (typeof raw === 'object' && raw !== null && (raw as { v?: unknown }).v !== PROTOCOL_VERSION) {
      this.error('PROTOCOL_MISMATCH', 'Client and host versions differ. Reload the page.');
      return;
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.error('BAD_MESSAGE', 'Invalid message.');
      return;
    }
    const msg = parsed.data;
    try {
      this.route(msg);
    } catch (err) {
      if (err instanceof RoomError) {
        this.send({ v: PROTOCOL_VERSION, type: 'ACTION_REJECTED', id: msg.id, action: msg.type, reason: err.message });
      } else {
        console.error('[ws] internal error handling', msg.type, err instanceof Error ? err.message : err);
        this.send({ v: PROTOCOL_VERSION, type: 'ACTION_REJECTED', id: msg.id, action: msg.type, reason: 'Internal error.' });
      }
    }
  }

  private route(msg: ClientMessage): void {
    switch (msg.type) {
      case 'PING':
        this.send({ v: PROTOCOL_VERSION, type: 'PONG' });
        return;
      case 'HELLO':
        this.send({ v: PROTOCOL_VERSION, type: 'SERVER_INFO', info: this.serverInfo() });
        return;
      case 'CREATE_ROOM': {
        this.leaveCurrent();
        const room = this.rooms.create(msg.roomName, msg.rules);
        if (!room) return this.error('TOO_MANY_ROOMS', 'This host has too many open rooms.');
        this.bind(room, room.join(msg.name, this), false);
        return;
      }
      case 'JOIN_ROOM': {
        const room = this.rooms.get(msg.code);
        if (!room) return this.error('ROOM_NOT_FOUND', `No room with code ${msg.code} on this host.`);
        this.leaveCurrent();
        try {
          this.bind(room, room.join(msg.name, this), false);
        } catch (err) {
          if (err instanceof RoomError) return this.error('ROOM_FULL', err.message);
          throw err;
        }
        return;
      }
      case 'RESUME': {
        const room = this.rooms.get(msg.code);
        const player = room?.resume(msg.token, this);
        if (!room || !player) return this.error('SESSION_INVALID', 'Your previous seat is no longer available.');
        if (this.player && this.player.id !== player.id) this.leaveCurrent();
        this.bind(room, player, true);
        return;
      }
    }

    const room = this.room;
    const player = this.player;
    if (!room || !player || room.closed) return this.error('NOT_IN_ROOM', 'You are not in a room.');

    if (GAME_ACTIONS.has(msg.type)) {
      room.handleGameAction(player, msg as GameAction);
      return;
    }
    switch (msg.type) {
      case 'LEAVE_ROOM':
        room.leave(player.id);
        this.send({ v: PROTOCOL_VERSION, type: 'LEFT_ROOM', reason: 'You left the room.' });
        return;
      case 'SELECT_SEAT':
        return room.selectSeat(player, msg.seat);
      case 'KICK_PLAYER':
        return room.kick(player, msg.seat);
      case 'UPDATE_RULES':
        return room.updateRules(player, msg.rules);
      case 'START_GAME':
        return room.start(player);
      case 'END_MATCH':
        return room.endMatch(player);
      case 'CLOSE_ROOM':
        return room.close(player);
      case 'REQUEST_STATE_SYNC':
        return room.sendState(player);
    }
  }

  private bind(room: Room, player: Player, rejoined: boolean): void {
    this.room = room;
    this.player = player;
    this.send({ v: PROTOCOL_VERSION, type: 'ROOM_JOINED', code: room.code, token: player.token, rejoined });
    room.broadcast();
  }

  private leaveCurrent(): void {
    if (this.room && this.player) this.room.leave(this.player.id);
    this.room = null;
    this.player = null;
  }
}
