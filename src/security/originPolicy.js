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

function isPublicIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return false;
  if (normalized.startsWith('fe80:') || normalized.startsWith('ff')) return false;
  const first = Number.parseInt(normalized.split(':')[0], 16);
  if ((first & 0xfe00) === 0xfc00) return false;
  if (normalized.startsWith('2001:db8:')) return false;
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
