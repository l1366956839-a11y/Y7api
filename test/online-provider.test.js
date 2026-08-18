const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const online = fs.readFileSync(path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas', 'static', 'online.html'), 'utf8');

test('online image providers hide image providers without usable keys', () => {
  assert.match(online, /has_key/);
  assert.match(online, /runninghub/);
  assert.match(online, /未检测到可用图片模型，请先到 API 设置里配置可用 key/);
});
