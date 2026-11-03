import type { GameEvent, GameView, RoomView, ServerInfo } from '@card29/shared';

/**
 * Small typed external store. React subscribes with useSyncExternalStore; the
 * Phaser scene subscribes directly so that animations never cause React renders.
 * The store only mirrors server snapshots — it never computes game rules.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warn' | 'error' | 'trump';
}

export interface Settings {
  name: string;
  sound: boolean;
  motion: 'full' | 'reduced';
  fourColor: boolean;
}

export interface ClientState {
  connection: ConnectionStatus;
  serverInfo: ServerInfo | null;
  roomCode: string | null;
  /** Room code from an invite link that still needs a display name before joining. */
  pendingJoinCode: string | null;
  /** Room code in the address bar (/game?room=CODE), mirrored here so the UI re-renders when it changes. */
  linkedRoom: string | null;
  room: RoomView | null;
  game: GameView | null;
  rev: number;
  toasts: Toast[];
  settings: Settings;
  /** Set when the server removes us from a room (shown on the menu). */
  leftReason: string | null;
}

type Listener = () => void;
type EventListener = (event: GameEvent) => void;

const SETTINGS_KEY = 't29.settings';

function loadSettings(): Settings {
  const defaults: Settings = {
    name: '',
    sound: true,
    motion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
    fourColor: false,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

class Store {
  private state: ClientState = {
    connection: 'connecting',
    serverInfo: null,
    roomCode: null,
    pendingJoinCode: null,
    linkedRoom: null,
    room: null,
    game: null,
    rev: -1,
    toasts: [],
    settings: loadSettings(),
    leftReason: null,
  };
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private toastId = 0;

  getState = (): ClientState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onGameEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  set(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  emitGameEvent(event: GameEvent): void {
    for (const l of this.eventListeners) l(event);
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    this.set({ settings });
  }

  toast(text: string, tone: Toast['tone'] = 'info', ms = 3200): void {
    const id = ++this.toastId;
    this.set({ toasts: [...this.state.toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) }), ms);
  }
}

export const store = new Store();
