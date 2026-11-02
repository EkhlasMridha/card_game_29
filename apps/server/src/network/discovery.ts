import { createSocket, type Socket } from 'node:dgram';
import { lanAddresses } from './interfaces';

/**
 * Optional LAN discovery (enabled with --discovery). Browsers cannot send UDP,
 * so discovery runs in the Node host: each host broadcasts a tiny announcement
 * on the local subnet and lists other hosts it hears. Nothing leaves the LAN —
 * limited broadcast (255.255.255.255) is never forwarded by routers.
 */
const DISCOVERY_PORT = 41029;
const ANNOUNCE_MS = 4000;
const EXPIRE_MS = 15000;

interface Peer {
  name: string;
  url: string;
  seen: number;
}

export class LanDiscovery {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private peers = new Map<string, Peer>();

  constructor(
    private readonly name: string,
    private readonly port: number,
  ) {}

  start(): void {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', (err) => {
      console.warn(`[discovery] disabled: ${err.message}`);
      this.stop();
    });
    socket.on('message', (buf, rinfo) => {
      if (buf.length > 256) return;
      try {
        const msg = JSON.parse(buf.toString('utf8')) as { app?: string; v?: number; name?: string; port?: number };
        if (msg.app !== 'twentynine' || msg.v !== 1 || typeof msg.port !== 'number') return;
        const own = lanAddresses().some((a) => a.address === rinfo.address) && msg.port === this.port;
        if (own) return;
        const url = `http://${rinfo.address}:${msg.port}`;
        this.peers.set(url, { name: String(msg.name ?? 'Host').slice(0, 32), url, seen: Date.now() });
      } catch {
        /* ignore malformed packets */
      }
    });
    socket.bind(DISCOVERY_PORT, () => {
      socket.setBroadcast(true);
      this.announce();
      this.timer = setInterval(() => this.announce(), ANNOUNCE_MS);
    });
  }

  private announce(): void {
    const payload = Buffer.from(JSON.stringify({ app: 'twentynine', v: 1, name: this.name, port: this.port }));
    this.socket?.send(payload, DISCOVERY_PORT, '255.255.255.255');
  }

  hosts(): { name: string; url: string }[] {
    const now = Date.now();
    for (const [k, p] of this.peers) if (now - p.seen > EXPIRE_MS) this.peers.delete(k);
    return [...this.peers.values()].map(({ name, url }) => ({ name, url }));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket?.close();
    this.socket = null;
    this.timer = null;
  }
}
