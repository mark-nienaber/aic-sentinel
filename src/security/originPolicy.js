const dns = require('node:dns/promises');
const net = require('node:net');

const FORGEBLOCKS_SUFFIXES = ['.forgeblocks.com', '.id.forgerock.io'];

function isApprovedHostname(hostname, approvedCustomDomains = []) {
  const host = hostname.toLowerCase();
  if (FORGEBLOCKS_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)) {
    return true;
  }

  return approvedCustomDomains.some((domain) => {
    try {
      return new URL(domain).hostname.toLowerCase() === host;
    } catch {
      return String(domain).toLowerCase() === host;
    }
  });
}

function isPublicIpv4(address) {
  const [a, b] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function ipv6ToBigInt(address) {
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const separator = normalized.lastIndexOf(':');
    const ipv4 = normalized.slice(separator + 1).split('.').map(Number);
    if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }
    normalized = `${normalized.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const parts = normalized.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  if (left.length + right.length > 8 || (parts.length === 1 && left.length !== 8)) return null;
  const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isPublicIpv6(address) {
  const value = ipv6ToBigInt(address);
  if (value === null || value === 0n || value === 1n) return false;

  // IPv4-compatible and IPv4-mapped addresses must obey the IPv4 policy.
  const high96 = value >> 32n;
  if (high96 === 0n || high96 === 0xffffn) {
    const ipv4 = Number(value & 0xffffffffn);
    return isPublicIpv4([
      (ipv4 >>> 24) & 255,
      (ipv4 >>> 16) & 255,
      (ipv4 >>> 8) & 255,
      ipv4 & 255
    ].join('.'));
  }

  // fe80::/10, fc00::/7, ff00::/8, and 2001:db8::/32 are non-public.
  if ((value >> 118n) === 0x3fan) return false;
  if ((value >> 121n) === 0x7en) return false;
  if ((value >> 120n) === 0xffn) return false;
  if ((value >> 96n) === 0x20010db8n) return false;
  return true;
}

function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function pinnedLookup(records) {
  const record = records[0];
  return (_hostname, _options, callback) => callback(null, record.address, record.family);
}

async function validateAicOrigin(origin, { lookup = dns.lookup, approvedCustomDomains = [] } = {}) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Tenant origin must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Tenant origin must be an HTTPS origin without a path, query, or fragment');
  }
  if (net.isIP(url.hostname) || !isApprovedHostname(url.hostname, approvedCustomDomains)) {
    throw new Error('Tenant hostname is not approved');
  }

  const isCustomDomain = approvedCustomDomains.some((domain) => {
    try {
      return new URL(domain).hostname.toLowerCase() === url.hostname.toLowerCase();
    } catch {
      return String(domain).toLowerCase() === url.hostname.toLowerCase();
    }
  });
  if (url.port && url.port !== '443' && !isCustomDomain) {
    throw new Error('ForgeBlocks tenant origins must use port 443');
  }

  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0 || records.some((record) => !isPublicIp(record.address))) {
    throw new Error('Tenant hostname must resolve only to public IP addresses');
  }

  const normalizedPort = url.port && url.port !== '443' ? `:${url.port}` : '';
  return {
    origin: `https://${url.hostname}${normalizedPort}`,
    hostname: url.hostname,
    port: url.port || '443',
    lookup: pinnedLookup(records)
  };
}

module.exports = { validateAicOrigin, isApprovedHostname, isPublicIp, pinnedLookup };
