import { ROOM_NAME_MAX, sanitizeDisplayText, type OpenRoomInfo, type RulesConfig } from '@card29/shared';
import { newRoomCode } from '../security/tokens';
import { Room } from './room';

const MAX_ROOMS = 16;
/** Rooms with nobody connected are discarded after this long (state is in memory only). */
const IDLE_ROOM_MS = 30 * 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref();
  }

  create(roomName: string | undefined, rules: RulesConfig): Room | null {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const name = sanitizeDisplayText(roomName ?? '', ROOM_NAME_MAX) || `Table ${code}`;
    const room = new Room(code, name, rules);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    return room && !room.closed ? room : undefined;
  }

  list(): OpenRoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => !r.closed)
      .map((r) => ({ code: r.code, name: r.name, players: r.playerCount, inGame: r.inGame }));
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyoneConnected = [...room.players.values()].some((p) => p.conn);
      if (room.closed || room.playerCount === 0 || (!anyoneConnected && now - room.lastActivity > IDLE_ROOM_MS)) {
        if (!room.closed) room.shutdown('The room expired.');
        this.rooms.delete(code);
      }
    }
  }

  shutdownAll(reason: string): void {
    for (const room of this.rooms.values()) room.shutdown(reason);
    this.rooms.clear();
    clearInterval(this.sweeper);
  }
}
