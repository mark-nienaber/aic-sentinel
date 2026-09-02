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
