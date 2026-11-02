import { networkInterfaces } from 'node:os';
import type { NetworkAddress } from '@twentynine/shared';

/** Non-internal IPv4 addresses of this machine, private LAN ranges first. */
export function lanAddresses(): NetworkAddress[] {
  const out: NetworkAddress[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push({ interface: name, address: info.address });
    }
  }
  const rank = (a: string) =>
    a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : a.startsWith('169.254.') ? 4 : 3;
  return out.sort((x, y) => rank(x.address) - rank(y.address));
}
