const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOrigin, isLoopbackRemoteAddress } = require('../../src/security/localOrigin');

test('accepts Sentinel loopback origin for listening port', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000', 3000), true);
  assert.equal(isAllowedOrigin('http://localhost:3000', 3000), true);
});

test('rejects remote and mismatched origins', () => {
  assert.equal(isAllowedOrigin('https://sentinel.example.com', 3000), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:4444', 3000), false);
  assert.equal(isLoopbackRemoteAddress('127.0.0.1'), true);
  assert.equal(isLoopbackRemoteAddress('::1'), true);
  assert.equal(isLoopbackRemoteAddress('10.0.0.7'), false);
});
