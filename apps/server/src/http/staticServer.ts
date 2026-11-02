import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerInfo } from '@twentynine/shared';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Strict Content-Security-Policy: everything must come from this host. This
 * enforces in the browser that the app cannot load or contact anything on
 * the internet (no CDNs, analytics, fonts or remote APIs).
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

export function createRequestHandler(webRoot: string, info: () => ServerInfo) {
  const root = resolve(webRoot);
  const hasBuild = existsSync(join(root, 'index.html'));

  return (req: IncomingMessage, res: ServerResponse): void => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    // Older Safari does not treat 'self' as covering ws:, so name this host's socket explicitly.
    const host = req.headers.host;
    if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
      res.setHeader(
        'Content-Security-Policy',
        SECURITY_HEADERS['Content-Security-Policy'].replace("connect-src 'self'", `connect-src 'self' ws://${host} wss://${host}`),
      );
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://local');

    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(info()));
      return;
    }

    if (!hasBuild) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('The web client has not been built. Run "npm run build" first (or use "npm run dev" for development).');
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = normalize(join(root, pathname));
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }

    let file = target;
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback
    const ext = extname(file).toLowerCase();
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}
