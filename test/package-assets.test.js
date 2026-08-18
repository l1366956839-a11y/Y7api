const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'window-controls.js'), 'utf8');

test('packaged Electron app no longer requires welcome.html as the first-screen asset', () => {
  assert.match(config, /src\/\*\.js/);
  assert.match(main, /loadURL\(buildNativeStartupPage\(shellPort/);
  assert.match(main, /backgroundColor: '#070a10'/);
  assert.match(main, /show: true/);
  assert.doesNotMatch(main, /loadFile\(path\.join\(__dirname, '\.\.', 'public', 'welcome\.html'\)\)/);
  assert.doesNotMatch(main, /buildDarkBootPage/);
});
