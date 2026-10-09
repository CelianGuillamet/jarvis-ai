import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class HomeAddressError extends Error {
  constructor(message = 'Adresse Home Assistant refusée.') {
    super(message);
  }
}

export type HomeLookup = (
  host: string,
) => Promise<{ address: string; family: number }[]>;

const ALLOWED_PORTS = new Set<number>([80, 443, 8123]);

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  return parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

/** LAN and loopback only. Link-local, metadata, multicast and public ranges are refused. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  const value = mapped ? mapped[1] : address;
  const v4 = ipv4Octets(value);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = value.toLowerCase();
  return lower === '::1' || /^f[cd][0-9a-f]{2}:/.test(lower);
}

export type ValidatedHomeTarget = {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
};

export function parseHomeBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HomeAddressError();
  }
  const port = url.port
    ? Number(url.port)
    : url.protocol === 'https:'
      ? 443
      : 80;
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname) ||
    !ALLOWED_PORTS.has(port) ||
    !url.hostname
  )
    throw new HomeAddressError();
  return url;
}

/** Resolve once, require every answer to be private, and return the address to pin the connection to. */
export async function validateHomeTarget(
  input: string,
  lookup: HomeLookup = (host) => dnsLookup(host, { all: true }),
): Promise<ValidatedHomeTarget> {
  const url = parseHomeBaseUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let answers: { address: string; family: number }[];
  if (isIP(hostname)) answers = [{ address: hostname, family: isIP(hostname) }];
  else {
    try {
      answers = await lookup(hostname);
    } catch {
      throw new HomeAddressError('Adresse Home Assistant introuvable.');
    }
  }
  if (!answers.length || !answers.every((a) => isPrivateAddress(a.address)))
    throw new HomeAddressError(
      'Seules les adresses du réseau local sont autorisées.',
    );
  const first = answers[0];
  return {
    url,
    hostname,
    address: first.address,
    family: first.family === 6 ? 6 : 4,
  };
}
