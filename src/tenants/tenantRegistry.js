const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultFilePath() {
  const base = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'aic-sentinel', 'tenants.json');
}

function toProfile({ id, name, origin, apiKeyId, approvedCustomDomain = false }) {
  return { id: id || crypto.randomUUID(), name, origin, apiKeyId, approvedCustomDomain: Boolean(approvedCustomDomain) };
}

class TenantRegistry {
  constructor({ filePath = defaultFilePath() } = {}) {
    this.filePath = filePath;
  }

  _read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(data)
        ? data.filter(tenant => tenant && typeof tenant.id === 'string').map(toProfile)
        : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      return [];
    }
  }

  _write(tenants) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(directory, 0o700);
      } catch (error) {
        if (!['ENOTSUP', 'EINVAL'].includes(error.code)) throw error;
      }
    }
    fs.writeFileSync(this.filePath, JSON.stringify(tenants.map(toProfile), null, 2) + '\n', { mode: 0o600 });
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(this.filePath, 0o600);
      } catch (error) {
        if (!['ENOTSUP', 'EINVAL'].includes(error.code)) throw error;
      }
    }
  }

  list() {
    return this._read();
  }

  get(tenantId) {
    return this._read().find(tenant => tenant.id === tenantId) || null;
  }

  save(tenant) {
    const profile = toProfile(tenant);
    const tenants = this._read();
    const index = tenants.findIndex(current => current.id === profile.id);
    if (index >= 0) tenants[index] = profile;
    else tenants.push(profile);
    this._write(tenants);
    return profile;
  }

  remove(tenantId) {
    const tenants = this._read();
    const filtered = tenants.filter(tenant => tenant.id !== tenantId);
    if (filtered.length === tenants.length) return false;
    this._write(filtered);
    return true;
  }
}

module.exports = TenantRegistry;
