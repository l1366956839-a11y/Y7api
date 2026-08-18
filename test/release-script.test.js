const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'release-portable.js'), 'utf8');

test('release script writes a simple final delivery directory with checksum and instructions', () => {
  assert.match(script, /Y7st-最终交付/);
  assert.match(script, /SHA256\.txt/);
  assert.match(script, /使用说明\.txt/);
  assert.match(script, /Y7st\.exe/);
  assert.match(script, /Y7st-\$\{clean\(upstreamVersion\)\}-\$\{clean\(embedVersion\)\}\.exe/);
  assert.match(script, /版本信息\.txt/);
  assert.match(script, /上游版本/);
  assert.match(script, /运行时版本/);
  assert.match(script, /构建时间/);
  assert.match(script, /首次启动/);
  assert.match(script, /Y7st[\\/]+logs/);
});
