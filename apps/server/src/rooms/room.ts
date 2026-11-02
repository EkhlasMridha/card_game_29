import {
  NAME_MAX,
  PROTOCOL_VERSION,
  sanitizeDisplayText,
  type ClientMessage,
  type GameEvent,
  type RoomView,
  type RulesConfig,
  type Seat,
  type ServerMessage,
} from '@card29/shared';
import { Match } from '../game/match';
import { RuleViolation } from '../game/types';
import { buildGameView } from '../game/view';
import { newId, newSessionToken, tokensEqual } from '../security/tokens';

export interface Connection {
  readonly id: string;
  send(msg: ServerMessage): void;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  seat: Seat;
  conn: Connection | null;
  disconnectedAt: number | null;
}

/** In the lobby, a disconnected player's seat is released after this grace period. */
const LOBBY_GRACE_MS = 2 * 60 * 1000;

export type GameAction = Extract<
  ClientMessage,
  {
    type:
      | 'PLACE_BID'
      | 'DITTO_BID'
      | 'PASS_BID'
      | 'SELECT_TRUMP'
      | 'DOUBLE_DECISION'
      | 'REQUEST_TRUMP_REVEAL'
      | 'PLAY_CARD'
      | 'DECLARE_PAIR'
      | 'CONTINUE';
  }
>;

export class RoomError extends Error {}

/**
 * One table: four seats, the lobby, and (while playing) the authoritative Match.
 * All mutations go through methods that end with broadcast(), which sends each
 * connected player their own filtered snapshot with a new revision number.
 */
