const test = require('node:test');
const assert = require('node:assert/strict');
const CredentialStore = require('../../src/credentials/credentialStore');

class FakeEntry {
  static values = new Map();

  constructor(service, account) {
    this.key = `${service}:${account}`;
  }

  setPassword(value) {
    FakeEntry.values.set(this.key, value);
  }

  getPassword() {
    if (!FakeEntry.values.has(this.key)) throw new Error('No entry');
    return FakeEntry.values.get(this.key);
  }

  deletePassword() {
    FakeEntry.values.delete(this.key);
  }
}

test('stores and removes secret outside browser profile', () => {
  FakeEntry.values.clear();
  const store = new CredentialStore({ EntryClass: FakeEntry, serviceName: 'test' });

  store.save('tenant-1', { apiKey: 'id', apiSecret: 'secret' });
  assert.deepEqual(store.get('tenant-1'), { apiKey: 'id', apiSecret: 'secret' });
  assert.deepEqual(store.isAvailable(), { persistent: true, message: null });

  store.remove('tenant-1');
  assert.equal(store.get('tenant-1'), null);
});

test('uses process memory only after OS keychain failure', () => {
  class FailingEntry {
    constructor() {}
    setPassword() { throw new Error('keychain locked'); }
    getPassword() { throw new Error('keychain locked'); }
    deletePassword() { throw new Error('keychain locked'); }
  }

  const store = new CredentialStore({ EntryClass: FailingEntry });
  store.save('tenant-1', { apiKey: 'id', apiSecret: 'secret' });

  assert.deepEqual(store.get('tenant-1'), { apiKey: 'id', apiSecret: 'secret' });
  assert.equal(store.isAvailable().persistent, false);
  assert.match(store.isAvailable().message, /OS keychain unavailable/);
  store.remove('tenant-1');
  assert.equal(store.get('tenant-1'), null);
});
