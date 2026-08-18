const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const launcher = fs.readFileSync(path.join(root, 'src', 'launcher.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'src', 'proxy.js'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'public', 'shell.js'), 'utf8');

test('startup stages are persisted and exposed to welcome page', () => {
  assert.match(launcher, /startup-status\.json/);
  assert.match(launcher, /writeStartupStatus/);
  assert.match(launcher, /begin\(name\)/);
  assert.match(launcher, /phase: name/);
  assert.match(launcher, /status: 'completed'/);
  assert.match(launcher, /phase: 'ready'/);
  assert.match(proxy, /__y7st__\/startup-status/);
  assert.match(shellJs, /fetch\('\/__y7st__\/startup-status'/);
  assert.match(shellJs, /extract: '正在解压运行环境/);
  assert.match(shellJs, /'dependency-check': '正在检查 Python 依赖/);
  assert.match(shellJs, /'upstream-health': '正在启动本地服务/);
  assert.match(shellJs, /'shell-health': '正在打开桌面外壳/);
});
