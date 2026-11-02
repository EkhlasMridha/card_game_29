import { createServer, type IncomingMessage } from 'node:http';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type ServerInfo } from '@card29/shared';
import { parseArgs } from './config/args';
import { createRequestHandler } from './http/staticServer';
import { LanDiscovery } from './network/discovery';
import { lanAddresses } from './network/interfaces';
import { RoomManager } from './rooms/roomManager';
import { isAllowedOrigin } from './security/origin';
import { ClientConnection } from './websocket/connection';

const APP_VERSION = '1.0.0';
const config = parseArgs(process.argv.slice(2), hostname());
const here = dirname(fileURLToPath(import.meta.url));
// Works both from source (apps/server/src) and from the bundle (apps/server/dist).
const webRoot = resolve(here, '../../web/dist');

const rooms = new RoomManager();
const discovery = config.discovery ? new LanDiscovery(config.hostName, config.port) : null;

function serverInfo(): ServerInfo {
  return {
    appVersion: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    port: config.port,
    addresses: config.advertise.length
      ? config.advertise.map((address) => ({ interface: 'Host', address }))
      : config.bind === '0.0.0.0'
        ? lanAddresses()
        : lanAddresses().filter((a) => a.address === config.bind),
    publicUrl: config.publicUrl,
    rooms: rooms.list(),
    discoveredHosts: discovery?.hosts() ?? [],
  };
}

const server = createServer(
  createRequestHandler(webRoot, serverInfo, { publicUrl: config.publicUrl, trustProxy: config.trustProxy }),
);
const originPolicy = { dev: config.dev, trustProxy: config.trustProxy, publicOrigin: config.publicUrl };
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://local').pathname;
  if (path !== '/ws' || !isAllowedOrigin(req, originPolicy)) {
    logRejectedUpgrade(req, path);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
    new ClientConnection(ws, rooms, serverInfo);
  });
});

/** Log each distinct rejected upgrade once, so proxy misconfigurations show up in the logs. */
const loggedRejections = new Set<string>();
function logRejectedUpgrade(req: IncomingMessage, path: string): void {
  const h = (name: string) => String(req.headers[name] ?? '-');
  const key = `${path}|${h('origin')}|${h('host')}|${h('x-forwarded-host')}`;
  if (loggedRejections.has(key) || loggedRejections.size >= 50) return;
  loggedRejections.add(key);
  console.warn(
    `[ws] rejected upgrade: path=${path} origin=${h('origin')} host=${h('host')} ` +
      `x-forwarded-host=${h('x-forwarded-host')} x-forwarded-proto=${h('x-forwarded-proto')} ` +
      `(PUBLIC_URL=${config.publicUrl ?? 'unset'}, TRUST_PROXY=${config.trustProxy ? 1 : 0})`,
  );
}

// Heartbeat: drop dead sockets so seats show as disconnected promptly.
const alive = new WeakMap<object, boolean>();
wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 10000);

server.listen(config.port, config.bind, () => {
  const addrs = serverInfo().addresses;
  console.log('\n  ♠ ♥  Card 29  ♦ ♣\n');
  console.log(`  Local:   http://localhost:${config.port}`);
  if (config.publicUrl) console.log(`  Public:  ${config.publicUrl}`);
  if (config.trustProxy) console.log('  Proxy:   trusting X-Forwarded-Host / X-Forwarded-Proto');
  for (const a of addrs) console.log(`  LAN:     http://${a.address}:${config.port}   (${a.interface})`);
  if (addrs.length === 0) console.log('  No LAN interface found — connect this computer to Wi-Fi to let others join.');
  console.log('\n  Share a LAN address with the other players (same Wi-Fi network).');
  console.log('  Game state is kept in memory only; closing this window ends all games.');
  if (config.dev) console.log('  [dev mode] Vite dev server origin (port 5173) allowed.');
  console.log('');
  discovery?.start();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.port} is already in use. Try --port 5051.`);
  else console.error(err.message);
  process.exit(1);
});

function shutdown(): void {
  console.log('\nShutting down — all rooms are closed.');
  clearInterval(heartbeat);
  rooms.shutdownAll('The host has shut down.');
  discovery?.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
