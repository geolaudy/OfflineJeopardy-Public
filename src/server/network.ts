// LAN address discovery for join/host URLs and QR codes.
import os from 'node:os';

export interface LanAddress {
  name: string;
  address: string;
  likelyVirtual: boolean;
}

const VIRTUAL = /(vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|tailscale|zerotier|bluetooth|npcap|tap)/i;

export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // link-local: no DHCP
      out.push({ name, address: a.address, likelyVirtual: VIRTUAL.test(name) });
    }
  }
  // Prefer physical adapters with private ranges typical of home routers.
  const score = (a: LanAddress) =>
    (a.likelyVirtual ? 10 : 0) + (a.address.startsWith('192.168.') ? 0 : a.address.startsWith('10.') ? 1 : a.address.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}

export function pickAddress(preferred: string | null): string {
  const list = lanAddresses();
  if (preferred && list.some((a) => a.address === preferred)) return preferred;
  return list[0]?.address ?? '127.0.0.1';
}
