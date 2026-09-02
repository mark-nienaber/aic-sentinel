const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/js/app.js', 'utf8');

test('browser code does not persist API secret', () => {
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*apiSecret/);
  assert.doesNotMatch(app, /sessionStorage\.setItem\([^\n]*apiSecret/);
});

test('normal browser API and WebSocket messages use tenant ID', () => {
  assert.match(app, /tenantId:\s*this\.selectedTenantId/);
  assert.doesNotMatch(app, /type:\s*'connect',[\s\S]{0,250}apiSecret/);
});
