const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAicOrigin } = require('../../src/security/originPolicy');

const publicLookup = async () => [{ address: '18.202.1.10', family: 4 }];

test('accepts HTTPS ForgeBlocks origin with public DNS answer', async () => {
  const result = await validateAicOrigin('https://tenant.forgeblocks.com', { lookup: publicLookup });
  assert.equal(result.origin, 'https://tenant.forgeblocks.com');
  assert.equal(result.lookup('ignored', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '18.202.1.10');
    assert.equal(family, 4);
  }), undefined);
});

test('pinned lookup returns record array when all is requested', async () => {
  const result = await validateAicOrigin('https://tenant.forgeblocks.com', { lookup: publicLookup });
  result.lookup('ignored', { all: true }, (error, records) => {
    assert.equal(error, null);
    assert.deepEqual(records, [{ address: '18.202.1.10', family: 4 }]);
  });
});

test('rejects non-HTTPS, unknown host, and private resolved address', async () => {
  await assert.rejects(() => validateAicOrigin('http://tenant.forgeblocks.com', { lookup: publicLookup }));
  await assert.rejects(() => validateAicOrigin('https://127.0.0.1.nip.io', { lookup: publicLookup }));
  await assert.rejects(() => validateAicOrigin('https://tenant.forgeblocks.com', {
    lookup: async () => [{ address: '172.31.2.2', family: 4 }]
  }));
});

test('rejects literal IP addresses, paths, and nondefault ForgeBlocks ports', async () => {
  await assert.rejects(() => validateAicOrigin('https://18.202.1.10', { lookup: publicLookup }));
  await assert.rejects(() => validateAicOrigin('https://tenant.forgeblocks.com/am', { lookup: publicLookup }));
  await assert.rejects(() => validateAicOrigin('https://tenant.forgeblocks.com:8443', { lookup: publicLookup }));
});

test('rejects private, mapped, and reserved IPv6 DNS answers', async () => {
  for (const address of ['::', '0:0:0:0:0:0:0:1', 'fe90::1', 'fd00::1', 'ff01::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:172.31.2.2']) {
    await assert.rejects(() => validateAicOrigin('https://tenant.forgeblocks.com', {
      lookup: async () => [{ address, family: 6 }]
    }), new RegExp('public IP'));
  }
});
