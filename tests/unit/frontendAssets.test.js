const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildContentSecurityPolicy } = require('../../src/security/localOrigin');

test('HTML loads no CDN assets', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.doesNotMatch(html, /https:\/\/cdn\./);
  assert.match(html, /\/vendor\/alpinejs\/cdn\.min\.js/);
  assert.match(html, /\/vendor\/tailwindcss\/tailwind\.css/);
});

test('CSP permits Alpine expression evaluation only from local assets', () => {
  const csp = buildContentSecurityPolicy(3000);
  const alpine = fs.readFileSync('public/vendor/alpinejs/cdn.min.js', 'utf8');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:3000 ws:\/\/localhost:3000/);
  assert.match(csp, /script-src 'self' 'unsafe-eval'/);
  assert.doesNotMatch(csp, /https:\/\//);
  assert.match(alpine, /with \(scope\)/);
});
