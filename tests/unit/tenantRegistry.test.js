const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TenantRegistry = require('../../src/tenants/tenantRegistry');

test('persists only browser-safe tenant profile fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aic-sentinel-'));
  const filePath = path.join(directory, 'tenants.json');
  const registry = new TenantRegistry({ filePath });

  const tenant = registry.save({
    id: 'tenant-1',
    name: 'Development',
    origin: 'https://tenant.forgeblocks.com',
    approvedCustomDomain: false,
    apiSecret: 'must-not-persist'
  });

  assert.deepEqual(tenant, {
    id: 'tenant-1',
    name: 'Development',
    origin: 'https://tenant.forgeblocks.com',
    approvedCustomDomain: false
  });
  assert.equal(Object.hasOwn(registry.get('tenant-1'), 'apiSecret'), false);
  assert.equal(registry.list().length, 1);
  assert.equal(fs.readFileSync(filePath, 'utf8').includes('must-not-persist'), false);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  }

  assert.equal(registry.remove('tenant-1'), true);
  assert.equal(registry.get('tenant-1'), null);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('strips unexpected fields from legacy registry records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aic-sentinel-'));
  const filePath = path.join(directory, 'tenants.json');
  fs.writeFileSync(filePath, JSON.stringify([{
    id: 'tenant-1',
    name: 'Development',
    origin: 'https://tenant.forgeblocks.com',
    approvedCustomDomain: false,
    apiSecret: 'legacy-secret'
  }]));

  const registry = new TenantRegistry({ filePath });
  const tenant = registry.get('tenant-1');
  assert.equal(Object.hasOwn(tenant, 'apiSecret'), false);
  assert.equal(Object.hasOwn(registry.list()[0], 'apiSecret'), false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('generates an ID when saving a tenant without one', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aic-sentinel-'));
  const registry = new TenantRegistry({ filePath: path.join(directory, 'tenants.json') });
  const tenant = registry.save({
    name: 'Development',
    origin: 'https://tenant.forgeblocks.com',
    approvedCustomDomain: false
  });

  assert.match(tenant.id, /^[0-9a-f-]{36}$/);
  fs.rmSync(directory, { recursive: true, force: true });
});
