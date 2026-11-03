import { PROTOCOL_VERSION, type OutgoingMessage, type ServerInfo, type ServerMessage } from '@card29/shared';
import { store } from '../state/store';
import { describeEvent } from './eventText';

/**
 * WebSocket transport. Same-origin only (the page and socket come from the host).
 *
 * Staying in a room:
 * - The room code lives in the URL (/game?room=CODE) and each room's seat token in
 *   localStorage, so a reload, a closed tab or a dropped connection resumes the seat.
 * - Dropped sockets reconnect with backoff, immediately when the browser comes back
 *   online or the tab becomes visible, and a silent (half-open) socket is detected
 *   by a heartbeat instead of waiting for the OS to notice.
 * - Opening an invite link joins the room (or pre-fills the join form if no name is set).
 */

const SESSIONS_KEY = 't29.sessions';
const LEGACY_SESSION_KEY = 't29.session';
const MAX_SESSIONS = 20;
const PING_MS = 10000;
/** No message at all for this long means the socket is dead even if it never closed. */
const STALE_MS = 25000;
const CODE_RE = /^[A-Z0-9]{4}$/;

type Sessions = Record<string, string>;

function loadSessions(): Sessions {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const sessions = raw ? (JSON.parse(raw) as Sessions) : {};
    // One-time migration from the single-session format.
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      const { code, token } = JSON.parse(legacy) as { code: string; token: string };
      if (code && token && !sessions[code]) sessions[code] = token;
      localStorage.removeItem(LEGACY_SESSION_KEY);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
    return sessions;
  } catch {
    return {};
  }
}

function tokenFor(code: string): string | null {
  return loadSessions()[code] ?? null;
}

function saveToken(code: string, token: string | null): void {
  try {
    const sessions = loadSessions();
    delete sessions[code];
    if (token) sessions[code] = token; // re-inserted last = most recent
    const codes = Object.keys(sessions);
    for (const old of codes.slice(0, Math.max(0, codes.length - MAX_SESSIONS))) delete sessions[old];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* storage unavailable: reconnection after refresh will not work */
  }
}

/** The room code in the address bar (/game?room=CODE), if any. */
export function roomFromUrl(): string | null {
  if (location.pathname !== '/game') return null;
  const code = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Shareable link that opens a room directly. */
export function roomLink(base: string, code: string): string {
  return `${base.replace(/\/+$/, '')}/game?room=${encodeURIComponent(code)}`;
}

function setUrl(path: string): void {
  if (location.pathname + location.search !== path) history.replaceState(null, '', path);
  store.set({ linkedRoom: roomFromUrl() });
}

class NetworkClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private nextId = 1;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private lastMessageAt = 0;
  private started = false;
  /** Room code of the last RESUME sent, so a rejected resume can fall back to a normal join. */
  private resumingCode: string | null = null;

  /** Connect and keep the connection alive for the lifetime of the page. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.loadInfo();
    this.connect();
    const wake = () => document.visibilityState === 'visible' && this.poke();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    // The OS can take minutes to report a dead socket; going offline is a sure sign.
    window.addEventListener('offline', () => this.drop());
  }

  /**
   * Load the server info over plain HTTP too, so the page knows whether it is a
   * public site or a LAN host even before (or without) the WebSocket connecting.
   * The SERVER_INFO message over the socket replaces it once connected.
   */
  loadInfo(): void {
    fetch('/api/info', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
      .then((info) => {
        if (info && !store.getState().serverInfo) store.set({ serverInfo: info });
      })
      .catch(() => {
        /* offline: the socket will deliver it when it connects */
      });
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    store.set({ connection: this.attempt === 0 ? 'connecting' : 'reconnecting' });

    ws.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      store.set({ connection: 'open' });
      this.enterRoomOnConnect();
      this.pingTimer = window.setInterval(() => {
        if (Date.now() - this.lastMessageAt > STALE_MS) this.drop();
        else this.send({ type: 'PING' });
      }, PING_MS);
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        this.handle(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.scheduleReconnect();
    };
  }

  /** Abandon the current socket (dead or offline) and reconnect. */
  private drop(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
    store.set({ connection: 'reconnecting' });
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    // While the browser reports no network, wait for the "online" event instead of spinning.
    if (!navigator.onLine) return;
    const delay = Math.min(8000, 500 * 2 ** this.attempt++);
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  /** Force an immediate reconnect attempt (back online, tab visible again, "Retry now"). */
  poke(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // A socket that looks open after the device slept may be dead: check it now.
      if (Date.now() - this.lastMessageAt > STALE_MS) this.drop();
      else this.send({ type: 'PING' });
      return;
    }
    if (this.ws) return; // already connecting
    this.attempt = 0;
    this.connect();
  }

  /** After (re)connecting: resume the seat for the current room, or the room in the URL. */
  private enterRoomOnConnect(): void {
    const code = store.getState().roomCode ?? roomFromUrl();
    if (!code) return;
    const token = tokenFor(code);
    if (token) this.resume(code, token);
    else this.joinFromLink(code);
  }

  private resume(code: string, token: string): void {
    this.resumingCode = code;
    this.send({ type: 'RESUME', code, token });
  }

  /** Join a room from an invite link: directly with the saved name, otherwise via the join form. */
  private joinFromLink(code: string): void {
    const name = store.getState().settings.name.trim();
    if (name) this.send({ type: 'JOIN_ROOM', code, name });
    else store.set({ pendingJoinCode: code });
  }

  /** Join by room code. Takes your old seat back if this browser had one in that room. */
  joinRoom(code: string, name: string): void {
    const token = tokenFor(code);
    if (token) this.resume(code, token);
    else this.send({ type: 'JOIN_ROOM', code, name });
  }

  /** Leave the room-link flow (e.g. Back on a pre-filled join form). */
  cancelPendingJoin(): void {
    if (location.pathname === '/game') setUrl('/');
    store.set(store.getState().room ? { pendingJoinCode: null } : { pendingJoinCode: null, roomCode: null });
  }

  send(msg: OutgoingMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (msg.type !== 'PING') store.toast('Not connected to the server — reconnecting…', 'warn');
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
        this.resumingCode = null;
        saveToken(msg.code, msg.token);
        setUrl(roomLink('', msg.code));
        store.set({ roomCode: msg.code, pendingJoinCode: null, leftReason: null, rev: -1 });
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
      case 'ERROR': {
        const s = store.getState();
        const code = this.resumingCode ?? s.roomCode ?? roomFromUrl();
        this.resumingCode = null;
        if (msg.code === 'SESSION_INVALID' && code) {
          // The saved seat is gone (e.g. released after a long absence from the lobby): join again.
          saveToken(code, null);
          store.set({ room: null, game: null, roomCode: null, rev: -1 });
          this.joinFromLink(code);
          break;
        }
        if ((msg.code === 'ROOM_NOT_FOUND' || msg.code === 'ROOM_FULL') && !s.room && location.pathname === '/game') {
          // The link points to a room we cannot enter: back to the menu.
          setUrl('/');
          store.set({ pendingJoinCode: null });
        }
        store.toast(msg.message, 'error', 4500);
        break;
      }
      case 'LEFT_ROOM':
        // The token is kept: during a match the seat stays yours, so the room link still works.
        setUrl('/');
        store.set({ room: null, game: null, roomCode: null, pendingJoinCode: null, rev: -1, leftReason: msg.reason });
        break;
      case 'PONG':
        break;
    }
  }
}

export const net = new NetworkClient();

// Before the first render, so a reloaded room page never flashes the main menu.
store.set({ linkedRoom: roomFromUrl() });
