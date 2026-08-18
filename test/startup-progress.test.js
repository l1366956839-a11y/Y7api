const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const welcome = fs.readFileSync(path.join(root, 'public', 'welcome.html'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'public', 'shell.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(root, 'public', 'shell.css'), 'utf8');

test('welcome page contains startup progress UI and auto-open logic', () => {
  assert.match(welcome, /y7st-startup-panel/);
  assert.match(welcome, /首次启动会解压内置运行环境/);
  assert.match(shellJs, /pollCanvasReady/);
  assert.match(shellJs, /fetch\('\/canvas'/);
  assert.match(shellJs, /window\.location\.href = '\/canvas'/);
  assert.match(shellCss, /y7st-startup-panel/);
  assert.match(shellCss, /y7st-startup-status/);
});
