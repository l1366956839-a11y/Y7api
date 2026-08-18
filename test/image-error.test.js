const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const upstream = fs.readFileSync(path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas', 'main.py'), 'utf8');

test('Cloudflare 502 image errors are converted to actionable Chinese messages', () => {
  assert.match(upstream, /cloudflare/);
  assert.match(upstream, /Bad Gateway/);
  assert.match(upstream, /上游生图服务返回 502 Bad Gateway/);
  assert.match(upstream, /friendly_image_error_detail\(response\.text, size=size, model=model\)/);
});
