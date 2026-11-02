import type { IncomingMessage } from 'node:http';

/**
 * Cross-site WebSocket hijacking protection: a web page from another origin
 * (for example an internet site open in a player's browser) must not be able
 * to open a socket to the game host. Only same-origin connections are allowed,
 * plus the Vite dev server when running in development mode.
 */
export function isAllowedOrigin(req: IncomingMessage, devMode: boolean): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (originHost === req.headers.host) return true;
  if (devMode) {
    const port = new URL(origin).port;
    return port === '5173';
  }
  return false;
}
