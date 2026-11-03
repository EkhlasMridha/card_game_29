import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerInfo } from '@card29/shared';
import { requestHost } from '../security/origin';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
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
 * any other site (no CDNs, analytics, fonts or remote APIs).
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/** Paths that render the app (the room page is /game?room=CODE). */
const APP_PAGES = new Set(['/', '/index.html', '/game']);

/** Marker in index.html replaced with the canonical / og:url tags when PUBLIC_URL is set. */
const SEO_MARKER = '<!--card29:canonical-->';

export interface SiteOptions {
  /** Public origin behind a reverse proxy (PUBLIC_URL), or null on a LAN. */
  publicUrl: string | null;
  trustProxy: boolean;
}

export function createRequestHandler(webRoot: string, info: () => ServerInfo, site: SiteOptions) {
  const root = resolve(webRoot);
  const indexFile = join(root, 'index.html');
  const hasBuild = existsSync(indexFile);

  // index.html is small and never changes while the server runs: render it once.
  const indexHtml = hasBuild
    ? readFileSync(indexFile, 'utf8').replace(
        SEO_MARKER,
        site.publicUrl ? `<link rel="canonical" href="${site.publicUrl}/" />\n    <meta property="og:url" content="${site.publicUrl}/" />` : '',
      )
    : '';

  const robots = site.publicUrl
    ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /game\nDisallow: /ws\n\nSitemap: ${site.publicUrl}/sitemap.xml\n`
    : 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /game\nDisallow: /ws\n';
  const sitemap = site.publicUrl
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site.publicUrl}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`
    : null;

  const sendText = (req: IncomingMessage, res: ServerResponse, status: number, type: string, body: string, cache = 'no-cache') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Length': Buffer.byteLength(body) });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  return (req: IncomingMessage, res: ServerResponse): void => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    // Older Safari does not treat 'self' as covering ws:, so name the browser-facing host explicitly.
    // Behind a trusted proxy that is X-Forwarded-Host; Host may be the upstream address.
    const host = requestHost(req, site.trustProxy);
    res.setHeader(
      'Content-Security-Policy',
      host && /^[a-zA-Z0-9.:[\]-]+$/.test(host) ? CSP.replace("connect-src 'self'", `connect-src 'self' ws://${host} wss://${host}`) : CSP,
    );
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://local');

    if (url.pathname === '/api/info') {
      sendText(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(info()), 'no-store');
      return;
    }
    if (url.pathname === '/robots.txt') {
      sendText(req, res, 200, MIME['.txt'], robots, 'public, max-age=3600');
      return;
    }
    if (url.pathname === '/sitemap.xml') {
      if (sitemap) sendText(req, res, 200, MIME['.xml'], sitemap, 'public, max-age=3600');
      else sendText(req, res, 404, MIME['.txt'], 'Not found. Set PUBLIC_URL to publish a sitemap.');
      return;
    }

    if (!hasBuild) {
      sendText(req, res, 503, MIME['.txt'], 'The web client has not been built. Run "npm run build" first (or use "npm run dev" for development).');
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

    const isFile = target !== indexFile && existsSync(target) && statSync(target).isFile();
    if (!isFile) {
      // The app pages ("/", "/game") serve index.html; a missing asset is a plain 404 (never HTML
      // served as JavaScript); any other unknown path shows the app with a 404 status so
      // search engines don't index it as a duplicate page.
      if (pathname.startsWith('/assets/')) {
        sendText(req, res, 404, MIME['.txt'], 'Not found');
        return;
      }
      const status = APP_PAGES.has(pathname) ? 200 : 404;
      sendText(req, res, status, MIME['.html'], indexHtml);
      return;
    }

    const ext = extname(target).toLowerCase();
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': statSync(target).size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(target).pipe(res);
  };
}
