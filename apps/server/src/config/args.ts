export interface ServerConfig {
  port: number;
  bind: string;
  dev: boolean;
  discovery: boolean;
  hostName: string;
  /** Addresses shown to players instead of this machine's interfaces (e.g. the Docker host's LAN IP). */
  advertise: string[];
  /** Public site address when served through a reverse proxy, e.g. https://card29.example.com (origin only). */
  publicUrl: string | null;
  /** Trust X-Forwarded-Host / X-Forwarded-Proto from the reverse proxy in front of this server. */
  trustProxy: boolean;
}

const HELP = `Card 29 host server

Usage: npm start -- [options]

  --port <n>          Port for HTTP + WebSocket (default 5050, env PORT)
  --bind <address>    Interface address to listen on (default 0.0.0.0 = all interfaces)
  --discovery         Announce this host on the local network via UDP broadcast (port 41029)
  --name <text>       Host name shown to discovering hosts (default: computer hostname)
  --advertise <a,b>   LAN address(es) shown in the lobby instead of the detected ones
                      (env ADVERTISE_ADDRESS; needed in Docker, which only sees its own network)
  --public-url <url>  Public address behind a reverse proxy, e.g. https://card29.example.com
                      (env PUBLIC_URL; used for join links, canonical URL, sitemap and the origin check)
  --trust-proxy       Trust X-Forwarded-Host/-Proto from the proxy (env TRUST_PROXY=1)
  --help              Show this help
`;

export function parseArgs(argv: string[], defaultName: string): ServerConfig {
  const cfg: ServerConfig = {
    port: Number(process.env.PORT) || 5050,
    bind: process.env.BIND || '0.0.0.0',
    dev: false,
    discovery: process.env.DISCOVERY === '1',
    hostName: defaultName,
    advertise: splitList(process.env.ADVERTISE_ADDRESS),
    publicUrl: process.env.PUBLIC_URL || null,
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') cfg.port = Number(argv[++i]);
    else if (a === '--bind') cfg.bind = String(argv[++i]);
    else if (a === '--dev') cfg.dev = true;
    else if (a === '--discovery') cfg.discovery = true;
    else if (a === '--name') cfg.hostName = String(argv[++i]).slice(0, 32);
    else if (a === '--advertise') cfg.advertise = splitList(argv[++i]);
    else if (a === '--public-url') cfg.publicUrl = String(argv[++i]);
    else if (a === '--trust-proxy') cfg.trustProxy = true;
    else if (a === '--help' || a === '-h') {
      console.log(HELP);
      process.exit(0);
    }
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    console.error('Invalid --port');
    process.exit(1);
  }
  // Hostnames or IPv4 addresses only: these end up in URLs and QR codes.
  const bad = cfg.advertise.find((a) => !/^[a-zA-Z0-9.-]{1,253}$/.test(a));
  if (bad !== undefined) {
    console.error(`Invalid --advertise / ADVERTISE_ADDRESS entry: ${bad}`);
    process.exit(1);
  }
  if (cfg.publicUrl) cfg.publicUrl = normalizePublicUrl(cfg.publicUrl);
  return cfg;
}

/** http(s) origin only: the client connects to /ws at the site root, so a sub-path is not supported. */
function normalizePublicUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error(`Invalid --public-url / PUBLIC_URL: ${raw}`);
    process.exit(1);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    console.error(`--public-url / PUBLIC_URL must be a plain http(s) address, e.g. https://card29.example.com (got ${raw})`);
    process.exit(1);
  }
  if (url.pathname !== '/') {
    console.error(`--public-url / PUBLIC_URL must be the site root; serving Card 29 under a sub-path (${url.pathname}) is not supported.`);
    process.exit(1);
  }
  return url.origin;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
