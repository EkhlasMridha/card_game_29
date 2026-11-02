import { PROTOCOL_VERSION, type OutgoingMessage, type ServerMessage } from '@card29/shared';
import { store } from '../state/store';
import { describeEvent } from './eventText';

/**
 * WebSocket transport. Same-origin only (the page and socket come from the host),
 * reconnects with backoff and automatically resumes the saved seat.
 */

const SESSION_KEY = 't29.session';

interface SavedSession {
  code: string;
  token: string;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: SavedSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: reconnection after refresh will not work */
  }
}

class NetworkClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private nextId = 1;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    store.set({ connection: this.attempt === 0 ? 'connecting' : 'reconnecting' });

    ws.onopen = () => {
      this.attempt = 0;
      store.set({ connection: 'open' });
      const session = loadSession();
      if (session) this.send({ type: 'RESUME', code: session.code, token: session.token });
      this.pingTimer = window.setInterval(() => this.send({ type: 'PING' }), 20000);
    };
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.ws = null;
      store.set({ connection: 'reconnecting' });
      const delay = Math.min(8000, 500 * 2 ** this.attempt++);
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  /** Force an immediate reconnect attempt (e.g. when the tab becomes visible again). */
  poke(): void {
    if (this.ws) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.attempt = 0;
    this.connect();
  }

  send(msg: OutgoingMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (msg.type !== 'PING') store.toast('Not connected to the host — reconnecting…', 'warn');
      return false;
    }
    this.ws.send(JSON.stringify({ ...msg, v: PROTOCOL_VERSION, id: this.nextId++ }));
    return true;
  }

  private handle(msg: ServerMessage): void {
    if (msg.v !== PROTOCOL_VERSION) return;
    switch (msg.type) {
      case 'SERVER_INFO':
        store.set({ serverInfo: msg.info });
        break;
      case 'ROOM_JOINED':
        saveSession({ code: msg.code, token: msg.token });
        store.set({ roomCode: msg.code, leftReason: null, rev: -1 });
        if (msg.rejoined) store.toast('Reconnected to your seat.', 'success');
        break;
      case 'STATE': {
        const s = store.getState();
        if (msg.rev < s.rev) return; // stale
        store.set({ rev: msg.rev, room: msg.room, game: msg.game });
        break;
      }
      case 'EVENT': {
        const s = store.getState();
        if (msg.rev < s.rev) return;
        store.emitGameEvent(msg.event);
        const text = describeEvent(msg.event, s.room, s.game?.yourSeat ?? null);
        if (text) store.toast(text.text, text.tone, text.ms);
        break;
      }
      case 'ACTION_REJECTED':
        store.toast(msg.reason, 'error');
        store.emitGameEvent({ type: 'NOTICE', message: `__rejected:${msg.action}` });
        break;
      case 'ERROR':
        if (msg.code === 'SESSION_INVALID') {
          saveSession(null);
          store.set({ room: null, game: null, roomCode: null, rev: -1 });
        }
        store.toast(msg.message, msg.code === 'SESSION_INVALID' ? 'warn' : 'error', 4500);
        break;
      case 'LEFT_ROOM':
        saveSession(null);
        store.set({ room: null, game: null, roomCode: null, rev: -1, leftReason: msg.reason });
        break;
      case 'PONG':
        break;
    }
  }
}

export const net = new NetworkClient();
