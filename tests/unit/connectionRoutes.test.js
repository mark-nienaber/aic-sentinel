const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createRouter } = require('../../src/routes/connection');

async function request(app, body) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    return await new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request({ hostname: '127.0.0.1', port, path: '/tenants', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.end(payload);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function appFor({ validateOrigin = async (origin) => ({ origin, lookup: () => {} }) } = {}) {
  const saved = [];
  const app = express();
  app.use(express.json());
  app.use(createRouter({
    tenantRegistry: { save: (tenant) => { const profile = { id: 'tenant-1', ...tenant }; saved.push(profile); return profile; }, list: () => [], get: () => null, remove: () => true },
    credentialStore: { save() {}, get: () => null, remove() {}, isAvailable: () => ({ persistent: true, message: null }) },
    validateOrigin,
    LogClientClass: class { async testConnection() {} destroy() {} }
  }));
  return { app, saved };
}

test('onboarding never returns submitted API key material', async () => {
  const { app } = appFor();
  const result = await request(app, { origin: 'https://tenant.forgeblocks.com', apiKey: 'key-id', apiSecret: 'secret' });
  assert.equal(result.status, 200);
  assert.equal(Object.hasOwn(result.body.tenant, 'apiKeyId'), false);
  assert.equal(JSON.stringify(result.body).includes('key-id'), false);
  assert.equal(JSON.stringify(result.body).includes('secret'), false);
});

test('custom domain validates only after explicit approval', async () => {
  let validateOptions;
  const { app } = appFor({ validateOrigin: async (origin, options) => { validateOptions = options; return { origin, lookup: () => {} }; } });
  const rejected = await request(app, { origin: 'https://logs.example.com', apiKey: 'key-id', apiSecret: 'secret' });
  assert.equal(rejected.status, 400);
  const accepted = await request(app, { origin: 'https://logs.example.com', apiKey: 'key-id', apiSecret: 'secret', approveCustomDomain: true });
  assert.equal(accepted.status, 200);
  assert.deepEqual(validateOptions, { approvedCustomDomains: ['https://logs.example.com'] });
});

test('onboarding rejects custom headers before validation', async () => {
  let validated = false;
  const { app } = appFor({ validateOrigin: async () => { validated = true; return { origin: 'https://tenant.forgeblocks.com', lookup: () => {} }; } });
  const result = await request(app, { origin: 'https://tenant.forgeblocks.com', apiKey: 'key-id', apiSecret: 'secret', customHeaders: {} });
  assert.equal(result.status, 400);
  assert.equal(validated, false);
});
