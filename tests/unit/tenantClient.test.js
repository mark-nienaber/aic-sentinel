const test = require('node:test');
const assert = require('node:assert/strict');
const { createTenantClient } = require('../../src/services/tenantClient');

test('rejects unknown tenant before origin resolution', async () => {
  await assert.rejects(
    () => createTenantClient({
      tenantId: 'unknown',
      tenantRegistry: { get: () => null },
      credentialStore: {},
      validateOrigin: () => { throw new Error('must not run'); }
    }),
    /Unknown tenant/
  );
});

test('constructs client from server-resolved profile and credential', async () => {
  const client = await createTenantClient({
    tenantId: 'tenant-1',
    tenantRegistry: { get: () => ({ id: 'tenant-1', origin: 'https://tenant.forgeblocks.com', apiKeyId: 'key' }) },
    credentialStore: { get: () => ({ apiKey: 'key', apiSecret: 'secret' }) },
    validateOrigin: async () => ({ origin: 'https://tenant.forgeblocks.com', lookup: () => {} }),
    LogClientClass: class { constructor(options) { this.options = options; } }
  });

  assert.equal(client.options.apiSecret, 'secret');
  assert.equal(client.options.apiKey, 'key');
  assert.equal(typeof client.options.lookup, 'function');
});

test('rejects tenant without saved credentials', async () => {
  await assert.rejects(
    () => createTenantClient({
      tenantId: 'tenant-1',
      tenantRegistry: { get: () => ({ id: 'tenant-1', origin: 'https://tenant.forgeblocks.com' }) },
      credentialStore: { get: () => null }
    }),
    /No saved credentials for tenant/
  );
});
