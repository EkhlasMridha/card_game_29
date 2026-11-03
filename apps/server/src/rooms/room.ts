import {
  NAME_MAX,
  PROTOCOL_VERSION,
  cardSuit,
  sanitizeDisplayText,
  type ClientMessage,
  type GameEvent,
  type RoomView,
  type RulesConfig,
  type Seat,
  type ServerMessage,
} from '@card29/shared';
import { botAction, type BotAction } from '../game/bot';
import { Match } from '../game/match';
import { playOptions } from '../game/play';
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
  /** Computer-controlled seat (never has a connection). */
  bot: boolean;
}

/** In the lobby, a disconnected player's seat is released after this grace period. */
const LOBBY_GRACE_MS = 2 * 60 * 1000;

const BOT_NAMES = ['Asha', 'Rafi', 'Mitu', 'Tanvir', 'Nila', 'Sabbir', 'Joya', 'Imran'];

/** Pause before a bot acts, so people can follow the table (ms). */
const BOT_DELAY = { think: 900, newTrick: 1700, quick: 600 };

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
  private botTimer: NodeJS.Timeout | null = null;

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
      bot: false,
    };
    this.players.set(player.id, player);
    this.seats[seat] = player.id;
    if (!this.hostId) this.hostId = player.id;
    this.touch();
    return player;
  }

  /** Seat a computer player. Lobby only, host only. */
  addBot(host: Player, seat: Seat): void {
    this.requireHost(host);
    this.requireLobby();
    if (this.seats[seat] !== null) throw new RoomError('That seat is taken.');
    this.seatBot(seat);
    this.broadcast();
  }

  private seatBot(seat: Seat): void {
    const used = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    const free = BOT_NAMES.filter((n) => !used.has(`bot ${n}`.toLowerCase()));
    const pick = free[Math.floor(Math.random() * free.length)] ?? 'Player';
    const bot: Player = {
      id: newId(),
      token: newSessionToken(), // never handed out
      name: this.uniqueName(`Bot ${pick}`),
      seat,
      conn: null,
      disconnectedAt: null,
      bot: true,
    };
    this.players.set(bot.id, bot);
    this.seats[seat] = bot.id;
  }

  private get hasHumans(): boolean {
    return [...this.players.values()].some((p) => !p.bot);
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

  /**
   * Rejoin by room code from a device that lost its seat token (another phone,
   * cleared storage, private window): an offline seat whose player has the same
   * name is handed back with a fresh token. Seats of connected players are never
   * taken over, and the old token stops working.
   */
  reclaim(rawName: string, conn: Connection): Player | null {
    const name = (sanitizeDisplayText(rawName, NAME_MAX) || 'Player').toLowerCase();
    const p = [...this.players.values()].find((x) => !x.bot && !x.conn && x.name.toLowerCase() === name);
    if (!p) return null;
    p.token = newSessionToken();
    return this.resume(p.token, conn);
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
    // Bots never stay on their own: with no people left, the room empties and expires.
    if (!this.hasHumans) {
      for (const bot of [...this.players.values()]) {
        this.players.delete(bot.id);
        this.seats[bot.seat] = null;
      }
    }
    if (this.hostId === playerId || !this.players.has(this.hostId ?? '')) {
      const humans = [...this.players.values()].filter((x) => !x.bot);
      const next = humans.find((x) => x.conn) ?? humans[0];
      this.hostId = next?.id ?? null;
    }
  }

  /** Seats that can act: connected people and bots. */
  connectedSeats(): boolean[] {
    return this.seats.map((id) => {
      const p = id ? this.players.get(id) : undefined;
      return !!(p && (p.conn || p.bot));
    });
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

  /** Start the match. With fillBots, every empty seat gets a bot first. */
  start(p: Player, fillBots = false): void {
    this.requireHost(p);
    this.requireLobby();
    if (fillBots) this.seats.forEach((id, seat) => id === null && this.seatBot(seat as Seat));
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
    this.clearBotTimer();
    // Return to lobby; release seats of players who are gone (bots stay seated).
    for (const pl of [...this.players.values()]) if (!pl.conn && !pl.bot) this.remove(pl.id);
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
    this.clearBotTimer();
    this.players.clear();
    this.match = null;
  }

  // ------------------------------------------------------------ bots

  private clearBotTimer(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  private nextBotMove(): { bot: Player; action: BotAction } | null {
    if (!this.match) return null;
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      const action = botAction(this.match, p.seat);
      if (action) return { bot: p, action };
    }
    return null;
  }

  /**
   * After every state change: if a bot has something to do, do it after a short
   * pause. Bots wait while no person is connected, so an abandoned room does not
   * keep playing by itself (and still expires).
   */
  private scheduleBots(): void {
    if (this.botTimer || this.closed || !this.match) return;
    if (![...this.players.values()].some((p) => p.conn)) return;
    const next = this.nextBotMove();
    if (!next) return;
    const deal = this.match.state.deal;
    const newTrick = next.action.kind === 'play' && deal?.currentTrick?.plays.length === 0 && deal.tricks.length > 0;
    const delay =
      next.action.kind === 'ready' || next.action.kind === 'pair' ? BOT_DELAY.quick : newTrick ? BOT_DELAY.newTrick : BOT_DELAY.think;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBot();
    }, delay);
  }

  private runBot(): void {
    const match = this.match;
    const next = this.nextBotMove();
    if (!match || !next || this.closed) return;
    const { bot, action } = next;
    try {
      switch (action.kind) {
        case 'bid':
          match.bid(bot.seat, action.input);
          break;
        case 'trump':
          match.selectTrump(bot.seat, action.suit);
          break;
        case 'double':
          match.doubleDecision(bot.seat, action.double);
          break;
        case 'reveal':
          match.requestReveal(bot.seat);
          break;
        case 'play':
          match.playCard(bot.seat, action.card);
          break;
        case 'pair':
          match.declarePair(bot.seat);
          break;
        case 'ready':
          match.markReady(bot.seat, this.connectedSeats());
          break;
      }
    } catch (err) {
      // A bot must never stall the table: fall back to the simplest legal move.
      match.drainEvents();
      console.error(`[bot] ${bot.name} failed to ${action.kind}:`, err instanceof Error ? err.message : err);
      try {
        this.botFallback(match, bot.seat);
      } catch (err2) {
        match.drainEvents();
        console.error(`[bot] ${bot.name} fallback failed:`, err2 instanceof Error ? err2.message : err2);
        return;
      }
    }
    this.touch();
    this.broadcast();
  }

  private botFallback(match: Match, seat: Seat): void {
    const deal = match.state.deal;
    if (match.state.phase === 'DEAL_SUMMARY') return match.markReady(seat, this.connectedSeats());
    if (!deal) return;
    switch (deal.phase) {
      case 'BIDDING':
        return match.bid(seat, { kind: 'pass' });
      case 'TRUMP_SELECTION':
        return match.selectTrump(seat, cardSuit(deal.hands[seat][0]));
      case 'DOUBLING':
        return match.doubleDecision(seat, false);
      case 'PLAYING': {
        const opts = playOptions(match.rules, deal, seat);
        if (opts.mustReveal) return match.requestReveal(seat);
        if (opts.legal[0]) return match.playCard(seat, opts.legal[0]);
      }
    }
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
          connected: !!p && (!!p.conn || p.bot),
          isHost: !!p && p.id === this.hostId,
          isYou: p?.id === viewer.id,
          isBot: !!p?.bot,
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
    this.scheduleBots();
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
