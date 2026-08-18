const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const file = fs.readFileSync(path.join(root, 'src', 'window-controls.js'), 'utf8');

test('main window is created immediately and stays on native startup page until user enters', () => {
  assert.doesNotMatch(file, /await waitForServer\(http, shellPort\);\s*const mainWindow = new BrowserWindow/);
  assert.match(file, /const mainWindow = new BrowserWindow/);
  assert.match(file, /mainWindow\.loadURL\(buildNativeStartupPage\(shellPort/);
  assert.match(file, /backgroundColor: '#070a10'/);
  assert.match(file, /show: true/);
  assert.match(file, /shellPort\+'\/canvas'|shellPort \+ '\/canvas'/);
  assert.match(file, /setProgress\(100/);
  assert.match(file, /countdownLeft=20/);
  assert.match(file, /brand-logo|logo\.jpg|loadLogoDataUrl/);
  assert.match(file, /已等待/);
  assert.match(file, /打开日志/);
  assert.doesNotMatch(file, /buildDarkBootPage/);
});
