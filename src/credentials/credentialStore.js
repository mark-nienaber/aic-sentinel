const { Entry } = require('@napi-rs/keyring');

const FALLBACK_MESSAGE = 'OS keychain unavailable; credentials will last only until Sentinel stops.';

class CredentialStore {
  constructor({ EntryClass = Entry, serviceName = 'AIC Sentinel' } = {}) {
    this.EntryClass = EntryClass;
    this.serviceName = serviceName;
    this.memory = new Map();
    this.persistent = true;
    this.failureMessage = null;
  }

  _entry(tenantId) {
    return new this.EntryClass(this.serviceName, tenantId);
  }

  _markUnavailable() {
    this.persistent = false;
    this.failureMessage = FALLBACK_MESSAGE;
  }

  save(tenantId, { apiKey, apiSecret }) {
    const serialized = JSON.stringify({ apiKey, apiSecret });
    if (this.persistent) {
      try {
        this._entry(tenantId).setPassword(serialized);
        return;
      } catch {
        this._markUnavailable();
      }
    }
    this.memory.set(tenantId, { apiKey, apiSecret });
  }

  get(tenantId) {
    if (this.persistent) {
      try {
        const serialized = this._entry(tenantId).getPassword();
        const credentials = JSON.parse(serialized);
        if (!credentials?.apiKey || !credentials?.apiSecret) return null;
        return { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret };
      } catch {
        return null;
      }
    }
    return this.memory.get(tenantId) || null;
  }

  remove(tenantId) {
    this.memory.delete(tenantId);
    if (!this.persistent) return;
    try {
      this._entry(tenantId).deletePassword();
    } catch {
      this._markUnavailable();
    }
  }

  isAvailable() {
    return {
      persistent: this.persistent,
      message: this.failureMessage
    };
  }
}

module.exports = CredentialStore;
