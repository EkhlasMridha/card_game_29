import type { IncomingMessage } from 'node:http';

export interface OriginPolicy {
  /** Development: also allow the Vite dev server (port 5173). */
  dev: boolean;
  /** Behind a reverse proxy: the browser-facing host is in X-Forwarded-Host. */
  trustProxy: boolean;
  /** Configured public origin (PUBLIC_URL), always allowed. */
  publicOrigin: string | null;
}

function firstHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.split(',')[0]?.trim() || undefined;
}

/**
 * The host the browser used. Behind a trusted proxy that is X-Forwarded-Host
 * (nginx often rewrites Host to the upstream address); otherwise the Host header.
 * Forwarded headers are ignored unless the proxy is trusted, so a client
 * talking to the server directly cannot spoof them.
 */
export function requestHost(req: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const forwarded = firstHeader(req, 'x-forwarded-host');
    if (forwarded) return forwarded;
  }
  return firstHeader(req, 'host');
}

/** "https" or "http" as seen by the browser. */
export function requestProto(req: IncomingMessage, trustProxy: boolean): 'http' | 'https' {
  if (trustProxy && firstHeader(req, 'x-forwarded-proto') === 'https') return 'https';
  return 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
}

/**
 * Cross-site WebSocket hijacking protection: a web page from another origin
 * (for example an internet site open in a player's browser) must not be able
 * to open a socket to the game host. Allowed: the configured public origin,
 * the same host the page was loaded from, and the Vite dev server in development.
 */
export function isAllowedOrigin(req: IncomingMessage, policy: OriginPolicy): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (policy.publicOrigin && parsed.origin === policy.publicOrigin) return true;
  const host = requestHost(req, policy.trustProxy);
  if (host && parsed.host === host) return true;
  return policy.dev && parsed.port === '5173';
}
