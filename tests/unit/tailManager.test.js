const test = require('node:test');
const assert = require('node:assert/strict');
const TailManager = require('../../src/ws/tailManager');

function fakeWs() {
  return {
    readyState: 1,
    sent: [],
    handlers: {},
    on(event, handler) {
      this.handlers[event] = handler;
    },
    send(value) {
      this.sent.push(JSON.parse(value));
    }
  };
}

test('connect resolves client using tenant ID only', async () => {
  const ws = fakeWs();
  const manager = new TailManager(ws, {
    createTenantClient: async ({ tenantId }) => ({ tenantId, destroy() {} })
  });

  await manager.handleMessage({ type: 'connect', tenantId: 'tenant-1' });

  assert.equal(manager.logClient.tenantId, 'tenant-1');
  assert.deepEqual(ws.sent.at(-1), { type: 'connected', tenantId: 'tenant-1' });
});

test('rejects connect message containing browser credentials', async () => {
  const ws = fakeWs();
  const manager = new TailManager(ws, {
    createTenantClient: async () => ({})
  });

  await manager.handleMessage({
    type: 'connect',
    tenantId: 'tenant-1',
    apiSecret: 'must-not-pass'
  });

  assert.match(ws.sent.at(-1).error, /credentials are not accepted/);
});

test('keeps latest tenant after out-of-order connection completion', async () => {
  const ws = fakeWs();
  const resolvers = {};
  const manager = new TailManager(ws, {
    createTenantClient: ({ tenantId }) => new Promise((resolve) => {
      resolvers[tenantId] = resolve;
    })
  });
  const first = manager.handleMessage({ type: 'connect', tenantId: 'tenant-a' });
  const second = manager.handleMessage({ type: 'connect', tenantId: 'tenant-b' });
  const clientB = { tenantId: 'tenant-b', destroy() {} };
  let clientADestroyed = false;
  resolvers['tenant-b'](clientB);
  await second;
  resolvers['tenant-a']({ tenantId: 'tenant-a', destroy() { clientADestroyed = true; } });
  await first;

  assert.equal(manager.logClient, clientB);
  assert.equal(clientADestroyed, true);
  assert.deepEqual(ws.sent.at(-1), { type: 'connected', tenantId: 'tenant-b' });
});

test('rejects valid JSON that is not a message object', async () => {
  const ws = fakeWs();
  const manager = new TailManager(ws, { createTenantClient: async () => ({}) });

  ws.handlers.message(Buffer.from('null'));
  assert.match(ws.sent.at(-1).error, /Invalid message format/);
  ws.handlers.message(Buffer.from('[]'));
  assert.match(ws.sent.at(-1).error, /Invalid message format/);
});