export class Room {
  readonly players = new Map<string, Player>();
  readonly seats: (string | null)[] = [null, null, null, null];
  hostId: string | null = null;
  match: Match | null = null;
  closed = false;
  lastActivity = Date.now();
  private rev = 0;
  private lobbyTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    readonly code: string,
    readonly name: string,
    public rules: RulesConfig,
  ) {}

  get inGame(): boolean {
    return this.match !== null;
  }

  get playerCount(): number {
    return this.players.size;
  }

  // ------------------------------------------------------------ membership

  join(rawName: string, conn: Connection): Player {
    const name = sanitizeDisplayText(rawName, NAME_MAX) || 'Player';
    const seat = this.seats.findIndex((s) => s === null);
    if (seat === -1 || this.inGame) throw new RoomError(this.inGame ? 'This game has already started.' : 'This room is full.');
    const player: Player = {
      id: newId(),
      token: newSessionToken(),
      name: this.uniqueName(name),
      seat: seat as Seat,
      conn,
      disconnectedAt: null,
    };
    this.players.set(player.id, player);
    this.seats[seat] = player.id;
    if (!this.hostId) this.hostId = player.id;
    this.touch();
    return player;
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 10; i++) {
      const candidate = `${name.slice(0, NAME_MAX - 2)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  resume(token: string, conn: Connection): Player | null {
    for (const p of this.players.values()) {
      if (tokensEqual(p.token, token)) {
        if (p.conn && p.conn.id !== conn.id) {
          p.conn.send({ v: PROTOCOL_VERSION, type: 'LEFT_ROOM', reason: 'This seat was opened on another device or tab.' });
        }
        p.conn = conn;
        p.disconnectedAt = null;
        const timer = this.lobbyTimers.get(p.id);
        if (timer) clearTimeout(timer);
        this.lobbyTimers.delete(p.id);
        this.touch();
        return p;
      }
    }
    return null;
  }

  disconnect(playerId: string, connId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.conn?.id !== connId) return;
    p.conn = null;
    p.disconnectedAt = Date.now();
    if (!this.inGame) {
      this.lobbyTimers.set(
        p.id,
        setTimeout(() => {
          if (!p.conn && !this.inGame) {
            this.remove(p.id);
            this.broadcast();
          }
        }, LOBBY_GRACE_MS),
      );
    } else {
      // A disconnected player never blocks the "continue" step between deals.
      this.match!.maybeAdvance(this.connectedSeats());
    }
    this.broadcast();
  }

  /** Explicit leave. During a match the seat is kept (the player may rejoin); in the lobby it is freed. */
  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.inGame) {
      p.conn = null;
      p.disconnectedAt = Date.now();
      this.match!.maybeAdvance(this.connectedSeats());
    } else {
      this.remove(playerId);
    }
    this.broadcast();
  }

  private remove(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    this.seats[p.seat] = null;
    const timer = this.lobbyTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.lobbyTimers.delete(playerId);
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((x) => x.conn) ?? [...this.players.values()][0];
      this.hostId = next?.id ?? null;
    }
  }

  connectedSeats(): boolean[] {
    return this.seats.map((id) => !!(id && this.players.get(id)?.conn));
  }

  // ------------------------------------------------------------ lobby actions

  private requireHost(p: Player): void {
    if (p.id !== this.hostId) throw new RoomError('Only the host can do that.');
  }

  private requireLobby(): void {
    if (this.inGame) throw new RoomError('Not available during a match.');
  }

  selectSeat(p: Player, seat: Seat): void {
    this.requireLobby();
    if (this.seats[seat] !== null) throw new RoomError('That seat is taken.');
    this.seats[p.seat] = null;
    this.seats[seat] = p.id;
    p.seat = seat;
    this.broadcast();
  }

  kick(p: Player, seat: Seat): void {
    this.requireHost(p);
    this.requireLobby();
    const targetId = this.seats[seat];
    if (!targetId || targetId === p.id) throw new RoomError('No player to remove there.');
    const target = this.players.get(targetId)!;
    target.conn?.send({ v: PROTOCOL_VERSION, type: 'LEFT_ROOM', reason: 'The host removed you from the room.' });
    this.remove(targetId);
    this.broadcast();
  }

  updateRules(p: Player, rules: RulesConfig): void {
    this.requireHost(p);
    this.requireLobby();
    this.rules = rules;
    this.broadcast();
  }

  start(p: Player): void {
    this.requireHost(p);
    this.requireLobby();
    if (this.seats.some((s) => s === null)) throw new RoomError('All four seats must be filled.');
    if (this.connectedSeats().some((c) => !c)) throw new RoomError('All four players must be connected.');
    this.match = new Match(this.rules);
    this.match.start();
    this.broadcast();
  }

  endMatch(p: Player): void {
    this.requireHost(p);
    if (!this.match) throw new RoomError('No match in progress.');
    this.match = null;
    // Return to lobby; release seats of players who are gone.
    for (const pl of [...this.players.values()]) if (!pl.conn) this.remove(pl.id);
    this.broadcast();
    this.notice('The host returned the table to the lobby.');
  }

  close(p: Player): void {
    this.requireHost(p);
    this.shutdown('The host closed the room.');
  }

  shutdown(reason: string): void {
    this.closed = true;
    for (const pl of this.players.values()) pl.conn?.send({ v: PROTOCOL_VERSION, type: 'LEFT_ROOM', reason });
    for (const t of this.lobbyTimers.values()) clearTimeout(t);
    this.lobbyTimers.clear();
    this.players.clear();
    this.match = null;
  }

  // ------------------------------------------------------------ game actions

  handleGameAction(p: Player, msg: GameAction): void {
    const match = this.match;
    if (!match) throw new RoomError('No match in progress.');
    try {
      switch (msg.type) {
        case 'PLACE_BID':
          match.bid(p.seat, { kind: 'bid', amount: msg.amount });
          break;
        case 'DITTO_BID':
          match.bid(p.seat, { kind: 'ditto' });
          break;
        case 'PASS_BID':
          match.bid(p.seat, { kind: 'pass' });
          break;
        case 'SELECT_TRUMP':
          match.selectTrump(p.seat, msg.choice);
          break;
        case 'DOUBLE_DECISION':
          match.doubleDecision(p.seat, msg.double);
          break;
        case 'REQUEST_TRUMP_REVEAL':
          match.requestReveal(p.seat);
          break;
        case 'PLAY_CARD':
          match.playCard(p.seat, msg.card);
          break;
        case 'DECLARE_PAIR':
          match.declarePair(p.seat);
          break;
        case 'CONTINUE':
          match.markReady(p.seat, this.connectedSeats());
          break;
      }
    } catch (err) {
      // Events emitted before a violation are impossible (engine validates first), but drain defensively.
      match.drainEvents();
      if (err instanceof RuleViolation) throw new RoomError(err.message);
      throw err;
    }
    this.touch();
    this.broadcast();
  }

  // ------------------------------------------------------------ sync

  private touch(): void {
    this.lastActivity = Date.now();
  }

  roomView(viewer: Player): RoomView {
    return {
      code: this.code,
      name: this.name,
      phase: this.closed ? 'CLOSED' : this.inGame ? 'IN_GAME' : 'LOBBY',
      rules: this.match?.rules ?? this.rules,
      seats: this.seats.map((id, i) => {
        const p = id ? this.players.get(id) : undefined;
        return {
          seat: i as Seat,
          occupied: !!p,
          name: p?.name ?? null,
          connected: !!p?.conn,
          isHost: !!p && p.id === this.hostId,
          isYou: p?.id === viewer.id,
        };
      }),
      youAreHost: viewer.id === this.hostId,
      yourSeat: viewer.seat,
    };
  }

  private notice(message: string): void {
    this.rev++;
    for (const p of this.players.values()) p.conn?.send({ v: PROTOCOL_VERSION, type: 'EVENT', rev: this.rev, event: { type: 'NOTICE', message } });
  }

  /** Send queued events (filtered per seat) followed by a fresh per-player snapshot. */
  broadcast(): void {
    const events = this.match?.drainEvents() ?? [];
    this.rev++;
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      for (const e of events) {
        if (e.to && !e.to.includes(p.seat)) continue;
        p.conn.send({ v: PROTOCOL_VERSION, type: 'EVENT', rev: this.rev, event: e.event as GameEvent });
      }
      this.sendState(p);
    }
  }

  sendState(p: Player): void {
    p.conn?.send({
      v: PROTOCOL_VERSION,
      type: 'STATE',
      rev: this.rev,
      room: this.roomView(p),
      game: this.match ? buildGameView(this.match, p.seat) : null,
    });
  }
}
