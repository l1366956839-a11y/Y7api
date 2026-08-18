const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const welcome = fs.readFileSync(path.join(root, 'public', 'welcome.html'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'public', 'shell.js'), 'utf8');

test('welcome stays visible until user enters after startup is ready', () => {
  assert.match(welcome, /id="y7st-enter-link"[^>]*hidden/);
  assert.match(shellJs, /autoEnterTimer/);
  assert.match(shellJs, /readyToEnter/);
  assert.match(shellJs, /启动完成后 15 秒/);
  assert.match(shellJs, /enterLink\.hidden = false/);
  assert.match(shellJs, /if \(!readyToEnter\) return/);
});
